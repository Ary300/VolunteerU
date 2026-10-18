/* ==========================================================================
   style.js, CSS text to React style object
   The design file expresses every rule as an inline CSS string. Keeping those
   strings verbatim (rather than hand-translating each one into a camelCased
   object) is what makes the port provably 1:1, so `S()` parses them once and
   memoises the result.
   ========================================================================== */

const cache = new Map();

const CUSTOM_PROP = /^--/;

/* ---- migration shim --------------------------------------------------------
   The app moved from the cream/terracotta palette and Geist to the photo-first
   system in lib/tokens.js. Screens are being rewritten to import tokens, but
   until every inline string is converted, S() maps the retired values onto
   their new roles at parse time (once per string, cached) so no screen shows
   the old look or falls back to a serif:
     - retired hex colors -> the token with the same job (ink, line, ember...)
     - warm-brown rgba shadows/scrims -> the ink-based ones
     - Geist / Geist Mono -> Figtree, or Funnel Display for font sizes >= 22px
   New code should not rely on this: write tokens. scratchpad/COLOR-LEFTOVERS.md
   lists the files that still carry the old values. */
const LEGACY_HEX = {
  // text
  '1A1714': '1E2421', '1F1B18': '1E2421', '26221E': '1E2421', '363029': '1E2421', '332D28': '1E2421',
  '57504A': '4E5752', '6B635C': '4E5752',
  '8A8179': '7C8580', '8B8078': '7C8580', 'A19891': '7C8580', 'A79E96': '7C8580',
  'A9A097': '9AA39E', 'BEB5AC': '9AA39E', 'B9AEA2': '9AA39E', 'B8AEA4': '9AA39E', 'B5ACA4': '9AA39E', 'B3A99F': '9AA39E',
  // rules and borders
  'E8E1D9': 'E4E7E4', 'F1EBE4': 'E4E7E4', 'EFE9E2': 'E4E7E4', 'EFE3DC': 'E4E7E4', 'F2ECE5': 'E4E7E4', 'EFE8E0': 'E4E7E4',
  'EFE7DF': 'E4E7E4', 'EDE7DF': 'E4E7E4', 'EDE6DE': 'E4E7E4', 'F3EEE8': 'E4E7E4', 'EFE7DE': 'E4E7E4', 'E6DFD8': 'E4E7E4',
  'E7DED6': 'E4E7E4', 'E4DAD0': 'E4E7E4', 'E0D5C9': 'E4E7E4',
  'E4DDD4': 'D3D8D4', 'E0D8CF': 'D3D8D4', 'D8CEC3': 'D3D8D4', 'D8CFC5': 'D3D8D4', 'D8D0C7': 'D3D8D4', 'DCD1C5': 'D3D8D4',
  'D9D0C6': 'D3D8D4', 'D9CFC6': 'D3D8D4', 'CFC7BF': 'D3D8D4',
  // surfaces
  'FAF8F5': 'FFFFFF', 'FCFAF8': 'FFFFFF', 'FBF7F3': 'FFFFFF', 'FDF7F4': 'FFFFFF', 'FDF6F2': 'FFFFFF',
  'F6F2EE': 'F3F5F3', 'FAF6F3': 'F3F5F3',
  // brand
  'C2603C': 'D1432A', 'B05434': 'D1432A', 'B14E2C': 'D1432A', 'D2775B': 'D1432A',
  'A8482A': 'B23620', '8F3B20': '8F2B18', '8A3E22': '8F2B18', '6E3A27': '8F2B18',
  'F5E7E0': 'FCEDE9', 'FAF0EB': 'FCEDE9', 'FCEDE6': 'FCEDE9', 'FBEFEA': 'FCEDE9', 'FCF2EC': 'FCEDE9', 'F3D9CE': 'FCEDE9',
  'E7C0AC': 'F2C7BC', 'EBD3C8': 'F2C7BC', 'F0B49B': 'F2C7BC', 'E4C9BB': 'F2C7BC', 'E2BCAB': 'F2C7BC', 'E0A188': 'F2C7BC',
  'D8B7A6': 'F2C7BC', 'EFD3C7': 'F2C7BC', 'F1D6C6': 'F2C7BC',
  // status
  '3F6B4E': '1D7A52', '4E6B57': '1D7A52', 'EAF3EC': 'E6F3EC', 'F4F9F5': 'E6F3EC', 'DCEADF': 'C5E3D3', 'CFE4D5': 'C5E3D3',
  '8A5A20': 'A86200', '6B4A1E': '8A5200', 'C98A2E': 'E3A23B', 'FDF3E7': 'FFF3DC', 'F3E3CD': 'F5D9A8',
};
const HEX_RE = /#([0-9a-fA-F]{6})\b/g;
const RGBA_RE = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g;
const LEGACY_RGB = {
  '30,20,10': '30,36,33', '60,40,25': '30,36,33', '70,45,28': '30,36,33', '31,27,24': '30,36,33', '26,23,20': '30,36,33',
  '250,248,245': '255,255,255', '232,225,217': '228,231,228', '194,96,60': '209,67,42',
};
const LEGACY_FONT_MARK = '\u0000vu-font\u0000';
const LEGACY_FONT_RE = /(['"]?)Geist(?: Mono)?\1(?:\s*,\s*monospace)?/g;
const FONT_BODY = "var(--font-body), system-ui, sans-serif";
const FONT_DISPLAY = "var(--font-display), var(--font-body), system-ui, sans-serif";

/** Map one retired hex color to its replacement; anything else passes through. */
export function remapColor(color) {
  if (typeof color !== 'string') return color;
  return color.replace(HEX_RE, (m, h) => {
    const to = LEGACY_HEX[h.toUpperCase()];
    return to ? `#${to}` : m;
  });
}

function migrate(css) {
  let out = remapColor(css);
  if (out.includes('rgba(')) out = out.replace(RGBA_RE, (m, r, g, b) => {
    const to = LEGACY_RGB[`${r},${g},${b}`];
    return to ? `rgba(${to},` : m;
  });
  if (out.includes('Geist')) out = out.replace(LEGACY_FONT_RE, LEGACY_FONT_MARK);
  return out;
}

/* `font:600 28px/1.1 Geist` -> Funnel Display; smaller text -> Figtree. */
function migrateFont(key, value) {
  let display = false;
  if (key === 'font') {
    const m = value.match(/(\d+(?:\.\d+)?)px/);
    display = !!m && Number(m[1]) >= 22;
  }
  return value.split(LEGACY_FONT_MARK).join(display ? FONT_DISPLAY : FONT_BODY);
}

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
  const raw = css;
  css = migrate(css);

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
    let value = d.slice(i + 1).trim();
    if (!key || !value) continue;
    if (value.includes(LEGACY_FONT_MARK)) value = migrateFont(key, value);
    out[key] = value;
  }

  cache.set(raw, out);
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


/* ---- legacy tokens ----------------------------------------------------------
   Older call sites import these names. They now carry the photo-first values;
   new code imports C / F / R / SH from lib/tokens.js instead. */
export const T = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#FFFFFF',
  surfaceWarm: '#F3F5F3',
  surfaceMute: '#F3F5F3',
  ink: '#1E2421',
  line: '#E4E7E4',
  lineSoft: '#E4E7E4',
  lineWarm: '#E4E7E4',
  lineStrong: '#D3D8D4',
  lineCheck: '#D3D8D4',
  text: '#1E2421',
  text2: '#1E2421',
  text3: '#4E5752',
  text4: '#4E5752',
  text5: '#7C8580',
  text6: '#9AA39E',
  text7: '#9AA39E',
  brand: '#D1432A',
  brandHi: '#D1432A',
  brandLo: '#B23620',
  brandDeep: '#B23620',
  brandTint: '#FCEDE9',
  ok: '#1D7A52',
  okBg: '#E6F3EC',
  warn: '#A86200',
  warnBg: '#FFF3DC',
  bad: '#8F2B18',
  badBg: '#FCEDE9',
  mute: '#4E5752',
  muteBg: '#F3F5F3',
  mono: FONT_BODY,
};

/* The primary fill, kept under its old name for existing call sites. */
export const GRAD = '#D1432A';

/* Shadow recipes for older call sites. Cards and rows carry none; only
   floating things do (see SH in lib/tokens.js). */
export const SH = {
  flat: 'none',
  soft: 'none',
  lift: 'none',
  liftSoft: 'none',
  hairline: 'none',
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
