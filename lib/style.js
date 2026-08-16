/* ==========================================================================
   style.js — CSS-text → React style object
   The design file expresses every rule as an inline CSS string. Keeping those
   strings verbatim (rather than hand-translating each one into a camelCased
   object) is what makes the port provably 1:1, so `S()` parses them once and
   memoises the result.
   ========================================================================== */

const cache = new Map();

const CUSTOM_PROP = /^--/;

function toKey(prop) {
  const p = prop.trim();
  if (CUSTOM_PROP.test(p)) return p;
  return p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Parse `"padding:20px;border-radius:14px"` into a React style object.
 * Splits declarations on `;` and each declaration on its FIRST `:` so values
 * containing colons (urls, times) survive intact.
 */
export function S(css) {
  if (!css) return undefined;
  if (typeof css === 'object') return css;
  const hit = cache.get(css);
  if (hit) return hit;

  const out = {};
  let depth = 0;
  let start = 0;
  const decls = [];
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) {
      decls.push(css.slice(start, i));
      start = i + 1;
    }
  }
  decls.push(css.slice(start));

  for (const decl of decls) {
    const d = decl.trim();
    if (!d) continue;
    const i = d.indexOf(':');
    if (i < 0) continue;
    const key = toKey(d.slice(0, i));
    const value = d.slice(i + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }

  cache.set(css, out);
  return out;
}

/** Merge a base CSS string with conditional fragments, skipping falsy parts. */
export function s(...parts) {
  return S(parts.filter(Boolean).join(';'));
}

/** Join class names, skipping falsy values. */
export function cx(...parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === 'string') out.push(p);
    else if (typeof p === 'object') for (const k in p) if (p[k]) out.push(k);
  }
  return out.join(' ');
}

/* ---- design tokens ------------------------------------------------------ */
export const T = {
  bg: '#FAF8F5',
  surface: '#FFFFFF',
  surface2: '#FCFAF8',
  surfaceWarm: '#FAF6F3',
  surfaceMute: '#F6F2EE',
  ink: '#1F1B18',
  line: '#E8E1D9',
  lineSoft: '#F1EBE4',
  lineWarm: '#EFE3DC',
  lineStrong: '#E4DDD4',
  lineCheck: '#E0D8CF',
  text: '#1A1714',
  text2: '#332D28',
  text3: '#57504A',
  text4: '#6B635C',
  text5: '#8A8179',
  text6: '#A9A097',
  text7: '#BEB5AC',
  brand: '#C2603C',
  brandHi: '#D2775B',
  brandLo: '#A8482A',
  brandDeep: '#B14E2C',
  brandTint: '#F5E7E0',
  ok: '#3F6B4E',
  okBg: '#EAF3EC',
  warn: '#8A5A20',
  warnBg: '#FDF3E7',
  bad: '#A8482A',
  badBg: '#F5E7E0',
  mute: '#6B635C',
  muteBg: '#F6F2EE',
  mono: "'Geist Mono',monospace",
};

export const GRAD = 'linear-gradient(180deg,#D2775B 0%,#C2603C 100%)';

/* Shadow recipes, named exactly once so every call site stays consistent. */
export const SH = {
  flat: 'inset 0 1px 0 rgba(255,255,255,.3)',
  soft: 'inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(80,30,12,.22), 0 8px 16px -8px rgba(150,60,30,.5)',
  lift: 'inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55)',
  liftSoft:
    'inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(80,30,12,.22), 0 10px 20px -8px rgba(150,60,30,.55)',
  hairline: '0 1px 2px rgba(30,20,10,.06)',
};

/* Interaction classes live in globals.css so hover/active work without JS and
   render identically on the server and the client. */
export const H = {
  primary: 'h-primary',
  primaryLift: 'h-primary-lift',
  secondary: 'h-secondary',
  secondaryLift: 'h-secondary-lift',
  card: 'h-card',
  cardSoft: 'h-card-soft',
  row: 'h-row',
  link: 'h-link',
  nav: 'h-nav',
  chip: 'h-chip',
  input: 'h-input',
  icon: 'h-icon',
  toInk: 'h-to-ink',
  toBrand: 'h-to-brand',
  danger: 'h-danger',
  press: 'h-press',
};
