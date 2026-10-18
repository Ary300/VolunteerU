/* ==========================================================================
   createDraft.js, the New Project wizard's draft shape, date checks and
   session generator
   Shared by the wizard and by onboarding, which creates a project from the
   same fields.
   ========================================================================== */

import { CAUSE } from './tokens.js';
import { parseSessionDate, addDays, formatSessionDate } from './db.js';
import { parseTimeRange } from './calendar.js';
import { fmtRange } from './format.js';

/** "Oct 24", the next Saturday after today (never today). The wizard's
    default first session, so a new project never starts in the past. */
export function nextSaturdayLabel(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ahead = ((6 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + ahead);
  return formatSessionDate(d).replace(/^[A-Za-z]{3},\s*/, '');
}

/**
 * Check the wizard's first-session date. Returns an error string or null.
 * The label has no year, so a date that already passed this year is an error
 * here. It is never moved to next year without asking.
 *
 * The second argument is either `now` (a Date, the older call shape) or
 * `{ now, time }`, where `time` is the wizard's time field ("10:00 to 12:00",
 * or with AM/PM, see readWizardTime). With a time, today is refused once that
 * start time has passed, since nobody can sign up for a shift that already
 * started.
 */
export function validateFirstSession(label, opts = {}) {
  const { now = new Date(), time = '' } = opts instanceof Date ? { now: opts } : (opts || {});
  const v = String(label || '').trim();
  if (!v) return 'Choose a date for the first shift.';
  if (!/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b/i.test(v)) return 'Enter a date like Oct 24.';
  const d = parseSessionDate(normalizeDateLabel(v), now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getTime() < today.getTime()) return 'That date has passed. Choose an upcoming date.';
  if (d.getTime() === today.getTime() && startHasPassed(time, d, now)) {
    return 'That time has already passed today. Choose a later time or another date.';
  }
  return null;
}

/* The wizard's 24-hour form, "10:00 to 12:00", with no AM/PM anywhere. */
const CLOCK24_RX = /^\s*(\d{1,2}):(\d{2})\s*(?:to|-|\u2013)\s*(\d{1,2}):(\d{2})\s*$/;

/**
 * Read the wizard's time field into minutes after midnight, { start, end }, or
 * null when it can't be read. The 24-hour form ("14:00 to 16:00") is read as
 * written. Anything else goes through calendar.parseTimeRange, so "2 PM to
 * 4 PM", "10:00 AM to 12:00 PM" and "10 AM to noon" read the same everywhere
 * the app shows a shift.
 */
export function readWizardTime(time) {
  const text = String(time || '');
  const m = CLOCK24_RX.exec(text);
  if (m) {
    const [h1, m1, h2, m2] = m.slice(1).map(Number);
    if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59 || (h2 === 24 && m2 > 0)) return null;
    return { start: h1 * 60 + m1, end: h2 * 60 + m2 };
  }
  if (!/\b(?:AM|PM|noon|midnight)\b/i.test(text)) return null;
  return parseTimeRange(text);
}

/* True when the wizard time's start on `day` is at or before `now`. An
   unreadable time is never treated as passed (the wizard reports it as a
   time error instead). */
function startHasPassed(time, day, now) {
  const r = readWizardTime(time);
  if (!r) return false;
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, r.start);
  return start.getTime() <= now.getTime();
}

/* Repeats that name a weekday, as Date.getDay() numbers. */
const REPEAT_WEEKDAY = { 'every saturday': 6, 'every other saturday': 6, 'every sunday': 0 };

/**
 * When Repeats names a weekday, move the first shift to the closest date on
 * that weekday, so "Every Sunday" from "Oct 24" (a Saturday) becomes "Oct 25"
 * instead of an error. It never moves to a date before today. Returns the
 * label unchanged when it can't be read or already falls on that day.
 */
export function alignFirstShift(label, repeats, now = new Date()) {
  const want = REPEAT_WEEKDAY[String(repeats || '').toLowerCase()];
  if (want === undefined || validateFirstSession(label, now)) return label;
  const d = parseSessionDate(normalizeDateLabel(label), now);
  const ahead = (want - d.getDay() + 7) % 7;
  if (!ahead) return label;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = addDays(d, ahead - 7);
  const pick = 7 - ahead < ahead && back.getTime() > today.getTime() ? back : addDays(d, ahead);
  return formatSessionDate(pick).replace(/^[A-Za-z]{3},\s*/, '');
}

/* "october 24" / "Oct. 24" → "Oct 24", the shape parseSessionDate reads. */
function normalizeDateLabel(v) {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(String(v || ''));
  if (!m) return v;
  return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${Number(m[2])}`;
}

export const CAUSE_OPTIONS = ['Education', 'Food & hunger', 'Environment', 'Civic', 'Animals', 'Health', 'Seniors', 'Arts', 'Homelessness', 'Disaster relief'];
export const TERM_OPTIONS = ['4 weeks', '6 weeks', '8 weeks', '12 weeks', 'Ongoing'];
export const VISIBILITY_OPTIONS = ['My school only', 'My school and nearby', 'Anyone in my state'];
export const REPEAT_OPTIONS = ['Every Saturday', 'Every Sunday', 'Every weekday', 'Every other Saturday', 'One time'];
export const AUDIENCE_OPTIONS = ['High school', 'Middle school', 'College', 'First timers welcome', 'Spanish speakers'];
export const MISSION_MAX = 240;

export const ORG_TYPES = [
  {
    id: 'volunteering',
    label: 'Volunteer program',
    tagline: 'Shifts, sign-ups and hours',
    blurb: 'Find volunteers for sessions with set times. You take attendance, confirm hours, and set the steps new volunteers finish before their first shift.',
    iconName: 'clock',
    examples: 'Tutoring, food banks, trail clean-ups, senior visits',
  },
  {
    id: 'team',
    label: 'Project team',
    tagline: 'Roles, briefings and a task board',
    blurb: 'Run a team that works on tasks instead of shifts. Give each person a role and a briefing, assign tasks, and mark them done. No attendance needed.',
    iconName: 'list',
    examples: 'Fundraising drives, awareness campaigns, research, design',
  },
];

/** Default steps every volunteer finishes before their first shift. The notes
    are read by the volunteer on the join page and Home, so they speak to them
    (listings.js maps the older third-person training note on read). */
export function defaultPipeline() {
  return [
    { id: 'pl-brief', label: 'Attend the volunteer briefing', kind: 'meeting', required: true, note: 'A short call about safety and what to expect.' },
    { id: 'pl-consent', label: 'Return the guardian consent form', kind: 'form', required: true, note: 'Needed for anyone under 16.' },
    { id: 'pl-train', label: 'Finish role training', kind: 'training', required: true, note: 'A short walkthrough of your role.' },
  ];
}

/** Role colors for team members: the muted cause text colors, so a role dot
    never competes with the Ember primary action. */
export const ROLE_COLORS = [CAUSE.education.fg, CAUSE.environment.fg, CAUSE.animals.fg, CAUSE.homelessness.fg, CAUSE.health.fg];

/** Starter roles for a task-based team, each with a briefing. */
export function defaultTeamRoles() {
  return [
    { id: 'tr-core', name: 'Core member', briefing: "What we're working on, who it helps and how we work together. Check the board for your tasks and mark each one done when you finish.", color: ROLE_COLORS[0] },
  ];
}

export const TASK_KINDS = ['meeting', 'form', 'training', 'check'];

export function defaultDraft() {
  return {
    step: 1,
    orgType: 'volunteering',
    orgClass: 'student',
    founderExperience: '',
    name: '',
    cause: 'Education',
    delivery: 'in_person',
    site: '',
    website: '',
    eventsHosted: '',
    approxVolunteers: '',
    pipeline: defaultPipeline(),
    teamRoles: defaultTeamRoles(),
    starterTasks: [],
    mission: '',
    bio: '',
    // The lead's own cover (an upload or a library photo). While it's empty,
    // Create suggests a library photo for the cause unless the lead chose
    // "No photo" (coverNone); coverSeed picks which one (Create sets it).
    cover: '',
    coverNone: false,
    term: '8 weeks',
    visibility: 'My school and nearby',
    crewTarget: 9,
    positions: [],
    audience: [],
    repeats: 'Every Saturday',
    time: '10:00 to 12:00',
    firstSession: nextSaturdayLabel(),
    safety: { staff: false, consent: false, pair: false },
  };
}

/* Minutes after midnight → "9:00 AM", the long form lib/format.js fmtRange
   reads. 24:00 (an end at midnight) is written "12:00 AM". */
function clockText(min) {
  const h24 = Math.floor(min / 60) % 24;
  const mm = min % 60;
  const h = h24 % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** The wizard's time in the house format every screen shows (lib/format.js
    fmtRange): "10:00 to 12:00" → "10 AM to 12 PM", "15:30 to 18:00" →
    "3:30 to 6 PM", "2 PM to 4 PM" → "2 to 4 PM". The meridiem is written once
    when both ends share it (calendar.parseTimeRange reads every form this
    writes). An unreadable time gives '' (the wizard won't publish one). */
export function timeLabel(time) {
  const r = readWizardTime(time);
  if (!r) return '';
  return fmtRange(`${clockText(r.start)} to ${clockText(r.end)}`);
}

const WEEKDAY_RX = /every weekday/i;

/* Monday to Friday from `start` (a weekend start moves to the next Monday). */
function weekdayDates(start, count) {
  const out = [];
  let d = new Date(start.getTime());
  while (out.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** How many shifts the wizard schedules: 1 for "One time", otherwise 1 per
    week of the term (max 8), or 1 per weekday (max 20) for "Every weekday". */
function sessionCount(d) {
  if (/one time/i.test(d.repeats)) return 1;
  const weeks = Math.min(8, Number(String(d.term).replace(/\D/g, '')) || 8);
  return WEEKDAY_RX.test(d.repeats) ? Math.min(20, weeks * 5) : weeks;
}

export function generatedSessions(d) {
  const start = parseSessionDate(normalizeDateLabel(d.firstSession || nextSaturdayLabel()));
  const count = sessionCount(d);
  const t = timeLabel(d.time);
  const dates = WEEKDAY_RX.test(d.repeats)
    ? weekdayDates(start, count)
    : Array.from({ length: count }, (_, i) => addDays(start, i * 7 * (/every other/i.test(d.repeats) ? 2 : 1)));
  return dates.map((date) => ({ d: formatSessionDate(date), t }));
}

export function totalSlots(d) {
  return d.positions.reduce((a, p) => a + Number(p.slots || 0), 0);
}

export function safetyComplete(d) {
  return !!(d.safety.staff && d.safety.consent && d.safety.pair);
}
