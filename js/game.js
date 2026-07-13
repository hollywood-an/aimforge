// Run orchestration: states, countdowns, weapons (semi/auto/beam), scoring, stats,
// and the `api` object scenarios program against (see SCENARIO_API.md).

import * as THREE from 'three';
import { ARENA } from './engine.js';
import { settings } from './settings.js';
import { audio } from './audio.js';
import { saveRun, getPB, normScore } from './stats.js';
import { mulberry32, deriveSeed, randomSeed } from './rng.js';

export const State = {
  MENU: 'menu',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
  RESULTS: 'results',
  DEMO: 'demo', // first-run sensitivity tryout: aim + shoot, no run bookkeeping
};

// Sensitivity demo tuning: cm/360 range the wheel walks, orb count/size, and
// how many wheel-pixels equal one notch (one whole cm step).
const SENS_DEMO = { cmMin: 10, cmMax: 60, orbs: 3, radius: 0.9, wheelNotch: 100 };

export class Game {
  constructor({ engine, input, hud, targets }) {
    this.engine = engine;
    this.input = input;
    this.hud = hud;
    this.targets = targets;
    this.ui = null; // assigned by main.js after UI construction

    this.state = State.MENU;
    this.currentDef = null;
    this.currentOpts = {};
    this._pendingStart = null;
    this._pendingResume = false;
    this._pendingDemo = false;
    this._demoPrev = null; // {sensMode, cm360} snapshot for demo cancel
    this._wheelAcc = 0;

    this.targets.onKill = (t, scored) => this._onKill(t, scored);

    input.onFireDown = () => this._onFireDown();
    input.onWheel = (dy) => this._onWheel(dy);
    input.onKey = (code, e) => this._onKey(code, e);
    input.onLockChange = (locked) => this._onLockChange(locked);
    input.onLockDenied = () => this._onLockDenied();
  }

  // ---- lifecycle -----------------------------------------------------------

  /**
   * Arm a run and acquire pointer lock. Call from a user gesture (click/keydown);
   * the run actually begins when the lock lands. If the lock is denied, nothing
   * changes and the current screen stays up.
   */
  arm(def, opts = {}) {
    this._pendingStart = { def, opts };
    this._pendingResume = false;
    if (this.input.locked) this._onLockChange(true);
    else this.input.requestLock();
  }

  armResume() {
    this._pendingResume = true;
    this._pendingStart = null;
    if (this.input.locked) this._onLockChange(true);
    else this.input.requestLock();
  }

  _onLockChange(locked) {
    if (locked) {
      audio.unlock();
      if (this._pendingStart) {
        const { def, opts } = this._pendingStart;
        this._pendingStart = null;
        this._beginRun(def, opts);
      } else if (this._pendingResume) {
        this._pendingResume = false;
        this._startCountdown(false);
      } else if (this._pendingDemo) {
        this._pendingDemo = false;
        this._beginDemo();
      }
    } else {
      if (this.state === State.RUNNING || this.state === State.COUNTDOWN) {
        this._pause();
      } else if (this.state === State.DEMO) {
        // Esc under pointer lock never reaches keydown — the lock loss IS the
        // demo's Esc. Stay in DEMO, show the keep/retry/discard step.
        this._demoToConfirm();
      }
    }
  }

  _beginRun(def, opts) {
    this.currentDef = def;
    this.currentOpts = opts;

    // Deterministic randomness: challenge runs pass opts.seed, normal runs draw
    // a fresh one (recorded on the result so any run can become a challenge).
    // The api helpers consume the run stream in ordinal spawn/event order; each
    // target's mover gets its own lane derived at spawn time (nextRng), so two
    // players on the same seed can't desync it through kill timing.
    this.seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : randomSeed();
    this._rand = mulberry32(this.seed);
    this._spawnCount = 0;
    this.targets.nextRng = () => mulberry32(deriveSeed(this.seed, this._spawnCount++));

    // Per-run state.
    this.score = 0;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.ttks = [];
    this.elapsed = 0;
    this.timeline = [0];
    this.customStats = new Map();
    this.weapon = opts.weaponOverride ?? def.weapon ?? { mode: 'semi' };
    this.scoring = {
      perKill: def.scoring?.perKill ?? 100,
      perDamage: def.scoring?.perDamage ?? 0,
      trackingPerSecond: def.scoring?.trackingPerSecond ?? 500,
    };
    // With an explicit duration override (custom drill, bench stages) the effective
    // timeScale is override/base so tier + PB normalization stays comparable.
    this.timeScale = opts.durationOverride
      ? opts.durationOverride / (def.duration || 60)
      : settings.data.timeScale || 1;
    this.runDuration = opts.durationOverride ?? def.duration * this.timeScale;
    this._lastShotT = -Infinity;
    this._autoAcc = 0;
    this._beamFireT = 0;
    this._beamOnT = 0;
    this._tickT = 0;
    this._hudCache = {};
    this._runStarted = false;

    this.targets.clear();
    this.engine.resetLook();
    this.engine.setViewmodelVisible(settings.data.viewmodel);
    this.api = this._buildApi();
    this.targets.api = this.api;

    this.ui.hideAll();
    this.hud.show();
    this.hud.setScore(0);
    this.hud.setTimer(this.runDuration);
    this.hud.setInfo({ acc: 100, streak: 0 });
    if (opts.bench) this.hud.setBenchLabel(`Benchmark ${opts.bench.stage + 1}/${opts.bench.total} — ${def.name}`);

    this._startCountdown(true);
  }

  _startCountdown(fresh) {
    this.state = State.COUNTDOWN;
    this._cd = fresh
      ? { t: 0, total: 2.4, step: 0.8, labels: ['3', '2', '1'], last: -1, fresh: true }
      : { t: 0, total: 0.8, step: 0.8, labels: ['READY'], last: -1, fresh: false };
    if (!fresh) this.ui.hideAll();
    this.hud.show();
  }

  restart() {
    if (!this.currentDef) return;
    if (this.currentOpts?.bench) {
      this.hud.message('No retries during the benchmark', 1200);
      return;
    }
    this.targets.clear();
    if (this.input.locked) {
      this._beginRun(this.currentDef, this.currentOpts);
    } else {
      this.arm(this.currentDef, this.currentOpts);
    }
  }

  _pause() {
    this.state = State.PAUSED;
    this.engine.setBeam(false);
    this.hud.clearMessage();
    this.ui.showPause();
  }

  quitToMenu() {
    this._pendingStart = null;
    this._pendingResume = false;
    this._pendingDemo = false;
    if (this._demoPrev) {
      // Abandoned mid-demo (tests, stray paths): restore the pre-demo feel.
      settings.data.sensMode = this._demoPrev.sensMode;
      settings.data.cm360 = this._demoPrev.cm360;
      this._demoPrev = null;
      settings.save();
    }
    if (this.state === State.RUNNING || this.state === State.PAUSED || this.state === State.COUNTDOWN) {
      try {
        this.currentDef?.end?.(this.api);
      } catch (e) {
        console.error(e);
      }
    }
    this.targets.clear();
    this.engine.setBeam(false);
    this.hud.setDemoMode(false);
    this.hud.hide();
    this.hud.clearMessage();
    this.input.exitLock();
    this.state = State.MENU;
    this.ui.showMenu();
  }

  // ---- sensitivity demo ------------------------------------------------------

  /** Arm the first-run sensitivity tryout; the demo starts when the lock lands. */
  startSensDemo() {
    if (this.state === State.DEMO && this.input.locked) return;
    this._pendingDemo = true;
    this._pendingStart = null;
    this._pendingResume = false;
    if (this.input.locked) this._onLockChange(true);
    else this.input.requestLock();
  }

  _beginDemo() {
    // Snapshot once (survives "Try again") so Discard restores the true
    // pre-demo feel; only these two fields are ever written by the demo.
    this._demoPrev ??= { sensMode: settings.data.sensMode, cm360: settings.data.cm360 };
    // Seed from the current feel — match mode yields the mouse-speed estimate
    // (exactly 30 cm/360 when unmeasured), other modes their configured value.
    const seed = Math.min(SENS_DEMO.cmMax, Math.max(SENS_DEMO.cmMin, Math.round(settings.cm360() || 30)));
    settings.data.sensMode = 'cm360';
    settings.data.cm360 = seed;
    settings.persist();

    this.state = State.DEMO;
    this._wheelAcc = 0;
    this.targets.clear();
    this.targets.nextRng = null; // static orbs — plain randomness is fine
    this.engine.resetLook();
    for (let i = 0; i < SENS_DEMO.orbs; i++) this._spawnDemoOrb();

    this.ui.hideAll();
    this.hud.show();
    this.hud.clearMessage();
    this.hud.setDemoMode(true);
    this.hud.setDemoSens(seed, SENS_DEMO.cmMin, SENS_DEMO.cmMax);
  }

  _spawnDemoOrb() {
    // Gridshot-style envelope: front wall, min spacing so flicks have travel.
    let x = 0, y = 2;
    for (let i = 0; i < 40; i++) {
      x = -10 + Math.random() * 20;
      y = 1.5 + Math.random() * 7;
      const clear = this.targets.alive.every(
        (t) => Math.hypot(t.pos.x - x, t.pos.y - y) > SENS_DEMO.radius * 2.6
      );
      if (clear) break;
    }
    this.targets.spawn({ pos: { x, y, z: ARENA.wallZ }, radius: SENS_DEMO.radius });
  }

  _updateDemo(dt) {
    this.targets.update(dt); // hit-flash decay + particle animation
    while (this.targets.alive.length < SENS_DEMO.orbs) this._spawnDemoOrb();
  }

  /** Demo firing skips ALL run bookkeeping (score/streak/stats stay untouched). */
  _demoShoot() {
    this.engine.kick();
    audio.shoot();
    const hit = this.targets.raycast(this.engine.aimRay());
    if (hit && !hit.target.decoy) {
      const killed = hit.target.damage(1);
      if (killed) {
        audio.kill();
        this.hud.hitmarker(true);
      }
    }
  }

  _onWheel(dy) {
    if (this.state !== State.DEMO || !this.input.locked) return;
    this._wheelAcc += dy;
    const steps = Math.trunc(this._wheelAcc / SENS_DEMO.wheelNotch);
    if (!steps) return;
    this._wheelAcc -= steps * SENS_DEMO.wheelNotch;
    // Wheel up (negative deltaY) = faster = fewer cm per 360.
    this._adjustDemoSens(steps);
  }

  _adjustDemoSens(steps) {
    const cm = Math.min(SENS_DEMO.cmMax, Math.max(SENS_DEMO.cmMin, settings.data.cm360 + steps));
    if (cm === settings.data.cm360) return;
    settings.data.cm360 = cm;
    settings.persist();
    this.hud.setDemoSens(cm, SENS_DEMO.cmMin, SENS_DEMO.cmMax);
  }

  _demoToConfirm() {
    this.hud.hide();
    this.ui.showSensDemoConfirm(settings.data.cm360);
  }

  commitSensDemo() {
    if (this.state !== State.DEMO) return;
    settings.data.sensTuned = true;
    settings.save();
    const cm = settings.data.cm360;
    this._demoPrev = null;
    this._teardownDemo();
    this.ui.sensDemoDone(true, cm);
  }

  cancelSensDemo() {
    if (this.state !== State.DEMO && !this._demoPrev) return;
    if (this._demoPrev) {
      settings.data.sensMode = this._demoPrev.sensMode;
      settings.data.cm360 = this._demoPrev.cm360;
      this._demoPrev = null;
    }
    settings.save();
    this._teardownDemo();
    this.ui.sensDemoDone(false);
  }

  _teardownDemo() {
    this._pendingDemo = false;
    this._wheelAcc = 0;
    this.targets.clear();
    this.hud.setDemoMode(false);
    this.hud.hide();
    // MENU before exitLock: the async pointerlockchange(false) must no-op.
    this.state = State.MENU;
    this.input.exitLock();
  }

  _finish() {
    this.state = State.RESULTS;
    try {
      this.currentDef.end?.(this.api);
    } catch (e) {
      console.error(e);
    }
    this.engine.setBeam(false);
    this.targets.clear();
    this.hud.clearMessage();
    this.hud.hide();
    this.input.exitLock();

    // Final timeline sample (the per-second loop may already have covered it).
    if (this.timeline.length <= Math.floor(this.runDuration)) {
      this.timeline.push(Math.round(this.score));
    } else {
      this.timeline[this.timeline.length - 1] = Math.round(this.score);
    }

    const beam = this.weapon.mode === 'beam';
    const acc = beam
      ? this._beamFireT > 0
        ? (100 * this._beamOnT) / this._beamFireT
        : 0
      : this.shots > 0
        ? (100 * this.hits) / this.shots
        : 0;

    const result = {
      scenarioId: this.currentDef.id,
      name: this.currentDef.name,
      score: Math.round(this.score),
      duration: Math.round(this.elapsed * 10) / 10,
      timeScale: this.timeScale,
      kills: this.kills,
      shots: beam ? undefined : this.shots,
      hits: beam ? undefined : this.hits,
      acc: Math.round(acc * 10) / 10,
      bestStreak: beam ? undefined : this.bestStreak,
      avgTtkMs:
        !beam && this.ttks.length ? Math.round((this.ttks.reduce((a, b) => a + b, 0) / this.ttks.length) * 1000) : undefined,
      kps: this.elapsed > 0 ? Math.round((this.kills / this.elapsed) * 100) / 100 : 0,
      stats: Object.fromEntries(this.customStats),
      timelineStep: 1,
      timeline: this.timeline,
      date: new Date().toISOString(),
      cm360: Math.round(settings.cm360() * 10) / 10,
      fov: settings.data.fov,
      seed: this.seed,
      beatScore: Number.isFinite(this.currentOpts.beatScore) ? this.currentOpts.beatScore : undefined,
    };

    const prevPB = getPB(result.scenarioId);
    // Compare per-60s-normalized scores so longer runs can't poison PBs.
    const isPB = !prevPB || normScore(result) > normScore(prevPB);
    saveRun(result);
    if (isPB && result.score > 0) audio.pb();
    else audio.end();

    this.ui.showResults(result, prevPB);
  }

  // ---- per-frame -----------------------------------------------------------

  update(dt) {
    // Aim is live during countdown, play, and the sensitivity demo.
    if (
      this.input.locked &&
      (this.state === State.RUNNING || this.state === State.COUNTDOWN || this.state === State.DEMO)
    ) {
      const { dx, dy } = this.input.consumeDeltas();
      if (dx || dy) this.engine.applyLook(dx, dy, settings.degPerCount());
    } else {
      this.input.consumeDeltas(); // drop stale deltas
    }

    if (this.state === State.COUNTDOWN) this._updateCountdown(dt);
    else if (this.state === State.RUNNING) this._updateRun(dt);
    else if (this.state === State.DEMO) this._updateDemo(dt);
  }

  _updateCountdown(dt) {
    const cd = this._cd;
    cd.t += dt;
    const idx = Math.min(Math.floor(cd.t / cd.step), cd.labels.length - 1);
    if (idx !== cd.last) {
      cd.last = idx;
      this.hud.message(cd.labels[idx], 0, true);
      audio.count();
    }
    if (cd.t >= cd.total) {
      this.hud.message('GO', 450, true);
      audio.go();
      this.state = State.RUNNING;
      // Guarded by _runStarted (not cd.fresh) so a pause during the initial
      // countdown can't skip scenario start() on resume.
      if (!this._runStarted) {
        this._runStarted = true;
        try {
          this.currentDef.start(this.api);
        } catch (e) {
          console.error(`Scenario ${this.currentDef.id} crashed in start():`, e);
        }
      }
    }
  }

  _updateRun(dt) {
    this.elapsed += dt;

    this.targets.update(dt);
    try {
      this.currentDef.tick?.(this.api, dt);
    } catch (e) {
      console.error(`Scenario ${this.currentDef.id} crashed in tick():`, e);
    }

    // Auto fire.
    if (this.weapon.mode === 'auto' && this.input.fireHeld) {
      const interval = 60 / (this.weapon.rpm ?? 600);
      this._autoAcc += dt;
      while (this._autoAcc >= interval) {
        this._autoAcc -= interval;
        this._shoot();
      }
    }

    // Beam.
    if (this.weapon.mode === 'beam') {
      if (this.input.fireHeld) {
        this._beamFireT += dt;
        const hit = this.targets.raycast(this.engine.aimRay());
        if (hit && !hit.target.decoy) {
          this._beamOnT += dt;
          this._addScore(this.scoring.trackingPerSecond * dt);
          hit.target.damage((this.weapon.dps ?? 0) * dt);
          this._tickT += dt;
          if (this._tickT >= 0.09) {
            this._tickT = 0;
            audio.tick();
          }
          this.engine.setBeam(true, hit.point);
        } else {
          if (hit) hit.target.damage(0); // decoy flash, no credit
          this.engine.setBeam(true, hit ? hit.point : null);
        }
      } else {
        this.engine.setBeam(false);
      }
    }

    // Per-second score timeline.
    while (this.timeline.length <= Math.floor(this.elapsed)) {
      this.timeline.push(Math.round(this.score));
    }

    this._updateHud();

    if (this.elapsed >= this.runDuration) {
      this._finish();
    }
  }

  _updateHud() {
    const c = this._hudCache;
    const score = Math.round(this.score);
    if (c.score !== score) {
      c.score = score;
      this.hud.setScore(score);
    }
    const tl = Math.max(0, this.runDuration - this.elapsed);
    const tKey = tl >= 10 ? Math.ceil(tl) : Math.round(tl * 10);
    if (c.t !== tKey) {
      c.t = tKey;
      this.hud.setTimer(tl);
    }
    const beam = this.weapon.mode === 'beam';
    const acc = beam
      ? this._beamFireT > 0
        ? Math.round((100 * this._beamOnT) / this._beamFireT)
        : 100
      : this.shots > 0
        ? Math.round((100 * this.hits) / this.shots)
        : 100;
    if (c.acc !== acc || c.streak !== this.streak) {
      c.acc = acc;
      c.streak = this.streak;
      this.hud.setInfo({ acc, streak: this.streak });
    }
  }

  // ---- combat --------------------------------------------------------------

  _onFireDown() {
    if (this.state === State.DEMO) {
      this._demoShoot();
      return;
    }
    if (this.state !== State.RUNNING) return;
    if (this.weapon.mode === 'semi') {
      this._shoot();
    } else if (this.weapon.mode === 'auto') {
      // Respect the RPM cap across clicks — spam-clicking must not out-fire holding.
      const interval = 60 / (this.weapon.rpm ?? 600);
      const since = this.elapsed - this._lastShotT;
      if (since >= interval) {
        this._autoAcc = 0;
        this._shoot();
      } else {
        this._autoAcc = since; // resume mid-cycle; the held-fire loop completes it
      }
    }
    // Beam handled per-frame via fireHeld.
  }

  _shoot() {
    if (this.state !== State.RUNNING) return;
    this._lastShotT = this.elapsed;
    this.shots++;
    this.engine.kick();
    audio.shoot();
    const hit = this.targets.raycast(this.engine.aimRay());
    if (hit && !hit.target.decoy) {
      this.hits++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      const dmg = this.weapon.damage ?? 1;
      this._addScore(this.scoring.perDamage * dmg);
      const killed = hit.target.damage(dmg);
      if (!killed) {
        audio.hit();
        this.hud.hitmarker(false);
      }
      this._safeHook('onShot', true, hit.target);
    } else if (hit) {
      // Decoy: registers as a miss.
      hit.target.damage(0);
      this.streak = 0;
      audio.thud();
      this.hud.hitmarker(false);
      this._safeHook('onShot', false, hit.target);
    } else {
      this.streak = 0;
      this._safeHook('onShot', false, null);
    }
  }

  _onKill(target, scored) {
    if (!scored || this.state !== State.RUNNING) return;
    this.kills++;
    this.ttks.push(target.age);
    this._addScore(this.scoring.perKill);
    audio.kill();
    this.hud.hitmarker(true);
    this._safeHook('onTargetKilled', target);
  }

  _safeHook(name, ...args) {
    try {
      this.currentDef[name]?.(this.api, ...args);
    } catch (e) {
      console.error(`Scenario ${this.currentDef.id} crashed in ${name}():`, e);
    }
  }

  _addScore(n) {
    this.score = Math.max(0, this.score + n);
  }

  // ---- input ---------------------------------------------------------------

  _onKey(code) {
    if (this.state === State.DEMO) {
      // A focused button (confirm step) fires its own click — don't double-act.
      if (code === 'Enter' && document.activeElement?.tagName !== 'BUTTON') this.commitSensDemo();
      else if (code === 'Escape' && !this.input.locked) this.cancelSensDemo();
      else if (this.input.locked && (code === 'ArrowUp' || code === 'ArrowRight')) this._adjustDemoSens(-1);
      else if (this.input.locked && (code === 'ArrowDown' || code === 'ArrowLeft')) this._adjustDemoSens(1);
      return; // swallow R/S/Q while in the demo
    }
    if (code === 'KeyR') {
      // In-run restart works while playing; on the pause/results screens only while
      // that screen is actually up (not when the settings sub-screen is open over it).
      if (this.state === State.RUNNING || this.state === State.COUNTDOWN) this.restart();
      else if (this.state === State.PAUSED && this.ui.pauseVisible()) this.restart();
      else if (this.state === State.RESULTS && this.ui.canRetryFromResults()) this.restart();
    } else if (code === 'KeyS') {
      // Open settings from the pause menu (adjust sens/crosshair/FOV, then resume).
      if (this.state === State.PAUSED && this.ui.pauseVisible()) this.ui.showSettings('pause');
    } else if (code === 'KeyQ') {
      // During a benchmark, quitting is a two-step confirm (ui.requestQuit handles it).
      if ((this.state === State.PAUSED && this.ui.pauseVisible()) || this.state === State.RESULTS) this.ui.requestQuit();
    } else if (code === 'Escape') {
      // Esc on pause deliberately does nothing: users just pressed Esc to pause,
      // and a double-tap must not silently discard the run.
      if (this.state === State.RESULTS) this.ui.requestQuit();
    } else if (code === 'Enter' || code === 'Space') {
      // A focused button will fire its own click; don't double-trigger.
      if (document.activeElement?.tagName === 'BUTTON') return;
      if (this.state === State.RESULTS) this.ui.onEnterResults?.();
      // Enter to start from the briefing screen (input.js already excludes form fields).
      else if (code === 'Enter' && this.state === State.MENU) this.ui.onEnterBrief?.();
    }
  }

  _onLockDenied() {
    if (!this._pendingStart && !this._pendingResume && !this._pendingDemo) return;
    this.ui?.lockHint?.();
    // One deferred retry — still inside the click's transient-activation window.
    clearTimeout(this._relockTimer);
    this._relockTimer = setTimeout(() => {
      if (this._pendingStart || this._pendingResume || this._pendingDemo) this.input.requestLock();
    }, 1300);
  }

  // ---- scenario API --------------------------------------------------------

  _buildApi() {
    const game = this;
    // All gameplay randomness flows through the run's seeded stream.
    const rnd = () => (game._rand ? game._rand() : Math.random());
    const rand = (a, b) => a + rnd() * (b - a);
    const arena = {
      wallZ: ARENA.wallZ,
      xMax: ARENA.xMax,
      height: ARENA.height,
      floorY: ARENA.floorY,
      zMin: ARENA.zMin,
      zMax: ARENA.zMax,
      playerPos: game.engine.camera.position,
    };
    return {
      arena,
      camera: game.engine.camera,
      get targets() {
        return game.targets.alive;
      },
      get time() {
        return game.elapsed;
      },
      get duration() {
        return game.runDuration;
      },
      get timeLeft() {
        return Math.max(0, game.runDuration - game.elapsed);
      },
      get opts() {
        return game.currentOpts;
      },
      spawn: (opts) => game.targets.spawn(opts),
      clearTargets: () => game.targets.clear(),
      wallPoint: (o = {}) => {
        const xRange = o.xRange ?? 11;
        const yMin = o.yMin ?? 1.2;
        const yMax = o.yMax ?? 9;
        const z = o.z ?? ARENA.wallZ;
        const minDist = o.minDist ?? 0;
        const p = new THREE.Vector3();
        for (let i = 0; i < 50; i++) {
          p.set(rand(-xRange, xRange), rand(yMin, yMax), z);
          if (minDist <= 0) return p;
          let ok = true;
          for (const t of game.targets.alive) {
            if (t.pos.distanceTo(p) < minDist) {
              ok = false;
              break;
            }
          }
          if (ok) return p;
        }
        return p;
      },
      rand,
      randInt: (a, b) => Math.floor(rand(a, b + 1)),
      pick: (arr) => arr[Math.floor(rnd() * arr.length)],
      chance: (p) => rnd() < p,
      addScore: (n) => game._addScore(n),
      setStat: (label, value) => game.customStats.set(label, value),
      hudMessage: (text, ms = 900) => game.hud.message(text, ms),
      aimDir: () => game.engine.camera.getWorldDirection(new THREE.Vector3()),
    };
  }
}
