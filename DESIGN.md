---
name: AimForge
description: Free browser aim trainer — raw input, real sensitivity conversion, ranked benchmark.
colors:
  abyss: "#0b0e14"
  panel: "#10151f"
  panel-raised: "#151c29"
  edge: "#223047"
  ice-text: "#e8eef7"
  steel-dim: "#8892a6"
  forge-cyan: "#00ffd0"
  forge-cyan-wash: "#00ffd024"
  ember-danger: "#ff4a6e"
  medal-gold: "#ffd24a"
  trace-blue: "#4ab7ff"
typography:
  display:
    fontFamily: "Rajdhani, 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(40px, 7vw, 68px)"
    fontWeight: 700
    letterSpacing: "0.16em"
  headline:
    fontFamily: "Rajdhani, 'Segoe UI', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    letterSpacing: "0.12em"
  body:
    fontFamily: "Rajdhani, 'Segoe UI', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
  label:
    fontFamily: "Rajdhani, 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "22px"
  xl: "34px"
components:
  button-primary:
    backgroundColor: "{colors.forge-cyan-wash}"
    textColor: "{colors.forge-cyan}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  button-secondary:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ice-text}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  button-ghost:
    backgroundColor: "#00000000"
    textColor: "{colors.steel-dim}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  button-danger:
    backgroundColor: "#ff4a6e14"
    textColor: "{colors.ember-danger}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  card-scenario:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ice-text}"
    rounded: "{rounded.lg}"
    padding: "16px 18px"
  chip:
    backgroundColor: "#00000000"
    textColor: "{colors.steel-dim}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  tab-active:
    backgroundColor: "{colors.forge-cyan}"
    textColor: "#061511"
    rounded: "{rounded.pill}"
    padding: "7px 18px"
  input-field:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ice-text}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
---

# Design System: AimForge

## 1. Overview

**Creative North Star: "The Midnight Range"**

A pro's private practice range after hours: the room is dark, the lights are on the targets, and the only numbers that matter are yours. The interface is a cool, dark shell — deep blue-black surfaces, thin steel edges — that stays quiet so the arena, the score, and the rank carry all the energy. Glow exists in this system, but it is *earned light*: the logo, a new personal best, a rank reveal. Ambient decoration is rejected.

The system explicitly rejects the "generic neon gamer" look (RGB gradients, glow on every border), free-to-play celebration spam, and the sterile-SaaS opposite. It is a competitive tool with a game's heartbeat: dense, legible, numbers-first, with delight concentrated at the payoff moments.

**Key Characteristics:**
- Deep cool dark surfaces layered by lightness, not shadow
- One electric accent (Forge Cyan) for action and identity; gold reserved for personal bests and medals
- One condensed, technical family (Rajdhani, self-hosted) with tabular numerals everywhere data appears
- Wide-tracked heavy display treatment of that same family reserved for named moments (logo, rank reveal)
- Motion conveys state; celebration is rationed to PBs and rank reveals

## 2. Colors

A restrained cool-dark palette: three stacked neutrals, one electric accent, and two semantic voices (danger, gold).

### Primary
- **Forge Cyan** (#00ffd0): the brand's electric signature. Primary actions, active tab, score readout, focus states, live data strokes. Used at full strength on ≤10% of any screen; washes (`#00ffd024`) carry primary-button fills.

### Neutral
- **Abyss** (#0b0e14): the page and arena backdrop. Everything sits on this.
- **Panel** (#10151f): first surface layer — menu cards, dialog panels.
- **Panel Raised** (#151c29): second layer — inputs, stat tiles, list rows sitting on a panel.
- **Edge** (#223047): the single border color. 1px lines everywhere; structure comes from these hairlines, not shadows.
- **Ice Text** (#e8eef7): primary text.
- **Steel Dim** (#8892a6): secondary text, labels, inactive states. (Contrast-audit this against Panel wherever it carries reading text.)

### Semantic
- **Ember Danger** (#ff4a6e): destructive actions, kill hitmarker, urgent timer.
- **Medal Gold** (#ffd24a): personal bests and PB lines on graphs — nothing else. Its rarity is what makes a PB feel like one.
- **Trace Blue** (#4ab7ff): historical/comparison data strokes (sparklines), so history never competes with the cyan "now".

### Named Rules
**The Earned Light Rule.** Glow (text-shadow/box-shadow in the accent) is permitted only on: the logo, the results score, a new-PB badge, and the benchmark rank reveal. Any other glowing element is a bug.
**The One Border Rule.** All structural borders are 1px Edge (#223047). Thicker or colored borders signal interactive state (hover, focus, selection), never decoration.

## 3. Typography

**One family: Rajdhani** (self-hosted woff2 400/500/600/700, fallback 'Segoe UI', system-ui, sans-serif). No second font, no CDN. A condensed, squared technical sans that carries headings, buttons, labels, body, and data alike — the product-register discipline of one well-tuned family. (An earlier build paired it with Orbitron for display; Orbitron was retired as the "sci-fi gamer" tell.)

**Display treatment (not a second font):** the two brand moments — the AIMFORGE logo and the benchmark rank reveal — use Rajdhani 700, uppercase, with generous tracking (≈0.16em) and a size jump. Distinctiveness comes from weight, tracking, and scale, not from a different family.

### Hierarchy
- **Display** (700, clamp(40px–68px), tracking ~0.16em, uppercase): the logo and the rank reveal only.
- **Headline** (700, 26px, tracking ~0.12em, uppercase): screen titles (Settings, Results, PAUSED).
- **Title** (700, 20px): card names, button labels.
- **Body** (400–500, 17px): descriptions, briefs. Max ~70ch.
- **Label** (600, 13–14px, tracking 0.08em, uppercase): table headers, stat captions, section headers.
- **Data** (600–700, tabular-nums): every score, timer, and stat uses `font-variant-numeric: tabular-nums`.

### Named Rules
**The Two Moments Rule.** The heavy tracked display treatment appears at most twice per screen (logo + rank reveal). If a third element reaches for it, the screen's hierarchy is wrong.

## 4. Elevation

Depth is tonal, not shadowed: Abyss → Panel → Panel Raised, separated by 1px Edge hairlines. The one true shadow (`0 20px 60px rgba(0,0,0,0.5)`) belongs to modal panels floating over the 3D arena, where separation from a live scene is structural. Hover lift on cards is transform + border-color change, not shadow growth.

### Named Rules
**The Three Layers Rule.** No surface stacks deeper than Panel Raised. If a design wants a fourth layer, restructure the grouping instead.

## 5. Components

### Buttons
- **Shape:** softly squared (10px radius); padding 12px 22px; weight 700 with 0.06em tracking.
- **Primary (accent):** Forge Cyan text on cyan wash, 1px cyan border. Hover deepens the wash.
- **Secondary:** Ice text on Panel Raised, Edge border; hover recolors border to cyan.
- **Ghost:** dim text, transparent, Edge border — exits and back-actions.
- **Danger:** Ember text on ember wash — destructive only.
- **Keyboard chips:** `<kbd>` inline hints (R, Q, Esc) ride inside buttons at 0.8em.
- **States:** hover border/wash shift, active scale(0.98). (Focus-visible needs an explicit treatment — currently browser default.)

### Chips
- **Style:** pill (999px), 1px border, 14px/600 text. Dim variant for metadata; tier chips borrow the rank's color for text+border.

### Cards / Containers
- **Scenario card:** Panel bg, Edge border, 12px radius, 16×18px padding; hover lifts 3px and recolors border cyan. Name (20/700) + category chip, two-line description (dim), PB row (gold) + tier chip.
- **Dialog panel:** Panel bg, Edge border, 14px radius, 34×40px padding, the one true shadow. Widths: 380px (narrow), 560px (default), 760px (wide).

### Inputs / Fields
- **Style:** Panel Raised bg, Edge border, 8px radius, 7×10px padding, 170px wide in settings rows.
- **Range sliders / checkboxes:** native controls with `accent-color: cyan`.
- **Rows:** label left, control right, in a single-column settings list with uppercase cyan section headers.

### Navigation
- **Category tabs:** pill buttons; inactive = dim text + Edge border; active = solid cyan with near-black text. Hover recolors text/border.

### HUD (signature)
- Fixed full-viewport, pointer-events none, tabular numerals: score top-left (34px, cyan, glow), timer top-center (40px, turns Ember at ≤5s), accuracy/streak top-right (26px; streak in gold), FPS bottom-right (15px dim), bench progress bottom-center. Center messages (countdown "3·2·1", GO) at 42px/88px with brief fades. Hitmarker: 34px rotated cross, white (red on kill), 180ms pop via WAAPI.

## 6. Do's and Don'ts

### Do:
- **Do** keep full-strength Forge Cyan under 10% of any screen; washes and hairlines carry the rest.
- **Do** use tabular numerals on every number that can change (scores, timers, stats, tables).
- **Do** route all celebration through the two sanctioned peaks: NEW PB (gold) and rank reveal (glow + color).
- **Do** keep run-critical surfaces (HUD, countdown, pause→resume) free of transition delays — 0ms cost to input readiness.
- **Do** give every interactive element visible hover AND focus-visible states.

### Don't:
- **Don't** ship the "generic neon gamer" look PRODUCT.md bans: no RGB gradients, no glow on ambient borders, no animated background energy during runs.
- **Don't** import free-to-play mobile-game energy — no confetti-per-action, no "AMAZING!!!" toasts; praise lives in numbers.
- **Don't** flatten into the sterile SaaS dashboard either: the results screen is a payoff, not a report.
- **Don't** use gradient text, side-stripe accent borders, or glassmorphism-by-default anywhere.
- **Don't** put Orbitron on body text, buttons, labels, or data — it is a two-moments-per-screen display voice.
- **Don't** use shadows for card hover states or stack surfaces past Panel Raised.
