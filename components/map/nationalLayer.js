'use client';

/* ==========================================================================
   nationalLayer.js, the map's background layer of every US nonprofit: each
   501(c)(3) public charity on the IRS master file, at its street address
   (lib/npPoints.js has the data, lib/npGrid.js the counting).

   Zoomed out past STATE_ZOOM it is one count bubble per state, at the mean
   of its points, so the country view downloads only the small index. From
   STATE_ZOOM in, a state's points load once it's in view and draw as dots,
   with count bubbles where they're too close to tell apart. Its markers
   live in their own pane under the listing pins and the page's own
   nonprofit dots, and the orgs the page already draws (`exclude`) are left
   out of it, so none is drawn or counted twice.

   Clicking (or Enter on) a bubble zooms in on it: a state to its box, a
   bubble to its orgs. One org opens the same popup as the page's own dots,
   and a bubble whose orgs share one address (or one that can't zoom any
   further) opens their list. MapCanvas draws both popups; nationalPick()
   gives it the picked spot, since these dots aren't in its props.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { queryGrid } from '../../lib/npGrid.js';
import { loadNpIndex, loadNpState, npStateIfLoaded, stateBox, stateCenter } from '../../lib/npPoints.js';
import { stateName } from '../WebNonprofits.jsx';
import { dotHtml, dotStyle, bubbleIcon, bubbleStyle, causeFromMajor } from '../vu/MapPins.jsx';

export const NATIONAL_SOURCE = 'Nonprofits from IRS records, placed by street address (US Census)';
export const STATE_ZOOM = 6; // below this, one bubble per state
export const STACK_ZOOM = 18; // a bubble this far in lists its orgs instead of zooming
const PANE = 'vuNational';
const PANE_Z = '590'; // Leaflet's marker pane (pins, the page's dots) is 600
const VIEW_PAD = 0.3; // dots are drawn this far past each edge, so a short pan finds them waiting
const MOVE_MS = 250; // while the map is dragged, it looks again at most this often
const ZOOM_PAD = 48;
const TERRITORIES = { PR: 'Puerto Rico', VI: 'the US Virgin Islands', GU: 'Guam', AS: 'American Samoa', MP: 'the Northern Mariana Islands' };

const picks = new Map(); // pick key -> spot, for MapCanvas's popup

/**
 * The national spot a pick key names: { kind: 'dot', ein, ntee, cause, point }
 * or { kind: 'stack', n, eins, same, point }; null for any other key.
 */
export function nationalPick(key) {
  return (key && picks.get(key)) || null;
}

export const isNationalKey = (key) => /^nat[g]?:/.test(String(key || ''));

/** Cell size in px for a zoom: bigger bubbles far out, closer dots at street level. */
function cellFor(zoom) {
  if (zoom < 13) return 64;
  if (zoom < 15) return 48;
  return 36;
}

const placeName = (st) => TERRITORIES[st] || stateName(st);
const many = (n) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? 'nonprofit' : 'nonprofits'}`;

/**
 * @param {object} o
 * @param {boolean} o.ready the map is drawn
 * @param {{current:any}} o.mapRef @param {{current:any}} o.LRef
 * @param {boolean} o.enabled
 * @param {string[]} o.exclude EINs the page draws itself
 * @param {string|null} o.picked
 * @param {{current:(key:string|null, how?:object)=>void}} o.pickRef
 * @param {{current:boolean}} o.keyboardPick set when a key opened a popup, so focus moves into it
 * @param {()=>void} o.onUserMove the layer moved the map at the visitor's ask
 * @param {boolean} o.reduced
 * @returns {{ active:boolean }} active once the layer has something to draw
 */
export function useNationalLayer({ ready, mapRef, LRef, enabled, exclude, picked, pickRef, keyboardPick, onUserMove, reduced }) {
  const [active, setActive] = useState(false);
  const live = useRef(null); // { refresh, paint } while the layer is on
  const excludeRef = useRef(exclude);
  excludeRef.current = exclude;
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const moveRef = useRef(onUserMove);
  moveRef.current = onUserMove;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const excludeKey = [...exclude].sort().join(',');

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!ready || !map || !L || !enabled) return undefined;
    let on = true;
    let index = null;
    let raf = 0;
    let lastAt = 0;
    let prefix = null;
    const markers = new Map(); // marker key -> { marker, item }
    const pane = map.getPane(PANE) || map.createPane(PANE);
    pane.style.zIndex = PANE_Z;

    /* ---- what's in view ---- */
    function itemsInView() {
      const z = map.getZoom();
      const pb = map.getBounds().pad(VIEW_PAD);
      const view = [pb.getSouth(), pb.getWest(), pb.getNorth(), pb.getEast()];
      const out = [];
      const loaded = [];
      Object.keys(index.states).forEach((st) => {
        const meta = index.states[st];
        const box = stateBox(meta);
        if (!box || box[0] > view[2] || box[2] < view[0] || box[1] > view[3] || box[3] < view[1]) return;
        const data = z >= STATE_ZOOM ? npStateIfLoaded(st) : null;
        if (data) {
          loaded.push(data);
          return;
        }
        if (z >= STATE_ZOOM) {
          loadNpState(st, index.generated).then((d) => {
            if (d && on) queue();
          });
        }
        // Until its points are here (and always below STATE_ZOOM), a state is one bubble.
        const c = stateCenter(meta);
        if (c && Number(meta.count) > 0) out.push({ kind: 'state', mkey: `s:${st}`, sts: [st], n: Number(meta.count), lat: c.lat, lng: c.lng, box });
      });
      // Folding two can make the new bubble overlap a third, so fold until nothing does.
      let merged = out;
      for (;;) {
        const next = mergeStates(merged, (it) => map.project([it.lat, it.lng], z));
        if (next.length === merged.length) break;
        merged = next;
      }
      out.length = 0;
      out.push(...merged);
      if (loaded.length) {
        const cell = cellFor(z);
        const { items } = queryGrid(loaded, { bounds: view, zoom: z, cell, merge: cell * 0.8, exclude: excludeRef.current });
        items.forEach((it) => {
          if (it.n === 1) {
            out.push({ kind: 'dot', mkey: `nat:${it.ein}`, pkey: `nat:${it.ein}`, n: 1, ein: String(it.ein), ntee: it.ntee, lat: it.lat, lng: it.lng });
          } else {
            const spot = `${it.lat.toFixed(5)},${it.lng.toFixed(5)}`;
            const stack = it.same || z >= STACK_ZOOM;
            out.push({
              kind: stack ? 'stack' : 'bubble',
              mkey: stack ? `natg:${spot}:${it.n}` : `c:${z}:${it.k}:${it.n}`,
              pkey: stack ? `natg:${spot}` : null,
              n: it.n,
              same: it.same,
              eins: it.eins || [],
              lat: it.lat,
              lng: it.lng,
              box: it.b,
            });
          }
        });
      }
      return out;
    }

    /* ---- drawing ---- */
    function draw(items) {
      const want = new Map(items.map((it) => [it.mkey, it]));
      markers.forEach((m, k) => {
        if (!want.has(k)) {
          m.marker.remove();
          markers.delete(k);
        }
      });
      want.forEach((it, k) => {
        if (markers.has(k)) return;
        const icon = it.kind === 'dot' ? { html: dotHtml(1), size: [24, 24] } : bubbleIcon(it.n, { big: it.kind === 'state' });
        const marker = L.marker([it.lat, it.lng], {
          icon: L.divIcon({ className: 'vu-lnp vu-lnat', html: icon.html, iconSize: icon.size }),
          keyboard: true,
          pane: PANE,
        });
        marker.on('click', (e) => {
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          open(it, false);
        });
        marker.on('add', () => {
          const el = marker.getElement();
          if (!el) return;
          el.setAttribute('aria-label', labelFor(it));
          el.setAttribute('data-nat', it.kind);
          el.setAttribute('data-count', String(it.n));
          if (it.ein) el.setAttribute('data-ein', it.ein);
          if (it.kind !== 'dot') el.title = labelFor(it);
          el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              ev.stopPropagation();
              open(it, true);
            }
          });
          paintOne(markers.get(k) || { marker, item: it });
        });
        markers.set(k, { marker, item: it });
        marker.addTo(map);
      });
    }

    /** The picked dot or stack grows and turns ink, like the page's own dots. */
    function paintOne(m) {
      const it = m.item;
      if (!it.pkey) return;
      const el = m.marker.getElement();
      const dot = el && el.querySelector('.vu-np-dot');
      if (!dot) return;
      const isOn = it.pkey === pickedRef.current;
      dot.classList.toggle('is-on', isOn);
      if (it.kind === 'dot') dot.style.cssText = dotStyle(1, isOn);
      else dot.style.cssText = bubbleStyle(it.n, { on: isOn }).style;
      el.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    }
    const paint = () => markers.forEach(paintOne);

    function refresh() {
      raf = 0;
      if (!on || !index) return;
      lastAt = Date.now();
      draw(itemsInView());
    }
    function queue() {
      if (on && !raf) raf = requestAnimationFrame(refresh);
    }
    function onMove() {
      if (Date.now() - lastAt >= MOVE_MS) queue();
    }

    /* ---- clicks ---- */
    function open(it, keyboard) {
      const z = map.getZoom();
      const animate = !reducedRef.current;
      if (it.kind === 'state' || it.kind === 'bubble') {
        const b = L.latLngBounds([it.box[0], it.box[1]], [it.box[2], it.box[3]]);
        const fit = map.getBoundsZoom(b, false, L.point(ZOOM_PAD * 2, ZOOM_PAD * 2));
        const floor = it.kind === 'state' ? STATE_ZOOM : z + 1;
        const want = Math.min(STACK_ZOOM, map.getMaxZoom(), Math.max(floor, fit));
        if (moveRef.current) moveRef.current();
        pickRef.current(null);
        map.setView(b.getCenter(), want, { animate });
        return;
      }
      const point = { lat: it.lat, lng: it.lng };
      if (it.kind === 'dot') picks.set(it.pkey, { kind: 'dot', ein: it.ein, ntee: it.ntee, cause: causeFromMajor(it.ntee), point });
      else picks.set(it.pkey, { kind: 'stack', n: it.n, eins: it.eins, same: it.same, point, box: it.box });
      if (keyboard) keyboardPick.current = true;
      pickRef.current(it.pkey, { keyboard });
    }

    map.on('moveend zoomend', queue);
    map.on('move', onMove);
    live.current = { refresh: queue, paint };
    loadNpIndex().then((idx) => {
      if (!on || !idx || !Object.keys(idx.states).length) return;
      index = idx;
      // In the credit line, set apart from OpenStreetMap's (Leaflet joins credits with commas).
      prefix = map.attributionControl.options.prefix;
      map.attributionControl.setPrefix(`${prefix ? `${prefix} | ` : ''}${NATIONAL_SOURCE}`);
      setActive(true);
      refresh();
    });

    return () => {
      on = false;
      if (raf) cancelAnimationFrame(raf);
      map.off('moveend zoomend', queue);
      map.off('move', onMove);
      markers.forEach((m) => m.marker.remove());
      markers.clear();
      if (prefix !== null) map.attributionControl.setPrefix(prefix);
      live.current = null;
      setActive(false);
    };
    // The refs carry the props that change while the layer is on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, enabled]);

  // The page's own dots changed: leave the new set out.
  useEffect(() => {
    if (live.current) live.current.refresh();
  }, [excludeKey]);

  useEffect(() => {
    if (live.current) live.current.paint();
  }, [picked]);

  return { active };
}

/**
 * State bubbles that would overlap at this zoom (the Northeast, from the
 * country view) fold into one, biggest first: its count is their sum, it
 * sits at their weighted mean, and a click zooms to all of their boxes.
 * `project` turns a bubble into pixels.
 */
function mergeStates(items, project) {
  const list = [...items]
    .sort((a, b) => b.n - a.n || (a.sts[0] < b.sts[0] ? -1 : 1))
    .map((it) => ({ it, px: project(it), w: bubbleIcon(it.n, { big: true }).size[0] }));
  const out = [];
  list.forEach((c) => {
    const hit = out.find((o) => Math.abs(o.px.x - c.px.x) < (o.w + c.w) / 2 + 4 && Math.abs(o.px.y - c.px.y) < 34);
    if (!hit) {
      out.push({ ...c });
      return;
    }
    const a = hit.it;
    const b = c.it;
    const n = a.n + b.n;
    const sts = [...a.sts, ...b.sts];
    hit.it = {
      kind: 'state',
      mkey: `s:${[...sts].sort().join('+')}`,
      sts,
      n,
      lat: (a.lat * a.n + b.lat * b.n) / n,
      lng: (a.lng * a.n + b.lng * b.n) / n,
      box: [Math.min(a.box[0], b.box[0]), Math.min(a.box[1], b.box[1]), Math.max(a.box[2], b.box[2]), Math.max(a.box[3], b.box[3])],
    };
    hit.px = { x: (hit.px.x * a.n + c.px.x * b.n) / n, y: (hit.px.y * a.n + c.px.y * b.n) / n };
    hit.w = bubbleIcon(n, { big: true }).size[0];
  });
  return out.map((o) => o.it);
}

/** "Indiana", "Connecticut and Rhode Island", "Delaware, Maryland and 2 more states". */
function placeList(sts) {
  const names = sts.map(placeName);
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more states`;
}

/** What a screen reader hears for a dot or bubble. */
function labelFor(it) {
  if (it.kind === 'state') return `${many(it.n)} in ${placeList(it.sts)}, from IRS records. Zoom in to see them.`;
  if (it.kind === 'dot') {
    const cause = causeFromMajor(it.ntee);
    return `Nonprofit from IRS records${cause && cause !== 'Nonprofit' ? `, ${cause}` : ''}`;
  }
  if (it.kind === 'stack') return it.same ? `${many(it.n)} at one address, from IRS records` : `${many(it.n)} close together, from IRS records`;
  return `${many(it.n)} here, from IRS records. Zoom in to see them.`;
}
