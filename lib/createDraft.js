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

export function defaultDraft() {
  return {
    step: 1,
    name: 'Saturday Reading Circle',
    cause: 'Education',
    site: 'Library Branch 4, Indianapolis',
    website: '',
    mission: 'Weekly reading practice for K-3 students at Branch 4, run by high schoolers who show up every Saturday.',
    bio: 'Nine tutors, one hour of reading per child, snacks after. No experience needed and we train you the first week.',
    cover: PEXELS.reading2,
    term: '8 weeks',
    visibility: 'My school and nearby',
    crewTarget: 9,
    positions: [
      { t: 'Tutor', slots: 8, age: '15+', train: 'Required · 30 min', commit: '2 hrs weekly', note: 'Reading level K-3', requirements: ['Guardian consent', 'Reading training'] },
      { t: 'Check-in lead', slots: 1, age: '16+', train: 'Required · 45 min', commit: '2.5 hrs weekly', note: 'Runs the roster and QR check-in', requirements: ['Guardian consent'] },
      { t: 'Supply lead', slots: 1, age: '16+', train: 'None', commit: '1 hr weekly', note: 'Books materials with the library', requirements: [] },
      { t: 'Photographer', slots: 1, age: '13+', train: 'None', commit: '1 hr monthly', note: 'Media release required', requirements: ['Media release'] },
      { t: 'Snack coordinator', slots: 2, age: '13+', train: 'Food handling', commit: '1 hr weekly', note: 'Allergy list on file', requirements: ['Food handling'] },
    ],
    audience: ['High school', 'First timers welcome'],
    repeats: 'Every Saturday',
    time: '10:00 to 12:00',
    firstSession: 'Aug 9',
    safety: { staff: true, consent: true, pair: true },
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
