'use client';

/* ==========================================================================
   MapPanel.jsx, where things are. Real maps on Leaflet with OpenStreetMap tiles.

   DiscoverMap   Discover's map: a day/time pill pin at each listing's real
                 spot (a dot when undated, "+N" when several share a place),
                 a popup for the picked pin with links to the listing and to
                 directions, a hollow dot at the IRS street address of every
                 nonprofit the page lists (placed in one batch through
                 /api/nonprofits/places, lib/nonprofitPlaces.js), zoom, Near me
                 and Expand (a full-screen map).
   AddressMap    one listing's address on a small map, with Directions and
                 Open in Maps links (the listing page).

   Listings carry lat/lng when publishing could geocode their address
   (lib/listings.js). A listing without them is geocoded here through
   lib/geo.js, which caches every answer. One that still can't be placed is
   left off and counted in a note on the map. Online listings and team
   projects have no place and never get a pin.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { S } from '../lib/style.js';
import { C, F, R } from '../lib/tokens.js';
import { Icon } from './ui.jsx';
import { shiftDates } from '../lib/calendar.js';
import { geocode, cachedGeocode, storedPoint, addressKey, directionsHref, searchHref } from '../lib/geo.js';
import { useNonprofitPlaces, canonEin, useMapHover, setMapPick, useRowHoverLink } from '../lib/nonprofitPlaces.js';
import { pinLabel, pinHtml } from './vu/MapPins.jsx';
import MapCanvas from './map/MapCanvas.jsx';
import MapOverlay from './map/MapOverlay.jsx';
import { loadLeaflet, createBaseMap } from './map/leaflet.js';

const ADDRESS_ZOOM = 15;

/** A map search for an address, opened in a new tab. */
export function mapsHref(address) {
  return searchHref(address);
}

/** Online listings and team projects have no place to pin. */
export function isPinnable(l) {
  if (!l) return false;
  if (l.delivery === 'remote' || l.org_type === 'team') return false;
  return Boolean(l.location || l.site);
}

/* ---- grouping ------------------------------------------------------------- */

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

/** Pinnable listings grouped by address text. */
function groupByAddress(listings) {
  const groups = new Map();
  listings.filter(isPinnable).forEach((l) => {
    const address = String(l.location || l.site).trim();
    const key = addressKey(address);
    const g = groups.get(key);
    groups.set(key, g ? { ...g, items: [...g.items, l] } : { key, address, items: [l] });
  });
  return [...groups.values()];
}

/**
 * Each address group with its point: a listing's stored coordinates first,
 * else a geocoded answer (looked up here and cached). `state` is 'ok',
 * 'pending' while the lookup runs, or 'none' when it can't be placed.
 */
function usePlacedGroups(listings) {
  const groups = useMemo(() => groupByAddress(listings), [listings]);
  const [found, setFound] = useState(() => new Map());

  useEffect(() => {
    let live = true;
    groups.forEach((g) => {
      if (g.items.some((l) => storedPoint(l))) return;
      if (cachedGeocode(g.address) !== undefined) return;
      geocode(g.address).then((p) => {
        if (live) setFound((m) => new Map(m).set(g.key, p));
      });
    });
    return () => {
      live = false;
    };
  }, [groups]);

  return useMemo(
    () =>
      groups.map((g) => {
        const stored = g.items.map(storedPoint).find(Boolean);
        if (stored) return { ...g, point: stored, state: 'ok' };
        const p = found.has(g.key) ? found.get(g.key) : cachedGeocode(g.address);
        if (p === undefined) return { ...g, point: null, state: 'pending' };
        return { ...g, point: p ? { lat: p.lat, lng: p.lng } : null, state: p ? 'ok' : 'none' };
      }),
    [groups, found]
  );
}

/** Placed groups merged into one pin per spot, soonest shift first. */
function pinsFrom(placed) {
  const bySpot = new Map();
  placed
    .filter((g) => g.state === 'ok')
    .forEach((g) => {
      const spot = `${g.point.lat.toFixed(5)},${g.point.lng.toFixed(5)}`;
      const have = bySpot.get(spot);
      bySpot.set(spot, have ? { ...have, items: [...have.items, ...g.items] } : { key: g.key, address: g.address, point: g.point, items: g.items });
    });
  return [...bySpot.values()].map((p) => {
    const items = [...p.items].sort((a, b) => nextStartMs(a) - nextStartMs(b));
    const n = items.length;
    const first = labelFor(items[0]);
    const label = n > 1 ? (first ? `${first} +${n - 1}` : `${n} here`) : first;
    const whenText = items[0].whenLabel ? `next on ${items[0].whenLabel}` : 'no dates yet';
    const ariaLabel = n > 1 ? `${n} opportunities at ${items[0].place || p.address}, ${whenText}` : `${items[0].name}, ${items[0].whenLabel || 'no dates yet'}`;
    return { ...p, items, label, ariaLabel };
  });
}

/**
 * Nonprofits on the map, at the street address on their IRS record: every
 * listed org, placed in one batch (lib/nonprofitPlaces.js). Orgs that share
 * an address (one office building) share one dot.
 */
function useNonprofitDots(nonprofits) {
  const list = useMemo(() => {
    const seen = new Set();
    return (nonprofits || []).filter((o) => {
      const id = o && canonEin(o.ein);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [nonprofits]);
  const eins = useMemo(() => list.map((o) => o.ein), [list]);
  const { places, missing, loading } = useNonprofitPlaces(eins);

  const dots = useMemo(() => {
    const bySpot = new Map();
    list.forEach((o) => {
      const ein = canonEin(o.ein);
      const p = places.get(ein);
      if (!p) return;
      const spot = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      const org = { ein, name: o.name || '', cause: o.cause || '', address: p.address || '' };
      const have = bySpot.get(spot);
      bySpot.set(spot, have ? { ...have, orgs: [...have.orgs, org] } : { key: `np:${spot}`, point: { lat: p.lat, lng: p.lng }, address: p.address || '', orgs: [org] });
    });
    return [...bySpot.values()].map((d) => ({ ...d, ein: d.orgs[0].ein, name: d.orgs[0].name, cause: d.orgs[0].cause }));
  }, [list, places]);

  return { dots, missing, loading, total: list.length };
}

/** The searched town's center, when it can be found. */
function useTownCenter(town) {
  const text = String(town || '').trim();
  const [center, setCenter] = useState(null);
  useEffect(() => {
    let live = true;
    if (text.length < 3) {
      setCenter(null);
      return undefined;
    }
    const cached = cachedGeocode(text);
    if (cached !== undefined) {
      setCenter(cached ? { lat: cached.lat, lng: cached.lng } : null);
      return undefined;
    }
    geocode(text).then((p) => {
      if (live) setCenter(p ? { lat: p.lat, lng: p.lng } : null);
    });
    return () => {
      live = false;
    };
  }, [text]);
  return center;
}

/* ---- DiscoverMap ----------------------------------------------------------- */

/**
 * @param {object} props
 * @param {Array<object>} props.listings rows from DiscoverListings' onRows (listing columns plus cardFacts)
 * @param {Map<string, object|null>} [props.photos] the cards' own photos (never stock)
 * @param {Array<{ein:number|string,name:string,cause?:string}>} [props.nonprofits] every nonprofit row the page lists; each gets a dot
 * @param {string|null} [props.highlight] listing id hovered in the list (its pin turns ink)
 * @param {(ids:string|string[]|null)=>void} [props.onPick] a pin was picked: its listing id, or every id at that place; null when closed
 * @param {(org:object)=>void} [props.onOpenNonprofit] kept for callers; a nonprofit's popup links to its page
 * @param {string} [props.town] the searched place; the map starts there when it has no pins
 * @param {{lat:number,lng:number}|null} [props.here] the visitor's own location, when the page knows it; the map keeps it in view with what's around it
 * @param {(missing:Set<string>)=>void} [props.onNonprofitPlaces] the EINs that can't go on the map (PO boxes, no match)
 * @param {boolean} [props.inline] draw the map in place (default). false draws only the full-screen map, while `expanded`
 * @param {boolean} [props.expanded] the full-screen map is open (controlled); leave undefined to let Expand manage it
 * @param {(open:boolean)=>void} [props.onExpandedChange]
 */
// eslint-disable-next-line no-unused-vars
export function DiscoverMap({ listings = [], photos, nonprofits = [], highlight = null, onPick, onOpenNonprofit, town = '', here: givenHere = null, onNonprofitPlaces, inline = true, expanded, onExpandedChange, className, style }) {
  const placed = usePlacedGroups(listings);
  const pins = useMemo(() => pinsFrom(placed), [placed]);
  const { dots, missing } = useNonprofitDots(nonprofits);
  const center = useTownCenter(town);
  useRowHoverLink();
  const hoverEin = useMapHover();
  const [picked, setPicked] = useState(null);
  const [ownOpen, setOwnOpen] = useState(false);
  // Near me on this map wins over a location the page passed in.
  const [nearHere, setNearHere] = useState(null);
  const here = nearHere || (givenHere && Number.isFinite(givenHere.lat) && Number.isFinite(givenHere.lng) ? { lat: givenHere.lat, lng: givenHere.lng } : null);
  const open = expanded === undefined ? ownOpen : Boolean(expanded);

  const setOpen = (v) => {
    if (expanded === undefined) setOwnOpen(v);
    if (onExpandedChange) onExpandedChange(v);
  };

  const missingKey = [...missing].sort().join(',');
  const placesRef = useRef(onNonprofitPlaces);
  placesRef.current = onNonprofitPlaces;
  useEffect(() => {
    if (placesRef.current) placesRef.current(new Set(missingKey ? missingKey.split(',') : []));
  }, [missingKey]);

  const notOnMap = placed.filter((g) => g.state === 'none').reduce((n, g) => n + g.items.length, 0);
  const onMap = pins.reduce((n, p) => n + p.items.length, 0);
  const orgsOnMap = dots.reduce((n, d) => n + d.orgs.length, 0);
  const oppText = `${onMap} ${onMap === 1 ? 'opportunity' : 'opportunities'}${pins.length && pins.length !== onMap ? ` at ${pins.length} places` : ''}`;
  const orgText = `${orgsOnMap} ${orgsOnMap === 1 ? 'nonprofit' : 'nonprofits'}`;
  // "Map of 22 nonprofits" when the page lists no opportunities, never "0 opportunities and 22 nonprofits".
  const label = `Map of ${[onMap || !orgsOnMap ? oppText : '', orgsOnMap ? orgText : ''].filter(Boolean).join(' and ')}`;

  // The dot of the row being hovered in the list.
  const hoverDot = hoverEin ? (dots.find((d) => d.orgs.some((o) => o.ein === hoverEin)) || {}).key || null : null;

  function pick(want) {
    // Picking the open pin again closes it.
    const key = want && want === picked ? null : want;
    setPicked(key);
    const dot = key ? dots.find((d) => d.key === key) : null;
    setMapPick(dot ? dot.ein : null);
    if (!onPick) return;
    const pin = key ? pins.find((p) => p.key === key) : null;
    onPick(pin ? (pin.items.length === 1 ? pin.items[0].id : pin.items.map((l) => l.id)) : null);
  }

  // A pick whose place left the map (filters changed) closes its popup. A
  // group of close dots (MapCanvas draws them, "npg:<spot>+<spot>") stays
  // while every dot in it is still here.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    if (!picked) return;
    const hasDot = (k) => dots.some((d) => d.key === k);
    const ok = picked.startsWith('npg:') ? picked.slice(4).split('+').every((spot) => hasDot(`np:${spot}`)) : pins.some((p) => p.key === picked) || hasDot(picked);
    if (!ok) pickRef.current(null);
  }, [pins, dots, picked]);

  // The open dot no longer counts as picked once this map goes away.
  useEffect(() => () => setMapPick(null), []);

  const shared = { pins, dots, photos, highlight, hoverDot, picked, onPick: pick, center, here, onHere: setNearHere, notOnMap, ariaLabel: label };

  return (
    <>
      {inline ? <MapCanvas {...shared} onExpand={() => setOpen(true)} className={className} style={style} /> : null}
      {open ? (
        <MapOverlay title={label} onClose={() => setOpen(false)} onEscape={() => (picked ? (pick(null), true) : false)}>
          <MapCanvas {...shared} wheel="always" autoFocus={false} style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
        </MapOverlay>
      ) : null}
    </>
  );
}

/* ---- AddressMap ------------------------------------------------------------- */

/**
 * One address on a small map with Directions and Open in Maps. The map stays
 * still (no drag, no scroll zoom) until it's clicked, so the page scrolls past
 * it. Without a point it's just the address and the links.
 * @param {{ address?: string, lat?: number|null, lng?: number|null }} props
 */
export function AddressMap({ address, lat = null, lng = null }) {
  const text = String(address || '').trim();
  const stored = storedPoint({ lat, lng });
  // Stored coordinates only on the first render, so the server and the
  // browser draw the same thing; a cached or fresh lookup lands after.
  const [point, setPoint] = useState(stored);

  useEffect(() => {
    let live = true;
    if (stored) {
      setPoint(stored);
      return undefined;
    }
    if (!text) {
      setPoint(null);
      return undefined;
    }
    geocode(text).then((p) => {
      if (live) setPoint(p ? { lat: p.lat, lng: p.lng } : null);
    });
    return () => {
      live = false;
    };
    // stored is derived from lat/lng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, lat, lng]);

  if (!text) return null;
  const link = S(`display:inline-flex;align-items:center;gap:6px;font:600 14px/20px ${F.body};color:${C.ink}`);
  return (
    <div>
      {point ? <StillMap point={point} label={`Map of ${text}`} /> : null}
      <p className="vu-break" style={S(`margin:${point ? 12 : 8}px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink}`)}>{text}</p>
      <div style={S('display:flex;flex-wrap:wrap;column-gap:20px;row-gap:6px;margin-top:8px')}>
        <a href={point ? directionsHref(point.lat, point.lng) : directionsHref(text)} target="_blank" rel="noopener noreferrer" className="vu-link-ul" style={link}>
          Directions
          <Icon name="external" size={14} />
          <span className="vu-sr">(opens Google Maps in a new tab)</span>
        </a>
        <a href={mapsHref(text)} target="_blank" rel="noopener noreferrer" className="vu-link-ul" style={link}>
          Open in Maps
          <Icon name="external" size={14} />
          <span className="vu-sr">(opens Google Maps in a new tab)</span>
        </a>
      </div>
    </div>
  );
}

/** A small map with one pin that wakes up (drag, zoom) on the first click. */
function StillMap({ point, label }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const pinRef = useRef(null);
  const [awake, setAwake] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !elRef.current) return;
        const map = createBaseMap(L, elRef.current, { center: point, zoom: ADDRESS_ZOOM, interactive: false });
        mapRef.current = map;
        // The small map keeps only the OpenStreetMap credit the tiles require, so it covers less of the street.
        map.attributionControl.setPrefix(false);
        pinRef.current = L.marker([point.lat, point.lng], { icon: L.divIcon({ className: 'vu-lpin', html: pinHtml(''), iconSize: [0, 0] }), keyboard: false, interactive: false }).addTo(map);
        map.getContainer().setAttribute('aria-label', label);
        map.once('click', () => {
          map.dragging.enable();
          map.touchZoom.enable();
          map.doubleClickZoom.enable();
          map.scrollWheelZoom.enable();
          map.keyboard.enable();
          setAwake(true);
        });
      })
      .catch((err) => console.error('[map] Leaflet failed to load', err));
    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
    };
    // Built once; a new point moves the pin below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([point.lat, point.lng], map.getZoom(), { animate: false });
    if (pinRef.current) pinRef.current.setLatLng([point.lat, point.lng]);
  }, [point.lat, point.lng]);

  return (
    <div className="vu-addrmap" style={S(`position:relative;margin-top:10px;height:200px;border-radius:${R.photo};overflow:hidden;background:${C.mapLand};isolation:isolate`)}>
      <div ref={elRef} style={S(`position:absolute;inset:0;z-index:0;cursor:${awake ? 'grab' : 'pointer'}`)} />
    </div>
  );
}

export default AddressMap;
