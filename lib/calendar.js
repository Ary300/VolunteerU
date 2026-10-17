/* ==========================================================================
   calendar.js, shift dates and the "add to calendar" link
   Shift labels are display strings ("Sat, Oct 24", "9:00 AM-12:00 PM"). This
   turns them into real dates, works out the year, and builds a Google Calendar
   link. Best-effort, but correct for the formats the app writes.
   ========================================================================== */

'use client';

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const DAY_MS = 86400000;

/**
 * Shift and session labels carry no year ("Sat, Oct 24"). Pick the year that
 * puts the date closest to `ref`: within about six months either side. So in
 * October, "Jan 9" is next January and "Aug 1" is this past August. A past date
 * stays in the past, so callers can tell a finished shift from an upcoming one.
 */
export function inferYear(month, day, ref = new Date()) {
  const y = ref.getFullYear();
  let best = y;
  let bestGap = Infinity;
  for (const cand of [y - 1, y, y + 1]) {
    const gap = Math.abs(new Date(cand, month, day).getTime() - ref.getTime());
    if (gap < bestGap) { bestGap = gap; best = cand; }
  }
  return best;
}

/** Start of the local day for `d`. */
export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * True once a shift's day is over. A shift with a readable end time is past
 * after it ends; a shift with only a date is past from the next day. A label
 * with no readable date is never treated as past.
 */
export function isPastShift(shift, now = new Date()) {
  if (!shift) return false;
  const dts = shiftDates(shift, undefined, now);
  if (dts) return dts.end.getTime() <= now.getTime();
  const dm = String(shift.d || '').match(/([A-Za-z]{3})\s+(\d{1,2})/);
  if (!dm || MONTHS[dm[1]] === undefined) return false;
  const month = MONTHS[dm[1]];
  const day = Number(dm[2]);
  const date = new Date(inferYear(month, day, now), month, day);
  return date.getTime() + DAY_MS <= now.getTime();
}
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

function to24(h, ampm, fallbackPm) {
  const pm = ampm ? /pm/i.test(ampm) : fallbackPm;
  if (pm && h !== 12) return h + 12;
  if (!pm && h === 12) return 0;
  return h;
}

/* One end of a time range: "9", "9:30", "9 AM", "9:30 PM", "noon", "midnight". */
const TIME_PART = '(?:(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM)?|(noon|midnight))';
const RANGE_RX = new RegExp(`${TIME_PART}\\s*(?:to|\\u2013|-)\\s*${TIME_PART}`, 'i');

/**
 * Read a time range label into minutes after midnight. Handles the app's old
 * labels ("10:00 AM - 12:00 PM", "1:00-4:00 PM") and the current ones
 * ("10 AM\u2013noon", "3:30\u20136 PM"). A range with no colon, AM/PM, noon or
 * midnight anywhere is not read as a time. Returns null when it can't be read.
 */
export function parseTimeRange(text) {
  const raw = String(text || '');
  const m = RANGE_RX.exec(raw);
  if (!m) return null;
  const [whole, sH, sM, sMer, sWord, eH, eM, eMer, eWord] = m;
  if (!/:|AM|PM|noon|midnight/i.test(whole)) return null;
  const word = (w) => (/noon/i.test(w) ? 12 * 60 : 0);
  const endPm = eWord ? /noon/i.test(eWord) : /pm/i.test(eMer || sMer || '');
  let end = eWord ? word(eWord) : to24(+eH, eMer, endPm) * 60 + Number(eM || 0);
  if (eWord && /midnight/i.test(eWord)) end = 24 * 60;
  let start;
  if (sWord) start = word(sWord);
  else {
    start = to24(+sH, sMer, endPm) * 60 + Number(sM || 0);
    // "11-1 PM": with no meridiem of its own the start is the morning one.
    if (!sMer && start >= end && start - 12 * 60 >= 0) start -= 12 * 60;
  }
  if ([start, end].some((n) => !Number.isFinite(n))) return null;
  return { start, end };
}

/** Parse a shift's date + time range into real start/end Dates. With no
    explicit year, the year is inferred from `ref` (see inferYear). */
export function shiftDates(shift, year, ref = new Date()) {
  const dm = (shift.d || '').match(/([A-Za-z]{3})\s+(\d{1,2})/);
  const range = parseTimeRange(shift.tLong || shift.t || '');
  if (!dm || !range) return null;
  if (MONTHS[dm[1]] === undefined) return null;
  const month = MONTHS[dm[1]];
  const day = Number(dm[2]);
  const yr = year == null ? inferYear(month, day, ref) : year;
  const start = new Date(yr, month, day, 0, range.start);
  const end = new Date(yr, month, day, 0, range.end);
  return { start, end };
}

/** Hours between a shift's start and end, one decimal, or null if unreadable. */
export function shiftLengthHours(shift) {
  const d = shift && shiftDates(shift);
  if (!d) return null;
  const hrs = (d.end.getTime() - d.start.getTime()) / 3600000;
  return hrs > 0 ? Math.round(hrs * 10) / 10 : null;
}

/** A Google Calendar "add event" link, or null if the time can't be read. */
export function googleCalUrl(opp, shift) {
  const dts = shiftDates(shift);
  if (!dts) return null;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${opp.title}, ${opp.org}`,
    dates: `${stamp(dts.start)}/${stamp(dts.end)}`,
    details: `${opp.description || ''}\n\nAdded from VolunteerU.`,
    location: opp.address || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* How early a volunteer may check in before a shift starts. */
export const CHECK_IN_EARLY_MIN = 60;

/**
 * Whether a shift label such as "Sat, Oct 24 at 10 AM–noon" (or "Sat, Oct 24"
 * with no time) is open for check-in at `now`. Check-in opens
 * CHECK_IN_EARLY_MIN minutes before the start (at midnight when there's no
 * time) and closes at the end of that day, so someone who arrives late can
 * still check in. Returns { state: 'open' | 'early' | 'over' | 'unknown',
 * opensAt?: Date }. A label with no readable date is 'unknown'.
 */
export function checkInWindow(label, now = new Date()) {
  const text = String(label || '');
  const dm = text.match(/([A-Za-z]{3})\s+(\d{1,2})/);
  if (!dm || MONTHS[dm[1]] === undefined) return { state: 'unknown' };
  const month = MONTHS[dm[1]];
  const day = Number(dm[2]);
  const year = inferYear(month, day, now);
  const dayStart = new Date(year, month, day);
  const range = parseTimeRange(text.slice(dm.index + dm[0].length));
  const opensAt = range
    ? new Date(year, month, day, 0, Math.max(0, range.start - CHECK_IN_EARLY_MIN))
    : dayStart;
  const closesAt = new Date(year, month, day + 1);
  if (now.getTime() < opensAt.getTime()) return { state: 'early', opensAt };
  if (now.getTime() >= closesAt.getTime()) return { state: 'over', opensAt };
  return { state: 'open', opensAt };
}
