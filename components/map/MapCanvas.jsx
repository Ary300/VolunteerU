'use client';

/* ==========================================================================
   MapCanvas, one live Leaflet map for Discover.

   Draws what DiscoverMap hands it: a day/time pill pin per place (MapPins'
   look, as Leaflet divIcons at real coordinates), hollow dots for nonprofits,
   and the popup for the picked pin, laid over the map in React so it can
   hold next/link links and the listing's photo. The map pans so an open
   popup fits inside it.

   Dots close enough that one's tap area would cover another's (downtown, at
   the default zoom) draw as one numbered dot. Its popup lists every org in
   it, with Zoom in to pull them apart, so every dot can always be reached.
   The links in an org's popup (volunteer page, website, phone) start loading
   for the dots in view a moment after they land, so a tap rarely waits.

   With `national`, every US nonprofit on the IRS master file draws under
   all of that as its own layer (nationalLayer.js): count bubbles from the
   country view in, then dots, opening the same popups.

   Controls (top right): zoom in and out, Near me (browser location, a blue
   dot), and Expand when the caller passes onExpand. The scroll wheel zooms
   only once the map has been clicked or focused, so the page never gets
   stuck scrolling the map; `wheel="always"` is for the full-screen map.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { S } from '../../lib/style.js';
import { C, F, R, SH } from '../../lib/tokens.js';
import { directionsHref, distanceMiles } from '../../lib/geo.js';
import { Icon } from '../ui.jsx';
import { MapPopup, MapListPopup, MapOrgPopup, MapOrgListPopup, MapOrgStackPopup, pinHtml, dotHtml, dotStyle, warmOrgLinks, NP_RING } from '../vu/MapPins.jsx';
import { loadLeaflet, createBaseMap, INDIANAPOLIS, DEFAULT_ZOOM, FIT_MAX_ZOOM, useReducedMotion } from './leaflet.js';
import { useNationalLayer, nationalPick, isNationalKey } from './nationalLayer.js';

const POP_GAP = 22; // popup bottom to the pin's center (MapPopup's own offset)
const POP_EDGE = 10; // room kept between a popup and the map's edge
const OVERLAY_GAP = 8; // room kept between a popup and the key or the buttons
const MIN_VISIBLE = 240; // never treat less than this much of the map as on screen
const NEAR_ZOOM = 14;
const HERE_ZOOM = 13; // around the visitor when nothing is close by
const NEAR_MILES = 12; // what counts as "around" the visitor when fitting the view
const NEAR_MIN = 6; // ...but always the nearest few, when that radius holds fewer
const FAR_MILES = 60; // with no location, places farther than this from the rest stay out of the fit
const FAR_SHARE = 0.6; // ...but only when most places are close; a list spread over many states fits them all
// How far from its center a dot's tap area reaches, in px (globals.css,
// .vu-np-dot::before): 28px across with a mouse, 44px on a touch screen, and
// 40px for a numbered dot. Dots closer than that share a numbered dot.
const DOT_REACH = 14;
const DOT_REACH_TOUCH = 22;
const GROUP_REACH = 20;
const GROUP_ZOOM_MAX = 18; // Zoom in on a group never goes past this
const LINK_WARM_MAX = 16; // orgs whose links load ahead of a tap, nearest the middle first
const LINK_WARM_AT_ONCE = 2;
const LINK_WARM_DELAY_MS = 1500;
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
 * @param {Array<{key:string,ein:string,name:string,cause?:string,address?:string,point:{lat:number,lng:number},orgs:Array<{ein:string,name:string,cause?:string}>}>} [props.dots] one per address
 * @param {string|null} [props.hoverDot] dot key whose row is hovered in the list
 * @param {{lat:number,lng:number}|null} [props.here] the visitor's location (Near me, or the page's)
 * @param {(p:{lat:number,lng:number})=>void} [props.onHere] Near me found the visitor
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
 * @param {boolean} [props.national] draw every US nonprofit under the page's own pins and dots
 */
export default function MapCanvas({ pins, dots = [], photos, highlight = null, hoverDot = null, picked, onPick, center = null, here = null, onHere, wheel = 'focus', onExpand, notOnMap = 0, ariaLabel = 'Map', autoFocus = false, national = false, className, style }) {
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
  // Each Near me answer looks again, even when the spot is the same as last time.
  const [nearTick, setNearTick] = useState(0);
  // Places the fit left out (far from the rest), and a tick that fits everything.
  const [farOut, setFarOut] = useState(0);
  const [allTick, setAllTick] = useState(0);
  const fittedAll = useRef(''); // the places "Zoom out to see" was pressed for
  const keyboardPick = useRef(false);
  // The visitor moved the map themselves; new places stop refitting it until the results change wholesale.
  const userMoved = useRef(false);
  const fittedKeys = useRef(new Set());
  const hereRefProp = useRef(onHere);
  hereRefProp.current = onHere;

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
        map.on('dragstart', () => {
          userMoved.current = true;
        });
        map.getContainer().addEventListener('wheel', () => {
          if (map.scrollWheelZoom.enabled()) userMoved.current = true;
        }, { passive: true });
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
  // Grouped again at each zoom: dots whose tap areas overlap share one numbered dot.
  const zoom = ready && mapRef.current ? mapRef.current.getZoom() : null;
  const shown = useMemo(() => {
    const m = mapRef.current;
    if (!ready || !m || zoom === null) return dots;
    return groupDots(dots, (pt) => m.project([pt.lat, pt.lng], zoom));
  }, [ready, dots, zoom]);
  // Every group drawn since the dots last changed, so an open group's popup
  // stays put while a zoom regroups the dots under it.
  const groups = useMemo(() => new Map(), [dots]);
  shown.forEach((d) => {
    if (d.group) groups.set(d.key, d);
  });

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const keep = new Set(shown.map((d) => d.key));
    dotMarkers.current.forEach((m, key) => {
      if (!keep.has(key)) {
        m.remove();
        dotMarkers.current.delete(key);
      }
    });
    shown.forEach((d) => {
      const have = dotMarkers.current.get(d.key);
      if (have) {
        labelDot(have, d);
        return;
      }
      const n = orgCount(d);
      const size = n > 1 ? 28 : 24;
      const marker = L.marker([d.point.lat, d.point.lng], {
        icon: L.divIcon({ className: 'vu-lnp', html: dotHtml(n), iconSize: [size, size] }),
        keyboard: true,
        zIndexOffset: -500,
      });
      marker.on('click', (e) => {
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        pickRef.current(d.key, { keyboard: false });
      });
      // A pointer on its way to one org's dot starts loading that org's links.
      if (n === 1) marker.on('mouseover mousedown', () => warmOrgLinks([d.ein]));
      marker.on('add', () => {
        labelDot(marker, d);
        onKeys(marker, d.key);
        const el = marker.getElement();
        if (el && n === 1) el.addEventListener('focus', () => warmOrgLinks([d.ein]));
      });
      marker.addTo(map);
      dotMarkers.current.set(d.key, marker);
    });
  }, [ready, shown]);

  // The picked dot, or the one whose row is hovered, grows and turns ink.
  useEffect(() => {
    if (!ready) return;
    shown.forEach((d) => {
      const m = dotMarkers.current.get(d.key);
      if (!m) return;
      const on = d.key === picked || d.key === hoverDot || Boolean(hoverDot && d.members && d.members.includes(hoverDot));
      const el = m.getElement();
      const dot = el && el.querySelector('.vu-np-dot');
      if (dot) {
        dot.classList.toggle('is-on', on);
        dot.style.cssText = dotStyle(orgCount(d), on);
      }
      if (el) el.setAttribute('aria-pressed', d.key === picked ? 'true' : 'false');
      m.setZIndexOffset(on ? 900 : -500);
    });
  }, [ready, shown, picked, hoverDot]);

  // A moment after the dots land, the links for the ones in view start
  // loading, a couple at a time, so their popups open ready.
  const dotsKey = dots.map((d) => d.key).sort().join('|');
  useEffect(() => {
    if (!ready || !dots.length) return undefined;
    const t = setTimeout(() => {
      const m = mapRef.current;
      if (!m) return;
      const bounds = m.getBounds();
      const mid = m.getCenter();
      const eins = dots
        .filter((d) => bounds.contains([d.point.lat, d.point.lng]))
        .sort((a, b) => distanceMiles(mid, a.point) - distanceMiles(mid, b.point))
        .flatMap((d) => (d.orgs || [d]).map((o) => o.ein))
        .slice(0, LINK_WARM_MAX);
      warmOrgLinks(eins, LINK_WARM_AT_ONCE);
    }, LINK_WARM_DELAY_MS);
    return () => clearTimeout(t);
    // dotsKey stands in for dots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dotsKey]);

  /* ---- every nonprofit -------------------------------------------------------- */
  // The orgs drawn above as the page's own dots stay out of the national layer.
  const ownEins = useMemo(() => dots.flatMap((d) => (d.orgs && d.orgs.length ? d.orgs : [d]).map((o) => String(o.ein))), [dots]);
  const nat = useNationalLayer({
    ready,
    mapRef,
    LRef,
    enabled: national,
    exclude: ownEins,
    picked,
    pickRef,
    keyboardPick,
    reduced,
    onUserMove: () => {
      userMoved.current = true;
    },
  });

  /* ---- you are here ---------------------------------------------------------- */
  const hereKey = here ? `${here.lat.toFixed(5)},${here.lng.toFixed(5)}` : '';
  useEffect(() => {
    const L = LRef.current;
    const m = mapRef.current;
    if (!ready || !L || !m) return;
    if (!here) {
      if (hereRef.current) hereRef.current.remove();
      hereRef.current = null;
      return;
    }
    const at = [here.lat, here.lng];
    if (hereRef.current) hereRef.current.setLatLng(at);
    else hereRef.current = L.circleMarker(at, { radius: 7, weight: 3, color: '#fff', fillColor: C.here, fillOpacity: 1, interactive: false, className: 'vu-here' }).addTo(m);
    // hereKey stands in for here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hereKey]);

  /* ---- what the map looks at ------------------------------------------------ */
  // Fit to every pin and dot whenever the set of places changes. With the
  // visitor's location, fit to them and what's around them instead. With
  // nothing placed, look at the searched town (or Indianapolis). Debounced,
  // since lazily placed pins arrive one by one. Once the visitor has moved
  // the map, new places don't move it again until the results change wholesale.
  const spots = [...pins.map((p) => ({ key: p.key, point: p.point })), ...dots.map((d) => ({ key: d.key, point: d.point }))];
  const placesKey = spots.map((p) => p.key).sort().join('|');
  const centerKey = center ? `${center.lat.toFixed(4)},${center.lng.toFixed(4)}` : '';
  const spotsRef = useRef(spots);
  spotsRef.current = spots;
  useEffect(() => {
    userMoved.current = false; // a new location is a fresh look
  }, [hereKey, nearTick]);
  // Places that landed while a popup was open, so the fit runs once it closes.
  const fitPending = useRef(false);
  const [fitTick, setFitTick] = useState(0);
  const popupOpen = Boolean(picked);
  useEffect(() => {
    if (!popupOpen && fitPending.current) {
      fitPending.current = false;
      setFitTick((t) => t + 1);
    }
  }, [popupOpen]);
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return undefined;
    const t = setTimeout(() => {
      if (!mapRef.current) return;
      // A place that lands while a popup is open doesn't yank the map out
      // from under it; the fit waits until the popup closes. Moving the map
      // in the meantime still counts, so a visitor who panned keeps their view.
      if (pickedRef.current) {
        fitPending.current = true;
        return;
      }
      fitPending.current = false;
      const now = spotsRef.current;
      const keys = new Set(now.map((p) => p.key));
      const overlap = [...fittedKeys.current].some((k) => keys.has(k));
      if (userMoved.current && overlap) return;
      userMoved.current = false;
      fittedKeys.current = keys;
      const animate = !reduced;
      const off = wrapRef.current ? offscreen(wrapRef.current) : { top: 0, bottom: 0 };
      // More room at the top, where the key sits, and on the right, under the
      // buttons; any part of the box that's off screen right now doesn't count.
      const pad = { paddingTopLeft: [FIT_PADDING, FIT_PADDING_TOP + off.top], paddingBottomRight: [FIT_PADDING + 24, FIT_PADDING + off.bottom], animate };
      const pts = allTick && fittedAll.current === placesKey ? now.map((p) => p.point) : fitPoints(now.map((p) => p.point), here, center);
      setFarOut(now.length - pts.length);
      if (here) {
        if (!pts.length) map.setView([here.lat, here.lng], HERE_ZOOM, { animate });
        else map.fitBounds(L.latLngBounds([[here.lat, here.lng], ...pts.map((p) => [p.lat, p.lng])]), { ...pad, maxZoom: NEAR_ZOOM });
      } else if (pts.length) {
        map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { ...pad, maxZoom: FIT_MAX_ZOOM });
      } else {
        const c = center || INDIANAPOLIS;
        map.setView([c.lat, c.lng], DEFAULT_ZOOM, { animate });
      }
    }, 250);
    return () => clearTimeout(t);
    // placesKey, centerKey and hereKey stand in for the places, center and here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, placesKey, centerKey, hereKey, nearTick, allTick, fitTick]);

  // "Zoom out to see 3 more": fit every place, the far ones too, until the places change.
  function showAll() {
    fittedAll.current = placesKey;
    userMoved.current = false;
    fittedKeys.current = new Set();
    setAllTick((t) => t + 1);
  }

  /* ---- popup ---------------------------------------------------------------- */
  const map = mapRef.current;
  const pickedPin = picked ? pins.find((p) => p.key === picked) || null : null;
  const pickedNat = picked && !pickedPin && isNationalKey(picked) ? nationalPick(picked) : null;
  const pickedDot = picked && !pickedPin && !pickedNat ? shown.find((d) => d.key === picked) || dots.find((d) => d.key === picked) || groups.get(picked) || null : null;
  const target = pickedPin || pickedDot || pickedNat;

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
    const wide = (pickedPin && pickedPin.items.length > 1) || (pickedNat && pickedNat.kind === 'stack');
    const popW = wide ? Math.min(272, W - 2 * POP_EDGE) : Math.min(248, W - 2 * POP_EDGE);
    const half = popW / 2 + POP_EDGE;
    const x = (Math.min(W - half, Math.max(half, pt.x)) / W) * 100;
    const y = (pt.y / H) * 100;
    const directions = directionsHref(target.point.lat, target.point.lng);
    if (pickedNat && pickedNat.kind === 'stack') {
      const canZoom = !pickedNat.same && map.getZoom() < map.getMaxZoom();
      popup = (
        <MapOrgStackPopup
          key={picked}
          x={x}
          y={y}
          width={popW}
          listMax={Math.max(120, Math.min(260, H - 150))}
          n={pickedNat.n}
          eins={pickedNat.eins}
          same={pickedNat.same}
          miles={here ? distanceMiles(here, pickedNat.point) : NaN}
          directions={pickedNat.same ? directions : ''}
          onZoom={canZoom ? () => zoomToBox(pickedNat.box) : null}
        />
      );
    } else if (pickedNat) {
      popup = (
        <MapOrgPopup
          key={pickedNat.ein}
          x={x}
          y={y}
          width={popW}
          ein={pickedNat.ein}
          name=""
          cause={pickedNat.cause}
          miles={here ? distanceMiles(here, pickedNat.point) : NaN}
          href={`/nonprofits/${pickedNat.ein}`}
          directions={directions}
        />
      );
    } else if (pickedPin && pickedPin.items.length > 1) {
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
      const miles = here ? distanceMiles(here, pickedDot.point) : NaN;
      const canZoom = Boolean(pickedDot.group) && map.getZoom() < Math.min(GROUP_ZOOM_MAX, map.getMaxZoom());
      popup =
        pickedDot.orgs && pickedDot.orgs.length > 1 ? (
          <MapOrgListPopup
            x={x}
            y={y}
            width={Math.min(272, W - 2 * POP_EDGE)}
            listMax={Math.max(120, Math.min(260, H - 150))}
            orgs={pickedDot.orgs}
            address={pickedDot.address}
            miles={miles}
            directions={pickedDot.address ? directionsHref(pickedDot.address) : ''}
            together={Boolean(pickedDot.group)}
            onZoom={canZoom ? () => zoomToGroup(pickedDot) : null}
          />
        ) : (
          <MapOrgPopup
            key={pickedDot.ein}
            x={x}
            y={y}
            width={popW}
            ein={pickedDot.ein}
            name={pickedDot.name}
            cause={pickedDot.cause}
            address={pickedDot.address}
            miles={miles}
            href={`/nonprofits/${pickedDot.ein}`}
            directions={directionsHref(pickedDot.address || `${target.point.lat},${target.point.lng}`)}
          />
        );
    }
  }

  /* ---- controls --------------------------------------------------------------- */
  /** Zoom in on a group until its dots draw apart (or as far as the map goes). */
  function zoomToGroup(g) {
    const L = LRef.current;
    if (!map || !L) return;
    const pts = (g.members || []).map((k) => dots.find((d) => d.key === k)).filter(Boolean).map((d) => [d.point.lat, d.point.lng]);
    if (!pts.length) return;
    userMoved.current = true;
    pickRef.current(null);
    const b = L.latLngBounds(pts);
    // A tiny group fits at a huge zoom; ask for one step past where it splits, never past the cap.
    const want = Math.min(GROUP_ZOOM_MAX, map.getMaxZoom(), Math.max(map.getZoom() + 1, map.getBoundsZoom(b.pad(1.5))));
    map.setView(b.getCenter(), want, { animate: !reduced });
  }

  /** Zoom in on a national bubble's box, as far as the map goes. */
  function zoomToBox(box) {
    const L = LRef.current;
    if (!map || !L || !box) return;
    userMoved.current = true;
    pickRef.current(null);
    const b = L.latLngBounds([box[0], box[1]], [box[2], box[3]]);
    map.setView(b.getCenter(), Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 1, map.getBoundsZoom(b.pad(0.5)))), { animate: !reduced });
  }

  function zoomBy(d) {
    if (!map) return;
    userMoved.current = true;
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
        const m = mapRef.current;
        if (!m) return;
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (hereRefProp.current) {
          hereRefProp.current(at);
          setNearTick((t) => t + 1);
        } else {
          const L = LRef.current;
          if (L && !hereRef.current) hereRef.current = L.circleMarker([at.lat, at.lng], { radius: 7, weight: 3, color: '#fff', fillColor: C.here, fillOpacity: 1, interactive: false, className: 'vu-here' }).addTo(m);
          m.setView([at.lat, at.lng], Math.max(m.getZoom(), NEAR_ZOOM), { animate: !reduced });
        }
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
        <MapKey pins={pins.length > 0 || !(dots.length || nat.active)} dots={dots.length > 0 || !pins.length || nat.active} />
        {notOnMap > 0 ? (
          <span className="vu-map-note" style={S(`max-width:100%;background:#fff;border-radius:${R.pill};box-shadow:${SH.float};padding:7px 12px;font:500 13px/1.25 ${F.body};color:${C.ink2}`)}>
            {notOnMap} {notOnMap === 1 ? "listing isn't" : "listings aren't"} on the map
          </span>
        ) : null}
        {farOut > 0 ? (
          <button
            type="button"
            className="vu-map-note vu-btn"
            onClick={showAll}
            style={S(`pointer-events:auto;max-width:100%;min-height:36px;background:#fff;border:0;border-radius:${R.pill};box-shadow:${SH.float};padding:8px 14px;font:600 13px/1.25 ${F.body};color:${C.ink};cursor:pointer;text-align:left`)}
          >
            Zoom out to see {farOut} more {farOut === 1 ? 'place' : 'places'}
          </button>
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

/**
 * The points a fit should hold. Around the visitor: everything within
 * NEAR_MILES, or at least the nearest NEAR_MIN. Otherwise every point except
 * strays far from the rest (an org whose IRS address is its national office),
 * and only when most points are close together: a list spread across many
 * states (a keyword search with no place) fits all of them. Whatever is left
 * out is counted on the map, with a button that fits it in.
 */
function fitPoints(points, here, center) {
  if (!points.length) return [];
  if (here) {
    const byDist = points.map((p) => ({ p, d: distanceMiles(here, p) })).sort((a, b) => a.d - b.d);
    const near = byDist.filter((x) => x.d <= NEAR_MILES);
    return (near.length >= NEAR_MIN ? near : byDist.slice(0, NEAR_MIN)).map((x) => x.p);
  }
  const mid = (vals) => {
    const v = [...vals].sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const ref = center || { lat: mid(points.map((p) => p.lat)), lng: mid(points.map((p) => p.lng)) };
  const close = points.filter((p) => distanceMiles(ref, p) <= FAR_MILES);
  return close.length && close.length >= points.length * FAR_SHARE ? close : points;
}

const orgCount = (d) => (d.orgs && d.orgs.length) || 1;

/**
 * Dots grouped so no dot's tap area covers another's at this zoom. `project`
 * turns a point into pixels. Closest pairs merge first, and a group's center
 * moves to the middle of its dots, so merging repeats until nothing overlaps.
 * A dot left alone comes back as it was; a group is
 * { key: 'npg:...', group: true, members: [dot keys], point, orgs, address, ein }.
 */
function groupDots(dots, project) {
  if (dots.length < 2) return dots;
  const touch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const reach = (c) => (c.n > 1 ? GROUP_REACH : touch ? DOT_REACH_TOUCH : DOT_REACH) + 1;
  let cl = dots.map((d) => ({ members: [d], n: orgCount(d), px: project(d.point) }));
  for (;;) {
    let best = null;
    for (let i = 0; i < cl.length; i += 1) {
      for (let j = i + 1; j < cl.length; j += 1) {
        const a = cl[i];
        const b = cl[j];
        const gap = Math.max(Math.abs(a.px.x - b.px.x), Math.abs(a.px.y - b.px.y));
        if (gap < Math.max(reach(a), reach(b)) && (!best || gap < best.gap)) best = { i, j, gap };
      }
    }
    if (!best) break;
    const a = cl[best.i];
    const b = cl[best.j];
    const wa = a.members.length;
    const wb = b.members.length;
    const merged = { members: [...a.members, ...b.members], n: a.n + b.n, px: { x: (a.px.x * wa + b.px.x * wb) / (wa + wb), y: (a.px.y * wa + b.px.y * wb) / (wa + wb) } };
    cl = [...cl.filter((_, k) => k !== best.i && k !== best.j), merged];
  }
  return cl.map((c) => {
    if (c.members.length === 1) return c.members[0];
    const ms = [...c.members].sort((x, y) => (x.key < y.key ? -1 : 1));
    const orgs = ms.flatMap((d) => d.orgs || [d]).sort((x, y) => String(x.name).localeCompare(String(y.name)));
    const addresses = new Set(ms.map((d) => d.address || ''));
    return {
      key: `npg:${ms.map((d) => d.key.replace(/^np:/, '')).join('+')}`,
      group: true,
      members: ms.map((d) => d.key),
      point: { lat: ms.reduce((t, d) => t + d.point.lat, 0) / ms.length, lng: ms.reduce((t, d) => t + d.point.lng, 0) / ms.length },
      orgs,
      address: addresses.size === 1 ? [...addresses][0] : '',
      ein: orgs[0].ein,
      name: orgs[0].name,
      cause: '',
    };
  });
}

function labelDot(marker, d) {
  const el = marker.getElement();
  if (!el) return;
  const n = orgCount(d);
  const names = (d.orgs || []).slice(0, 3).map((o) => o.name).join(', ');
  const more = n > 3 ? `, and ${n - 3} more` : '';
  el.setAttribute(
    'aria-label',
    n === 1 ? `${d.name}, nonprofit from IRS records` : d.group && !d.address ? `${n} nonprofits close together: ${names}${more}` : `${n} nonprofits at ${d.address || 'one address'}: ${names}${more}`
  );
  if (d.group) el.setAttribute('data-group', String(d.members.length));
  else el.removeAttribute('data-group');
  el.setAttribute('data-ein', d.ein);
  el.setAttribute('data-eins', (d.orgs || [d]).map((o) => o.ein).join(','));
  el.setAttribute('data-count', String(n));
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
/** The key names only what the map is showing (both while nothing has landed yet). */
function MapKey({ pins = true, dots = true }) {
  return (
    <div style={S(`max-width:100%;display:flex;flex-wrap:wrap;column-gap:14px;row-gap:6px;align-items:center;background:#fff;border-radius:${R.photo};padding:7px 12px;box-shadow:${SH.float};font:500 12px/1 ${F.body};color:${C.ink2}`)}>
      {pins ? (
        <span style={S('display:inline-flex;align-items:center;gap:6px;white-space:nowrap')}>
          <i aria-hidden="true" style={S(`font-style:normal;padding:3px 6px;border-radius:${R.pill};background:#fff;box-shadow:0 1px 3px rgba(30,36,33,.28);font:600 10px/1 ${F.body};color:${C.ink};font-variant-numeric:tabular-nums`)}>9 AM</i>
          Opportunity
        </span>
      ) : null}
      {dots ? (
        <span style={S('display:inline-flex;align-items:center;gap:6px;white-space:nowrap')}>
          <i aria-hidden="true" style={S(`display:block;width:12px;height:12px;${NP_RING}`)} />
          Nonprofit, not on VolunteerU
        </span>
      ) : null}
    </div>
  );
}
