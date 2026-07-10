// Microshot — gridshot shrunk down: 3 tiny orbs packed into a small patch of wall.
// Trains micro-adjustments and clean click confirmation; speed without precision misses.

const RADIUS = 0.35;   // ~1.3° at the wall — precision-sized
const ALIVE = 3;

export default {
  id: 'microshot',
  name: 'Microshot',
  category: 'precision',
  description: 'Three tiny orbs in a tight cluster. Small flicks, exact clicks — no spraying past them.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  // Elite pace is ~2.5-3 kills/sec = 15000-18000 max; Grandmaster sits just under it.
  thresholds: [4000, 6000, 8000, 10000, 12000, 13500, 15000],

  start(api) {
    for (let i = 0; i < ALIVE; i++) this._spawnOne(api);
  },

  onTargetKilled(api) {
    this._spawnOne(api);
  },

  _spawnOne(api) {
    api.spawn({
      pos: api.wallPoint({ xRange: 3.5, yMin: 3, yMax: 6.5, minDist: 1.0 }),
      radius: RADIUS,
    });
  },
};
