'use client';

/* ==========================================================================
   location.js, where the visitor is, for "what's near me".

   Discover and the landing page ask once, in the page (never a dialog on
   load): "Use my location" (the browser's geolocation, turned into a town by
   /api/locate) or "Enter a ZIP or town" (geocoded by /api/geocode). The
   answer is kept in this browser's localStorage, so the next visit starts
   there, and a signed-in volunteer's choice also goes into prefs.location
   (Discover writes that, see useNearMe).

   The record:
     { status: 'set', town, state, zip, lat, lng, source: 'gps' | 'typed', at }
     { status: 'denied', at }    the browser refused location; Indianapolis shows
   Nothing stored means the visitor hasn't chosen yet.

   useLocation()          the record, null when nothing is stored, undefined
                          during server render and hydration (so a page can
                          hold its space until it knows).
   setLocation(rec) / forgetLocation()
   clearLocationData()    sign-out: forgets the stored location (an exact GPS
                          point, often) and the nonprofit places cached here.
   areaOf(rec)            "Carmel, IN", the Where value lists search by.
   placeLabel(rec)        "Indianapolis, IN 46220", what the Near line shows.
   resolvePlace(text)     a typed ZIP or town to a record, not kept (a search's Where).
   usePlace(text)         the same as a hook: { status, rec }.
   locateMe()             asks the browser, then the town. { ok, rec } or { ok:false, error }.
   lookupPlace(text)      a typed ZIP or town to a record, or { ok:false, error }.
   geoPermission()        'granted' | 'denied' | 'prompt' | 'unknown', without asking.
   milesLabel(mi)         "0.4 mi", "2.4 mi", "12 mi".
   ========================================================================== */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { geocode } from './geo.js';
import { townFromZip, parseState } from './listings.js';
import { forgetNonprofitPlaces } from './nonprofitPlaces.js';

const KEY = 'vu.location.v1';
const GEO_OPTS = { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 };
// A location from the browser is refreshed quietly after this long, when the
// site already has permission (people move; a ZIP they typed stays put).
export const GPS_STALE_MS = 6 * 3600 * 1000;

const subs = new Set();
let loaded = false;
let current = null;

const okPoint = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** A stored value, checked field by field: anything malformed reads as "not chosen". */
function clean(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = Number(raw.at) || 0;
  if (raw.status === 'denied') return { status: 'denied', at };
  if (raw.status !== 'set') return null;
  const town = String(raw.town || '').trim().slice(0, 60);
  const state = /^[A-Z]{2}$/.test(String(raw.state || '')) ? raw.state : '';
  const zip = /^\d{5}$/.test(String(raw.zip || '')) ? raw.zip : '';
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!town && !zip) return null;
  return {
    status: 'set',
    town,
    state,
    zip,
    lat: okPoint(lat, lng) ? lat : null,
    lng: okPoint(lat, lng) ? lng : null,
    source: raw.source === 'gps' ? 'gps' : 'typed',
    at,
  };
}

function load() {
  if (loaded) return current;
  loaded = true;
  try {
    current = clean(JSON.parse(window.localStorage.getItem(KEY) || 'null'));
  } catch {
    current = null;
  }
  return current;
}

function emit() {
  subs.forEach((fn) => fn());
}

function subscribe(fn) {
  subs.add(fn);
  const onStorage = (e) => {
    if (e.key !== KEY) return;
    loaded = false;
    load();
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    subs.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

const getSnapshot = () => load();
const getServerSnapshot = () => undefined;

/** The stored record, null when there is none, undefined before the browser is read. */
export function useLocation() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function getLocation() {
  return typeof window === 'undefined' ? null : load();
}

export function setLocation(rec) {
  const next = clean({ ...rec, at: Date.now() });
  current = next;
  loaded = true;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode or storage blocked: the choice lasts for this page */
  }
  emit();
  return next;
}

export function forgetLocation() {
  return setLocation(null);
}

/** Sign-out: this browser's location and the nonprofit places stored with it are forgotten. */
export function clearLocationData() {
  forgetLocation();
  forgetNonprofitPlaces();
}

/** "Carmel, IN" for a set record ("46032" when only a ZIP is known), '' otherwise. */
export function areaOf(rec) {
  if (!rec || rec.status !== 'set') return '';
  if (rec.town) return rec.state ? `${rec.town}, ${rec.state}` : rec.town;
  return rec.zip || '';
}

/** "Indianapolis, IN 46220": the area with the ZIP it was set from, so a
    typed ZIP (or a GPS point's ZIP) reads back as what took effect. */
export function placeLabel(rec) {
  const area = areaOf(rec);
  if (!area || !rec.zip || area === rec.zip) return area;
  return `${area} ${rec.zip}`;
}

/** The record's point, or null. */
export function pointOf(rec) {
  return rec && rec.status === 'set' && okPoint(rec.lat, rec.lng) ? { lat: rec.lat, lng: rec.lng } : null;
}

/** "0.4 mi", "2.4 mi", "12 mi"; '' for a missing distance. */
export function milesLabel(mi) {
  if (!Number.isFinite(mi)) return '';
  if (mi < 0.1) return '0.1 mi';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

/* ---- asking -------------------------------------------------------------------- */

/** The site's geolocation permission, without prompting. */
export async function geoPermission() {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) return 'unknown';
    const st = await navigator.permissions.query({ name: 'geolocation' });
    return st && st.state ? st.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The town at a point, from /api/locate. Throws when the lookup can't run. */
async function townAt(lat, lng) {
  const res = await fetch(`/api/locate?lat=${encodeURIComponent(lat.toFixed(4))}&lng=${encodeURIComponent(lng.toFixed(4))}`);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || !body.ok) throw new Error(`locate ${res.status}`);
  return body.data || null;
}

function position() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTS);
  });
}

/**
 * Asks the browser where the visitor is and which town that is.
 * @returns {Promise<{ok:true, rec:object} | {ok:false, error:'unsupported'|'denied'|'unavailable'|'outside'|'lookup'}>}
 */
export async function locateMe() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return { ok: false, error: 'unsupported' };
  let pos;
  try {
    pos = await position();
  } catch (err) {
    if (err && err.code === 1) {
      setLocation({ status: 'denied' });
      return { ok: false, error: 'denied' };
    }
    return { ok: false, error: 'unavailable' };
  }
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  let place;
  try {
    place = await townAt(lat, lng);
  } catch (err) {
    console.error('[location] town lookup failed', err);
    return { ok: false, error: 'lookup' };
  }
  if (!place) return { ok: false, error: 'outside' };
  const town = place.town || townFromZip(place.zip) || '';
  const rec = setLocation({ status: 'set', town, state: place.state, zip: place.zip, lat, lng, source: 'gps' });
  return rec ? { ok: true, rec } : { ok: false, error: 'outside' };
}

/** "Fishers", "fishers in" -> "Fishers". */
function tidyTown(text) {
  return String(text || '')
    .split(',')[0]
    .replace(/\s+[A-Za-z]{2}$/, (m) => (parseState(m) ? '' : m))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* Typed places already looked up on this page: text -> Promise of the result. */
const places = new Map();
const PLACES_MAX = 50;

function placeKey(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function findPlace(raw) {
  if (raw.length < 3) return { ok: false, error: 'empty' };
  const zip = /^\d{5}$/.test(raw) ? raw : '';
  const state = parseState(raw);
  const query = zip ? `${zip}, USA` : state ? raw : `${raw}, IN`;
  let p;
  try {
    p = await geocode(query);
  } catch (err) {
    console.error('[location] geocode failed', err);
    return { ok: false, error: 'lookup' };
  }
  if (!p) return { ok: false, error: 'notfound' };
  let place = null;
  try {
    place = await townAt(p.lat, p.lng);
  } catch {
    place = null; // the typed name still works as the town
  }
  const town = zip ? (place && place.town) || townFromZip(zip) || '' : (place && place.town) || tidyTown(raw);
  const rec = clean({
    status: 'set',
    town,
    state: (place && place.state) || state || 'IN',
    zip: zip || (place && place.zip) || '',
    lat: p.lat,
    lng: p.lng,
    source: 'typed',
    at: Date.now(),
  });
  return rec ? { ok: true, rec } : { ok: false, error: 'notfound' };
}

/**
 * A ZIP or town the visitor typed, as a record, without keeping it as their
 * location (a search's Where). Indiana is assumed when no state is given
 * (VolunteerU serves central Indiana). One lookup per text per page.
 * @returns {Promise<{ok:true, rec:object} | {ok:false, error:'empty'|'notfound'|'lookup'}>}
 */
export function resolvePlace(text) {
  const raw = placeKey(text);
  const hit = places.get(raw.toLowerCase());
  if (hit) return hit;
  const job = findPlace(raw).then((res) => {
    // A failed lookup (not a miss) is asked again next time.
    if (!res.ok && res.error === 'lookup') places.delete(raw.toLowerCase());
    return res;
  });
  places.set(raw.toLowerCase(), job);
  while (places.size > PLACES_MAX) places.delete(places.keys().next().value);
  return job;
}

/**
 * The same as a hook: { status: 'idle' | 'looking' | 'set' | 'notfound', rec }.
 * 'idle' for empty text. A failed lookup reads as 'idle', so a page never
 * says "couldn't find" when the geocoder was only busy.
 */
export function usePlace(text) {
  const raw = placeKey(text);
  const [state, setState] = useState({ key: '', status: 'idle', rec: null });
  useEffect(() => {
    if (raw.length < 3) return undefined;
    let alive = true;
    resolvePlace(raw).then((res) => {
      if (!alive) return;
      if (res.ok) setState({ key: raw, status: 'set', rec: res.rec });
      else setState({ key: raw, status: res.error === 'notfound' ? 'notfound' : 'idle', rec: null });
    });
    return () => { alive = false; };
  }, [raw]);
  if (raw.length < 3) return { status: 'idle', rec: null };
  if (state.key !== raw) return { status: 'looking', rec: null };
  return { status: state.status, rec: state.rec };
}

/**
 * A ZIP or town the visitor typed, kept as their location.
 * @returns {Promise<{ok:true, rec:object} | {ok:false, error:'empty'|'notfound'|'lookup'}>}
 */
export async function lookupPlace(text) {
  const res = await resolvePlace(text);
  if (!res.ok) return res;
  const rec = setLocation(res.rec);
  return rec ? { ok: true, rec } : { ok: false, error: 'notfound' };
}

/** What a failed lookup says, in the interface's voice. */
export const LOCATE_ERRORS = {
  unsupported: "This browser can't share your location. Enter a ZIP or town instead.",
  denied: 'Location is off for this site, so you’re seeing Indianapolis. Enter a ZIP or town, or turn location on in your browser settings.',
  unavailable: "Couldn't get your location. Try again, or enter a ZIP or town.",
  lookup: "Couldn't work out your town right now. Enter a ZIP or town instead.",
  outside: 'That location is outside the US. Enter a US ZIP or town.',
  empty: 'Enter a 5-digit ZIP or a town name.',
  notfound: "Couldn't find that place. Check the spelling or try a ZIP.",
};
