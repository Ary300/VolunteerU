'use client';

/* ==========================================================================
   Create.jsx, the new student project wizard (/create)
   Photo-first system: white page, a numbered step header, roomy fields with
   no card chrome, and a live preview of the Discover listing card on the
   right. Logic (validation, autosave, publish) is unchanged from the polish
   pass; only the presentation moved to lib/tokens.js and components/vu.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx } from '../../lib/style.js';
import { C, F, R, causeOf } from '../../lib/tokens.js';
import { Pressable, Field, Select, TextArea, Checkbox, Chip, Icon, Button, RadioDot, IconButton } from '../ui.jsx';
import { ListingCard, DateBlock, DateTile, Sep } from '../vu/index.js';
import { fmtRange } from '../../lib/format.js';
import { useSnapshot, update } from '../../lib/store.js';
import { openModal, confirmDialog, toast, dismissToast, menuFromEvent } from '../../lib/overlays.js';
import { createProject, perform, verifiedHours, canCreateProject, projectBlockingCreation, getProject, parseSessionDate } from '../../lib/db.js';
import { projectTemplates } from '../../lib/seed.js';
import { PHOTOS, resolveCover, coverFits } from '../../lib/photos.js';
import {
  defaultDraft, generatedSessions, totalSlots, safetyComplete, validateFirstSession,
  CAUSE_OPTIONS, TERM_OPTIONS, REPEAT_OPTIONS, AUDIENCE_OPTIONS, MISSION_MAX,
  ORG_TYPES, TASK_KINDS, ROLE_COLORS, alignFirstShift, readWizardTime,
} from '../../lib/createDraft.js';

const DEFAULT_CAP = 9;

const STEP_SETS = {
  volunteering: [
    { label: 'Basics', desc: 'Type, cause, place' },
    { label: 'Positions', desc: 'Who you need' },
    { label: 'Schedule', desc: 'Shifts and safety' },
    { label: 'Review', desc: 'Check and publish' },
  ],
  team: [
    { label: 'Basics', desc: 'Type, cause, place' },
    { label: 'Roles', desc: 'Roles and briefings' },
    { label: 'Tasks', desc: 'Starter task board' },
    { label: 'Review', desc: 'Check and publish' },
  ],
};

const KIND_LABEL = { meeting: 'Meeting', form: 'Form', training: 'Training', check: 'Check' };

const DELIVERY_OPTS = [
  { v: 'in_person', l: 'In person', d: 'Volunteers come to a physical site.' },
  { v: 'remote', l: 'Remote', d: 'Volunteers take part online, from anywhere.' },
  { v: 'hybrid', l: 'Both', d: 'Some shifts in person, some online.' },
];

/* One line each, so the choice reads as a plain form row. */
const KIND_DESC = {
  volunteering: 'Shifts with set times, attendance and hours',
  team: 'Tasks and roles, no attendance',
};

const CLASS_OPTS = [
  { k: 'student', t: 'Student project', d: 'You and other students run it' },
  { k: 'official', t: 'Registered nonprofit', d: 'An established organization' },
];

/* Seed photos the cover picker offers, stored as their local /photos path.
   Each is offered only for causes its subject fits (lib/photos.js `suits`),
   so a tutoring project never gets the clothing-drive photos: Discover would
   drop that cover and show the cause color anyway. */
/* trail.jpg is left out: its subject faces the camera with crossed arms,
   which reads as stock (Landing.jsx drops it for the same reason). */
const COVER_KEYS = ['food', 'food2', 'civic', 'outdoor', 'seniors', 'shelter', 'lead', 'reading2', 'reading4'];

/** The cover photos that fit a cause, in picker order. */
function coversFor(cause) {
  return COVER_KEYS.map((key) => ({ key, url: PHOTOS[key].src, pos: PHOTOS[key].pos })).filter((c) => coverFits(c.url, cause));
}

/* Repeats that name a weekday: the first shift has to fall on that day, or
   every generated shift lands on the wrong one. */
const REPEAT_DAY = { 'Every Saturday': 6, 'Every other Saturday': 6, 'Every Sunday': 0 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Type scale for this screen, from lib/tokens.js values. */
const T = {
  h1: `margin:0;font:700 40px/1.05 ${F.display};letter-spacing:-0.03em;color:${C.ink}`,
  h2: `margin:0;font:650 28px/1.12 ${F.display};letter-spacing:-0.022em;color:${C.ink}`,
  h3: `margin:0;font:600 18px/1.25 ${F.display};letter-spacing:-0.012em;color:${C.ink}`,
  lead: `margin:8px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2};max-width:600px`,
  small: `font:400 13px/1.45 ${F.body};color:${C.ink2}`,
  title: `font:600 16px/1.3 ${F.body};color:${C.ink}`,
};

/* Wizard-only layout, states and breakpoints. globals.css is shared, so
   these stay scoped to cr-* class names used only on this screen. Colors
   come from the token variables in globals.css. */
const LOCAL_CSS = `
.cr-top { display:flex; align-items:flex-end; justify-content:space-between; gap:16px 24px; flex-wrap:wrap; margin-top:20px; }
.cr-draft { display:flex; align-items:center; gap:16px; font:400 14px/1.2 var(--f-body); color:var(--ink-2); }
.cr-saved { display:inline-flex; align-items:center; gap:6px; color:var(--ink-2); }
.cr-saved svg { color:var(--confirmed); }
.cr-textbtn { background:none; border:0; padding:6px 2px; font:500 14px/1.2 var(--f-body); color:var(--ink); text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; cursor:pointer; }
.cr-back { display:inline-flex; align-items:center; gap:6px; background:none; border:0; padding:6px 0; font:500 14px/1 var(--f-body); color:var(--ink-2); cursor:pointer; }
@media (hover:hover) { .cr-back:hover, .cr-textbtn:hover { color:var(--ink); } .cr-textbtn:hover { text-decoration-thickness:2px; } }

.cr-steps { margin-top:28px; display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); border-bottom:1px solid var(--line); }
.cr-step { display:flex; align-items:flex-start; gap:12px; padding:4px 16px 16px 0; margin-bottom:-1px; border-bottom:2px solid transparent; cursor:pointer; min-width:0; transition:border-color var(--vu-dur-2) ease; }
.cr-step[aria-current="step"] { border-bottom-color:var(--ink); }
.cr-step-n { width:30px; height:30px; flex:none; border-radius:50%; display:grid; place-items:center; box-shadow:inset 0 0 0 1.5px var(--line-2); font:600 14px/1 var(--f-body); font-variant-numeric:tabular-nums; color:var(--ink-2); background:#fff; transition:background var(--vu-dur-2) ease, color var(--vu-dur-2) ease; }
.cr-step.is-done .cr-step-n { box-shadow:inset 0 0 0 1.5px var(--ink); color:var(--ink); }
.cr-step[aria-current="step"] .cr-step-n { background:var(--ink); box-shadow:none; color:#fff; }
.cr-step-l { display:block; font:600 15px/1.25 var(--f-body); color:var(--ink-2); }
.cr-step-d { display:block; margin-top:3px; font:400 13px/1.35 var(--f-body); color:var(--ink-2); }
.cr-step[aria-current="step"] .cr-step-l, .cr-step.is-done .cr-step-l { color:var(--ink); }
@media (hover:hover) { .cr-step:hover .cr-step-l { color:var(--ink); } .cr-step:hover .cr-step-n { box-shadow:inset 0 0 0 1.5px var(--ink); } .cr-step[aria-current="step"]:hover .cr-step-n { box-shadow:none; } }
.cr-step:focus-visible { outline-offset:-2px; border-radius:var(--r-control); }

.cr-layout { margin-top:40px; display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:64px; align-items:start; }
.cr-form { min-width:0; max-width:680px; }
.cr-rail { position:sticky; top:24px; min-width:0; }
/* The preview is a single card, so an undated draft (every team project, or
   a volunteering draft before its first shift) keeps its "No dates yet"
   tile. globals.css drops that tile in feeds, where it would sit alone in a
   list of rows. Phones keep the feed's text-only row. */
@media (min-width:720px) {
  .cr-preview .vu-card:has(> .vu-card-ph > .vu-datetile.is-none) { display:block !important; }
  .cr-preview .vu-card:has(> .vu-card-ph > .vu-datetile.is-none) > .vu-card-ph { display:block !important; }
  .cr-preview .vu-card:has(> .vu-card-ph > .vu-datetile.is-none) .vu-datetile {
    display:block !important; width:100% !important; height:100% !important; padding:16px !important; overflow:hidden !important;
    container-type:inline-size !important; border-radius:0 !important; box-shadow:none !important;
  }
  /* The feed rule's :is() list scores about 9 classes, and its white fill is
     !important too, so the repeated class outranks it. */
  .cr-preview.cr-preview.cr-preview.cr-preview.cr-preview .vu-card:has(> .vu-card-ph > .vu-datetile.is-none) .vu-datetile {
    background:var(--cr-tile-bg) !important; color:var(--cr-tile-fg) !important;
  }
  .cr-preview .vu-card:has(> .vu-card-ph > .vu-datetile.is-none) .vu-datetile-cause { display:inline-flex !important; }
  .cr-preview .vu-card:has(> .vu-card-ph > .vu-datetile.is-none) .vu-card-body { padding-top:10px !important; }
}

.cr-sec { margin-top:44px; }
.cr-sec-head { margin-bottom:16px; }
.cr-grid2 { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:24px 20px; }
.cr-sched { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:20px 16px; align-items:start; }
.cr-stack > * + * { margin-top:24px; }

.cr-opts { border-top:1px solid var(--line); }
.cr-opt { display:flex; align-items:flex-start; gap:12px; padding:14px 0; border-bottom:1px solid var(--line); text-align:left; cursor:pointer; min-width:0; }
.cr-opt > [aria-hidden="true"]:first-child { margin-top:1px; }
.cr-opt-t { display:block; font:600 15px/1.35 var(--f-body); color:var(--ink); }
.cr-opt-d { display:block; margin-top:2px; font:400 14px/1.4 var(--f-body); color:var(--ink-2); }
.cr-opt:focus-visible { outline-offset:2px; border-radius:var(--r-control); }
@media (hover:hover) { .cr-opt[aria-checked="false"]:hover .cr-opt-t { text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; } }
.cr-seg-item:focus-visible { outline-offset:2px; }
.cr-seg-note { margin:10px 0 0; font:400 14px/1.4 var(--f-body); color:var(--ink-2); }

.cr-cover { position:relative; display:block; width:100%; max-width:300px; aspect-ratio:4 / 3; border-radius:var(--r-photo); overflow:hidden; cursor:pointer; background:var(--mist); }
.cr-cover img { width:100%; height:100%; object-fit:cover; display:block; }
.cr-cover-tag { position:absolute; right:12px; bottom:12px; display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 12px; border-radius:var(--r-pill); background:rgba(255,255,255,.94); box-shadow:0 0 0 1px rgba(30,36,33,.06); font:600 13px/1 var(--f-body); color:var(--ink); }
.cr-cover-help { margin:10px 0 0; max-width:300px; font:400 13px/1.45 var(--f-body); color:var(--ink-2); }
.cr-cover:focus-visible { outline-offset:3px; border-radius:var(--r-photo); }
.cr-picks { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; }
.cr-pick { position:relative; display:block; aspect-ratio:4 / 3; border-radius:var(--r-control); overflow:hidden; cursor:pointer; background:var(--mist); }
.cr-pick img { width:100%; height:100%; object-fit:cover; display:block; }
.cr-pick[aria-pressed="true"] { box-shadow:0 0 0 2px #fff, 0 0 0 4px var(--ink); }
.cr-pick-on { position:absolute; right:8px; top:8px; width:26px; height:26px; border-radius:50%; display:grid; place-items:center; background:var(--ink); color:#fff; }
.cr-pick:focus-visible { outline-offset:4px; }

.cr-rows { border-top:1px solid var(--line); }
.cr-row { display:flex; align-items:center; gap:16px; padding:16px 0; border-bottom:1px solid var(--line); min-width:0; }
.cr-row-main { flex:1; min-width:0; }
.cr-shift { display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid var(--line); }
.cr-shift-t { flex:1; min-width:0; font:500 15px/1.35 var(--f-body); color:var(--ink); }
.cr-shift-n { font:400 14px/1 var(--f-body); font-variant-numeric:tabular-nums; color:var(--ink-2); white-space:nowrap; }
.cr-groups { border-top:1px solid var(--line); }
.cr-group { padding:20px 0; border-bottom:1px solid var(--line); }
.cr-list > * + * { margin-top:12px; }
.cr-num { width:28px; height:28px; flex:none; border-radius:50%; display:grid; place-items:center; background:#fff; box-shadow:inset 0 0 0 1.5px var(--line-2); font:600 13px/1 var(--f-body); font-variant-numeric:tabular-nums; color:var(--ink-2); }
.cr-pipe-meta { margin-top:12px; display:grid; grid-template-columns:180px minmax(0,1fr); gap:12px; align-items:center; }
.cr-pipe-links { margin-top:12px; display:grid; grid-template-columns:minmax(0,1fr) 190px; gap:12px; align-items:start; }
.cr-req { display:flex; align-items:center; gap:10px; cursor:pointer; font:400 14px/1.3 var(--f-body); color:var(--ink); }
.cr-req input { width:18px; height:18px; accent-color:var(--ink); cursor:pointer; flex:none; margin:0; }
.cr-task { display:grid; grid-template-columns:minmax(0,1fr) 200px 36px; gap:12px; align-items:center; padding:14px 0; border-bottom:1px solid var(--line); }
.cr-swatch { width:28px; height:28px; border-radius:50%; cursor:pointer; box-shadow:inset 0 0 0 1px rgba(30,36,33,.12); }
.cr-swatch[aria-pressed="true"] { box-shadow:0 0 0 2px #fff, 0 0 0 4px var(--ink); }
.cr-swatch:focus-visible { border-radius:50%; outline-offset:4px; }
.cr-empty { margin:0; max-width:520px; font:400 15px/1.5 var(--f-body); color:var(--ink-2); }

.cr-review { margin:0; border-top:1px solid var(--line); }
.cr-review > div { display:grid; grid-template-columns:200px minmax(0,1fr); gap:16px; padding:14px 0; border-bottom:1px solid var(--line); }
.cr-review dt { font:400 14px/1.4 var(--f-body); color:var(--ink-2); }
.cr-review dd { margin:0; font:500 15px/1.4 var(--f-body); color:var(--ink); overflow-wrap:anywhere; }

.cr-review + .cr-actions { border-top:0; padding-top:0; margin-top:32px; }
.cr-keep2 { grid-template-columns:repeat(2, minmax(0,1fr)) !important; }
.cr-actions { margin-top:44px; padding-top:24px; border-top:1px solid var(--line); display:flex; align-items:center; gap:12px; flex-wrap:wrap; }

@media (max-width:1179px) {
  .cr-layout { grid-template-columns:minmax(0,1fr); gap:0; margin-top:32px; }
  .cr-form { max-width:none; }
  .cr-rail { display:none; position:static; }
  .cr-rail.is-review { display:block; order:-1; margin-bottom:32px; max-width:420px; }
}
@media (max-width:720px) {
  .cr-top { margin-top:12px; }
  .cr-h1 { font-size:32px !important; }
  .cr-steps { margin-top:20px; }
  .cr-step { flex-direction:column; align-items:center; text-align:center; gap:8px; padding:4px 2px 12px; }
  .cr-step-l { font-size:13px; }
  .cr-step-d { display:none; }
  .cr-layout { margin-top:28px; }
  .cr-grid2 { grid-template-columns:minmax(0,1fr); gap:20px; }
  .cr-sched { gap:20px 12px; }
  .cr-sched-wide { grid-column:1 / -1; }
  .cr-picks { grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
  .cr-pipe-meta, .cr-pipe-links { grid-template-columns:minmax(0,1fr); }
  .cr-task { grid-template-columns:minmax(0,1fr) 36px; }
  .cr-task > .cr-task-role { grid-column:1 / -1; grid-row:2; }
  .cr-review > div { grid-template-columns:minmax(0,1fr); gap:4px; }
  .cr-actions { flex-direction:column; align-items:stretch; }
  .cr-actions > .vu-btn { width:100%; }
  .cr-cover { max-width:none; }
}
`;

/** The draft's time ("10:00 to 12:00", or an older "6:00 PM to 8:00 PM") as
    minutes since midnight for both ends, or null. Same reader as the shifts. */
function parseTimeRange(v) {
  return readWizardTime(v);
}

const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;

/** The draft's time as the Starts and Ends inputs' "HH:MM" values. A half
    entered range ("10:00 to ") keeps the half that's there. */
function timeInputs(v) {
  const r = parseTimeRange(v);
  if (r) return { start: hhmm(r.start), end: hhmm(r.end) };
  const [a = '', b = ''] = String(v || '').split(/\s*\bto\b\s*/);
  const one = (x) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(x.trim());
    return m ? `${pad2(m[1])}:${m[2]}` : '';
  };
  return { start: one(a), end: one(b) };
}

function timeError(v) {
  const r = parseTimeRange(v);
  if (!r) return 'Enter a start and end time.';
  if (r.end <= r.start) return 'The end time has to be after the start time.';
  return null;
}

/** Past dates (including today once the shift's start time has passed) and
    weekday mismatches, in the wizard's words. */
function firstShiftError(d) {
  const base = validateFirstSession(d.firstSession, { time: d.time });
  if (base) return base;
  const want = REPEAT_DAY[d.repeats];
  if (want === undefined) return null;
  const date = parseSessionDate(normalizeLabel(d.firstSession));
  if (date.getDay() !== want) {
    return `${normalizeLabel(d.firstSession)} is a ${DAY_NAMES[date.getDay()]}. Choose a ${DAY_NAMES[want]} or change Repeats.`;
  }
  return null;
}

function normalizeLabel(v) {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(String(v || ''));
  if (!m) return String(v || '').trim();
  return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${Number(m[2])}`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A generated shift time in the house format: "9:30 to 11:45 AM", never a dash. */
function rangeText(t) {
  const raw = String(t || '');
  const clock = raw.replace(/\bnoon\b/i, '12 PM').replace(/\bmidnight\b/i, '12 AM');
  return fmtRange(clock) || raw.replace(/\s*[–—-]\s*/g, ' to ');
}

/** The draft's shifts once the date and time read cleanly, else []. Teams have none. */
function draftShifts(d, isTeam) {
  if (isTeam || firstShiftError(d) || timeError(d.time)) return [];
  return generatedSessions(d);
}

/** The place a Discover card names, as DiscoverListings' placeName does:
    "Carmel Clay Public Library" from "Carmel Clay Public Library, 55 4th Ave SE, Carmel". */
function placeName(site) {
  const parts = String(site || '').split(',').map((x) => x.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[0] : parts.join(', ');
}

/** Labeled pipeline steps only; a blank row never reaches the listing. */
const labeledSteps = (pipeline) => (pipeline || []).filter((st) => st.label && st.label.trim());

/* The step lives in the draft and is mirrored in the URL (?step=2), one
   history entry per step, so the browser Back button and the Android back
   gesture go to the previous step instead of leaving the wizard. Step 1 is
   the bare /create. */
function readUrlStep() {
  try {
    const v = Number(new URLSearchParams(window.location.search).get('step'));
    return Number.isInteger(v) && v >= 1 && v <= 4 ? v : 1;
  } catch {
    return 1;
  }
}

function writeUrlStep(n, mode) {
  try {
    const url = new URL(window.location.href);
    if (n > 1) url.searchParams.set('step', String(n));
    else url.searchParams.delete('step');
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    // null state: Next.js (14.1+) adds its own router state to native calls.
    if (mode === 'push') window.history.pushState(null, '', href);
    else window.history.replaceState(null, '', href);
  } catch {
    /* History unavailable: the step still lives in the draft. */
  }
}

export default function Create() {
  const router = useRouter();
  const { state } = useSnapshot();
  const [draft, setDraft] = useState(() => state.drafts.create || defaultDraft());
  const [errors, setErrors] = useState({});
  const [publishing, setPublishing] = useState(false);
  const hasProject = (state.projects || []).length > 0;
  // Set once publish succeeds, so the new project (which has no attendance
  // yet) doesn't flash the "finish your current project" gate before redirect.
  const published = useRef(false);

  // Autosave on every edit. Drafts sync with the rest of the user's state.
  useEffect(() => {
    if (published.current) return;
    update(
      (st) => {
        st.drafts.create = draft;
      },
      { silent: true }
    );
  }, [draft]);

  const step = Math.min(4, Math.max(1, draft.step || 1));
  const isTeam = draft.orgType === 'team';
  const isOfficial = (draft.orgClass || 'student') === 'official';
  const STEPS = STEP_SETS[isTeam ? 'team' : 'volunteering'];
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    // A "fix this step" warning goes away once the edit leaves nothing on
    // the step to fix. Step moves are not field edits and skip the check.
    if (warnToast.current && !('step' in patch) && !Object.keys(stepErrors(step, { ...draft, ...patch })).length) {
      clearWarn();
      setErrors({});
      return;
    }
    // Editing a field clears its old error; the next Continue re-checks it.
    setErrors((e) => {
      // The first-shift check reads the time too (today is refused once the
      // start has passed), so a time edit re-opens that error as well.
      const touched = 'time' in patch ? [...Object.keys(patch), 'firstSession'] : Object.keys(patch);
      const keys = touched.filter((k) => e[k]);
      if (!keys.length) return e;
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  };
  const hasHours = verifiedHours() > 0;

  // Gate: a new project can start once every live project you run has posted
  // attendance for at least 1 shift (lib/db.js canCreateProject).
  const blocked = !published.current && !canCreateProject();

  /** Move to step n and record it in the URL: 'push' adds a history entry,
      'replace' rewrites the current one. */
  function goTo(n, mode = 'push') {
    set({ step: n });
    writeUrlStep(n, mode);
  }

  // On open, line the URL up with the draft. A URL step earlier than the
  // draft's (Back, then reload) wins; a later one can't skip validation.
  useEffect(() => {
    if (blocked) return;
    const u = readUrlStep();
    const target = u < step ? u : step;
    if (target !== step) set({ step: target });
    writeUrlStep(target, 'replace');
    // Runs once on open; later moves go through goTo and popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // Back and Forward. The handler is refreshed every render so it sees the
  // current draft when it validates a forward move.
  // The last "fix this step" warning, cleared once the wizard moves on so
  // it doesn't linger over a step that passed.
  const warnToast = useRef(null);
  function warn(title) {
    warnToast.current = toast({ title, tone: 'warn' });
  }
  function clearWarn() {
    if (warnToast.current) dismissToast(warnToast.current);
    warnToast.current = null;
  }

  const onHistory = useRef(null);
  onHistory.current = () => {
    if (blocked || published.current) return;
    goStep(readUrlStep(), 'replace');
  };
  useEffect(() => {
    const h = () => onHistory.current && onHistory.current();
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  if (blocked) return <BlockedScreen project={projectBlockingCreation()} router={router} />;

  /** The errors step n has for a draft. Pure, so a field edit can re-check
      the patched draft before React re-renders. */
  function stepErrors(n, d) {
    const e = {};
    const team = d.orgType === 'team';
    if (n === 1) {
      if (!d.name.trim()) e.name = 'Enter a project name.';
      if (d.delivery !== 'remote' && !d.site.trim()) e.site = 'Enter where it happens.';
      if (!d.mission.trim()) e.mission = 'Enter a sentence on what happens and who it helps.';
      else if (d.mission.length > MISSION_MAX) e.mission = `Shorten it to ${MISSION_MAX} characters.`;
      if (d.website.trim() && !/^https?:\/\/[^\s]+\.[^\s]+/.test(d.website.trim())) e.website = 'Enter a full link starting with https://';
      // Light check: a lead should have done some volunteering first. Waived
      // when they already have confirmed hours on VolunteerU.
      if (!hasHours && d.founderExperience.trim().length < 12) {
        e.founderExperience = "Enter a sentence about volunteering you've done.";
      }
    }
    if (n === 2) {
      if (team) {
        if (!d.teamRoles.some((r) => r.name && r.name.trim())) e.teamRoles = 'Add at least 1 role with a name.';
      } else if (!d.positions.length) {
        e.positions = 'Add at least 1 position.';
      }
    }
    if (n === 3 && !team) {
      const fe = firstShiftError(d);
      if (fe) e.firstSession = fe;
      const te = timeError(d.time);
      if (te) e.time = te;
      if (!safetyComplete(d)) e.safety = 'Check all 3 boxes before you publish.';
      // A meeting or form step is only doable with its link. Blank-name rows
      // never publish, so they don't count.
      const noLink = labeledSteps(d.pipeline).filter(stepNeedsLink).length;
      if (noLink) e.pipeline = `${noLink === 1 ? '1 step is' : `${noLink} steps are`} missing a link. Paste it in, or remove the step.`;
    }
    return e;
  }

  function validate(n) {
    const e = stepErrors(n, draft);
    setErrors(e);
    return !Object.keys(e).length;
  }

  function next() {
    if (!validate(step)) {
      warn('Check the highlighted fields');
      return;
    }
    clearWarn();
    setErrors({});
    goTo(step + 1);
    window.scrollTo(0, 0);
  }

  /* mode 'replace' comes from Back/Forward: the URL already names the
     target, so a refused move rewrites it to the step the wizard stays on. */
  function goStep(n, mode = 'push') {
    if (n === step) return;
    if (n > step) {
      // Every step before the target has to pass, not only the current one.
      // Review is the exception: it only needs the current step, since it
      // flags anything unfinished and Publish checks every step again.
      const last = n === 4 ? step + 1 : n;
      for (let k = step; k < last; k += 1) {
        if (!validate(k)) {
          if (k !== step || mode === 'replace') goTo(k, mode);
          warn(`Finish step ${k} first`);
          return;
        }
      }
    }
    clearWarn();
    setErrors({});
    goTo(n, mode);
    window.scrollTo(0, 0);
  }

  async function publish() {
    if (publishing) return;
    for (const n of [1, 2, 3]) {
      if (!validate(n)) {
        if (n !== step) goTo(n);
        warn(`Fix step ${n} first`);
        window.scrollTo(0, 0);
        return;
      }
    }
    setPublishing(true);
    try {
      const cap = totalSlots(draft) || DEFAULT_CAP;
      const pipeline = labeledSteps(draft.pipeline);
      // A cover that doesn't fit the cause (an older draft) would never show.
      const cover = resolveCover(draft.cover, draft.cause) ? draft.cover : '';
      const payload = isTeam
        ? { ...draft, cover, pipeline, positions: [], sessions: [] }
        : { ...draft, cover, pipeline, crewTarget: cap, sessions: generatedSessions(draft) };
      published.current = true;
      const project = await perform('create.publish', () => createProject(payload));
      const live = getProject(project.id);
      const onDiscover = !!(live && live.listingId);
      toast({
        title: 'Project published',
        message: onDiscover
          ? `${project.name} is on Discover now. Share the join link too.`
          : `${project.name} is saved. It isn't on Discover yet.`,
        tone: onDiscover ? 'ok' : 'warn',
      });
      router.replace(`/lead/${project.id}/overview`);
    } catch (err) {
      published.current = false;
      if (err && err.code === 'OFFLINE') toast({ title: "You're offline", message: 'Your draft is saved. Publish when you reconnect.', tone: 'danger' });
      else if (!err || err.code !== 'DUPLICATE') toast({ title: "Couldn't publish", message: 'Your draft is saved. Try again in a moment.', tone: 'danger' });
    } finally {
      setPublishing(false);
    }
  }

  async function discard() {
    const ok = await confirmDialog({
      title: 'Discard this draft?',
      body: "Everything you entered will be cleared. You can't undo this.",
      confirmLabel: 'Discard draft',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    update((st) => {
      st.drafts.create = null;
    });
    setErrors({});
    setDraft(defaultDraft());
    writeUrlStep(1, 'replace');
    toast({ title: 'Draft discarded', tone: 'ok' });
  }

  return (
    <div className="vu-screen vu-page" style={S('max-width:1180px')}>
      <style>{LOCAL_CSS}</style>
      {/* Someone with no project yet came from Home, so there's no project to go back to. */}
      <button type="button" className="cr-back" onClick={() => router.push(hasProject ? '/lead' : '/app')}>
        <Icon name="arrow-left" size={16} />
        {hasProject ? 'Back to project' : 'Back to Home'}
      </button>

      <div className="cr-top">
        <h1 className="cr-h1" style={S(T.h1)}>{isOfficial ? 'New opportunity' : 'New student project'}</h1>
        <div className="cr-draft">
          <span className="cr-saved">
            <Icon name="check" size={16} />
            Draft saved
          </span>
          <button type="button" className="cr-textbtn" onClick={discard}>
            Discard draft
          </button>
        </div>
      </div>

      <StepHeader steps={STEPS} step={step} onGo={goStep} />

      <div className="cr-layout">
        <div className="cr-form">
          {step === 1 ? <Step1 d={draft} set={set} errors={errors} onNext={next} router={router} hasHours={hasHours} /> : null}
          {step === 2 && !isTeam ? <Step2 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(1)} /> : null}
          {step === 2 && isTeam ? <Step2Team d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(1)} /> : null}
          {step === 3 && !isTeam ? <Step3 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(2)} /> : null}
          {step === 3 && isTeam ? <Step3Team d={draft} set={set} onNext={next} onBack={() => goStep(2)} /> : null}
          {step === 4 ? <Step4 d={draft} publishing={publishing} onPublish={publish} onBack={() => goStep(3)} isTeam={isTeam} /> : null}
        </div>
        <aside className={cx('cr-rail', step === 4 && 'is-review')} aria-label="Listing preview">
          <PreviewCard d={draft} account={state.account} isTeam={isTeam} />
        </aside>
      </div>
    </div>
  );
}

/* The 4 steps as a numbered row. The current step carries an ink underline
   and a filled number; finished steps keep an ink outline. */
function StepHeader({ steps, step, onGo }) {
  return (
    <nav aria-label="Steps" className="cr-steps">
      {steps.map((x, i) => {
        const n = i + 1;
        const cur = n === step;
        return (
          <Pressable
            key={x.label}
            label={`Step ${n}, ${x.label}`}
            current={cur ? 'step' : undefined}
            onClick={() => onGo(n)}
            className={cx('cr-step', n < step && 'is-done')}
          >
            <span className="cr-step-n" aria-hidden="true">
              {n < step ? <Icon name="check" size={15} stroke={2.25} /> : n}
            </span>
            <span style={S('min-width:0')}>
              <span className="cr-step-l">{x.label}</span>
              <span className="cr-step-d">{x.desc}</span>
            </span>
          </Pressable>
        );
      })}
    </nav>
  );
}

/* How the listing will look on Discover, built from the same ListingCard.
   It's a picture of the card, so it's inert: no link or tab stop. */
function PreviewCard({ d, account, isTeam }) {
  const official = (d.orgClass || 'student') === 'official';
  const slots = totalSlots(d);
  const roles = (d.teamRoles || []).filter((r) => r.name && r.name.trim());
  const starter = (d.starterTasks || []).filter((t) => t.title && t.title.trim());
  const shifts = draftShifts(d, isTeam);
  const first = shifts[0] || null;
  const lead = [account.firstName, account.lastName ? `${account.lastName[0]}.` : ''].filter(Boolean).join(' ');
  const runBy = [lead ? `Run by ${lead}` : '', account.grade ? `Grade ${account.grade}` : ''].filter(Boolean).join(', ');
  // Line A as Discover prints it: the place, after "Student project" for students.
  const place = placeName(d.site);
  // What the card leaves out, said once under it.
  const size = isTeam
    ? `${plural(roles.length, 'role')}, ${starter.length ? plural(starter.length, 'task') : 'no tasks'} on the board.`
    : slots
      ? `Each shift opens ${plural(slots, 'spot')}.`
      : '';
  // Two plain helper lines under the card, one fact each.
  // "Tessa M." already ends the sentence; don't add a second period.
  const notes = [runBy ? (runBy.endsWith('.') ? runBy : `${runBy}.`) : '', size].filter(Boolean);
  // The cause tint, for the undated tile's local CSS (globals.css paints
  // feed rows white with !important, over the tile's inline colors).
  const tint = causeOf(d.cause);
  return (
    <div>
      <h2 style={S(T.h3)}>Preview</h2>
      <p style={S(`margin:6px 0 16px;${T.small}`)}>How it shows on Discover once you publish.</p>
      <div inert className="cr-preview" style={{ '--cr-tile-bg': tint.bg, '--cr-tile-fg': tint.fg }}>
        <ListingCard
          href="/discover"
          title={d.name.trim() || 'Your project name'}
          byline={place || undefined}
          studentProject={!official}
          date={first ? first.d : null}
          time={first ? rangeText(first.t) : ''}
          moreDates={Math.max(0, shifts.length - 1)}
          online={d.delivery === 'remote'}
          photo={resolveCover(d.cover, d.cause)}
          cause={d.cause}
          headingLevel={3}
          prefetch={false}
        />
      </div>
      {notes.map((n, i) => (
        <p key={i} style={S(`margin:${i ? 2 : 14}px 0 0;${T.small}`)}>{n}</p>
      ))}
    </div>
  );
}

/* Shown instead of the wizard while another project is still waiting on its
   first posted attendance. Says which one and links straight to it. */
function BlockedScreen({ project, router }) {
  const name = project ? project.name : 'your current project';
  const team = project && project.orgType === 'team';
  const target = project ? `/lead/${project.id}/${team ? 'overview' : 'attendance'}` : '/lead';
  return (
    <div className="vu-screen vu-page" style={S('max-width:1180px')}>
      <style>{LOCAL_CSS}</style>
      <button type="button" className="cr-back" onClick={() => router.push('/lead')}>
        <Icon name="arrow-left" size={16} />
        Back to project
      </button>
      <h1 className="cr-h1" style={S(`${T.h1};margin-top:20px;max-width:760px;overflow-wrap:anywhere`)}>{`Post attendance for ${name} first`}</h1>
      <p style={S(`margin:12px 0 0;max-width:460px;font:400 16px/1.5 ${F.body};color:${C.ink2}`)}>
        Each project you run needs attendance posted for 1 shift before you start another one.
      </p>
      <div style={S('margin-top:28px')}>
        <Button variant="primary" size="lg" onClick={() => router.push(target)}>
          {`Open ${name}`}
        </Button>
      </div>
    </div>
  );
}

function StepTitle({ title, lead }) {
  return (
    <div>
      <h2 style={S(T.h2)}>{title}</h2>
      {lead ? <p style={S(T.lead)}>{lead}</p> : null}
    </div>
  );
}

function Section({ id, title, hint, children }) {
  return (
    <section className="cr-sec" aria-labelledby={id}>
      <div className="cr-sec-head">
        <h3 id={id} style={S(T.h3)}>{title}</h3>
        {hint ? <p style={S(`margin:6px 0 0;${T.small}`)}>{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Actions({ children }) {
  return <div className="cr-actions">{children}</div>;
}

function NextBtn({ label, onClick, busy, busyLabel = 'Publishing' }) {
  return (
    <Button variant="primary" size="lg" onClick={onClick} busy={busy}>
      {busy ? busyLabel : label}
    </Button>
  );
}

function BackBtn({ onClick }) {
  return (
    <Button variant="outline" size="lg" onClick={onClick}>
      Back
    </Button>
  );
}

function RemoveIconBtn({ label, onClick }) {
  return (
    <IconButton icon="x" label={label} onClick={onClick} />
  );
}

/* Arrow keys move the choice inside a radio group, as native radios do. */
function radioKeys(values, value, onPick) {
  return (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = Math.max(0, values.indexOf(value));
    const nextV = values[(i + step + values.length) % values.length];
    onPick(nextV);
    const el = e.currentTarget.querySelector(`[data-v="${nextV}"]`);
    if (el) el.focus();
  };
}

/* A radio row: dot, a 600-weight label and one line of detail, split from
   the next row by a rule. No box around it. */
function Option({ on, label, onClick, title, detail, v }) {
  return (
    <Pressable role="radio" aria-checked={on} label={label} onClick={onClick} className="cr-opt" data-v={v}>
      <RadioDot checked={on} />
      <span style={S('flex:1;min-width:0')}>
        <span className="cr-opt-t">{title}</span>
        {detail ? <span className="cr-opt-d">{detail}</span> : null}
      </span>
    </Pressable>
  );
}

/* In person / Remote / Both as a segmented pill. Radio semantics, since it
   picks a form value and switches no panel. */
function DeliveryControl({ value, onChange }) {
  const cur = DELIVERY_OPTS.find((o) => o.v === value) || DELIVERY_OPTS[0];
  return (
    <div>
      <div
        role="radiogroup"
        aria-labelledby="cr-delivery"
        className="vu-seg"
        onKeyDown={radioKeys(DELIVERY_OPTS.map((o) => o.v), value, onChange)}
        style={S(`display:inline-flex;max-width:100%;background:${C.mist};border-radius:${R.pill};padding:4px;gap:2px`)}
      >
        {DELIVERY_OPTS.map((o) => {
          const on = o.v === value;
          return (
            <Pressable
              key={o.v}
              role="radio"
              aria-checked={on}
              label={o.l}
              data-v={o.v}
              onClick={() => onChange(o.v)}
              className={cx('vu-seg-item', 'cr-seg-item', on && 'is-on')}
              style={s(
                'display:inline-flex;align-items:center;white-space:nowrap;border:none;cursor:pointer',
                `height:38px;padding:0 18px;border-radius:${R.pill};font:600 14px/1 ${F.body}`,
                on ? `background:#fff;color:${C.ink};box-shadow:inset 0 0 0 1px ${C.line2}` : `background:transparent;color:${C.ink2}`
              )}
            >
              {o.l}
            </Pressable>
          );
        })}
      </div>
      <p className="cr-seg-note">{cur.d}</p>
    </div>
  );
}

function Step1({ d, set, errors, onNext, router, hasHours }) {
  const cover = resolveCover(d.cover, d.cause);
  // Without a photo the field previews the same date tile the card shows.
  const firstShift = draftShifts(d, d.orgType === 'team')[0];
  const firstDate = firstShift ? firstShift.d : null;

  function pickCover() {
    const fits = coversFor(d.cause);
    const current = resolveCover(d.cover);
    openModal({
      title: 'Cover photo',
      subtitle: 'Shown on your listing and project page.',
      size: 'wide',
      Body: function CoverBody({ api }) {
        return (
          <div>
          {fits.length ? (
          <div className="cr-picks">
            {fits.map(({ key, url, pos }, i) => {
              const on = Boolean(current && current.key === key);
              return (
                <Pressable
                  key={key}
                  label={`Use cover photo ${i + 1}`}
                  pressed={on}
                  onClick={() => {
                    set({ cover: url });
                    api.close();
                    toast({ title: 'Cover updated', tone: 'ok', timeout: 2000 });
                  }}
                  className="cr-pick"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" decoding="async" style={{ objectPosition: pos }} />
                  {on ? (
                    <span className="cr-pick-on" aria-hidden="true">
                      <Icon name="check" size={15} stroke={2.25} />
                    </span>
                  ) : null}
                </Pressable>
              );
            })}
          </div>
          ) : (
            <p style={S(`margin:0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
              We don&apos;t have a photo that fits {d.cause || 'this cause'} yet, so your listing shows its next date.
            </p>
          )}
          {d.cover ? (
            <div style={S('margin-top:16px')}>
              <Button
                size="sm"
                onClick={() => {
                  set({ cover: '' });
                  api.close();
                  toast({ title: 'Photo removed', message: 'Your listing shows its next date instead.', tone: 'ok', timeout: 2500 });
                }}
              >
                Remove photo
              </Button>
            </div>
          ) : null}
          </div>
        );
      },
    });
  }

  return (
    <div>
      <StepTitle title="The basics" lead="What it is, who it helps and where it happens." />

      <Section id="cr-kind" title="What kind of project is this?">
        <div role="radiogroup" aria-labelledby="cr-kind" className="cr-opts" onKeyDown={radioKeys(ORG_TYPES.map((o) => o.id), d.orgType, (v) => set({ orgType: v }))}>
          {ORG_TYPES.map((o) => (
            <Option
              key={o.id}
              v={o.id}
              on={d.orgType === o.id}
              label={`${o.label}, ${KIND_DESC[o.id] || o.tagline}`}
              onClick={() => set({ orgType: o.id })}
              title={o.label}
              detail={KIND_DESC[o.id] || o.tagline}
            />
          ))}
        </div>
      </Section>

      <Section id="cr-who" title="Who runs it">
        <div role="radiogroup" aria-labelledby="cr-who" className="cr-opts" onKeyDown={radioKeys(CLASS_OPTS.map((o) => o.k), d.orgClass || 'student', (v) => set({ orgClass: v }))}>
          {CLASS_OPTS.map((o) => (
            <Option key={o.k} v={o.k} on={(d.orgClass || 'student') === o.k} label={`${o.t}, ${o.d}`} onClick={() => set({ orgClass: o.k })} title={o.t} detail={o.d} />
          ))}
        </div>
        <div style={S('margin-top:24px')}>
          <TextArea
            label="Your volunteering experience"
            value={d.founderExperience}
            onChange={(v) => set({ founderExperience: v })}
            maxLength={280}
            minHeight={88}
            error={errors.founderExperience}
            hint={hasHours ? 'Optional, since you have confirmed hours on VolunteerU.' : 'Where you volunteered and roughly how much.'}
            placeholder="e.g. 20 hours at the food bank"
          />
        </div>
      </Section>

      <Section id="cr-delivery" title="How volunteers take part">
        <DeliveryControl value={d.delivery} onChange={(v) => set({ delivery: v })} />
      </Section>

      <Section id="cr-about" title="About the project">
        <div className="cr-grid2">
          <Field label="Project name" value={d.name} onChange={(v) => set({ name: v })} placeholder="e.g. Northside Reading Circle" maxLength={60} required error={errors.name} />
          <Select label="Cause area" value={d.cause} onChange={(v) => set({ cause: v })} options={CAUSE_OPTIONS} />
          <Field
            label={d.delivery === 'remote' ? 'Where it is based (optional)' : 'Site or location'}
            value={d.site}
            onChange={(v) => set({ site: v })}
            maxLength={90}
            required={d.delivery !== 'remote'}
            placeholder={d.delivery === 'remote' ? 'e.g. Carmel' : 'e.g. Carmel Clay Public Library'}
            error={errors.site}
          />
          <Field label="Website or social link" value={d.website} onChange={(v) => set({ website: v })} placeholder="Optional" type="url" error={errors.website} />
        </div>
        <div className="cr-stack" style={S('margin-top:24px')}>
          <TextArea label="Mission" value={d.mission} onChange={(v) => set({ mission: v })} maxLength={MISSION_MAX} counter minHeight={96} error={errors.mission} placeholder="e.g. Weekly reading help for 2nd graders" />
          <TextArea label="Short bio for the project page" value={d.bio} onChange={(v) => set({ bio: v })} maxLength={400} minHeight={88} placeholder="e.g. We meet in the library's back room." />
        </div>
      </Section>

      <Section id="cr-track" title="Track record" hint="Run this before? Add rough numbers. Leave them blank if you're starting out.">
        <div className="cr-grid2">
          <Field label="Events hosted so far" value={d.eventsHosted} onChange={(v) => set({ eventsHosted: v.replace(/\D/g, '').slice(0, 5) })} placeholder="0" inputMode="numeric" />
          <Field label="Volunteers so far, roughly" value={d.approxVolunteers} onChange={(v) => set({ approxVolunteers: v.replace(/\D/g, '').slice(0, 6) })} placeholder="0" inputMode="numeric" />
        </div>
      </Section>

      <Section id="cr-photo" title="Photo and term">
        <div className="cr-grid2" style={S('align-items:start')}>
          <div>
            <div style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Cover photo</div>
            <Pressable label={cover ? 'Change the cover photo' : 'Add a cover photo'} onClick={pickCover} className="cr-cover" style={S('margin-top:8px')}>
              {cover ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cover.src} alt="" decoding="async" style={{ objectPosition: cover.pos }} />
              ) : (
                <DateTile cause={d.cause} date={firstDate} />
              )}
              <span className="cr-cover-tag" aria-hidden="true">
                <Icon name="image" size={15} />
                {cover ? 'Change' : 'Add a photo'}
              </span>
            </Pressable>
            {d.cover && !cover ? (
              <p className="cr-cover-help">
                Your photo doesn&apos;t fit {d.cause}, so Discover shows the date instead.{' '}
                {coversFor(d.cause).length ? 'Pick another photo or change the cause.' : 'Change the cause to use it.'}
              </p>
            ) : !cover ? (
              <p className="cr-cover-help">Add a cover photo so your listing shows a picture.</p>
            ) : null}
          </div>
          <div className="cr-stack">
            <Select label="Term length" value={d.term} onChange={(v) => set({ term: v })} options={TERM_OPTIONS} hint={d.orgType === 'team' ? undefined : 'Sets how many weekly shifts we schedule.'} />
            <div>
              <div style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Who can see it</div>
              <p style={S(`margin:8px 0 0;font:400 15px/1.45 ${F.body};color:${C.ink}`)}>
                Anyone on VolunteerU can find it in Discover.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Actions>
        <NextBtn label={d.orgType === 'team' ? 'Continue to roles' : 'Continue to positions'} onClick={onNext} />
        <Button
          variant="ghost"
          size="lg"
          onClick={() => {
            toast({ title: 'Draft saved', message: 'Start a project from Lead to pick it up again.', tone: 'ok' });
            router.push('/lead');
          }}
        >
          Save and exit
        </Button>
      </Actions>
    </div>
  );
}

function Step2({ d, set, errors, onNext, onBack }) {
  function editPosition(index) {
    const existing = index === null ? null : d.positions[index];
    openModal({
      title: existing ? `Edit ${existing.t}` : 'Add a position',
      Body: function PosBody({ api }) {
        return (
          <DraftPositionForm
            api={api}
            pos={existing}
            onSave={(next) => {
              if (index === null) set({ positions: [...d.positions, next] });
              else set({ positions: d.positions.map((p, i) => (i === index ? next : p)) });
            }}
            onDelete={index === null ? null : () => set({ positions: d.positions.filter((_, i) => i !== index) })}
          />
        );
      },
    });
  }

  function applyTemplate(t) {
    set({
      positions: t.positions.map((name, i) => ({ t: name, slots: i === 0 ? 8 : 1, age: '13+', train: 'None', commit: '1 hr weekly', note: '', requirements: [] })),
      cause: t.cause,
    });
    toast({ title: 'Template applied', message: `Added ${plural(t.positions.length, 'position')}. Change spots and ages to fit.`, tone: 'ok' });
  }

  function useTemplate(e) {
    menuFromEvent(
      e,
      projectTemplates.map((t) => ({ key: t.id, label: `${t.t}, ${t.m}`, icon: 'clipboard' })),
      async (key) => {
        const t = projectTemplates.find((x) => x.id === key);
        if (!t) return;
        if (d.positions.length) {
          const ok = await confirmDialog({
            title: `Replace your ${plural(d.positions.length, 'position')}?`,
            body: `The ${t.t} template swaps in its own positions and cause.`,
            confirmLabel: 'Replace positions',
            cancelLabel: 'Keep mine',
            tone: 'brand',
          });
          if (!ok) return;
        }
        applyTemplate(t);
      }
    );
  }

  return (
    <div>
      <StepTitle title="Who you need" lead="Volunteers pick one of these positions when they apply." />

      <div style={S('margin-top:32px')}>
        {d.positions.length ? (
          <div className="cr-rows">
            {d.positions.map((p, i) => (
              <div key={`${p.t}-${i}`} className="cr-row">
                <div className="cr-row-main">
                  <div style={S(`${T.title};overflow-wrap:anywhere`)}>{p.t}</div>
                  <div style={S(`margin-top:4px;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>
                    {[plural(Number(p.slots) || 0, 'spot'), `Ages ${String(p.age).replace(/\D/g, '')}+`, trainLabel(p.train), p.commit].filter(Boolean).map((t, j) => (
                      <span key={j}>
                        {j ? <Sep /> : null}
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <Button size="sm" icon="edit" aria-label={`Edit ${p.t}`} onClick={() => editPosition(i)}>
                  Edit
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="cr-empty">No positions yet. Add 1 so volunteers can apply.</p>
        )}
        {errors.positions ? <div className="vu-err">{errors.positions}</div> : null}
        <div style={S('margin-top:16px;display:flex;gap:10px;flex-wrap:wrap')}>
          <Button size="sm" icon="plus" onClick={() => editPosition(null)}>
            Add position
          </Button>
          <Button size="sm" icon="clipboard" aria-haspopup="menu" onClick={useTemplate}>
            Copy from a template
          </Button>
        </div>
      </div>

      <Section id="cr-aud" title="Who should apply" hint="Pick any that fit. Leave them all off to welcome anyone.">
        <div role="group" aria-labelledby="cr-aud" style={S('display:flex;flex-wrap:wrap;gap:8px')}>
          {AUDIENCE_OPTIONS.map((a) => (
            <Chip
              key={a}
              label={a}
              role="checkbox"
              on={d.audience.includes(a)}
              onClick={() => set({ audience: d.audience.includes(a) ? d.audience.filter((x) => x !== a) : [...d.audience, a] })}
            />
          ))}
        </div>
      </Section>

      <Actions>
        <NextBtn label="Continue to schedule" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </Actions>
    </div>
  );
}

/* Older drafts stored training as "Required · 15 min"; map that to the
   "15 min training" wording the rest of the form uses. */
function trainLabel(v) {
  const raw = String(v || 'None');
  const legacy = raw.match(/^Required\s*·\s*(\d+)\s*min$/i);
  if (legacy) return `${legacy[1]} min training`;
  if (/^none$/i.test(raw)) return 'No training';
  return raw.replace(/\s*·\s*/g, ', ');
}

const TRAIN_OPTS = ['None', '15 min training', '30 min training', '45 min training', 'Food handling'];
// Same names as the lead workspace's position form (Lead.jsx REQUIREMENTS).
const REQ = ['Guardian consent', 'Media release', 'Food handling', 'Reading training', 'Transport form'];

function DraftPositionForm({ api, pos, onSave, onDelete }) {
  const legacyTrain = pos && pos.train && !TRAIN_OPTS.includes(trainLabel(pos.train)) && trainLabel(pos.train) !== 'No training' ? trainLabel(pos.train) : null;
  const [f, setF] = useState({
    t: pos ? pos.t : '',
    slots: pos ? String(pos.slots) : '2',
    age: pos ? pos.age : '13+',
    train: pos ? (/^none$/i.test(String(pos.train || 'None')) ? 'None' : trainLabel(pos.train)) : 'None',
    commit: pos ? pos.commit : '1 hr weekly',
    note: pos ? pos.note : '',
    // Drafts saved before the rename still say "Parent's OK".
    requirements: pos ? (pos.requirements || []).map((r) => (r === "Parent's OK" ? 'Guardian consent' : r)) : [],
  });
  const [err, setErr] = useState({});
  const trainOptions = legacyTrain ? [...TRAIN_OPTS, legacyTrain] : TRAIN_OPTS;

  function save() {
    const e = {};
    if (!f.t.trim()) e.t = 'Enter a position name.';
    const n = Number(f.slots);
    if (!n || n < 1 || n > 200) e.slots = 'Enter a number from 1 to 200.';
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({ ...f, t: f.t.trim(), slots: n });
    api.close();
    toast({ title: pos ? 'Position updated' : `${f.t.trim()} added`, tone: 'ok', timeout: 2200 });
  }

  return (
    <div className="cr-stack" style={S('padding-top:4px')}>
      <Field label="Position name" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} onEnter={save} placeholder="e.g. Reading buddy" maxLength={40} required error={err.t} />
      <div className="cr-grid2 cr-keep2" style={S('gap:20px 16px')}>
        <Field label="Spots" value={f.slots} onChange={(v) => setF((x) => ({ ...x, slots: v.replace(/\D/g, '').slice(0, 3) }))} onEnter={save} inputMode="numeric" error={err.slots} />
        <Select label="Minimum age" value={f.age} options={['13+', '14+', '15+', '16+', '18+']} onChange={(v) => setF((x) => ({ ...x, age: v }))} />
        <Select label="Training" value={f.train} options={trainOptions} onChange={(v) => setF((x) => ({ ...x, train: v }))} />
        <Select label="Commitment" value={f.commit} options={['1 hr monthly', '1 hr weekly', '2 hrs weekly', '2.5 hrs weekly', '4 hrs weekly']} onChange={(v) => setF((x) => ({ ...x, commit: v }))} />
      </div>
      <Field label="What they do" value={f.note} onChange={(v) => setF((x) => ({ ...x, note: v }))} placeholder="e.g. Read 1-on-1 with a 2nd grader" maxLength={90} />
      <div>
        <div id="cr-req" style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Requirements</div>
        <div role="group" aria-labelledby="cr-req" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
          {REQ.map((r) => (
            <Chip
              key={r}
              label={r}
              role="checkbox"
              fs={13}
              py={8}
              px={14}
              on={f.requirements.includes(r)}
              onClick={() => setF((x) => ({ ...x, requirements: x.requirements.includes(r) ? x.requirements.filter((y) => y !== r) : [...x.requirements, r] }))}
            />
          ))}
        </div>
      </div>
      <div style={S('display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap')}>
        {onDelete ? (
          <Button
            variant="danger"
            onClick={() => {
              onDelete();
              api.close();
              toast({ title: 'Position removed', tone: 'ok', timeout: 2200 });
            }}
          >
            Remove position
          </Button>
        ) : (
          <span />
        )}
        <div style={S('display:flex;gap:10px')}>
          <Button onClick={() => api.close()}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {pos ? 'Save position' : 'Add position'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step3({ d, set, errors, onNext, onBack }) {
  const dateErr = errors.firstSession || firstShiftError(d);
  // Only show the live error once the value reads as a date, so typing "Oc"
  // doesn't flash an error. Submitting shows every error regardless.
  const showDateErr = errors.firstSession || (dateErr && /\b[A-Za-z]{3,}\.?\s+\d{1,2}\b/.test(d.firstSession || '') ? dateErr : null);
  const tErr = errors.time || (parseTimeRange(d.time) ? timeError(d.time) : null);
  const tv = timeInputs(d.time);
  const timeBad = !!timeError(d.time);
  const sessions = dateErr || timeBad ? [] : generatedSessions(d);
  const cap = totalSlots(d) || DEFAULT_CAP;
  const official = (d.orgClass || 'student') === 'official';
  return (
    <div>
      <StepTitle title="Schedule and safety" lead="Set when shifts happen. Each shift opens every position's spots." />

      <div className="cr-sched" style={S('margin-top:32px')}>
        <div className="cr-sched-wide">
          <Select label="Repeats" value={d.repeats} onChange={(v) => set({ repeats: v, firstSession: alignFirstShift(d.firstSession, v) })} options={REPEAT_OPTIONS} />
        </div>
        <div className="cr-sched-wide">
          <Field label="First shift" value={d.firstSession} onChange={(v) => set({ firstSession: v })} placeholder="e.g. Oct 24" error={showDateErr} />
        </div>
        <Field label="Starts" type="time" value={tv.start} onChange={(v) => set({ time: `${v} to ${tv.end}` })} error={tErr} />
        <Field label="Ends" type="time" value={tv.end} onChange={(v) => set({ time: `${tv.start} to ${v}` })} />
      </div>

      <Section id="cr-shifts" title="Your shifts" hint={sessions.length ? `${plural(sessions.length, 'shift')}, ${plural(cap, 'spot')} each` : undefined}>
        {sessions.length ? (
          <div className="cr-rows">
            {sessions.map((x, i) => (
              <div key={`${x.d}-${i}`} className="cr-shift">
                <div aria-hidden="true">
                  <DateBlock date={x.d} size="sm" month />
                </div>
                <div className="cr-shift-t">
                  <span className="vu-sr">{x.d}, </span>
                  {rangeText(x.t)}
                </div>
                <div className="cr-shift-n">{plural(cap, 'spot')}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="cr-empty">{dateErr ? 'Enter an upcoming first shift date to see your shifts.' : 'Enter a start and end time to see your shifts.'}</p>
        )}
      </Section>

      <Section id="cr-safety" title="Safety" hint="You're agreeing to these for every shift.">
        <div role="group" aria-labelledby="cr-safety" className="cr-list">
          <Checkbox
            checked={d.safety.staff}
            onChange={(v) => set({ safety: { ...d.safety, staff: v } })}
            label={official ? 'A staff supervisor from your organization is at every shift' : 'An adult from your supervising organization is at every shift'}
          />
          <Checkbox checked={d.safety.consent} onChange={(v) => set({ safety: { ...d.safety, consent: v } })} label="You'll collect a guardian consent form for anyone under 16" />
          <Checkbox checked={d.safety.pair} onChange={(v) => set({ safety: { ...d.safety, pair: v } })} label="At least 2 volunteers are on site at all times" />
        </div>
        {errors.safety ? <div className="vu-err">{errors.safety}</div> : null}
      </Section>

      <PipelineEditor
        steps={d.pipeline}
        error={errors.pipeline}
        onChange={(pipeline) => set({ pipeline })}
        title="Before their first shift"
        blurb="Steps each accepted volunteer finishes before their first shift. Remove any you don't need."
      />

      <Actions>
        <NextBtn label="Continue to review" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </Actions>
    </div>
  );
}

/* What each step kind asks the organizer to provide, so the step is actually
   actionable for the volunteer. A meeting needs a link + a time; a form needs a
   link + a due date; training an optional link + a when; a manual check needs
   nothing extra. */
const STEP_FIELDS = {
  meeting: {
    link: { label: 'Meeting link', ph: 'Zoom or Google Meet link', required: true },
    when: { label: 'When', ph: 'e.g. Tue, Oct 20 at 4 PM' },
  },
  form: {
    link: { label: 'Form link', ph: 'Google Form or sign-up link', required: true },
    due: { label: 'Due date', ph: 'e.g. Oct 25' },
  },
  training: {
    link: { label: 'Training link (optional)', ph: 'Video or doc link', required: false },
    when: { label: 'When', ph: 'e.g. Before your first shift' },
  },
  check: {},
};

/** A pipeline step is incomplete if its kind requires a link and none is set. */
export function stepNeedsLink(st) {
  const cfg = STEP_FIELDS[st.kind];
  return !!(cfg && cfg.link && cfg.link.required && !(st.link || '').trim());
}

/* Shared pipeline editor: a numbered list of steps, edited inline. Each step
   collects the details the volunteer needs to actually do it. */
function PipelineEditor({ steps, onChange, title, blurb, error }) {
  const setStep = (i, patch) => onChange(steps.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  const remove = (i) => onChange(steps.filter((_, j) => j !== i));
  const add = () => onChange([...steps, { id: `pl-user-${Date.now().toString(36)}-${steps.length}`, label: '', kind: 'check', required: true, note: '', link: '', when: '', due: '' }]);
  // A missing link shows red only after the lead leaves that link field or
  // presses Continue (which sets `error`), never on a step they haven't reached.
  const [left, setLeft] = useState(() => new Set());
  const [tried, setTried] = useState(false);
  useEffect(() => { if (error) setTried(true); }, [error]);
  const leave = (key) => setLeft((cur) => (cur.has(key) ? cur : new Set([...cur, key])));

  return (
    <Section id="cr-pipe" title={title} hint={blurb}>
      <div className={steps.length ? 'cr-groups' : undefined}>
        {steps.map((st, i) => {
          const cfg = STEP_FIELDS[st.kind] || {};
          const n = i + 1;
          const key = st.id || String(i);
          const linkMissing = stepNeedsLink(st) && (st.label || '').trim() && (tried || left.has(key));
          return (
            <div key={st.id || i} className="cr-group">
              <div style={S('display:flex;align-items:center;gap:12px')}>
                <span className="cr-num" aria-hidden="true">{n}</span>
                <div style={S('flex:1;min-width:0')}>
                  <Field label="" ariaLabel={`Step ${n} name`} value={st.label} onChange={(v) => setStep(i, { label: v })} placeholder="e.g. Join the Zoom briefing" maxLength={70} />
                </div>
                <RemoveIconBtn label={`Remove step ${n}`} onClick={() => remove(i)} />
              </div>
              <div className="cr-pipe-meta">
                <Select label="" ariaLabel={`Step ${n} type`} value={st.kind} options={TASK_KINDS.map((k) => ({ v: k, l: KIND_LABEL[k] }))} onChange={(v) => setStep(i, { kind: v })} />
                <label className="cr-req">
                  <input type="checkbox" checked={st.required !== false} onChange={(e) => setStep(i, { required: e.target.checked })} />
                  Required before their first shift
                </label>
              </div>

              {cfg.link || cfg.when || cfg.due ? (
                <div className="cr-pipe-links">
                  {cfg.link ? (
                    <div onBlur={() => leave(key)}>
                    <Field
                      label=""
                      ariaLabel={`Step ${n} ${cfg.link.label.toLowerCase()}`}
                      value={st.link || ''}
                      onChange={(v) => setStep(i, { link: v })}
                      placeholder={cfg.link.ph}
                      maxLength={300}
                      inputMode="url"
                      error={linkMissing ? 'Paste the link so volunteers can do this step.' : undefined}
                    />
                    </div>
                  ) : <span />}
                  {cfg.when ? (
                    <Field label="" ariaLabel={`Step ${n} when`} value={st.when || ''} onChange={(v) => setStep(i, { when: v })} placeholder={cfg.when.ph} maxLength={40} />
                  ) : cfg.due ? (
                    <Field label="" ariaLabel={`Step ${n} due date`} value={st.due || ''} onChange={(v) => setStep(i, { due: v })} placeholder={cfg.due.ph} maxLength={40} />
                  ) : <span />}
                </div>
              ) : null}

              <div style={S('margin-top:12px')}>
                <Field label="" ariaLabel={`Step ${n} note`} value={st.note || ''} onChange={(v) => setStep(i, { note: v })} placeholder="Note for the volunteer (optional)" maxLength={120} />
              </div>
            </div>
          );
        })}
        {!steps.length ? <p className="cr-empty">No steps. Accepted volunteers can sign up for shifts right away.</p> : null}
      </div>
      {error ? <div className="vu-err" role="alert">{error}</div> : null}
      <div style={S('margin-top:16px')}>
        <Button size="sm" icon="plus" onClick={add}>
          Add a step
        </Button>
      </div>
    </Section>
  );
}

function Step4({ d, publishing, onPublish, onBack, isTeam }) {
  const slots = totalSlots(d);
  const sessions = generatedSessions(d);
  const safe = safetyComplete(d);
  const roles = (d.teamRoles || []).filter((r) => r.name && r.name.trim());
  const starter = (d.starterTasks || []).filter((t) => t.title && t.title.trim());
  const pipe = labeledSteps(d.pipeline);
  const pipeNoLink = pipe.filter(stepNeedsLink).length;
  const noBriefing = roles.filter((r) => !(r.briefing || '').trim()).length;
  const oneTime = /one time/i.test(d.repeats);
  const place = d.delivery === 'remote' ? 'Remote' : [d.site.trim(), d.delivery === 'hybrid' ? 'and online' : ''].filter(Boolean).join(' ');
  const shiftsOk = !firstShiftError(d) && !timeError(d.time);
  // [label, value, needs attention]
  const rows = isTeam
    ? [
        ['Type', 'Project team with a task board'],
        ['Where', place || 'Not set'],
        [
          'Roles',
          !roles.length
            ? 'No named roles yet'
            : noBriefing
              ? `${plural(roles.length, 'role')}, ${noBriefing === roles.length ? (noBriefing === 1 ? 'no briefing yet' : 'none has a briefing yet') : `${noBriefing} without a briefing`}. Add one so members know what to do first.`
              : `${plural(roles.length, 'role')} with briefings`,
          !roles.length || noBriefing > 0,
        ],
        ['Starter tasks', plural(starter.length, 'task')],
        ['Who should apply', d.audience.length ? d.audience.join(', ') : 'Anyone'],
        // Only worth a row when something blocks publishing.
        ...(roles.length ? [] : [['Ready to publish', 'Add a role first', true]]),
      ]
    : [
        ['Type', 'Volunteer program with shifts'],
        ['Where', place || 'Not set'],
        ['Positions', d.positions.length ? `${plural(d.positions.length, 'position')}, ${plural(slots, 'spot')}` : 'No positions yet', !d.positions.length],
        ['Shifts', !shiftsOk ? 'Check the time and first shift' : oneTime ? `1 shift, ${sessions[0] ? sessions[0].d : ''}` : `${plural(sessions.length, 'shift')}, ${d.repeats.replace(/^Every/, 'every')}`, !shiftsOk],
        [
          'Before first shift',
          !pipe.length
            ? 'Nothing, they can start right away'
            : pipeNoLink
              ? `${plural(pipe.length, 'step')}, ${pipeNoLink} still ${pipeNoLink === 1 ? 'needs a link' : 'need links'}`
              : plural(pipe.length, 'step'),
          pipeNoLink > 0,
        ],
        ['Who should apply', d.audience.length ? d.audience.join(', ') : 'Anyone'],
        ['Safety', safe ? 'All 3 checked' : 'Needs attention', !safe],
      ];
  return (
    <div>
      <StepTitle title="Review and publish" lead="Publishing puts it on Discover so students can apply." />
      <dl className="cr-review" style={S('margin-top:32px')}>
        {rows.map(([l, v, warn]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd style={warn ? S(`color:${C.waiting}`) : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      <Actions>
        <NextBtn label="Publish project" onClick={onPublish} busy={publishing} />
        <BackBtn onClick={onBack} />
      </Actions>
    </div>
  );
}

const ROLE_COLOR_NAMES = ['Blue', 'Green', 'Red', 'Amber', 'Purple', 'Teal'];

function Step2Team({ d, set, errors, onNext, onBack }) {
  const roles = d.teamRoles || [];
  const setRole = (i, patch) => set({ teamRoles: roles.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const remove = (i) => {
    const goneId = roles[i] && roles[i].id;
    set({
      teamRoles: roles.filter((_, j) => j !== i),
      starterTasks: (d.starterTasks || []).map((t) => (t.roleId === goneId ? { ...t, roleId: '' } : t)),
    });
  };
  const add = () => set({ teamRoles: [...roles, { id: `tr-user-${roles.length}-${Date.now().toString(36)}`, name: '', briefing: '', color: ROLE_COLORS[roles.length % ROLE_COLORS.length] }] });

  return (
    <div>
      <StepTitle title="Roles and briefings" lead="Each member joins a role. The briefing is the first thing they read." />

      <div className={roles.length ? 'cr-groups' : undefined} style={S('margin-top:32px')}>
        {roles.map((r, i) => {
          const name = r.name && r.name.trim();
          return (
            <div key={r.id || i} className="cr-group">
              <div style={S('display:flex;align-items:center;gap:12px')}>
                <span aria-hidden="true" style={s('width:12px;height:12px;border-radius:50%;flex:none', `background:${r.color || ROLE_COLORS[0]}`)} />
                <div style={S('flex:1;min-width:0')}>
                  <Field label="" ariaLabel={`Role ${i + 1} name`} value={r.name} onChange={(v) => setRole(i, { name: v })} placeholder="e.g. Outreach lead" maxLength={40} />
                </div>
                <RemoveIconBtn label={name ? `Remove role ${i + 1}, ${name}` : `Remove role ${i + 1}`} onClick={() => remove(i)} />
              </div>
              <div role="group" aria-label={`Color for role ${i + 1}`} style={S('margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;padding-left:24px')}>
                {ROLE_COLORS.map((c, ci) => (
                  <Pressable
                    key={c}
                    label={`Set role color to ${ROLE_COLOR_NAMES[ci]}`}
                    pressed={r.color === c}
                    onClick={() => setRole(i, { color: c })}
                    className="cr-swatch"
                    style={S(`background:${c}`)}
                  />
                ))}
              </div>
              <div style={S('margin-top:16px')}>
                <TextArea label="Briefing" value={r.briefing} onChange={(v) => setRole(i, { briefing: v })} maxLength={600} minHeight={96} placeholder="e.g. You run our Instagram and flyers." />
              </div>
            </div>
          );
        })}
        {!roles.length ? <p className="cr-empty">No roles yet. Add 1 so members know where they fit.</p> : null}
      </div>
      {errors.teamRoles ? <div className="vu-err">{errors.teamRoles}</div> : null}

      <div style={S('margin-top:16px')}>
        <Button size="sm" icon="plus" onClick={add}>
          Add a role
        </Button>
      </div>

      <Actions>
        <NextBtn label="Continue to tasks" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </Actions>
    </div>
  );
}

function Step3Team({ d, set, onNext, onBack }) {
  const tasks = d.starterTasks || [];
  const roles = (d.teamRoles || []).filter((r) => r.name && r.name.trim());
  const roleOpts = [{ v: '', l: 'No role yet' }, ...roles.map((r) => ({ v: r.id, l: r.name }))];
  const setTask = (i, patch) => set({ starterTasks: tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const remove = (i) => set({ starterTasks: tasks.filter((_, j) => j !== i) });
  const add = () => set({ starterTasks: [...tasks, { id: `st-user-${tasks.length}-${Date.now().toString(36)}`, title: '', roleId: roles[0] ? roles[0].id : '' }] });

  return (
    <div>
      <StepTitle title="Starter tasks" lead="Add a few tasks so the board isn't empty when people join. You can give each one an owner later." />

      <div style={S('margin-top:32px')}>
        {tasks.length ? (
          <div className="cr-rows">
            {tasks.map((t, i) => (
              <div key={t.id || i} className="cr-task">
                <Field label="" ariaLabel={`Task ${i + 1}`} value={t.title} onChange={(v) => setTask(i, { title: v })} placeholder="e.g. Draft the outreach email" maxLength={80} />
                <div className="cr-task-role">
                  <Select label="" ariaLabel={`Role for task ${i + 1}`} value={t.roleId || ''} options={roleOpts} onChange={(v) => setTask(i, { roleId: v })} />
                </div>
                <RemoveIconBtn label={`Remove task ${i + 1}`} onClick={() => remove(i)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="cr-empty">No tasks yet. You can also add them after you publish.</p>
        )}
      </div>

      <div style={S('margin-top:16px')}>
        <Button size="sm" icon="plus" onClick={add}>
          Add a task
        </Button>
      </div>

      <Actions>
        <NextBtn label="Continue to review" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </Actions>
    </div>
  );
}
