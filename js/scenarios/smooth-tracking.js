// Smooth Tracking — one large close-range orb strafing left/right.
// Trains steady, uninterrupted mouse control. Score accrues only while the beam is on target.

export default {
  id: 'smooth-tracking',
  name: 'Smooth Tracking',
  category: 'tracking',
  description: 'Hold fire on a smoothly strafing orb. Stay glued to it — time on target is everything.',
  duration: 60,
  weapon: { mode: 'beam' },
  scoring: { trackingPerSecond: 500 },
  // Max possible = 500/s * 60s = 30000; thresholds are % time-on-target tiers.
  thresholds: [12000, 15000, 18000, 21000, 24000, 26400, 28200],

  start(api) {
    api.spawn({
      pos: { x: 0, y: 2.4, z: -12 },
      radius: 1.25,
      hp: Infinity,
      move: {
        type: 'strafe',
        axis: 'x',
        range: [-8, 8],
        speedMin: 4.5,
        speedMax: 9,
        switchMin: 0.4,
        switchMax: 1.2,
        accel: 30,
      },
    });
  },
};
