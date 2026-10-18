'use client';

/* ==========================================================================
   DateBlock, a date ("Sat" over "25") that leads a row: Upcoming, Next
   shift, hours entries, profile shift rows. Takes a Date, an ISO string or
   the app's own session labels ("Sat, Oct 24", "Sat, Oct 24 · 1:00-4:00 PM").
   White with a 1px line by default, 10px radius at every size.
   ========================================================================== */

import { S } from '../../lib/style.js';
import { C, F } from '../../lib/tokens.js';
import { inferYear } from '../../lib/calendar.js';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse a date-ish value into { weekday, day, month }. Returns null when the
 * value has no readable date.
 * @param {Date|string|number|null|undefined} value
 */
export function dateParts(value) {
  if (value === null || value === undefined || value === '') return null;
  let d = null;
  if (value instanceof Date) d = value;
  else if (typeof value === 'number') d = new Date(value);
  else {
    const t = String(value);
    const m = t.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b(?:,?\s+(\d{4}))?/i);
    if (m) {
      const mi = MO.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
      const day = Number(m[2]);
      const year = m[3] ? Number(m[3]) : inferYear(mi, day);
      d = new Date(year, mi, day);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
      const [y, mo, da] = t.slice(0, 10).split('-').map(Number);
      d = new Date(y, mo - 1, da);
    }
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  // A label that names its weekday ("Sat, Oct 24") wins over the inferred year.
  const named = typeof value === 'string' ? value.match(/^\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\b/i) : null;
  const weekday = named ? WD.find((w) => w.toLowerCase() === named[1].slice(0, 3).toLowerCase()) : WD[d.getDay()];
  return { weekday, day: d.getDate(), month: MO[d.getMonth()], date: d };
}

/**
 * @param {object} props
 * @param {Date|string} props.date
 * @param {'sm'|'md'|'lg'} [props.size] 44 / 56 / 68px wide
 * @param {'line'|'white'|'mist'} [props.tone] line (default): white with a 1px rule; white: no rule, for photos; mist: filled
 * @param {boolean} [props.month] add the month under the number
 */
export default function DateBlock({ date, size = 'md', tone = 'line', month = false, className }) {
  const p = dateParts(date);
  if (!p) return null;
  const dims = { sm: { w: 44, num: 19, wd: 11 }, md: { w: 56, num: 24, wd: 12 }, lg: { w: 68, num: 30, wd: 13 } }[size] || { w: 56, num: 24, wd: 12 };
  const bg = tone === 'mist' ? C.mist : '#fff';
  const border = tone === 'line' ? `box-shadow:inset 0 0 0 1px ${C.line}` : '';
  return (
    <span
      className={['vu-dateblock', className].filter(Boolean).join(' ')}
      aria-label={`${p.weekday}, ${p.month} ${p.day}`}
      role="img"
      style={S(
        `display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:none;width:${dims.w}px;padding:${size === 'sm' ? 6 : 8}px 0;border-radius:10px;background:${bg};${border}`
      )}
    >
      <span aria-hidden="true" style={S(`font:600 ${dims.wd}px/1 ${F.body};color:${C.ink2}`)}>{p.weekday}</span>
      <span aria-hidden="true" style={S(`margin-top:4px;font:700 ${dims.num}px/1 ${F.display};letter-spacing:-0.03em;color:${C.ink};font-variant-numeric:tabular-nums`)}>{p.day}</span>
      {month ? <span aria-hidden="true" style={S(`margin-top:3px;font:600 ${dims.wd - 1}px/1 ${F.body};color:${C.ink2}`)}>{p.month}</span> : null}
    </span>
  );
}
