'use client';

/* ==========================================================================
   Landing.jsx, design screen: `isLanding` (photo-first direction)
   The hero search and the category row query live data for everyone,
   signed in or not: opportunities from the listings table (live rows are
   public) and registered nonprofits from /api/nonprofits (ProPublica / IRS
   records). Listing cards show only a listing's own cover, and the page
   photos further down are picked around whatever the listings use.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S } from '../../lib/style.js';
import { C, F, CATEGORIES } from '../../lib/tokens.js';
import { useSnapshot } from '../../lib/store.js';
import { Button, Icon } from '../ui.jsx';
import { SearchBar, CategoryRow, ListingCard, NonprofitRow, DateBlock, whenParts, Sep, WHEN_OPTIONS, ShareHoursCard } from '../vu/index.js';
import { MarketingHeader, MarketingFooter, useMarketingLinks, scrollToAnchor } from '../Marketing.jsx';
import { searchListings, searchWebNonprofits, parseState, listingShifts } from '../../lib/listings.js';
import { isVolunteerPlace } from '../../lib/nonprofitRules.js';
import { inferYear, shiftDates } from '../../lib/calendar.js';
import { whenWindow } from '../DiscoverListings.jsx';
import { pickPhotos, PHOTOS, DONATION_PHOTOS } from '../../lib/photos.js';
import { shiftLabel } from './JoinListing.jsx';

const PAGE = 6; // rows per "page" of the list under the grid
const GRID_COLS = 4; // .lp-grid columns at desktop width
const GRID_MAX = 8; // two rows of cards; the rest of the listings are rows
const MAX_ORGS = 8;
/* The hero photo is fixed above the fold, so it is the one page photo that
   counts against listings: a listing never repeats it, and the "VOLUNTEER"
   tee shoot it belongs to shows at most twice on the page. */
const HERO_PHOTO = 'food2';
/* The other page art is chosen after the listings, so a listing's own cover
   always shows and the art takes the first photo in its list that no
   listing on the page uses. None of these are from the tee shoot. */
const ART_CHOICES = {
  // A group at work, nobody posing.
  shift: ['reading4', 'reading', 'shelter', 'reading3'],
  lead: ['shelter', 'reading2', 'reading', 'reading4'],
};
/* trail.jpg is left out on purpose: its subject poses for the camera with
   crossed arms, which reads as stock. A listing may still use it as a cover.
   The pair fills first so it keeps both photos when choices run short. */
const ART_ORDER = ['shift', 'lead'];
/* Crops for the wide 16:10 art frame, where the card crop would cut heads. */
const ART_POS = { reading5: 'center 12%' };
/* Photos from one Pexels shoot show the same people at the same table, so
   page art takes at most one photo per shoot and none from the hero's.
   lead.jpg (masked models bumping elbows on a studio backdrop) is never
   page art: it is the most staged photo in the set.
   lib/photos.js tags the tee shoot; the donation-drive (7156xxx) and
   park-cleanup (367134xx) shoots are tagged here as well. */
const ART_SHOOTS = {
  ...Object.fromEntries(DONATION_PHOTOS.map((k) => [k, 'donations'])),
  trail: 'park',
  outdoor: 'park',
};
const shootOf = (key) => (PHOTOS[key] && PHOTOS[key].shoot) || ART_SHOOTS[key] || key;

/* Page art for the photo keys the listings already show. A slot takes a
   photo from a shoot no listing on the page shows. Only the first pair
   photo may fall back to a shoot a card shows, so the same models never
   turn up again further down the page. A photo never repeats. When the pair
   gets one photo it runs as `wide`, one frame across both columns, so the
   columns stay level. */
const FALLBACK_SLOTS = new Set(['shift']);
function pickArt(taken) {
  const used = new Set([HERO_PHOTO, ...taken]);
  const artShoots = new Set([shootOf(HERO_PHOTO)]);
  const cardShoots = new Set(taken.map(shootOf));
  const out = {};
  for (const slot of ART_ORDER) {
    const open = ART_CHOICES[slot].filter((k) => PHOTOS[k] && !used.has(k) && !artShoots.has(shootOf(k)));
    const fresh = open.find((k) => !cardShoots.has(shootOf(k)));
    const key = fresh || (FALLBACK_SLOTS.has(slot) ? open[0] : null) || null;
    if (!key) {
      out[slot] = null;
      continue;
    }
    used.add(key);
    artShoots.add(shootOf(key));
    out[slot] = { ...PHOTOS[key], key, pos: ART_POS[key] || PHOTOS[key].pos };
  }
  out.wide = null;
  if (!out.shift !== !out.lead) {
    out.wide = out.shift || out.lead;
    out.shift = null;
    out.lead = null;
  }
  return out;
}

/* Split listings into the card grid and the rows under it. Each grid row of
   GRID_COLS holds at most one listing without a photo, after the photos,
   so the grid is never a wall of date tiles. Every other listing without a
   photo becomes a row. Order inside each group is kept. */
function gridAndRows(list, photos) {
  const has = (l) => Boolean(photos.get(l.id));
  const withPhoto = list.filter(has);
  const without = list.filter((l) => !has(l));
  const grid = [];
  let p = 0;
  let t = 0;
  while (p < withPhoto.length && grid.length < GRID_MAX) {
    const tile = t < without.length ? 1 : 0;
    const take = Math.min(GRID_COLS - tile, withPhoto.length - p, GRID_MAX - grid.length - tile);
    grid.push(...withPhoto.slice(p, p + take));
    p += take;
    if (tile && grid.length < GRID_MAX) grid.push(without[t++]);
  }
  // Photo listings past two rows of cards lead their row with a thumbnail.
  return { grid, rows: [...withPhoto.slice(p), ...without.slice(t)] };
}
/* With no search yet, a spread of causes from IRS records. */
const DEFAULT_ORG_QUERIES = ['food bank', 'animal shelter', 'public library', 'homeless shelter'];

/* Signed-out visitors start in Indianapolis, the region VolunteerU serves. */
const HOME_AREA = 'Indianapolis, IN';
const HOME_CITY = 'Indianapolis';
/* Real Indianapolis nonprofits: the first ProPublica pages of IRS records for
   Indianapolis, kept to rows whose city is Indianapolis. The preview
   skips only records that clearly can't take a teen volunteer, by the rule
   in lib/nonprofitRules.js (clubs, lodges, unions, business leagues, HOAs,
   boosters and PTOs, political groups, family foundations, holding
   corporations). Churches and youth sports stay: both run on volunteers.
   The "See all" link opens every record on Discover with the true total. */
const HOME_PAGES = [0, 1, 2];
const CAUSE_ORDER = ['Environment', 'Education', 'Human services', 'Youth', 'Health', 'Arts', 'Civic', 'Disaster relief', 'Food & hunger', 'Homelessness', 'Animals', 'Recreation', 'Religion', 'Nonprofit'];
/* Listings in Indianapolis sort first in the default view, then the towns
   around it. */
const HOME_RE = /\b(indianapolis|indy)\b/i;
const NEARBY_RE = /\b(indiana|carmel|fishers|westfield|noblesville|zionsville|greenwood|lawrence|speedway|beech grove|avon|plainfield|brownsburg|hamilton county|marion county)\b|,\s*in\b/i;

const LANDING_CSS = `
.lp-hero { position:relative; height:580px; margin-top:8px; }
.lp-hero-img { position:absolute; inset:0; border-radius:24px; overflow:hidden; background:${C.ink}; }
.lp-hero-img img { width:100%; height:100%; object-fit:cover; object-position:50% 30%; display:block; }
.lp-hero-img::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(20,24,22,0) 25%, rgba(20,24,22,.66) 100%), linear-gradient(90deg, rgba(20,24,22,.5) 0%, rgba(20,24,22,0) 60%); }
.lp-hero-copy { position:absolute; z-index:1; left:56px; bottom:104px; max-width:780px; color:#fff; }
.lp-hero-copy h1 { margin:0; font:700 76px/.98 ${F.display}; letter-spacing:-0.035em; text-wrap:balance; }
.lp-hero-copy p { margin:18px 0 0; max-width:540px; font:400 19px/1.45 ${F.body}; color:rgba(255,255,255,.92); text-wrap:pretty; }
.lp-hero-search { position:absolute; left:40px; right:200px; bottom:-42px; z-index:2; }
.lp-under { margin-top:66px; padding-left:68px; display:flex; align-items:center; gap:10px 24px; flex-wrap:wrap; font:500 14px/1.4 ${F.body}; color:${C.ink2}; }
.lp-under a { color:${C.ink}; font-weight:600; text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; }
.lp-hint { font:500 14px/1.4 ${F.body}; color:${C.emberDeep}; }
.lp-cats { margin-top:44px; }
.lp-sec { margin-top:56px; scroll-margin-top:96px; }
.lp-sec-head { display:flex; align-items:baseline; justify-content:space-between; gap:16px; }
.lp-sec-head h2 { margin:0; min-width:0; font:650 28px/1.12 ${F.display}; letter-spacing:-0.022em; color:${C.ink}; }
.lp-sub { margin:8px 0 0; font:400 14px/1.4 ${F.body}; color:${C.ink2}; }
.lp-link { flex:none; font:600 15px/1 ${F.body}; color:${C.ink}; text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; white-space:nowrap; }
.lp-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:40px 24px; margin-top:22px; }
.lp-more { margin-top:32px; }
.lp-skel-ph { aspect-ratio:4/3; border-radius:16px; background:${C.mist}; }
.lp-skel-bar { height:12px; border-radius:4px; background:${C.mist}; margin-top:12px; }
.lp-np { margin-top:14px; column-gap:56px; }
.lp-pair { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; margin-top:24px; }
.lp-pair-ph { aspect-ratio:16/10; border-radius:16px; overflow:hidden; background:${C.mist}; }
.lp-pair-ph img { width:100%; height:100%; object-fit:cover; display:block; }
.lp-pair-ph.is-wide { aspect-ratio:21/8; margin-top:24px; }
.lp-pair-ph.is-wide + .lp-pair { margin-top:0; }
.lp-pair h3 { margin:20px 0 0; font:650 28px/1.12 ${F.display}; letter-spacing:-0.022em; }
.lp-pair p { margin:8px 0 14px; max-width:520px; font:400 16px/1.5 ${F.body}; color:${C.ink2}; text-wrap:pretty; }
.lp-h1 { margin:0; font:700 40px/1.05 ${F.display}; letter-spacing:-0.03em; color:${C.ink}; }
.lp-band { margin-top:104px; scroll-margin-top:76px; }
.lp-how { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:72px; align-items:center; padding:64px 0; border-top:1px solid ${C.line}; border-bottom:1px solid ${C.line}; }
.lp-how-p { margin:14px 0 0; max-width:460px; font:400 17px/1.5 ${F.body}; color:${C.ink2}; text-wrap:pretty; }
.lp-how-act { margin-top:24px; }
.lp-how-card { width:100%; max-width:400px; justify-self:center; }
.lp-start { scroll-margin-top:96px; }
.lp-rows { margin-top:48px; }
.lp-rows.is-only { margin-top:22px; }
.lp-rows h3 + .lp-list { margin-top:12px; }
.lp-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:48px; border-top:0; }
.lp-list > li:nth-child(-n+2) { border-top:1px solid ${C.line}; }
.lp-row-end { color:${C.ink3}; }
.lp-faq { display:grid; grid-template-columns:minmax(0,4fr) minmax(0,8fr); gap:72px; margin-top:112px; }
.lp-q { display:flex; width:100%; align-items:center; justify-content:space-between; gap:24px; padding:22px 0; text-align:left; font:600 17px/1.3 ${F.body}; color:${C.ink}; background:none; border:0; cursor:pointer; }
.lp-q svg { flex:none; color:${C.ink3}; transition:transform .2s ease; }
.lp-q[aria-expanded="true"] svg { transform:rotate(180deg); }
.lp-a { padding:0 0 22px; margin-top:-8px; max-width:640px; font:400 15px/1.55 ${F.body}; color:${C.ink2}; text-wrap:pretty; }
.lp-cta { margin-top:112px; padding-top:56px; border-top:1px solid ${C.line}; display:flex; align-items:center; justify-content:space-between; gap:24px 48px; flex-wrap:wrap; }
.lp-cta p { margin:10px 0 0; font:400 17px/1.5 ${F.body}; color:${C.ink2}; }
.lp-cta-btns { display:flex; align-items:center; gap:12px 24px; flex-wrap:wrap; }
@media (hover:hover) {
  .lp-link:hover, .lp-under a:hover { text-decoration-thickness:2px; }
  .lp-q:hover span { text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; }
}
@media (prefers-reduced-motion: reduce) { .lp-q svg { transition:none; } }
@media (max-width: 1179px) {
  .lp-hero { height:540px; }
  .lp-hero-copy { left:36px; right:36px; }
  .lp-hero-copy h1 { font-size:60px; }
  .lp-hero-search { left:24px; right:24px; }
  .lp-under { padding-left:28px; }
  .lp-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .lp-how { grid-template-columns:minmax(0,1fr); gap:40px; }
  .lp-how-card { justify-self:start; }
  .lp-list { grid-template-columns:minmax(0,1fr); border-top:1px solid ${C.line}; }
  .lp-list > li:nth-child(-n+2) { border-top:0; }
  .lp-faq { grid-template-columns:minmax(0,1fr); gap:24px; margin-top:88px; }
}
@media (max-width: 900px) {
  .lp-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .lp-pair { grid-template-columns:minmax(0,1fr); gap:48px; }
  .lp-pair-ph.is-wide { aspect-ratio:16/9; }
  .lp-pair-ph.is-wide + .lp-pair { gap:32px; }
}
@media (max-width: 719px) {
  .lp-hero { height:auto; margin-top:4px; }
  .lp-hero-img { position:relative; height:470px; border-radius:16px; }
  .lp-hero-img img { object-position:58% 30%; }
  /* The headline sits over the volunteers' white shirts here, so the scrim
     starts dark enough at the top to keep the shirt lettering out of it. */
  .lp-hero-img::after { background:linear-gradient(180deg, rgba(20,24,22,.42) 0%, rgba(20,24,22,.74) 36%, rgba(20,24,22,.9) 100%); }
  .lp-hero-copy { left:20px; right:20px; bottom:92px; }
  .lp-hero-copy h1 { font-size:40px; line-height:1; }
  .lp-hero-copy p { margin-top:12px; font-size:16px; }
  .lp-hero-search { position:relative; left:auto; right:auto; bottom:auto; margin:-72px 12px 0; }
  .lp-under { margin-top:16px; padding-left:0; justify-content:center; gap:8px 16px; font-size:13px; }
  .lp-cats { margin-top:28px; }
  .lp-cats .vu-cats { margin:0 -16px; padding:0 16px; scroll-padding:0 16px; }
  .lp-sec { margin-top:40px; }
  .lp-sec-head h2 { font-size:23px; }
  .lp-sec-head { flex-wrap:wrap; row-gap:12px; }
  .lp-grid { display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; margin:16px -16px 0; padding:0 16px; scroll-padding:0 16px; }
  .lp-grid::-webkit-scrollbar { display:none; }
  .lp-grid > * { flex:0 0 248px; scroll-snap-align:start; }
  .lp-more { margin-top:20px; }
  .lp-more .vu-btn { width:100%; }
  .lp-np { column-gap:0; }
  .lp-h1 { font-size:30px; }
  .lp-pair h3 { font-size:22px; margin-top:16px; }
  .lp-pair p { font-size:15px; margin-bottom:14px; }
  .lp-pair-ph { aspect-ratio:4/3; border-radius:16px; }
  .lp-pair-ph.is-wide { aspect-ratio:4/3; margin-top:20px; }
  .lp-band { margin-top:56px; }
  .lp-how { padding:40px 0; }
  .lp-how-p { font-size:15px; }
  .lp-rows { margin-top:32px; }
  .lp-rows.is-only { margin-top:16px; }
  .lp-row-end { display:none; }
  .lp-faq { margin-top:56px; }
  .lp-q { font-size:16px; padding:18px 0; }
  .lp-cta { margin-top:56px; padding-top:40px; }
  .lp-cta p { font-size:15px; }
  .lp-cta-btns { width:100%; justify-content:center; }
  .lp-cta-btns > .vu-btn:first-child { width:100%; justify-content:center; }
}
`;

/* ---- helpers --------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* "Sat, Oct 24" -> Date (year nearest today), or null. */
function shiftDate(label) {
  const m = /([A-Z][a-z]{2})\s+(\d{1,2})/.exec(String(label || ''));
  const mo = m ? MONTHS.indexOf(m[1]) : -1;
  if (mo < 0) return null;
  const day = Number(m[2]);
  return new Date(inferYear(mo, day), mo, day);
}

/* When a shift starts: its start time, or the start of its day when the
   label has no readable time. Same reading as Discover's shiftStart. */
function shiftStartAt(sh, now) {
  const dts = shiftDates(sh, undefined, now);
  return dts ? dts.start : shiftDate(sh.d);
}

/* Does a start time fall inside the "When" window the visitor picked? The
   window is Discover's whenWindow, so "This week" means the same thing on
   Landing, Discover and Home: from today 00:00 until 7 x 24 hours from now. */
function inWindow(at, when, now = new Date()) {
  if (!at) return false;
  const win = when ? whenWindow(when, now) : null;
  return !win || (at >= win[0] && at < win[1]);
}

/* The listing's soonest upcoming shift inside the window, or null. */
function nextShift(listing, when, now = new Date()) {
  const rows = listingShifts(listing, now)
    .map((sh) => ({ sh, day: shiftStartAt(sh, now) }))
    .filter((x) => x.day && inWindow(x.day, when, now))
    .sort((a, b) => a.day - b.day);
  return rows[0] || null;
}

/* Upcoming listings first (soonest shift), then the rest newest first. */
function arrange(rows, when) {
  const now = new Date();
  const dated = [];
  const undated = [];
  for (const l of rows || []) {
    const n = nextShift(l, when, now);
    if (n) dated.push({ ...l, _next: n });
    else if (!when) undated.push(l);
  }
  dated.sort((a, b) => a._next.day - b._next.day);
  return dated.concat(undated);
}

/* Indianapolis listings first, then the rest of central Indiana, then everything
   else, keeping the date order inside each group. */
function localRank(l) {
  const where = `${l.site || ''} ${l.location || ''}`;
  if (HOME_RE.test(where)) return 0;
  return NEARBY_RE.test(where) ? 1 : 2;
}
function localFirst(rows) {
  return rows.map((l, i) => ({ l, i, r: localRank(l) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.l);
}

/* ProPublica returns names in capitals. */
function titleCase(str) {
  return String(str || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function cardProps(l, photo) {
  const student = l.org_class === 'student' || Boolean(l.is_student_led);
  const place = String(l.site || l.location || '').trim();
  const first = place.split(',')[0].trim();
  const org = /remote|online|virtual/i.test(first) ? place : first;
  const more = l._next ? listingShifts(l).length - 1 : 0;
  return {
    href: `/join/${l.id}`,
    title: l.name,
    org: student ? undefined : org || undefined,
    verified: !student && Boolean(l.verified),
    byline: student ? org || undefined : undefined,
    studentProject: student,
    // Undated listings pass '' so the tile reads "No dates yet".
    when: l._next ? shiftLabel(l._next.sh) : '',
    moreDates: more > 0 ? more : 0,
    online: l.delivery === 'remote',
    photo,
    cause: l.cause,
  };
}

const whenText = (v) => ((WHEN_OPTIONS.find((o) => o.v === v) || {}).l || '').toLowerCase();

function describe({ q, near, when, cat }) {
  const c = CATEGORIES.find((x) => x.key === cat);
  let what = q ? `“${q}”` : c && c.key !== 'near' ? `${c.label} opportunities` : 'Opportunities';
  if (near) what += ` near ${near}`;
  if (when) what += ` ${whenText(when)}`;
  return what;
}

/* "Nothing for “library” near Zzyzx", "Nothing this weekend". */
function noneTitle({ q, near, when, cat }) {
  const c = CATEGORIES.find((x) => x.key === cat);
  const what = q ? `“${q}”` : c && c.key !== 'near' ? c.label.toLowerCase() : '';
  return ['Nothing', what ? `for ${what}` : '', near ? `near ${near}` : '', when ? whenText(when) : ''].filter(Boolean).join(' ');
}

/* Next shift between today and 7 days from now. Undated listings can't be
   "open this week". */
function inWeek(l) {
  return Boolean(l._next && inWindow(l._next.day, 'week'));
}

/* ---- data ------------------------------------------------------------------ */

function listingFilters({ q, near, cat }) {
  const c = CATEGORIES.find((x) => x.key === cat);
  return { q, near, causes: c && c.cause ? [c.cause] : [], place: cat === 'online' ? 'online' : 'all' };
}

/* One page of ProPublica results for Indianapolis. */
async function homePage(page) {
  const res = await fetch(`/api/nonprofits?city=${HOME_CITY}&state=IN&page=${page}`);
  if (!res.ok) throw new Error(`nonprofits ${res.status}`);
  const data = await res.json();
  return { rows: Array.isArray(data && data.organizations) ? data.organizations : [], total: Number(data && data.total) || 0, capped: Boolean(data && data.capped) };
}

/* Indianapolis nonprofits, one per cause in turn so the list mixes causes. */
async function loadHomeOrgs(max) {
  const pages = await Promise.all(HOME_PAGES.map(homePage));
  const seen = new Set();
  const rows = pages.flatMap((p) => p.rows).filter((o) => {
    if (!o || seen.has(o.ein)) return false;
    seen.add(o.ein);
    return String(o.city || '').toLowerCase() === HOME_CITY.toLowerCase() && isVolunteerPlace(o);
  });
  const byCause = new Map();
  for (const o of rows) {
    const k = CAUSE_ORDER.includes(o.cause) ? o.cause : 'Nonprofit';
    byCause.set(k, [...(byCause.get(k) || []), o]);
  }
  const queues = CAUSE_ORDER.map((k) => byCause.get(k) || []).filter((l) => l.length);
  const out = [];
  for (let i = 0; out.length < max && queues.some((l) => l[i]); i++) {
    for (const l of queues) if (l[i] && out.length < max) out.push(l[i]);
  }
  // The town's true total from ProPublica, for "See all".
  return Object.assign(out, { total: pages[0] ? pages[0].total : 0, capped: Boolean(pages[0] && pages[0].capped) });
}

async function loadOrgs({ q, near, cat }, homeRegion) {
  const c = CATEGORIES.find((x) => x.key === cat);
  const place = near || homeRegion || '';
  if (!q && !near && !(c && c.cause) && homeRegion === HOME_AREA) return loadHomeOrgs(MAX_ORGS);
  if (q || (c && c.cause)) {
    const rows = await searchWebNonprofits({ q, near: place, causes: c && c.cause ? [c.cause] : [], throwOnError: true });
    return rows.slice(0, MAX_ORGS);
  }
  const lists = await Promise.all(DEFAULT_ORG_QUERIES.map((term) => searchWebNonprofits({ q: term, near: place, throwOnError: true })));
  const seen = new Set();
  const out = [];
  for (let i = 0; out.length < MAX_ORGS && i < 4; i++) {
    for (const list of lists) {
      const o = list[i];
      if (o && !seen.has(o.ein) && out.length < MAX_ORGS) {
        seen.add(o.ein);
        out.push(o);
      }
    }
  }
  return out;
}

/* ---- sections -------------------------------------------------------------- */

function SkeletonCards() {
  return (
    <div className="lp-grid" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div className="lp-skel-ph" />
          <div className="lp-skel-bar" style={{ width: '70%' }} />
          <div className="lp-skel-bar" style={{ width: '45%', marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

function Notice({ title, body, action }) {
  return (
    <div style={S(`margin-top:22px;padding:28px 0;box-shadow:inset 0 1px 0 ${C.line}, inset 0 -1px 0 ${C.line}`)}>
      <div style={S(`font:600 20px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>{title}</div>
      {body ? <p style={S(`margin:6px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>{body}</p> : null}
      {action ? <div style={S('margin-top:16px')}>{action}</div> : null}
    </div>
  );
}

/* What the results section shows, computed once in Landing so the page art
   below can avoid the photos the listings use. */
function useResultsView({ state, query, later, local }) {
  const searched = Boolean(query.q || query.near || query.when || query.cat !== 'near');
  const home = local && !searched;
  const all = state.items;
  const ranked = useMemo(() => (home ? localFirst(all || []) : all || []), [home, all]);
  // With no search, the grid shows what's open this week; "Show later dates"
  // opens it up to every listing.
  const week = !searched && !later;
  const pool = useMemo(() => (week ? ranked.filter(inWeek) : ranked), [week, ranked]);
  const laterCount = week ? ranked.length - pool.length : 0;
  // Only a listing's own cover, never a stock photo, so each card matches
  // its /join page and Discover. Without one the card shows a DateTile.
  const photos = useMemo(() => pickPhotos(pool, { seed: false, used: [HERO_PHOTO] }), [pool]);
  const split = useMemo(() => gridAndRows(pool, photos), [pool, photos]);
  const taken = useMemo(() => [...photos.values()].filter(Boolean).map((p) => p.key), [photos]);
  return { searched, home, week, pool, photos, laterCount, grid: split.grid, rows: split.rows, taken };
}

/* A listing as a row: date, title, then time and who runs it. Listings with
   their own photo that didn't fit in the grid lead with a thumbnail. */
function ListingRow({ l, photo }) {
  const c = cardProps(l, photo);
  const when = whenParts({ when: c.when, moreDates: c.moreDates, hasPhoto: Boolean(photo), online: c.online }).map((x) => x.text);
  const who = c.studentProject ? ['Student project', c.byline].filter(Boolean).join(' · ') : c.org || '';
  const meta = [...when, who].filter(Boolean);
  const dated = Boolean(l._next);
  const lead = photo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img className="vu-row-thumb" src={photo.sm || photo.src} alt="" loading="lazy" decoding="async" style={photo.pos ? { objectPosition: photo.pos } : undefined} />
  ) : dated ? (
    <DateBlock date={l._next.sh.d} size="md" />
  ) : null;
  return (
    <li>
      <Link href={c.href} className={lead ? 'vu-row' : 'vu-row vu-row--nolead'}>
        {lead}
        <span style={S('min-width:0')}>
          <span className="vu-row-t">{c.title}</span>
          {meta.length ? (
            <span className="vu-row-m">
              {meta.map((m, i) => (
                <span key={i}>
                  {i ? <Sep /> : null}
                  {m}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="vu-row-end lp-row-end" aria-hidden="true">
          <Icon name="chevron-right" size={18} color={C.ink3} />
        </span>
      </Link>
    </li>
  );
}

function Opportunities({ state, view, query, onRetry, onWiden, onAnyDay, onClear, shown, onMore, onLater, onNonprofits, discoverHref, authed, sectionRef }) {
  const { searched, home, week, pool, photos, laterCount, grid, rows } = view;
  const visibleRows = useMemo(() => rows.slice(0, shown), [rows, shown]);
  const nearHome = home && pool.some((l) => localRank(l) < 2);
  const title = searched
    ? describe(query)
    : week
      ? (nearHome || (home && !pool.length) ? 'Open this week around Indianapolis' : 'Open this week')
      : nearHome ? 'Open around Indianapolis' : 'Open on VolunteerU';
  const rowsTitle = searched ? 'More results' : week ? 'More this week' : 'More opportunities';
  let body;
  if (state.status === 'loading') body = <SkeletonCards />;
  else if (state.status === 'error') {
    body = <Notice title="Couldn’t load opportunities" body="Check your connection and try again." action={<Button variant="outline" icon="refresh" onClick={onRetry}>Try again</Button>} />;
  } else if (!pool.length) {
    body = searched ? (
      <Notice
        title={noneTitle(query)}
        body={query.when ? 'No shifts are scheduled then yet. Try any day.' : query.near ? 'Try another word, or search every state.' : 'Try a broader word, like “food bank” or “library”.'}
        action={
          query.when ? <Button variant="outline" onClick={onAnyDay}>Show any day</Button>
            : query.near ? <Button variant="outline" onClick={onWiden}>Search all states</Button>
              : <Button variant="outline" onClick={onClear}>Clear search</Button>
        }
      />
    ) : (
      <Notice
        title={home ? 'Nothing posted near Indianapolis this week' : 'Nothing posted this week'}
        body={laterCount ? `${laterCount} ${laterCount === 1 ? 'opportunity has' : 'opportunities have'} later dates. The nonprofits below take volunteers too.` : 'Organizations and student projects show up here once they post. The nonprofits below take volunteers too.'}
        action={
          <div style={S('display:flex;gap:12px;flex-wrap:wrap')}>
            {laterCount ? <Button variant="outline" onClick={onLater}>Show later dates</Button> : null}
            <Button variant="outline" onClick={onNonprofits}>Search nonprofits</Button>
          </div>
        }
      />
    );
  } else {
    body = (
      <>
        {grid.length ? (
          <ul className="lp-grid">
            {grid.map((l, i) => (
              <li key={l.id}>
                <ListingCard {...cardProps(l, photos.get(l.id))} eager={i < GRID_COLS} />
              </li>
            ))}
          </ul>
        ) : null}
        {visibleRows.length ? (
          <div className={grid.length ? 'lp-rows' : 'lp-rows is-only'}>
            {grid.length ? <h3 className="vu-t-h3s">{rowsTitle}</h3> : null}
            <ul className="vu-list lp-list" aria-label={grid.length ? rowsTitle : title}>
              {visibleRows.map((l) => <ListingRow key={l.id} l={l} photo={photos.get(l.id)} />)}
            </ul>
          </div>
        ) : null}
      </>
    );
  }
  let more = null;
  if (state.status === 'done' && rows.length > shown) {
    more = <Button variant="outline" onClick={onMore}>Show more opportunities</Button>;
  } else if (state.status === 'done' && pool.length && laterCount) {
    more = <Button variant="outline" onClick={onLater}>Show later dates</Button>;
  }
  return (
    <section ref={sectionRef} id="lp-results" className="lp-sec" aria-labelledby="lp-results-h" aria-busy={state.status === 'loading' ? 'true' : 'false'}>
      <div className="lp-sec-head">
        <h2 id="lp-results-h" aria-live="polite">{title}</h2>
        {authed && pool.length ? <Link className="lp-link" href={discoverHref}>Open in Discover</Link> : null}
      </div>
      {body}
      {more ? <div className="lp-more">{more}</div> : null}
    </section>
  );
}

function Nonprofits({ state, rows: shownRows, query, homeRegion, authed, discoverHref }) {
  const rows = shownRows || state.rows;
  const near = query.near || homeRegion;
  const c = CATEGORIES.find((x) => x.key === query.cat);
  const what = query.q ? `Nonprofits for “${query.q}”` : c && c.cause ? `${c.label} nonprofits` : 'Registered nonprofits';
  const nationwide = near && !parseState(near);
  const home = near === HOME_AREA && !query.q && !query.near && !(c && c.cause);
  const title = home ? 'Nonprofits in Indianapolis' : near && !nationwide ? `${what} near ${near}` : what;
  const sub = home
    ? 'From IRS nonprofit records for Indianapolis. Each one opens a page with its address, map and any open shifts.'
    : nationwide
    ? `From IRS nonprofit records, all states. Add a state to “${near}” to narrow it.`
    : near
      ? 'From IRS nonprofit records. Each one opens a page with its address, map and any open shifts.'
      : 'From IRS nonprofit records. Search a city or state to see ones near you.';
  // Every Indianapolis record, on Discover's Nonprofits tab, with ProPublica's real total.
  const seeAll = home && state.status === 'done' && state.total > 0
    ? <Link className="lp-link" href={`/discover?${new URLSearchParams({ view: 'nonprofits', near: HOME_AREA }).toString()}`}>See all {state.total.toLocaleString('en-US')}{state.capped ? '+' : ''} nonprofits in Indianapolis</Link>
    : null;
  let body;
  if (state.status === 'loading') {
    body = <div aria-hidden="true" className="vu-np-grid lp-np">{Array.from({ length: 4 }).map((_, i) => <div key={i} style={S(`height:73px;box-shadow:inset 0 -1px 0 ${C.line}`)} />)}</div>;
  } else if (state.status === 'error') {
    body = <p className="lp-sub" style={S('margin-top:18px')}>Nonprofit search is down right now. Opportunities still work.</p>;
  } else if (!rows.length) {
    body = <p className="lp-sub" style={S('margin-top:18px')}>No nonprofits matched. Try a broader word, like “food bank”.</p>;
  } else {
    body = (
      <div className="vu-np-grid lp-np">
        {rows.map((o) => (
          <NonprofitRow
            key={o.ein}
            name={titleCase(o.name)}
            parts={[o.cause && o.cause !== 'Nonprofit' ? o.cause.replace('&', 'and') : '', [titleCase(o.city), o.state].filter(Boolean).join(', ')]}
            href={`/nonprofits/${o.ein}`}
          />
        ))}
      </div>
    );
  }
  return (
    <section id="lp-np" className="lp-sec" style={S('margin-top:88px')} aria-labelledby="lp-np-h" aria-busy={state.status === 'loading' ? 'true' : 'false'}>
      <div className="lp-sec-head">
        <div style={S('min-width:0')}>
          <h2 id="lp-np-h">{title}</h2>
          <p className="lp-sub">{sub}</p>
        </div>
        {seeAll || (authed && rows.length ? <Link className="lp-link" href={discoverHref}>Open in Discover</Link> : null)}
      </div>
      {body}
    </section>
  );
}

/* A page photo. Decorative: the heading next to it says what it shows. */
function ArtPhoto({ photo, wide = false }) {
  if (!photo) return null;
  return (
    <div className={wide ? 'lp-pair-ph is-wide' : 'lp-pair-ph'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} alt="" loading="lazy" decoding="async" style={{ objectPosition: photo.pos }} />
    </div>
  );
}

/* Two ways in. The second half is the page's one "Start a student project"
   button and the #student-projects anchor the header and footer link to. */
function VolunteerOrLead({ goSearch, startProject, art }) {
  return (
    <section className="lp-sec" style={S('margin-top:104px')} aria-labelledby="lp-vol-h">
      <h2 id="lp-vol-h" className="lp-h1">Volunteer or lead</h2>
      <ArtPhoto photo={art.wide} wide />
      <div className="lp-pair">
        <div>
          <ArtPhoto photo={art.shift} />
          <h3>Sign up for a shift</h3>
          <p>Search opportunities posted by organizations and other students, plus registered nonprofits nearby. Afterward, log your hours and the organizer confirms them.</p>
          <Button variant="ghost" extra="padding:0;border:0" onClick={goSearch}>Search opportunities</Button>
        </div>
        <div id="student-projects" className="lp-start">
          <ArtPhoto photo={art.lead} />
          <h3>Run a student project</h3>
          <p>Start a tutoring circle, a cleanup or a food drive with friends. You don’t need a 501(c)(3). Publish it so students nearby can apply, then take attendance at each shift and approve everyone’s hours.</p>
          <Button variant="dark" onClick={startProject}>Start a student project</Button>
        </div>
      </div>
    </section>
  );
}

const HOURS_COPY = 'Sign up for a shift, go, and log your hours afterward. The organizer confirms them in the app, so there’s no paper form to chase. From your profile you can download your hours as a CSV for your school counselor.';

/* Hours: the copy and one action on the left, and on the right the real
   hour card from the profile. Signed out it is the empty card, with a
   sentence where the number goes; signed in it is the student's own card
   with their confirmed hours. Nothing on it is made up. The anchor id stays
   #how-it-works for the header link. */
function HoursSection({ authed, account, confirmed, onSignUp }) {
  return (
    <section id="how-it-works" className="lp-band" aria-labelledby="lp-how-h">
      <div className="mk-wrap">
        <div className="lp-how">
          <div>
            <h2 id="lp-how-h" className="lp-h1">Log your hours</h2>
            <p className="lp-how-p">{HOURS_COPY}</p>
            <div className="lp-how-act">
              {authed ? (
                <Link className="lp-link" href="/profile">Open your profile</Link>
              ) : (
                <Button variant="dark" onClick={onSignUp}>Sign up to log hours</Button>
              )}
            </div>
          </div>
          <div className="lp-how-card">
            <ShareHoursCard
              bare
              name={authed ? account.name : ''}
              grade={authed ? account.grade : ''}
              school={authed ? account.school : ''}
              confirmed={authed ? confirmed : 0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  { q: 'Is it free?', a: 'Yes. Students and organizations don’t pay anything to use VolunteerU.' },
  { q: 'Where do the nonprofits come from?', a: 'IRS records, through ProPublica’s Nonprofit Explorer. Each one has a page here with its address, a map, IRS facts and any shifts posted on VolunteerU, plus a link to its filings on ProPublica.' },
  { q: 'How do my hours get confirmed?', a: 'After a shift, log your hours on that project. Once the organizer approves them, they count as confirmed. Hours you log on your own stay in a separate total.' },
  { q: 'Do I need a 501(c)(3) to start a student project?', a: 'No. Anyone 13 or older can start one. If a school, library or nonprofit supervises it, you can ask for a verified badge from your project page.' },
  { q: 'What does the verified badge mean?', a: 'Someone on the VolunteerU team reviewed the organization and its staff contact by hand. Owners can’t give themselves the badge.' },
];

/* A plain FAQ accordion. One row open at a time. */
function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="lp-faq" aria-labelledby="lp-faq-h">
      <h2 id="lp-faq-h" className="lp-h1">Questions</h2>
      <div style={S(`box-shadow:inset 0 1px 0 ${C.line}`)}>
        {FAQS.map((f, i) => {
          const on = open === i;
          const panelId = `lp-faq-${i}`;
          return (
            <div key={f.q} style={S(`box-shadow:inset 0 -1px 0 ${C.line}`)}>
              <h3 style={S('margin:0')}>
                <button type="button" className="lp-q" aria-expanded={on} aria-controls={panelId} onClick={() => setOpen(on ? -1 : i)}>
                  <span>{f.q}</span>
                  <Icon name="chevron-down" size={20} />
                </button>
              </h3>
              <div id={panelId} role="region" aria-label={f.q} hidden={!on}>
                <p className="lp-a">{f.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta({ goSearch, authed, signUp }) {
  return (
    <section className="lp-cta" aria-labelledby="lp-cta-h">
      <div style={S('min-width:0')}>
        <h2 id="lp-cta-h" className="lp-h1">Find a shift near you</h2>
        <p>Free for students 13 and up. Search works without an account.</p>
      </div>
      <div className="lp-cta-btns">
        <Button variant="primary" icon="search" onClick={goSearch}>Search opportunities</Button>
        {authed ? null : <Button variant="ghost" onClick={signUp}>Sign up free</Button>}
      </div>
    </section>
  );
}

/* ---- the page ------------------------------------------------------------- */

const EMPTY_QUERY = { q: '', near: '', when: '', cat: 'near' };

export default function Landing() {
  const router = useRouter();
  const links = useMarketingLinks();
  const { state: store } = useSnapshot();
  const homeRegion = links.authed ? String((store.prefs && store.prefs.location) || '').trim() : HOME_AREA;
  const resultsRef = useRef(null);
  const reqRef = useRef(0);

  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');
  const [when, setWhen] = useState('');
  const [hint, setHint] = useState('');
  const [query, setQuery] = useState(EMPTY_QUERY);
  const [opps, setOpps] = useState({ status: 'loading', items: [] });
  const [orgs, setOrgs] = useState({ status: 'loading', rows: [] });
  const [shown, setShown] = useState(PAGE);
  const [later, setLater] = useState(false);
  const view = useResultsView({ state: opps, query, later, local: homeRegion === HOME_AREA });
  const takenSig = view.taken.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const art = useMemo(() => pickArt(view.taken), [takenSig]);

  async function run(next, { scroll = false } = {}) {
    const id = ++reqRef.current;
    setQuery(next);
    setShown(PAGE);
    setLater(false);
    setOpps({ status: 'loading', items: [] });
    setOrgs({ status: 'loading', rows: [] });
    if (scroll) showResults();
    searchListings(listingFilters(next))
      .then((rows) => { if (id === reqRef.current) setOpps({ status: 'done', items: arrange(rows, next.when) }); })
      .catch((err) => {
        console.warn('[landing] opportunity search failed', err);
        if (id === reqRef.current) setOpps({ status: 'error', items: [] });
      });
    loadOrgs(next, homeRegion)
      .then((rows) => { if (id === reqRef.current) setOrgs({ status: 'done', rows, total: Number(rows.total) || 0, capped: Boolean(rows.capped) }); })
      .catch((err) => {
        console.warn('[landing] nonprofit search failed', err);
        if (id === reqRef.current) setOrgs({ status: 'error', rows: [] });
      });
  }

  useEffect(() => {
    run(EMPTY_QUERY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeRegion]);

  // Arriving from another page at /#student-projects or /#search: the jump
  // runs before the results and nonprofit rows above the anchor have grown,
  // so it lands too high. Keep the anchor in place while the page settles,
  // until the visitor scrolls on their own. #search also gets the cursor.
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? decodeURIComponent(window.location.hash.slice(1)) : '';
    if (!hash || typeof ResizeObserver === 'undefined') return undefined;
    let done = false;
    const stop = () => { done = true; };
    const pin = () => {
      if (done) return;
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ block: 'start' });
    };
    const ro = new ResizeObserver(pin);
    ro.observe(document.body);
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    events.forEach((ev) => window.addEventListener(ev, stop, { passive: true, once: true }));
    pin();
    if (hash === 'search') {
      const input = document.querySelector('#search input[type="search"]');
      if (input) input.focus({ preventScroll: true });
    }
    const t = setTimeout(() => { stop(); ro.disconnect(); }, 2500);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      events.forEach((ev) => window.removeEventListener(ev, stop));
    };
  }, []);

  function showResults() {
    const el = resultsRef.current;
    if (!el || typeof window === 'undefined') return;
    const top = el.getBoundingClientRect().top;
    if (top < 64 || top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  const onSearch = ({ what: q, where: near, when: w }) => {
    if (!q && !near && !w && query.cat === 'near') {
      setHint('Enter a cause, a kind of place or a city.');
      return;
    }
    setHint('');
    run({ q, near, when: w, cat: q ? 'near' : query.cat }, { scroll: true });
  };

  const onCategory = (key) => {
    setWhat('');
    setHint('');
    run({ q: '', near: where.trim(), when, cat: key }, { scroll: true });
  };

  const clearSearch = () => {
    setWhat('');
    setWhere('');
    setWhen('');
    run(EMPTY_QUERY);
  };

  /* "Search opportunities": signed in, open Discover; signed out, bring the
     hero search into view and put the cursor in it. */
  const goSearch = (e) => {
    if (links.authed) {
      router.push(links.search);
      return;
    }
    scrollToAnchor(e, '/#search');
  };
  const startProject = () => router.push(links.startProject);

  // Same search in Discover. The nonprofits link opens its Nonprofits segment.
  const discoverUrl = (extra) => {
    const p = new URLSearchParams();
    const c = CATEGORIES.find((x) => x.key === query.cat);
    if (query.q) p.set('q', query.q);
    if (c && c.cause) p.set('causes', c.cause);
    if (query.near) p.set('near', query.near);
    if (query.cat === 'online') p.set('place', 'online');
    Object.entries(extra).forEach(([k, v]) => { if (v) p.set(k, v); });
    const qs = p.toString();
    return qs ? `/discover?${qs}` : '/discover';
  };
  const discoverHref = discoverUrl({ when: query.when });

  const orgRows = orgs.rows.slice(0, MAX_ORGS);
  const showNonprofits = () => {
    const el = typeof document !== 'undefined' ? document.getElementById('lp-np') : null;
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const nonprofitsHref = discoverUrl({ view: 'nonprofits' });

  return (
    <div className="vu-screen vu-landing" style={S(`width:100%;overflow-x:clip;background:${C.white}`)}>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <MarketingHeader />

      <main id="vu-main" tabIndex={-1} style={S('outline:none')}>
        <div className="mk-wrap">
        <section id="search" className="lp-hero" aria-labelledby="lp-hero-h" style={S('scroll-margin-top:92px')}>
          <div className="lp-hero-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PHOTOS.food2.src} alt="Students in volunteer shirts sorting donated food" fetchPriority="high" />
            <div className="lp-hero-copy">
              <h1 id="lp-hero-h">Find somewhere to volunteer in Indianapolis this week</h1>
              <p>Open shifts and nonprofits across Indianapolis and the towns around it.</p>
            </div>
          </div>
          <div className="lp-hero-search">
            <SearchBar
              what={what}
              onWhat={(v) => { setWhat(v); if (hint) setHint(''); }}
              where={where}
              onWhere={(v) => { setWhere(v); if (hint) setHint(''); }}
              when={when}
              onWhen={setWhen}
              wherePlaceholder="Indianapolis, IN"
              onSubmit={onSearch}
              busy={opps.status === 'loading' && query !== EMPTY_QUERY}
              label="Search opportunities and nonprofits"
            />
          </div>
        </section>

        <div className="lp-under">
          {hint ? <span className="lp-hint" role="alert">{hint}</span> : <span>Free for students 13 and up</span>}
          <a href={links.startProject} onClick={(e) => { e.preventDefault(); startProject(); }}>Or start a student project</a>
          {query !== EMPTY_QUERY ? (
            <button type="button" onClick={clearSearch} style={S(`background:none;border:0;padding:0;cursor:pointer;font:600 14px/1.4 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px`)}>
              Clear search
            </button>
          ) : null}
        </div>

        <div className="lp-cats">
          <CategoryRow className="vu-hide-mobile" value={query.cat} onChange={onCategory} label="Browse by cause" />
          <CategoryRow className="vu-show-mobile" value={query.cat} onChange={onCategory} label="Browse by cause" short />
        </div>

        <Opportunities
          sectionRef={resultsRef}
          state={opps}
          view={view}
          query={query}
          shown={shown}
          onMore={() => setShown((n) => n + PAGE)}
          onLater={() => { setLater(true); setShown(PAGE); }}
          onNonprofits={showNonprofits}
          onRetry={() => run(query)}
          onWiden={() => { setWhere(''); run({ ...query, near: '' }); }}
          onAnyDay={() => { setWhen(''); run({ ...query, when: '' }); }}
          onClear={clearSearch}
          discoverHref={discoverHref}
          authed={links.authed}
        />

        <Nonprofits state={orgs} rows={orgRows} query={query} homeRegion={homeRegion} authed={links.authed} discoverHref={nonprofitsHref} />

        <VolunteerOrLead goSearch={goSearch} startProject={startProject} art={art} />
        </div>

        <HoursSection
          authed={links.authed}
          account={store.account || {}}
          confirmed={Number((store.stats && store.stats.verifiedHours) || 0)}
          onSignUp={() => router.push(links.signUp)}
        />

        <div className="mk-wrap">
          <Faq />
          <FinalCta goSearch={goSearch} authed={links.authed} signUp={() => router.push(links.signUp)} />
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
