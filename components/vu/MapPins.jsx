'use client';

/* ==========================================================================
   MapPins, the pieces Discover's map draws on top of its base layer:
   day/time pill pins for opportunities (a small ink dot when undated),
   hollow dots for IRS nonprofits that haven't posted, the popup for the
   selected pin, the list popup for a place with several listings, and the
   legend. Position each one with `x`/`y` in percent of the map box (the map
   screen owns projection). All of them are absolutely positioned.

   Popups never draw a tile: a photo when the listing has its own, else a
   DateBlock beside the text, else just the text.
   ========================================================================== */

import Link from 'next/link';
import { S } from '../../lib/style.js';
import { C, F, SH } from '../../lib/tokens.js';
import { splitWhen } from '../../lib/format.js';
import DateBlock from './DateBlock.jsx';
import { whenParts, Sep } from './ListingCard.jsx';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Sat 1 PM" from a session label ("Sat, Oct 24 · 1:00-4:00 PM" -> "Sat 1 PM").
 * Falls back to the weekday alone, then to '' (never "No date").
 */
export function pinLabel(label) {
  const t = String(label || '');
  const wd = (t.match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i) || [])[1] || '';
  const tm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|to|–)\s*\d{1,2}(?::\d{2})?\s*(AM|PM)/i) || t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  let time = '';
  if (tm) {
    const ampm = (tm[3] || tm[4] || '').toUpperCase();
    time = `${Number(tm[1])}${tm[2] && tm[2] !== '00' ? `:${tm[2]}` : ''}${ampm ? ` ${ampm}` : ''}`;
  }
  return [wd ? wd[0].toUpperCase() + wd.slice(1, 3).toLowerCase() : '', time].filter(Boolean).join(' ');
}

/** Weekday name for a Date, for callers that hold real dates. */
export const weekdayShort = (d) => WD[d.getDay()];

const at = (x, y) => `position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%)`;

/* Older callers label undated pins "No date" or "No date +2". */
function pinText(label) {
  const t = String(label || '').trim();
  const group = t.match(/^no date\s*\+\s*(\d+)$/i);
  if (group) return `${Number(group[1]) + 1} here`;
  if (/^no date/i.test(t)) return '';
  return t;
}

/**
 * White pill pin with the day and time; ink when selected. With no label
 * (an undated listing) it's a 12px ink dot. A real button either way.
 * A group of undated listings reads "3 here".
 */
export function MapPin({ x, y, label, selected = false, onClick, ariaLabel }) {
  const text = pinText(label);
  if (!text) {
    return (
      <button
        type="button"
        className={selected ? 'vu-pin-dot is-on' : 'vu-pin-dot'}
        aria-pressed={selected ? 'true' : 'false'}
        aria-label={ariaLabel || 'Opportunity with no date yet'}
        onClick={onClick}
        style={S(at(x, y))}
      />
    );
  }
  return (
    <button
      type="button"
      className={selected ? 'vu-pin is-on' : 'vu-pin'}
      aria-pressed={selected ? 'true' : 'false'}
      aria-label={ariaLabel || text}
      onClick={onClick}
      style={S(at(x, y))}
    >
      {text}
    </button>
  );
}

/** Hollow dot for a registered nonprofit that hasn't posted on VolunteerU. */
export function MapDot({ x, y, title, onClick }) {
  const style = S(`${at(x, y)};width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid ${C.ink3};padding:0`);
  return onClick ? <button type="button" aria-label={title} title={title} onClick={onClick} style={style} /> : <span title={title} aria-hidden="true" style={style} />;
}

function WhenLine({ parts, size = 13 }) {
  if (!parts.length) return null;
  return (
    <div className="vu-whenline" style={S(`margin-top:2px;font:400 ${size}px/18px ${F.body};color:${C.ink2}`)}>
      {parts.map((p, i) => (
        <span key={i}>
          {i ? <Sep /> : null}
          {p.low ? <b style={S(`font-weight:600;color:${C.ember}`)}>{p.text}</b> : p.text}
        </span>
      ))}
    </div>
  );
}

/**
 * Popup above the selected pin. `photo` from lib/photos.js (the listing's
 * own cover); without one the body is a row led by a DateBlock.
 * @param {object} props
 * @param {number} props.x @param {number} props.y percent of the map box
 * @param {string} props.href @param {string} props.title
 * @param {string} [props.when] the stored shift label ("Sat, Oct 24 · 1:00-4:00 PM")
 * @param {Date|string|null} [props.date] @param {string} [props.time] instead of `when`
 * @param {number|null} [props.spots] 1 to 4 print in Ember
 * @param {{src:string,sm?:string,pos?:string}|null} [props.photo]
 * @param {number} [props.width] default 248
 */
// eslint-disable-next-line no-unused-vars
export function MapPopup({ x, y, href, title, when, date, time, spots, photo, cause, width = 248 }) {
  const hasPhoto = Boolean(photo && photo.src);
  const d = date !== undefined && date !== null && date !== '' ? date : splitWhen(when).date;
  const parts = whenParts({ when, date, time, spots, hasPhoto });
  const link = (
    <Link
      href={href}
      className="vu-card-link"
      style={S(`display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;font:600 15px/20px ${F.body};color:${C.ink}`)}
    >
      {title}
    </Link>
  );
  return (
    <div
      className="vu-mappop"
      style={S(`position:absolute;left:${x}%;top:${y}%;transform:translate(-50%, calc(-100% - 22px));width:${width}px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:${SH.popup};z-index:2`)}
    >
      {hasPhoto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.sm || photo.src} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', objectPosition: photo.pos || 'center', display: 'block' }} />
          <div style={S('position:relative;padding:12px 14px 14px')}>
            {link}
            <WhenLine parts={parts} />
          </div>
        </>
      ) : (
        <div style={S('position:relative;display:flex;align-items:center;gap:12px;padding:12px 14px 14px')}>
          {d ? <DateBlock date={d} size="sm" tone="line" /> : null}
          <div style={S('min-width:0;flex:1')}>
            {link}
            <WhenLine parts={parts} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Popup for one place with several listings: "{n} opportunities here", then
 * one row each, led by a 44px photo thumb, a DateBlock, or nothing.
 * @param {object} props
 * @param {Array<{id:string,name:string,whenLabel?:string,next_session?:string}>} props.items
 * @param {Map<string, {src:string,sm?:string,pos?:string}|null>} [props.photos]
 * @param {string} [props.place] the address line over the count
 * @param {number} [props.listMax] max list height in px (it scrolls)
 * @param {(item:object)=>string} [props.hrefFor] default /join/<id>
 */
export function MapListPopup({ x, y, items = [], photos, place, width = 272, listMax = 260, hrefFor }) {
  return (
    <div
      className="vu-mappop"
      style={S(`position:absolute;left:${x}%;top:${y}%;transform:translate(-50%, calc(-100% - 22px));width:${width}px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:${SH.popup};z-index:4`)}
    >
      <div style={S(`padding:12px 14px 10px;border-bottom:1px solid ${C.line}`)}>
        <div style={S(`font:600 14px/18px ${F.body};color:${C.ink}`)}>{items.length} opportunities here</div>
        {place ? <div className="vu-trunc" style={S(`margin-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>{place}</div> : null}
      </div>
      <ul style={S(`margin:0;padding:4px 0;list-style:none;max-height:${listMax}px;overflow-y:auto;overscroll-behavior:contain`)}>
        {items.map((l) => {
          const photo = photos ? photos.get(l.id) : null;
          const label = l.whenLabel || l.next_session || '';
          const d = splitWhen(label).date;
          const thumb = Boolean(photo && photo.src);
          // A DateBlock already shows the day, so its when line is the time only (C12).
          const parts = whenParts({ when: label, hasPhoto: thumb || !d });
          return (
            <li key={l.id} style={S('position:relative;display:flex;align-items:center;gap:12px;padding:8px 14px')}>
              {thumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={photo.sm || photo.src} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', objectPosition: photo.pos || 'center', flex: 'none', display: 'block' }} />
              ) : d ? (
                <DateBlock date={d} size="sm" tone="line" />
              ) : null}
              <div style={S('min-width:0;flex:1')}>
                <Link href={hrefFor ? hrefFor(l) : `/join/${l.id}`} className="vu-card-link vu-trunc" style={S(`display:block;font:600 14px/18px ${F.body};color:${C.ink}`)}>
                  {l.name}
                </Link>
                <WhenLine parts={parts} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Legend for the map's bottom-left corner. */
export function MapLegend() {
  return (
    <div style={S(`position:absolute;left:14px;bottom:14px;max-width:calc(100% - 28px);display:flex;flex-wrap:wrap;column-gap:16px;row-gap:8px;align-items:center;background:#fff;border-radius:16px;padding:8px 14px;box-shadow:${SH.float};font:500 13px/1 ${F.body};color:${C.ink2}`)}>
      <span style={S('display:inline-flex;align-items:center;gap:7px;white-space:nowrap')}>
        <i aria-hidden="true" style={S(`font-style:normal;padding:4px 7px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(30,36,33,.28);font:600 11px/1 ${F.body};color:${C.ink}`)}>9 AM</i>
        Opportunity
      </span>
      <span style={S('display:inline-flex;align-items:center;gap:7px;white-space:nowrap')}>
        <i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${C.ink3}`, display: 'block', background: '#fff' }} />
        Nonprofit, not on VolunteerU
      </span>
    </div>
  );
}
