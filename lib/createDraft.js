/* ==========================================================================
   createDraft.js — the New Project wizard's draft shape and session generator
   Shared by the wizard and by onboarding, which creates a project from the
   same fields.
   ========================================================================== */

import { PEXELS } from './seed.js';
import { parseSessionDate, addDays, formatSessionDate } from './db.js';

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
    tagline: 'Shifts, sign-ups and verified hours',
    blurb: 'Recruit volunteers to events with set times. You track attendance, approve hours, and QC applicants through a pipeline before their first shift.',
    icon: '◷',
    examples: 'Tutoring, food banks, trail clean-ups, senior visits',
  },
  {
    id: 'team',
    label: 'Project team',
    tagline: 'Roles, briefings and a task board',
    blurb: 'Run a team that ships work, not shifts. Give each person a role with a briefing, assign tasks on a board, and track them to done — no attendance needed.',
    icon: '◱',
    examples: 'Fundraising drives, awareness campaigns, research, design',
  },
];

/** A sensible default QC pipeline every volunteer clears before their first shift. */
export function defaultPipeline() {
  return [
    { id: 'pl-brief', label: 'Attend the volunteer briefing', kind: 'meeting', required: true, note: 'A 20-minute Zoom call covering safety and what to expect.' },
    { id: 'pl-consent', label: 'Return the guardian consent form', kind: 'form', required: true, note: 'Required for anyone under 16.' },
    { id: 'pl-train', label: 'Finish role training', kind: 'training', required: true, note: 'Short walkthrough for the role they applied to.' },
  ];
}

/** Starter roles for a task-based team, each with a briefing. */
export function defaultTeamRoles() {
  return [
    { id: 'tr-core', name: 'Core member', briefing: 'Read this before you start: what we are building, who it helps, and how we work together. Check the board for your tasks and move them to Done as you finish.', color: '#C2603C' },
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
    firstSession: 'Aug 9',
    safety: { staff: false, consent: false, pair: false },
  };
}

/** "10:00 to 12:00" → "10:00 AM - 12:00 PM" */
export function timeLabel(time) {
  const m = /(\d{1,2}):(\d{2})\s*(?:to|-|–)\s*(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (!m) return '10:00 AM - 12:00 PM';
  const fmt = (h, min) => {
    const hh = Number(h);
    const ampm = hh < 12 ? 'AM' : 'PM';
    const disp = hh % 12 === 0 ? 12 : hh % 12;
    return `${disp}:${min} ${ampm}`;
  };
  return `${fmt(m[1], m[2])} - ${fmt(m[3], m[4])}`;
}

export function generatedSessions(d) {
  const start = parseSessionDate(d.firstSession || 'Aug 9');
  const strideWeeks = /every other/i.test(d.repeats) ? 2 : 1;
  const count = /one time/i.test(d.repeats) ? 1 : Math.min(8, Number(String(d.term).replace(/\D/g, '')) || 8);
  const t = timeLabel(d.time);
  return Array.from({ length: count }, (_, i) => ({
    d: formatSessionDate(addDays(start, i * 7 * strideWeeks)),
    t,
  }));
}

export function totalSlots(d) {
  return d.positions.reduce((a, p) => a + Number(p.slots || 0), 0);
}

export function safetyComplete(d) {
  return !!(d.safety.staff && d.safety.consent && d.safety.pair);
}
