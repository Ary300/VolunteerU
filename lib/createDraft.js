/* ==========================================================================
   createDraft.js, the New Project wizard's draft shape, date checks and
   session generator
   Shared by the wizard and by onboarding, which creates a project from the
   same fields.
   ========================================================================== */

import { PEXELS } from './seed.js';
import { parseSessionDate, addDays, formatSessionDate } from './db.js';
import { parseTimeRange } from './calendar.js';

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
    icon: '◷',
    iconName: 'clock',
    examples: 'Tutoring, food banks, trail clean-ups, senior visits',
  },
  {
    id: 'team',
    label: 'Project team',
    tagline: 'Roles, briefings and a task board',
    blurb: 'Run a team that works on tasks instead of shifts. Give each person a role and a briefing, assign tasks, and mark them done. No attendance needed.',
    icon: '▤',
    iconName: 'list',
    examples: 'Fundraising drives, awareness campaigns, research, design',
  },
];

/** Default steps every volunteer finishes before their first shift. */
export function defaultPipeline() {
  return [
    { id: 'pl-brief', label: 'Attend the volunteer briefing', kind: 'meeting', required: true, note: 'A short call about safety and what to expect.' },
    { id: 'pl-consent', label: 'Return the parent consent form', kind: 'form', required: true, note: 'Needed for anyone under 16.' },
    { id: 'pl-train', label: 'Finish role training', kind: 'training', required: true, note: 'A short walkthrough of the role they applied for.' },
  ];
}

/** Starter roles for a task-based team, each with a briefing. */
export function defaultTeamRoles() {
  return [
    { id: 'tr-core', name: 'Core member', briefing: "What we're working on, who it helps and how we work together. Check the board for your tasks and mark each one done when you finish.", color: '#C2603C' },
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
    cover: PEXELS.reading2,
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

/* 24-hour "13:30" parts → "1:30 PM", "noon", "midnight". */
function clock(h, min, withMeridiem = true) {
  const hh = Number(h);
  const mm = Number(min);
  if (mm === 0 && hh === 12) return 'noon';
  if (mm === 0 && (hh === 0 || hh === 24)) return 'midnight';
  const disp = hh % 12 === 0 ? 12 : hh % 12;
  const base = mm ? `${disp}:${String(mm).padStart(2, '0')}` : String(disp);
  return withMeridiem ? `${base} ${hh % 24 < 12 ? 'AM' : 'PM'}` : base;
}

/** "10:00 to 12:00" → "10 AM–noon", "15:30 to 18:00" → "3:30–6 PM",
    "2 PM to 4 PM" → "2–4 PM". The meridiem is written once when both ends
    share it (calendar.parseTimeRange reads every form this writes). An
    unreadable time gives '' (the wizard won't publish one). */
export function timeLabel(time) {
  const r = readWizardTime(time);
  if (!r) return '';
  const [h1, m1, h2, m2] = [Math.floor(r.start / 60), r.start % 60, Math.floor(r.end / 60), r.end % 60];
  const end = clock(h2, m2);
  const start = clock(h1, m1);
  const sameHalf = Number(h1) < 12 === Number(h2) < 12;
  const words = /noon|midnight/.test(start + end);
  return `${sameHalf && !words ? clock(h1, m1, false) : start}\u2013${end}`;
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
