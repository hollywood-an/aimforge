// AimForge regression guards for review-confirmed fixes and invariants.
// Usage: node tests/regression.js   (server must be running — npm run serve:test)
import { launch, BASE_URL, sleep, failShot } from './harness.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.AF && window.AF.game && window.AF.ui, { timeout: 60000 });
await sleep(400);
const out = {};

// 1. Bench retry blocked: restart() during a bench run must not reset the run.
await page.evaluate(() => AF.game._beginRun(AF.byId['gridshot'], { bench: { stage: 0, total: 6 }, durationOverride: 60 }));
await page.waitForFunction(() => AF.game.state === 'running', { timeout: 20000 });
await sleep(300);
const elBefore = await page.evaluate(() => AF.game.elapsed);
await page.evaluate(() => AF.game.restart());
await sleep(300);
out.benchRetryBlocked = await page.evaluate(
  (e0) => AF.game.state === 'running' && AF.game.elapsed >= e0,
  elBefore
);
await page.evaluate(() => { AF.ui._bench = null; AF.game.quitToMenu(); });
await sleep(200);

// 2. RPM cap: spam clicks can't exceed the 600rpm envelope for the game time
//    that actually elapsed (the spam window stretches on slow CI runners, so
//    the bound is measured, not assumed).
await page.evaluate(() => AF.game._beginRun(AF.byId['speed-switch'], {}));
await page.waitForFunction(() => AF.game.state === 'running', { timeout: 20000 });
const rpmRes = await page.evaluate(async () => {
  const s0 = AF.game.shots;
  const e0 = AF.game.elapsed;
  AF.engine.camera.lookAt(AF.targets.alive[0]?.pos || AF.engine.camera.position);
  await new Promise((res) => {
    let n = 0;
    const iv = setInterval(() => {
      AF.game._onFireDown();
      if (++n >= 30) { clearInterval(iv); res(); }
    }, 10);
  });
  return { shots: AF.game.shots - s0, span: AF.game.elapsed - e0 };
});
// 600 rpm = 10 shots per game-second; +2 margin for window-boundary shots.
out.rpmCap = { ...rpmRes, cap: Math.ceil(rpmRes.span * 10) + 2, ok: rpmRes.shots <= Math.ceil(rpmRes.span * 10) + 2 };
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
await page.waitForFunction(() => AF.game.state === 'running', { timeout: 20000 });
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

// 8. Seed determinism: same seed => identical spawn stream, mover lanes, and
//    initial scenario layout; different/absent seed => different. All primitive
//    probes are synchronous (single evaluate) so frame timing can't race them.
const seedProbe = (seed) => page.evaluate((s) => {
  AF.game._beginRun(AF.byId['gridshot'], s == null ? {} : { seed: s });
  const api = AF.game.api;
  const draws = [api.rand(0, 1), api.randInt(1, 100), api.pick([1, 2, 3, 4, 5]), api.chance(0.5)];
  const wp = api.wallPoint({});
  const t1 = api.spawn({ pos: { x: 0, y: 2, z: -20 }, move: { type: 'strafe' } });
  const t2 = api.spawn({ pos: { x: 0, y: 2, z: -20 }, move: { type: 'lissajous', amp: { x: 3 }, freq: { x: 0.4 } } });
  const snap = JSON.stringify({
    draws, wp: [wp.x, wp.y, wp.z],
    st: [t1._st.dir, t1._st.speed, t1._st.timer],
    lj: [t2._lj.px, t2._lj.py, t2._lj.pz],
  });
  const runSeed = AF.game.seed;
  AF.game.quitToMenu();
  return { snap, runSeed };
}, seed);
const pa = await seedProbe(12345);
const pb = await seedProbe(12345);
const pc = await seedProbe(54321);
const u1 = await seedProbe(null);
const u2 = await seedProbe(null);
out.seedPrimitives = {
  sameSeedIdentical: pa.snap === pb.snap,
  diffSeedDiffers: pa.snap !== pc.snap,
  unseededDiffers: u1.runSeed !== u2.runSeed,
  ok: pa.snap === pb.snap && pa.snap !== pc.snap && u1.runSeed !== u2.runSeed,
};
// Real-run check: gridshot's initial layout is identical for the same seed
// (its targets are static, so a post-countdown snapshot is stable), and a
// finished run records its seed on the saved result.
const layoutOf = async (seed) => {
  await page.evaluate((s) => AF.game._beginRun(AF.byId['gridshot'], { seed: s }), seed);
  await page.waitForFunction(() => AF.game.state === 'running', { timeout: 20000 });
  return page.evaluate(() =>
    JSON.stringify(AF.targets.alive.map((t) => [t.pos.x, t.pos.y, t.pos.z].map((v) => v.toFixed(4))).sort()));
};
const la = await layoutOf(777);
await page.evaluate(() => { AF.game.elapsed = AF.game.runDuration + 0.2; });
await page.waitForSelector('#screen-results:not(.hidden)', { timeout: 8000 });
const savedSeed = await page.evaluate(() => {
  const runs = JSON.parse(localStorage.getItem('af_runs_v1') || '{}').gridshot || [];
  return runs[runs.length - 1]?.seed;
});
await page.evaluate(() => AF.game.quitToMenu());
await sleep(200);
const lb = await layoutOf(777);
await page.evaluate(() => AF.game.quitToMenu());
await sleep(200);
const lc = await layoutOf(888);
await page.evaluate(() => AF.game.quitToMenu());
await sleep(200);
out.seedRuns = {
  sameSeedSameLayout: la === lb,
  diffSeedDiffLayout: la !== lc,
  savedSeed,
  ok: la === lb && la !== lc && savedSeed === 777,
};

// 9. Challenge links: ?c=<id>.<seed36>.<score> boots into the briefing with
//    the seed armed and a chip; the run records seed/beatScore at timeScale 1
//    and renders the outcome line. ("16" base36 = seed 42.)
await page.goto(BASE_URL + '?c=gridshot.16.5000', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.AF && window.AF.game && window.AF.ui, { timeout: 60000 });
await sleep(300);
out.challengeBoot = await page.evaluate(() => ({
  armed: JSON.stringify(AF.ui._challenge),
  briefVisible: !document.getElementById('screen-brief').classList.contains('hidden'),
  chip: !!document.querySelector('#brief-meta .chip.challenge'),
}));
out.challengeBoot.ok = out.challengeBoot.armed === JSON.stringify({ id: 'gridshot', seed: 42, beatScore: 5000 })
  && out.challengeBoot.briefVisible && out.challengeBoot.chip;
// Run it with the opts _startBrief would arm (pointer lock is unavailable headless).
await page.evaluate(() => AF.game._beginRun(AF.byId['gridshot'], {
  seed: AF.ui._challenge.seed,
  beatScore: AF.ui._challenge.beatScore,
  durationOverride: AF.byId['gridshot'].duration,
}));
await page.waitForFunction(() => AF.game.state === 'running', { timeout: 20000 });
await page.evaluate(() => { AF.game.elapsed = AF.game.runDuration + 0.2; });
await page.waitForSelector('#screen-results:not(.hidden)', { timeout: 8000 });
out.challengeRun = await page.evaluate(() => {
  const runs = JSON.parse(localStorage.getItem('af_runs_v1') || '{}').gridshot || [];
  const last = runs[runs.length - 1] || {};
  const oc = document.getElementById('res-challenge-outcome');
  return {
    seed: last.seed, beatScore: last.beatScore, timeScale: last.timeScale,
    outcomeVisible: !oc.classList.contains('hidden'),
    outcomeText: oc.textContent,
    shareHiddenAtZeroScore: document.getElementById('res-challenge').classList.contains('hidden'),
  };
});
out.challengeRun.ok = out.challengeRun.seed === 42 && out.challengeRun.beatScore === 5000
  && out.challengeRun.timeScale === 1 && out.challengeRun.outcomeVisible
  && out.challengeRun.outcomeText.includes('needed') && out.challengeRun.shareHiddenAtZeroScore;
await page.evaluate(() => AF.game.quitToMenu());
await sleep(200);

// 10. Backup export/import: byte-identical round-trip across all 5 keys
//     (af_last_v1 is a bare string, not JSON); malformed payloads throw
//     without touching storage.
out.backup = await page.evaluate(async () => {
  const m = await import('/js/stats.js');
  const KEYS = ['af_settings_v1', 'af_runs_v1', 'af_bench_v1', 'af_custom_v1', 'af_last_v1'];
  localStorage.setItem('af_settings_v1', JSON.stringify({ fov: 100, sensMode: 'match' }));
  localStorage.setItem('af_runs_v1', JSON.stringify({ gridshot: [{ scenarioId: 'gridshot', score: 4200, timeScale: 1 }] }));
  localStorage.setItem('af_bench_v1', JSON.stringify([{ points: 4, rank: 'Gold' }]));
  localStorage.setItem('af_custom_v1', JSON.stringify({ count: 4 }));
  localStorage.setItem('af_last_v1', 'gridshot');
  const before = JSON.stringify(KEYS.map((k) => localStorage.getItem(k)));
  const payload = m.exportData();
  KEYS.forEach((k) => localStorage.removeItem(k));
  localStorage.setItem('af_runs_v1', JSON.stringify({ junk: [] }));
  const counts = m.importData(JSON.parse(JSON.stringify(payload)));
  const after = JSON.stringify(KEYS.map((k) => localStorage.getItem(k)));
  const roundTrip = before === after;
  const rejects = [];
  const tryBad = (p) => { try { m.importData(p); rejects.push(false); } catch { rejects.push(true); } };
  tryBad(null);
  tryBad({ version: 2, data: { af_last_v1: 'x' } });
  tryBad({ version: 1, data: {} });
  tryBad({ version: 1, data: { af_runs_v1: [1, 2, 3] } });
  tryBad({ version: 1, data: { af_bench_v1: {} } });
  const untouched = JSON.stringify(KEYS.map((k) => localStorage.getItem(k))) === after;
  return { roundTrip, rejects, untouched, counts, ok: roundTrip && rejects.every(Boolean) && untouched && counts.runs === 1 };
});

out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
const ok = out.benchRetryBlocked && out.rpmCap.ok && out.pbNorm.ok && out.pendingCleared
  && out.customClamp.ok && out.benchDoneState && out.sensClamp.ok
  && out.seedPrimitives.ok && out.seedRuns.ok
  && out.challengeBoot.ok && out.challengeRun.ok && out.backup.ok && pageErrors.length === 0;
if (!ok) await failShot(page, 'regression');
await browser.close();
process.exit(ok ? 0 : 1);
