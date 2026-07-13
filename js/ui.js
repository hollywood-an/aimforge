// All menu/overlay DOM: main menu, briefing, pause, results, settings, stats, benchmark.

import { settings, GAMES } from './settings.js';
import { audio } from './audio.js';
import { crosshairSVG } from './hud.js';
import { icon, hydrateIcons } from './icons.js';
import { SCENARIOS, CATEGORIES, byId } from './scenarios/index.js';
import { CUSTOM_DEFAULTS } from './scenarios/custom.js';
import { BENCH_STAGES, RANKS, tierFor, tierIndex, computeBench } from './benchmark.js';
import {
  getPB, getRuns, totals, saveBench, getBestBench, clearAllData, normScore,
  exportData, validateBackup, importData,
} from './stats.js';
import { seedToString } from './rng.js';

const CUSTOM_KEY = 'af_custom_v1';
const LAST_KEY = 'af_last_v1'; // non-frozen: remembers last-played scenario for warm-up

// key, label, min, max, step, group, hint — clamping in _collectCustom uses the same bounds.
const CUSTOM_FIELDS = [
  ['count', 'Targets', 1, 6, 1, 'Targets', ''],
  ['radius', 'Size (m)', 0.2, 2, 0.05, 'Targets', ''],
  ['hp', 'Hits to kill', 1, 10, 1, 'Targets', ''],
  ['speed', 'Speed (m/s)', 0, 12, 0.5, 'Movement', '0 = static'],
  ['spread', 'Spread', 2, 13, 1, 'Movement', 'spawn area width'],
  ['lifetime', 'Lifetime (s)', 0, 5, 0.5, 'Movement', '0 = stays forever'],
  ['distance', 'Distance (m)', 10, 30, 1, 'Session', ''],
  ['duration', 'Run length (s)', 15, 180, 15, 'Session', ''],
];

const CUSTOM_PRESETS = {
  Flick: { count: 3, radius: 0.9, hp: 1, speed: 0, spread: 11, lifetime: 0, distance: 22, duration: 60, weapon: 'semi' },
  Track: { count: 1, radius: 0.8, hp: 1, speed: 7, spread: 8, lifetime: 0, distance: 20, duration: 60, weapon: 'beam' },
  Micro: { count: 3, radius: 0.35, hp: 1, speed: 0, spread: 5, lifetime: 0, distance: 26, duration: 60, weapon: 'semi' },
};

function el(id) {
  return document.getElementById(id);
}

function mk(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function fmt(n) {
  return Math.round(n).toLocaleString();
}

/** rgba() string from a #hex color at the given alpha. */
function hexA(hex, a) {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function reduceMotion() {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function tierChip(def, score, timeScale = 1) {
  // Custom drills have no comparable ladder — every config is different.
  if (!def || def.id === 'custom') return '';
  const t = tierFor(def, score, timeScale);
  if (!t) return `<span class="chip dim">Unranked</span>`;
  // Tinted background (not a colored border) so metadata doesn't read as interactive.
  return `<span class="chip tier" style="color:${t.color};background:${hexA(t.color, 0.16)}">${t.name}</span>`;
}

/** The next tier above the current score, if any, with the actual score it needs. */
function nextTierInfo(def, score, timeScale = 1) {
  if (!def?.thresholds?.length || def.id === 'custom') return null;
  const eff = timeScale > 0 ? score / timeScale : score;
  for (let i = 0; i < def.thresholds.length; i++) {
    if (eff < def.thresholds[i]) {
      return { name: RANKS[i].name, needs: Math.round(def.thresholds[i] * (timeScale > 0 ? timeScale : 1)) };
    }
  }
  return null; // already at the top tier
}

/** Format a custom-drill slider readout. */
function cfReadout(key, v, step) {
  v = Number(v);
  if (key === 'lifetime' && v === 0) return '∞';
  if (key === 'speed' && v === 0) return 'static';
  const dec = step < 1 ? String(step).split('.')[1]?.length || 1 : 0;
  return v.toFixed(dec);
}

/** Size a canvas for device pixel ratio; returns a 2d context scaled to CSS pixels. */
function ctx2d(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 100;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}

function drawTimeline(canvas, timeline, duration) {
  const { g, w, h } = ctx2d(canvas);
  g.clearRect(0, 0, w, h);
  if (!timeline || timeline.length < 2) return;
  const max = Math.max(...timeline, 1);
  const pad = 6;
  const padBottom = 15; // room for the x-axis labels
  const baseY = h - padBottom;
  g.strokeStyle = '#00ffd0';
  g.lineWidth = 2;
  g.beginPath();
  timeline.forEach((v, i) => {
    const x = pad + (i / (timeline.length - 1)) * (w - pad * 2);
    const y = baseY - (v / max) * (baseY - pad);
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  });
  g.stroke();
  g.fillStyle = 'rgba(0,255,208,0.08)';
  g.lineTo(w - pad, baseY);
  g.lineTo(pad, baseY);
  g.fill();
  // Minimal end labels so a 15s run reads differently from a 60s run.
  const dur = Math.round(duration || timeline.length - 1);
  g.font = '10px Rajdhani, sans-serif';
  g.fillStyle = 'rgba(136,146,166,0.9)';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillText('0s', pad, h - 3);
  g.textAlign = 'right';
  g.fillText(`${dur}s`, w - pad, h - 3);
  // Peak-score label at top-left: the score line climbs bottom-left → top-right,
  // so this corner is clear and the label never collides with the stroke.
  g.fillStyle = 'rgba(0,255,208,0.9)';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(fmt(max), pad, 2);
}

function drawHistory(canvas, scores, currentIdx, pb) {
  const { g, w, h } = ctx2d(canvas);
  g.clearRect(0, 0, w, h);
  if (!scores.length) return;
  const max = Math.max(...scores, pb || 0, 1);
  const pad = 6;
  const bw = Math.min(22, (w - pad * 2) / scores.length - 3);
  scores.forEach((v, i) => {
    const x = pad + (i / scores.length) * (w - pad * 2) + 1;
    const bh = Math.max(2, (v / max) * (h - pad * 2));
    g.fillStyle = i === currentIdx ? '#00ffd0' : 'rgba(136,146,166,0.45)';
    g.fillRect(x, h - pad - bh, bw, bh);
  });
  if (pb > 0) {
    const pbY = h - pad - (pb / max) * (h - pad * 2);
    g.strokeStyle = 'rgba(255,210,74,0.7)';
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(pad, pbY);
    g.lineTo(w - pad, pbY);
    g.stroke();
    g.setLineDash([]);
  }
}

function sparkline(canvas, scores) {
  const { g, w, h } = ctx2d(canvas);
  g.clearRect(0, 0, w, h);
  if (scores.length < 2) {
    g.fillStyle = 'rgba(136,146,166,0.5)';
    g.fillRect(0, h / 2, w, 1);
    return;
  }
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores);
  const range = Math.max(1, max - min);
  g.strokeStyle = '#4ab7ff';
  g.lineWidth = 1.5;
  g.beginPath();
  scores.forEach((v, i) => {
    const x = (i / (scores.length - 1)) * w;
    const y = h - 2 - ((v - min) / range) * (h - 4);
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  });
  g.stroke();
}

const WEAPON_LABEL = { semi: 'Semi — 1 shot per click', auto: 'Auto — hold to fire', beam: 'Beam — hold on target' };

export class UI {
  constructor(game, hud) {
    this.game = game;
    this.hud = hud;
    this._bench = null;
    this._briefDef = null;

    this.screens = {};
    for (const s of document.querySelectorAll('.screen')) this.screens[s.id] = s;

    hydrateIcons(); // fill the static [data-icon] placeholders with inline SVG
    this._buildMenu();
    this._buildSettings();
    this._bindStatic();
    window.addEventListener('resize', () => this._updateMenuFade());
    this.showMenu();
  }

  // ---- generic screen plumbing --------------------------------------------

  _show(id) {
    for (const s of Object.values(this.screens)) s.classList.toggle('hidden', s.id !== id);
    el('screens').classList.remove('hidden');
    // Anchor keyboard / screen-reader focus on the new panel's heading.
    const scr = this.screens[id];
    if (!scr) return;
    const heads = [...scr.querySelectorAll('h1, h2')];
    const heading = heads.find((h) => h.offsetParent !== null) || heads[0];
    if (heading) {
      heading.tabIndex = -1;
      try {
        heading.focus({ preventScroll: true });
      } catch {
        heading.focus();
      }
    }
  }

  hideAll() {
    el('screens').classList.add('hidden');
  }

  canRetryFromResults() {
    return !this._bench;
  }

  _toast(msg, ms = 1800) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('visible'), ms);
  }

  // ---- main menu -----------------------------------------------------------

  _buildMenu() {
    const tabs = el('menu-tabs');
    tabs.innerHTML = '';
    const allTab = mk('button', 'tab active', 'All');
    allTab.dataset.cat = 'all';
    allTab.setAttribute('aria-pressed', 'true');
    tabs.append(allTab);
    for (const c of CATEGORIES) {
      const t = mk('button', 'tab', c.name);
      t.dataset.cat = c.id;
      t.setAttribute('aria-pressed', 'false');
      tabs.append(t);
    }
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      if (e.detail > 0) btn.blur();
      audio.ui();
      tabs.querySelectorAll('.tab').forEach((t) => {
        const on = t === btn;
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      this._filterCards(btn.dataset.cat);
    });

    // Cards grouped under inline category section headers.
    const grid = el('menu-cards');
    grid.innerHTML = '';
    for (const c of CATEGORIES) {
      const inCat = SCENARIOS.filter((d) => d.category === c.id);
      if (!inCat.length) continue;
      const head = mk('div', 'cards-section', c.name);
      head.dataset.section = c.id;
      grid.append(head);
      for (const def of inCat) {
        const card = mk('button', 'card');
        card.dataset.cat = def.category;
        card.dataset.id = def.id;
        grid.append(card);
        card.addEventListener('click', (e) => {
          if (e.detail > 0) e.currentTarget.blur(); // mouse only; keyboard keeps focus
          audio.ui();
          this.showBrief(def);
        });
      }
    }
    this._refreshCards();
  }

  _refreshCards() {
    for (const card of el('menu-cards').querySelectorAll('.card')) {
      const def = byId[card.dataset.id];
      const pb = getPB(def.id);
      const pbTxt = pb ? `PB ${fmt(normScore(pb))}` : '— no PB yet';
      const starter = def.id === 'gridshot' && !pb ? '<span class="starter-badge">Start here</span>' : '';
      card.innerHTML = `
        <span class="card-top"><span class="card-name">${def.name}</span>${starter}</span>
        <span class="card-thumb"><img src="assets/thumbs/${def.id}.webp" width="600" height="240"
          alt="" loading="lazy" decoding="async"
          onerror="this.parentElement.style.display='none'"></span>
        <span class="card-desc">${def.description}</span>
        <span class="card-bottom">
          <span class="card-pb${pb ? '' : ' none'}">${pbTxt}</span>
          ${pb ? tierChip(def, pb.score, pb.timeScale ?? 1) : ''}
        </span>`;
      card.setAttribute(
        'aria-label',
        `${def.name}. ${pb ? `Personal best ${fmt(normScore(pb))}.` : 'No personal best yet.'} ${def.description}`
      );
    }
    const best = getBestBench();
    el('menu-bench-rank').innerHTML = best
      ? `Best rank: <span style="color:${best.color}">${best.rank}</span>`
      : 'Six stages · one rank';
  }

  _refreshFirstRun() {
    const anyRuns = totals().runs > 0;
    const banner = el('menu-firstrun');
    if (!anyRuns) {
      banner.innerHTML =
        '<span class="fr-text"><b>New to aim training?</b> Start with Gridshot: three static orbs, pure clicking.' +
        '<small>It teaches the core flick before anything else.</small></span>';
      const btn = mk('button', 'btn accent sm', `${icon('play')} Start Gridshot`);
      btn.addEventListener('click', (e) => {
        if (e.detail > 0) e.currentTarget.blur();
        audio.ui();
        this.showBrief(byId.gridshot);
      });
      banner.append(btn);
      banner.classList.remove('hidden');
    } else {
      banner.innerHTML = '';
      banner.classList.add('hidden');
    }

    // Warm-up: one click back into the last-played scenario.
    const warm = el('menu-warmup');
    let lastId = null;
    try {
      lastId = localStorage.getItem(LAST_KEY);
    } catch {
      /* private mode */
    }
    const lastDef = lastId && byId[lastId];
    if (lastDef) {
      warm.innerHTML = `${icon('play')} Warm up: ${lastDef.name}`;
      warm.onclick = (e) => {
        if (e.detail > 0) e.currentTarget.blur();
        audio.ui();
        this.showBrief(lastDef);
      };
      warm.classList.remove('hidden');
    } else {
      warm.classList.add('hidden');
    }
  }

  _filterCards(cat) {
    for (const node of el('menu-cards').children) {
      if (node.classList.contains('cards-section')) {
        node.style.display = cat === 'all' ? '' : 'none';
      } else {
        node.style.display = cat === 'all' || node.dataset.cat === cat ? '' : 'none';
      }
    }
    this._updateMenuFade();
  }

  _updateMenuFade() {
    const fade = el('menu-fade');
    if (!fade) return;
    requestAnimationFrame(() => {
      const scr = el('screens');
      const menuVisible =
        !el('screen-menu').classList.contains('hidden') && !scr.classList.contains('hidden');
      const overflow = scr.scrollHeight - scr.clientHeight > 8;
      fade.classList.toggle('hidden', !(menuVisible && overflow));
    });
  }

  showMenu() {
    this._bench = null;
    this._challenge = null; // backing out of a challenge link dismisses it
    this._disarmAbandon();
    this.hud.setBenchLabel('');
    this._refreshCards();
    this._refreshFirstRun();
    this._show('screen-menu');
    this._updateMenuFade();
  }

  // ---- briefing ------------------------------------------------------------

  showBrief(def) {
    this._briefDef = def;
    const isCustom = def.id === 'custom';
    const form = el('brief-custom');
    if (isCustom) {
      form.classList.remove('hidden');
      if (!form.dataset.built) this._buildCustomForm(form);
    } else {
      form.classList.add('hidden');
    }

    el('brief-name').textContent = def.name;
    // Scenario banner: same in-game shot the menu card shows, taller crop.
    const thumb = el('brief-thumb');
    thumb.innerHTML = `<img src="assets/thumbs/${def.id}.webp" width="600" height="240"
      alt="" decoding="async" onerror="this.parentElement.classList.add('hidden')">`;
    thumb.classList.remove('hidden');
    el('brief-desc').textContent = def.description;
    const pb = getPB(def.id);
    const cfg = isCustom ? this._customCfg() : null;
    const wm = isCustom ? this._cfWeaponInput?.value || cfg.weapon : def.weapon?.mode || 'semi';
    // Challenge runs are pinned to base duration (fair comparison), so the
    // chip shows the real length regardless of the local time-scale setting.
    const isChallenge = this._challenge?.id === def.id;
    const dur = isCustom
      ? Math.round(Number(this._cfDurationInput?.value ?? cfg.duration))
      : Math.round(def.duration * (isChallenge ? 1 : settings.data.timeScale || 1));
    el('brief-meta').innerHTML = `
      <span class="chip dim" id="brief-dur-chip">${dur}s</span>
      <span class="chip dim">${WEAPON_LABEL[wm] || wm}</span>
      ${pb ? `<span class="chip dim">PB ${fmt(normScore(pb))}</span>` : ''}
      ${pb ? tierChip(def, pb.score, pb.timeScale ?? 1) : ''}
      ${isChallenge ? `<span class="chip challenge">Challenge — beat ${fmt(this._challenge.beatScore)}</span>` : ''}`;

    this._show('screen-brief');
  }

  _customCfg() {
    try {
      return { ...CUSTOM_DEFAULTS, ...(JSON.parse(localStorage.getItem(CUSTOM_KEY)) || {}) };
    } catch {
      return { ...CUSTOM_DEFAULTS };
    }
  }

  _buildCustomForm(form) {
    form.dataset.built = '1';
    const cfg = this._customCfg();
    this._cfControls = {};
    form.innerHTML = '';

    // Presets + reset.
    const presets = mk('div', 'cf-presets', '<span class="cf-presets-label">Presets</span>');
    for (const name of Object.keys(CUSTOM_PRESETS)) {
      const chip = mk('button', 'preset-chip', name);
      chip.type = 'button';
      chip.addEventListener('click', (e) => {
        if (e.detail > 0) e.currentTarget.blur();
        audio.ui();
        this._applyPreset(CUSTOM_PRESETS[name]);
      });
      presets.append(chip);
    }
    const resetChip = mk('button', 'preset-chip reset', 'Reset to defaults');
    resetChip.type = 'button';
    resetChip.addEventListener('click', (e) => {
      if (e.detail > 0) e.currentTarget.blur();
      audio.ui();
      this._applyPreset(CUSTOM_DEFAULTS);
    });
    presets.append(resetChip);
    form.append(presets);

    // Grouped sliders.
    let curGroup = null;
    let groupEl = null;
    for (const [key, label, min, max, step, group, hint] of CUSTOM_FIELDS) {
      if (group !== curGroup) {
        curGroup = group;
        groupEl = mk('div', 'cf-group');
        groupEl.append(mk('div', 'cf-group-h', group));
        form.append(groupEl);
      }
      const row = mk('label', 'row');
      const labelSpan = mk('span', '', `${label}${hint ? `<span class="field-hint">${hint}</span>` : ''}`);
      row.append(labelSpan);
      const wrap = mk('div', 'range-wrap');
      const input = mk('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = cfg[key];
      input.dataset.key = key;
      // Screen readers announce the semantic readout (∞ / static / value), not the raw number.
      input.setAttribute('aria-label', hint ? `${label} — ${hint}` : label);
      input.setAttribute('aria-valuetext', cfReadout(key, cfg[key], step));
      const val = mk('span', 'range-val', cfReadout(key, cfg[key], step));
      input.addEventListener('input', () => {
        const readout = cfReadout(key, input.value, step);
        val.textContent = readout;
        input.setAttribute('aria-valuetext', readout);
        if (key === 'duration') this._updateBriefDuration(input.value);
      });
      wrap.append(input, val);
      row.append(wrap);
      groupEl.append(row);
      if (key === 'duration') this._cfDurationInput = input;
      this._cfControls[key] = (v) => {
        input.value = v;
        val.textContent = cfReadout(key, v, step);
      };
    }

    // Weapon select (lives in the last group: Session).
    const wrow = mk('label', 'row', '<span>Weapon</span>');
    const sel = mk('select');
    for (const [v, n] of [['semi', 'Semi'], ['auto', 'Auto (600 RPM)'], ['beam', 'Beam (tracking)']]) {
      const o = mk('option', '', n);
      o.value = v;
      sel.append(o);
    }
    sel.value = cfg.weapon;
    sel.dataset.key = 'weapon';
    wrow.append(sel);
    groupEl.append(wrow);
    this._cfWeaponInput = sel;
    this._cfControls.weapon = (v) => {
      sel.value = v;
    };
  }

  _applyPreset(preset) {
    const merged = { ...CUSTOM_DEFAULTS, ...preset };
    for (const k in this._cfControls) {
      if (merged[k] !== undefined) this._cfControls[k](merged[k]);
    }
    this._updateBriefDuration(merged.duration);
  }

  _updateBriefDuration(v) {
    const c = el('brief-dur-chip');
    if (c) c.textContent = `${Math.round(Number(v))}s`;
  }

  _collectCustom() {
    const cfg = this._customCfg();
    const bounds = Object.fromEntries(CUSTOM_FIELDS.map(([k, , min, max]) => [k, [min, max]]));
    for (const input of el('brief-custom').querySelectorAll('[data-key]')) {
      const k = input.dataset.key;
      if (k === 'weapon') {
        cfg[k] = ['semi', 'auto', 'beam'].includes(input.value) ? input.value : 'semi';
      } else {
        // Typed/slid values still clamp to the declared bounds.
        let v = parseFloat(input.value);
        if (!Number.isFinite(v)) v = CUSTOM_DEFAULTS[k];
        const [min, max] = bounds[k];
        cfg[k] = Math.min(max, Math.max(min, v));
        input.value = cfg[k];
      }
    }
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(cfg));
    } catch {
      /* non-persistent */
    }
    return cfg;
  }

  _startBrief() {
    const def = this._briefDef;
    if (!def) return;
    try {
      localStorage.setItem(LAST_KEY, def.id);
    } catch {
      /* private mode */
    }
    let opts = {};
    if (def.id === 'custom') {
      const cfg = this._collectCustom();
      opts = {
        custom: cfg,
        weaponOverride: { mode: cfg.weapon, rpm: 600 },
        durationOverride: cfg.duration,
      };
    }
    if (this._challenge?.id === def.id) {
      // Replay the exact seed at base duration so timeScale settings can't
      // make the score comparison unfair.
      opts.seed = this._challenge.seed;
      opts.beatScore = this._challenge.beatScore;
      opts.durationOverride = def.duration;
    }
    this.game.arm(def, opts);
  }

  onEnterBrief() {
    if (el('screen-brief').classList.contains('hidden')) return;
    this._startBrief();
  }

  // ---- pause ----------------------------------------------------------------

  showPause() {
    this._show('screen-pause');
  }

  pauseVisible() {
    return !this.screens['screen-pause'].classList.contains('hidden');
  }

  // ---- settings (reachable from the menu or from a paused run) ---------------

  showSettings(from = 'menu') {
    this._settingsFrom = from;
    this._refreshSensInfo?.(); // freshen the measured-sensitivity readout on open
    this._show('screen-settings');
  }

  /** Back out of settings to wherever it was opened from — the pause screen mid-run,
   *  otherwise the main menu. Keeps the run paused (not quit) when returning to pause. */
  _settingsBack() {
    if (this._settingsFrom === 'pause') this.showPause();
    else this.showMenu();
  }

  // ---- quit / benchmark abandon guard ---------------------------------------

  /** Routed by both the Menu/Abandon button and the Esc/Q keys. */
  requestQuit() {
    if (!this._bench) {
      this.game.quitToMenu();
      return;
    }
    if (this._abandonArmed) {
      this._disarmAbandon();
      this.game.quitToMenu(); // showMenu() clears _bench
      return;
    }
    // Arm: require a second press within the window to actually discard the gauntlet.
    this._abandonArmed = true;
    const done = this._bench.results.length;
    const total = this._bench.stages.length;
    this._toast(`Abandon benchmark? ${done} of ${total} done. Press again to confirm.`, 3000);
    const btn = this._abandonBtn();
    if (btn) {
      btn._benchOrig = btn.innerHTML;
      btn.classList.add('armed');
      btn.innerHTML = 'Press again to abandon';
      this._abandonBtnRef = btn;
    }
    clearTimeout(this._abandonT);
    this._abandonT = setTimeout(() => this._disarmAbandon(), 3000);
  }

  _abandonBtn() {
    if (!el('screen-results').classList.contains('hidden')) return el('res-menu');
    if (!el('screen-pause').classList.contains('hidden')) return el('pause-quit');
    return null;
  }

  _disarmAbandon() {
    this._abandonArmed = false;
    clearTimeout(this._abandonT);
    const btn = this._abandonBtnRef;
    if (btn) {
      btn.classList.remove('armed');
      if (btn._benchOrig != null) btn.innerHTML = btn._benchOrig;
    }
    this._abandonBtnRef = null;
  }

  // ---- results ---------------------------------------------------------------

  showResults(result, prevPB) {
    this._disarmAbandon();
    const def = byId[result.scenarioId];
    // PB comparison on per-60s-normalized scores, mirroring game._finish.
    const isPB = !prevPB || normScore(result) > normScore(prevPB);
    const delta = prevPB ? Math.round(normScore(result) - normScore(prevPB)) : 0;

    el('res-name').textContent = result.name;
    this._countUp(el('res-score'), result.score); // sanctioned peak
    el('res-pb-badge').classList.toggle('hidden', !isPB || result.score === 0);
    el('res-tier').innerHTML = def?.thresholds ? tierChip(def, result.score, result.timeScale ?? 1) : '';
    el('res-delta').textContent = prevPB
      ? `${delta >= 0 ? '+' : ''}${fmt(delta)} vs PB`
      : 'First run. This is your baseline.';

    // Next-tier threshold (recognition over recall).
    const nt = nextTierInfo(def, result.score, result.timeScale ?? 1);
    const ntEl = el('res-next-tier');
    if (nt) {
      ntEl.textContent = `Next tier: ${nt.name} at ${fmt(nt.needs)}`;
      ntEl.classList.remove('hidden');
    } else {
      ntEl.classList.add('hidden');
    }

    // Challenge outcome + share button.
    this._lastResult = result;
    const oc = el('res-challenge-outcome');
    if (result.beatScore > 0) {
      const won = result.score > result.beatScore;
      oc.textContent = won
        ? `Challenge beaten — ${fmt(result.score)} vs ${fmt(result.beatScore)}`
        : `Challenge missed — needed ${fmt(result.beatScore + 1)}`;
      oc.classList.toggle('win', won);
      oc.classList.remove('hidden');
    } else {
      oc.classList.add('hidden');
    }
    // Shareable only for a fair (timeScale 1), scored, stock-scenario solo run.
    el('res-challenge').classList.toggle(
      'hidden',
      !!this._bench || result.scenarioId === 'custom' || result.seed == null
        || result.timeScale !== 1 || result.score <= 0
    );

    const rows = [];
    rows.push(['Accuracy', `${result.acc}%`]);
    rows.push(['Kills', fmt(result.kills)]);
    if (result.shots !== undefined) rows.push(['Shots', fmt(result.shots)]);
    if (result.bestStreak !== undefined) rows.push(['Best streak', `×${result.bestStreak}`]);
    if (result.avgTtkMs !== undefined) rows.push(['Avg kill time', `${result.avgTtkMs} ms`]);
    rows.push(['Kills / sec', result.kps.toFixed(2)]);
    for (const [k, v] of Object.entries(result.stats || {})) rows.push([k, v]);
    el('res-stats').innerHTML = rows
      .map(([k, v]) => `<div class="stat"><span class="stat-v">${v}</span><span class="stat-k">${k}</span></div>`)
      .join('');

    drawTimeline(el('res-graph'), result.timeline, result.duration);
    const runs = getRuns(result.scenarioId).slice(-20);
    const pbNow = getPB(result.scenarioId);
    drawHistory(el('res-history'), runs.map(normScore), runs.length - 1, pbNow ? normScore(pbNow) : 0);

    // Bench flow buttons + progress.
    const nextBtn = el('res-next');
    const retryBtn = el('res-retry');
    const menuBtn = el('res-menu');
    const prog = el('res-bench-progress');
    if (this._bench) {
      prog.textContent = `Benchmark · stage ${this._bench.i + 1} of ${this._bench.stages.length}`;
      prog.classList.remove('hidden');
      const tIdx = tierIndex(def, result.score, result.timeScale ?? 1);
      this._bench.results.push({ id: def.id, name: def.name, score: result.score, tierIdx: tIdx });
      this._bench.i++;
      const more = this._bench.i < this._bench.stages.length;
      nextBtn.innerHTML = more
        ? `Next: ${byId[this._bench.stages[this._bench.i]].name} ${icon('next')} <kbd>Enter</kbd>`
        : `See your rank ${icon('next')} <kbd>Enter</kbd>`;
      nextBtn.classList.remove('hidden');
      retryBtn.classList.add('hidden');
      menuBtn.textContent = 'Abandon benchmark';
    } else {
      prog.classList.add('hidden');
      nextBtn.classList.add('hidden');
      retryBtn.classList.remove('hidden');
      menuBtn.textContent = 'Menu';
    }

    this._show('screen-results');
    // Tier / delta / next-tier land AFTER the score number settles.
    this._landIn([el('res-tier'), el('res-delta'), el('res-next-tier')]);
  }

  _copyChallenge() {
    const r = this._lastResult;
    if (!r || r.seed == null) return;
    const url = `${location.origin}${location.pathname}?c=${r.scenarioId}.${seedToString(r.seed)}.${Math.round(r.score)}`;
    const done = () => this._toast('Challenge link copied — same targets, beat your score');
    navigator.clipboard?.writeText(url).then(done).catch(() => {
      // Non-secure contexts (plain http) have no clipboard API.
      const ta = mk('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch {
        this._toast('Copy failed — link: ' + url, 5000);
      }
      ta.remove();
    });
  }

  /** Ease-out-expo count-up to the final score. Final value is the resting default. */
  _countUp(node, to) {
    cancelAnimationFrame(this._scoreRAF);
    const target = Math.round(to);
    if (reduceMotion() || target <= 0) {
      node.textContent = fmt(target);
      return;
    }
    const dur = 700;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(2, -10 * t);
      node.textContent = fmt(t >= 1 ? target : target * eased);
      if (t < 1) this._scoreRAF = requestAnimationFrame(step);
    };
    this._scoreRAF = requestAnimationFrame(step);
  }

  _landIn(nodes) {
    if (reduceMotion()) return;
    nodes.forEach((n, i) => {
      if (!n) return;
      n.animate(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 260, delay: 700 + i * 70, easing: 'ease-out', fill: 'backwards' }
      );
    });
  }

  onEnterResults() {
    if (this._bench) this._benchAdvance();
  }

  // ---- benchmark -------------------------------------------------------------

  showBenchIntro() {
    this._disarmAbandon();
    const list = el('bench-stages');
    list.innerHTML = BENCH_STAGES.map((id, i) => {
      const def = byId[id];
      const pb = getPB(id);
      return `<li><span><span class="num">${i + 1}</span>${def.name}</span><span class="pb">${
        pb ? `PB ${fmt(normScore(pb))}` : '—'
      }</span></li>`;
    }).join('');
    const best = getBestBench();
    el('bench-best').innerHTML = best
      ? `Your best: <span style="color:${best.color};font-weight:700">${best.rank}</span> (${best.points} pts)`
      : '';
    el('bench-summary').classList.add('hidden');
    el('bench-intro').classList.remove('hidden');
    this._show('screen-bench');
  }

  _benchStart() {
    this._bench = { stages: [...BENCH_STAGES], i: 0, results: [] };
    this._benchLaunch();
  }

  _benchLaunch() {
    const def = byId[this._bench.stages[this._bench.i]];
    this.game.arm(def, {
      bench: { stage: this._bench.i, total: this._bench.stages.length },
      durationOverride: def.duration,
    });
  }

  _benchAdvance() {
    if (!this._bench) return;
    this._disarmAbandon();
    if (this._bench.i < this._bench.stages.length) {
      this._benchLaunch();
    } else {
      this._benchFinish();
    }
  }

  _benchFinish() {
    const overall = computeBench(this._bench.results);
    const stages = this._bench.results; // capture before clearing
    const record = {
      date: new Date().toISOString(),
      points: overall.points,
      rank: overall.rank,
      color: overall.color,
      stages,
    };
    saveBench(record);
    this._bench = null;
    this._disarmAbandon();
    this.hud.setBenchLabel('');

    el('bench-intro').classList.add('hidden');
    el('bench-summary').classList.remove('hidden');
    const rankEl = el('bench-rank');
    rankEl.textContent = overall.rank; // final state set synchronously
    rankEl.style.color = overall.color;
    el('bench-points').textContent = `${overall.points} / 7 points`;
    el('bench-table').innerHTML = stages
      .map((s) => {
        const t = s.tierIdx >= 0 ? RANKS[s.tierIdx] : null;
        return `<tr><td>${s.name}</td><td>${fmt(s.score)}</td><td style="color:${t ? t.color : '#8892a6'}">${
          t ? t.name : 'Unranked'
        }</td></tr>`;
      })
      .join('');
    this._show('screen-bench');

    // Sanctioned peak: a brief hold, then the rank scales+fades in; rows stagger.
    if (!reduceMotion()) {
      rankEl.animate(
        [{ opacity: 0, transform: 'scale(0.82)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 440, delay: 260, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'backwards' }
      );
      el('bench-table')
        .querySelectorAll('tr')
        .forEach((tr, i) =>
          tr.animate(
            [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 240, delay: 640 + i * 40, easing: 'ease-out', fill: 'backwards' }
          )
        );
    }
  }

  // ---- stats page --------------------------------------------------------------

  showStats() {
    const t = totals();
    const accAll = t.shots > 0 ? Math.round((100 * t.hits) / t.shots) : 0;
    const hours = (t.seconds / 3600).toFixed(1);
    el('stats-totals').innerHTML = [
      [fmt(t.runs), 'runs'],
      [fmt(t.kills), 'kills'],
      [`${accAll}%`, 'click accuracy'],
      [`${hours}h`, 'trained'],
    ]
      .map(([v, k]) => `<div class="stat"><span class="stat-v">${v}</span><span class="stat-k">${k}</span></div>`)
      .join('');

    const tbody = el('stats-table');
    tbody.innerHTML = '';
    for (const def of SCENARIOS) {
      const runs = getRuns(def.id);
      if (!runs.length) continue;
      const pb = runs.reduce((b, r) => (normScore(r) > normScore(b) ? r : b));
      const last5 = runs.slice(-5);
      const avg5 = Math.round(last5.reduce((a, r) => a + normScore(r), 0) / last5.length);
      const tr = mk('tr');
      tr.innerHTML = `
        <td>${def.name}</td>
        <td>${fmt(normScore(pb))} ${tierChip(def, pb.score, pb.timeScale ?? 1)}</td>
        <td>${fmt(avg5)}</td>
        <td>${runs.length}</td>
        <td><canvas class="spark" width="120" height="26" role="img"></canvas></td>`;
      tbody.append(tr);
      const trend = runs.slice(-15).map(normScore);
      const dir = trend.length < 2 ? 'flat' : trend[trend.length - 1] > trend[0] ? 'trending up' : trend[trend.length - 1] < trend[0] ? 'trending down' : 'flat';
      tr.querySelector('canvas').setAttribute('aria-label', `${def.name} recent scores, ${dir}`);
      sparkline(tr.querySelector('canvas'), trend);
    }
    // Empty state owns the panel — hide the dead totals + headers-only table.
    const has = tbody.children.length > 0;
    el('stats-totals').classList.toggle('hidden', !has);
    el('stats-table-wrap').classList.toggle('hidden', !has);
    el('stats-empty').classList.toggle('hidden', has);
    this._show('screen-stats');
  }

  // ---- settings ------------------------------------------------------------------

  _buildSettings() {
    const root = el('settings-body');
    const d = () => settings.data;

    const getPath = (path) => path.split('.').reduce((o, k) => o[k], d());
    const setPath = (path, v) => {
      const keys = path.split('.');
      const last = keys.pop();
      keys.reduce((o, k) => o[k], d())[last] = v;
      settings.save();
    };

    const dynamic = []; // re-render hooks on any change

    const section = (name) => {
      root.append(mk('h3', '', name));
    };

    const row = (label, control, showIf) => {
      const r = mk('label', 'row');
      r.append(mk('span', '', label), control);
      root.append(r);
      if (showIf) dynamic.push(() => r.classList.toggle('hidden', !showIf(d())));
      return r;
    };

    const numberInput = (path, { min, max, step }) => {
      const i = mk('input');
      i.type = 'number';
      i.min = min;
      i.max = max;
      i.step = step;
      i.value = getPath(path);
      i.addEventListener('change', () => {
        // Typed values bypass HTML min/max — clamp (negative sens would invert aim).
        let v = parseFloat(i.value);
        if (!Number.isFinite(v)) v = getPath(path);
        v = Math.min(max, Math.max(min, v));
        i.value = v;
        setPath(path, v);
      });
      return i;
    };

    const range = (path, { min, max, step }, format = (v) => v) => {
      const wrap = mk('div', 'range-wrap');
      const i = mk('input');
      i.type = 'range';
      i.min = min;
      i.max = max;
      i.step = step;
      i.value = getPath(path);
      const val = mk('span', 'range-val', format(getPath(path)));
      i.addEventListener('input', () => {
        setPath(path, parseFloat(i.value));
        val.textContent = format(parseFloat(i.value));
      });
      wrap.append(i, val);
      return wrap;
    };

    const check = (path) => {
      const i = mk('input');
      i.type = 'checkbox';
      i.checked = !!getPath(path);
      i.addEventListener('change', () => setPath(path, i.checked));
      return i;
    };

    const select = (path, options, numeric = false) => {
      const s = mk('select');
      for (const [v, n] of options) {
        const o = mk('option', '', n);
        o.value = v;
        s.append(o);
      }
      s.value = String(getPath(path));
      s.addEventListener('change', () => setPath(path, numeric ? parseFloat(s.value) : s.value));
      return s;
    };

    const color = (path) => {
      const i = mk('input');
      i.type = 'color';
      i.value = getPath(path);
      i.addEventListener('input', () => setPath(path, i.value));
      return i;
    };

    // Mouse
    section('Mouse');
    row('Mouse DPI', numberInput('dpi', { min: 100, max: 26000, step: 50 }));
    row(
      'Sensitivity mode',
      select('sensMode', [
        ['match', 'Match my mouse'],
        ['game', 'Match a game'],
        ['cm360', 'Direct cm/360'],
      ])
    );
    // Match-my-mouse: recalibrate control (a browser can't read OS sensitivity, so this
    // re-measures the desktop cursor speed from your next mouse movements).
    const recalBtn = mk('button', 'btn ghost small', 'Recalibrate');
    recalBtn.type = 'button';
    recalBtn.addEventListener('click', (e) => {
      if (e.detail > 0) e.currentTarget.blur();
      this.calibrator?.reset();
      settings.data.matchDps = 0;
      settings.persist();
      this._refreshSensInfo?.();
    });
    row('Auto-match', recalBtn, (dd) => dd.sensMode === 'match');
    row('Game', select('game', GAMES.map((g) => [g.id, g.name])), (dd) => dd.sensMode === 'game');
    row('In-game sensitivity', numberInput('sens', { min: 0.01, max: 30, step: 0.01 }), (dd) => dd.sensMode === 'game');
    row('cm per 360°', numberInput('cm360', { min: 5, max: 150, step: 0.5 }), (dd) => dd.sensMode === 'cm360');
    const sensInfo = mk('p', 'info sens-info');
    root.append(sensInfo);
    this._refreshSensInfo = () => {
      const cm = `${settings.cm360().toFixed(1)} cm/360`;
      if (d().sensMode === 'match') {
        sensInfo.textContent = settings.matchMeasured()
          ? `≈ ${cm}, matched to your mouse. Move the cursor on any menu to re-measure.`
          : `≈ ${cm} (default). Move your mouse on the menu and it adapts to your speed.`;
      } else if (d().sensMode === 'game') {
        sensInfo.textContent = `= ${cm} · eDPI ${Math.round(settings.eDPI())}`;
      } else {
        sensInfo.textContent = `= ${cm}`;
      }
    };
    dynamic.push(this._refreshSensInfo);
    row('Invert Y axis', check('invertY'));

    // Video
    section('Video & game');
    row('FOV (horizontal)', range('fov', { min: 60, max: 140, step: 1 }, (v) => `${v}°`));
    row('Target color', color('targetColor'));
    row(
      'Run length',
      select(
        'timeScale',
        [
          [0.5, 'Half (fast sessions)'],
          [1, 'Standard'],
          [2, 'Double (endurance)'],
        ],
        true
      )
    );
    row('Show weapon', check('viewmodel'));
    row('Show FPS counter', check('showFps'));

    // Crosshair
    section('Crosshair');
    const preview = mk('div', 'ch-preview');
    root.append(preview);
    dynamic.push(() => {
      preview.innerHTML = crosshairSVG(d().crosshair);
    });
    row(
      'Style',
      select('crosshair.style', [
        ['cross', 'Cross'],
        ['dot', 'Dot'],
        ['circle', 'Circle'],
      ])
    );
    row('Color', color('crosshair.color'));
    row('Size', range('crosshair.size', { min: 1, max: 20, step: 1 }));
    row('Thickness', range('crosshair.thickness', { min: 1, max: 8, step: 1 }));
    row('Gap', range('crosshair.gap', { min: 0, max: 14, step: 1 }));
    row('Center dot', check('crosshair.dot'), (dd) => dd.crosshair.style !== 'dot');
    row('Outline', check('crosshair.outline'));

    // Audio
    section('Audio');
    row('Volume', range('volume', { min: 0, max: 1, step: 0.05 }, (v) => `${Math.round(v * 100)}%`));
    row('Hit sounds', check('hitSound'));

    // Data — backup/restore first, then the destructive actions. Import and
    // both destructive buttons confirm in-panel and toast the result.
    section('Data');
    const exportBtn = mk('button', 'btn ghost', 'Export backup');
    exportBtn.addEventListener('click', (e) => {
      if (e.detail > 0) e.currentTarget.blur();
      audio.ui();
      const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
      const a = mk('a');
      a.href = URL.createObjectURL(blob);
      a.download = `aimforge-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this._toast('Backup downloaded');
    });
    const importBtn = mk('button', 'btn ghost', 'Import backup');
    const fileInput = mk('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    fileInput.setAttribute('aria-hidden', 'true');
    fileInput.tabIndex = -1;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      let payload, counts;
      try {
        payload = JSON.parse(await file.text());
        counts = validateBackup(payload);
      } catch (err) {
        this._toast(err instanceof SyntaxError ? 'Not a valid JSON file' : err.message, 3200);
        return;
      }
      // Arm the two-step confirm; the pending action runs on the second click.
      importBtn._pendingImport = () => {
        try {
          importData(payload);
        } catch (err) {
          this._toast(err.message, 3200);
          return;
        }
        settings.stopPersist();
        this._toast(`Restored ${counts.runs} runs — reloading…`);
        setTimeout(() => location.reload(), 500);
      };
      this._armConfirm(importBtn, `Click again to replace all data (${counts.runs} runs)`, importBtn._pendingImport);
    });
    importBtn.addEventListener('click', (e) => {
      if (e.detail > 0) e.currentTarget.blur();
      audio.ui();
      if (importBtn._armed && importBtn._pendingImport) {
        const apply = importBtn._pendingImport;
        importBtn._pendingImport = null;
        this._armConfirm(importBtn, '', apply); // armed → executes now
        return;
      }
      fileInput.click();
    });
    const backupRow = mk('div', 'row buttons');
    backupRow.append(exportBtn, importBtn, fileInput);
    root.append(backupRow);

    const resetBtn = mk('button', 'btn ghost', 'Reset settings');
    resetBtn.addEventListener('click', (e) => {
      if (e.detail > 0) e.currentTarget.blur();
      audio.ui();
      this._armConfirm(resetBtn, 'Click again to reset', () => {
        settings.reset();
        root.innerHTML = '';
        this._buildSettings();
        this._toast('Settings reset to defaults');
      });
    });
    const clearBtn = mk('button', 'btn danger', 'Delete all runs & PBs');
    clearBtn.addEventListener('click', (e) => {
      if (e.detail > 0) e.currentTarget.blur();
      audio.ui();
      this._armConfirm(clearBtn, 'Click again to delete everything', () => {
        clearAllData();
        this._refreshCards();
        this._toast('All run history deleted');
      });
    });
    const btnRow = mk('div', 'row buttons');
    btnRow.append(resetBtn, clearBtn);
    root.append(btnRow);

    this._dynamic = dynamic;
    dynamic.forEach((fn) => fn());
    // Single subscription for the UI's lifetime — rebuilds (settings reset) swap
    // _dynamic instead of stacking subscribers on detached DOM.
    if (!this._settingsSubbed) {
      this._settingsSubbed = true;
      settings.onChange(() => this._dynamic?.forEach((fn) => fn()));
    }
  }

  /** In-panel two-step confirm for a destructive button (on-brand, no native confirm). */
  _armConfirm(btn, confirmLabel, action) {
    if (btn._armed) {
      clearTimeout(btn._armT);
      btn._armed = false;
      btn.classList.remove('armed');
      btn.innerHTML = btn._origHTML;
      action();
      return;
    }
    btn._origHTML = btn.innerHTML;
    btn._armed = true;
    btn.classList.add('armed');
    btn.innerHTML = confirmLabel;
    btn._armT = setTimeout(() => {
      btn._armed = false;
      btn.classList.remove('armed');
      btn.innerHTML = btn._origHTML;
    }, 3000);
  }

  /** Feedback when the browser refuses pointer lock (post-Esc cooldown). */
  lockHint() {
    this._toast('Browser cooldown. Click again in a second.', 1800);
  }

  /** The pointer calibrator re-measured the desktop cursor speed; refresh the readout
   *  only when the settings screen is actually on-screen (cheap text update). */
  onCalibrated() {
    if (!this.screens['screen-settings']?.classList.contains('hidden')) this._refreshSensInfo?.();
  }

  // ---- static bindings ----------------------------------------------------------

  _bindStatic() {
    const click = (id, fn) =>
      el(id).addEventListener('click', (e) => {
        // Blur only on real mouse clicks so a later Space/Enter mid-run can't re-fire
        // the button; keyboard activation (e.detail === 0) keeps focus.
        if (e.detail > 0) e.currentTarget.blur();
        audio.ui();
        fn();
      });

    click('menu-benchmark', () => this.showBenchIntro());
    click('menu-stats', () => this.showStats());
    click('menu-settings', () => this.showSettings('menu'));

    click('brief-start', () => this._startBrief());
    click('brief-back', () => this.showMenu());

    click('pause-resume', () => this.game.armResume());
    click('pause-restart', () => this.game.restart());
    click('pause-settings', () => this.showSettings('pause'));
    click('pause-quit', () => this.requestQuit());

    click('res-retry', () => this.game.restart());
    click('res-next', () => this._benchAdvance());
    click('res-challenge', () => this._copyChallenge());
    click('res-menu', () => this.requestQuit());

    click('settings-back', () => this._settingsBack());
    click('stats-back', () => this.showMenu());
    click('stats-empty-play', () => this.showBrief(byId.gridshot));

    click('bench-start', () => this._benchStart());
    // Via game.quitToMenu so game state/opts fully reset after a benchmark
    // (a bare showMenu leaves state=RESULTS and R would relaunch the last stage).
    click('bench-back', () => this.game.quitToMenu());
    click('bench-done', () => this.game.quitToMenu());

    // First user interaction anywhere unlocks audio.
    document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  }
}
