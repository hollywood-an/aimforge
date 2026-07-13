// Targets: spawning, movement, analytic hit detection (ray vs sphere/capsule — no mesh
// raycasting), damage flash, and a pooled particle burst on kill.

import * as THREE from 'three';
import { settings } from './settings.js';

const WHITE = new THREE.Color(0xffffff);
const DMG = new THREE.Color(0xff5d6c);

let sphereGeo = null;
const capsuleGeos = new Map(); // "r:h" -> geometry

function getSphereGeo() {
  if (!sphereGeo) sphereGeo = new THREE.SphereGeometry(1, 28, 20);
  return sphereGeo;
}

function getCapsuleGeo(r, h) {
  const key = `${r}:${h}`;
  if (!capsuleGeos.has(key)) {
    capsuleGeos.set(key, new THREE.CapsuleGeometry(r, Math.max(0.01, h - 2 * r), 6, 16));
  }
  return capsuleGeos.get(key);
}

export class Target {
  constructor(mgr, opts) {
    this.mgr = mgr;
    this.radius = opts.radius ?? 0.9;
    this.shape = opts.shape === 'capsule' ? 'capsule' : 'sphere';
    this.height = this.shape === 'capsule' ? Math.max(opts.height ?? 2, this.radius * 2 + 0.01) : this.radius * 2;
    this.maxHp = opts.hp ?? 1;
    this.hp = this.maxHp;
    this.decoy = !!opts.decoy;
    this.lifetime = opts.lifetime || 0;
    this.onExpire = opts.onExpire || null;
    this.data = opts.data || {};
    this.alive = true;
    this.age = 0;
    this._flash = 0;

    const p = opts.pos;
    this.pos = new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0);

    this.baseColor = new THREE.Color(opts.color ?? settings.data.targetColor);
    const mat = new THREE.MeshBasicMaterial({ color: this.baseColor.clone() });
    if (this.shape === 'capsule') {
      this.mesh = new THREE.Mesh(getCapsuleGeo(this.radius, this.height), mat);
    } else {
      this.mesh = new THREE.Mesh(getSphereGeo(), mat);
      this.mesh.scale.setScalar(this.radius);
    }
    mgr.scene.add(this.mesh);

    // Per-target RNG lane, derived from the run seed at spawn time (game.js
    // assigns nextRng each run). Fallback covers spawns outside a run.
    this.rng = mgr.nextRng ? mgr.nextRng() : Math.random;

    this._initMover(opts.move);
    // Movers may reposition at spawn (lissajous phase offset) — sync before first render.
    this.mesh.position.copy(this.pos);
  }

  _initMover(move) {
    this.move = move || null;
    if (!move) return;
    if (move.type === 'strafe') {
      this._st = {
        axis: move.axis === 'y' ? 'y' : 'x',
        vel: 0,
        dir: this.rng() < 0.5 ? -1 : 1,
        speed: randIn(this.rng, move.speedMin ?? 4, move.speedMax ?? 8),
        timer: randIn(this.rng, move.switchMin ?? 0.25, move.switchMax ?? 0.9),
        baseY: this.pos.y,
        vy: 0,
        jumping: false,
      };
    } else if (move.type === 'lissajous') {
      const c = move.center || this.pos;
      this._lj = {
        cx: c.x ?? 0, cy: c.y ?? 0, cz: c.z ?? 0,
        px: this.rng() * Math.PI * 2,
        py: this.rng() * Math.PI * 2,
        pz: this.rng() * Math.PI * 2,
      };
      this._lissajous(move); // start on-path, not at the center
    } else if (move.type === 'bounce') {
      this._vel = new THREE.Vector3(move.vel?.x ?? 0, move.vel?.y ?? 0, move.vel?.z ?? 0);
    }
  }

  update(dt) {
    this.age += dt;
    const m = this.move;
    if (m) {
      if (m.type === 'strafe') this._strafe(dt, m);
      else if (m.type === 'lissajous') this._lissajous(m);
      else if (m.type === 'bounce') this._bounce(dt, m);
      else if (m.type === 'custom' && m.fn) m.fn(this, dt, this.age);
    }
    this.mesh.position.copy(this.pos);

    // Damage tint + hit flash.
    this._flash = Math.max(0, this._flash - dt * 8);
    const mat = this.mesh.material;
    const hpFrac = this.maxHp === Infinity ? 1 : Math.max(0, this.hp / this.maxHp);
    mat.color.copy(DMG).lerp(this.baseColor, hpFrac).lerp(WHITE, Math.min(1, this._flash));

    if (this.lifetime > 0 && this.age >= this.lifetime && this.alive) {
      const cb = this.onExpire;
      this.kill(false);
      cb?.(this.mgr.api, this);
    }
  }

  _strafe(dt, m) {
    const s = this._st;
    s.timer -= dt;
    if (s.timer <= 0) {
      s.timer = randIn(this.rng, m.switchMin ?? 0.25, m.switchMax ?? 0.9);
      s.speed = randIn(this.rng, m.speedMin ?? 4, m.speedMax ?? 8);
      s.dir = this.rng() < 0.72 ? -s.dir : s.dir;
      if (m.jump && s.axis === 'x' && !s.jumping && this.rng() < (m.jump.chance ?? 0.2)) {
        s.jumping = true;
        s.vy = m.jump.vy ?? 5;
      }
    }
    const accel = m.accel ?? 40;
    const targetVel = s.dir * s.speed;
    if (s.vel < targetVel) s.vel = Math.min(targetVel, s.vel + accel * dt);
    else s.vel = Math.max(targetVel, s.vel - accel * dt);

    const [lo, hi] = m.range ?? [-10, 10];
    this.pos[s.axis] += s.vel * dt;
    if (this.pos[s.axis] <= lo) {
      this.pos[s.axis] = lo;
      s.dir = 1;
    } else if (this.pos[s.axis] >= hi) {
      this.pos[s.axis] = hi;
      s.dir = -1;
    }

    if (s.jumping) {
      s.vy -= (m.jump?.gravity ?? 13) * dt;
      this.pos.y += s.vy * dt;
      if (this.pos.y <= s.baseY) {
        this.pos.y = s.baseY;
        s.jumping = false;
        s.vy = 0;
      }
    }
  }

  _lissajous(m) {
    const t = this.age;
    const L = this._lj;
    const TAU = Math.PI * 2;
    this.pos.set(
      L.cx + (m.amp?.x ?? 0) * Math.sin(TAU * (m.freq?.x ?? 0) * t + L.px),
      L.cy + (m.amp?.y ?? 0) * Math.sin(TAU * (m.freq?.y ?? 0) * t + L.py),
      L.cz + (m.amp?.z ?? 0) * Math.sin(TAU * (m.freq?.z ?? 0) * t + L.pz)
    );
  }

  _bounce(dt, m) {
    const b = m.box || {};
    this.pos.addScaledVector(this._vel, dt);
    const clampAxis = (axis, lo, hi) => {
      if (lo !== undefined && this.pos[axis] < lo) {
        this.pos[axis] = lo;
        this._vel[axis] = Math.abs(this._vel[axis]);
      }
      if (hi !== undefined && this.pos[axis] > hi) {
        this.pos[axis] = hi;
        this._vel[axis] = -Math.abs(this._vel[axis]);
      }
    };
    clampAxis('x', b.xMin, b.xMax);
    clampAxis('y', b.yMin, b.yMax);
    clampAxis('z', b.zMin, b.zMax);
  }

  /** Apply damage; returns true if this killed the target. Fractional damage OK (beam). */
  damage(n) {
    if (!this.alive || this.decoy) {
      this._flash = 1;
      return false;
    }
    this.hp -= n;
    this._flash = 1;
    if (this.hp <= 0.0001) {
      this.kill(true);
      return true;
    }
    return false;
  }

  kill(scored = true) {
    if (!this.alive) return;
    this.alive = false;
    this.mgr._remove(this, scored);
  }

  setColor(hex) {
    this.baseColor.set(hex);
  }
}

function randIn(rng, a, b) {
  return a + rng() * (b - a);
}

// --- Pooled particle bursts ------------------------------------------------

const PCOUNT = 480;

class Particles {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(PCOUNT * 3);
    this.colors = new Float32Array(PCOUNT * 3);
    this.vels = new Float32Array(PCOUNT * 3);
    this.life = new Float32Array(PCOUNT);
    this.positions.fill(9999);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({
        size: 0.14,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }

  burst(pos, color, n = 22, speed = 7) {
    for (let i = 0; i < n; i++) {
      const j = this.cursor;
      this.cursor = (this.cursor + 1) % PCOUNT;
      const j3 = j * 3;
      this.positions[j3] = pos.x;
      this.positions[j3 + 1] = pos.y;
      this.positions[j3 + 2] = pos.z;
      // Random direction on a sphere, biased slightly toward the player.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.vels[j3] = Math.sin(phi) * Math.cos(theta) * sp;
      this.vels[j3 + 1] = Math.sin(phi) * Math.sin(theta) * sp;
      this.vels[j3 + 2] = Math.cos(phi) * sp * 0.8 + 1.5;
      this.colors[j3] = color.r;
      this.colors[j3 + 1] = color.g;
      this.colors[j3 + 2] = color.b;
      this.life[j] = 0.45 + Math.random() * 0.2;
    }
  }

  update(dt) {
    let any = false;
    for (let j = 0; j < PCOUNT; j++) {
      if (this.life[j] <= 0) continue;
      any = true;
      this.life[j] -= dt;
      const j3 = j * 3;
      if (this.life[j] <= 0) {
        this.positions[j3 + 1] = 9999;
        continue;
      }
      this.vels[j3 + 1] -= 14 * dt;
      this.positions[j3] += this.vels[j3] * dt;
      this.positions[j3 + 1] += this.vels[j3 + 1] * dt;
      this.positions[j3 + 2] += this.vels[j3 + 2] * dt;
    }
    if (any) this.geo.attributes.position.needsUpdate = true;
  }
}

// --- Manager ----------------------------------------------------------------

export class TargetManager {
  constructor(scene) {
    this.scene = scene;
    this.alive = [];
    this.particles = new Particles(scene);
    this.onKill = null; // (target, scored) — assigned by the game
    this.api = null; //   assigned by the game each run (passed to onExpire)
    this.nextRng = null; // () => rng for the next spawn — assigned by the game each run
    this._tmp = new THREE.Vector3();
    this._seg = new THREE.Vector3();
  }

  spawn(opts) {
    const t = new Target(this, opts);
    this.alive.push(t);
    return t;
  }

  update(dt) {
    // Iterate over a copy: kills during update() (lifetime expiry) mutate the list.
    for (const t of [...this.alive]) t.update(dt);
    this.particles.update(dt);
  }

  clear() {
    for (const t of [...this.alive]) t.kill(false);
  }

  _remove(target, scored) {
    const i = this.alive.indexOf(target);
    if (i >= 0) this.alive.splice(i, 1);
    this.scene.remove(target.mesh);
    target.mesh.material.dispose();
    if (scored) {
      this.particles.burst(target.pos, target.baseColor);
    }
    this.onKill?.(target, scored);
  }

  /**
   * Nearest target hit by the ray, or null.
   * Spheres: analytic ray-sphere. Capsules: ray vs vertical segment + radius.
   */
  raycast(ray) {
    let best = null;
    let bestT = Infinity;
    for (const t of this.alive) {
      const hitT = t.shape === 'capsule' ? this._rayCapsule(ray, t) : this._raySphere(ray, t);
      if (hitT !== null && hitT < bestT) {
        bestT = hitT;
        best = t;
      }
    }
    if (!best) return null;
    const point = this._tmp.copy(ray.direction).multiplyScalar(bestT).add(ray.origin);
    return { target: best, dist: bestT, point };
  }

  _raySphere(ray, t) {
    const o = ray.origin;
    const d = ray.direction;
    const lx = t.pos.x - o.x;
    const ly = t.pos.y - o.y;
    const lz = t.pos.z - o.z;
    const tca = lx * d.x + ly * d.y + lz * d.z;
    if (tca < 0) return null;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    const r2 = t.radius * t.radius;
    if (d2 > r2) return null;
    return tca - Math.sqrt(r2 - d2);
  }

  _rayCapsule(ray, t) {
    // Capsule = vertical segment [pos - h/2 + r, pos + h/2 - r] with radius r.
    const half = t.height / 2 - t.radius;
    const ax = t.pos.x, az = t.pos.z;
    const ayLo = t.pos.y - half, ayHi = t.pos.y + half;
    const o = ray.origin, d = ray.direction;

    // Closest approach between the ray and the segment (segment dir = +Y).
    // Solve for ray param s and segment param u minimizing distance.
    const rx = o.x - ax, ry = o.y - ayLo, rz = o.z - az;
    const segLen = ayHi - ayLo;
    const dDotS = d.y; // d · segDir
    const denom = 1 - dDotS * dDotS;
    let s, u;
    if (denom < 1e-6) {
      // Parallel: treat as sphere at nearest cap.
      s = 0;
      u = ry < 0 ? 0 : segLen;
    } else {
      const rDotD = rx * d.x + ry * d.y + rz * d.z;
      const rDotS = ry;
      s = (dDotS * rDotS - rDotD) / denom;
      u = Math.max(0, Math.min(segLen, rDotS + s * dDotS));
      // Re-project ray param for the clamped segment point.
      s = (ax - o.x) * d.x + (ayLo + u - o.y) * d.y + (az - o.z) * d.z;
    }
    if (s < 0) return null;
    const px = o.x + d.x * s - ax;
    const py = o.y + d.y * s - (ayLo + u);
    const pz = o.z + d.z * s - az;
    const dist2 = px * px + py * py + pz * pz;
    if (dist2 > t.radius * t.radius) return null;
    // Back off along the ray to the approximate surface entry point.
    return Math.max(0, s - Math.sqrt(Math.max(0, t.radius * t.radius - dist2)));
  }
}
