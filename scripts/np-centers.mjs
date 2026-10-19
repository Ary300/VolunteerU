#!/usr/bin/env node
/* ==========================================================================
   np-centers.mjs, adds `center` and `view` to public/np-points/index.json.

   Discover's map draws one count bubble per state below zoom 6, so the
   country view never downloads the points themselves. This reads every
   <ST>.bin (13-byte little-endian records: int32 lat x1e5, int32 lng x1e5,
   uint32 EIN, uint8 NTEE major) and writes, per state:

     center  [lat, lng]   the mean of its points, where its bubble sits
     view    [minLat, minLng, maxLat, maxLng]
                          its points' bounding box clipped to the state's own
                          extent (US Census TIGER, padded 0.1 degree). A few
                          IRS addresses geocode to another state (an org in
                          Missouri whose street matched one in Florida), and
                          the raw bbox would then cover half the country. The
                          map loads a state's points when its view is on
                          screen and zooms to its view when its bubble is
                          clicked.

   Safe to run again at any time: it only sets those two fields, keeps
   everything else in index.json as it is, skips a state whose .bin is
   missing or the wrong size, and replaces the file in one rename. Run it
   after the points are regenerated and commit the updated index.json.

     node scripts/np-centers.mjs
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'np-points');
const INDEX = path.join(ROOT, 'index.json');
const REC = 13;
const PAD = 0.1;

// [minLat, minLng, maxLat, maxLng] for each state, DC and the territories (TIGER extents).
// Alaska's Aleutians cross 180 degrees; its box starts at -180 and points east of 180 are left as they are.
const EXTENT = {
  AL: [30.14, -88.47, 35.01, -84.89], AK: [51.21, -180, 71.39, -129.98], AZ: [31.33, -114.82, 37.0, -109.04], AR: [33.0, -94.62, 36.5, -89.64],
  CA: [32.53, -124.41, 42.01, -114.13], CO: [36.99, -109.06, 41.0, -102.04], CT: [40.98, -73.73, 42.05, -71.79], DE: [38.45, -75.79, 39.84, -75.05],
  DC: [38.79, -77.12, 39.0, -76.91], FL: [24.39, -87.63, 31.0, -80.03], GA: [30.36, -85.61, 35.0, -80.84], HI: [18.91, -160.25, 22.24, -154.81],
  ID: [41.99, -117.24, 49.0, -111.04], IL: [36.97, -91.51, 42.51, -87.5], IN: [37.77, -88.1, 41.76, -84.78], IA: [40.38, -96.64, 43.5, -90.14],
  KS: [36.99, -102.05, 40.0, -94.59], KY: [36.5, -89.57, 39.15, -81.96], LA: [28.93, -94.04, 33.02, -88.82], ME: [43.06, -71.08, 47.46, -66.95],
  MD: [37.89, -79.49, 39.72, -75.05], MA: [41.24, -73.51, 42.89, -69.93], MI: [41.7, -90.42, 48.31, -82.41], MN: [43.5, -97.24, 49.38, -89.49],
  MS: [30.17, -91.66, 35.01, -88.1], MO: [35.99, -95.77, 40.61, -89.1], MT: [44.36, -116.05, 49.0, -104.04], NE: [40.0, -104.05, 43.0, -95.31],
  NV: [35.0, -120.01, 42.0, -114.04], NH: [42.7, -72.56, 45.31, -70.61], NJ: [38.93, -75.56, 41.36, -73.89], NM: [31.33, -109.05, 37.0, -103.0],
  NY: [40.5, -79.76, 45.02, -71.86], NC: [33.84, -84.32, 36.59, -75.46], ND: [45.94, -104.05, 49.0, -96.55], OH: [38.4, -84.82, 41.98, -80.52],
  OK: [33.62, -103.0, 37.0, -94.43], OR: [41.99, -124.57, 46.29, -116.46], PA: [39.72, -80.52, 42.27, -74.69], RI: [41.15, -71.91, 42.02, -71.12],
  SC: [32.03, -83.35, 35.22, -78.54], SD: [42.48, -104.06, 45.95, -96.44], TN: [34.98, -90.31, 36.68, -81.65], TX: [25.84, -106.65, 36.5, -93.51],
  UT: [37.0, -114.05, 42.0, -109.04], VT: [42.73, -73.44, 45.02, -71.46], VA: [36.54, -83.68, 39.47, -75.24], WA: [45.54, -124.85, 49.0, -116.92],
  WV: [37.2, -82.64, 40.64, -77.72], WI: [42.49, -92.89, 47.31, -86.25], WY: [40.99, -111.06, 45.01, -104.05],
  PR: [17.88, -68.0, 18.52, -65.22], VI: [17.67, -65.09, 18.42, -64.56], GU: [13.23, 144.61, 13.66, 144.96],
  AS: [-14.6, -170.85, -11.04, -168.14], MP: [14.1, 144.88, 20.56, 146.07],
};

const round5 = (v) => Math.round(v * 1e5) / 1e5;

/** Mean point and clipped bounding box of one state's records, or null when the file is unusable. */
function summarize(st, buf) {
  if (!buf.length || buf.length % REC) return null;
  const n = buf.length / REC;
  let sLat = 0;
  let sLng = 0;
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  const ext = EXTENT[st];
  for (let i = 0; i < n; i += 1) {
    const lat = buf.readInt32LE(i * REC) / 1e5;
    const lng = buf.readInt32LE(i * REC + 4) / 1e5;
    sLat += lat;
    sLng += lng;
    const inside = !ext || (lat >= ext[0] - PAD && lat <= ext[2] + PAD && lng >= ext[1] - PAD && lng <= ext[3] + PAD);
    if (inside) box = [Math.min(box[0], lat), Math.min(box[1], lng), Math.max(box[2], lat), Math.max(box[3], lng)];
  }
  const view = Number.isFinite(box[0]) ? box.map(round5) : null;
  return { n, center: [round5(sLat / n), round5(sLng / n)], view };
}

function main() {
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const states = (index && index.states) || {};
  const done = [];
  const skipped = [];
  const next = {};
  Object.keys(states).forEach((st) => {
    const meta = states[st];
    const file = path.join(ROOT, `${st}.bin`);
    const s = fs.existsSync(file) ? summarize(st, fs.readFileSync(file)) : null;
    if (!s || (Number.isFinite(meta.count) && meta.count !== s.n)) {
      skipped.push(st);
      next[st] = meta;
      return;
    }
    next[st] = { ...meta, center: s.center, ...(s.view ? { view: s.view } : {}) };
    done.push(st);
  });
  const out = `${JSON.stringify({ ...index, states: next }, null, 1)}\n`;
  const tmp = `${INDEX}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, INDEX);
  console.log(`np-centers: ${done.length} states updated${skipped.length ? `, skipped ${skipped.join(' ')} (no .bin yet, or its size doesn't match the count)` : ''}`);
}

try {
  if (fs.existsSync(INDEX)) main();
  else console.log('np-centers: no public/np-points/index.json, nothing to do');
} catch (err) {
  // A build shouldn't fail over this; the map falls back to each state's bbox.
  console.error('np-centers: failed', err);
}
