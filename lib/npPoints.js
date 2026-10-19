/* ==========================================================================
   npPoints.js, the points behind the map's layer of every US nonprofit.
   Browser code.

   public/np-points/ holds one file per state: <ST>.bin, every 501(c)(3)
   public charity on the IRS Business Master File placed at its street
   address by the US Census geocoder (lib/npGrid.js reads the format), and
   index.json, which lists each state's count, bounding box, mean point
   (`center`) and clipped box (`view`, from scripts/np-centers.mjs).

   loadNpIndex()        the index, fetched once per page. null when it can't
                        be read; the map then draws no national layer.
   loadNpState(st)      one state's decoded points, fetched once per page and
                        kept in memory. A failed fetch is asked again on the
                        next call, after a short wait.
   npStateIfLoaded(st)  the decoded points, or null while they aren't here.
   stateBox(meta)       the box a state's points are drawn and loaded for.

   Decoding California (135,000 points, 1.7 MB) takes about 10 ms and a
   view's query about 5 ms (measured), so both run on the main thread.
   ========================================================================== */

import { decodeState } from './npGrid.js';

const BASE = '/np-points';
const RETRY_MS = 15000;

let indexP = null;
const states = new Map(); // st -> { data, p, failedAt }

/** @returns {Promise<{version:number, generated:string, source:string, states:Object<string,{count:number,bbox:number[],center?:number[],view?:number[]}>}|null>} */
export function loadNpIndex() {
  if (!indexP) {
    indexP = fetch(`${BASE}/index.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((idx) => (idx && idx.states && typeof idx.states === 'object' ? idx : null))
      .catch((err) => {
        console.error('[np-points] index failed to load', err);
        return null;
      })
      .then((idx) => {
        if (!idx) indexP = null; // asked again on the next map
        return idx;
      });
  }
  return indexP;
}

/** The decoded points for a state that has loaded, else null. */
export function npStateIfLoaded(st) {
  const s = states.get(st);
  return s && s.data ? s.data : null;
}

/**
 * One state's points. `version` (the index's `generated`) busts the cache
 * when the files are rebuilt.
 * @returns {Promise<ReturnType<typeof decodeState>|null>}
 */
export function loadNpState(st, version = '') {
  const have = states.get(st);
  if (have && (have.data || have.p)) return have.p || Promise.resolve(have.data);
  if (have && have.failedAt && Date.now() - have.failedAt < RETRY_MS) return Promise.resolve(null);
  const entry = { data: null, p: null, failedAt: 0 };
  states.set(st, entry);
  entry.p = fetch(`${BASE}/${encodeURIComponent(st)}.bin${version ? `?v=${encodeURIComponent(version)}` : ''}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${st}.bin ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      entry.data = decodeState(buf);
      entry.p = null;
      return entry.data;
    })
    .catch((err) => {
      console.error('[np-points] state failed to load', st, err);
      entry.p = null;
      entry.failedAt = Date.now();
      return null;
    });
  return entry.p;
}

/** [south, west, north, east] a state's points are loaded for: its clipped `view`, else its `bbox`. */
export function stateBox(meta) {
  const b = (meta && Array.isArray(meta.view) && meta.view.length === 4 ? meta.view : meta && meta.bbox) || null;
  return b && b.every(Number.isFinite) ? b : null;
}

/** Where a state's count bubble sits: its mean point, else the middle of its box. */
export function stateCenter(meta) {
  if (meta && Array.isArray(meta.center) && meta.center.length === 2 && meta.center.every(Number.isFinite)) return { lat: meta.center[0], lng: meta.center[1] };
  const b = stateBox(meta);
  return b ? { lat: (b[0] + b[2]) / 2, lng: (b[1] + b[3]) / 2 } : null;
}
