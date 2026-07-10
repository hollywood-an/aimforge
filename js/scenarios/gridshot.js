// Gridshot — the classic: 3 static orbs on the wall, kill one and another appears.
// Trains raw click-timing flicks and target selection.

const RADIUS = 0.9;
const ALIVE = 3;

export default {
  id: 'gridshot',
  name: 'Gridshot',
  category: 'flicking',
  description: 'Three static orbs at all times. Destroy one, another appears. Pure speed flicking.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  thresholds: [4500, 6500, 8500, 10500, 12500, 14500, 17000],

  start(api) {
    for (let i = 0; i < ALIVE; i++) this._spawnOne(api);
  },

  onTargetKilled(api) {
    this._spawnOne(api);
  },

  _spawnOne(api) {
    api.spawn({
      pos: api.wallPoint({ xRange: 10, yMin: 1.5, yMax: 8.5, minDist: RADIUS * 2.6 }),
      radius: RADIUS,
    });
  },
};
