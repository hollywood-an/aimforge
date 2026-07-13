// Bootstrap: build the engine, input, HUD, targets, game and UI, then run the loop.

import { Engine } from './engine.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { TargetManager } from './targets.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { settings } from './settings.js';
import { PointerCalibrator } from './calibrate.js';
import { seedFromString } from './rng.js';
import { totals } from './stats.js';
import { SCENARIOS, byId } from './scenarios/index.js';

const canvas = document.getElementById('game');
const engine = new Engine(canvas);
const input = new Input(canvas);
const hud = new Hud();
const targets = new TargetManager(engine.scene);
const game = new Game({ engine, input, hud, targets });
const ui = new UI(game, hud);
game.ui = ui;

// Measures the real desktop cursor speed on the pre-run screens so "match my mouse"
// sensitivity tracks the user's actual mouse instead of a fixed slow default.
const calibrator = new PointerCalibrator();
ui.calibrator = calibrator;
calibrator.onUpdate = () => ui.onCalibrated?.();

// Live-apply settings changes.
settings.onChange(() => {
  engine.onResize(); // recomputes FOV for current aspect
  engine.setViewmodelVisible(settings.data.viewmodel);
  hud.applyCrosshair();
  hud.setFpsVisible(settings.data.showFps);
});

// Main loop.
let last = performance.now();
let fpsEMA = 60;
let fpsFrame = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  // Clamp huge steps (tab switches, breakpoints) so physics can't teleport.
  dt = Math.min(dt, 0.05);

  if (dt > 0) fpsEMA = fpsEMA * 0.95 + (1 / dt) * 0.05;
  if (++fpsFrame % 15 === 0) hud.setFps(fpsEMA);

  game.update(dt);
  engine.render(dt);
}

requestAnimationFrame(frame);

// Debug/testing handle (used by automated smoke tests; harmless in production).
window.AF = { engine, input, hud, targets, game, ui, settings, calibrator, SCENARIOS, byId };

// Installable PWA / offline play. Skipped on localhost so dev servers and the
// headless test suites stay cache-free and deterministic.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* http or blocked — the game runs fine without offline support */
    });
  });
}

// Challenge links: ?c=<scenarioId>.<seed36>.<score> lands on the briefing
// screen with the seed armed (the run itself needs a user gesture for pointer
// lock). Any invalid part means a plain visit — no error states.
const hadChallenge = (function handleChallengeLink() {
  const raw = new URLSearchParams(location.search).get('c');
  if (!raw) return false;
  const [id, s36, scoreStr] = raw.split('.');
  const def = byId[id];
  const seed = seedFromString(s36 ?? '');
  const score = /^\d{1,9}$/.test(scoreStr ?? '') ? parseInt(scoreStr, 10) : null;
  if (!def || def.id === 'custom' || seed === null || score === null) return false;
  ui._challenge = { id, seed, beatScore: score };
  ui.showBrief(def);
  return true;
})();

// First visit on this device (no stored settings, no runs, never tuned):
// open the sensitivity demo instead of the menu. Challenge links win — those
// visitors came to play something specific; Settings → Tune covers them.
if (!hadChallenge && settings.freshInstall && totals().runs === 0 && !settings.data.sensTuned) {
  ui.showSensDemo('boot');
}
