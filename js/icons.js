// One inline-SVG icon family. 24x24 viewBox, currentColor stroke, uniform ~2px stroke,
// no fills except the solid "play" glyph. Zero dependencies, no icon fonts, no <img>.

const PATHS = {
  // hexagon (target) — benchmark
  benchmark: '<polygon points="8 3 16 3 21 12 16 21 8 21 3 12"/><circle cx="12" cy="12" r="2.8"/>',
  // trend line — stats
  stats: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
  // gear — settings
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  // solid triangle — play / start / resume
  play: '<path d="M7 4.5 19.5 12 7 19.5Z"/>',
  // circular arrow — restart / retry
  restart: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  // chevron left — back
  back: '<polyline points="15 18 9 12 15 6"/>',
  // chevron right — next / forward
  next: '<polyline points="9 18 15 12 9 6"/>',
};

/** SVG markup for one icon. `play` is solid; everything else is a stroked outline. */
export function icon(name, size = 16) {
  const body = PATHS[name] || '';
  const solid = name === 'play';
  return (
    `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="${solid ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

/** Replace every [data-icon] placeholder in the DOM with its inline SVG. */
export function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    const size = node.dataset.iconSize ? Number(node.dataset.iconSize) : 16;
    node.innerHTML = icon(node.dataset.icon, size);
  }
}
