/* ==========================================================================
   tokens.js, the one place the photo-first design system's values live.
   Screens import these instead of writing hex values, font stacks or radii
   inline. See scratchpad tokens.md for the reasoning behind each value.

     import { C, F, R, SH, CAUSE, causeOf } from '../lib/tokens.js';
     style={S(`color:${C.ink2};font:400 14px/1.4 ${F.body}`)}
   ========================================================================== */

/** Colors. Ember marks the primary action and nothing decorative. */
export const C = {
  ember: '#D1432A', // primary button, Search, active nav icon, low-spots text, unread badge
  emberPress: '#B23620', // hover and pressed primary
  emberTint: '#FCEDE9', // "Not accepted" background, food monogram
  emberDeep: '#8F2B18', // text on emberTint

  ink: '#1E2421', // body text, headings, dark buttons, selected chips
  ink2: '#4E5752', // secondary text, meta lines
  ink3: '#7C8580', // placeholders, chevrons, counts inside the segmented control
  line: '#E4E7E4', // row dividers, section rules
  line2: '#D3D8D4', // outline buttons and chips
  mist: '#F3F5F3', // quiet panels, hover fill, active nav row
  white: '#FFFFFF', // page background

  confirmed: '#1D7A52', // confirmed hours, verified check
  confirmedTint: '#E6F3EC',
  waiting: '#A86200', // applied / waiting text
  waitingTint: '#FFF3DC',
  waitingBar: '#E3A23B', // waiting segment in the hours bar
  ownBar: '#C9CFCB', // "logged on your own" segment in the hours bar

  // Maps (Leaflet over OpenStreetMap tiles)
  mapLand: '#EEF1EC', // the map box while tiles load
  here: '#1A73E8', // the "you are here" dot after Near me, the blue people expect

  scrim: 'rgba(30,36,33,.42)', // modal and drawer backdrop
};

/** Font stacks. The CSS variables come from next/font in app/layout.js. */
export const F = {
  display: "var(--font-display), 'Figtree', system-ui, sans-serif", // Funnel Display: titles, big numbers
  body: "var(--font-body), system-ui, -apple-system, 'Segoe UI', sans-serif", // Figtree: everything else
  num: 'tabular-nums', // value for font-variant-numeric on hour counts
};

/** Radius follows the object. One scale: pill, 10, 16, and 24 for the landing hero only. */
export const R = {
  pill: '999px', // search bar, chips, status badge on photos, segmented control, map pins
  control: '10px', // buttons, inputs, DateBlock, 36 to 64px thumbnails
  thumb: '10px', // alias of control
  photo: '16px', // listing photos, DateTile, map box, map popup, menus, dialogs
  photoMobile: '16px',
  panel: '16px', // the few allowed containers (the /join action panel)
  card: '16px', // the share hour card
  hero: '24px', // landing hero photo only (16px on phones)
  heroMobile: '16px',
};

/** Shadows. Only floating things get one. */
export const SH = {
  none: 'none',
  search: '0 2px 4px rgba(30,36,33,.05), 0 10px 32px rgba(30,36,33,.12)',
  float: '0 1px 2px rgba(30,36,33,.06), 0 8px 24px rgba(30,36,33,.10)',
  popup: '0 12px 36px rgba(30,36,33,.22)',
  menu: '0 1px 2px rgba(30,36,33,.06), 0 12px 32px rgba(30,36,33,.14)',
};

/** Type scale, as CSS `font` shorthands. Pair with letter-spacing from TRACK. */
export const TYPE = {
  hero: `700 76px/0.98 ${F.display}`,
  heroMobile: `700 40px/1 ${F.display}`,
  h1: `700 40px/1.05 ${F.display}`,
  h1Small: `700 32px/1.05 ${F.display}`,
  h2: `650 28px/1.12 ${F.display}`,
  h2Small: `650 22px/1.15 ${F.display}`,
  h3: `600 20px/1.2 ${F.display}`,
  h3Small: `600 17px/1.2 ${F.display}`,
  title: `600 16px/1.3 ${F.body}`,
  body: `400 15px/1.5 ${F.body}`,
  meta: `400 14px/1.4 ${F.body}`,
  small: `400 13px/1.45 ${F.body}`,
  label: `600 13px/1.2 ${F.body}`,
  button: `600 15px/1 ${F.body}`,
  buttonSmall: `600 14px/1 ${F.body}`,
};
export const TRACK = { hero: '-0.035em', h1: '-0.03em', h2: '-0.022em', h3: '-0.012em', big: '-0.05em' };

/* ---- causes --------------------------------------------------------------
   Muted tint/text pairs, one per cause. They color cause tiles (listings with
   no photo), monograms, small cause dots and profile cause rows. Ember stays
   the only loud color, so these never appear on buttons. `icon` is an Icon
   name from components/ui.jsx. */
export const CAUSE = {
  food: { label: 'Food and hunger', short: 'Food', bg: '#FCEDE9', fg: '#8F2B18', icon: 'apple' },
  education: { label: 'Education', short: 'Education', bg: '#E8EEF8', fg: '#2D4E86', icon: 'book' },
  environment: { label: 'Environment', short: 'Environment', bg: '#E6F3EC', fg: '#1D6A48', icon: 'sprout' },
  animals: { label: 'Animals', short: 'Animals', bg: '#FFF3DC', fg: '#8A5200', icon: 'paw' },
  homelessness: { label: 'Homelessness', short: 'Homelessness', bg: '#F1ECF6', fg: '#5D3C80', icon: 'bed' },
  health: { label: 'Health', short: 'Health', bg: '#E6F4F6', fg: '#1F6670', icon: 'heart-pulse' },
  seniors: { label: 'Seniors', short: 'Seniors', bg: '#FBEFE6', fg: '#8A4A1C', icon: 'armchair' },
  arts: { label: 'Arts', short: 'Arts', bg: '#F8EAF3', fg: '#7E2E62', icon: 'palette' },
  civic: { label: 'Civic', short: 'Civic', bg: '#ECEEF6', fg: '#3B4470', icon: 'landmark' },
  disaster: { label: 'Disaster relief', short: 'Disaster relief', bg: '#FFF3DC', fg: '#8A5200', icon: 'life-buoy' },
  other: { label: 'Other', short: 'Other', bg: '#F3F5F3', fg: '#4E5752', icon: 'hand-heart' },
};

const CAUSE_MATCH = [
  ['food', /food|hunger|meal|pantry|grocer/i],
  ['education', /educat|tutor|read|school|literacy|stem|mentor/i],
  ['environment', /environ|climate|park|trail|garden|clean|tree|nature|conserv/i],
  ['animals', /animal|pet|shelter dog|humane|wildlife/i],
  ['homelessness', /homeless|housing|shelter/i],
  ['health', /health|hospital|medical|clinic|mental/i],
  ['seniors', /senior|elder|aging|older adult/i],
  ['arts', /\barts?\b|music|theat|culture|museum/i],
  ['civic', /civic|vote|voter|govern|communit|advoca/i],
  ['disaster', /disaster|relief|emergenc|red cross/i],
];

/**
 * Cause key for any cause string the app stores ("Food & hunger", "Education",
 * an NTEE label, free text). Unknown or empty returns 'other'.
 * @param {string | null | undefined} cause
 * @returns {keyof typeof CAUSE}
 */
export function causeKey(cause) {
  const t = String(cause || '').trim();
  if (!t) return 'other';
  if (CAUSE[t.toLowerCase()]) return /** @type {keyof typeof CAUSE} */ (t.toLowerCase());
  for (const [k, re] of CAUSE_MATCH) if (re.test(t)) return /** @type {keyof typeof CAUSE} */ (k);
  return 'other';
}

/** The CAUSE entry for a cause string, never undefined. */
export function causeOf(cause) {
  return CAUSE[causeKey(cause)];
}

/** The category row, in display order. `key: 'near'` is "Near you" (no cause filter). */
export const CATEGORIES = [
  { key: 'near', label: 'Near you', icon: 'map-pin', cause: null },
  { key: 'food', label: 'Food and hunger', short: 'Food', icon: 'apple', cause: 'Food & hunger' },
  { key: 'education', label: 'Education', icon: 'book', cause: 'Education' },
  { key: 'environment', label: 'Environment', icon: 'sprout', cause: 'Environment' },
  { key: 'animals', label: 'Animals', icon: 'paw', cause: 'Animals' },
  { key: 'homelessness', label: 'Homelessness', icon: 'bed', cause: 'Homelessness' },
  { key: 'seniors', label: 'Seniors', icon: 'armchair', cause: 'Seniors' },
  { key: 'health', label: 'Health', icon: 'heart-pulse', cause: 'Health' },
  { key: 'arts', label: 'Arts', icon: 'palette', cause: 'Arts' },
  { key: 'civic', label: 'Civic', icon: 'landmark', cause: 'Civic' },
  { key: 'online', label: 'Online', icon: 'monitor', cause: null },
];

/** Status pill tones. Use with <StatusPill tone="ok"> or read the pair directly. */
export const TONES = {
  ok: { bg: C.confirmedTint, fg: C.confirmed },
  wait: { bg: C.waitingTint, fg: C.waiting },
  bad: { bg: C.emberTint, fg: C.emberDeep },
  mute: { bg: C.mist, fg: C.ink2 },
};
