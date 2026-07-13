// Screenshot every AimForge screen. Usage: node tests/shots.js [outdir] [--reduced-motion]
import fs from 'fs';
import { launch, BASE_URL, sleep, OUT_DIR } from './harness.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const OUT = args[0] || `${OUT_DIR}shots`;
const REDUCED = process.argv.includes('--reduced-motion');

fs.mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
if (REDUCED) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Seed run history so cards/stats/results show realistic data.
await page.evaluateOnNewDocument(() => {
  const mkRun = (id, score, n) => Array.from({ length: n }, (_, i) => ({
    scenarioId: id, score: Math.round(score * (0.7 + 0.3 * (i + 1) / n) + (i % 3) * score * 0.03),
    duration: 60, timeScale: 1, kills: 40 + i, shots: 60 + i, hits: 48 + i,
    acc: 78 + (i % 10), bestStreak: 8 + (i % 5), avgTtkMs: 640 - i * 8, kps: 0.8,
    stats: {}, timelineStep: 1,
    timeline: Array.from({ length: 61 }, (_, s) => Math.round((score * (0.7 + 0.3 * (i + 1) / n)) * s / 60)),
    date: new Date(Date.now() - (n - i) * 864e5).toISOString(), cm360: 32.2, fov: 103,
  }));
  const runs = {
    gridshot: mkRun('gridshot', 9200, 12),
    microshot: mkRun('microshot', 6100, 7),
    'smooth-tracking': mkRun('smooth-tracking', 11800, 5),
    strafebot: mkRun('strafebot', 8300, 4),
    'speed-switch': mkRun('speed-switch', 5400, 6),
    'reflex-flick': mkRun('reflex-flick', 4400, 3),
    sixshot: mkRun('sixshot', 7300, 2),
  };
  localStorage.setItem('af_runs_v1', JSON.stringify(runs));
  localStorage.setItem('af_bench_v1', JSON.stringify([{
    date: new Date(Date.now() - 3 * 864e5).toISOString(), points: 4.2, rank: 'Platinum', color: '#3fd0e0',
    stages: [],
  }]));
});

await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('#menu-cards .card', { timeout: 15000 });
await page.waitForFunction(() => window.AF && window.AF.game && window.AF.ui);
await sleep(600);

const shot = async (name) => {
  await sleep(250);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};

// 1. menu
await shot('01-menu');

// 2. brief (gridshot)
await page.evaluate(() => AF.ui.showBrief(AF.byId['gridshot']));
await shot('02-brief');

// 3. custom drill brief
await page.evaluate(() => AF.ui.showBrief(AF.byId['custom']));
await shot('03-brief-custom');

// 4. in-run HUD — start gridshot directly (pointer lock unavailable headless)
await page.evaluate(() => AF.game._beginRun(AF.byId['gridshot'], {}));
await sleep(3400); // countdown 2.4s + GO + targets up
await shot('04-hud-run');

// 5. pause
await page.evaluate(() => AF.game._pause());
await shot('05-pause');

// 6. results — resume run state, then force finish
await page.evaluate(() => {
  AF.game.state = 'running';
  AF.game.ui.hideAll();
  AF.game.hud.show();
  // give it a plausible score history for the timeline graph
  AF.game.score = 8460; AF.game.kills = 71; AF.game.shots = 92; AF.game.hits = 79;
  AF.game.bestStreak = 14; AF.game.ttks = [0.42, 0.51, 0.38, 0.6];
  AF.game.timeline = Array.from({ length: 60 }, (_, s) => Math.round(8460 * s / 59));
  AF.game.elapsed = AF.game.runDuration + 0.2;
});
await page.waitForSelector('#screen-results:not(.hidden)', { timeout: 8000 });
await shot('06-results');

// 7. settings
await page.evaluate(() => AF.ui._show('screen-settings'));
await shot('07-settings');

// 8. stats
await page.evaluate(() => AF.ui.showStats());
await shot('08-stats');

// 9. bench intro
await page.evaluate(() => AF.ui.showBenchIntro());
await shot('09-bench-intro');

// 10. bench summary (synthesized)
await page.evaluate(() => {
  AF.ui._bench = {
    stages: [], i: 6,
    results: [
      { id: 'gridshot', name: 'Gridshot', score: 9200, tierIdx: 4 },
      { id: 'microshot', name: 'Microshot', score: 6100, tierIdx: 3 },
      { id: 'smooth-tracking', name: 'Smooth Tracking', score: 11800, tierIdx: 4 },
      { id: 'strafebot', name: 'Strafebot', score: 8300, tierIdx: 3 },
      { id: 'speed-switch', name: 'Speed Switch', score: 5400, tierIdx: 2 },
      { id: 'reflex-flick', name: 'Reflex Flick', score: 4400, tierIdx: 3 },
    ],
  };
  AF.ui._benchFinish();
});
await shot('10-bench-summary');

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
