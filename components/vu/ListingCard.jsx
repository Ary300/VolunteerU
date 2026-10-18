'use client';

/* ==========================================================================
   ListingCard, the Airbnb Experiences / Meetup pattern: one shape (the
   photo, or a DateTile when the listing has no photo of its own), then text
   on the page background. No box, border or shadow, at rest or on hover.

     [ photo | DateTile ]   badge top-left (0 or 1), bookmark top-right
     Title, 2 lines max
     Riverbend Food Bank (check) · 1.2 mi          <- line A, who
     Sat, Oct 24 · 1 to 4 PM · 3 spots left        <- line B, when

   Each fact shows once. With a DateTile the date is in the tile, so line B
   is the time only. No buttons under the card: the card opens the listing.

   The title link is stretched over the whole card (::after in globals.css),
   so the card is one tab stop and the save button stays a separate control.
   ========================================================================== */

import { isValidElement } from 'react';
import Link from 'next/link';
import { C } from '../../lib/tokens.js';
import { splitWhen } from '../../lib/format.js';
import { Icon, StatusPill } from '../ui.jsx';
import DateTile from './DateTile.jsx';
import { dateParts } from './DateBlock.jsx';

/** "4 spots left", "1 spot left", "Full". Returns null when unknown. */
export function spotsText(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return null;
  const v = Math.max(0, Math.floor(Number(n)));
  if (v === 0) return 'Full';
  return `${v} ${v === 1 ? 'spot' : 'spots'} left`;
}

/** True for 1 to 4 open spots, the only counts a card prints. */
export function isLowSpots(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return false;
  const v = Math.floor(Number(n));
  return v >= 1 && v <= 4;
}

/** "Sat, Oct 24" for any date-ish value, or '' when it has no readable date. */
export function shortDate(value) {
  const p = dateParts(value);
  return p ? `${p.weekday}, ${p.month} ${p.day}` : '';
}

/**
 * The parts of a card's "when" line, in order, each fact once.
 * Pass the stored label as `when` ("Sat, Oct 24 · 1:00-4:00 PM",
 * "Sat, Oct 24 at 1–4 PM") or `date` and `time` separately.
 * @param {object} o
 * @param {string} [o.when]       any shift label; parsed for date and time
 * @param {Date|string|null} [o.date]
 * @param {string} [o.time]       "1:00-4:00 PM" or already "1 to 4 PM"
 * @param {number} [o.moreDates]  other upcoming shifts after this one
 * @param {number|null} [o.spots] open spots; only 1 to 4 are printed
 * @param {boolean} [o.hasPhoto]  false when a DateTile already shows the date
 * @param {boolean} [o.online]    online listing: "Online" when there's no time
 * @returns {{ text: string, low?: boolean }[]}
 */
export function whenParts({ when, date, time, moreDates, spots, hasPhoto = true, online = false } = {}) {
  const parsed = splitWhen(when);
  const d = date !== undefined && date !== null && date !== '' ? date : parsed.date;
  const t = time ? splitWhen(`x ${time}`).time || String(time) : parsed.time;
  const dateText = d ? shortDate(d) : '';
  const out = [];
  if (dateText && hasPhoto) out.push({ text: dateText });
  if (t) out.push({ text: t });
  else if (online) out.push({ text: 'Online' });
  if (dateText && Number(moreDates) > 0) {
    const n = Math.floor(Number(moreDates));
    out.push({ text: `${n} more ${n === 1 ? 'date' : 'dates'}` });
  }
  // Low spots ride on a dated line; an undated listing has no line B at all.
  if (isLowSpots(spots) && (out.length || dateText)) out.push({ text: spotsText(spots), low: true });
  return out;
}

/** The same line as plain text ("Sat, Oct 24 · 1 to 4 PM · 3 spots left"), for popups and labels. */
export function fmtWhen(o) {
  return whenParts(o)
    .map((x) => x.text)
    .join(' · ');
}

/** Middle-dot separator, ink3. */
export function Sep() {
  return <span className="vu-sep" aria-hidden="true">{' · '}</span>;
}

/* Viewer state badge text. Only these three may appear on a photo. */
const BADGE_TEXT = { in: "You're in", applied: 'Applied', full: 'Full' };
const BADGE_ALIAS = { "you're in": 'in', accepted: 'in', confirmed: 'in', applied: 'applied', waiting: 'applied', pending: 'applied', full: 'full' };

function badgeKey(badge) {
  if (!badge) return '';
  const k = String(badge).trim().toLowerCase();
  if (BADGE_TEXT[k]) return k;
  return BADGE_ALIAS[k] || '';
}

/* Older call sites pass `status={<StatusPill tone=...>Applied</StatusPill>}`.
   That becomes the photo badge; anything else keeps rendering under the
   text until the screen moves it (CARDS.md 1.6: no buttons under cards). */
function badgeFromStatus(status) {
  if (!isValidElement(status) || status.type !== StatusPill) return null;
  const tone = status.props && status.props.tone;
  if (tone === 'ok') return 'in';
  if (tone === 'wait') return 'applied';
  return '';
}

/** Bookmark glyph, drawn here so it can carry a translucent fill and a white edge on any photo. */
function SaveGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="vu-card-save-ic">
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {string} props.href           where the card goes (/join/<id>)
 * @param {string} props.title
 * @param {string} [props.org]          organization name (line A)
 * @param {boolean} [props.verified]    green check after the org
 * @param {boolean} [props.studentProject] line A reads "Student project · {school}"
 * @param {string} [props.school]       student projects: the lead's school
 * @param {string} [props.leadName]     student projects with no school: "Student project by Priya"
 * @param {string} [props.byline]       older call sites: place or "Run by ..." text after "Student project"
 * @param {string} [props.distance]     "1.2 mi", last token of line A
 * @param {string} [props.when]         the stored shift label; date and time are read from it
 * @param {Date|string|null} [props.date] next upcoming shift date (wins over `when`)
 * @param {string} [props.time]         its time ("1:00-4:00 PM")
 * @param {number} [props.moreDates]    other upcoming shifts: " · 2 more dates"
 * @param {boolean} [props.online]      "Online" when there's no time
 * @param {number|null} [props.spots]   open spots; 1 to 4 print in Ember, 0 shows the "Full" badge
 * @param {'in'|'applied'|'full'|string} [props.badge] the viewer's state; "Full" is automatic at 0 spots
 * @param {{src:string,pos?:string}|null} [props.photo] the listing's OWN cover (pickPhotos seed:false); null draws a DateTile
 * @param {string} [props.cause]
 * @param {boolean} [props.saved]       @param {()=>void} [props.onToggleSave] omit to hide the bookmark
 * @param {'grid'|'wide'} [props.layout] grid = 4:3 photo, wide = 3:2 (Discover's 2-column list)
 * @param {boolean} [props.selected]    map hover sync: underlines the title
 * @param {React.ReactNode} [props.status] deprecated; a StatusPill becomes the badge
 * @param {boolean} [props.row]         photo-less card as a date-led row at every width. Pass it when
 *                                      fewer than half the cards on screen have photos (mostlyTiles in
 *                                      lib/photos.js). Phones, photo-free grids and undated listings
 *                                      get the row form from globals.css on their own.
 */
export default function ListingCard({
  href,
  title,
  org,
  verified = false,
  byline,
  studentProject = false,
  school,
  leadName,
  distance,
  when,
  date,
  time,
  moreDates,
  online = false,
  spots,
  badge,
  photo,
  cause,
  saved = false,
  onToggleSave,
  saveBusy = false,
  layout = 'grid',
  selected = false,
  status,
  row = false,
  onHover,
  onOpen,
  className,
  headingLevel = 3,
  prefetch,
  eager = false,
}) {
  const H = `h${Math.min(6, Math.max(2, headingLevel))}`;
  const hasPhoto = Boolean(photo && photo.src);
  const hoverProps = onHover ? { onMouseEnter: () => onHover(true), onMouseLeave: () => onHover(false), onFocus: () => onHover(true), onBlur: () => onHover(false) } : {};

  // The next date: explicit `date`, else read from `when`. A caller that
  // passed neither doesn't know it, so the tile shows only the cause mark.
  const known = date !== undefined || when !== undefined;
  const tileDate = date !== undefined && date !== null && date !== '' ? date : splitWhen(when).date;

  const lineB = whenParts({ when, date, time, moreDates, spots, hasPhoto, online });

  const legacyBadge = badgeFromStatus(status);
  const full = spots !== null && spots !== undefined && spots !== '' && Number(spots) === 0;
  const bKey = badgeKey(badge) || legacyBadge || (full ? 'full' : '');
  const extra = legacyBadge === null && status ? status : null;

  // Line A, who: "Org (check) · 1.2 mi" or "Student project · School · 1.2 mi".
  const who = [];
  if (studentProject) {
    const first = String(leadName || '').trim().split(/\s+/)[0];
    if (school) who.push('Student project', school);
    else if (first) who.push(`Student project by ${first}`);
    else if (byline || org) who.push('Student project', byline || org);
    else who.push('Student project');
  } else if (org) who.push(org);
  else if (byline) who.push(byline);
  const showCheck = !studentProject && verified && Boolean(org);
  if (who.length && distance) who.push(distance);

  const titleNode = onOpen ? (
    <button type="button" className="vu-card-link" onClick={onOpen}>
      {title}
    </button>
  ) : (
    <Link href={href} className="vu-card-link" prefetch={prefetch}>
      {title}
    </Link>
  );

  return (
    <article className={['vu-card', layout === 'wide' ? 'vu-card--wide' : '', hasPhoto ? 'vu-card--photo' : 'vu-card--tile', row && !hasPhoto ? 'vu-card--row' : '', selected ? 'is-selected' : '', className].filter(Boolean).join(' ')} {...hoverProps}>
      <div className={hasPhoto ? 'vu-card-ph' : 'vu-card-ph has-tile'}>
        {hasPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={photo.src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" style={photo.pos ? { objectPosition: photo.pos } : undefined} />
        ) : (
          <DateTile cause={cause} date={known ? tileDate || null : undefined} />
        )}
        {bKey ? (
          <span className={`vu-card-badge is-${bKey}`}>
            {bKey !== 'full' ? <i aria-hidden="true" /> : null}
            {BADGE_TEXT[bKey]}
          </span>
        ) : null}
      </div>
      <div className="vu-card-body">
        <H className="vu-card-title">{titleNode}</H>
        {who.length ? (
          <div className="vu-card-who">
            {who.map((w, i) => (
              <span key={i}>
                {i ? <Sep /> : null}
                {w}
                {i === 0 && showCheck ? <Icon name="badge-check" size={14} color={C.confirmed} label="Verified organization" className="vu-card-check" /> : null}
              </span>
            ))}
          </div>
        ) : null}
        {lineB.length ? (
          <div className="vu-card-when">
            {lineB.map((x, i) => (
              <span key={i}>
                {i ? <Sep /> : null}
                {x.low ? <b className="vu-card-low">{x.text}</b> : x.text}
              </span>
            ))}
          </div>
        ) : null}
        {extra ? <div className="vu-card-extra">{extra}</div> : null}
      </div>
      {onToggleSave ? (
        <button
          type="button"
          className={saved ? 'vu-card-save is-on' : 'vu-card-save'}
          aria-pressed={saved ? 'true' : 'false'}
          aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
          disabled={saveBusy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSave();
          }}
        >
          <SaveGlyph />
        </button>
      ) : null}
    </article>
  );
}
