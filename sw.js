// AimForge service worker: precache the whole app so it installs and plays
// offline. RELEASE DISCIPLINE: bump VERSION whenever ANY cached file changes —
// the list below is asserted against the repo by `npm run check`, but only a
// VERSION bump makes installed clients refetch changed file contents.
// The list between the <precache> markers is strict JSON (double quotes, no
// trailing comma on the last entry) so the check script can parse it.
const VERSION = 'v2';
const CACHE = `aimforge-${VERSION}`;
const PRECACHE = [
  // <precache>
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "vendor/three.module.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512-maskable.png",
  "assets/icons/icon-512.png",
  "assets/thumbs/air-tracking.webp",
  "assets/thumbs/custom.webp",
  "assets/thumbs/gridshot.webp",
  "assets/thumbs/headhunter.webp",
  "assets/thumbs/longshots.webp",
  "assets/thumbs/microshot.webp",
  "assets/thumbs/motionshot.webp",
  "assets/thumbs/multiswitch.webp",
  "assets/thumbs/popcorn.webp",
  "assets/thumbs/reflex-flick.webp",
  "assets/thumbs/sixshot.webp",
  "assets/thumbs/smooth-tracking.webp",
  "assets/thumbs/speed-switch.webp",
  "assets/thumbs/strafebot.webp",
  "js/audio.js",
  "js/benchmark.js",
  "js/calibrate.js",
  "js/engine.js",
  "js/game.js",
  "js/hud.js",
  "js/icons.js",
  "js/input.js",
  "js/main.js",
  "js/rng.js",
  "js/scenarios/air-tracking.js",
  "js/scenarios/custom.js",
  "js/scenarios/gridshot.js",
  "js/scenarios/headhunter.js",
  "js/scenarios/index.js",
  "js/scenarios/longshots.js",
  "js/scenarios/microshot.js",
  "js/scenarios/motionshot.js",
  "js/scenarios/multiswitch.js",
  "js/scenarios/popcorn.js",
  "js/scenarios/reflex-flick.js",
  "js/scenarios/sixshot.js",
  "js/scenarios/smooth-tracking.js",
  "js/scenarios/speed-switch.js",
  "js/scenarios/strafebot.js",
  "js/settings.js",
  "js/stats.js",
  "js/targets.js",
  "js/ui.js",
  "vendor/fonts/rajdhani-400.woff2",
  "vendor/fonts/rajdhani-500.woff2",
  "vendor/fonts/rajdhani-600.woff2",
  "vendor/fonts/rajdhani-700.woff2"
  // </precache>
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('aimforge-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Navigations: network-first so fresh deploys win; cached shell offline
  // (covers /?c=... challenge URLs too — the shell parses the query itself).
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  // Statics: cache-first; anything fetched from the network lands in the
  // versioned cache so repeat visits are fully local.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
