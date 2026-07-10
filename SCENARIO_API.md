# AimForge Scenario API (v1 — frozen contract)

A scenario is a plain object, default-exported from its own file in `js/scenarios/`.
Scenario files must have **no side effects at import time**, must **never touch the DOM**,
and may only import from `'three'` (e.g. `import { Vector3 } from 'three'`).

```js
export default {
  id: 'gridshot',            // unique kebab-case id, matches filename
  name: 'Gridshot',          // display name
  category: 'flicking',      // 'flicking' | 'tracking' | 'switching' | 'reflex' | 'precision' | 'special'
  description: 'One line shown on the menu card and briefing screen.',
  duration: 60,              // run length in seconds
  weapon: { mode: 'semi' },  // see Weapons below
  scoring: {},               // see Scoring below (all fields optional)
  thresholds: [3000, 5000, 7500, 10000, 12500, 15000, 18000],
  // 7 ascending score thresholds: Bronze, Silver, Gold, Platinum, Diamond, Master, Grandmaster.
  // Estimate plausible values from your scoring math (e.g. kills/sec × points/kill × duration).

  start(api) {},                      // REQUIRED. Spawn initial targets, init state.
  tick(api, dt) {},                   // optional. Called every frame while running. dt in seconds.
  onTargetKilled(api, target) {},     // optional. Called after a target the player killed dies.
  onShot(api, hit, target) {},        // optional. Per discrete shot (semi/auto only). target may be null.
  end(api) {},                        // optional. Targets are cleared automatically after this.
};
```

Store run state on the object itself (e.g. `this._wave = 0`) or in a closure created in
`start()` — but always **reset it inside `start()`**, because the same object is reused
across runs.

## Weapons

- `{ mode: 'semi' }` — one hitscan shot per click. Optional `damage` (default 1).
- `{ mode: 'auto', rpm: 600 }` — hitscan, fires while held at `rpm` (default 600). Optional `damage` (default 1).
- `{ mode: 'beam' }` — continuous while held. Deals `dps` damage/sec (default 0 = never kills;
  set `dps` if you want beam kills) and scores time-on-target. Use for tracking scenarios.

## Scoring (handled by the core — don't reinvent it)

`scoring` fields, all optional:
- `perKill` (default 100) — points per killed target (semi/auto/beam-with-dps).
- `perDamage` (default 0) — points per point of damage dealt on hit.
- `trackingPerSecond` (default 500) — beam mode only: points per second the beam is on a target.

For bonuses (speed bonuses, streaks, penalties) call `api.addScore(n)` — negative allowed;
total score is clamped at 0.

Accuracy is computed by the core: hits/shots for semi/auto, time-on-target/time-firing for beam.

## The `api` object

Passed to every hook. Identical instance for the whole run.

### Spawning
```js
const t = api.spawn({
  pos: { x, y, z },        // or THREE.Vector3. REQUIRED.
  radius: 0.9,             // sphere radius (or capsule radius), default 0.9
  shape: 'sphere',         // 'sphere' (default) | 'capsule'
  height: 2.0,             // capsule only: total end-to-end height (must be > 2*radius)
  hp: 1,                   // default 1. Use Infinity for un-killable tracking targets.
  color: 0x00e5ff,         // default: player's target color setting. Only override with reason.
  move: null,              // movement spec, see Movers. null/omitted = static.
  lifetime: 0,             // seconds until auto-expiry. 0/omitted = forever.
  onExpire: (api, t) => {},// called if lifetime elapses (target removed WITHOUT score).
  decoy: false,            // true = hittable but rewards nothing; hitting it counts as a MISS
                           // (breaks streak, hurts accuracy). Use for bodies/obstacles.
  data: {},                // your scratch space, e.g. shared refs for compound targets
});
```

`api.spawn` returns a `Target`:
- `t.pos` — live `THREE.Vector3`, mutate it in custom movers.
- `t.radius`, `t.hp`, `t.maxHp`, `t.alive`, `t.age` (seconds since spawn), `t.data`, `t.decoy`
- `t.kill(scored)` — remove it. `scored=true` awards points + fires `onTargetKilled`;
  `scored=false` removes silently (use for cleanup/expiry-like removal).
- `t.setColor(hex)`

### Movers (`move` field)

- `{ type: 'strafe', axis: 'x', range: [-10, 10], speedMin: 5, speedMax: 9, switchMin: 0.25, switchMax: 0.9, accel: 40, jump: { chance: 0.25, vy: 5, gravity: 13 } }`
  Strafes back and forth on `axis` ('x' or 'y') within `range` (absolute world coords on that
  axis), picking a new random speed/direction every `switchMin..switchMax` seconds, with
  acceleration `accel`. Optional `jump` (only sensible with axis 'x'): on each direction
  switch, with probability `chance`, hops (vy impulse, simple gravity, lands at spawn y).
- `{ type: 'lissajous', center: {x,y,z}, amp: {x: 7, y: 3, z: 4}, freq: {x: 0.4, y: 0.6, z: 0.3} }`
  Smooth 3D figure-eight flight: `pos = center + amp * sin(2π*freq*t + phase)` per axis.
  Phases are auto-randomized each spawn. Great for air tracking.
- `{ type: 'bounce', vel: {x, y, z}, box: { xMin, xMax, yMin, yMax, zMin, zMax } }`
  Constant velocity, reflects off box faces.
- `{ type: 'custom', fn: (target, dt, t) => { /* mutate target.pos */ } }`
  `t` is the target's age in seconds. For gravity arcs, compound targets, etc.

### World / arena

- `api.arena` — `{ wallZ: -30, xMax: 16, height: 14, floorY: 0, zMin: -32, zMax: 6, playerPos: Vector3(0, 1.7, 0) }`
  The target wall is the plane `z = -30` facing the player at the origin. Keep targets inside
  the room: `|x| < 15`, `0.5 < y < 13`, `-31 < z < 0`.
- `api.wallPoint({ xRange: 11, yMin: 1.2, yMax: 9, z: -30, minDist: 0 })` → `Vector3`
  Random point on the target wall plane. `minDist` = minimum distance from all currently
  alive targets (best-effort, 50 attempts). All fields optional with the defaults shown.
- `api.targets` — array of currently alive targets (read-only; don't mutate the array).
- `api.clearTargets()` — remove all without scoring.

### Utility

- `api.rand(min, max)`, `api.randInt(min, max)` (inclusive), `api.pick(array)`, `api.chance(p)`
- `api.time` — seconds elapsed in the run; `api.duration`; `api.timeLeft`
- `api.addScore(n)` — bonus/penalty points.
- `api.setStat(label, value)` — add a custom line to the results screen
  (e.g. `api.setStat('Avg reaction', '312 ms')`). Call as often as you like; last value wins.
- `api.hudMessage(text, ms = 900)` — transient center-screen message.
- `api.camera` — the THREE camera (read-only). `api.aimDir()` — unit Vector3 the player faces.
- `api.opts` — options object passed when the run started (custom-mode config lives here).

## Conventions & quality bar

- Sizing intuition: a sphere of radius `r` at distance `d` subtends `2·atan(r/d)` degrees.
  At the wall (30 m): r=0.9 → ~3.4° (easy flicks), r=0.35 → ~1.3° (precision).
- Clicking scenarios keep a constant number of targets alive: kill one in `onTargetKilled`,
  spawn one replacement (use `minDist ≥ 2.2 × radius` so targets never overlap).
- Tracking scenarios: ONE target, `hp: Infinity`, weapon `beam`, spawn closer than the wall
  (z between -12 and -20) so it fills more of the screen.
- Compound targets (e.g. head + body): spawn the body with `decoy: true`, the head as the real
  target, and use a `custom` mover on the head that follows `body.pos` via `data` refs.
- Never allocate `new Vector3()` inside `tick`/mover functions if avoidable — reuse via `data`.
- Difficulty should press a good player, not a superhuman one.

## Checklist before you're done

1. File is `js/scenarios/<id>.js`, default export, no DOM, no imports besides `'three'`.
2. `node --check js/scenarios/<id>.js` passes (run from the project root).
3. Only documented `api.*` / `Target` members are used — anything else will crash at runtime.
4. State fully re-initialized in `start()`; scenario works on restart.
5. `thresholds` are 7 ascending numbers consistent with your scoring math.
