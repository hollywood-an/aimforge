// Motionshot — gridshot's moving cousin: 3 slowly strafing orbs on the wall.
// Trains clicking targets that won't sit still — read the drift, lead it, click.

const RADIUS = 0.8;
const ALIVE = 3;
const STRAFE_SPAN = 3;   // orbs wander ± this far on x from their spawn point
const X_LIMIT = 11;      // strafe range never leaves [-11, 11]

export default {
  id: 'motionshot',
  name: 'Motionshot',
  category: 'flicking',
  description: 'Three drifting orbs at all times. Destroy one, another appears — but nothing holds still.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  thresholds: [4000, 5500, 7000, 8500, 10000, 12000, 14000],

  start(api) {
    for (let i = 0; i < ALIVE; i++) this._spawnOne(api);
  },

  onTargetKilled(api) {
    this._spawnOne(api);
  },

  _spawnOne(api) {
    const pos = api.wallPoint({ xRange: 9, yMin: 1.5, yMax: 8, minDist: 2.2 });
    api.spawn({
      pos,
      radius: RADIUS,
      move: {
        type: 'strafe',
        axis: 'x',
        range: [
          Math.max(-X_LIMIT, pos.x - STRAFE_SPAN),
          Math.min(X_LIMIT, pos.x + STRAFE_SPAN),
        ],
        speedMin: 1.5,
        speedMax: 3.5,
        switchMin: 0.6,
        switchMax: 1.5,
        accel: 20,
      },
    });
  },
};
