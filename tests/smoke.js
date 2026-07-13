// AimForge E2E smoke test: every scenario starts, registers hits, finishes, persists.
// Usage: node tests/smoke.js   (server must be running — npm run serve:test)
import { launch, BASE_URL, sleep, failShot } from './harness.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300));
});

// 'load' + the AF waitForFunction below is the real readiness signal;
// networkidle0 flakes on CI runners.
await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.AF && window.AF.game && window.AF.ui && window.AF.SCENARIOS?.length, { timeout: 60000 });
await sleep(500);

const ui = await page.evaluate(() => ({
  webgl: !!AF.engine.renderer.getContext(),
  cards: document.querySelectorAll('#menu-cards .card, #menu-cards [data-id]').length,
  scenarios: AF.SCENARIOS.length,
}));

const results = [];
for (const id of await page.evaluate(() => AF.SCENARIOS.map((s) => s.id))) {
  const r = { id, started: false, engaged: false, finished: false, saved: false };
  try {
    const opts = id === 'custom'
      ? { custom: { count: 3, radius: 1.2, hp: 1, speed: 0, distance: 20, spread: 8, lifetime: 0, weapon: 'semi', duration: 60 }, weaponOverride: { mode: 'semi' }, durationOverride: 60 }
      : {};
    const before = await page.evaluate((sid) => JSON.parse(localStorage.getItem('af_runs_v1') || '{}')[sid]?.length || 0, id);
    await page.evaluate((sid, o) => AF.game._beginRun(AF.byId[sid], o), id, opts);
    // Wait for the countdown to hand over (fixed sleeps break on slow CI
    // runners: dt is clamped to 0.05 so game time lags wall time at low fps).
    await page.waitForFunction(() => AF.game.state === 'running', { timeout: 20000 });
    r.started = true;
    const beam = await page.evaluate(() => AF.game.weapon.mode === 'beam');
    if (beam) {
      // Hold beam on a target for ~1.2s (re-aim every 100ms).
      await page.evaluate(() => { AF.game.input.fireHeld = true; });
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => {
          const t = AF.targets.alive.find((t) => !t.decoy);
          if (t) AF.engine.camera.lookAt(t.pos);
        });
        await sleep(100);
      }
      await page.evaluate(() => { AF.game.input.fireHeld = false; });
      r.engaged = await page.evaluate(() => AF.game._beamOnT > 0 || AF.game.score > 0);
    } else {
      // Poll for a live target (reflex scenarios spawn with gaps), then snap-shoot.
      let shotsTaken = 0;
      for (let i = 0; i < 30 && shotsTaken < 4; i++) {
        const fired = await page.evaluate(() => {
          const t = AF.targets.alive.find((t) => !t.decoy);
          if (!t) return false;
          AF.engine.camera.lookAt(t.pos);
          AF.game._shoot();
          return true;
        });
        if (fired) shotsTaken++;
        await sleep(150);
      }
      r.engaged = await page.evaluate(() => AF.game.hits > 0);
    }
    await page.evaluate(() => { AF.game.elapsed = AF.game.runDuration + 0.2; });
    await page.waitForSelector('#screen-results:not(.hidden)', { timeout: 8000 });
    r.finished = true;
    const after = await page.evaluate((sid) => JSON.parse(localStorage.getItem('af_runs_v1') || '{}')[sid]?.length || 0, id);
    r.saved = after === before + 1;
    await page.evaluate(() => AF.game.quitToMenu());
    await sleep(150);
  } catch (e) {
    r.error = String(e).slice(0, 200);
    await page.evaluate(() => AF.game.quitToMenu()).catch(() => {});
  }
  results.push(r);
  console.log(JSON.stringify(r));
}

// UI flows
const flows = await page.evaluate(() => {
  const vis = (id) => !document.getElementById(id).classList.contains('hidden');
  const out = {};
  AF.ui.showBrief(AF.byId['gridshot']); out.brief = vis('screen-brief');
  AF.ui.showBrief(AF.byId['custom']);
  out.customInputs = document.querySelectorAll('#brief-custom [data-key]').length;
  AF.ui._show('screen-settings');
  out.settingsControls = document.querySelectorAll('#settings-body input, #settings-body select, #settings-body button').length;
  AF.ui.showStats(); out.statsRows = document.querySelectorAll('#stats-table tr').length;
  AF.ui.showBenchIntro(); out.benchStages = document.querySelectorAll('#bench-stages li').length;
  AF.ui.showMenu(); out.menu = vis('screen-menu');
  return out;
});

const fps = await page.evaluate(async () => {
  const t0 = performance.now(); let frames = 0;
  await new Promise((res) => { const loop = () => { frames++; performance.now() - t0 < 1000 ? requestAnimationFrame(loop) : res(); }; requestAnimationFrame(loop); });
  return frames;
});

const failing = results.filter((r) => !(r.started && r.engaged && r.finished && r.saved));
console.log('---');
console.log('UI:', JSON.stringify({ ...ui, ...flows, fps }));
console.log('FAILING SCENARIOS:', failing.length ? JSON.stringify(failing) : 'none');
console.log('ERRORS:', errors.length ? errors.slice(0, 20) : 'none');
if (failing.length || errors.length) await failShot(page, 'smoke');
await browser.close();
process.exit(failing.length || errors.length ? 1 : 0);
