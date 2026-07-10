// Scenario registry. Order within a category = display order on the menu.

import gridshot from './gridshot.js';
import sixshot from './sixshot.js';
import motionshot from './motionshot.js';
import popcorn from './popcorn.js';
import microshot from './microshot.js';
import longshots from './longshots.js';
import headhunter from './headhunter.js';
import smoothTracking from './smooth-tracking.js';
import airTracking from './air-tracking.js';
import strafebot from './strafebot.js';
import speedSwitch from './speed-switch.js';
import multiswitch from './multiswitch.js';
import reflexFlick from './reflex-flick.js';
import custom from './custom.js';

export const CATEGORIES = [
  { id: 'flicking', name: 'Flicking' },
  { id: 'precision', name: 'Precision' },
  { id: 'tracking', name: 'Tracking' },
  { id: 'switching', name: 'Switching' },
  { id: 'reflex', name: 'Reflex' },
  { id: 'special', name: 'Special' },
];

export const SCENARIOS = [
  gridshot,
  sixshot,
  motionshot,
  popcorn,
  microshot,
  longshots,
  headhunter,
  smoothTracking,
  airTracking,
  strafebot,
  speedSwitch,
  multiswitch,
  reflexFlick,
  custom,
];

export const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
