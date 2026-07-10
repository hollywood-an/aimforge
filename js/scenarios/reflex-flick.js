// Reflex Flick — screen is empty; a single orb appears at a random offset after a
// random delay. Hit it fast. Measures and rewards raw reaction + flick speed.

const TARGET_RADIUS = 0.8;
const TARGET_LIFETIME = 1.2;   // seconds before it vanishes and counts against you
const DELAY_MIN = 0.6;
const DELAY_MAX = 1.6;

export default {
  id: 'reflex-flick',
  name: 'Reflex Flick',
  category: 'reflex',
  description: 'One orb pops up at a random spot — kill it before it vanishes. Speed is scored.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  // Cycle math: ~1.1s average dead time between targets caps kills/min hard;
  // GM here = ~400ms average spawn-to-kill, which is elite but human.
  thresholds: [2500, 3500, 4500, 5500, 6500, 7800, 9000],

  start(api) {
    this._delay = api.rand(DELAY_MIN, DELAY_MAX);
    this._spawned = 0;
    this._expired = 0;
    this._reactions = [];
  },

  tick(api, dt) {
    if (api.targets.length > 0) return;
    this._delay -= dt;
    if (this._delay <= 0) {
      this._spawned++;
      api.spawn({
        pos: api.wallPoint({ xRange: 9, yMin: 1.5, yMax: 8 }),
        radius: TARGET_RADIUS,
        lifetime: TARGET_LIFETIME,
        onExpire: () => {
          this._expired++;
          api.setStat('Missed targets', this._expired);
          this._delay = api.rand(DELAY_MIN, DELAY_MAX);
        },
      });
    }
  },

  onTargetKilled(api, target) {
    const ms = target.age * 1000;
    this._reactions.push(ms);
    // Speed bonus: up to +200 for a sub-150 ms kill, fading to 0 at 900 ms.
    api.addScore(Math.round(Math.max(0, Math.min(200, (200 * (900 - ms)) / 750))));
    const sorted = [...this._reactions].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    api.setStat('Median reaction', `${Math.round(median)} ms`);
    api.setStat('Best reaction', `${Math.round(sorted[0])} ms`);
    this._delay = api.rand(DELAY_MIN, DELAY_MAX);
  },
};
