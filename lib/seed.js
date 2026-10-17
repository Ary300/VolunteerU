/* ==========================================================================
   seed.js, fixed product constants and the blank initial state
   Palettes, cause and schedule lists, marketing copy, starter templates and an
   empty workspace. There is no sample data here: every volunteer, project,
   application and hour on screen comes from a real account.
   ========================================================================== */

import { CHECK_IN_EARLY_MIN } from './calendar.js';

/* Real stock photography of students/volunteers doing the work, served from the
   Pexels CDN (hotlink-friendly; next.config sets images.unoptimized so plain
   <img> loads them). Each key maps to a cause the app shows. */
export const PEXELS = {
  reading: 'https://images.pexels.com/photos/7156162/pexels-photo-7156162.jpeg?auto=compress&cs=tinysrgb&w=1200',
  reading2: 'https://images.pexels.com/photos/7156161/pexels-photo-7156161.jpeg?auto=compress&cs=tinysrgb&w=1200',
  reading3: 'https://images.pexels.com/photos/7156163/pexels-photo-7156163.jpeg?auto=compress&cs=tinysrgb&w=1200',
  reading4: 'https://images.pexels.com/photos/7156168/pexels-photo-7156168.jpeg?auto=compress&cs=tinysrgb&w=1200',
  reading5: 'https://images.pexels.com/photos/7156169/pexels-photo-7156169.jpeg?auto=compress&cs=tinysrgb&w=1200',
  food: 'https://images.pexels.com/photos/6646952/pexels-photo-6646952.jpeg?auto=compress&cs=tinysrgb&w=1200',
  food2: 'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1200',
  food3: 'https://images.pexels.com/photos/6646947/pexels-photo-6646947.jpeg?auto=compress&cs=tinysrgb&w=1200',
  civic: 'https://images.pexels.com/photos/6646941/pexels-photo-6646941.jpeg?auto=compress&cs=tinysrgb&w=1200',
  trail: 'https://images.pexels.com/photos/36713467/pexels-photo-36713467.jpeg?auto=compress&cs=tinysrgb&w=1200',
  outdoor: 'https://images.pexels.com/photos/36713461/pexels-photo-36713461.jpeg?auto=compress&cs=tinysrgb&w=1200',
  seniors: 'https://images.pexels.com/photos/6647050/pexels-photo-6647050.jpeg?auto=compress&cs=tinysrgb&w=1200',
  shelter: 'https://images.pexels.com/photos/6994869/pexels-photo-6994869.jpeg?auto=compress&cs=tinysrgb&w=1200',
  lead: 'https://images.pexels.com/photos/8543380/pexels-photo-8543380.jpeg?auto=compress&cs=tinysrgb&w=1200',
};

/* Avatars intentionally render initials (see Avatar in ui.jsx), never a stock
   face, so a real volunteer is never misrepresented by a fake photo. */
export const face = () => '';

/* ---- status palettes (design's exact pairs) ----------------------------- */
export const TONE = {
  ok: { bg: '#EAF3EC', color: '#3F6B4E' },
  warn: { bg: '#FDF3E7', color: '#8A5A20' },
  bad: { bg: '#F5E7E0', color: '#A8482A' },
  mute: { bg: '#F6F2EE', color: '#6B635C' },
  neutral: { bg: '#F6F2EE', color: '#57504A' },
  faint: { bg: '#F6F2EE', color: '#A19891' },
};

export const CAUSES = [
  'Food & hunger',
  'Education',
  'Homelessness',
  'Environment',
  'Animals',
  'Civic',
  'Health',
  'Seniors',
  'Arts',
  'Disaster relief',
];

export const WINDOWS = [
  'Weekday after school',
  'Weekday evenings',
  'Saturday morning',
  'Saturday afternoon',
  'Sunday',
  'School breaks',
];

export const GRADE_SCALE = [
  { t: 'Exceptional', m: 'Led without being asked' },
  { t: 'Strong', m: 'Reliable and prepared' },
  { t: 'Solid', m: 'Did the job well' },
  { t: 'Needs support', m: 'Pair with a lead next time' },
];

export const GRADE_TONE = {
  Exceptional: { gBg: '#F5E7E0', gColor: '#A8482A' },
  Strong: { gBg: '#F6F2EE', gColor: '#57504A' },
  Solid: { gBg: '#F6F2EE', gColor: '#57504A' },
  'Needs support': { gBg: '#FDF3E7', gColor: '#8A5A20' },
  'Not scored': { gBg: '#F6F2EE', gColor: '#A19891' },
};

export const ATTEND_TONE = {
  Present: { stBg: '#EAF3EC', stColor: '#3F6B4E' },
  Late: { stBg: '#FDF3E7', stColor: '#8A5A20' },
  Absent: { stBg: '#F5E7E0', stColor: '#A8482A' },
  Excused: { stBg: '#F6F2EE', stColor: '#6B635C' },
  Unmarked: { stBg: '#F6F2EE', stColor: '#A19891' },
};

export const PERSON_TONE = {
  Active: { stBg: '#EAF3EC', stColor: '#3F6B4E' },
  Onboarding: { stBg: '#FDF3E7', stColor: '#8A5A20' },
  Invited: { stBg: '#F6F2EE', stColor: '#6B635C' },
  Waitlist: { stBg: '#F6F2EE', stColor: '#6B635C' },
  Inactive: { stBg: '#F6F2EE', stColor: '#A19891' },
  Removed: { stBg: '#F5E7E0', stColor: '#A8482A' },
};

export const APP_TONE = {
  Accepted: { stBg: '#EAF3EC', stColor: '#3F6B4E' },
  Applied: { stBg: '#FDF3E7', stColor: '#8A5A20' },
  'Not accepted': { stBg: '#F5E7E0', stColor: '#A8482A' },
  'In review': { stBg: '#FDF3E7', stColor: '#8A5A20' },
  Submitted: { stBg: '#F6F2EE', stColor: '#6B635C' },
  Pending: { stBg: '#FDF3E7', stColor: '#8A5A20' },
  Waitlisted: { stBg: '#F6F2EE', stColor: '#6B635C' },
  Declined: { stBg: '#F5E7E0', stColor: '#A8482A' },
  Withdrawn: { stBg: '#F6F2EE', stColor: '#A19891' },
};

export const SHIFT_TONE = {
  Staffed: { stBg: '#EAF3EC', stColor: '#3F6B4E' },
  Open: { stBg: '#F6F2EE', stColor: '#6B635C' },
  Draft: { stBg: '#F6F2EE', stColor: '#6B635C' },
  Cancelled: { stBg: '#F5E7E0', stColor: '#A8482A' },
  Complete: { stBg: '#EAF3EC', stColor: '#3F6B4E' },
};

/* ---- application status wording -----------------------------------------
   One set of words for an application everywhere it shows. The action is
   "Apply", so a sent application reads "Applied" until the organization
   decides. Screens read these instead of keeping their own maps. */
export const APPLICATION_STATUS = {
  pending: { label: 'Applied', detail: 'Waiting to hear back', bg: '#FDF3E7', color: '#8A5A20' },
  accepted: { label: 'Accepted', detail: "You're in", bg: '#EAF3EC', color: '#3F6B4E' },
  waitlisted: { label: 'Waitlisted', detail: 'On the waitlist', bg: '#F6F2EE', color: '#6B635C' },
  declined: { label: 'Not accepted', detail: 'They passed on your application', bg: '#F5E7E0', color: '#A8482A' },
  withdrawn: { label: 'Withdrawn', detail: 'You withdrew this application', bg: '#F6F2EE', color: '#8A8179' },
};

/* ---- map (OpenStreetMap tiles, exactly as the design computed them) ----- */
export const mapTiles = (() => {
  const z = 12;
  const x0 = 1066;
  const y0 = 1552;
  const out = [];
  for (let dy = 0; dy < 3; dy++)
    for (let dx = 0; dx < 3; dx++)
      out.push({ url: `https://tile.openstreetmap.org/${z}/${x0 + dx}/${y0 + dy}.png` });
  return out;
})();

/* No seeded pins: the old ones named made-up places and linked to catalogue
   ids that never load, so every pin led to a "no longer listed" page. */
export const mapPins = [];

/* ---- create templates --------------------------------------------------- */
export const projectTemplates = [
  { id: 'tpl-tutor', t: 'Weekly tutoring circle', m: '4 to 10 people, 8 weeks', cause: 'Education', positions: ['Tutor', 'Check-in lead', 'Supply lead'] },
  { id: 'tpl-cleanup', t: 'Neighborhood cleanup', m: '10 to 30 people, 1 day', cause: 'Environment', positions: ['Volunteer', 'Safety lead', 'Photographer'] },
  { id: 'tpl-drive', t: 'Food drive at school', m: '6 to 15 people, 2 weeks', cause: 'Food & hunger', positions: ['Collections', 'Sorting', 'Transport'] },
  { id: 'tpl-tech', t: 'Senior tech help desk', m: '3 to 8 people, 6 weeks', cause: 'Seniors', positions: ['Coach', 'Greeter'] },
];

/* ---- home dashboard ------------------------------------------------------ */
/* No seeded suggestions: these fill from a real user's own saved listings. */
export const suggestedIds = [];

/* ---- lead messaging ------------------------------------------------------ */
/* Check-in opens CHECK_IN_EARLY_MIN before a shift starts (calendar.js), so
   the reminder states the same window instead of a number of its own. */
const checkInLead = CHECK_IN_EARLY_MIN % 60 === 0
  ? `${CHECK_IN_EARLY_MIN / 60} ${CHECK_IN_EARLY_MIN === 60 ? 'hour' : 'hours'}`
  : `${CHECK_IN_EARLY_MIN} minutes`;

/** The shift reminder for a given shift ("Sat, Oct 24, 1:00-4:00 PM"). */
export function shiftReminderText(when) {
  return `Reminder: our next shift is ${when}. Check-in opens ${checkInLead} before the start.`;
}

/* Bodies are what the lead starts from. The shift reminder leaves the shift
   blank here; messageTemplateText in db.js fills in the project's next shift. */
export const messageTemplates = [
  { id: 'mt1', t: 'Shift reminder', body: shiftReminderText('[day and time]') },
  { id: 'mt2', t: 'Open spots', body: 'We have open spots this week. Send the join link to anyone who wants one.' },
  { id: 'mt3', t: 'Thank you', body: "Thanks for coming today. Log your hours in the app and I'll confirm them this week." },
  { id: 'mt4', t: 'Weather cancellation', body: "Today's shift is cancelled because of the weather. We'll meet again next week." },
];

/* ---- badges -------------------------------------------------------------- */
/* Definitions only. Every badge starts locked and `s` says how to earn it. */
export const badges = [
  { id: 'b25', t: '25 hours', s: 'Reach 25 confirmed hours', on: false, need: 25, kind: 'hours' },
  { id: 'b50', t: '50 hours', s: 'Reach 50 confirmed hours', on: false, need: 50, kind: 'hours' },
  { id: 'b5org', t: '5 organizations', s: 'Volunteer with 5 organizations', on: false, need: 5, kind: 'orgs' },
  { id: 'b3cause', t: '3 causes', s: 'Volunteer for 3 different causes', on: false, need: 3, kind: 'causes' },
  { id: 'b100', t: '100 hours', s: 'Reach 100 confirmed hours', on: false, need: 100, kind: 'hours' },
  { id: 'blead', t: 'Project lead', s: 'Run 1 student project', on: false, need: 1, kind: 'projects' },
];

/* ---- initial state factory ---------------------------------------------- */
/**
 * A brand-new, empty account. The identity is filled in from the signed-in
 * profile; a signed-out visitor never sees any of this. Badge definitions are
 * kept but all locked: they describe what you can earn.
 */
export function makeInitialState() {
  return {
    session: { authed: false, email: '', signedInAt: null, remember: true },
    account: {
      id: 'me',
      firstName: '',
      lastName: '',
      name: '',
      email: '',
      phone: '',
      grade: '',
      age: '',
      school: '',
      city: '',
      zip: '',
      avatar: '',
      guardianEmail: '',
      guardianConsent: false,
      counselor: { name: '', access: false, lastChecked: '' },
      bio: '',
    },
    prefs: {
      interest: '',
      location: '',
      notificationsSeenAt: 0,
      causes: [],
      windows: [],
      radius: 5,
      hoursGoal: 0,
      goalDeadline: '',
      experience: 'Never',
      notifications: {
        shiftReminders: true,
        applicationUpdates: true,
        crewMessages: true,
        weeklyDigest: true,
        productNews: false,
        channel: { push: true, email: true, sms: true },
      },
      privacy: {
        publicProfile: true,
        showSchool: true,
        showFriendsGoing: true,
        shareRecordOnApply: true,
        counselorAccess: true,
      },
      appearance: { density: 'comfortable', motion: 'system', textSize: 'default', contrast: 'default' },
      permissions: { location: 'unknown', notifications: 'unknown' },
    },
    onboarding: { completed: false, step: 1, intent: 'start', firstName: '', zip: '', draft: {} },
    opportunities: [],
    peerProjects: [],
    saved: [],
    friendsGoing: [],
    stats: {
      verifiedHours: 0,
      events: 0,
      orgs: 0,
      causes: 0,
      leadershipHours: 0,
      thisMonth: 0,
      bestMonth: 0,
      avgShift: 0,
      pendingVerification: 0,
      activeWeeks: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastActiveWeek: '',
      showRate: 0,
      onTime: 0,
      averageScore: '-',
      hoursGenerated: 0,
      recruited: 0,
    },
    requirement: {
      termDone: 0,
      termGoal: 0,
      yearCounted: 0,
      yearGoal: 0,
      deadline: '',
      counselor: '',
      lastConfirmed: '',
    },
    applications: [],
    bookings: [],
    hoursLog: [],
    myAttendance: [],
    leadFeedback: [],
    badges: badges.map((b) => ({ ...b, on: false })),
    causeBars: [],
    projects: [],
    activeProjectId: null,
    drafts: { create: null, apply: {} },
    notifications: [],
    recentSearches: [],
    ui: { discoverView: 'list', leadTab: 'overview', openCard: 'hours', showTrustRow: true, heroProofPill: true, tips: {}, unreadNotifs: 0 },
    meta: { firstRun: true, installedAt: null, lastSeen: null },
  };
}
