// In-run HUD: crosshair, score/timer/accuracy readouts, hitmarkers, center messages.

import { settings } from './settings.js';

/** Build crosshair SVG markup from a crosshair config. Shared with the settings preview. */
export function crosshairSVG(ch) {
  const s = Number(ch.size), t = Number(ch.thickness), g = Number(ch.gap);
  const R = Math.max(s + g + t, 12);
  const c = R; // center
  const size = R * 2;
  const col = ch.color;
  const stroke = ch.outline ? `stroke="black" stroke-width="1" paint-order="stroke"` : '';
  let body = '';
  if (ch.style === 'dot') {
    body = `<circle cx="${c}" cy="${c}" r="${Math.max(1, t)}" fill="${col}" ${stroke}/>`;
  } else if (ch.style === 'circle') {
    body = `<circle cx="${c}" cy="${c}" r="${s + g}" fill="none" stroke="${col}" stroke-width="${t}"/>`;
    if (ch.dot) body += `<circle cx="${c}" cy="${c}" r="${Math.max(1, t * 0.75)}" fill="${col}"/>`;
  } else {
    const arm = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}" ${stroke}/>`;
    body =
      arm(c - t / 2, c - g - s, t, s) + // up
      arm(c - t / 2, c + g, t, s) + // down
      arm(c - g - s, c - t / 2, s, t) + // left
      arm(c + g, c - t / 2, s, t); // right
    if (ch.dot) body += `<circle cx="${c}" cy="${c}" r="${Math.max(1, t * 0.75)}" fill="${col}" ${stroke}/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
}

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.elCrosshair = document.getElementById('crosshair');
    this.elHitmarker = document.getElementById('hitmarker');
    this.elScore = document.getElementById('hud-score');
    this.elTimer = document.getElementById('hud-timer');
    this.elAcc = document.getElementById('hud-acc');
    this.elStreak = document.getElementById('hud-streak');
    this.elFps = document.getElementById('hud-fps');
    this.elMsg = document.getElementById('hud-message');
    this.elBench = document.getElementById('hud-bench');
    this._msgTimer = null;
    this.applyCrosshair();
  }

  applyCrosshair() {
    this.elCrosshair.innerHTML = crosshairSVG(settings.data.crosshair);
  }

  show() {
    this.root.classList.remove('hidden');
    this.setFpsVisible(settings.data.showFps);
  }

  hide() {
    this.root.classList.add('hidden');
    this.elBench.textContent = '';
  }

  setScore(n) {
    this.elScore.textContent = Math.round(n).toLocaleString();
  }

  setTimer(secondsLeft) {
    const s = Math.max(0, secondsLeft);
    this.elTimer.textContent = s >= 10 ? `${Math.ceil(s)}` : s.toFixed(1);
    this.elTimer.classList.toggle('urgent', s <= 5);
  }

  setInfo({ acc, streak }) {
    this.elAcc.textContent = `${acc}%`;
    this.elStreak.textContent = streak > 1 ? `×${streak}` : '';
  }

  setFps(fps) {
    this.elFps.textContent = `${Math.round(fps)} FPS`;
  }

  setFpsVisible(v) {
    this.elFps.style.display = v ? '' : 'none';
  }

  setBenchLabel(text) {
    this.elBench.textContent = text || '';
  }

  hitmarker(kill) {
    // WAAPI instead of class-retrigger: no forced synchronous reflow in the hit path.
    const el = this.elHitmarker;
    el.classList.toggle('kill', kill);
    for (const a of el.getAnimations()) a.cancel();
    // Reduced motion: a plain fade with no scale pop.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const frames = reduce
      ? [
          { opacity: 1, transform: 'translate(-50%, -50%) rotate(45deg) scale(1)' },
          { opacity: 0, transform: 'translate(-50%, -50%) rotate(45deg) scale(1)' },
        ]
      : [
          { opacity: 1, transform: 'translate(-50%, -50%) rotate(45deg) scale(0.5)' },
          { opacity: 0, transform: 'translate(-50%, -50%) rotate(45deg) scale(1.25)' },
        ];
    el.animate(frames, { duration: 180, easing: 'ease-out' });
  }

  message(text, ms = 900, big = false) {
    this.elMsg.textContent = text;
    this.elMsg.classList.toggle('big', big);
    this.elMsg.classList.add('visible');
    if (this._msgTimer) clearTimeout(this._msgTimer);
    if (ms > 0) {
      this._msgTimer = setTimeout(() => this.elMsg.classList.remove('visible'), ms);
    }
  }

  clearMessage() {
    if (this._msgTimer) clearTimeout(this._msgTimer);
    this.elMsg.classList.remove('visible');
  }
}
