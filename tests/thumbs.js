// Capture in-game thumbnails for every scenario -> assets/thumbs/<id>.webp
// Poses each mode with targets mid-arena, HUD/viewmodel hidden, camera on the action.
// Usage: node tests/thumbs.js [id1,id2,...]   (server must be running)
import fs from 'fs';
import { fileURLToPath } from 'url';
import { launch, BASE_URL, sleep } from './harness.mjs';

const OUT = fileURLToPath(new URL('../assets/thumbs', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

// Per-scenario pose: settle = extra ms after GO (movers mid-arena); dist = camera
// distance in meters from the focus point (close = targets read large on a card);
// focus = 'centroid' | 'first' (split-wall modes frame one target, not empty middle);
// look = offset added to the focus point; fov = horizontal FOV for the shot.
const POSES = {
  gridshot:          { settle: 900,  dist: 11, look: [0.4, 0.2, 0],  fov: 58 },
  sixshot:           { settle: 600,  dist: 14, look: [0, 0.3, 0],    fov: 64 },
  motionshot:        { settle: 1400, dist: 11, look: [-0.3, 0.2, 0], fov: 58 },
  popcorn:           { settle: 1200, dist: 12, look: [0, -0.4, 0],   fov: 60 }, // arcs rise from the floor
  microshot:         { settle: 700,  dist: 7,  look: [0.2, 0.1, 0],  fov: 52 }, // tight cluster, get close
  longshots:         { settle: 700,  dist: 6,  look: [0.6, 0.1, 0],  fov: 56, focus: 'first' },
  headhunter:        { settle: 1200, dist: 8,  look: [0.5, 0.3, 0],  fov: 54 }, // favor the head line
  'smooth-tracking': { settle: 1500, dist: 8,  look: [0, 0.1, 0],    fov: 52 },
  'air-tracking':    { settle: 1400, dist: 10, look: [0, 0.4, 0],    fov: 56 }, // orb swoops high
  strafebot:         { settle: 1300, dist: 8,  look: [-0.4, 0.2, 0], fov: 54 },
  'speed-switch':    { settle: 1100, dist: 12, look: [0, 0.2, 0],   fov: 64 },
  multiswitch:       { settle: 1300, dist: 12, look: [0.2, 0.2, 0],  fov: 60 },
  'reflex-flick':    { settle: 0,    dist: 9,  look: [0, 0.1, 0],    fov: 54, waitTarget: true },
  custom:            { settle: 1100, dist: 13, look: [0, 0.2, 0],    fov: 62 },
};

const CUSTOM_OPTS = {
  custom: { count: 5, radius: 0.7, hp: 1, speed: 4, distance: 22, spread: 11, lifetime: 0, weapon: 'semi', duration: 60 },
  weaponOverride: { mode: 'semi' },
  durationOverride: 60,
};

const browser = await launch(['--window-size=1280,720']);
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.AF && window.AF.game && window.AF.SCENARIOS);
await sleep(400);

const only = process.argv[2] ? process.argv[2].split(',') : null;
let ids = await page.evaluate(() => AF.SCENARIOS.map((s) => s.id));
if (only) ids = ids.filter((id) => only.includes(id));
for (const id of ids) {
  const pose = POSES[id] || { settle: 1000, look: [0, 0.2, 0] };
  const opts = id === 'custom' ? CUSTOM_OPTS : {};
  await page.evaluate((sid, o) => AF.game._beginRun(AF.byId[sid], o), id, opts);
  await sleep(2700); // countdown (2.4s) + GO
  await page.evaluate(() => {
    AF.hud.hide();
    AF.engine.setViewmodelVisible(false);
  });
  if (pose.waitTarget) {
    await page.waitForFunction(() => AF.targets.alive.some((t) => !t.decoy), { timeout: 6000 });
    await sleep(150);
  }
  if (pose.settle) await sleep(pose.settle);
  await page.evaluate((fov) => AF.engine.setFovH(fov), pose.fov || 56);
  // Dolly the camera close to the action and aim it: focus point is the live-target
  // centroid (or the first target for split-wall modes), camera pulled back `dist`
  // meters toward the player side, slightly above eye height for a flattering angle.
  const n = await page.evaluate((off, dist, focusMode) => {
    const alive = AF.targets.alive.filter((t) => !t.decoy);
    const all = AF.targets.alive;
    if (!all.length) return 0;
    let f;
    if (focusMode === 'first' && alive.length) {
      f = { x: alive[0].pos.x, y: alive[0].pos.y, z: alive[0].pos.z };
    } else {
      f = { x: 0, y: 0, z: 0 };
      for (const t of all) { f.x += t.pos.x; f.y += t.pos.y; f.z += t.pos.z; }
      f.x /= all.length; f.y /= all.length; f.z /= all.length;
    }
    f.x += off[0]; f.y += off[1]; f.z += off[2];
    const cam = AF.engine.camera;
    cam.position.set(f.x * 0.35, Math.max(2.0, f.y - 0.4), f.z + dist);
    cam.lookAt(f.x, f.y, f.z);
    return all.length;
  }, pose.look, pose.dist || 11, pose.focus || 'centroid');
  await sleep(120); // let a couple frames render at the new angle
  await page.screenshot({
    path: `${OUT}/${id}.webp`,
    type: 'webp',
    quality: 82,
    clip: { x: 40, y: 120, width: 1200, height: 480 },
  });
  const kb = Math.round(fs.statSync(`${OUT}/${id}.webp`).size / 1024);
  console.log(`${id}: ${n} targets, ${kb} KB`);
  await page.evaluate(() => {
    // Restore the player camera + FOV for the next scenario.
    AF.engine.setFovH(AF.settings.data.fov);
    AF.engine.camera.position.set(0, 1.7, 0);
    AF.game.quitToMenu();
  });
  await sleep(200);
}
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
