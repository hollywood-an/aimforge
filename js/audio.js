// All sounds are synthesized with WebAudio — zero assets, zero load time, ~0ms latency.

import { settings } from './settings.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  /** Must be called from a user gesture at least once. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      // Pre-render a short noise buffer for shot texture.
      const len = Math.floor(this.ctx.sampleRate * 0.1);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.value = settings.data.volume;
  }

  _vol() {
    if (this.master) this.master.gain.value = settings.data.volume;
  }

  _tone({ freq = 800, to = 0, dur = 0.05, type = 'square', gain = 0.25, at = 0 }) {
    if (!this.ctx || settings.data.volume <= 0) return;
    this._vol();
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to > 0) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.06, gain = 0.15, freq = 1800 }) {
    if (!this.ctx || settings.data.volume <= 0) return;
    this._vol();
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  shoot() {
    this._noise({ dur: 0.05, gain: 0.12, freq: 2400 });
    this._tone({ freq: 220, to: 90, dur: 0.05, type: 'triangle', gain: 0.1 });
  }

  hit() {
    if (!settings.data.hitSound) return;
    this._tone({ freq: 1250, dur: 0.035, type: 'square', gain: 0.16 });
  }

  /** Softer repeating tick while a beam is on target. */
  tick() {
    if (!settings.data.hitSound) return;
    this._tone({ freq: 1100, dur: 0.02, type: 'square', gain: 0.07 });
  }

  kill() {
    this._tone({ freq: 900, to: 1500, dur: 0.07, type: 'square', gain: 0.2 });
    this._tone({ freq: 1800, dur: 0.05, type: 'sine', gain: 0.12, at: 0.05 });
  }

  /** Dull thud for decoy/body hits — audible "that was wrong" feedback. */
  thud() {
    this._tone({ freq: 160, to: 70, dur: 0.08, type: 'triangle', gain: 0.18 });
  }

  count() {
    this._tone({ freq: 440, dur: 0.09, type: 'sine', gain: 0.2 });
  }

  go() {
    this._tone({ freq: 880, dur: 0.14, type: 'sine', gain: 0.24 });
  }

  end() {
    this._tone({ freq: 660, dur: 0.12, type: 'sine', gain: 0.2 });
    this._tone({ freq: 440, dur: 0.2, type: 'sine', gain: 0.18, at: 0.12 });
  }

  ui() {
    this._tone({ freq: 700, dur: 0.025, type: 'sine', gain: 0.08 });
  }

  pb() {
    // Little fanfare for a new personal best.
    this._tone({ freq: 660, dur: 0.09, type: 'sine', gain: 0.2 });
    this._tone({ freq: 880, dur: 0.09, type: 'sine', gain: 0.2, at: 0.09 });
    this._tone({ freq: 1320, dur: 0.16, type: 'sine', gain: 0.22, at: 0.18 });
  }
}

export const audio = new AudioEngine();
