// Air Tracking — one orb weaving through open air on a smooth 3D lissajous path.
// Trains vertical + horizontal tracking at once. Score accrues only while the beam is on target.

export default {
  id: 'air-tracking',
  name: 'Air Tracking',
  category: 'tracking',
  description: 'Hold fire on an orb swooping through the air in all three axes. Never let go.',
  duration: 60,
  weapon: { mode: 'beam' },
  scoring: { trackingPerSecond: 500 },
  // Max possible = 500/s * 60s = 30000; thresholds are % time-on-target tiers.
  thresholds: [11000, 14000, 17000, 20000, 23000, 25500, 27500],

  start(api) {
    api.spawn({
      pos: { x: 0, y: 5, z: -20 },
      radius: 1.0,
      hp: Infinity,
      move: {
        type: 'lissajous',
        center: { x: 0, y: 5, z: -20 },
        amp: { x: 7, y: 2.8, z: 4 },
        freq: { x: 0.38, y: 0.55, z: 0.27 },
      },
    });
  },
};
