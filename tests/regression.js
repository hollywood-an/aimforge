// AimForge regression guards for review-confirmed fixes and invariants.
// Usage: node tests/regression.js   (server must be running — npm run serve:test)
import { launch, BASE_URL, sleep, failShot } from './harness.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.AF && window.AF.game && window.AF.ui);
await sleep(400);
const out = {};

// 1. Bench retry blocked: restart() during a bench run must not reset the run.
await page.evaluate(() => AF.game._beginRun(AF.byId['gridshot'], { bench: { stage: 0, total: 6 }, durationOverride: 60 }));
await sleep(3000);
const elBefore = await page.evaluate(() => AF.game.elapsed);
await page.evaluate(() => AF.game.restart());
await sleep(300);
out.benchRetryBlocked = await page.evaluate(
  (e0) => AF.game.state === 'running' && AF.game.elapsed >= e0,
  elBefore
);
await page.evaluate(() => { AF.ui._bench = null; AF.game.quitToMenu(); });
await sleep(200);

// 2. RPM cap: 30 spam clicks in ~0.3s on an auto weapon => ~3 shots (600rpm), never >6.
await page.evaluate(() => AF.game._beginRun(AF.byId['speed-switch'], {}));
await sleep(3000);
const shots = await page.evaluate(async () => {
  const s0 = AF.game.shots;
  AF.engine.camera.lookAt(AF.targets.alive[0]?.pos || AF.engine.camera.position);
  await new Promise((res) => {
    let n = 0;
    const iv = setInterval(() => {
      AF.game._onFireDown();
      if (++n >= 30) { clearInterval(iv); res(); }
    }, 10);
  });
  return AF.game.shots - s0;
});
out.rpmCap = { shots, ok: shots <= 6 };
await page.evaluate(() => AF.game.quitToMenu());
await sleep(200);

// 3. PB normalization: 9000@1x beats 14000@2x.
out.pbNorm = await page.evaluate(async () => {
  const runs = { gridshot: [
    { scenarioId: 'gridshot', score: 9000, timeScale: 1, date: '2026-01-01' },
    { scenarioId: 'gridshot', score: 14000, timeScale: 2, date: '2026-01-02' },
  ] };
  localStorage.setItem('af_runs_v1', JSON.stringify(runs));
  const m = await import('/js/stats.js');
  const pb = m.getPB('gridshot');
  return { picked: pb.score, norm: m.normScore(pb), ok: pb.score === 9000 };
});

// 4. quitToMenu clears pending arm.
out.pendingCleared = await page.evaluate(() => {
  AF.game._pendingStart = { def: AF.byId['gridshot'], opts: {} };
  AF.game.quitToMenu();
  return AF.game._pendingStart === null && AF.game._pendingResume === false;
});

// 5. Custom clamps: hostile opts get clamped by the scenario itself.
await page.evaluate(() => AF.game._beginRun(AF.byId['custom'], {
  custom: { spread: 50, count: 500, radius: 99, speed: 999, distance: 5, hp: 0 },
  weaponOverride: { mode: 'semi' }, durationOverride: 60,
}));
await sleep(3000);
out.customClamp = await page.evaluate(() => {
  const c = AF.byId['custom']._cfg;
  return { spread: c.spread, count: c.count, ok: c.spread <= 13 && c.count <= 6 };
});
await page.evaluate(() => AF.game.quitToMenu());
await sleep(200);

// 6. Bench summary Done returns to a clean MENU state (no phantom RESULTS).
out.benchDoneState = await page.evaluate(() => {
  AF.ui._bench = { stages: [], i: 6, results: [
    { id: 'gridshot', name: 'Gridshot', score: 9000, tierIdx: 3 },
  ] };
  AF.ui._benchFinish();
  document.getElementById('bench-done').click();
  return AF.game.state === 'menu' && !document.getElementById('screen-menu').classList.contains('hidden');
});

// 7. Sensitivity clamp: typing a negative sens clamps to 0.01 (never inverts aim).
out.sensClamp = await page.evaluate(() => {
  AF.ui._show('screen-settings');
  const input = [...document.querySelectorAll('#settings-body input[type="number"]')]
    .find((i) => i.step === '0.01');
  if (!input) return { ok: false, reason: 'sens input not found' };
  input.value = '-5';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { v: AF.settings.data.sens, ok: AF.settings.data.sens === 0.01 };
});

out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
const ok = out.benchRetryBlocked && out.rpmCap.ok && out.pbNorm.ok && out.pendingCleared
  && out.customClamp.ok && out.benchDoneState && out.sensClamp.ok && pageErrors.length === 0;
if (!ok) await failShot(page, 'regression');
await browser.close();
process.exit(ok ? 0 : 1);
