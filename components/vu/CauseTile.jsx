'use client';

/* ==========================================================================
   CauseTile, RETIRED. Kept only so screens that still import it compile
   while they move to DateTile (photo-less listings) or to no thumbnail at
   all (rows). See scratchpad CARDS.md 1.3 and 3.

   - Fill mode (no `size`) renders a DateTile. Pass `date` to show it.
   - Fixed-size mode (`size={44|52|56}`, the tinted icon square) is banned
     and renders nothing: a row without a real photo has no lead.
   - `tileLook` and `CAUSE_ICON_SETS` stay exported (unused by the tile)
     until Landing.jsx and DiscoverListings.jsx drop their imports.
   ========================================================================== */

import { causeKey } from '../../lib/tokens.js';
import DateTile from './DateTile.jsx';

/** @deprecated The tile no longer draws these. */
export const CAUSE_ICON_SETS = {
  food: ['apple'],
  education: ['book'],
  environment: ['sprout'],
  animals: ['paw'],
  homelessness: ['bed'],
  health: ['heart-pulse'],
  seniors: ['armchair'],
  arts: ['palette'],
  civic: ['landmark'],
  disaster: ['life-buoy'],
  other: ['hand-heart'],
};

/** @deprecated Always the cause's own icon, top corner. Kept for old imports. */
export function tileLook(cause) {
  const set = CAUSE_ICON_SETS[causeKey(cause)] || CAUSE_ICON_SETS.other;
  return { icon: set[0], corner: 'top' };
}

/** @deprecated Use DateTile. */
export default function CauseTile({ cause, size, date, className }) {
  if (typeof size === 'number') return null;
  return <DateTile cause={cause} date={date} className={className} />;
}
