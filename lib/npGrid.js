/* ==========================================================================
   npGrid.js, the counting behind the map's layer of every US nonprofit.
   Pure functions, no DOM: lib/npPoints.worker.js runs them off the main
   thread, and lib/npPoints.js runs them in place when a worker can't start.

   decodeState(buffer)   one public/np-points/<ST>.bin, as typed arrays.
                         13-byte little-endian records: int32 lat x1e5,
                         int32 lng x1e5, uint32 EIN, uint8 NTEE major
                         (A=1..Z=26, 0 unknown), sorted by latitude.
   queryGrid(states, q)  what to draw for one view of the map: a dot per
                         nonprofit standing alone, and a count bubble where
                         several are too close to tell apart.

   Why a grid and not a clustering library: the map leaves out the orgs the
   page already draws as its own dots, and that list changes with every
   search. Counting the points in view on each query lets those EINs be
   skipped exactly, so no bubble counts an org twice, and there is no index
   to rebuild. Each view is one binary search on latitude per state and one
   pass over the points in that band (a few milliseconds for California).

   Points land in square cells of `cell` px fixed to the world, so a pan
   never reshuffles them. A cell's bubble sits at the mean of its points,
   and bubbles whose centers fall closer than `merge` px fold into the
   bigger one, so two never overlap across a cell edge.
   ========================================================================== */

export const RECORD_BYTES = 13;
const STACK_EINS = 20; // EINs sent with a bubble whose orgs all share one point (its list popup)

/**
 * @param {ArrayBuffer} buffer
 * @returns {{n:number, lat:Int32Array, lng:Int32Array, ein:Uint32Array, ntee:Uint8Array, mx:Float64Array, my:Float64Array}}
 */
export function decodeState(buffer) {
  if (!buffer || buffer.byteLength % RECORD_BYTES) throw new Error(`np-points: ${buffer ? buffer.byteLength : 0} bytes is not a whole number of records`);
  const n = buffer.byteLength / RECORD_BYTES;
  const dv = new DataView(buffer);
  const lat = new Int32Array(n);
  const lng = new Int32Array(n);
  const ein = new Uint32Array(n);
  const ntee = new Uint8Array(n);
  // Web Mercator x and y in 0..1 of the world, so a zoom only scales them.
  const mx = new Float64Array(n);
  const my = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * RECORD_BYTES;
    lat[i] = dv.getInt32(o, true);
    lng[i] = dv.getInt32(o + 4, true);
    ein[i] = dv.getUint32(o + 8, true);
    ntee[i] = dv.getUint8(o + 12);
    const la = Math.max(-85.0511, Math.min(85.0511, lat[i] / 1e5)) * (Math.PI / 180);
    mx[i] = (lng[i] / 1e5 + 180) / 360;
    my[i] = 0.5 - Math.log(Math.tan(Math.PI / 4 + la / 2)) / (2 * Math.PI);
  }
  return { n, lat, lng, ein, ntee, mx, my };
}

/** First index whose latitude is >= v (the records are sorted by latitude). */
function lowerBound(arr, v) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Dots and count bubbles for one view.
 * @param {Array<ReturnType<typeof decodeState>>} states the loaded states in view
 * @param {{bounds:[number,number,number,number], zoom:number, cell:number, merge:number, exclude?:Iterable<number|string>}} q
 *   bounds [south, west, north, east] in degrees; zoom may be fractional
 * @returns {{items:Array<object>, scanned:number}} each item
 *   { k, n, lat, lng, b:[s,w,n,e], same, ein?, ntee?, eins? }: `ein` and
 *   `ntee` when it is one org, `same` when every org in it shares one
 *   point, and then `eins` (the first 20) for its list popup.
 */
export function queryGrid(states, { bounds, zoom, cell, merge, exclude = [] }) {
  const [s, w, n, e] = bounds;
  const skip = new Set([...exclude].map((x) => Number(x)));
  const scale = 256 * 2 ** zoom;
  const s5 = Math.floor(s * 1e5);
  const n5 = Math.ceil(n * 1e5);
  const w5 = Math.floor(w * 1e5);
  const e5 = Math.ceil(e * 1e5);
  const cells = new Map();
  let scanned = 0;
  states.forEach((d) => {
    const end = lowerBound(d.lat, n5 + 1);
    for (let i = lowerBound(d.lat, s5); i < end; i += 1) {
      const lg = d.lng[i];
      if (lg < w5 || lg > e5) continue;
      scanned += 1;
      if (skip.size && skip.has(d.ein[i])) continue;
      const px = d.mx[i] * scale;
      const py = d.my[i] * scale;
      const cx = Math.floor(px / cell);
      const cy = Math.floor(py / cell);
      const key = cx * 1e7 + cy;
      const la = d.lat[i];
      let c = cells.get(key);
      if (!c) {
        c = { cx, cy, n: 0, px: 0, py: 0, sLat: 0, sLng: 0, b: [la, lg, la, lg], lat0: la, lng0: lg, same: true, ein: d.ein[i], ntee: d.ntee[i], eins: [] };
        cells.set(key, c);
      }
      c.n += 1;
      c.px += px;
      c.py += py;
      c.sLat += la;
      c.sLng += lg;
      if (la < c.b[0]) c.b[0] = la;
      if (lg < c.b[1]) c.b[1] = lg;
      if (la > c.b[2]) c.b[2] = la;
      if (lg > c.b[3]) c.b[3] = lg;
      if (c.same && (la !== c.lat0 || lg !== c.lng0)) c.same = false;
      if (c.same && c.eins.length < STACK_EINS) c.eins.push(d.ein[i]);
    }
  });
  return { items: mergeCells([...cells.values()], merge), scanned };
}

/** Cells whose centers sit within `merge` px fold into the bigger one (one greedy pass, biggest first). */
function mergeCells(list, merge) {
  const at = new Map();
  list.forEach((c) => at.set(c.cx * 1e7 + c.cy, c));
  const order = [...list].sort((a, b) => b.n - a.n || a.cx - b.cx || a.cy - b.cy);
  const gone = new Set();
  const out = [];
  const m2 = merge * merge;
  order.forEach((c) => {
    if (gone.has(c)) return;
    const acc = { ...c, b: [...c.b], eins: [...c.eins] };
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (!dx && !dy) continue;
        const o = at.get((c.cx + dx) * 1e7 + (c.cy + dy));
        if (!o || gone.has(o) || o === c) continue;
        const ax = acc.px / acc.n - o.px / o.n;
        const ay = acc.py / acc.n - o.py / o.n;
        if (ax * ax + ay * ay >= m2) continue;
        gone.add(o);
        acc.same = acc.same && o.same && o.lat0 === acc.lat0 && o.lng0 === acc.lng0;
        acc.n += o.n;
        acc.px += o.px;
        acc.py += o.py;
        acc.sLat += o.sLat;
        acc.sLng += o.sLng;
        acc.b = [Math.min(acc.b[0], o.b[0]), Math.min(acc.b[1], o.b[1]), Math.max(acc.b[2], o.b[2]), Math.max(acc.b[3], o.b[3])];
      }
    }
    gone.add(c);
    out.push(itemFrom(acc));
  });
  return out;
}

function itemFrom(c) {
  const item = {
    k: `${c.cx}:${c.cy}`,
    n: c.n,
    lat: c.sLat / c.n / 1e5,
    lng: c.sLng / c.n / 1e5,
    b: c.b.map((v) => v / 1e5),
    same: c.n > 1 && c.same,
  };
  if (c.n === 1) {
    item.ein = c.ein;
    item.ntee = c.ntee;
  } else if (item.same) {
    item.eins = c.eins;
  }
  return item;
}
