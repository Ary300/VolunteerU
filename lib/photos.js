/* ==========================================================================
   photos.js, which photo a listing shows.

   1. The listing's own cover, if it is a usable image URL (http(s), a
      root-relative path or a data:image URI). Covers that point at the seed
      Pexels photos are served from /public/photos instead of the CDN. A
      stored cover always shows: the owner picked it. The cover picker only
      offers seed photos whose subject fits the cause (coverFits).
   2. Otherwise a seed photo for its cause, starting at a spot picked from the
      listing id so neighbours differ.
   3. Otherwise null, and the card draws a DateTile.

   Step 2 is OFF by default (seed:false): a stock photo of strangers on a
   real listing misrepresents it, so cards show only a listing's own cover.
   Pass { seed: true } only for marketing art that isn't a listing.

   A listing's own cover is an upload (Supabase Storage, lib/coverUpload.js)
   or a photo its lead picked from the cover library (lib/coverLibrary.js,
   TEMPLATE_PHOTOS below). Create suggests a library photo for the cause
   (suggestedCover) until the lead uploads one, picks another or chooses
   "No photo". When two listings on one screen picked the same library
   photo, the later one shows another photo from that set.

   A screen never shows the same photo twice, and never more than two
   photos from one Pexels shoot, because the same people at the same table
   read as a stock template when they repeat. Each seed photo names its
   shoot: 'tees' (the "VOLUNTEER" tee models, 6646xxx), 'donations' (the
   clothing and box sort, 7156xxx) and 'park' (the park cleanup, 367134xx).
   Build one picker per screen (usePhotoPicker / pickPhotos), pass the
   listings in display order, and pass `used` with the keys of any other
   photos already on the screen.

   trail.jpg poses for the camera with crossed arms, so it is no longer
   offered or rotated in. PHOTOS.trail stays so a cover stored with its
   Pexels URL is still recognised, and resolveCover shows the candid
   outdoor shot in its place.
   ========================================================================== */

import { useMemo } from 'react';
import { causeKey, CAUSE } from './tokens.js';
import { COVER_LIBRARY, COVER_SET_LABELS } from './coverLibrary.js';

/**
 * Seed photos: local path, small variant, the crop that keeps faces in frame,
 * and `suits`, the cause keys the picture plausibly shows.
 *
 * The `reading*` files are named after the listings they were first used
 * for, but they show volunteers sorting donated clothes and boxes next to a
 * clothing rack. They suit donation drives, shelters and relief work, never
 * tutoring or reading, so an education listing gets its CauseTile instead.
 * The keys stay as they are because screens reference them by name.
 */
const SEED_PHOTOS = {
  food: { src: '/photos/food.jpg', sm: '/photos/sm/food.jpg', pos: 'center 35%', pexels: '6646952', shoot: 'tees', subject: 'food drive', suits: ['food', 'disaster', 'civic', 'homelessness'] },
  food2: { src: '/photos/food2.jpg', sm: '/photos/sm/food2.jpg', pos: 'center 30%', pexels: '6646918', shoot: 'tees', subject: 'food drive', suits: ['food', 'disaster', 'civic', 'homelessness'] },
  food3: { src: '/photos/food3.jpg', sm: '/photos/sm/food3.jpg', pos: 'center 28%', pexels: '6646947', shoot: 'tees', subject: 'food drive', suits: ['food', 'disaster', 'civic', 'homelessness', 'health'] },
  civic: { src: '/photos/civic.jpg', sm: '/photos/sm/civic.jpg', pos: 'center 45%', pexels: '6646941', shoot: 'tees', subject: 'donation table outdoors', suits: ['food', 'disaster', 'civic', 'homelessness'] },
  reading: { src: '/photos/reading.jpg', sm: '/photos/sm/reading.jpg', pos: 'center 30%', pexels: '7156162', shoot: 'donations', subject: 'donations', suits: ['homelessness', 'disaster', 'civic', 'other'] },
  reading2: { src: '/photos/reading2.jpg', sm: '/photos/sm/reading2.jpg', pos: 'center 30%', pexels: '7156161', shoot: 'donations', subject: 'donations', suits: ['homelessness', 'disaster', 'civic', 'other'] },
  reading3: { src: '/photos/reading3.jpg', sm: '/photos/sm/reading3.jpg', pos: 'center 30%', pexels: '7156163', shoot: 'donations', subject: 'donations', suits: ['homelessness', 'disaster', 'civic', 'other'] },
  reading4: { src: '/photos/reading4.jpg', sm: '/photos/sm/reading4.jpg', pos: 'center 30%', pexels: '7156168', shoot: 'donations', subject: 'donations', suits: ['homelessness', 'disaster', 'civic', 'other'] },
  reading5: { src: '/photos/reading5.jpg', sm: '/photos/sm/reading5.jpg', pos: 'center 40%', pexels: '7156169', shoot: 'donations', subject: 'donations', suits: ['homelessness', 'disaster', 'civic', 'other'] },
  trail: { src: '/photos/trail.jpg', sm: '/photos/sm/trail.jpg', pos: '70% 35%', pexels: '36713467', shoot: 'park', subject: 'park cleanup', suits: ['environment'] },
  outdoor: { src: '/photos/outdoor.jpg', sm: '/photos/sm/outdoor.jpg', pos: 'center 50%', pexels: '36713461', shoot: 'park', subject: 'park cleanup sign-in', suits: ['environment'] },
  seniors: { src: '/photos/seniors.jpg', sm: '/photos/sm/seniors.jpg', pos: 'center 35%', pexels: '6647050', shoot: 'tees', subject: 'home visit', suits: ['seniors', 'health', 'food'] },
  shelter: { src: '/photos/shelter.jpg', sm: '/photos/sm/shelter.jpg', pos: 'center 40%', pexels: '6994869', subject: 'supply sort', suits: ['homelessness', 'disaster', 'food', 'other'] },
  lead: { src: '/photos/lead.jpg', sm: '/photos/sm/lead.jpg', pos: 'center 30%', pexels: '8543380', subject: 'volunteers in masks', suits: ['health', 'civic', 'other'] },
};

/** The donation-drive photos under the name that describes them. Same objects as PHOTOS.reading*. */
export const DONATION_PHOTOS = ['reading', 'reading2', 'reading3', 'reading4', 'reading5'];

/**
 * The cover library: photos a lead can pick in the cover picker, a few for
 * every cause (lib/coverLibrary.js, files in /public/photos/covers, credits
 * in /public/photos/CREDITS.md). Each is its own shoot, so none of them
 * counts toward MAX_PER_SHOOT. `template: true` marks them: a lead picked
 * one on purpose, so it shows whatever the listing's cause.
 */
const TEMPLATE_PHOTOS = Object.fromEntries(
  COVER_LIBRARY.map((t) => [
    t.key,
    {
      src: `/photos/covers/${t.key}.jpg`,
      sm: `/photos/covers/sm/${t.key}.jpg`,
      pos: t.pos || 'center',
      pexels: t.pexels,
      subject: t.subject,
      set: t.set,
      suits: [...new Set([t.set === 'general' ? 'other' : t.set, ...(t.alsoFits || [])])],
      template: true,
    },
  ])
);

export const PHOTOS = { ...SEED_PHOTOS, ...TEMPLATE_PHOTOS };

/** Library set for each cause key. Disaster relief and Other use the general set. */
const SET_FOR_CAUSE = { disaster: 'general', other: 'general' };
const setFor = (cause) => {
  const k = causeKey(cause);
  return SET_FOR_CAUSE[k] || (COVER_SET_LABELS[k] ? k : 'general');
};

const TEMPLATE_KEYS = Object.keys(TEMPLATE_PHOTOS);
const templatesInSet = (set) => TEMPLATE_KEYS.filter((k) => TEMPLATE_PHOTOS[k].set === set);

/**
 * Library photos per cause key, in rotation order: the cause's own set, then
 * other photos whose subject also fits it.
 */
export const CAUSE_PHOTOS = Object.fromEntries(
  Object.keys(CAUSE).map((k) => {
    const own = templatesInSet(setFor(k));
    const more = TEMPLATE_KEYS.filter((key) => !own.includes(key) && TEMPLATE_PHOTOS[key].suits.includes(k));
    return [k, [...own, ...more]];
  })
);

const BY_PEXELS_ID = Object.fromEntries(Object.entries(PHOTOS).map(([k, p]) => [p.pexels, k]));
const BY_SRC = Object.fromEntries(Object.values(PHOTOS).flatMap((p) => [[p.src, p], [p.sm, p]]));

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * True for a cover the browser can load as an image: an http(s) URL, a
 * root-relative path (not protocol-relative) or a data:image URI. Anything
 * else (a typo, markup, a javascript: URL) would only request a 404 or fail,
 * so the listing falls back to its CauseTile.
 * @param {string} c
 */
export function isUsableImageUrl(c) {
  if (typeof c !== 'string' || !c || c.length > 4096) return false;
  // Quotes, angle brackets, backslashes, whitespace and control characters
  // never appear in a real image URL; they mean the field holds something else.
  // eslint-disable-next-line no-control-regex
  if (/["'<>\\\s\u0000-\u001f\u007f]/.test(c)) return false;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(c)) return true;
  if (c.startsWith('/')) return !c.startsWith('//');
  try {
    const u = new URL(c);
    return (u.protocol === 'https:' || u.protocol === 'http:') && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** Seed-photo key for a stored cover, or null when it isn't one of ours. */
function seedKeyFor(c) {
  const m = c.match(/^https?:\/\/(?:images\.)?pexels\.com\/photos\/(\d+)\//);
  if (m && BY_PEXELS_ID[m[1]]) return BY_PEXELS_ID[m[1]];
  const p = BY_SRC[c.split('?')[0]];
  return p ? Object.keys(PHOTOS).find((k) => PHOTOS[k] === p) || null : null;
}

/**
 * Normalise a stored cover URL. Seed Pexels covers resolve to the local copy.
 * Pass the listing's cause to drop a seed photo whose subject doesn't fit it
 * (a clothing drive on a tutoring listing). A cover the organizer chose is
 * returned as is when it is a usable image URL, otherwise null.
 * @param {string | null | undefined} cover
 * @param {string} [cause] the listing's cause, any wording
 * @returns {{ src: string, sm: string, pos: string, key: string } | null}
 */
export function resolveCover(cover, cause) {
  const c = typeof cover === 'string' ? cover.trim() : '';
  if (!c) return null;
  const found = seedKeyFor(c);
  // trail.jpg poses for the camera; stored trail covers show the candid outdoor shot.
  const key = found === 'trail' ? 'outdoor' : found;
  if (key) {
    const p = PHOTOS[key];
    // Library photos were picked on purpose, so only the older seed photos
    // are held to the cause they show.
    if (!p.template && cause !== undefined && cause !== null && cause !== '' && p.suits && !p.suits.includes(causeKey(cause))) return null;
    return { ...p, key };
  }
  if (!isUsableImageUrl(c)) return null;
  return { src: c, sm: c, pos: 'center', key: c };
}

/** Most photos from one Pexels shoot on one screen. */
export const MAX_PER_SHOOT = 2;

const shootOf = (key) => (PHOTOS[key] && PHOTOS[key].shoot) || null;

/**
 * Pick photos for a list of listings shown on one screen, in display order.
 * Returns a Map from listing id (or index) to { src, sm, pos } or null.
 * @param {Array<{ id?: string, cover?: string, photo?: string, cause?: string }>} listings
 * @param {{ seed?: boolean, used?: Iterable<string>, maxPerShoot?: number }} [opts]
 *   seed (default false): fill photo-less listings with a fitting seed photo.
 *   used: photo keys already on the screen (hero, art), counted for repeats and shoots.
 */
export function pickPhotos(listings, opts = {}) {
  const { seed = false } = opts;
  const cap = opts.maxPerShoot === undefined ? MAX_PER_SHOOT : opts.maxPerShoot;
  const used = new Set(opts.used || []);
  const shoots = new Map();
  for (const k of used) {
    const sh = shootOf(k);
    if (sh) shoots.set(sh, (shoots.get(sh) || 0) + 1);
  }
  const fits = (key) => {
    if (used.has(key)) return false;
    const sh = shootOf(key);
    return !sh || (shoots.get(sh) || 0) < cap;
  };
  const take = (key) => {
    used.add(key);
    const sh = shootOf(key);
    if (sh) shoots.set(sh, (shoots.get(sh) || 0) + 1);
  };
  const out = new Map();
  (listings || []).forEach((l, i) => {
    const id = (l && l.id) || `#${i}`;
    // A cover stored on the listing is the owner's choice, so it shows
    // whatever its cause. Only the cover picker (coverFits) filters by cause.
    const own = resolveCover(l && (l.cover || l.photo || l.img));
    if (own && fits(own.key)) {
      take(own.key);
      out.set(id, own);
      return;
    }
    // Two listings that picked the same library photo: the later one shows
    // another photo from the same set, so the screen never repeats a photo.
    if (own && PHOTOS[own.key] && PHOTOS[own.key].template) {
      const pool = templatesInSet(PHOTOS[own.key].set);
      const start = hash(id) % (pool.length || 1);
      for (let j = 0; j < pool.length; j++) {
        const k = pool[(start + j) % pool.length];
        if (fits(k)) {
          take(k);
          out.set(id, { ...PHOTOS[k], key: k });
          return;
        }
      }
    }
    if (!seed) {
      out.set(id, null);
      return;
    }
    const pool = CAUSE_PHOTOS[causeKey(l && l.cause)] || [];
    if (!pool.length) {
      out.set(id, null);
      return;
    }
    const start = hash(id) % pool.length;
    let chosen = null;
    for (let j = 0; j < pool.length; j++) {
      const k = pool[(start + j) % pool.length];
      if (fits(k)) {
        chosen = k;
        break;
      }
    }
    if (chosen) {
      take(chosen);
      out.set(id, { ...PHOTOS[chosen], key: chosen });
    } else out.set(id, null);
  });
  return out;
}

/**
 * React hook form of pickPhotos. Recomputes when the ids, covers or causes change.
 * const photos = usePhotoPicker(listings); photos.get(listing.id) -> photo | null
 */
export function usePhotoPicker(listings, opts = {}) {
  const sig = (listings || []).map((l) => `${l && l.id}|${l && (l.cover || l.photo || '')}|${l && l.cause}`).join('~');
  const seed = opts.seed === true;
  const usedSig = opts.used ? [...opts.used].join('|') : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => pickPhotos(listings, { seed, used: opts.used, maxPerShoot: opts.maxPerShoot }), [sig, seed, usedSig, opts.maxPerShoot]);
}

/** One listing on its own (detail page, a single row). No de-duplication. */
export function photoFor(listing, opts = {}) {
  return pickPhotos([listing], opts).values().next().value || null;
}

/**
 * True when a stored cover would show for a listing with this cause. Use it
 * to offer only fitting seed photos in a cover picker.
 * @param {string} cover @param {string} cause
 */
export function coverFits(cover, cause) {
  return resolveCover(cover, cause || '') !== null;
}

/**
 * True when fewer than half the listings on a screen have a photo. Such a
 * grid shows its photo-less listings as date-led rows (ListingCard `row`)
 * instead of big date tiles, so it never turns into a wall of tints.
 * @param {Array<{ id?: string }>} listings in display order
 * @param {Map<string, object | null>} photos from pickPhotos / usePhotoPicker
 */
export function mostlyTiles(listings, photos) {
  const list = listings || [];
  if (!list.length) return false;
  const withPhoto = list.filter((l, i) => Boolean(photos && photos.get((l && l.id) || `#${i}`))).length;
  return withPhoto * 2 < list.length;
}

/**
 * Reorder listings for a marketing grid so photos lead: each row of `perRow`
 * holds at most `maxTilesPerRow` listings without a photo, placed last in
 * the row. Listings that don't fit that rule follow at the end in their
 * original order. Nothing is dropped and the input is not changed.
 * @template {{ id?: string }} T
 * @param {T[]} listings in display order
 * @param {Map<string, object | null>} photos from pickPhotos / usePhotoPicker
 * @param {{ perRow?: number, maxTilesPerRow?: number }} [opts]
 * @returns {T[]}
 */
export function photoFirst(listings, photos, opts = {}) {
  const perRow = Math.max(1, opts.perRow || 4);
  const maxTiles = Math.max(0, Math.min(perRow, opts.maxTilesPerRow === undefined ? 1 : opts.maxTilesPerRow));
  const list = listings || [];
  const has = (l, i) => Boolean(photos && photos.get((l && l.id) || `#${i}`));
  const withPhoto = list.filter((l, i) => has(l, i));
  const without = list.filter((l, i) => !has(l, i));
  const out = [];
  let p = 0;
  let t = 0;
  while (p < withPhoto.length) {
    const tiles = Math.min(maxTiles, without.length - t);
    const take = Math.min(perRow - tiles, withPhoto.length - p);
    // A short last row of photos takes no tile, so tiles never fill a row.
    const useTiles = take === perRow - tiles ? tiles : 0;
    out.push(...withPhoto.slice(p, p + take), ...without.slice(t, t + useTiles));
    p += take;
    t += useTiles;
  }
  return [...out, ...without.slice(t)];
}

/**
 * Library photos for the cover picker: the cause's own set first, then the
 * rest grouped by set in COVER_SET_LABELS order.
 * @param {string} cause the listing's cause, any wording
 * @returns {{ own: Array<{key:string,src:string,sm:string,pos:string,subject:string,set:string}>, rest: Array<{ set: string, label: string, photos: Array<{key:string,src:string,sm:string,pos:string,subject:string,set:string}> }>, label: string }}
 */
export function coverTemplates(cause) {
  const set = setFor(cause);
  const toItem = (k) => ({ key: k, ...TEMPLATE_PHOTOS[k] });
  const own = templatesInSet(set).map(toItem);
  const rest = Object.keys(COVER_SET_LABELS)
    .filter((s) => s !== set)
    .map((s) => ({ set: s, label: COVER_SET_LABELS[s], photos: templatesInSet(s).map(toItem) }))
    .filter((g) => g.photos.length);
  return { own, rest, label: COVER_SET_LABELS[set] };
}

/**
 * The library photo a new listing starts with, by cause. `seed` (any number)
 * picks which one, so two new listings for one cause don't open on the same
 * photo. Returns its /photos path, or '' if the library is empty.
 * @param {string} cause @param {number} [seed]
 */
export function suggestedCover(cause, seed = 0) {
  const pool = templatesInSet(setFor(cause));
  if (!pool.length) return '';
  const i = Math.abs(Math.floor(Number(seed) || 0)) % pool.length;
  return TEMPLATE_PHOTOS[pool[i]].src;
}
