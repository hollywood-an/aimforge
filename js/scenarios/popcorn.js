// Popcorn — orbs launch up from the floor in slow, floaty arcs and fall back down.
// Trains vertical flicking and shot prioritization: pop them before they drop.

const RADIUS = 0.5;
const ALIVE = 4;
const GRAVITY = 5.5;           // slow, floaty arcs (~2.2-3.3 s airtime)
const FLOOR_KILL_Y = 0.4;      // below this on the way down = dropped, no score

export default {
  id: 'popcorn',
  name: 'Popcorn',
  category: 'flicking',
  description: 'Four orbs pop up from the floor in lazy arcs. Shoot them out of the air before they land.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  thresholds: [3500, 5000, 6500, 8000, 9500, 10800, 12000],

  start(api) {
    this._dropped = 0;
    for (let i = 0; i < ALIVE; i++) this._spawnOne(api);
  },

  tick(api) {
    // Copy first: kill() and _spawnOne() both mutate the live target list.
    for (const t of [...api.targets]) {
      if (t.pos.y < FLOOR_KILL_Y) {
        t.kill(false);
        this._dropped++;
        api.setStat('Dropped', this._dropped);
        this._spawnOne(api);
      }
    }
  },

  onTargetKilled(api) {
    this._spawnOne(api);
  },

  _spawnOne(api) {
    api.spawn({
      pos: { x: api.rand(-8, 8), y: 0.6, z: api.rand(-26, -20) },
      radius: RADIUS,
      data: { vy: api.rand(6, 9), vx: api.rand(-1.2, 1.2) },
      move: {
        type: 'custom',
        fn: (t, dt) => {
          t.pos.y += t.data.vy * dt;
          t.pos.x += t.data.vx * dt;
          t.data.vy -= GRAVITY * dt;
        },
      },
    });
  },
};
