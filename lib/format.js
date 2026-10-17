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
