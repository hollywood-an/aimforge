// Multiswitch — four drifting orbs, four hits each with an auto rifle.
// Trains reading a chaotic field, picking a target, and committing to the switch.

const HP = 4;
const ALIVE = 4;
const RADIUS = 0.8;

export default {
  id: 'multiswitch',
  name: 'Multiswitch',
  category: 'switching',
  description: 'Four drifting orbs, four hits each. Pick one, finish it, snap to the next.',
  duration: 60,
  weapon: { mode: 'auto', rpm: 600 },
  scoring: { perKill: 100, perDamage: 10 },
  // Each kill = 100 + 4 hits * 10 = 140 pts; 2800 ≈ 20 kills, 9500 ≈ 68 kills in 60 s.
  thresholds: [2800, 3900, 5000, 6100, 7300, 8400, 9500],

  start(api) {
    for (let i = 0; i < ALIVE; i++) this._spawnOne(api);
  },

  onTargetKilled(api) {
    this._spawnOne(api);
  },

  _spawnOne(api) {
    const center = { x: api.rand(-9, 9), y: api.rand(2, 7), z: -20 };
    api.spawn({
      pos: { ...center },
      radius: RADIUS,
      hp: HP,
      move: {
        type: 'lissajous',
        center,
        amp: { x: 2, y: 1.2, z: 0 },
        freq: { x: api.rand(0.3, 0.5), y: api.rand(0.4, 0.7), z: 0 },
      },
    });
  },
};
