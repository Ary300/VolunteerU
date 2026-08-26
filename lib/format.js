/* ==========================================================================
   format.js, display helpers
   The seeded dataset is anchored to a fixed "today" so every relative label in
   the product ("2 hours ago", "Sat, Aug 9", "Wednesday, July 29") stays
   mutually consistent instead of drifting against the real clock.
   ========================================================================== */

export const APP_NOW = new Date(2026, 6, 29); // Wednesday, July 29 2026

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export function todayLabel() {
  return `${DAY_NAMES[APP_NOW.getDay()]}, ${MONTH_NAMES[APP_NOW.getMonth()]} ${APP_NOW.getDate()}`;
}

export function word(n) {
  return WORDS[n] !== undefined ? WORDS[n] : String(n);
}

export function lowerWord(n) {
  return word(n).toLowerCase();
}

export function plural(n, one, many) {
  return n === 1 ? one : many || `${one}s`;
}

/** "1:00–4:00 PM" → "12:45", the moment check-in opens. */
export function checkinTime(timeLabel) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(String(timeLabel || ''));
  if (!m) return '15 min early';
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10) - 15;
  if (min < 0) {
    min += 60;
    h -= 1;
    if (h === 0) h = 12;
  }
  return `${h}:${String(min).padStart(2, '0')}`;
}

export function startTime(timeLabel) {
  const parts = String(timeLabel || '').split(/[–-]/);
  return (parts[0] || '').trim();
}
