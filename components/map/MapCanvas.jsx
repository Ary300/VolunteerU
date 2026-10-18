'use client';

/* ==========================================================================
   MapCanvas, one live Leaflet map for Discover.

   Draws what DiscoverMap hands it: a day/time pill pin per place (MapPins'
   look, as Leaflet divIcons at real coordinates), hollow dots for nonprofits,
   and the popup for the picked pin, laid over the map in React so it can
   hold next/link links and the listing's photo. The map pans so an open
   popup fits inside it.

   Controls (top right): zoom in and out, Near me (browser location, a blue
   dot), and Expand when the caller passes onExpand. The scroll wheel zooms
   only once the map has been clicked or focused, so the page never gets
   stuck scrolling the map; `wheel="always"` is for the full-screen map.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { S } from '../../lib/style.js';
import { C, F, R, SH } from '../../lib/tokens.js';
import { directionsHref } from '../../lib/geo.js';
import { Icon } from '../ui.jsx';
import { MapPopup, MapListPopup, MapOrgPopup, pinHtml, dotHtml } from '../vu/MapPins.jsx';
import { loadLeaflet, createBaseMap, INDIANAPOLIS, DEFAULT_ZOOM, FIT_MAX_ZOOM, useReducedMotion } from './leaflet.js';

const POP_GAP = 22; // popup bottom to the pin's center (MapPopup's own offset)
const POP_EDGE = 10; // room kept between a popup and the map's edge
const OVERLAY_GAP = 8; // room kept between a popup and the key or the buttons
const MIN_VISIBLE = 240; // never treat less than this much of the map as on screen
const NEAR_ZOOM = 14;
const FIT_PADDING = 48;
const FIT_PADDING_TOP = 104;
const GEO_OPTS = { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 };

const NEAR_ME_ERRORS = {
  denied: 'Location is off for this site. Turn it on in your browser settings to use Near me.',
  unavailable: "Couldn't find where you are. Try again in a moment.",
  unsupported: "This browser can't share your location.",
};

/**
 * @param {object} props
 * @param {Array<{key:string,point:{lat:number,lng:number},items:object[],label:string,address:string,ariaLabel:string}>} props.pins
 * @param {Array<{key:string,ein:string,name:string,cause?:string,address?:string,point:{lat:number,lng:number}}>} [props.dots]
 * @param {Map<string, object|null>} [props.photos]
 * @param {string|null} [props.highlight] listing id hovered in the list
 * @param {string|null} props.picked a pin or dot key
 * @param {(key:string|null, how?:{keyboard?:boolean})=>void} props.onPick
 * @param {{lat:number,lng:number}|null} [props.center] where to look when there are no pins
 * @param {'focus'|'always'} [props.wheel]
 * @param {()=>void} [props.onExpand]
 * @param {number} [props.notOnMap] listings that couldn't be placed
 * @param {string} [props.ariaLabel]
 * @param {boolean} [props.autoFocus] focus the map once it's drawn (the full-screen map)
 */
export default function MapCanvas({ pins, dots = [], photos, highlight = null, picked, onPick, center = null, wheel = 'focus', onExpand, notOnMap = 0, ariaLabel = 'Map', autoFocus = false, className, style }) {
  const reduced = useReducedMotion();
  const wrapRef = useRef(null);
  const elRef = useRef(null);
  const popRef = useRef(null);
  const keyRef = useRef(null);
  const ctrlRef = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const markers = useRef(new Map()); // key -> { marker, label }
  const dotMarkers = useRef(new Map());
  const hereRef = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);
  const [locating, setLocating] = useState(false);
  const [nearMsg, setNearMsg] = useState('');
  const keyboardPick = useRef(false);

  /* ---- the map itself ---------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !elRef.current) return;
        LRef.current = L;
        const map = createBaseMap(L, elRef.current, { center: center || INDIANAPOLIS, zoom: DEFAULT_ZOOM });
        mapRef.current = map;
        const redraw = () => setTick((t) => t + 1);
        map.on('move zoom resize viewreset', redraw);
        map.on('click', () => pickRef.current(null));
        if (wheel === 'always') {
          map.scrollWheelZoom.enable();
        } else {
          map.on('focus click', () => map.scrollWheelZoom.enable());
          map.on('blur', () => map.scrollWheelZoom.disable());
          map.getContainer().addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
        }
        setReady(true);
        if (autoFocus) map.getContainer().focus({ preventScroll: true });
      })
      .catch((err) => {
        console.error('[map] Leaflet failed to load', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      markers.current = new Map();
      dotMarkers.current = new Map();
      hereRef.current = null;
    };
    // The map is built once per mount; later prop changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The focusable map names what it shows; the count changes as pins land.
  useEffect(() => {
    if (ready && mapRef.current) mapRef.current.getContainer().setAttribute('aria-label', `${ariaLabel}. Use the arrow keys to move the map.`);
  }, [ready, ariaLabel]);

  // The box can change size (sticky column, sheet, full screen) without a window resize.
  useEffect(() => {
    const el = wrapRef.current;
    if (!ready || !el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => mapRef.current && mapRef.current.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // The side map can start partly below the fold (or scroll partly above it).
  // Keep the OpenStreetMap credit on screen by lifting it over the hidden part.
  useEffect(() => {
    const el = wrapRef.current;
    if (!ready || !el) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      el.style.setProperty('--vu-map-hidden', `${offscreen(el).bottom}px`);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
    };
  }, [ready]);

  /** Enter or Space on a focused pin or dot opens its popup. */
  function onKeys(marker, key) {
    const el = marker.getElement();
    if (!el) return;
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        keyboardPick.current = true;
        pickRef.current(key, { keyboard: true });
      }
    });
  }

  /* ---- pins ------------------------------------------------------------------ */
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const keep = new Set(pins.map((p) => p.key));
    markers.current.forEach((m, key) => {
      if (!keep.has(key)) {
        m.marker.remove();
        markers.current.delete(key);
      }
    });
    pins.forEach((pin) => {
      const have = markers.current.get(pin.key);
      const on = isOn(pin, picked, highlight);
      if (have) {
        have.marker.setLatLng([pin.point.lat, pin.point.lng]);
        if (have.label !== pin.label) {
          // setIcon swaps the element, so its key handler goes on again.
          have.marker.setIcon(L.divIcon({ className: 'vu-lpin', html: pinHtml(pin.label, on), iconSize: [0, 0] }));
          have.label = pin.label;
          onKeys(have.marker, pin.key);
        }
        labelMarker(have.marker, pin, on);
        return;
      }
      const marker = L.marker([pin.point.lat, pin.point.lng], {
        icon: L.divIcon({ className: 'vu-lpin', html: pinHtml(pin.label, on), iconSize: [0, 0] }),
        keyboard: true,
        riseOnHover: true,
      });
      marker.on('click', (e) => {
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        pickRef.current(pin.key, { keyboard: false });
      });
      marker.on('add', () => onKeys(marker, pin.key));
      marker.addTo(map);
      labelMarker(marker, pin, on);
      markers.current.set(pin.key, { marker, label: pin.label });
    });
    // Selection is drawn by the effect below; this one only adds and removes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pins]);

  // Picked or hovered pins turn ink and rise above the rest.
  useEffect(() => {
    if (!ready) return;
    pins.forEach((pin) => {
      const m = markers.current.get(pin.key);
      if (!m) return;
      const on = isOn(pin, picked, highlight);
      const el = m.marker.getElement();
      const pill = el && el.firstElementChild;
      if (pill) pill.classList.toggle('is-on', on);
      if (el) el.setAttribute('aria-pressed', picked === pin.key ? 'true' : 'false');
      m.marker.setZIndexOffset(on ? 1000 : 0);
    });
  }, [ready, pins, picked, highlight]);

  /* ---- nonprofit dots ------------------------------------------------------- */
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const keep = new Set(dots.map((d) => d.key));
    dotMarkers.current.forEach((m, key) => {
      if (!keep.has(key)) {
        m.remove();
        dotMarkers.current.delete(key);
      }
    });
    dots.forEach((d) => {
      if (dotMarkers.current.has(d.key)) return;
      const marker = L.marker([d.point.lat, d.point.lng], {
        icon: L.divIcon({ className: 'vu-lnp', html: dotHtml(), iconSize: [0, 0] }),
        keyboard: true,
        zIndexOffset: -500,
      });
      marker.on('click', (e) => {
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        pickRef.current(d.key, { keyboard: false });
      });
      marker.on('add', () => {
        const el = marker.getElement();
        if (!el) return;
        el.setAttribute('aria-label', `${d.name}, nonprofit from IRS records`);
        el.setAttribute('data-ein', d.ein);
        onKeys(marker, d.key);
      });
      marker.addTo(map);
      dotMarkers.current.set(d.key, marker);
    });
  }, [ready, dots]);

  /* ---- what the map looks at ------------------------------------------------ */
  // Fit to the pins whenever the set of places changes; with none, look at the
  // searched town (or Indianapolis). Debounced, since lazily placed pins arrive one
  // by one.
  const placesKey = pins.map((p) => `${p.point.lat.toFixed(5)},${p.point.lng.toFixed(5)}`).sort().join('|');
  const centerKey = center ? `${center.lat.toFixed(4)},${center.lng.toFixed(4)}` : '';
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return undefined;
    const t = setTimeout(() => {
      // A pin that lands while a popup is open doesn't yank the map out from under it.
      if (!mapRef.current || pickedRef.current) return;
      const animate = !reduced;
      if (pins.length) {
        const bounds = L.latLngBounds(pins.map((p) => [p.point.lat, p.point.lng]));
        // More room at the top, where the key sits, and on the right, under the
        // buttons; any part of the box that's off screen right now doesn't count.
        const off = wrapRef.current ? offscreen(wrapRef.current) : { top: 0, bottom: 0 };
        map.fitBounds(bounds, { paddingTopLeft: [FIT_PADDING, FIT_PADDING_TOP + off.top], paddingBottomRight: [FIT_PADDING + 24, FIT_PADDING + off.bottom], maxZoom: FIT_MAX_ZOOM, animate });
      } else {
        const c = center || INDIANAPOLIS;
        map.setView([c.lat, c.lng], DEFAULT_ZOOM, { animate });
      }
    }, 250);
    return () => clearTimeout(t);
    // placesKey and centerKey stand in for pins and center.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, placesKey, centerKey]);

  /* ---- popup ---------------------------------------------------------------- */
  const map = mapRef.current;
  const pickedPin = picked ? pins.find((p) => p.key === picked) || null : null;
  const pickedDot = picked && !pickedPin ? dots.find((d) => d.key === picked) || null : null;
  const target = pickedPin || pickedDot;

  // Pan so the open popup sits inside the map, then move keyboard focus into
  // it when a key opened it.
  useLayoutEffect(() => {
    const pop = popRef.current && popRef.current.querySelector('.vu-mappop');
    if (!ready || !map || !target || !pop) return;
    const pt = map.latLngToContainerPoint([target.point.lat, target.point.lng]);
    const size = map.getSize();
    const off = wrapRef.current ? offscreen(wrapRef.current) : { top: 0, bottom: 0 };
    const { dx, dy } = popupPan({
      pt,
      size,
      popW: pop.offsetWidth,
      popH: pop.offsetHeight,
      off,
      keyBottom: boxBottom(keyRef.current),
      ctrl: ctrlRef.current ? { left: ctrlRef.current.offsetLeft, bottom: boxBottom(ctrlRef.current) } : null,
    });
    if (dx || dy) map.panBy([dx, dy], { animate: !reduced });
    if (keyboardPick.current) {
      keyboardPick.current = false;
      const first = pop.querySelector('a[href]');
      if (first) first.focus({ preventScroll: true });
    }
    // When a different pin opens, or the key grows or shrinks under an open popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, picked, notOnMap > 0, Boolean(nearMsg)]);

  let popup = null;
  if (ready && map && target) {
    const pt = map.latLngToContainerPoint([target.point.lat, target.point.lng]);
    const size = map.getSize();
    const W = Math.max(1, size.x);
    const H = Math.max(1, size.y);
    const popW = pickedPin && pickedPin.items.length > 1 ? Math.min(272, W - 2 * POP_EDGE) : Math.min(248, W - 2 * POP_EDGE);
    const half = popW / 2 + POP_EDGE;
    const x = (Math.min(W - half, Math.max(half, pt.x)) / W) * 100;
    const y = (pt.y / H) * 100;
    const directions = directionsHref(target.point.lat, target.point.lng);
    if (pickedPin && pickedPin.items.length > 1) {
      const first = pickedPin.items[0];
      popup = (
        <MapListPopup
          x={x}
          y={y}
          width={popW}
          listMax={Math.max(120, Math.min(260, H - 150))}
          place={first.place || pickedPin.address}
          items={pickedPin.items.map((it) => ({ id: it.id, name: it.name, whenLabel: it.when || '' }))}
          photos={photos}
          directions={directions}
        />
      );
    } else if (pickedPin) {
      const l = pickedPin.items[0];
      popup = (
        <MapPopup
          x={x}
          y={y}
          width={popW}
          href={`/join/${l.id}`}
          title={l.name}
          date={l.next ? l.next.d : null}
          time={l.next ? l.next.t : ''}
          photo={photos ? photos.get(l.id) : null}
          cause={l.cause}
          place={l.place || ''}
          directions={directions}
        />
      );
    } else {
      popup = (
        <MapOrgPopup
          x={x}
          y={y}
          width={popW}
          name={pickedDot.name}
          cause={pickedDot.cause}
          address={pickedDot.address}
          href={`/nonprofits/${pickedDot.ein}`}
          directions={directions}
        />
      );
    }
  }

  /* ---- controls --------------------------------------------------------------- */
  function zoomBy(d) {
    if (!map) return;
    if (d > 0) map.zoomIn(1, { animate: !reduced });
    else map.zoomOut(1, { animate: !reduced });
  }

  function nearMe() {
    setNearMsg('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNearMsg(NEAR_ME_ERRORS.unsupported);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const L = LRef.current;
        const m = mapRef.current;
        if (!L || !m) return;
        const at = [pos.coords.latitude, pos.coords.longitude];
        if (hereRef.current) hereRef.current.setLatLng(at);
        else {
          hereRef.current = L.circleMarker(at, { radius: 7, weight: 3, color: '#fff', fillColor: C.here, fillOpacity: 1, interactive: false, className: 'vu-here' }).addTo(m);
        }
        m.setView(at, Math.max(m.getZoom(), NEAR_ZOOM), { animate: !reduced });
      },
      (err) => {
        setLocating(false);
        setNearMsg(err && err.code === 1 ? NEAR_ME_ERRORS.denied : NEAR_ME_ERRORS.unavailable);
      },
      GEO_OPTS
    );
  }

  // A Near me message clears itself after a while.
  useEffect(() => {
    if (!nearMsg) return undefined;
    const t = setTimeout(() => setNearMsg(''), 8000);
    return () => clearTimeout(t);
  }, [nearMsg]);

  return (
    <div
      ref={wrapRef}
      className={['vu-dmap', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={{ ...S(`position:relative;overflow:hidden;border-radius:${R.photo};background:${C.mapLand};isolation:isolate`), ...(style || {}) }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && picked) {
          e.stopPropagation();
          e.preventDefault();
          pickRef.current(null);
        }
      }}
    >
      <div ref={elRef} className="vu-leaflet" style={S('position:absolute;inset:0;z-index:0')} />

      {failed ? (
        <div style={S(`position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font:500 14px/1.5 ${F.body};color:${C.ink2}`)}>
          The map didn&apos;t load. Check your connection and reload the page.
        </div>
      ) : null}

      {/* Above the key and the buttons, so nothing ever draws over an open popup. */}
      <div ref={popRef} style={S('position:absolute;inset:0;pointer-events:none;z-index:4')}>
        {popup ? <div style={S('pointer-events:auto')}>{popup}</div> : null}
      </div>

      <div ref={keyRef} style={S('position:absolute;left:12px;top:12px;right:64px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;pointer-events:none;z-index:3')}>
        <MapKey />
        {notOnMap > 0 ? (
          <span className="vu-map-note" style={S(`max-width:100%;background:#fff;border-radius:${R.pill};box-shadow:${SH.float};padding:7px 12px;font:500 13px/1.25 ${F.body};color:${C.ink2}`)}>
            {notOnMap} {notOnMap === 1 ? "listing isn't" : "listings aren't"} on the map
          </span>
        ) : null}
        {nearMsg ? (
          <span role="status" className="vu-map-note" style={S(`max-width:100%;background:#fff;border-radius:${R.photo};box-shadow:${SH.float};padding:8px 12px;font:500 13px/1.35 ${F.body};color:${C.ink}`)}>
            {nearMsg}
          </span>
        ) : null}
      </div>

      <div ref={ctrlRef} style={S('position:absolute;right:12px;top:12px;display:flex;flex-direction:column;gap:8px;z-index:3')}>
        <div style={S(`background:#fff;border-radius:${R.control};box-shadow:${SH.float};display:grid;overflow:hidden`)}>
          <MapButton label="Zoom in" icon="plus" disabled={!ready} onClick={() => zoomBy(1)} />
          <MapButton label="Zoom out" icon="minus" disabled={!ready} onClick={() => zoomBy(-1)} divider />
        </div>
        <div style={S(`background:#fff;border-radius:${R.control};box-shadow:${SH.float};display:grid;overflow:hidden`)}>
          <MapButton label={locating ? 'Finding you' : 'Near me'} icon="crosshair" disabled={!ready || locating} onClick={nearMe} />
          {onExpand ? <MapButton label="Expand map" icon="maximize" onClick={onExpand} divider /> : null}
        </div>
      </div>
    </div>
  );
}

/** How much of the box is above the top and below the bottom of the window, in px. */
function offscreen(el) {
  if (typeof window === 'undefined') return { top: 0, bottom: 0 };
  const r = el.getBoundingClientRect();
  const room = Math.max(0, r.height - MIN_VISIBLE);
  const top = Math.min(room, Math.max(0, -r.top));
  const bottom = Math.min(room - top, Math.max(0, r.bottom - window.innerHeight));
  return { top: Math.round(top), bottom: Math.round(bottom) };
}

/** Bottom edge of an overlay inside the map box, or 0 when it's empty. */
function boxBottom(el) {
  return el && el.offsetHeight ? el.offsetTop + el.offsetHeight : 0;
}

/**
 * How far to pan so a popup above the pin at `pt` sits inside the visible part
 * of the map, below the key and clear of the buttons. Where it can't fit below
 * the key, it may cover the key (the popup layer draws on top).
 */
function popupPan({ pt, size, popW, popH, off, keyBottom, ctrl }) {
  const visTop = off.top + POP_EDGE;
  const maxY = size.y - off.bottom - 24;
  const need = popH + POP_GAP;
  let minY = Math.max(visTop, keyBottom ? keyBottom + OVERLAY_GAP : 0) + need;
  if (minY > maxY) minY = visTop + need;
  let targetY = pt.y;
  if (targetY < minY) targetY = minY;
  else if (targetY > maxY) targetY = Math.max(minY, maxY);

  const half = popW / 2;
  let left = POP_EDGE + half;
  let right = size.x - POP_EDGE - half;
  if (ctrl && targetY - need < ctrl.bottom + OVERLAY_GAP) {
    // Beside the buttons: keep left of them if it fits, or else drop below them.
    const besideRight = ctrl.left - OVERLAY_GAP - half;
    const belowY = ctrl.bottom + OVERLAY_GAP + need;
    if (besideRight >= left) right = besideRight;
    else if (belowY <= maxY) targetY = Math.max(targetY, belowY);
  }
  let targetX = pt.x;
  if (targetX < left) targetX = left;
  else if (targetX > right) targetX = Math.max(left, right);
  return { dx: Math.round(pt.x - targetX), dy: Math.round(pt.y - targetY) };
}

function isOn(pin, picked, highlight) {
  return picked === pin.key || (highlight !== null && highlight !== undefined && pin.items.some((l) => l.id === highlight));
}

function labelMarker(marker, pin, on) {
  const el = marker.getElement();
  if (!el) return;
  el.setAttribute('aria-label', pin.ariaLabel);
  el.setAttribute('data-pin', pin.key);
  el.setAttribute('data-count', String(pin.items.length));
  el.setAttribute('data-lat', pin.point.lat.toFixed(6));
  el.setAttribute('data-lng', pin.point.lng.toFixed(6));
  if (on) el.firstElementChild && el.firstElementChild.classList.add('is-on');
}

function MapButton({ label, icon, disabled, onClick, divider = false }) {
  return (
    <button
      type="button"
      className="vu-iconbtn-sm"
      aria-label={label}
      title={label}
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
    <div style={S(`max-width:100%;display:flex;flex-wrap:wrap;column-gap:14px;row-gap:6px;align-items:center;background:#fff;border-radius:${R.photo};padding:7px 12px;box-shadow:${SH.float};font:500 12px/1 ${F.body};color:${C.ink2}`)}>
      <span style={S('display:inline-flex;align-items:center;gap:6px;white-space:nowrap')}>
        <i aria-hidden="true" style={S(`font-style:normal;padding:3px 6px;border-radius:${R.pill};background:#fff;box-shadow:0 1px 3px rgba(30,36,33,.28);font:600 10px/1 ${F.body};color:${C.ink};font-variant-numeric:tabular-nums`)}>9 AM</i>
        Opportunity
      </span>
      <span style={S('display:inline-flex;align-items:center;gap:6px;white-space:nowrap')}>
        <i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${C.ink3}`, display: 'block', background: '#fff' }} />
        Nonprofit, not on VolunteerU
      </span>
    </div>
  );
}
