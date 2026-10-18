/* ==========================================================================
   format.js, display helpers
   ========================================================================== */

/** Today, read from the real clock at call time. */
export function appNow() {
  return new Date();
}
/* Kept for callers that import the constant; evaluated when the module loads. */
export const APP_NOW = appNow();

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Saturday, October 17" for the real current date. */
export function todayLabel() {
  const now = appNow();
  return `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`;
}

/* Counts render as digits everywhere ("3 shifts", never "Three shifts").
   `word` and `lowerWord` stay as names so older call sites keep compiling. */
export function word(n) {
  return String(n);
}

export function lowerWord(n) {
  return String(n);
}

export function plural(n, one, many) {
  return n === 1 ? one : many || `${one}s`;
}

/** "1:00-4:00 PM" -> "12:45 PM", the moment check-in opens (15 minutes early). */
export function checkinTime(timeLabel) {
  const text = String(timeLabel || '');
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(text);
  if (!m) return '15 min early';
  // A range like "1:00-4:00 PM" only names the meridiem once, at the end.
  const tail = /(AM|PM)\s*$/i.exec(text.trim());
  let mer = (m[3] || (tail && tail[1]) || '').toUpperCase();
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10) - 15;
  if (min < 0) {
    min += 60;
    h -= 1;
    if (h === 11 && mer) mer = mer === 'PM' ? 'AM' : 'PM';
    if (h === 0) h = 12;
  }
  const t = `${h}:${String(min).padStart(2, '0')}`;
  return mer ? `${t} ${mer}` : t;
}

export function startTime(timeLabel) {
  const parts = String(timeLabel || '').split(/[\u2013-]/);
  return (parts[0] || '').trim();
}

/* ---- shift times on cards, rows, popups and pins -------------------------
   One wording everywhere: "10 to 11 AM", "9:30 to 11:45 AM", "10 AM to 1 PM".
   No en dash and no hyphen between the two times. */

const TIME_RANGE_RX = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i;
const ONE_TIME_RX = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i;

function clock(h, mm) {
  const hour = Number(h);
  const min = Number(mm || 0);
  return min ? `${hour}:${String(min).padStart(2, '0')}` : String(hour);
}

/**
 * Any stored time or time range in the house format.
 * "1:00-4:00 PM" -> "1 to 4 PM", "10:00 AM-11:00 AM" -> "10 to 11 AM",
 * "10:00 AM-1:00 PM" -> "10 AM to 1 PM", "9:30 AM" -> "9:30 AM".
 * Returns '' when the text holds no time. Older rows spell 12:00 as "noon" or
 * "midnight" ("9 AM–noon"); those read as 12 PM and 12 AM, so they print as
 * "9 AM to 12 PM" like every other time.
 * @param {string} text
 */
export function fmtRange(text) {
  const t = String(text || '').replace(/\bnoon\b/gi, '12 PM').replace(/\bmidnight\b/gi, '12 AM');
  const r = TIME_RANGE_RX.exec(t);
  if (r) {
    const endMer = r[6].toUpperCase();
    // "11:00-1:00 PM" names the meridiem once; a start later on the clock
    // than the end (or an end at noon) means the start is in the morning.
    const sh = Number(r[1]);
    const eh = Number(r[4]);
    const crosses = !r[3] && endMer === 'PM' && sh !== 12 && (sh > eh || eh === 12);
    const startMer = crosses ? 'AM' : (r[3] || endMer).toUpperCase();
    const a = clock(r[1], r[2]);
    const b = `${clock(r[4], r[5])} ${endMer}`;
    return startMer === endMer ? `${a} to ${b}` : `${a} ${startMer} to ${b}`;
  }
  const one = ONE_TIME_RX.exec(t);
  return one ? `${clock(one[1], one[2])} ${one[3].toUpperCase()}` : '';
}

const DATE_IN_TEXT_RX = /\b(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\.?,?\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b(?:,?\s+(\d{4}))?/i;

/**
 * Split a stored or display shift label into its date text and its time.
 * "Sat, Oct 24 · 1:00-4:00 PM", "Sat, Oct 24 at 1–4 PM", "Next shift Sat, Oct 24 at 1–4 PM"
 * -> { date: 'Sat, Oct 24', time: '1 to 4 PM' }. Labels that say there is no
 * date ("No date set yet", "Not scheduled", "No upcoming shift posted yet")
 * give { date: null, time: '' }.
 * @param {string} label
 */
export function splitWhen(label) {
  const t = String(label || '').trim();
  if (!t || /\b(no date|not scheduled|no upcoming|no set|no shifts?)\b/i.test(t)) return { date: null, time: '' };
  const m = DATE_IN_TEXT_RX.exec(t);
  const date = m ? m[0].replace(/[,\s]+$/, '') : null;
  const rest = m ? t.slice(m.index + m[0].length) : t;
  return { date, time: fmtRange(rest) || (m ? '' : fmtRange(t)) };
}
