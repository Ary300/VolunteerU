'use client';

/* ==========================================================================
   MapPanel.jsx, where things are.

   DiscoverMap   Discover's sketch map: a day/time pill pin for each place in
                 the list (a dot when undated), a popup for the picked pin,
                 hollow dots for IRS nonprofits, zoom and a legend.
   AddressMap    one address and an "Open in Maps" link (Detail).

   Listings carry a free-text address and no coordinates, so DiscoverMap
   draws a plain town (land, a river, roads) and places pins by address:
   one address always lands on one spot, several listings at one address
   share a pin, and the map says it's a sketch. It never puts a pin on a real
   street. The listing page has the real address and a link to a real map.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { S } from '../lib/style.js';
import { C, F, R, SH } from '../lib/tokens.js';
import { Icon } from './ui.jsx';
import { shiftDates } from '../lib/calendar.js';
import { MapPin, MapDot, MapPopup, MapListPopup, pinLabel } from './vu/MapPins.jsx';

/** A map search for an address, opened in a new tab. */
export function mapsHref(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(address || '').trim())}`;
}

/* ---- placement ------------------------------------------------------------ */

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** One key per address, so "12 Elm St, Rivertown" and " 12 elm st,  Rivertown." match. */
function placeKey(addr) {
  return String(addr || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/[.,;\s]+$/, '');
}

/** A stable spot (percent of the map box) for an address. */
function spotFor(key, salt = '') {
  const h = hash(`${salt}${placeKey(key)}`);
  return { x: 14 + ((h % 1000) / 1000) * 72, y: 18 + (((h >>> 10) % 1000) / 1000) * 62 };
}

/** Online listings and team projects have no place to pin. */
export function isPinnable(l) {
  if (!l) return false;
  if (l.delivery === 'remote' || l.org_type === 'team') return false;
  return Boolean(l.location || l.site);
}

/** Start of a listing's next shift in ms, or Infinity when it has none. */
function nextStartMs(l) {
  if (!l || !l.next) return Infinity;
  const d = shiftDates(l.next);
  return d ? d.start.getTime() : Infinity;
}

/** "Sat 10 AM" for a listing's next shift; '' without one (the pin is a dot). */
function labelFor(l) {
  return l && l.next ? pinLabel(`${l.next.d} ${l.next.t}`) : '';
}

/** Listings grouped by address, soonest shift first inside each group. */
function groupByPlace(listings) {
  const groups = new Map();
  listings.filter(isPinnable).forEach((l) => {
    const key = placeKey(l.location || l.site);
    const g = groups.get(key);
    groups.set(key, g ? { key, items: [...g.items, l] } : { key, items: [l] });
  });
  return [...groups.values()].map((g) => ({
    key: g.key,
    items: [...g.items].sort((a, b) => nextStartMs(a) - nextStartMs(b)),
  }));
}

// Pins are pills about 30px tall; their width follows the label.
const PIN_H = 30;
const pinWidth = (label) => (label ? 22 + String(label).length * 7.6 : 16);
// Places to try, in px from the address's spot, nearest first.
const NUDGES = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [0, -2], [2, 0], [-2, 0], [1, 2], [-1, 2], [1, -2], [-1, -2]];

const MIN_ZOOM = 1;
const MAX_ZOOM = 2;
const POP_HEAD = 60;
const POP_ROW = 60;

/**
 * @param {object} props
 * @param {Array<{id:string,name:string,site?:string,location?:string,cause?:string,next?:{d:string,t:string}|null,when?:string,place?:string}>} props.listings rows from DiscoverListings' onRows
 * @param {Map<string, object|null>} [props.photos] the cards' own photos (never stock)
 * @param {Array<{ein:number|string,name:string}>} [props.nonprofits]
 * @param {string|null} [props.highlight] listing id hovered in the list (its pin turns ink)
 * @param {(ids:string|string[]|null)=>void} [props.onPick] a pin was picked: its listing id, or every id at that address; null when closed
 * @param {(org:object)=>void} [props.onOpenNonprofit]
 * @param {string} [props.town] the searched place, written on the sketch
 */
export function DiscoverMap({ listings = [], photos, nonprofits = [], highlight = null, onPick, onOpenNonprofit, town = '', className, style }) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [picked, setPicked] = useState(null); // a place key
  const box = useRef(null);
  const [size, setSize] = useState({ w: 480, h: 760 });

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const groups = useMemo(() => groupByPlace(listings), [listings]);

  const pins = useMemo(() => {
    // One pin per address. A pin that would cover an earlier one tries the
    // spots beside, above and below its own.
    const W = Math.max(1, size.w);
    const H = Math.max(1, size.h);
    const placed = [];
    return groups.map((g) => {
      const n = g.items.length;
      const first = labelFor(g.items[0]);
      const label = n > 1 ? (first ? `${first} +${n - 1}` : `${n} here`) : first;
      const w = pinWidth(label);
      const base = spotFor(g.key);
      const clash = (x, y) => placed.some((p) => Math.abs(((p.x - x) / 100) * W) < (p.w + w) / 2 + 6 && Math.abs(((p.y - y) / 100) * H) < PIN_H + 6);
      let spot = { x: base.x, y: base.y };
      for (const [i, j] of NUDGES) {
        const x = base.x + ((i * (w + 8)) / W) * 100;
        const y = base.y + ((j * (PIN_H + 8)) / H) * 100;
        if (x < 8 || x > 92 || y < 10 || y > 88) continue;
        if (!clash(x, y)) {
          spot = { x, y };
          break;
        }
      }
      const pin = { key: g.key, items: g.items, label, w, ...spot };
      placed.push(pin);
      return pin;
    });
  }, [groups, size.w, size.h]);

  const idsOf = (pin) => (pin.items.length === 1 ? pin.items[0].id : pin.items.map((l) => l.id));

  // A pick whose address left the list (filters changed) closes its popup.
  useEffect(() => {
    if (picked && !groups.some((g) => g.key === picked)) {
      setPicked(null);
      if (onPick) onPick(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const dots = useMemo(() => (nonprofits || []).slice(0, 12).map((o) => ({ o, ...spotFor(o.ein, 'np') })), [nonprofits]);

  const zoomed = (x, y) => ({ x: 50 + (x - 50) * zoom, y: 50 + (y - 50) * zoom });
  const inView = ({ x, y }) => x > 3 && x < 97 && y > 3 && y < 97;

  function pick(pin) {
    const next = picked === pin.key ? null : pin.key;
    setPicked(next);
    if (onPick) onPick(next ? idsOf(pin) : null);
  }

  const pickedPin = pins.find((p) => p.key === picked) || null;
  let popup = null;
  if (pickedPin) {
    const at = zoomed(pickedPin.x, pickedPin.y);
    if (inView(at)) {
      // Above the pin when it fits, else below, else on the roomier side with
      // the list cut to fit (it scrolls). Pulled in from the side edges.
      const many = pickedPin.items.length > 1;
      const l = pickedPin.items[0];
      const ownPhoto = photos ? photos.get(l.id) : null;
      const popW = many ? 272 : 248;
      const H = Math.max(1, size.h);
      const pinY = (at.y / 100) * H;
      const above = pinY - 22 - 12;
      const below = H - pinY - 22 - 12;
      const want = many ? POP_HEAD + Math.min(pickedPin.items.length, 4) * POP_ROW + 8 : ownPhoto && ownPhoto.src ? 220 : 90;
      const flip = want > above && (want <= below || below > above);
      const room = flip ? below : above;
      const popH = many ? Math.max(POP_HEAD + POP_ROW, Math.min(want, room)) : want;
      const half = ((popW / 2 + 12) / Math.max(1, size.w)) * 100;
      const px = Math.min(100 - half, Math.max(half, at.x));
      const py = flip ? at.y + ((popH + 44) / H) * 100 : at.y;
      popup = many ? (
        <MapListPopup
          x={px}
          y={py}
          width={popW}
          listMax={popH - POP_HEAD}
          place={l.place || l.site || l.location || ''}
          items={pickedPin.items.map((it) => ({ id: it.id, name: it.name, whenLabel: it.when || '' }))}
          photos={photos}
        />
      ) : (
        <MapPopup
          x={px}
          y={py}
          href={`/join/${l.id}`}
          title={l.name}
          date={l.next ? l.next.d : null}
          time={l.next ? l.next.t : ''}
          photo={ownPhoto}
          cause={l.cause}
        />
      );
    }
  }

  const pinned = pins.reduce((n, p) => n + p.items.length, 0);
  const unpinned = listings.length - pinned;
  const where = pins.length === pinned ? '' : ` at ${pins.length} ${pins.length === 1 ? 'place' : 'places'}`;

  return (
    <div
      ref={box}
      className={['vu-dmap', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={`Map of ${pinned} ${pinned === 1 ? 'opportunity' : 'opportunities'}${where}`}
      style={{ ...S(`position:relative;overflow:hidden;border-radius:${R.photo};background:${C.mapLand}`), ...(style || {}) }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && pickedPin) {
          e.stopPropagation();
          pick(pickedPin);
        }
      }}
    >
      <div aria-hidden="true" style={S(`position:absolute;inset:0;transform:scale(${zoom});transform-origin:50% 50%;transition:transform .2s ease`)}>
        <SketchTown town={town} />
      </div>

      {dots.map(({ o, x, y }) => {
        const at = zoomed(x, y);
        return inView(at) ? <MapDot key={o.ein} x={at.x} y={at.y} title={`${o.name}, nonprofit from IRS records`} onClick={onOpenNonprofit ? () => onOpenNonprofit(o) : undefined} /> : null;
      })}

      {pins.map((pin) => {
        const at = zoomed(pin.x, pin.y);
        if (!inView(at)) return null;
        const first = pin.items[0];
        const n = pin.items.length;
        const whenText = first.whenLabel ? `next on ${first.whenLabel}` : 'no dates yet';
        const ariaLabel = n > 1 ? `${n} opportunities at ${first.place || first.site || first.location}, ${whenText}` : `${first.name}, ${first.whenLabel || 'no dates yet'}`;
        return (
          <MapPin
            key={pin.key}
            x={at.x}
            y={at.y}
            label={pin.label}
            selected={picked === pin.key || (highlight !== null && pin.items.some((l) => l.id === highlight))}
            ariaLabel={ariaLabel}
            onClick={() => pick(pin)}
          />
        );
      })}

      {popup}

      <div style={S('position:absolute;top:14px;left:14px;right:72px;display:flex;pointer-events:none')}>
        <span style={S(`max-width:100%;background:#fff;border-radius:${R.photo};box-shadow:${SH.float};padding:9px 14px;font:500 13px/1.3 ${F.body};color:${C.ink2}`)}>
          Sketch map. Open a listing for its address.
        </span>
      </div>

      <div style={S(`position:absolute;right:14px;top:14px;background:#fff;border-radius:${R.control};box-shadow:${SH.float};display:grid;overflow:hidden`)}>
        <ZoomButton label="Zoom in" icon="plus" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))} />
        <ZoomButton label="Zoom out" icon="minus" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.5))} divider />
      </div>

      {/* The unplaced note and the key stack in one column, so a legend that
          wraps on a narrow map pushes the note up instead of running under it. */}
      <div style={S('position:absolute;left:14px;right:14px;bottom:14px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;pointer-events:none')}>
        {unpinned > 0 ? (
          <span style={S(`max-width:100%;background:#fff;border-radius:${R.pill};box-shadow:${SH.float};padding:7px 12px;font:500 13px/1.2 ${F.body};color:${C.ink2}`)}>
            {unpinned} online or without an address, see the list
          </span>
        ) : null}
        <MapKey />
      </div>
    </div>
  );
}

function ZoomButton({ label, icon, disabled, onClick, divider = false }) {
  return (
    <button
      type="button"
      className="vu-iconbtn-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={S(`width:40px;height:40px;display:grid;place-items:center;border-radius:0;color:${disabled ? C.ink3 : C.ink};cursor:${disabled ? 'default' : 'pointer'}${divider ? `;border-top:1px solid ${C.line}` : ''}`)}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** The map key. The opportunity swatch is a small pin, so it reads as one. */
function MapKey() {
  return (
    <div style={S(`max-width:100%;display:flex;flex-wrap:wrap;column-gap:16px;row-gap:8px;align-items:center;background:#fff;border-radius:${R.photo};padding:8px 14px;box-shadow:${SH.float};font:500 13px/1 ${F.body};color:${C.ink2}`)}>
      <span style={S('display:inline-flex;align-items:center;gap:7px;white-space:nowrap')}>
        <i aria-hidden="true" style={S(`font-style:normal;padding:4px 7px;border-radius:${R.pill};background:#fff;box-shadow:0 1px 3px rgba(30,36,33,.28);font:600 11px/1 ${F.body};color:${C.ink};font-variant-numeric:tabular-nums`)}>9 AM</i>
        Opportunity
      </span>
      <span style={S('display:inline-flex;align-items:center;gap:7px;white-space:nowrap')}>
        <i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${C.ink3}`, display: 'block', background: '#fff' }} />
        Nonprofit, not on VolunteerU
      </span>
    </div>
  );
}

/** The drawn town under the pins: land, a river and roads. No buildings, no parks, no real street names. */
function SketchTown({ town }) {
  const main = ['M0 236 H520', 'M255 0 V860', 'M0 680 L520 610', 'M60 0 L150 860'];
  const side = ['M0 150 H520', 'M0 330 H520', 'M0 440 H200', 'M370 0 V540', 'M155 0 V330', 'M0 790 H520', 'M455 0 V860', 'M255 520 H520'];
  return (
    <svg viewBox="0 0 520 860" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <rect width="520" height="860" fill={C.mapLand} />
      <path d="M-20 360 C 80 340, 140 420, 220 440 S 360 560, 420 580 S 520 600, 560 640" fill="none" stroke={C.mapWater} strokeWidth="38" strokeLinecap="round" />
      <g fill="none" strokeLinecap="round">
        <g stroke={C.mapRoadEdge} strokeWidth="13">
          {main.map((d) => <path key={d} d={d} />)}
        </g>
        <g stroke={C.mapRoad} strokeWidth="10">
          {main.map((d) => <path key={d} d={d} />)}
        </g>
        <g stroke={C.mapRoad} strokeWidth="4">
          {side.map((d) => <path key={d} d={d} />)}
        </g>
      </g>
      {town ? (
        <text x="164" y="300" fill={C.ink2} fontSize="15" fontWeight="600" fontFamily="Figtree, sans-serif">
          {String(town).slice(0, 28)}
        </text>
      ) : null}
    </svg>
  );
}

/**
 * The address as written, plus a link that opens it in a real map.
 * Renders nothing without an address.
 * @param {{ address?: string }} props
 */
export function AddressMap({ address }) {
  const text = String(address || '').trim();
  if (!text) return null;
  return (
    <div style={S('padding:14px 16px;display:flex;align-items:flex-start;gap:10px')}>
      <span style={S(`flex:none;margin-top:1px;color:${C.ink2}`)}>
        <Icon name="pin" size={18} />
      </span>
      <div style={S('min-width:0')}>
        <div style={S(`font:600 15px/1.4 ${F.body};color:${C.ink};overflow-wrap:anywhere`)}>{text}</div>
        <a
          href={mapsHref(text)}
          target="_blank"
          rel="noopener noreferrer"
          className="vu-link-ul"
          style={S(`display:inline-flex;align-items:center;gap:6px;margin-top:4px;font:500 14px/1.4 ${F.body};color:${C.ink}`)}
        >
          Open in Maps
          <Icon name="external" size={14} />
        </a>
      </div>
    </div>
  );
}

export default AddressMap;
