// Strafebot — one capsule strafing at full sprint with brutal direction switches and hops.
// The hardest tracking test: pure reactive control, no rhythm to lean on.

export default {
  id: 'strafebot',
  name: 'Strafebot',
  category: 'tracking',
  description: 'A capsule strafes hard, jukes, and hops. React to every switch — beam time is score.',
  duration: 60,
  weapon: { mode: 'beam' },
  scoring: { trackingPerSecond: 500 },
  // Max possible = 500/s * 60s = 30000; the violent switches make high uptime brutal.
  thresholds: [8000, 11000, 14000, 17000, 20000, 23000, 26000],

  start(api) {
    api.spawn({
      pos: { x: 0, y: 1.55, z: -16 },
      shape: 'capsule',
      radius: 0.55,
      height: 2.2,
      hp: Infinity,
      move: {
        type: 'strafe',
        axis: 'x',
        range: [-9, 9],
        speedMin: 7,
        speedMax: 13,
        switchMin: 0.2,
        switchMax: 0.6,
        accel: 55,
        jump: { chance: 0.25, vy: 5, gravity: 13 },
      },
    });
  },
};
