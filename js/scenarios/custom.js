// Custom — a build-your-own drill. All parameters come from api.opts.custom,
// set by the form on the briefing screen (see ui.js).

export const CUSTOM_DEFAULTS = {
  count: 3, // simultaneous targets
  radius: 0.8, // target size
  hp: 1,
  speed: 0, // 0 = static, otherwise strafe speed (m/s)
  distance: 30, // spawn distance in meters (12..30)
  spread: 10, // horizontal spawn half-width
  lifetime: 0, // 0 = forever, otherwise seconds before it vanishes
  weapon: 'semi', // 'semi' | 'auto' | 'beam'
  duration: 60,
};

export default {
  id: 'custom',
  name: 'Custom Drill',
  category: 'special',
  description: 'Your targets, your rules — size, count, speed, range and weapon are all yours.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100, trackingPerSecond: 500 },
  thresholds: [2000, 4000, 6000, 8000, 10000, 12500, 15000],

  start(api) {
    const c = { ...CUSTOM_DEFAULTS, ...(api.opts.custom || {}) };
    // Defensive clamps (the form clamps too, but opts are caller-supplied).
    c.count = Math.min(6, Math.max(1, c.count));
    c.radius = Math.min(2, Math.max(0.2, c.radius));
    c.spread = Math.min(13, Math.max(1, c.spread));
    c.speed = Math.min(12, Math.max(0, c.speed));
    this._cfg = c;
    const n = c.weapon === 'beam' ? 1 : c.count;
    for (let i = 0; i < n; i++) this._spawnOne(api);
  },

  onTargetKilled(api) {
    this._spawnOne(api);
  },

  _spawnOne(api) {
    const c = this._cfg;
    const z = -Math.max(8, Math.min(30, c.distance));
    const beam = c.weapon === 'beam';
    const pos = api.wallPoint({
      xRange: c.spread,
      yMin: Math.max(0.5, 1.5 - (30 + z) * 0.03),
      yMax: beam ? 5 : 8.5,
      z,
      minDist: c.radius * 2.4,
    });
    api.spawn({
      pos,
      radius: c.radius,
      hp: beam ? Infinity : c.hp,
      lifetime: c.lifetime > 0 ? c.lifetime : 0,
      onExpire: c.lifetime > 0 ? () => this._spawnOne(api) : undefined,
      move:
        c.speed > 0
          ? {
              type: 'strafe',
              axis: 'x',
              range: [Math.max(-14, pos.x - 4), Math.min(14, pos.x + 4)],
              speedMin: c.speed * 0.6,
              speedMax: c.speed,
              switchMin: 0.3,
              switchMax: 1.0,
              accel: Math.max(20, c.speed * 5),
            }
          : null,
    });
  },
};
