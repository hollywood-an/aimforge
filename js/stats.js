// Run history, personal bests, and benchmark results — all in localStorage.

const RUNS_KEY = 'af_runs_v1';
const BENCH_KEY = 'af_bench_v1';
const MAX_RUNS_PER_SCENARIO = 200;

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota/private mode — history just won't persist */
  }
}

export function saveRun(run) {
  const all = load(RUNS_KEY, {});
  const list = all[run.scenarioId] || (all[run.scenarioId] = []);
  list.push(run);
  if (list.length > MAX_RUNS_PER_SCENARIO) list.splice(0, list.length - MAX_RUNS_PER_SCENARIO);
  store(RUNS_KEY, all);
}

export function getRuns(scenarioId) {
  return load(RUNS_KEY, {})[scenarioId] || [];
}

/** Score normalized to a standard-length run, so 0.5x/2x runs stay comparable. */
export function normScore(run) {
  return run.score / (run.timeScale || 1);
}

export function getPB(scenarioId) {
  const runs = getRuns(scenarioId);
  if (!runs.length) return null;
  return runs.reduce((best, r) => (normScore(r) > normScore(best) ? r : best));
}

export function totals() {
  const all = load(RUNS_KEY, {});
  let runs = 0, kills = 0, shots = 0, hits = 0, seconds = 0;
  for (const list of Object.values(all)) {
    for (const r of list) {
      runs++;
      kills += r.kills || 0;
      shots += r.shots || 0;
      hits += r.hits || 0;
      seconds += r.duration || 0;
    }
  }
  return { runs, kills, shots, hits, seconds };
}

export function saveBench(result) {
  const all = load(BENCH_KEY, []);
  all.push(result);
  store(BENCH_KEY, all);
}

export function getBestBench() {
  const all = load(BENCH_KEY, []);
  if (!all.length) return null;
  return all.reduce((best, b) => (b.points > best.points ? b : best));
}

export function clearAllData() {
  localStorage.removeItem(RUNS_KEY);
  localStorage.removeItem(BENCH_KEY);
}
