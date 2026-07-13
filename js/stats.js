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

// ---- Backup / restore -------------------------------------------------------

const BACKUP_KEYS = ['af_settings_v1', RUNS_KEY, BENCH_KEY, 'af_custom_v1', 'af_last_v1'];
const RAW_KEYS = new Set(['af_last_v1']); // stored as a bare string, not JSON

export function exportData() {
  const data = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    if (RAW_KEYS.has(key)) {
      data[key] = raw;
    } else {
      try {
        data[key] = JSON.parse(raw);
      } catch {
        /* corrupt entry — leave it out of the backup */
      }
    }
  }
  return { app: 'aimforge', version: 1, exportedAt: new Date().toISOString(), data };
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Throws with a human message if the payload isn't a usable backup; returns
 *  { runs, benches } counts for confirmation copy. Never touches storage. */
export function validateBackup(payload) {
  if (!isObj(payload) || !isObj(payload.data)) throw new Error('Not an AimForge backup file.');
  if (payload.version !== 1) throw new Error('Backup is from a newer AimForge version.');
  const data = payload.data;
  const present = BACKUP_KEYS.filter((k) => data[k] !== undefined);
  if (!present.length) throw new Error('Backup contains no AimForge data.');
  const shapeOk = {
    af_settings_v1: isObj,
    [RUNS_KEY]: (v) => isObj(v) && Object.values(v).every(Array.isArray),
    [BENCH_KEY]: Array.isArray,
    af_custom_v1: isObj,
    af_last_v1: (v) => typeof v === 'string',
  };
  for (const k of present) {
    if (!shapeOk[k](data[k])) throw new Error(`Backup field ${k} has the wrong shape.`);
  }
  let runs = 0;
  for (const list of Object.values(data[RUNS_KEY] || {})) runs += list.length;
  return { runs, benches: (data[BENCH_KEY] || []).length };
}

/**
 * Replace all AimForge data with the backup's (keys absent from the backup are
 * removed). All-or-nothing: validates first, and rolls the previous values
 * back if a write fails midway (quota). Callers should reload afterwards —
 * every module hydrates from localStorage at construction.
 */
export function importData(payload) {
  const counts = validateBackup(payload);
  const data = payload.data;
  const snapshot = BACKUP_KEYS.map((k) => [k, localStorage.getItem(k)]);
  try {
    for (const k of BACKUP_KEYS) {
      if (data[k] === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, RAW_KEYS.has(k) ? data[k] : JSON.stringify(data[k]));
    }
  } catch {
    for (const [k, v] of snapshot) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
    throw new Error('Restore failed mid-write (storage full?). Nothing was changed.');
  }
  return counts;
}
