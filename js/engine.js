// Renderer, arena, camera control, viewmodel, beam. The player stands at the origin
// facing -Z; the target wall is the plane z = ARENA.wallZ.

import * as THREE from 'three';
import { settings } from './settings.js';

export const ARENA = {
  wallZ: -30,
  xMax: 16,
  height: 14,
  floorY: 0,
  zMin: -32,
  zMax: 6,
  eyeY: 1.7,
};

const BG = 0x0b0e14;
const WALL = 0x10151f;
const FLOOR = 0x0c1017;
// Thin, faint grid so the walls read near the intended dark #10151f instead of
// washing to a light blue-gray field that competes with targets and the HUD.
const GRID = 'rgba(0, 229, 255, 0.07)';
const PITCH_LIMIT = (89 * Math.PI) / 180;

function gridTexture(base, cell = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = GRID;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let p = 0; p <= 512; p += cell) {
    g.moveTo(p, 0);
    g.lineTo(p, 512);
    g.moveTo(0, p);
    g.lineTo(512, p);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 45, 95);

    this.camera = new THREE.PerspectiveCamera(90, 1, 0.1, 200);
    this.camera.position.set(0, ARENA.eyeY, 0);
    this.camera.rotation.order = 'YXZ';
    this.yaw = 0;
    this.pitch = 0;

    this._buildArena();
    this._buildViewmodel();
    this._buildBeam();

    this._kick = 0;
    this._flashT = 0;
    this._ray = new THREE.Ray();
    this._fwd = new THREE.Vector3();

    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  _buildArena() {
    const s = this.scene;
    const W = ARENA.xMax * 2; // 32
    const D = ARENA.zMax - ARENA.zMin; // 38
    const H = ARENA.height;
    const zMid = (ARENA.zMax + ARENA.zMin) / 2;

    const mkMat = (hex, rx, ry) => {
      const tex = gridTexture(hex);
      tex.repeat.set(rx, ry);
      return new THREE.MeshBasicMaterial({ map: tex });
    };
    const hexCss = (h) => `#${h.toString(16).padStart(6, '0')}`;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mkMat(hexCss(FLOOR), W / 4, D / 4));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    s.add(floor);

    const ceil = floor.clone();
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    s.add(ceil);

    const wallMat = mkMat(hexCss(WALL), W / 4, H / 4);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
    back.position.set(0, H / 2, ARENA.zMin);
    s.add(back);

    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat.clone());
    front.position.set(0, H / 2, ARENA.zMax);
    front.rotation.y = Math.PI;
    s.add(front);

    const sideMat = mkMat(hexCss(WALL), D / 4, H / 4);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), sideMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-ARENA.xMax, H / 2, zMid);
    s.add(left);

    const right = new THREE.Mesh(new THREE.PlaneGeometry(D, H), sideMat.clone());
    right.rotation.y = -Math.PI / 2;
    right.position.set(ARENA.xMax, H / 2, zMid);
    s.add(right);

    // Accent edges of the room, plus a soft ring on the target wall for orientation.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
      new THREE.LineBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0.22 })
    );
    edges.position.set(0, H / 2, zMid);
    s.add(edges);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(6.9, 7.0, 64),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    );
    ring.position.set(0, 5, ARENA.wallZ + 0.05);
    s.add(ring);
  }

  _buildViewmodel() {
    const vm = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.13, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x1a2130 })
    );
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 0.3, 12),
      new THREE.MeshBasicMaterial({ color: 0x2b344a })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.32);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.02, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0 })
    );
    stripe.position.set(0, -0.03, -0.05);
    vm.add(body, barrel, stripe);

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.14),
      new THREE.MeshBasicMaterial({
        color: 0xaffff2,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.flash.position.set(0, 0.02, -0.5);
    vm.add(this.flash);

    vm.position.set(0.3, -0.26, -0.6);
    vm.rotation.y = 0.06;
    this.viewmodel = vm;
    this.camera.add(vm);
    this.scene.add(this.camera);
    this._vmBaseZ = vm.position.z;
  }

  _buildBeam() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.beam = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0.55 })
    );
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    this.scene.add(this.beam);
    this._beamEnd = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
  }

  setViewmodelVisible(v) {
    this.viewmodel.visible = v;
  }

  /** Horizontal-FOV setting -> vertical FOV for the current aspect ratio. */
  setFovH(hDeg) {
    const h = (hDeg * Math.PI) / 180;
    const v = 2 * Math.atan(Math.tan(h / 2) / this.camera.aspect);
    this.camera.fov = (v * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Re-read DPR: the window may have moved to a different-density display.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.setFovH(settings.data.fov);
  }

  /** Apply raw mouse counts to the view. degPerCount comes from settings. */
  applyLook(dx, dy, degPerCount) {
    const k = (degPerCount * Math.PI) / 180;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (settings.data.invertY ? -1 : 1);
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  resetLook() {
    this.yaw = 0;
    this.pitch = 0;
    this.camera.rotation.set(0, 0, 0);
  }

  /** Reusable ray from the eye through the crosshair. */
  aimRay() {
    this.camera.getWorldDirection(this._fwd);
    this._ray.origin.copy(this.camera.position);
    this._ray.direction.copy(this._fwd);
    return this._ray;
  }

  kick() {
    this._kick = Math.min(this._kick + 1, 2.2);
    this._flashT = 0.045;
  }

  /** Show/update the tracking beam. `end` is a world-space Vector3 (or null to aim out 80m). */
  setBeam(on, end) {
    this.beam.visible = on;
    if (!on) return;
    this._muzzle.set(0.3, -0.26, -1.0);
    this.camera.localToWorld(this._muzzle);
    if (end) this._beamEnd.copy(end);
    else {
      this.camera.getWorldDirection(this._fwd);
      this._beamEnd.copy(this.camera.position).addScaledVector(this._fwd, 80);
    }
    const pos = this.beam.geometry.attributes.position;
    pos.setXYZ(0, this._muzzle.x, this._muzzle.y, this._muzzle.z);
    pos.setXYZ(1, this._beamEnd.x, this._beamEnd.y, this._beamEnd.z);
    pos.needsUpdate = true;
  }

  render(dt) {
    // Viewmodel recoil: exponential return with a touch of rotation.
    this._kick *= Math.exp(-14 * dt);
    this.viewmodel.position.z = this._vmBaseZ + this._kick * 0.055;
    this.viewmodel.rotation.x = this._kick * 0.09;
    this._flashT = Math.max(0, this._flashT - dt);
    this.flash.material.opacity = this._flashT > 0 ? 0.9 : 0;
    if (this._flashT > 0) this.flash.rotation.z = Math.random() * Math.PI;

    this.renderer.render(this.scene, this.camera);
  }
}
