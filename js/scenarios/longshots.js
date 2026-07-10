// Longshots — two tiny orbs pinned to opposite edges of the wall.
// Trains huge, committed cross-screen flicks that still have to land dead-on.

const RADIUS = 0.45;           // ~1.7° at the wall — precision-sized
const X_MIN = 6;               // each orb lives in |x| between X_MIN and X_MAX
const X_MAX = 13;
const Y_MIN = 1.5;
const Y_MAX = 9;

export default {
  id: 'longshots',
  name: 'Longshots',
  category: 'precision',
  description: 'Two small orbs at opposite ends of the wall. Every kill is a full cross-screen flick.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  // Kills are slow here: each one costs a huge traverse plus a precise click.
  thresholds: [2500, 3500, 4500, 5500, 6500, 7700, 9000],

  start(api) {
    this._spawnOne(api, -1);
    this._spawnOne(api, 1);
  },

  onTargetKilled(api, target) {
    // Respawn on the side that just died so both extremes stay occupied.
    this._spawnOne(api, target.data.side);
  },

  _spawnOne(api, side) {
    api.spawn({
      pos: { x: side * api.rand(X_MIN, X_MAX), y: api.rand(Y_MIN, Y_MAX), z: api.arena.wallZ },
      radius: RADIUS,
      data: { side },
    });
  },
};
