// Speed Switch — two strafing orbs, three hits each with an auto rifle.
// Trains fast, committed transitions between targets under fire-rate pressure.

const HP = 3;
const ALIVE = 2;

export default {
  id: 'speed-switch',
  name: 'Speed Switch',
  category: 'switching',
  description: 'Two strafing orbs, three hits each. Confirm the kill, snap to the next.',
  duration: 60,
  weapon: { mode: 'auto', rpm: 600 },
  scoring: { perKill: 100, perDamage: 10 },
  thresholds: [2600, 3800, 5000, 6200, 7400, 8600, 10000],

  start(api) {
    for (let i = 0; i < ALIVE; i++) this._spawnOne(api, i === 0 ? -1 : 1);
  },

  onTargetKilled(api, target) {
    // Respawn on the dead target's half — one orb per half, every kill forces a flick.
    this._spawnOne(api, target.data.half);
  },

  _spawnOne(api, half) {
    api.spawn({
      data: { half },
      pos: { x: api.rand(2, 9) * half, y: api.rand(2, 6), z: -18 },
      radius: 0.85,
      hp: HP,
      move: {
        type: 'strafe',
        axis: 'x',
        range: half === -1 ? [-10.5, -0.5] : [0.5, 10.5],
        speedMin: 3,
        speedMax: 6.5,
        switchMin: 0.35,
        switchMax: 1.0,
        accel: 35,
      },
    });
  },
};
