// Static checks: (1) node --check every first-party script; (2) the service
// worker's precache list must exactly match the deployable files on disk.
// Usage: node tests/check.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failed = false;

// ---- 1. Syntax pass -------------------------------------------------------
const scripts = [];
const collect = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) collect(rel);
    else if (/\.(js|mjs)$/.test(e.name)) scripts.push(rel);
  }
};
collect('js');
collect('tests');
if (fs.existsSync(path.join(ROOT, 'sw.js'))) scripts.push('sw.js');

let bad = 0;
for (const rel of scripts) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.error(`SYNTAX FAIL ${rel}\n${e.stderr}`);
  }
}
console.log(`syntax: ${scripts.length - bad}/${scripts.length} files OK`);
if (bad) failed = true;

// ---- 2. Service-worker precache assertion ---------------------------------
// sw.js keeps its precache list as strict JSON between // <precache> markers;
// this check diffs it (both directions) against the files actually on disk so
// the list can never silently rot in a no-build repo.
const swPath = path.join(ROOT, 'sw.js');
if (!fs.existsSync(swPath)) {
  console.warn('precache: sw.js not present yet — assertion skipped');
} else {
  const src = fs.readFileSync(swPath, 'utf8');
  const m = src.match(/\/\/ <precache>([\s\S]*?)\/\/ <\/precache>/);
  if (!m) {
    console.error('precache: sw.js is missing the // <precache> ... // </precache> markers');
    failed = true;
  } else {
    let listed = null;
    try {
      listed = JSON.parse(`[${m[1].trim().replace(/,\s*$/, '')}]`);
    } catch (e) {
      console.error(`precache: list between markers is not strict JSON — ${e.message}`);
      failed = true;
    }
    if (listed) {
      const expected = new Set(['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'vendor/three.module.js']);
      const glob = (dir, re) => {
        if (!fs.existsSync(path.join(ROOT, dir))) return;
        for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) glob(rel, re);
          else if (re.test(e.name)) expected.add(rel);
        }
      };
      glob('js', /\.js$/);
      glob('vendor/fonts', /\.woff2$/);
      glob('assets', /\.(webp|png|svg)$/);
      const listedSet = new Set(listed);
      const missing = [...expected].filter((f) => !listedSet.has(f));
      const stale = [...listedSet].filter((f) => !expected.has(f));
      if (missing.length) console.error(`precache: MISSING from sw.js list:\n  ${missing.join('\n  ')}`);
      if (stale.length) console.error(`precache: STALE in sw.js list (not on disk):\n  ${stale.join('\n  ')}`);
      if (missing.length || stale.length) failed = true;
      else console.log(`precache: ${listed.length} entries match disk`);
    }
  }
}

process.exit(failed ? 1 : 0);
