// Headhunter — two humanoid bots strafe slowly at mid range; only the head scores.
// The body is a decoy that punishes lazy crosshair placement. Pure headshot discipline.

const BODY_RADIUS = 0.5;
const BODY_HEIGHT = 1.6;
const BODY_Y = 1.05;                // capsule center: feet ~0.25, shoulders ~1.85
const BODY_COLOR = 0x2a3550;
const HEAD_RADIUS = 0.42;
const HEAD_Y = BODY_Y + BODY_HEIGHT / 2 + HEAD_RADIUS * 0.6; // ~2.1, sits on the body
const BOT_Z = -22;
const BOTS = 2;

export default {
  id: 'headhunter',
  name: 'Headhunter',
  category: 'precision',
  description: 'Two slow-strafing bots. Only the head counts — body shots are misses.',
  duration: 60,
  weapon: { mode: 'semi' },
  scoring: { perKill: 100 },
  thresholds: [2500, 3500, 4500, 5500, 6500, 7800, 9000],

  start(api) {
    for (let i = 0; i < BOTS; i++) this._spawnBot(api, i === 0 ? -1 : 1);
  },

  onTargetKilled(api, target) {
    // The head died: remove its body silently, then field a fresh bot on the same half.
    target.data.body.kill(false);
    this._spawnBot(api, target.data.half);
  },

  _spawnBot(api, half) {
    const spawnX = api.rand(2, 9) * half;
    const body = api.spawn({
      pos: { x: spawnX, y: BODY_Y, z: BOT_Z },
      shape: 'capsule',
      radius: BODY_RADIUS,
      height: BODY_HEIGHT,
      hp: Infinity,
      decoy: true,
      color: BODY_COLOR,
      move: {
        type: 'strafe',
        axis: 'x',
        range: [Math.max(spawnX - 2.5, -10), Math.min(spawnX + 2.5, 10)],
        speedMin: 1,
        speedMax: 2.5,
        switchMin: 0.8,
        switchMax: 1.8,
        accel: 15,
      },
    });
    api.spawn({
      pos: { x: spawnX, y: HEAD_Y, z: BOT_Z },
      radius: HEAD_RADIUS,
      hp: 1,
      data: { body, half },
      move: {
        type: 'custom',
        // Ride the body: copy its x/z every frame, keep head height fixed.
        fn: (head) => {
          head.pos.x = head.data.body.pos.x;
          head.pos.z = head.data.body.pos.z;
        },
      },
    });
  },
};
