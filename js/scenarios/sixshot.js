// Sixshot — waves of six static orbs scattered edge to edge across the wall.
// Clear all six to summon the next wave. Trains wide, committed flicks and routing.

const RADIUS = 0.75;
const WAVE_SIZE = 6;

export default {
  id: 'sixshot',
  name: 'Sixshot',
  category: 'flicking',
  description: 'Six orbs spread wall to wall. Clear every one to spawn the next wave. Flick wide, flick fast.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  thresholds: [5000, 6500, 8000, 9500, 11000, 13000, 15000],

  start(api) {
    this._remaining = 0;
    this._wavesCleared = 0;
    this._spawnWave(api);
  },

  onTargetKilled(api) {
    this._remaining--;
    if (this._remaining <= 0) {
      this._wavesCleared++;
      api.setStat('Waves cleared', this._wavesCleared);
      this._spawnWave(api);
    }
  },

  _spawnWave(api) {
    this._remaining = WAVE_SIZE;
    for (let i = 0; i < WAVE_SIZE; i++) {
      api.spawn({
        pos: api.wallPoint({ xRange: 10.5, yMin: 1.5, yMax: 8.5, minDist: 2.2 }),
        radius: RADIUS,
      });
    }
  },
};
