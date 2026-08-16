/* ==========================================================================
   seed.js — the product's initial dataset
   Every string, colour and number that appears in `VolunteerU Design.dc.html`
   is reproduced verbatim. Fields the static design implied but never spelled
   out (shift rosters, addresses, requirement lists) are filled in so the
   screens behave like a real product rather than a mock.
   ========================================================================== */

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

export const face = (slug) => `https://picsum.photos/seed/${slug}/400/400?grayscale`;

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

export const mapPins = [
  { label: '1', left: '46%', top: '38%', t: 'Gleaners Food Bank', oppId: 'opp-food-dist' },
  { label: '2', left: '38%', top: '30%', t: 'Library Branch 4', oppId: 'opp-reading-buddies' },
  { label: '3', left: '55%', top: '52%', t: 'Riverside Trail', oppId: 'opp-trail' },
  { label: '4', left: '30%', top: '58%', t: 'Civic Indiana', oppId: 'opp-voter' },
];

/* ---- landing copy ------------------------------------------------------- */
export const proofCards = [
  { quote: '“I needed 40 service hours and had no idea where to start. Had my first shift booked in ten minutes.”', who: 'Maya R. · Grade 11, Indianapolis', slot: 'proof1' },
  { quote: '“The verified hours page went straight into my scholarship application. No chasing signatures.”', who: 'Deven A. · Grade 12, Columbus', slot: 'proof2' },
  { quote: '“We filled eight Saturday slots in a day. That never happens.”', who: 'Volunteer Coordinator · Regional Food Bank', slot: 'proof3' },
  { quote: '“Started my own tutoring project through Lead. Nine friends signed up.”', who: 'Sofia K. · Grade 10, Austin', slot: 'proof4' },
];

export const paths = [
  {
    k: 'Build it',
    t: 'Start your own organization',
    b: 'Set it up in minutes under a verified sponsor, then recruit a crew from schools near you. No filing, no partner hunting, no clipboard.',
    slot: 'path-start',
    img: PEXELS.outdoor,
    cta: 'Start a project',
    goal: 'lead',
    rows: [
      { t: 'Sponsor matching and ready safety templates' },
      { t: 'Recruiting page, applications and roster' },
      { t: 'Attendance, scores and verified hours' },
    ],
  },
  {
    k: 'Join it',
    t: 'Join an accredited or student organization',
    b: 'Real shifts at verified institutions and projects other students are running. Apply in a minute, hours count themselves.',
    slot: 'path-join',
    img: PEXELS.reading,
    cta: 'Browse openings',
    goal: 'discover',
    rows: [
      { t: 'Ranked to your causes, radius and free time' },
      { t: 'Verified badge on accredited institutions' },
      { t: 'One application, then check in and go' },
    ],
  },
];

export const timeline = [
  { d: 'Minute 1', t: 'Describe it', b: 'Name, cause, mission, where it happens. Four fields.' },
  { d: 'Day 1', t: 'Get a sponsor', b: 'We send your plan to vetted organizations that host student projects.' },
  { d: 'Day 3', t: 'Open positions', b: 'Roles, slots and requirements become an application form.' },
  { d: 'Day 7', t: 'Run session one', b: 'Crew confirmed, check-in code live, hours counting.' },
];

export const sponsorMatches = [
  { n: 'Indy Public Library', m: 'Hosts 6 student projects · 1.1 mi', st: 'Accepted', stBg: '#EAF3EC', stColor: '#3F6B4E', slug: 'sp-library' },
  { n: 'Gleaners Food Bank', m: 'Hosts 12 student projects · 2.4 mi', st: 'Reviewing', stBg: '#FDF3E7', stColor: '#8A5A20', slug: 'sp-gleaners' },
  { n: 'Keep Indianapolis Beautiful', m: 'Hosts 4 student projects · 4.6 mi', st: 'Sent', stBg: '#F6F2EE', stColor: '#6B635C', slug: 'sp-kib' },
];

export const shareStats = [
  { v: '312', l: 'Students saw the page in 48 hours' },
  { v: '27', l: 'Opened the application' },
  { v: '9', l: 'Confirmed for session one' },
];

export const allInOne = [
  { k: '01', t: 'Applications', b: 'Screening questions, accept, waitlist or decline in one tap.' },
  { k: '02', t: 'Roster', b: 'Every member with role, status, tags, hours and last contact.' },
  { k: '03', t: 'Attendance', b: 'Present, late or absent with geofenced times and a score per person.' },
  { k: '04', t: 'Verified hours', b: 'Posted to each volunteer record the day they earn them.' },
];

export const effortAlone = [
  { v: '6 weeks', l: 'Before a first session, if the paperwork clears' },
  { v: '60 hrs', l: 'Admin you do yourself: forms, emails, scheduling' },
  { v: '40+', l: 'Cold emails to find one organization that says yes' },
  { v: 'None', l: 'Proof anyone will accept for the hours you ran' },
];

export const effortWith = [
  { v: '12 min', l: 'Setup, from name and mission to open positions' },
  { v: '1 day', l: 'Sponsor match from vetted organizations near you' },
  { v: '7 days', l: 'Confirmed crew from schools around you' },
  { v: 'Every hour', l: 'Geofenced, organizer confirmed, checkable by a college' },
];

export const aloneRows = [
  { a: 'File paperwork, chase a 501(c)(3), wait months', b: 'Launch under a verified sponsor in one sitting' },
  { a: 'Cold email 40 organizations for a partner', b: 'We match you with sponsors near your ZIP' },
  { a: 'Beg friends in a group chat to show up', b: 'A recruiting page every eligible student nearby sees' },
  { a: 'Track hours in a spreadsheet nobody trusts', b: 'Attendance and hours verified at check-out' },
  { a: 'Write your own waivers and safety plan', b: 'Templates the sponsor already accepts' },
  { a: 'Hope it looks good on an application', b: 'A record a college or scholarship can check' },
];

export const faqs = [
  { q: 'Do I need a 501(c)(3)', a: 'No. You run your project under a verified sponsoring organization, which covers insurance and the legal side. We match you with one.' },
  { q: 'How fast can I launch', a: 'Setup takes minutes. Most projects have a sponsor within a day and their first confirmed crew inside a week.' },
  { q: 'How do hours get verified', a: 'Check-in and check-out are geofenced to the site, then the organizer confirms attendance. Hours post to every volunteer record the same day.' },
  { q: 'What does it cost', a: 'Free for students, on both sides. Organizations pay for posting and roster tools.' },
];

export const intents = [
  { k: 'join', t: 'Join something', b: 'Find shifts and student projects near me' },
  { k: 'start', t: 'Start my own', b: 'Run a project and recruit a crew' },
  { k: 'both', t: 'Both', b: 'Volunteer now, lead later this term' },
];

export const projectTemplates = [
  { id: 'tpl-tutor', t: 'Weekly tutoring circle', m: '4–10 crew · 8 wks', cause: 'Education', positions: ['Tutor', 'Check-in lead', 'Supply lead'] },
  { id: 'tpl-cleanup', t: 'Neighborhood cleanup', m: '10–30 crew · 1 day', cause: 'Environment', positions: ['Crew member', 'Safety lead', 'Photographer'] },
  { id: 'tpl-drive', t: 'Food drive at school', m: '6–15 crew · 2 wks', cause: 'Food & hunger', positions: ['Collections', 'Sorting', 'Transport'] },
  { id: 'tpl-tech', t: 'Senior tech help desk', m: '3–8 crew · 6 wks', cause: 'Seniors', positions: ['Coach', 'Greeter'] },
];

export const REQUIREMENT_LIBRARY = [
  'Guardian consent',
  'Media release',
  'Food handling',
  'Reading training',
  'Transport form',
];

/* ---- opportunities (accredited organizations) ---------------------------
   The first four are the design's `matches` array, in order.
   ------------------------------------------------------------------------- */
export const opportunities = [
  {
    id: 'opp-food-dist',
    score: 96,
    title: 'Saturday Food Distribution',
    org: 'Gleaners Food Bank',
    orgSlug: 'vu-apply-logo',
    verified: true,
    cause: 'Food & hunger',
    meta: 'Sat · 1:00–4:00 PM · 2.4 mi',
    hrs: '3 hrs',
    hours: 3,
    tags: ['Food & hunger', 'Group shift', 'Counts for school'],
    slot: 'm1',
    img: PEXELS.food,
    heroImg: PEXELS.food3,
    ph: 'food bank line',
    spots: '6 of 8 spots left',
    why: 'Matches your Saturday window, cause interest and 5-mile radius.',
    address: '3737 Waldemere Ave',
    distance: 2.4,
    travelMin: 11,
    transit: 'bus route 19 stops outside',
    minAge: 14,
    groupShift: true,
    countsForSchool: true,
    window: 'Saturday afternoon',
    badgeRow: ['96% match', 'Vetted org', 'Ages 14+', 'Group shift'],
    description:
      "You'll work a line with 7 other volunteers packing and handing out produce boxes to about 300 families. No experience needed. A staff lead runs a 10-minute walkthrough at the start. Wear closed-toe shoes.",
    safety: [
      'Background-checked staff lead on site',
      'Never a solo shift',
      'Guardian consent already on file',
    ],
    roles: [
      { id: 'r-pack', t: 'Line packer', m: '3 hrs · no training · ages 14+', minAge: 14 },
      { id: 'r-cart', t: 'Cart runner', m: '3 hrs · no training · ages 16+', minAge: 16 },
      { id: 'r-greet', t: 'Greeter and intake', m: '3 hrs · 10 min briefing · ages 15+', minAge: 15 },
    ],
    shifts: [
      { id: 'sh-a1', d: 'Sat, Aug 1', t: '1:00–4:00 PM', tLong: '1:00 to 4:00 PM', cap: 8, taken: 2 },
      { id: 'sh-a8', d: 'Sat, Aug 8', t: '1:00–4:00 PM', tLong: '1:00 to 4:00 PM', cap: 8, taken: 0 },
      { id: 'sh-a15', d: 'Sat, Aug 15', t: '9:00 AM–12:00 PM', tLong: '9:00 AM to 12:00 PM', cap: 8, taken: 4 },
    ],
    replyTime: 'Gleaners usually replies within a day.',
    closesSoon: true,
    homeMeta: 'Gleaners · Sat 1:00 PM · 2.4 mi',
    homeSlot: 'sug1',
    homeImg: PEXELS.food2,
  },
  {
    id: 'opp-reading-buddies',
    score: 91,
    title: 'Reading Buddies at Branch 4',
    org: 'Indy Public Library',
    orgSlug: 'vu-sponsor',
    verified: true,
    cause: 'Education',
    meta: 'Sat · 10:00 AM–12:00 PM · 1.1 mi',
    hrs: '2 hrs',
    hours: 2,
    tags: ['Education', 'Training provided', 'Recurring'],
    slot: 'm2',
    img: PEXELS.reading3,
    heroImg: PEXELS.reading4,
    ph: 'kid reading with tutor',
    spots: '3 of 6 spots left',
    why: 'Education is a top cause of yours and it repeats weekly.',
    address: '2450 N Meridian St, Branch 4',
    distance: 1.1,
    travelMin: 6,
    transit: 'bus route 39 two blocks away',
    minAge: 15,
    groupShift: true,
    countsForSchool: true,
    window: 'Saturday morning',
    badgeRow: ['91% match', 'Vetted org', 'Ages 15+', 'Training provided'],
    description:
      'Sit with one or two early readers for the hour and work through a book at their pace. Library staff run a 20-minute training the first week and hand you the material each session.',
    safety: ['Library staff supervise the room', 'Never a solo shift', 'Guardian consent already on file'],
    roles: [
      { id: 'r-tutor', t: 'Reading tutor', m: '2 hrs · 20 min training · ages 15+', minAge: 15 },
      { id: 'r-setup', t: 'Room setup', m: '2 hrs · no training · ages 13+', minAge: 13 },
    ],
    shifts: [
      { id: 'sh-r2', d: 'Sat, Aug 2', t: '10:00 AM–12:00 PM', tLong: '10:00 AM to 12:00 PM', cap: 6, taken: 3 },
      { id: 'sh-r9', d: 'Sat, Aug 9', t: '10:00 AM–12:00 PM', tLong: '10:00 AM to 12:00 PM', cap: 6, taken: 1 },
      { id: 'sh-r16', d: 'Sat, Aug 16', t: '10:00 AM–12:00 PM', tLong: '10:00 AM to 12:00 PM', cap: 6, taken: 0 },
    ],
    replyTime: 'Branch 4 usually replies the same day.',
    homeMeta: 'Indy Library · Sat 10:00 AM · 1.1 mi',
    homeSlot: 'sug2',
    homeImg: PEXELS.reading4,
  },
  {
    id: 'opp-trail',
    score: 88,
    title: 'Riverside Trail Cleanup',
    org: 'Keep Indianapolis Beautiful',
    orgSlug: 'sp-kib',
    verified: true,
    cause: 'Environment',
    meta: 'Sun · 9:00 AM–12:00 PM · 4.6 mi',
    hrs: '3 hrs',
    hours: 3,
    tags: ['Environment', 'Group shift', '2 friends going'],
    slot: 'm3',
    img: PEXELS.trail,
    heroImg: PEXELS.outdoor,
    ph: 'trail cleanup volunteers',
    spots: '11 of 20 spots left',
    why: 'Two people from your school already claimed a spot.',
    address: 'Riverside Trailhead, 30th & White River',
    distance: 4.6,
    travelMin: 15,
    transit: 'street parking at the trailhead',
    minAge: 13,
    groupShift: true,
    countsForSchool: true,
    friendsGoing: 2,
    window: 'Sunday',
    badgeRow: ['88% match', 'Vetted org', 'Ages 13+', 'Group shift'],
    description:
      'Walk a two-mile stretch of the riverside trail in teams of four, bagging litter and clearing overgrowth from the path edge. Gloves, bags and grabbers are provided. Dress for weather.',
    safety: ['Two adults on every team', 'Never a solo shift', 'Cancelled automatically in storms'],
    roles: [
      { id: 'r-crew', t: 'Cleanup crew', m: '3 hrs · no training · ages 13+', minAge: 13 },
      { id: 'r-sort', t: 'Sorting station', m: '3 hrs · no training · ages 13+', minAge: 13 },
      { id: 'r-photo', t: 'Photographer', m: '2 hrs · media release · ages 14+', minAge: 14 },
    ],
    shifts: [
      { id: 'sh-t3', d: 'Sun, Aug 3', t: '9:00 AM–12:00 PM', tLong: '9:00 AM to 12:00 PM', cap: 20, taken: 9 },
      { id: 'sh-t17', d: 'Sun, Aug 17', t: '9:00 AM–12:00 PM', tLong: '9:00 AM to 12:00 PM', cap: 20, taken: 4 },
    ],
    replyTime: 'Keep Indianapolis Beautiful usually replies within two days.',
    homeMeta: 'Keep Indy Beautiful · Sun 9:00 AM',
    homeSlot: 'sug3',
    homeImg: PEXELS.outdoor,
  },
  {
    id: 'opp-voter',
    score: 84,
    title: 'Voter Registration Table',
    org: 'Civic Indiana (nonpartisan)',
    orgSlug: 'org-civic',
    verified: true,
    cause: 'Civic',
    meta: 'Fri · 3:30–6:00 PM · 3.0 mi',
    hrs: '2.5 hrs',
    hours: 2.5,
    tags: ['Civic', 'Ages 16+', 'Leadership track'],
    slot: 'm4',
    img: PEXELS.civic,
    heroImg: PEXELS.civic,
    ph: 'students at civic table',
    spots: '2 of 4 spots left',
    why: 'Closest match to your civic interest and a Lead-eligible role.',
    address: '1200 Madison Ave, community hall',
    distance: 3.0,
    travelMin: 12,
    transit: 'bus route 10 stops one block east',
    minAge: 16,
    groupShift: false,
    countsForSchool: true,
    leadership: true,
    window: 'Weekday after school',
    badgeRow: ['84% match', 'Vetted org', 'Ages 16+', 'Leadership track'],
    description:
      'Staff a registration table outside a community hall with one other volunteer. You check eligibility, help fill in the form and hand it to the county clerk runner. Strictly nonpartisan script provided.',
    safety: ['Staff coordinator within sight of the table', 'Never a solo shift', 'Script and FAQ provided'],
    roles: [
      { id: 'r-table', t: 'Table volunteer', m: '2.5 hrs · 15 min briefing · ages 16+', minAge: 16 },
      { id: 'r-lead', t: 'Table lead', m: '2.5 hrs · 45 min training · ages 16+', minAge: 16, leadership: true },
    ],
    shifts: [
      { id: 'sh-v1', d: 'Fri, Aug 1', t: '3:30–6:00 PM', tLong: '3:30 to 6:00 PM', cap: 4, taken: 2 },
      { id: 'sh-v8', d: 'Fri, Aug 8', t: '3:30–6:00 PM', tLong: '3:30 to 6:00 PM', cap: 4, taken: 1 },
    ],
    replyTime: 'Civic Indiana usually replies within a day.',
    closesSoon: true,
  },
  {
    id: 'opp-shelter-sort',
    score: 81,
    title: 'Evening Shelter Supply Sort',
    org: 'Wheeler Mission',
    orgSlug: 'wheeler',
    verified: true,
    cause: 'Homelessness',
    meta: 'Wed · 5:00–7:30 PM · 4.8 mi',
    hrs: '2.5 hrs',
    hours: 2.5,
    tags: ['Homelessness', 'Group shift', 'Indoor'],
    slot: 'm5',
    img: PEXELS.shelter,
    heroImg: PEXELS.shelter,
    ph: 'supply sorting volunteers',
    spots: '5 of 10 spots left',
    why: 'Homelessness is one of your causes and this fits a weekday evening.',
    address: '245 N Delaware St',
    distance: 4.8,
    travelMin: 15,
    transit: 'downtown transit center 5 min walk',
    minAge: 14,
    groupShift: true,
    countsForSchool: true,
    window: 'Weekday evenings',
    badgeRow: ['81% match', 'Vetted org', 'Ages 14+', 'Group shift'],
    description:
      'Sort donated clothing and hygiene supplies into intake bins with a crew of ten in the warehouse behind the shelter. Standing work, music on, staff lead runs the floor.',
    safety: ['Staff lead on the warehouse floor', 'Never a solo shift', 'Closed-toe shoes required'],
    roles: [
      { id: 'r-sortc', t: 'Sorting crew', m: '2.5 hrs · no training · ages 14+', minAge: 14 },
      { id: 'r-intake', t: 'Intake desk', m: '2.5 hrs · 10 min briefing · ages 16+', minAge: 16 },
    ],
    shifts: [
      { id: 'sh-w6', d: 'Wed, Aug 6', t: '5:00–7:30 PM', tLong: '5:00 to 7:30 PM', cap: 10, taken: 5 },
      { id: 'sh-w13', d: 'Wed, Aug 13', t: '5:00–7:30 PM', tLong: '5:00 to 7:30 PM', cap: 10, taken: 2 },
    ],
    replyTime: 'Wheeler Mission usually replies within two days.',
  },
  {
    id: 'opp-shelter-walk',
    score: 78,
    title: 'Weekend Dog Walking',
    org: 'Indianapolis Humane Society',
    orgSlug: 'humane',
    verified: true,
    cause: 'Animals',
    meta: 'Sat · 8:00–10:00 AM · 4.9 mi',
    hrs: '2 hrs',
    hours: 2,
    tags: ['Animals', 'Outdoor', 'Training provided'],
    slot: 'm6',
    img: PEXELS.outdoor,
    heroImg: PEXELS.outdoor,
    ph: 'volunteer walking a dog',
    spots: '4 of 12 spots left',
    why: 'Fits your Saturday morning window and opens a new cause area.',
    address: '7929 N Michigan Rd',
    distance: 4.9,
    travelMin: 15,
    transit: 'bus route 34 stops at the corner',
    minAge: 16,
    groupShift: true,
    countsForSchool: true,
    window: 'Saturday morning',
    badgeRow: ['78% match', 'Vetted org', 'Ages 16+', 'Training provided'],
    description:
      'Walk shelter dogs on a fixed loop after a 30-minute handling class. You are paired with a returning volunteer for your first two sessions.',
    safety: ['Handling class before your first walk', 'Never a solo shift', 'Staff on the yard at all times'],
    roles: [
      { id: 'r-walk', t: 'Dog walker', m: '2 hrs · 30 min training · ages 16+', minAge: 16 },
      { id: 'r-laundry', t: 'Kennel laundry', m: '2 hrs · no training · ages 14+', minAge: 14 },
    ],
    shifts: [
      { id: 'sh-h2', d: 'Sat, Aug 2', t: '8:00–10:00 AM', tLong: '8:00 to 10:00 AM', cap: 12, taken: 8 },
      { id: 'sh-h9', d: 'Sat, Aug 9', t: '8:00–10:00 AM', tLong: '8:00 to 10:00 AM', cap: 12, taken: 3 },
    ],
    replyTime: 'The Humane Society usually replies within a day.',
    closesSoon: true,
  },
  {
    id: 'opp-meal-pack',
    score: 76,
    title: 'School Break Meal Packing',
    org: 'Gleaners Food Bank',
    orgSlug: 'vu-apply-logo',
    verified: true,
    cause: 'Food & hunger',
    meta: 'Tue · 10:00 AM–1:00 PM · 2.4 mi',
    hrs: '3 hrs',
    hours: 3,
    tags: ['Food & hunger', 'School breaks', 'Group shift'],
    slot: 'm7',
    img: PEXELS.food2,
    heroImg: PEXELS.food2,
    ph: 'meal packing line',
    spots: '9 of 24 spots left',
    why: 'Runs during school breaks, which you marked as free.',
    address: '3737 Waldemere Ave',
    distance: 2.4,
    travelMin: 11,
    transit: 'bus route 19 stops outside',
    minAge: 13,
    groupShift: true,
    countsForSchool: true,
    window: 'School breaks',
    badgeRow: ['76% match', 'Vetted org', 'Ages 13+', 'Group shift'],
    description:
      'Assemble weekend meal kits for students on the free lunch program. Assembly-line work with a target of 1,200 kits per session.',
    safety: ['Staff lead on the line', 'Never a solo shift', 'Hairnets and gloves provided'],
    roles: [{ id: 'r-pack2', t: 'Packing line', m: '3 hrs · no training · ages 13+', minAge: 13 }],
    shifts: [
      { id: 'sh-m5', d: 'Tue, Aug 5', t: '10:00 AM–1:00 PM', tLong: '10:00 AM to 1:00 PM', cap: 24, taken: 15 },
    ],
    replyTime: 'Gleaners usually replies within a day.',
  },
  {
    id: 'opp-senior-tech',
    score: 74,
    title: 'Senior Center Tech Clinic',
    org: 'Nora Community Center',
    orgSlug: 'nora',
    verified: true,
    online: true,
    cause: 'Seniors',
    meta: 'Thu · 4:00–6:00 PM · Online',
    hrs: '2 hrs',
    hours: 2,
    tags: ['Seniors', 'Online', 'One-to-one'],
    slot: 'm8',
    img: PEXELS.seniors,
    heroImg: PEXELS.seniors,
    ph: 'student helping a senior with a phone',
    spots: '3 of 6 spots left',
    why: 'Fully remote — a short weekday-afternoon commitment over video.',
    address: 'Online (video call)',
    distance: 0,
    travelMin: 0,
    transit: 'bus route 26 stops at the door',
    minAge: 14,
    groupShift: false,
    countsForSchool: true,
    window: 'Weekday after school',
    badgeRow: ['74% match', 'Vetted org', 'Ages 14+', 'One-to-one'],
    description:
      'Sit one-to-one with a member and work through whatever they brought: a phone that will not update, a printer, a video call with family. Staff coordinator floats the room.',
    safety: ['Staff coordinator in the room', 'Never a solo shift', 'Members sign their own consent'],
    roles: [{ id: 'r-coach', t: 'Tech coach', m: '2 hrs · 15 min briefing · ages 14+', minAge: 14 }],
    shifts: [
      { id: 'sh-n7', d: 'Thu, Aug 7', t: '4:00–6:00 PM', tLong: '4:00 to 6:00 PM', cap: 6, taken: 3 },
      { id: 'sh-n14', d: 'Thu, Aug 14', t: '4:00–6:00 PM', tLong: '4:00 to 6:00 PM', cap: 6, taken: 1 },
    ],
    replyTime: 'Nora Community Center usually replies within two days.',
  },
  {
    id: 'opp-garden',
    score: 71,
    title: 'Community Garden Beds',
    org: 'Keep Indianapolis Beautiful',
    orgSlug: 'sp-kib',
    verified: true,
    cause: 'Environment',
    meta: 'Sat · 9:00–11:00 AM · 3.3 mi',
    hrs: '2 hrs',
    hours: 2,
    tags: ['Environment', 'Outdoor', 'Recurring'],
    slot: 'm9',
    img: PEXELS.outdoor,
    heroImg: PEXELS.trail,
    ph: 'community garden volunteers',
    spots: '6 of 10 spots left',
    why: 'Environment is on your list and this repeats every Saturday.',
    address: '2001 Boulevard Pl',
    distance: 3.3,
    travelMin: 12,
    transit: 'bus route 38 two blocks north',
    minAge: 13,
    groupShift: true,
    countsForSchool: true,
    window: 'Saturday morning',
    badgeRow: ['71% match', 'Vetted org', 'Ages 13+', 'Outdoor'],
    description:
      'Weed, mulch and harvest raised beds that feed the neighbourhood pantry. Tools provided, work is at your own pace.',
    safety: ['Site lead on the plot', 'Never a solo shift', 'Water and shade provided'],
    roles: [{ id: 'r-garden', t: 'Garden crew', m: '2 hrs · no training · ages 13+', minAge: 13 }],
    shifts: [
      { id: 'sh-g2', d: 'Sat, Aug 2', t: '9:00–11:00 AM', tLong: '9:00 to 11:00 AM', cap: 10, taken: 4 },
      { id: 'sh-g9', d: 'Sat, Aug 9', t: '9:00–11:00 AM', tLong: '9:00 to 11:00 AM', cap: 10, taken: 2 },
    ],
    replyTime: 'Keep Indianapolis Beautiful usually replies within two days.',
  },
  {
    id: 'opp-hospital',
    score: 68,
    title: 'Hospital Family Room Host',
    org: 'Riley Children’s Foundation',
    orgSlug: 'riley',
    verified: true,
    cause: 'Health',
    meta: 'Sun · 1:00–4:00 PM · 4.1 mi',
    hrs: '3 hrs',
    hours: 3,
    tags: ['Health', 'Indoor', 'Ages 16+'],
    slot: 'm10',
    img: PEXELS.seniors,
    heroImg: PEXELS.seniors,
    ph: 'hospital family room',
    spots: '1 of 3 spots left',
    why: 'A new cause area with a short Sunday commitment.',
    address: '705 Riley Hospital Dr',
    distance: 4.1,
    travelMin: 14,
    transit: 'campus shuttle from the garage',
    minAge: 16,
    groupShift: false,
    countsForSchool: true,
    window: 'Sunday',
    badgeRow: ['68% match', 'Vetted org', 'Ages 16+', 'Indoor'],
    description:
      'Keep the family lounge stocked, greet arriving families and point them to the right floor. Quiet, steady work alongside a hospital volunteer coordinator.',
    safety: ['Hospital coordinator on the floor', 'Never a solo shift', 'Health screening at check-in'],
    roles: [{ id: 'r-host', t: 'Family room host', m: '3 hrs · 45 min orientation · ages 16+', minAge: 16 }],
    shifts: [{ id: 'sh-ri3', d: 'Sun, Aug 3', t: '1:00–4:00 PM', tLong: '1:00 to 4:00 PM', cap: 3, taken: 2 }],
    replyTime: 'Riley usually replies within three days.',
  },
  {
    id: 'opp-arts',
    score: 64,
    title: 'Youth Mural Assistants',
    org: 'Indy Arts Council',
    orgSlug: 'arts',
    verified: true,
    cause: 'Arts',
    meta: 'Sat · 12:00–4:00 PM · 4.4 mi',
    hrs: '4 hrs',
    hours: 4,
    tags: ['Arts', 'Outdoor', 'Group shift'],
    slot: 'm11',
    img: PEXELS.lead,
    heroImg: PEXELS.lead,
    ph: 'mural painting crew',
    spots: '7 of 15 spots left',
    why: 'A longer Saturday shift that closes your hour gap fast.',
    address: '924 N Pennsylvania St',
    distance: 4.4,
    travelMin: 14,
    transit: 'bus route 4 stops one block west',
    minAge: 14,
    groupShift: true,
    countsForSchool: true,
    window: 'Saturday afternoon',
    badgeRow: ['64% match', 'Vetted org', 'Ages 14+', 'Group shift'],
    description:
      'Prep walls, mix paint and block in colour under a lead artist. No painting experience needed, and you keep a photo of the finished wall.',
    safety: ['Lead artist supervises the wall', 'Never a solo shift', 'Ladders handled by staff only'],
    roles: [{ id: 'r-mural', t: 'Mural assistant', m: '4 hrs · no training · ages 14+', minAge: 14 }],
    shifts: [{ id: 'sh-ar2', d: 'Sat, Aug 2', t: '12:00–4:00 PM', tLong: '12:00 to 4:00 PM', cap: 15, taken: 8 }],
    replyTime: 'Indy Arts Council usually replies within two days.',
  },
  {
    id: 'opp-disaster',
    score: 59,
    title: 'Disaster Kit Assembly',
    org: 'American Red Cross Indiana',
    orgSlug: 'redcross',
    verified: true,
    cause: 'Disaster relief',
    meta: 'Sat · 9:00 AM–12:00 PM · 4.9 mi',
    hrs: '3 hrs',
    hours: 3,
    tags: ['Disaster relief', 'Indoor', 'Group shift'],
    slot: 'm12',
    img: PEXELS.shelter,
    heroImg: PEXELS.shelter,
    ph: 'kit assembly line',
    spots: '12 of 30 spots left',
    why: 'A large group shift with plenty of open spots this Saturday.',
    address: '441 E 10th St',
    distance: 4.9,
    travelMin: 16,
    transit: 'bus route 8 stops two blocks south',
    minAge: 13,
    groupShift: true,
    countsForSchool: true,
    window: 'Saturday morning',
    badgeRow: ['59% match', 'Vetted org', 'Ages 13+', 'Group shift'],
    description:
      'Build ready-to-ship comfort kits for families displaced by fire or flood. Straightforward assembly work in a warehouse bay with a large crew.',
    safety: ['Staff lead per bay', 'Never a solo shift', 'Closed-toe shoes required'],
    roles: [{ id: 'r-kit', t: 'Assembly crew', m: '3 hrs · no training · ages 13+', minAge: 13 }],
    shifts: [{ id: 'sh-rc9', d: 'Sat, Aug 9', t: '9:00 AM–12:00 PM', tLong: '9:00 AM to 12:00 PM', cap: 30, taken: 18 }],
    replyTime: 'The Red Cross usually replies within three days.',
  },
];

/* ---- student-led projects (peer feed) ----------------------------------- */
export const peerProjects = [
  { id: 'pp1', t: 'Saturday Reading Circle', lead: 'Led by Eli F. · Grade 11', leadName: 'Eli Fisch', org: 'Indy Public Library', cause: 'Education', crewFilled: 9, crewCap: 12, next: 'Sat 10:00 AM · Branch 4', slot: 'pp1', img: PEXELS.reading, role: 'Tutor', cta: 'Open your project', mine: true, projectId: 'proj-reading' },
  { id: 'pp2', t: 'Northside Food Drive', lead: 'Led by Priya N. · Grade 12', leadName: 'Priya Nair', org: 'Gleaners Food Bank', cause: 'Food', crewFilled: 14, crewCap: 20, next: 'Aug 6 · school drop-off', slot: 'pp2', img: PEXELS.food, role: 'Collections', cta: 'Request a spot' },
  { id: 'pp3', t: 'Creek Trail Restoration', lead: 'Led by Marcus O. · Grade 11', leadName: 'Marcus Odom', org: 'Keep Indianapolis Beautiful', cause: 'Environment', crewFilled: 6, crewCap: 15, next: 'Sun 9:00 AM · Broad Ripple', slot: 'pp3', img: PEXELS.trail, role: 'Planting', cta: 'Request a spot' },
  { id: 'pp4', t: 'Senior Tech Help Desk', lead: 'Led by Ava L. · Grade 10', leadName: 'Ava Lindqvist', org: 'Nora Community Center', cause: 'Seniors', crewFilled: 4, crewCap: 8, next: 'Thu 4:00 PM · Nora', slot: 'pp4', img: PEXELS.seniors, role: 'Coach', cta: 'Request a spot' },
  { id: 'pp5', t: 'Shelter Supply Sort', lead: 'Led by Deven A. · Grade 12', leadName: 'Deven Achebe', org: 'Wheeler Mission', cause: 'Homelessness', crewFilled: 11, crewCap: 16, next: 'Sat 1:00 PM · downtown', slot: 'pp5', img: PEXELS.shelter, role: 'Sorting', cta: 'Request a spot' },
  { id: 'pp6', t: 'ESL Homework Club', lead: 'Led by Nadia H. · Grade 11', leadName: 'Nadia Haddad', org: 'Lawrence Township Schools', cause: 'Education', crewFilled: 5, crewCap: 10, next: 'Tue 4:00 PM · Lawrence', slot: 'pp6', img: PEXELS.reading2, role: 'Tutor', cta: 'Request a spot' },
  { id: 'pp7', t: 'Winter Coat Collection', lead: 'Led by Owen B. · Grade 10', leadName: 'Owen Blake', org: 'Wheeler Mission', cause: 'Homelessness', crewFilled: 8, crewCap: 18, next: 'Aug 12 · four school sites', slot: 'pp7', img: PEXELS.shelter, role: 'Collections', cta: 'Request a spot' },
  { id: 'pp8', t: 'Shelter Dog Photo Day', lead: 'Led by Kai T. · Grade 12', leadName: 'Kai Tran', org: 'Indianapolis Humane Society', cause: 'Animals', crewFilled: 3, crewCap: 6, next: 'Sat 11:00 AM · Michigan Rd', slot: 'pp8', img: PEXELS.outdoor, role: 'Photos', cta: 'Request a spot' },
];

/* ---- home dashboard ------------------------------------------------------ */
export const suggestedIds = ['opp-food-dist', 'opp-reading-buddies', 'opp-trail'];

export const upcoming = [
  { id: 'up1', t: 'Saturday Food Distribution', m: 'Sat, Aug 1 · 1:00 PM · Gleaners', tag: 'Check-in opens 12:45', oppId: 'opp-food-dist', shiftId: 'sh-a1' },
  { id: 'up2', t: 'Reading Buddies', m: 'Sun, Aug 2 · 10:00 AM · Branch 4', tag: 'Bring your library card', oppId: 'opp-reading-buddies', shiftId: 'sh-r2' },
];

/* ---- my project workspace ------------------------------------------------ */
export const myProject = {
  id: 'proj-reading',
  name: 'Saturday Reading Circle',
  status: 'LIVE',
  cause: 'Education',
  site: 'Indy Public Library, Branch 4',
  siteShort: 'Branch 4 community room',
  cadence: 'Saturdays 10:00 AM',
  termWeeks: 8,
  eventsHosted: 11,
  approxVolunteers: 140,
  createdLabel: 'created Jul 12',
  mission:
    'Weekly reading practice for K-3 students at Branch 4, run by high schoolers who show up every Saturday.',
  bio: 'Nine tutors, one hour of reading per child, snacks after. No experience needed and we train you the first week.',
  cover: PEXELS.reading2,
  visibility: 'My school and nearby',
  audience: ['High school', 'First timers welcome'],
  website: '',
  checkinCode: '4820',
  recruitLink: 'https://volunteeru.app/p/saturday-reading-circle',
  leadHours: { planning: 3.0, sessions: 2.5, recruiting: 1.0 },
  sponsor: {
    name: 'Indy Public Library',
    verified: true,
    since: 'since 1873',
    contact: 'R. Whitfield',
    roomBookedTo: 'Oct 25',
    insurance: 'On file',
    slug: 'vu-sponsor',
    lastReview: 'Jul 26',
    rating: 'Strong',
    renewal: 'Recommended',
  },
  nextSession: {
    label: 'Saturday, Aug 9 · 10:00 AM',
    meta: 'Branch 4 community room · 8 of 9 seats staffed · check-in code 4820',
    confirmed: 8,
    pending: 2,
    materials: 'Ready',
    setting: 'Indoor',
  },
  screeningQuestions: [
    'Why this project?',
    'Which Saturdays can you commit to?',
    'Any experience with kids or reading?',
  ],
  rules: [
    'Auto-accept from North Central HS',
    'Guardian consent required under 16',
    'Training booked on accept',
  ],
  documents: [
    { t: 'Safety plan', v: 'Approved', tone: 'ok' },
    { t: 'Room agreement', v: 'Signed', tone: 'ok' },
    { t: 'Consent forms', v: '7 of 9', tone: 'warn' },
  ],
  reminders: [
    { l: 'Crew text', v: '2 days before' },
    { l: 'Guardian email', v: '1 week before' },
    { l: 'Sponsor digest', v: 'Mondays' },
  ],
  debrief: {
    worked: 'Two tables instead of one. Kids stayed engaged the whole hour.',
    fix: 'Six more early reader books and one extra tutor at 10:30.',
  },
  coleads: [],
};

export const projectTasks = [
  { id: 'tk1', t: 'Get sponsor sign-off from Indy Public Library', done: true },
  { id: 'tk2', t: 'Book Branch 4 community room (Sat, 10–12)', done: true },
  { id: 'tk3', t: 'Recruit 8 tutors', done: false },
  { id: 'tk4', t: 'Submit safety plan for under-16 volunteers', done: false },
  { id: 'tk5', t: 'Set shift roles and check-in code', done: false },
];

export const positions = [
  { id: 'pos-tutor', t: 'Tutor', slots: 8, filledCount: 5, age: '15+', minAge: 15, train: 'Required · 30 min', commit: '2 hrs weekly', open: true, note: 'Reading level K-3', requirements: ['Guardian consent', 'Reading training'] },
  { id: 'pos-checkin', t: 'Check-in lead', slots: 1, filledCount: 1, age: '16+', minAge: 16, train: 'Required · 45 min', commit: '2.5 hrs weekly', open: false, note: 'Runs the roster and QR check-in', requirements: ['Guardian consent'] },
  { id: 'pos-supply', t: 'Supply lead', slots: 1, filledCount: 1, age: '16+', minAge: 16, train: 'None', commit: '1 hr weekly', open: false, note: 'Books materials with the library', requirements: [] },
  { id: 'pos-photo', t: 'Photographer', slots: 1, filledCount: 0, age: '13+', minAge: 13, train: 'None', commit: '1 hr monthly', open: true, note: 'Media release required', requirements: ['Media release'] },
  { id: 'pos-snack', t: 'Snack coordinator', slots: 2, filledCount: 2, age: '13+', minAge: 13, train: 'Food handling', commit: '1 hr weekly', open: false, note: 'Allergy list on file', requirements: ['Food handling'] },
];

export const sessions = [
  { id: 'ses-a9', d: 'Sat, Aug 9', t: '10:00 AM - 12:00 PM', loc: 'Branch 4 community room', cap: 9, filledCount: 8, st: 'Staffed', posted: false },
  { id: 'ses-a16', d: 'Sat, Aug 16', t: '10:00 AM - 12:00 PM', loc: 'Branch 4 community room', cap: 9, filledCount: 6, st: 'Needs', posted: false },
  { id: 'ses-a23', d: 'Sat, Aug 23', t: '10:00 AM - 12:00 PM', loc: 'Branch 4 community room', cap: 9, filledCount: 4, st: 'Needs', posted: false },
  { id: 'ses-a30', d: 'Sat, Aug 30', t: '10:00 AM - 12:00 PM', loc: 'Branch 4 community room', cap: 9, filledCount: 2, st: 'Open', posted: false },
  { id: 'ses-s6', d: 'Sat, Sep 6', t: '10:00 AM - 12:00 PM', loc: 'Branch 4 community room', cap: 9, filledCount: 0, st: 'Draft', posted: false },
];

export const crmPeople = [
  { id: 'per-maya', n: 'Maya Rodriguez', short: 'Maya R.', s: 'North Central HS · Grade 11', school: 'North Central HS', grade: 11, role: 'Supply lead', positionId: 'pos-supply', st: 'Active', hrs: 14.0, last: 'Jul 27', tags: ['Reliable', 'Driver'], slug: 'p-maya', consent: true, trained: true, notes: [] },
  { id: 'per-deven', n: 'Deven Achebe', short: 'Deven A.', s: 'North Central HS · Grade 12', school: 'North Central HS', grade: 12, role: 'Check-in', positionId: 'pos-checkin', st: 'Active', hrs: 11.5, last: 'Jul 26', tags: ['Trained'], slug: 'p-deven', consent: true, trained: true, notes: [] },
  { id: 'per-sofia', n: 'Sofia Kaur', short: 'Sofia K.', s: 'Broad Ripple HS · Grade 10', school: 'Broad Ripple HS', grade: 10, role: 'Tutor', positionId: 'pos-tutor', st: 'Active', hrs: 9.0, last: 'Jul 25', tags: ['Spanish'], slug: 'p-sofia', consent: true, trained: true, notes: [] },
  { id: 'per-jonah', n: 'Jonah Park', short: 'Jonah P.', s: 'North Central HS · Grade 11', school: 'North Central HS', grade: 11, role: 'Tutor', positionId: 'pos-tutor', st: 'Onboarding', hrs: 0.0, last: 'Jul 24', tags: ['Consent sent'], slug: 'p-jonah', consent: true, trained: false, notes: [] },
  { id: 'per-amara', n: 'Amara Tesfaye', short: 'Amara T.', s: 'Lawrence North HS · Grade 9', school: 'Lawrence North HS', grade: 9, role: 'Photos', positionId: 'pos-photo', st: 'Invited', hrs: 0.0, last: 'Jul 22', tags: ['Under 16'], slug: 'p-amara', consent: false, trained: false, notes: [] },
  { id: 'per-iris', n: 'Iris Bennett', short: 'Iris B.', s: 'Broad Ripple HS · Grade 12', school: 'Broad Ripple HS', grade: 12, role: 'Tutor', positionId: 'pos-tutor', st: 'Waitlist', hrs: 0.0, last: 'Jul 21', tags: ['Sundays only'], slug: 'p-iris', consent: true, trained: false, notes: [] },
  { id: 'per-theo', n: 'Theo Marsh', short: 'Theo M.', s: 'North Central HS · Grade 10', school: 'North Central HS', grade: 10, role: 'Tutor', positionId: 'pos-tutor', st: 'Active', hrs: 6.0, last: 'Jul 20', tags: ['Math'], slug: 'p-theo', consent: true, trained: true, notes: [] },
  { id: 'per-nina', n: 'Nina Oyelaran', short: 'Nina O.', s: 'Lawrence North HS · Grade 11', school: 'Lawrence North HS', grade: 11, role: 'Snacks', positionId: 'pos-snack', st: 'Inactive', hrs: 3.0, last: 'Jun 14', tags: ['Follow up'], slug: 'p-nina', consent: true, trained: true, notes: [] },
  { id: 'per-ruth', n: 'Ruth Delgado', short: 'Ruth D.', s: 'Broad Ripple HS · Grade 11', school: 'Broad Ripple HS', grade: 11, role: 'Snacks', positionId: 'pos-snack', st: 'Active', hrs: 4.5, last: 'Jul 19', tags: ['Allergy list'], slug: 'p-ruth', consent: true, trained: true, notes: [] },
  { id: 'per-sam', n: 'Sam Whitaker', short: 'Sam W.', s: 'North Central HS · Grade 12', school: 'North Central HS', grade: 12, role: 'Tutor', positionId: 'pos-tutor', st: 'Active', hrs: 5.5, last: 'Jul 26', tags: ['Reliable'], slug: 'p-sam', consent: true, trained: true, notes: [] },
  { id: 'per-lena', n: 'Lena Hoffmann', short: 'Lena H.', s: 'Lawrence North HS · Grade 10', school: 'Lawrence North HS', grade: 10, role: 'Tutor', positionId: 'pos-tutor', st: 'Waitlist', hrs: 0.0, last: 'Jul 18', tags: ['Mornings only'], slug: 'p-lena', consent: false, trained: false, notes: [] },
  { id: 'per-omar', n: 'Omar Haddad', short: 'Omar H.', s: 'North Central HS · Grade 9', school: 'North Central HS', grade: 9, role: 'Tutor', positionId: 'pos-tutor', st: 'Onboarding', hrs: 0.0, last: 'Jul 17', tags: ['Under 16'], slug: 'p-omar', consent: false, trained: false, notes: [] },
  { id: 'per-cleo', n: 'Cleo Barnes', short: 'Cleo B.', s: 'Broad Ripple HS · Grade 11', school: 'Broad Ripple HS', grade: 11, role: 'Tutor', positionId: 'pos-tutor', st: 'Active', hrs: 5.0, last: 'Jul 26', tags: ['Reliable'], slug: 'p-cleo', consent: true, trained: true, notes: [] },
  { id: 'per-wes', n: 'Wes Nakamura', short: 'Wes N.', s: 'North Central HS · Grade 10', school: 'North Central HS', grade: 10, role: 'Tutor', positionId: 'pos-tutor', st: 'Waitlist', hrs: 0.0, last: 'Jul 15', tags: ['Sundays only'], slug: 'p-wes', consent: true, trained: false, notes: [] },
];

export const projectApplications = [
  { id: 'app-priya', n: 'Priya Nair', s: 'North Central HS · Grade 12', school: 'North Central HS', grade: 12, role: 'Tutor', positionId: 'pos-tutor', when: '2 hours ago', ts: 2, note: 'Tutored at a summer camp. Free every Saturday until November.', slug: 'a-priya', flags: ['Consent on file', 'Trained elsewhere'], status: 'pending', answers: ['I loved the camp I helped at and want to keep going.', 'Every Saturday until November.', 'Two summers of camp tutoring.'] },
  { id: 'app-marcus', n: 'Marcus Odom', s: 'Broad Ripple HS · Grade 11', school: 'Broad Ripple HS', grade: 11, role: 'Tutor', positionId: 'pos-tutor', when: 'Yesterday', ts: 26, note: 'Wants hours for the civic scholarship. Can bring two friends.', slug: 'a-marcus', flags: ['Needs training'], status: 'pending', answers: ['I need hours for the civic scholarship and I like this one.', 'Most Saturdays, not Aug 23.', 'No, but I coach my little brother.'] },
  { id: 'app-ava', n: 'Ava Lindqvist', s: 'Lawrence North HS · Grade 10', school: 'Lawrence North HS', grade: 10, role: 'Photographer', positionId: 'pos-photo', when: 'Yesterday', ts: 30, note: 'Runs the yearbook camera team.', slug: 'a-ava', flags: ['Media release pending'], status: 'pending', answers: ['I want portfolio work that means something.', 'One Saturday a month.', 'Not with kids, but I shoot the yearbook.'] },
  { id: 'app-ben', n: 'Ben Ortiz', s: 'North Central HS · Grade 9', school: 'North Central HS', grade: 9, role: 'Tutor', positionId: 'pos-tutor', when: '2 days ago', ts: 50, note: 'First time volunteering. Asked about a ride from school.', slug: 'a-ben', flags: ['Under 15', 'Transport needed'], status: 'pending', answers: ['My sister learned to read here.', 'All of them if I can get a ride.', 'No experience yet.'] },
];

export const attendanceSessions = [
  { id: 'att-a2', d: 'Sat, Aug 2', m: '9 of 9 present · posted', posted: true },
  { id: 'att-j26', d: 'Sat, Jul 26', m: '8 of 9 present · posted', posted: true },
  { id: 'att-j19', d: 'Sat, Jul 19', m: 'Taking attendance now', posted: false },
];

export const attendees = [
  { personId: 'per-maya', n: 'Maya Rodriguez', role: 'Supply lead', slug: 'p-maya', st: 'Present', inOut: '9:52 AM to 12:06 PM', hrs: 2.2, grade: 'Exceptional', note: 'Ran the whole supply table without being asked.' },
  { personId: 'per-deven', n: 'Deven Achebe', role: 'Check-in', slug: 'p-deven', st: 'Present', inOut: '9:48 AM to 12:04 PM', hrs: 2.3, grade: 'Strong', note: 'Check-in desk cleared in ten minutes.' },
  { personId: 'per-sofia', n: 'Sofia Kaur', role: 'Tutor', slug: 'p-sofia', st: 'Late', inOut: '10:22 AM to 12:00 PM', hrs: 1.6, grade: 'Strong', note: 'Bus was delayed, texted ahead.' },
  { personId: 'per-theo', n: 'Theo Marsh', role: 'Tutor', slug: 'p-theo', st: 'Present', inOut: '9:58 AM to 12:02 PM', hrs: 2.1, grade: 'Solid', note: 'Good with the younger group.' },
  { personId: 'per-jonah', n: 'Jonah Park', role: 'Tutor', slug: 'p-jonah', st: 'Absent', inOut: 'No check-in', hrs: 0.0, grade: 'Not scored', note: 'Excused, family trip. Second miss this term.' },
  { personId: 'per-nina', n: 'Nina Oyelaran', role: 'Snacks', slug: 'p-nina', st: 'Present', inOut: '10:04 AM to 11:30 AM', hrs: 1.4, grade: 'Needs support', note: 'Left early, wants a shorter role next week.' },
];

export const hoursQueue = [
  { id: 'hq1', personId: 'per-maya', n: 'Maya Rodriguez', d: 'Jul 26 · 10:02 AM - 12:04 PM', hrs: 2.0, src: 'Auto check-in · on site', ok: true, status: 'pending' },
  { id: 'hq2', personId: 'per-deven', n: 'Deven Achebe', d: 'Jul 26 · 9:48 AM - 12:10 PM', hrs: 2.4, src: 'Auto check-in · on site', ok: true, status: 'pending' },
  { id: 'hq3', personId: 'per-sofia', n: 'Sofia Kaur', d: 'Jul 26 · 10:15 AM - 11:40 AM', hrs: 1.4, src: 'Manual · left early', ok: false, status: 'pending' },
  { id: 'hq4', personId: 'per-theo', n: 'Theo Marsh', d: 'Jul 19 · 10:00 AM - 12:00 PM', hrs: 2.0, src: 'Auto check-in · on site', ok: true, status: 'pending' },
];

export const reliability = [
  { n: 'Maya Rodriguez', slug: 'p-maya', show: '100%', late: '0', score: 'Exceptional', trend: 'Steady', bg: '#EAF3EC', color: '#3F6B4E' },
  { n: 'Deven Achebe', slug: 'p-deven', show: '100%', late: '1', score: 'Strong', trend: 'Steady', bg: '#EAF3EC', color: '#3F6B4E' },
  { n: 'Sofia Kaur', slug: 'p-sofia', show: '92%', late: '2', score: 'Strong', trend: 'Improving', bg: '#FDF3E7', color: '#8A5A20' },
  { n: 'Jonah Park', slug: 'p-jonah', show: '67%', late: '0', score: 'Not scored', trend: 'Two misses', bg: '#F5E7E0', color: '#A8482A' },
  { n: 'Nina Oyelaran', slug: 'p-nina', show: '80%', late: '1', score: 'Needs support', trend: 'Watch', bg: '#FDF3E7', color: '#8A5A20' },
];

export const compliance = [
  { id: 'cp1', t: 'Guardian consent on file', v: '7 of 9', st: 'Action needed', bg: '#FDF3E7', color: '#8A5A20' },
  { id: 'cp2', t: 'Reading training complete', v: '6 of 8 tutors', st: 'Action needed', bg: '#FDF3E7', color: '#8A5A20' },
  { id: 'cp3', t: 'Media releases', v: '9 of 9', st: 'Clear', bg: '#EAF3EC', color: '#3F6B4E' },
  { id: 'cp4', t: 'Sponsor staff present each session', v: '3 of 3', st: 'Clear', bg: '#EAF3EC', color: '#3F6B4E' },
  { id: 'cp5', t: 'Two-adult rule', v: 'Every session', st: 'Clear', bg: '#EAF3EC', color: '#3F6B4E' },
  { id: 'cp6', t: 'Safety plan version', v: 'v3 · approved Jul 12', st: 'Clear', bg: '#EAF3EC', color: '#3F6B4E' },
];

export const escalations = [
  { id: 'es1', n: 'Jonah Park', personId: 'per-jonah', step: 'Second miss', action: 'Automatic check-in message sent, lead follow up required', due: 'Today', resolved: false },
  { id: 'es2', n: 'Nina Oyelaran', personId: 'per-nina', step: 'Early leave', action: 'Offer a shorter role or a different position', due: 'Before Aug 9', resolved: false },
];

export const incidents = [
  { id: 'in1', d: 'Jul 26', t: 'Scraped knee at the supply table', who: 'Logged by Maya R.', st: 'Closed', note: 'First aid from library staff, guardian notified same day.' },
  { id: 'in2', d: 'Jul 12', t: 'Room double booked', who: 'Logged by Eli F.', st: 'Closed', note: 'Moved to the annex, sponsor updated the calendar.' },
];

export const disputes = [
  { id: 'dp1', n: 'Sofia Kaur', personId: 'per-sofia', d: 'Jul 19', claim: 'Says she stayed until 12:20, log shows 12:00', st: 'Open', action: 'Compare geofence exit with sponsor sign-out sheet' },
];

export const auditLog = [
  { id: 'au1', t: 'Hours edited for Nina O. from 1.6 to 1.4', who: 'Eli F.', w: 'Jul 19 · reason: left early' },
  { id: 'au2', t: 'Attendance posted to 6 student profiles', who: 'Eli F.', w: 'Jul 19' },
  { id: 'au3', t: 'Score changed for Sofia K. from Solid to Strong', who: 'Eli F.', w: 'Jul 19 · reason: covered a second table' },
  { id: 'au4', t: 'Consent form received for Jonah P.', who: 'System', w: 'Jul 24' },
  { id: 'au5', t: 'Safety plan v3 approved', who: 'R. Whitfield · sponsor', w: 'Jul 12' },
];

export const activity = [
  { id: 'ac1', t: 'Priya Nair applied for Tutor', w: '2h' },
  { id: 'ac2', t: 'Deven Achebe checked out of Aug 2 session', w: '1d' },
  { id: 'ac3', t: 'Branch 4 confirmed the room through October', w: '2d' },
  { id: 'ac4', t: 'Guardian consent received for Jonah Park', w: '3d' },
  { id: 'ac5', t: 'Safety plan approved by sponsor', w: '4d' },
];

export const threads = [
  {
    id: 't-crew',
    n: 'Crew announcements',
    p: 'Reminder: bring your library card Saturday.',
    when: '2h',
    unread: 0,
    members: 9,
    repliesOff: true,
    messages: [
      { id: 'm1', body: 'Reminder: bring your library card Saturday. Check-in opens at 9:45 and the code is 4820.', who: 'me', when: 'Jul 28 · 4:10 PM' },
      { id: 'm2', body: 'Two tutor spots opened for Aug 23. Share the recruit link if you know someone.', who: 'me', when: 'Jul 29 · 9:02 AM' },
    ],
  },
  {
    id: 't-alvarez',
    n: 'Ms. Alvarez · counselor',
    p: 'Sent the roster for hour approval.',
    when: '1d',
    unread: 1,
    members: 2,
    repliesOff: false,
    messages: [
      { id: 'm1', body: 'Sent the roster for hour approval. Let me know if the June totals look right.', who: 'them', whoName: 'Ms. Alvarez', when: 'Jul 28 · 11:20 AM' },
    ],
  },
  {
    id: 't-branch',
    n: 'Branch 4 · sponsor',
    p: 'Room is confirmed through October.',
    when: '2d',
    unread: 0,
    members: 3,
    repliesOff: false,
    messages: [
      { id: 'm1', body: 'Room is confirmed through October. The annex is your backup if we double book again.', who: 'them', whoName: 'R. Whitfield', when: 'Jul 27 · 2:40 PM' },
      { id: 'm2', body: 'Perfect, thank you. I will put the annex on the crew note.', who: 'me', when: 'Jul 27 · 3:05 PM' },
    ],
  },
  {
    id: 't-jonah',
    n: 'Jonah Park',
    p: 'Consent form is signed, when do I start?',
    when: '3d',
    unread: 2,
    members: 2,
    repliesOff: false,
    messages: [
      { id: 'm1', body: 'Consent form is signed, when do I start?', who: 'them', whoName: 'Jonah Park', when: 'Jul 26 · 6:12 PM' },
      { id: 'm2', body: 'Also I can do Aug 16 but not Aug 23.', who: 'them', whoName: 'Jonah Park', when: 'Jul 26 · 6:13 PM' },
    ],
  },
];

export const messageTemplates = [
  { id: 'mt1', t: 'Session reminder', body: 'Reminder: we meet Saturday at 10:00 at Branch 4. Check-in opens at 9:45 and the code is 4820.' },
  { id: 'mt2', t: 'Open spots', body: 'We have open tutor spots this week. Share the recruit link with anyone who might want one.' },
  { id: 'mt3', t: 'Thank you', body: 'Great session today. Hours are posted to your records already. See you next Saturday.' },
  { id: 'mt4', t: 'Weather cancellation', body: 'Session is cancelled for weather. No hours are affected and we resume next week.' },
];

export const settingsRows = [
  { id: 'set-auto', t: 'Auto-approve applications from my school', v: 'On', on: true },
  { id: 'set-consent', t: 'Require guardian consent under 16', v: 'Required', on: true, locked: true },
  { id: 'set-public', t: 'Show project in the public feed', v: 'On', on: true },
  { id: 'set-invite', t: 'Allow crew to invite friends', v: 'On', on: true },
  { id: 'set-digest', t: 'Send weekly digest to sponsor', v: 'Mondays', on: true },
  { id: 'set-archive', t: 'Archive project after final session', v: 'Off', on: false },
];

/* ---- my record ----------------------------------------------------------- */
export const orgApplications = [
  { id: 'oa1', n: 'Gleaners Food Bank', role: 'Saturday distribution crew', st: 'Accepted', when: 'Jul 20', slug: 'app-gleaners', verified: true, oppId: 'opp-food-dist' },
  { id: 'oa2', n: 'Keep Indianapolis Beautiful', role: 'Trail restoration volunteer', st: 'In review', when: 'Jul 26', slug: 'app-kib', verified: true, oppId: 'opp-trail' },
  { id: 'oa3', n: 'Wheeler Mission', role: 'Supply sort, weekday evenings', st: 'Submitted', when: 'Jul 28', slug: 'app-wheeler', verified: true, oppId: 'opp-shelter-sort' },
  { id: 'oa4', n: 'Northside Food Drive', role: 'Collections, student led', st: 'Accepted', when: 'Jul 14', slug: 'app-drive', verified: false, peerId: 'pp2' },
];

export const causeBars = [
  { name: 'Civic engagement', n: 31, c: '#C2603C' },
  { name: 'Food & hunger', n: 24, c: '#D2775B' },
  { name: 'Education', n: 19, c: '#E0A188' },
  { name: 'Environment', n: 12, c: '#EFCDBC' },
];

export const myAttendance = [
  { id: 'ma1', d: 'Jul 26', p: 'Food Distribution', st: 'On time', hrs: '4.0', grade: 'Exceptional' },
  { id: 'ma2', d: 'Jul 18', p: 'Park Cleanup', st: 'On time', hrs: '3.0', grade: 'Strong' },
  { id: 'ma3', d: 'Jul 11', p: 'Voter Registration', st: 'Late 8 min', hrs: '2.5', grade: 'Solid' },
  { id: 'ma4', d: 'Jul 6', p: 'Reading Buddies', st: 'On time', hrs: '2.0', grade: 'Strong' },
];

export const leadFeedback = [
  { id: 'lf1', who: 'R. Whitfield · Indy Public Library', when: 'Jul 26', t: 'Eli set up the room before anyone arrived and ran the tutor briefing himself.', slug: 'fb-whitfield' },
  { id: 'lf2', who: 'D. Cruz · Gleaners Food Bank', when: 'Jul 24', t: 'Carried the line for three hours without a break. Ask him back.', slug: 'fb-cruz' },
];

export const recent = [
  { id: 'rc1', name: 'Food Distribution', org: 'Gleaners Food Bank', date: 'Jul 24', hrs: '4.0' },
  { id: 'rc2', name: 'Park Cleanup', org: 'Keep Indianapolis Beautiful', date: 'Jul 18', hrs: '3.0' },
  { id: 'rc3', name: 'Voter Registration Table', org: 'Civic Indiana', date: 'Jul 11', hrs: '2.5' },
  { id: 'rc4', name: 'Reading Buddies', org: 'Indy Public Library', date: 'Jul 6', hrs: '2.0' },
];

export const serviceHistory = [
  ...recent,
  { id: 'rc5', name: 'Shelter Supply Sort', org: 'Wheeler Mission', date: 'Jun 28', hrs: '2.5' },
  { id: 'rc6', name: 'Food Distribution', org: 'Gleaners Food Bank', date: 'Jun 21', hrs: '3.0' },
  { id: 'rc7', name: 'Reading Buddies', org: 'Indy Public Library', date: 'Jun 14', hrs: '2.0' },
  { id: 'rc8', name: 'Voter Registration Table', org: 'Civic Indiana', date: 'Jun 6', hrs: '3.0' },
  { id: 'rc9', name: 'Creek Trail Restoration', org: 'Keep Indianapolis Beautiful', date: 'May 24', hrs: '3.0' },
  { id: 'rc10', name: 'Food Distribution', org: 'Gleaners Food Bank', date: 'May 17', hrs: '4.0' },
  { id: 'rc11', name: 'Voter Registration Table', org: 'Civic Indiana', date: 'May 3', hrs: '2.5' },
  { id: 'rc12', name: 'Park Cleanup', org: 'Keep Indianapolis Beautiful', date: 'Apr 26', hrs: '3.0' },
  { id: 'rc13', name: 'Voter Registration Table', org: 'Civic Indiana', date: 'Apr 12', hrs: '3.0' },
  { id: 'rc14', name: 'Reading Buddies', org: 'Indy Public Library', date: 'Apr 5', hrs: '2.0' },
];

export const badges = [
  { id: 'b25', t: '25 hours', s: 'Earned Apr 2', on: true, need: 25, kind: 'hours' },
  { id: 'b50', t: '50 hours', s: 'Earned Jun 9', on: true, need: 50, kind: 'hours' },
  { id: 'b5org', t: '5 organizations', s: 'Earned Jul 18', on: true, need: 5, kind: 'orgs' },
  { id: 'b3cause', t: '3 cause areas', s: 'Earned May 21', on: true, need: 3, kind: 'causes' },
  { id: 'b100', t: '100 hours', s: '14 hrs to go', on: false, need: 100, kind: 'hours' },
  { id: 'blead', t: 'Project lead', s: 'Run 1 project', on: false, need: 1, kind: 'projects' },
];

export const monthly = [
  { m: 'Aug', h: 4 }, { m: 'Sep', h: 6 }, { m: 'Oct', h: 9 }, { m: 'Nov', h: 5 },
  { m: 'Dec', h: 8 }, { m: 'Jan', h: 7 }, { m: 'Feb', h: 6 }, { m: 'Mar', h: 11 },
  { m: 'Apr', h: 9 }, { m: 'May', h: 7 }, { m: 'Jun', h: 2 }, { m: 'Jul', h: 12 },
];

/* ---- notifications ------------------------------------------------------- */
export const notifications = [
  { id: 'nt1', t: 'Gleaners accepted your application', b: 'Saturday distribution crew · Sat, Aug 1', when: '2h', read: false, tone: 'ok', to: { path: '/opportunity/opp-food-dist' } },
  { id: 'nt2', t: 'Priya Nair applied for Tutor', b: 'Saturday Reading Circle · review when you can', when: '2h', read: false, tone: 'brand', to: { path: '/lead/proj-reading/applications' } },
  { id: 'nt3', t: '3 hour logs need approval', b: 'One is flagged as an early leave', when: '1d', read: false, tone: 'warn', to: { path: '/lead/proj-reading/hours' } },
  { id: 'nt4', t: 'Branch 4 confirmed the room through October', b: 'Sponsor update from R. Whitfield', when: '2d', read: true, tone: 'ok', to: { path: '/lead/proj-reading/overview' } },
  { id: 'nt5', t: 'Reading Buddies starts in 3 days', b: 'Sun, Aug 2 · 10:00 AM · bring your library card', when: '3d', read: true, tone: 'brand', to: { path: '/opportunity/opp-reading-buddies' } },
];

/* ---- initial state factory ---------------------------------------------- */
export function makeInitialState() {
  return {
    session: { authed: false, email: '', signedInAt: null, remember: true },
    account: {
      id: 'me',
      firstName: 'Eli',
      lastName: 'Fisch',
      name: 'Eli Fisch',
      email: 'eli.fisch@example.edu',
      phone: '(317) 555-0148',
      grade: 11,
      age: 16,
      school: 'North Central HS',
      city: 'Indianapolis, IN',
      zip: '46220',
      avatar: face('vu-prof_avatar'),
      guardianEmail: 'consent on file',
      guardianConsent: true,
      counselor: { name: 'Ms. Alvarez', access: true, lastChecked: 'Jul 25' },
      bio: '',
    },
    prefs: {
      causes: [],
      windows: [],
      radius: 5,
      hoursGoal: 40,
      goalDeadline: 'June 1',
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
    onboarding: { completed: false, step: 1, intent: 'start', firstName: 'Eli', zip: '46220', draft: {} },
    opportunities,
    peerProjects,
    saved: ['opp-reading-buddies', 'opp-trail', 'opp-senior-tech', 'opp-garden'],
    friendsGoing: ['opp-trail', 'opp-food-dist'],
    stats: {
      verifiedHours: 86,
      events: 14,
      orgs: 6,
      causes: 4,
      leadershipHours: 6.5,
      thisMonth: 12,
      bestMonth: 19,
      avgShift: 3.1,
      pendingVerification: 0,
      activeWeeks: 11,
      currentStreak: 6,
      showRate: 92,
      onTime: 84,
      averageScore: 'Strong',
      hoursGenerated: 54,
      recruited: 9,
    },
    requirement: {
      termDone: 26,
      termGoal: 40,
      yearCounted: 40,
      yearGoal: 40,
      deadline: 'June 1',
      counselor: 'Ms. Alvarez',
      lastConfirmed: 'Jul 25',
    },
    applications: orgApplications.map((a) => ({ ...a })),
    bookings: [
      { id: 'bk1', oppId: 'opp-food-dist', shiftId: 'sh-a1', roleId: 'r-pack', status: 'confirmed', checkedIn: false, checkedOut: false },
      { id: 'bk2', oppId: 'opp-reading-buddies', shiftId: 'sh-r2', roleId: 'r-tutor', status: 'confirmed', checkedIn: false, checkedOut: false },
    ],
    hoursLog: serviceHistory.map((r) => ({ ...r, verified: true })),
    myAttendance,
    leadFeedback,
    badges,
    causeBars,
    projects: [
      {
        ...myProject,
        tasks: projectTasks,
        positions,
        sessions,
        people: crmPeople,
        applications: projectApplications,
        attendanceSessions,
        attendance: { 'att-j19': attendees.map((a) => ({ ...a })) },
        hoursQueue,
        compliance,
        escalations,
        incidents,
        disputes,
        auditLog,
        activity,
        threads,
        settings: settingsRows,
        archived: false,
      },
    ],
    activeProjectId: 'proj-reading',
    drafts: { create: null, apply: {} },
    notifications,
    recentSearches: [],
    ui: { discoverView: 'list', leadTab: 'overview', openCard: 'hours', showTrustRow: true, heroProofPill: true, tips: {} },
    meta: { firstRun: true, installedAt: null, lastSeen: null },
  };
}
