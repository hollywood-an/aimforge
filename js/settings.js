// Settings model: persistence + the sensitivity math that makes cross-game parity real.
// Yaw constants are degrees of rotation per mouse count at in-game sensitivity 1.0.

export const GAMES = [
  { id: 'valorant', name: 'Valorant', yaw: 0.07, step: 0.005, def: 0.4 },
  { id: 'cs2', name: 'CS2 / CS:GO', yaw: 0.022, step: 0.01, def: 1.2 },
  { id: 'apex', name: 'Apex Legends', yaw: 0.022, step: 0.01, def: 1.4 },
  { id: 'overwatch', name: 'Overwatch 2', yaw: 0.0066, step: 0.05, def: 4.5 },
  { id: 'cod', name: 'Call of Duty', yaw: 0.0066, step: 0.05, def: 4.5 },
  { id: 'quake', name: 'Quake / Diabotical', yaw: 0.022, step: 0.01, def: 1.2 },
];

const KEY = 'af_settings_v1';

// "Match my mouse" mapping. We can't read OS sensitivity/DPI, so the in-game speed is
// derived from the measured desktop cursor speed (px/s, see calibrate.js), clamped to a
// sane band. Reference: a typical brisk desktop move (~2800 px/s) → ~30 cm/360.
export const MATCH = {
  refSpeed: 2800, // px/s reference desktop move speed
  refDpc: 0.0381, // degrees/count at the reference (≈30 cm/360 @ 800 DPI)
  minDpc: 0.0238, // ≈48 cm/360 — slowest the auto-match will go
  maxDpc: 0.0635, // ≈18 cm/360 — fastest the auto-match will go
};

export const DEFAULTS = {
  dpi: 800,
  sensMode: 'match', // 'match' (auto from desktop cursor) | 'game' | 'cm360'
  game: 'valorant',
  sens: 0.4,
  cm360: 32,
  matchDps: 0, // measured desktop cursor speed (px/s); 0 = not measured yet → reference default
  fov: 103, // horizontal FOV in degrees, converted per aspect
  invertY: false,
  crosshair: {
    style: 'cross', // 'cross' | 'dot' | 'circle'
    color: '#00ffd0',
    size: 6,
    thickness: 2,
    gap: 3,
    dot: false,
    outline: true,
  },
  targetColor: '#00e5ff',
  volume: 0.5,
  hitSound: true,
  showFps: true,
  viewmodel: true,
  timeScale: 1, // duration multiplier: 0.5 | 1 | 2
};

function merge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const o = over?.[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, o);
    else out[k] = o === undefined ? b : o;
  }
  return out;
}

class Settings {
  constructor() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(KEY));
    } catch {
      /* corrupt store -> defaults */
    }
    this.data = merge(DEFAULTS, stored);
    // One-time migration: installs from before "match my mouse" existed (no matchDps key)
    // that still carry the old fixed default sensitivity (Valorant 0.4 ≈ 40.8 cm/360, which
    // reads as sluggish) are switched to the new auto-match default. Anyone who actually
    // tuned their sensitivity is left untouched.
    if (
      stored &&
      stored.matchDps === undefined &&
      stored.sensMode === 'game' &&
      (stored.sens === undefined || stored.sens === 0.4) &&
      (stored.game === undefined || stored.game === 'valorant')
    ) {
      this.data.sensMode = 'match';
      this.flush();
    }
    this._subs = [];
    this._saveT = null;
    window.addEventListener('beforeunload', () => this.flush());
  }

  save() {
    // Debounce the storage write (sliders fire dozens of times per drag);
    // subscribers still get the change synchronously for live-apply.
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.flush(), 150);
    for (const fn of this._subs) fn(this.data);
  }

  flush() {
    clearTimeout(this._saveT);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode / quota — settings just won't persist */
    }
  }

  /** Debounced persistence WITHOUT notifying subscribers — for high-frequency background
   *  updates (the pointer calibrator) that must not trigger the live-apply/render chain. */
  persist() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.flush(), 400);
  }

  onChange(fn) {
    this._subs.push(fn);
  }

  reset() {
    this.data = merge(DEFAULTS, null);
    this.save();
  }

  game() {
    return GAMES.find((g) => g.id === this.data.game) || GAMES[0];
  }

  /** Degrees of camera rotation per mouse count. */
  degPerCount() {
    const d = this.data;
    if (d.sensMode === 'match') {
      const v = d.matchDps > 0 ? d.matchDps : MATCH.refSpeed;
      const dpc = MATCH.refDpc * (v / MATCH.refSpeed);
      return Math.min(MATCH.maxDpc, Math.max(MATCH.minDpc, dpc));
    }
    if (d.sensMode === 'cm360') {
      const counts = d.dpi * (d.cm360 / 2.54);
      return counts > 0 ? 360 / counts : 0.022;
    }
    return this.game().yaw * d.sens;
  }

  /** True once the desktop cursor speed has actually been measured. */
  matchMeasured() {
    return this.data.matchDps > 0;
  }

  /** Physical cm of mouse travel for a full 360° turn — the universal sens language. */
  cm360() {
    const dpc = this.degPerCount();
    if (dpc <= 0 || this.data.dpi <= 0) return 0;
    return ((360 / dpc) * 2.54) / this.data.dpi;
  }

  eDPI() {
    return this.data.dpi * (this.data.sensMode === 'game' ? this.data.sens : 1);
  }
}

export const settings = new Settings();
