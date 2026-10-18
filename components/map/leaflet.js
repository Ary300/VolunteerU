'use client';

/* ==========================================================================
   leaflet.js, the one place the app loads Leaflet and builds a base map.

   Leaflet touches `window` when it loads, so it is imported on demand inside
   effects and never during server rendering. Its stylesheet is imported once
   in app/layout.js; app/globals.css restyles the attribution to the tokens.

   Tiles: OpenStreetMap's standard tiles, free under their tile usage policy
   (light use, the attribution shown on the map, the browser's normal
   Referer). globals.css quiets their colors so the pins stand out. CARTO's
   free basemaps now answer every request with an "API key required" image,
   so they can't be used without an account.
   ========================================================================== */

import { useEffect, useState } from 'react';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
export const INDIANAPOLIS = Object.freeze({ lat: 39.7684, lng: -86.1581 });
export const DEFAULT_ZOOM = 11;
export const FIT_MAX_ZOOM = 15;

let loading = null;

/** Leaflet's module, loaded once per page. Rejects on the server. */
export function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Leaflet needs a browser'));
  if (!loading) {
    loading = import('leaflet')
      .then((m) => m.default || m)
      .catch((err) => {
        loading = null; // a failed chunk load can be retried on the next mount
        throw err;
      });
  }
  return loading;
}

/** True while the visitor asks for reduced motion. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Reads reduced motion right now, for code outside React state. */
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * A Leaflet map on `el` with the CARTO tiles and attribution, no built-in
 * zoom buttons (the screens draw their own) and the scroll wheel off until
 * the caller turns it on.
 * @param {object} L Leaflet
 * @param {HTMLElement} el
 * @param {{center?:{lat:number,lng:number}, zoom?:number, interactive?:boolean}} [opts]
 */
export function createBaseMap(L, el, { center = INDIANAPOLIS, zoom = DEFAULT_ZOOM, interactive = true } = {}) {
  const reduced = prefersReducedMotion();
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
    dragging: interactive,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    zoomAnimation: !reduced,
    fadeAnimation: !reduced,
    markerZoomAnimation: !reduced,
    inertia: !reduced,
    minZoom: 3,
    maxZoom: 19,
    zoomSnap: 0.5,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(map);
  map.setView([center.lat, center.lng], zoom, { animate: false });
  return map;
}
