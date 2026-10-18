'use client';

/* ==========================================================================
   DateTile, what a listing shows in place of a photo: its next date, the
   way a calendar or a ticket would print it, on the cause's quiet tint.
   Same frame as a photo (fills .vu-card-ph), real data only:

     Sat, Oct          <- weekday and month
     24                <- the day, big
     (book) Education  <- the cause mark, the only icon

   No title, no org name, no big or cropped drawing, no initials.

   `date` null means the listing has no upcoming date, so the tile says
   "No dates yet". `date` undefined means the caller doesn't know the date
   (an older call site), so the tile prints only the cause mark. Both get
   `is-none`, and globals.css drops an undated tile from the card entirely.

   The big tile is for grids that are mostly photos and for >= 720px. On
   phones, and in a grid with no photos at all, globals.css reshapes the
   same markup into a 56px date block that leads a row ("Sat / 24 / Oct"),
   so a feed of photo-less listings reads as a list, not a wall of tints.
   ========================================================================== */

import { causeOf } from '../../lib/tokens.js';
import { Icon } from '../ui.jsx';
import { dateParts } from './DateBlock.jsx';

/**
 * @param {object} props
 * @param {Date|string|null} [props.date] the next upcoming shift ("Sat, Oct 24", a Date, YYYY-MM-DD)
 * @param {string} [props.cause] any cause string
 * @param {string} [props.className]
 */
export default function DateTile({ date, cause, className }) {
  const c = causeOf(cause);
  const p = date === undefined ? null : dateParts(date);
  const known = date !== undefined;
  const label = p ? `${p.weekday}, ${p.month} ${p.day}, ${c.label}` : known ? `No dates yet, ${c.label}` : c.label;
  return (
    <div
      className={['vu-datetile', p ? '' : 'is-none', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
      style={{ background: c.bg, color: c.fg }}
    >
      {p ? (
        <span className="vu-datetile-date" aria-hidden="true">
          <span className="vu-datetile-wd">
            {p.weekday}
            <span className="vu-datetile-mo">, {p.month}</span>
          </span>
          <span className="vu-datetile-day">{p.day}</span>
          <span className="vu-datetile-mo2">{p.month}</span>
        </span>
      ) : known ? (
        <span className="vu-datetile-none" aria-hidden="true">
          No dates yet
        </span>
      ) : null}
      <span className="vu-datetile-cause" aria-hidden="true">
        <Icon name={c.icon} size={18} stroke={1.75} />
        <span className="vu-datetile-cause-l">{c.short || c.label}</span>
      </span>
    </div>
  );
}
