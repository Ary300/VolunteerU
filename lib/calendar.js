/* ==========================================================================
   calendar.js — turn a claimed shift into a calendar event
   A volunteer never has to leave the app to remember a shift: they add it to
   their own calendar in one tap. Times come from the shift's display strings,
   so this is best-effort but correct for the app's formats.
   ========================================================================== */

'use client';

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

function to24(h, ampm, fallbackPm) {
  const pm = ampm ? /pm/i.test(ampm) : fallbackPm;
  if (pm && h !== 12) return h + 12;
  if (!pm && h === 12) return 0;
  return h;
}

/** Parse a shift's date + time range into real start/end Dates. */
export function shiftDates(shift, year = 2026) {
  const dm = (shift.d || '').match(/([A-Za-z]{3})\s+(\d{1,2})/);
  const range = (shift.tLong || shift.t || '').match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:to|–|-|—)\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
  );
  if (!dm || !range) return null;
  const month = MONTHS[dm[1]] ?? 0;
  const day = Number(dm[2]);
  const [, sHraw, sm, sAmpm, eHraw, em, eAmpm] = range;
  const endPm = /pm/i.test(eAmpm || sAmpm || '');
  const sh = to24(+sHraw, sAmpm, endPm);
  const eh = to24(+eHraw, eAmpm, endPm);
  const start = new Date(year, month, day, sh, +sm);
  const end = new Date(year, month, day, eh, +em);
  return { start, end };
}

/** A Google Calendar "add event" link, or null if the time can't be read. */
export function googleCalUrl(opp, shift) {
  const dts = shiftDates(shift);
  if (!dts) return null;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${opp.title} — ${opp.org}`,
    dates: `${stamp(dts.start)}/${stamp(dts.end)}`,
    details: `${opp.description || ''}\n\nAdded from VolunteerU. Check in when you arrive.`,
    location: opp.address || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
