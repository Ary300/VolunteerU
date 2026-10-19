'use client';

/* ==========================================================================
   MapPins, the pieces Discover's map draws on top of its base layer:
   day/time pill pins for opportunities (a small ink dot when undated),
   hollow dots for IRS nonprofits that haven't posted, the popup for the
   selected pin, the list popup for a place with several listings, and the
   legend. Position each one with `x`/`y` in percent of the map box (the map
   screen owns projection). All of them are absolutely positioned.
   MapPanel's Leaflet map draws pins with pinHtml / dotHtml (the same classes
   as MapPin and MapDot) and lays the popups over the map.

   Popups never draw a tile: a photo when the listing has its own, else a
   DateBlock beside the text, else just the text.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { S } from '../../lib/style.js';
import { C, F, SH } from '../../lib/tokens.js';
import { splitWhen } from '../../lib/format.js';
import DateBlock from './DateBlock.jsx';
import { whenParts, Sep } from './ListingCard.jsx';
import { Icon } from '../ui.jsx';

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

const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** HTML for a Leaflet divIcon that looks like MapPin: the pill, or the dot when undated. */
export function pinHtml(label, selected = false) {
  const text = pinText(label);
  const on = selected ? ' is-on' : '';
  return text ? `<span class="vu-pin${on}">${escHtml(text)}</span>` : `<span class="vu-pin-dot${on}"></span>`;
}

const DOT_ON = `border:4px solid ${C.ink};box-shadow:0 0 0 2px #fff, 0 1px 4px rgba(30,36,33,.4)`;

/**
 * Inline style for a nonprofit dot: '' for the plain 14px ring, the grown ink
 * ring when `on`, and the numbered 24px dot when it stands for `n` > 1 orgs
 * (one address, or several close together).
 */
export function dotStyle(n = 1, on = false) {
  if (n <= 1) return on ? `width:18px;height:18px;${DOT_ON}` : '';
  const base = `width:24px;height:24px;display:grid;place-items:center;font:600 12px/1 ${F.body};color:${C.ink};font-variant-numeric:tabular-nums;border-color:${C.ink2}`;
  return on ? `${base};width:28px;height:28px;${DOT_ON}` : base;
}

/**
 * HTML for a Leaflet divIcon that looks like MapDot (a nonprofit), or a
 * numbered dot for `n` orgs. The marker box is sized (so it can be clicked
 * like any element); the dot sits at its center.
 */
export function dotHtml(n = 1) {
  const style = dotStyle(n, false);
  const dot = `<span class="${n > 1 ? 'vu-np-dot vu-np-many' : 'vu-np-dot'}"${style ? ` style="${escHtml(style)}"` : ''}>${n > 1 ? escHtml(n > 99 ? '99+' : String(n)) : ''}</span>`;
  return `<span style="position:absolute;left:50%;top:50%">${dot}</span>`;
}

/* The ring a nonprofit draws as, here and in the map keys (.vu-np-dot in globals.css). */
export const NP_RING = `border-radius:50%;background:#fff;border:3px solid ${C.ink2};box-shadow:0 0 0 1.5px #fff, 0 1px 3px rgba(30,36,33,.35)`;

/** Hollow dot for a registered nonprofit that hasn't posted on VolunteerU. */
export function MapDot({ x, y, title, onClick }) {
  const style = S(`${at(x, y)};width:14px;height:14px;${NP_RING};padding:0`);
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
export function MapPopup({ x, y, href, title, when, date, time, spots, photo, cause, place, directions, width = 248 }) {
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
            <PlaceLine place={place} />
          </div>
        </>
      ) : (
        <div style={S('position:relative;display:flex;align-items:center;gap:12px;padding:12px 14px 14px')}>
          {d ? <DateBlock date={d} size="sm" tone="line" /> : null}
          <div style={S('min-width:0;flex:1')}>
            {link}
            <WhenLine parts={parts} />
            <PlaceLine place={place} />
          </div>
        </div>
      )}
      <PopupLinks href={href} openLabel="Open listing" directions={directions} />
    </div>
  );
}

function PlaceLine({ place }) {
  return place ? <div className="vu-trunc" style={S(`margin-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>{place}</div> : null;
}

/** The popup's foot: open the page, and directions in a new tab. */
function PopupLinks({ href, openLabel, directions }) {
  if (!href && !directions) return null;
  const link = S(`display:inline-flex;align-items:center;gap:6px;min-height:44px;font:600 14px/1 ${F.body};color:${C.ink}`);
  return (
    <div style={S(`position:relative;z-index:2;display:flex;flex-wrap:wrap;column-gap:18px;padding:0 14px 2px;border-top:1px solid ${C.line}`)}>
      {href ? (
        <Link href={href} className="vu-link-ul" style={link}>
          {openLabel}
        </Link>
      ) : null}
      {directions ? (
        <a href={directions} target="_blank" rel="noopener noreferrer" className="vu-link-ul" style={link}>
          Directions
          <span className="vu-sr">(opens Google Maps in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

/* ---- nonprofit popups -------------------------------------------------------- */

const details = new Map(); // ein -> Promise<organization|null>

const httpUrl = (u) => (/^https?:\/\/[^\s"<>]+\.[^\s"<>]+$/i.test(String(u || '')) ? String(u) : '');
const telHref = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 10 ? `tel:${digits}` : '';
};

/**
 * The org's record with its links (/api/nonprofits?ein=&links=1, which reads
 * its IRS return and website for a volunteer page), fetched once per page and
 * only when its popup opens. Null when it can't be loaded. Only a full answer
 * stays cached: a refusal (429), an upstream error (502), a dropped
 * connection or an answer whose sources failed (lookupFailed) is asked
 * again the next time the popup opens.
 */
function loadDetail(ein) {
  const id = String(ein || '');
  if (!details.has(id)) {
    const forget = () => {
      if (details.get(id) === p) details.delete(id);
    };
    const p = fetch(`/api/nonprofits?ein=${encodeURIComponent(id)}&links=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const o = (b && b.organization) || null;
        if (!o || o.lookupFailed) forget();
        return o;
      })
      .catch(() => {
        forget();
        return null;
      });
    details.set(id, p);
  }
  return details.get(id);
}

/**
 * Starts loading the links for these orgs ahead of a tap, `atOnce` at a
 * time; orgs already loaded or loading are skipped. Fire and forget.
 * @param {string[]} eins
 */
export function warmOrgLinks(eins, atOnce = 2) {
  const todo = [...new Set((eins || []).map((e) => String(e || '')).filter((e) => e && !details.has(e)))];
  if (!todo.length) return;
  let next = 0;
  const worker = () => {
    if (next >= todo.length) return undefined;
    const ein = todo[next];
    next += 1;
    return loadDetail(ein).then(worker);
  };
  for (let i = 0; i < Math.min(atOnce, todo.length); i += 1) worker();
}

/**
 * Where to send someone who wants to help: the org's volunteer page when one
 * was found, its website otherwise, and its phone (lib/nonprofitLinks.js).
 * All from public records; empty while loading or when there's none.
 */
export function useOrgLinks(ein) {
  const [state, setState] = useState({ ein: null, volunteer: '', website: '', phone: '', phoneText: '' });
  useEffect(() => {
    let live = true;
    if (!ein) return undefined;
    loadDetail(ein).then((o) => {
      if (!live) return;
      setState({
        ein,
        volunteer: httpUrl(o && o.volunteerUrl),
        website: httpUrl(o && o.website),
        phone: telHref(o && (o.phoneTel || o.phone)),
        phoneText: String((o && o.phone) || ''),
      });
    });
    return () => {
      live = false;
    };
  }, [ein]);
  return { ...state, loading: state.ein !== ein };
}

/** "0.4 mi away", "12 mi away", or '' without a distance. */
export function milesAway(mi) {
  if (!Number.isFinite(mi)) return '';
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi away`;
}

const popBox = (x, y, width, z = 2) =>
  S(`position:absolute;left:${x}%;top:${y}%;transform:translate(-50%, calc(-100% - 16px));width:${width}px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:${SH.popup};z-index:${z}`);

// Every action in a nonprofit popup is at least 44px tall, and a short one
// ("Call") at least 44px wide, so a thumb can hit it.
const footLink = S(`display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;font:600 14px/1 ${F.body};color:${C.ink}`);
const primaryLink = S(`display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;border-radius:999px;background:${C.ember};color:#fff;font:600 14px/1 ${F.body}`);

/**
 * Popup for a nonprofit's dot: its name, cause, distance, street address, and
 * what someone can do next. Volunteer with them (their volunteer page) or
 * Visit website (their homepage, when no volunteer page was found), the same
 * names the org's page uses for the same links; Call when it has a phone;
 * Directions; and Open page (the org's page on VolunteerU, which is the main
 * action when there's no site to send them to).
 * @param {object} props
 * @param {string} props.ein @param {string} props.name @param {string} [props.cause]
 * @param {string} [props.address] @param {number} [props.miles] from the visitor, when known
 * @param {string} props.href the org's page @param {string} props.directions
 */
export function MapOrgPopup({ x, y, ein, name, cause, address, miles, href, directions, width = 248 }) {
  const links = useOrgLinks(ein);
  const out = links.volunteer || links.website;
  const meta = [cause && !/^nonprofit$/i.test(cause) ? cause : '', milesAway(miles)].filter(Boolean);
  return (
    <div className="vu-mappop" data-ein={ein} style={popBox(x, y, width)}>
      <div style={S('position:relative;padding:12px 14px 10px')}>
        <Link href={href} className="vu-card-link" style={S(`display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;font:600 15px/20px ${F.body};color:${C.ink}`)}>
          {name}
        </Link>
        {meta.length ? (
          <div style={S(`margin-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>
            {meta.map((m, i) => (
              <span key={m}>
                {i ? <Sep /> : null}
                {m}
              </span>
            ))}
          </div>
        ) : null}
        <PlaceLine place={address} />
      </div>
      <div style={S(`position:relative;z-index:2;display:flex;flex-wrap:wrap;align-items:center;column-gap:14px;row-gap:2px;padding:6px 14px 6px;border-top:1px solid ${C.line}`)}>
        {links.loading ? (
          <span role="status" style={S(`display:inline-flex;align-items:center;min-height:44px;font:400 13px/1.3 ${F.body};color:${C.ink2}`)}>
            Looking for their volunteer page
          </span>
        ) : out ? (
          <a href={out} target="_blank" rel="noopener noreferrer" className="vu-btn-primary" data-act={links.volunteer ? 'volunteer' : 'website'} style={primaryLink}>
            {links.volunteer ? 'Volunteer with them' : 'Visit website'}
            <Icon name="external" size={14} />
            <span className="vu-sr">{links.volunteer ? "(opens their volunteer page in a new tab)" : '(opens their website in a new tab)'}</span>
          </a>
        ) : (
          <Link href={href} className="vu-btn-primary" data-act="open" style={primaryLink}>
            Open page
          </Link>
        )}
        {links.phone ? (
          <a href={links.phone} className="vu-link-ul" data-act="call" style={footLink}>
            Call
            {links.phoneText ? <span className="vu-sr">{links.phoneText}</span> : null}
          </a>
        ) : null}
        <a href={directions} target="_blank" rel="noopener noreferrer" className="vu-link-ul" data-act="directions" style={footLink}>
          Directions
          <span className="vu-sr">(opens Google Maps in a new tab)</span>
        </a>
        {out || links.loading ? (
          <Link href={href} className="vu-link-ul" data-act="open" style={footLink}>
            Open page
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Popup for several nonprofits on one dot: one address (a shared office
 * building), or, with `together`, dots too close to tell apart at this zoom.
 * "{n} nonprofits here" (or "close together"), the address when they share
 * one, and one row each linking to its page, with its own address when they
 * don't. `onZoom`, when given, adds Zoom in, which pulls the dots apart.
 * @param {{ orgs: Array<{ein:string,name:string,cause?:string,address?:string}>, address?:string, miles?:number, directions?:string, together?:boolean, onZoom?:(()=>void)|null }} props
 */
export function MapOrgListPopup({ x, y, orgs = [], address, miles, directions, together = false, onZoom = null, width = 272, listMax = 260 }) {
  const meta = [address, milesAway(miles)].filter(Boolean).join(', ');
  const ownAddress = together && !address;
  return (
    <div className="vu-mappop" data-group={together ? String(orgs.length) : undefined} style={popBox(x, y, width, 4)}>
      <div style={S(`position:relative;padding:12px 14px 10px;border-bottom:1px solid ${C.line}`)}>
        <div style={S(`font:600 14px/18px ${F.body};color:${C.ink}`)}>
          {orgs.length} nonprofits {ownAddress ? 'close together' : 'here'}
        </div>
        {meta ? <div className="vu-trunc" style={S(`margin-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>{meta}</div> : null}
      </div>
      <ul style={S(`margin:0;padding:4px 0;list-style:none;max-height:${listMax}px;overflow-y:auto;overscroll-behavior:contain`)}>
        {orgs.map((o) => (
          <li key={o.ein} style={S('position:relative;padding:8px 14px')}>
            <Link href={`/nonprofits/${o.ein}`} className="vu-card-link vu-trunc" style={S(`display:block;font:600 14px/18px ${F.body};color:${C.ink}`)}>
              {o.name}
            </Link>
            {o.cause && !/^nonprofit$/i.test(o.cause) ? <div style={S(`margin-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>{o.cause}</div> : null}
            {ownAddress && o.address ? <div className="vu-trunc" style={S(`margin-top:2px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>{o.address}</div> : null}
          </li>
        ))}
      </ul>
      {onZoom ? (
        <div style={S(`position:relative;z-index:2;display:flex;flex-wrap:wrap;column-gap:18px;padding:0 14px;border-top:1px solid ${C.line}`)}>
          <button type="button" onClick={onZoom} className="vu-link-ul" data-act="zoom" style={{ ...footLink, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
            Zoom in to see each one
          </button>
          {directions ? (
            <a href={directions} target="_blank" rel="noopener noreferrer" className="vu-link-ul" data-act="directions" style={footLink}>
              Directions
              <span className="vu-sr">(opens Google Maps in a new tab)</span>
            </a>
          ) : null}
        </div>
      ) : (
        <PopupLinks directions={directions} />
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
export function MapListPopup({ x, y, items = [], photos, place, directions, width = 272, listMax = 260, hrefFor }) {
  return (
    <div
      className="vu-mappop"
      style={S(`position:absolute;left:${x}%;top:${y}%;transform:translate(-50%, calc(-100% - 22px));width:${width}px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:${SH.popup};z-index:4`)}
    >
      <div style={S(`position:relative;padding:12px 14px 10px;border-bottom:1px solid ${C.line}`)}>
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
      <PopupLinks directions={directions} />
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
        <i aria-hidden="true" style={S(`display:block;width:12px;height:12px;${NP_RING}`)} />
        Nonprofit, not on VolunteerU
      </span>
    </div>
  );
}
