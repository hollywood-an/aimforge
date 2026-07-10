// Passive pointer-speed calibration for "match my mouse" sensitivity.
//
// A browser cannot read the OS mouse sensitivity or the mouse's DPI — there is no API
// for either. But on the pre-run screens (menu, briefing) the pointer is NOT locked, so
// `mousemove` deltas are the OS-adjusted pixel movement: literally how fast the cursor
// travels on this machine, with the user's real Windows/macOS pointer speed baked in.
// We sample that, take a robust "comfortable fast" speed, and hand it to settings so the
// default in-game sensitivity tracks the desktop feel instead of a fixed slow value.
//
// The game itself still uses raw (acceleration-free) input; we match the *speed*, not the
// acceleration curve — an aim trainer must stay consistent shot to shot.

import { settings } from './settings.js';

const MIN_SPEED = 150; // px/s floor: ignore idle jitter and micro-adjustments
const MAX_SPEED = 14000; // px/s ceiling: reject teleports / wild outliers
const SAMPLE_CAP = 48; // rolling window of qualifying gesture samples
const READY_SAMPLES = 16; // need this many before the estimate is trusted
const READY_TRAVEL = 900; // ...and this much cumulative intentional travel (px)

export class PointerCalibrator {
  constructor() {
    this._samples = [];
    this._travel = 0;
    this._last = 0;
    this.ready = false;
    this.speed = 0; // px/s — the 75th-percentile comfortable-fast move speed
    this.onUpdate = null; // optional: called (throttled) when the estimate changes
    window.addEventListener('mousemove', (e) => this._onMove(e), { passive: true });
  }

  _onMove(e) {
    // While pointer-locked, movementX/Y are raw counts, not desktop pixels — skip.
    if (document.pointerLockElement) return;
    const now = performance.now();
    const dt = now - this._last;
    this._last = now;
    // Reject the gap between separate gestures (too long) and coalesced noise (too short).
    if (dt <= 3 || dt > 120) return;
    const dist = Math.hypot(e.movementX, e.movementY);
    if (dist < 1) return;
    const v = (dist / dt) * 1000; // px/s
    if (v < MIN_SPEED || v > MAX_SPEED) return;
    this._samples.push(v);
    if (this._samples.length > SAMPLE_CAP) this._samples.shift();
    this._travel += dist;
    this._recompute();
  }

  _recompute() {
    if (this._samples.length < READY_SAMPLES || this._travel < READY_TRAVEL) return;
    const sorted = [...this._samples].sort((a, b) => a - b);
    const p75 = Math.round(sorted[Math.floor(sorted.length * 0.75)]);
    const prev = this.speed;
    this.speed = p75;
    this.ready = true;
    // Only commit when it moves meaningfully, so we don't thrash storage or the readout.
    if (settings.data.sensMode === 'match' && Math.abs(p75 - (settings.data.matchDps || 0)) > p75 * 0.05) {
      settings.data.matchDps = p75;
      settings.persist(); // debounced write only; degPerCount() reads it live
    }
    if (p75 !== prev) this.onUpdate?.(p75);
  }

  /** Discard the current estimate so the next gestures re-seed it. */
  reset() {
    this._samples = [];
    this._travel = 0;
    this.ready = false;
    this.speed = 0;
  }
}
