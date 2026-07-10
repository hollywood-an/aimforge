// Benchmark: a fixed gauntlet of six scenarios, one per core skill. Each stage's score
// maps to a tier via the scenario's thresholds; the overall rank is the average.

export const BENCH_STAGES = [
  'gridshot',
  'microshot',
  'smooth-tracking',
  'strafebot',
  'speed-switch',
  'reflex-flick',
];

export const RANKS = [
  { name: 'Bronze', color: '#cd7f32' },
  { name: 'Silver', color: '#b8c4cf' },
  { name: 'Gold', color: '#ffd24a' },
  { name: 'Platinum', color: '#4ae3c8' },
  { name: 'Diamond', color: '#4ab7ff' },
  { name: 'Master', color: '#c07cff' },
  { name: 'Grandmaster', color: '#ff4a6e' },
];

/**
 * Tier index for a score against a scenario's thresholds.
 * Returns -1 (below Bronze) through 6 (Grandmaster).
 * `timeScale` normalizes scores from shortened/lengthened runs.
 */
export function tierIndex(def, score, timeScale = 1) {
  if (!def?.thresholds?.length) return -1;
  const eff = timeScale > 0 ? score / timeScale : score;
  let idx = -1;
  for (let i = 0; i < def.thresholds.length; i++) {
    if (eff >= def.thresholds[i]) idx = i;
  }
  return idx;
}

export function tierFor(def, score, timeScale = 1) {
  const i = tierIndex(def, score, timeScale);
  return i >= 0 ? RANKS[i] : null;
}

/** Aggregate stage results -> overall benchmark rank. */
export function computeBench(stageResults) {
  // Points: below Bronze = 0, Bronze = 1 ... Grandmaster = 7.
  const pts = stageResults.map((s) => s.tierIdx + 1);
  const avg = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
  const overallIdx = Math.round(avg) - 1;
  return {
    points: Math.round(avg * 100) / 100,
    rankIdx: overallIdx,
    rank: overallIdx >= 0 ? RANKS[Math.min(overallIdx, RANKS.length - 1)].name : 'Unranked',
    color: overallIdx >= 0 ? RANKS[Math.min(overallIdx, RANKS.length - 1)].color : '#8892a6',
  };
}
