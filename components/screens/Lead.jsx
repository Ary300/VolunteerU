'use client';

/* ==========================================================================
   Lead.jsx, design screen: `isLead` (project workspace)
   Shell, tab bar, and the Overview / People / Positions / Shifts tabs.
   ========================================================================== */

import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, EmptyState, Field, Select, Chip, Avatar, Icon, Checkbox } from '../ui.jsx';
import { useSnapshot, update as updateStore } from '../../lib/store.js';
import { isPastShift, shiftDates, parseTimeRange } from '../../lib/calendar.js';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import CrossApplications from '../CrossApplications.jsx';
import TasksTab from '../lead/TasksTab.jsx';
import PipelineTab from '../lead/PipelineTab.jsx';
import AnnouncementBoard from '../AnnouncementBoard.jsx';
import {
  getProject, taskProgress, toggleTask, pendingApplications, pendingHours,
  positionLabel, positionAppsLabel, sessionStatus, sessionTone, shortSessions, filterPeople,
  PERSON_TONE, tone, copyText, upsertPosition, duplicatePosition, deletePosition,
  upsertSession, deleteSession, repeatWeekly, regenerateCode, setReminder, addPerson, updatePerson,
  removePerson, addNote, rosterCSV, download, setActiveProject, projects as allProjects,
  isTeam, orgTypeLabel, taskStats, taskRoles, tasksOf, roleOf, pipelineFor,
  requestProjectVerification, parseSessionDate, formatSessionDate, uid, shortName,
} from '../../lib/db.js';
import { loadOwnerApplications, loadListingThreads, myShiftSignUps, shiftSignUpCount, setMemberAssignment } from '../../lib/listings.js';
import {
  AttendanceTab, ApplicationsTab, HoursTab, QualityTab, MessagesTab, SettingsTab,
} from '../lead/Tabs.jsx';

const MONO = "'Geist Mono',monospace";

/** Section heading inside a card: sentence case, no tracked caps. */
const LABEL = 'font:600 14px/1.2 Geist;color:#1A1714';

/** "3" not "3.0", "2.5" not "2.48". */
function fmtHrs(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "LIVE" -> "Live", "created Sep 2" -> "Created Sep 2". */
function sentence(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  return /^[A-Z\s-]+$/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t.charAt(0).toUpperCase() + t.slice(1);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}

/** "Riverside High, grade 11" from the person's fields (seed rows carry a dotted `s`). */
function schoolLine(x) {
  if (x.school && x.grade) return `${x.school}, grade ${x.grade}`;
  if (x.school) return x.school;
  const s = String(x.s || '').replace(/\s*·\s*/g, ', ');
  return s || (x.appId ? 'Joined through your join link' : '');
}

/** "10:00 AM-11:00 AM" -> "10–11 AM", "3:30 PM-6:00 PM" -> "3:30–6 PM". Unreadable text passes through. */
function fmtTime(range) {
  const t = String(range || '').trim();
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AP]M)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i.exec(t);
  if (!m) return t;
  const part = (h, mm) => (mm && mm !== '00' ? `${h}:${mm}` : h);
  const a = part(m[1], m[2]);
  const b = part(m[4], m[5]);
  const bm = m[6].toUpperCase();
  // "1:00-4:00 PM" writes the meridiem once; the start shares it.
  const am = m[3] ? m[3].toUpperCase() : bm;
  return am === bm ? `${a}\u2013${b} ${bm}` : `${a} ${am}\u2013${b} ${bm}`;
}

/** Training labels were stored as "Required · 15 min"; show them with a comma. */
function plainLabel(v) {
  return String(v == null ? '' : v).replace(/\s*·\s*/g, ', ');
}

/** The next shift that hasn't ended and isn't cancelled, from real session rows.
    A shift that finished earlier today is over (the Shifts tab reads it Done). */
function nextUpcomingShift(p, now = new Date()) {
  return (p.sessions || [])
    .filter((x) => x.st !== 'Cancelled' && x.st !== 'Complete' && !isPastShift(x, now))
    .map((x) => ({ x, at: shiftDates(x, undefined, now)?.start || parseSessionDate(x.d, now) }))
    .sort((a, b) => a.at - b.at)
    .map((r) => r.x)[0] || null;
}

/** People the Attendance tab lists for every shift: the active roster. */
function rosterCount(p) {
  return p.people.filter((x) => x.st === 'Active' || x.st === 'Onboarding').length;
}

/** Who picked one shift on the join page, read from the project's application
    rows. Accepted members fill a spot. Applicants who picked it are listed
    while they wait on the lead, and don't fill one yet. Withdrawn and
    declined rows count for nothing. */
function shiftSignUps(apps, shiftId) {
  const id = String(shiftId);
  const picked = (a) => myShiftSignUps(a).some((x) => String(x.id) === id);
  return {
    going: (apps || []).filter((a) => a.status === 'accepted' && picked(a)),
    waiting: (apps || []).filter((a) => a.status === 'pending' && picked(a)),
  };
}

/** A shift with its real fill. On a published project, volunteers pick their
    shifts on the join page, so a shift is filled by the accepted members who
    signed up for it. A finished shift keeps the count recorded when it ran
    if that's higher. A project that was never published has no sign-ups, so
    an upcoming shift is filled by the roster Attendance lists for it. */
function withFill(p, x, apps = [], now = new Date()) {
  if (x.st === 'Cancelled') return x;
  const past = x.st === 'Complete' || isPastShift(x, now);
  if (!p.listingId) return past ? x : { ...x, filledCount: rosterCount(p) };
  const n = shiftSignUpCount((apps || []).filter((a) => a.status === 'accepted'), String(x.id));
  if (past) return n > (Number(x.filledCount) || 0) ? { ...x, filledCount: n } : x;
  return { ...x, filledCount: n };
}

/* ---- members who came in through the join link -------------------------- */

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Roster slug for a join-link member. The application id keeps two people
    with the same first name from sharing one. */
const linkSlug = (name, appId) => `p-${norm(name).split(' ')[0] || 'x'}-${String(appId).slice(-6)}`;

/** Hours the lead confirmed on one member's own log. */
function confirmedMemberHours(app) {
  const log = (app.member_state && app.member_state.hoursLog) || [];
  const ok = (app.assignment && app.assignment.confirmedHours) || {};
  return Math.round(log.filter((h) => ok[h.id]).reduce((a, h) => a + (Number(h.hrs) || 0), 0) * 10) / 10;
}

/** Logged hours on accepted members that the lead hasn't confirmed yet. */
function memberHoursWaiting(apps) {
  const out = [];
  for (const app of apps) {
    if (app.status !== 'accepted') continue;
    const log = (app.member_state && app.member_state.hoursLog) || [];
    const ok = (app.assignment && app.assignment.confirmedHours) || {};
    for (const h of log) if (!ok[h.id]) out.push({ app, h });
  }
  return out;
}

/** A row the lead made themselves that hasn't been tied to any account. */
const unclaimedRow = (x) => !x.appId && !x.accountId && !x.linkAdded;

/** Same-name matches still waiting on the lead, with both rows resolved.
    A match goes away once either row is gone or the lead row got linked. */
function openLinkSuggestions(p) {
  const out = [];
  for (const sug of p.linkSuggestions || []) {
    const added = p.people.find((x) => x.appId === sug.appId && x.linkAdded);
    const row = p.people.find((x) => x.id === sug.personId);
    if (added && row && unclaimedRow(row)) out.push({ ...sug, added, row });
  }
  return out;
}

/**
 * Put accepted join-link members on the project roster, so People, Overview,
 * position fill and Attendance count them like anyone the lead added. Mutates
 * `p` and returns true when anything changed.
 *
 * A row the lead added is only ever tied to an application by account id
 * (`accountId === app.applicant_id`) or after the lead confirms a same-name
 * match on People. A matching display name alone links nothing: anyone can
 * sign up under any name. The member gets their own row, and the same-name
 * row is offered as a possible match in `linkSuggestions`.
 *
 * Only acts on application rows it can see: a failed load (empty list) never
 * removes anyone. `linkedApps` remembers who was added once, so a person the
 * lead removes from the roster stays removed.
 */
function applyMemberLinks(p, apps) {
  const linked = new Set(p.linkedApps || []);
  let suggestions = (p.linkSuggestions || []).slice();
  let changed = false;
  // Earlier versions tied a lead's row to a join-link member by name alone.
  // Undo those links so the member gets their own row and the lead decides.
  for (const x of p.people) {
    if (x.appId && !x.linkAdded && !x.linkConfirmed) {
      linked.delete(x.appId);
      delete x.appId;
      delete x.accountId;
      changed = true;
    }
  }
  for (const app of apps) {
    const i = p.people.findIndex((x) => x.appId === app.id);
    const person = i >= 0 ? p.people[i] : null;
    if (app.status === 'accepted') {
      if (person) {
        if (person.st === 'Inactive' && person.leftVia === 'app') {
          person.st = 'Active';
          delete person.leftVia;
          changed = true;
        }
        if (person.linkAdded) {
          const slug = linkSlug(person.n, app.id);
          if (person.slug !== slug) {
            // Rows linked before slugs carried the application id.
            person.slug = slug;
            changed = true;
          }
        }
        if (person.linkAdded || person.linkConfirmed) {
          const hrs = confirmedMemberHours(app);
          if (hrs !== (person.linkHrs || 0)) {
            person.hrs = Math.max(0, Math.round(((Number(person.hrs) || 0) - (person.linkHrs || 0) + hrs) * 10) / 10);
            person.linkHrs = hrs;
            changed = true;
          }
        }
        continue;
      }
      if (linked.has(app.id)) continue;
      const name = String(app.applicant_name || '').trim() || 'Volunteer';
      linked.add(app.id);
      changed = true;
      // A row the lead already tied to this account (they confirmed the
      // match before and the member left and came back).
      const mine = app.applicant_id ? p.people.find((x) => !x.appId && x.accountId && x.accountId === app.applicant_id) : null;
      if (mine) {
        mine.appId = app.id;
        // Matched on the account itself, so the link is as good as confirmed.
        mine.linkConfirmed = true;
        continue;
      }
      const pos = p.positions.find((x) => norm(x.t) === norm(app.position)) || p.positions.find((x) => x.open !== false) || p.positions[0];
      const hrs = confirmedMemberHours(app);
      p.people.unshift({
        id: uid('per'),
        n: name,
        short: shortName(name),
        s: '',
        school: '',
        grade: null,
        role: pos ? pos.t : app.position || 'Volunteer',
        positionId: pos ? pos.id : null,
        st: 'Active',
        hrs,
        // Not seen at a shift yet; Attendance fills this in.
        last: '',
        tags: [],
        slug: linkSlug(name, app.id),
        // Nobody's consent form or training is assumed on file.
        consent: false,
        trained: false,
        notes: [],
        appId: app.id,
        accountId: app.applicant_id,
        linkAdded: true,
        linkHrs: hrs,
      });
      const at = app.decided_at ? new Date(app.decided_at) : null;
      const when = at && !Number.isNaN(at.getTime()) && Date.now() - at.getTime() > 864e5 ? `${MONTH_ABBR[at.getMonth()]} ${at.getDate()}` : 'now';
      p.activity = [{ id: uid('ac'), t: `${name} joined through your join link`, w: when }, ...(p.activity || [])].slice(0, 30);
      // Same name as a row the lead added: ask, never assume.
      const same = p.people.find((x) => unclaimedRow(x) && norm(x.n) === norm(name));
      if (same) suggestions = [...suggestions.filter((sg) => sg.appId !== app.id), { appId: app.id, personId: same.id }];
    } else if (person) {
      if (!person.linkAdded) {
        changed = true;
        // A roster row the lead made themselves: just drop the link. The
        // account id they confirmed stays, so the row comes back to this
        // member if they're accepted again.
        delete person.appId;
        linked.delete(app.id);
      } else if (app.status === 'pending' && !((Number(person.hrs) || 0) - (person.linkHrs || 0) > 0)) {
        // The acceptance was undone: take back the row it added.
        p.people.splice(i, 1);
        linked.delete(app.id);
        changed = true;
      } else if (person.st !== 'Inactive') {
        // Withdrew or was declined later: keep their history, mark them inactive.
        person.st = 'Inactive';
        person.leftVia = 'app';
        changed = true;
      }
    }
  }
  const open = openLinkSuggestions({ ...p, linkSuggestions: suggestions }).map(({ appId, personId }) => ({ appId, personId }));
  if (open.length !== (p.linkSuggestions || []).length || open.some((sg, k) => sg.appId !== p.linkSuggestions[k].appId || sg.personId !== p.linkSuggestions[k].personId)) {
    p.linkSuggestions = open;
    changed = true;
  }
  if (!changed) return false;
  p.linkedApps = Array.from(linked);
  for (const pos of p.positions) {
    pos.filledCount = p.people.filter((x) => x.positionId === pos.id && (x.st === 'Active' || x.st === 'Onboarding')).length;
  }
  return true;
}

function linkMembers(projectId, apps) {
  const cur = getProject(projectId);
  if (!cur || !apps.length) return;
  // Dry run on a copy so a load with nothing new doesn't write the workspace.
  if (!applyMemberLinks(structuredClone(cur), apps)) return;
  updateStore((s) => {
    const p = s.projects.find((x) => x.id === projectId);
    if (p) applyMemberLinks(p, apps);
  });
}

/** The lead confirmed a same-name match: their own row takes the member's
    application and account, and the row the join link added comes off. Tasks,
    attendance, notes and tags on the join-link row move to the lead's row.
    Returns false when the match is no longer open. */
function confirmLinkSuggestion(projectId, appId, personId) {
  let ok = false;
  updateStore((s) => {
    const p = s.projects.find((x) => x.id === projectId);
    if (!p) return;
    const added = p.people.find((x) => x.appId === appId && x.linkAdded);
    const row = p.people.find((x) => x.id === personId);
    p.linkSuggestions = (p.linkSuggestions || []).filter((sg) => sg.appId !== appId);
    if (!added || !row || !unclaimedRow(row)) return;
    row.appId = appId;
    row.accountId = added.accountId;
    row.linkConfirmed = true;
    // Hours the lead confirmed on the member's own log now count on this row.
    row.linkHrs = Number(added.linkHrs) || 0;
    row.hrs = Math.round(((Number(row.hrs) || 0) + row.linkHrs) * 10) / 10;
    if (row.st === 'Invited' || row.st === 'Inactive') row.st = added.st === 'Inactive' ? row.st : added.st;
    row.notes = [...(added.notes || []), ...(row.notes || [])];
    row.tags = Array.from(new Set([...(row.tags || []), ...(added.tags || [])]));
    for (const t of (p.taskBoard && p.taskBoard.tasks) || []) if (t.assigneeId === added.id) t.assigneeId = row.id;
    for (const sid of Object.keys(p.attendance || {})) {
      const rows = p.attendance[sid] || [];
      const hasRow = rows.some((r) => r.personId === row.id);
      p.attendance[sid] = hasRow ? rows.filter((r) => r.personId !== added.id) : rows.map((r) => (r.personId === added.id ? { ...r, personId: row.id, n: row.n } : r));
    }
    p.people = p.people.filter((x) => x.id !== added.id);
    for (const pos of p.positions) {
      pos.filledCount = p.people.filter((x) => x.positionId === pos.id && (x.st === 'Active' || x.st === 'Onboarding')).length;
    }
    p.activity = [{ id: uid('ac'), t: `${row.n} linked to the account they joined with`, w: 'now' }, ...(p.activity || [])].slice(0, 30);
    ok = true;
  });
  return ok;
}

/** The lead says the two same-name rows are different people. */
function dismissLinkSuggestion(projectId, appId) {
  updateStore((s) => {
    const p = s.projects.find((x) => x.id === projectId);
    if (p) p.linkSuggestions = (p.linkSuggestions || []).filter((sg) => sg.appId !== appId);
  });
}

/** This project's join-link applications (every status), reloaded when a
    decision is made elsewhere on the page or the tab comes back into view.
    Accepted members are synced onto the roster as they load. */
function useListingApps(p) {
  const listingId = p ? p.listingId : null;
  const projectId = p ? p.id : null;
  const [apps, setApps] = useState([]);
  useEffect(() => {
    setApps([]);
    if (!listingId) return undefined;
    let alive = true;
    const load = () =>
      loadOwnerApplications()
        .then((rows) => {
          if (!alive) return;
          const mine = rows.filter((a) => a.listing_id === listingId);
          setApps(mine);
          linkMembers(projectId, mine);
        })
        .catch((err) => console.error('[lead] could not load applications', err));
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('vu:applications-changed', load);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.removeEventListener('vu:applications-changed', load);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [listingId, projectId]);
  return apps;
}

/** Unread messages volunteers sent about this project, for the Messages tab
    badge. Reloads on a timer, when the lead switches tabs (opening a thread
    marks it read) and when the window comes back into view. A failed read
    keeps the last count. */
function useUnreadMessages(listingId, tab) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    setUnread(0);
    if (!listingId) return undefined;
    let alive = true;
    const load = () =>
      loadListingThreads(listingId)
        .then((threads) => { if (alive) setUnread(threads.reduce((a, t) => a + (t.unread || 0), 0)); })
        .catch((err) => console.error('[lead] could not count unread messages', err));
    load();
    const timer = setInterval(load, tab === 'messages' ? 8000 : 30000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [listingId, tab]);
  return unread;
}

const TIME_END_RX = /^(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|noon|midnight)$/i;

/** Error for a shift time range, or null. Accepts "10:00 AM-12:00 PM", "1:00-4:00 PM", "9 AM to noon". */
function shiftTimeError(raw) {
  const t = String(raw || '').trim();
  const msg = 'Enter a time like 10:00 AM-12:00 PM.';
  if (!t) return msg;
  const parts = t.split(/\s*(?:-|–|\bto\b)\s*/i);
  if (parts.length !== 2) return msg;
  for (const part of parts) {
    const m = TIME_END_RX.exec(part);
    if (!m) return msg;
    if (m[1] !== undefined) {
      const h = Number(m[1]);
      const mm = Number(m[2] || 0);
      if (mm > 59 || (m[3] ? h < 1 || h > 12 : h > 23)) return msg;
    }
  }
  const range = parseTimeRange(t);
  if (!range) return msg;
  if (range.end <= range.start) return 'The end time has to be after the start time.';
  return null;
}

/** Navigate to the new-project wizard. /create explains when a project is
    blocked and links to the project that needs attendance. */
function goCreateProject(router) {
  router.push('/create');
}

/* Header status chip. Turning off "Show project on Discover" pauses the
   listing, so the header says so instead of "Live". */
function headerStatus(p) {
  if (p.archived) return { label: 'Archived', bg: '#F6F2EE', color: '#57504A' };
  const pub = (p.settings || []).find((r) => r.id === 'set-public');
  if (pub && pub.on === false) return { label: 'Hidden', bg: '#FDF3E7', color: '#8A5A20' };
  return { label: sentence(p.status), bg: '#EAF3EC', color: '#3F6B4E' };
}

const VOL_TABS = [
  ['overview', 'Overview'],
  ['people', 'People'],
  ['positions', 'Positions'],
  ['shifts', 'Shifts'],
  ['attendance', 'Attendance'],
  ['applications', 'Applications'],
  ['hours', 'Hours'],
  ['quality', 'Quality'],
  ['pipeline', 'Setup steps'],
  ['messages', 'Messages'],
  ['settings', 'Settings'],
];

const TEAM_TABS = [
  ['overview', 'Overview'],
  ['people', 'Team'],
  ['tasks', 'Tasks'],
  ['messages', 'Messages'],
  ['settings', 'Settings'],
];

export function tabsFor(p) {
  return isTeam(p) ? TEAM_TABS : VOL_TABS;
}

// Back-compat export (some tooling references it); the volunteer set is the default.
export const LEAD_TABS = VOL_TABS;

/** Tab title before a project exists. app/lead/page.js writes the same text
    (a server page can't import values from this client module). */
const LEAD_TITLE = 'Lead a project, VolunteerU';

/** Name the browser tab after the open project and tab. The project lives in
    the client store, so the server metadata can't know it. Next streams its
    metadata <title> in after hydration and it sits ahead of anything this
    component could hoist, so the title is set directly and put back if the
    metadata lands later. The layout effect's cleanup runs inside the commit
    that leaves the page, so the next page's own title is never overwritten. */
function useDocumentTitle(title) {
  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !title) return undefined;
    let live = true;
    const apply = () => {
      if (live && document.title !== title) document.title = title;
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    return () => {
      live = false;
      watch.disconnect();
    };
  }, [title]);
}

export default function Lead({ projectId, tab: tabParam }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { state } = useSnapshot();

  const p = getProject(projectId || state.activeProjectId);
  const TABS = tabsFor(p);
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam : 'overview';
  const tabLabel = (TABS.find(([k]) => k === tab) || [])[1] || 'Overview';
  useDocumentTitle(p ? `${p.name} \u00b7 ${tabLabel}, VolunteerU` : LEAD_TITLE);
  const linkApps = useListingApps(p);
  const unreadMessages = useUnreadMessages(p ? p.listingId : null, tab);

  if (!p) {
    return (
      <div className="vu-pad-40" style={S('padding:28px 40px 96px;display:flex;flex-direction:column;gap:20px')}>
        <CrossApplications />
        <EmptyState
          icon="flag"
          title="No student project yet"
          body="Start one to take applications, plan shifts and confirm your team's hours."
          cta="Start a student project"
          onCta={() => goCreateProject(router)}
        />
      </div>
    );
  }

  const setParam = (patch) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, String(v));
    });
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const goTab = (k) => router.push(`/lead/${p.id}/${k}`);

  const chip = headerStatus(p);
  const crossPending = linkApps.filter((a) => a.status === 'pending').length;
  const memberHours = memberHoursWaiting(linkApps);
  const appsBadge = pendingApplications(p).length;
  const hoursBadge = pendingHours(p).length + memberHours.length;
  const openAttendance = p.attendanceSessions.filter((x) => !x.posted).length;
  // Applications, hours, attendance, plus unread messages from volunteers.
  const badgeFor = (k) => ({ applications: appsBadge, hours: hoursBadge, attendance: openAttendance, messages: unreadMessages }[k] || '') || '';

  function switchProject(e) {
    const list = allProjects();
    menuFromEvent(
      e,
      [
        ...list.map((x) => ({ key: x.id, label: x.archived ? `${x.name} (archived)` : x.name, checked: x.id === p.id, icon: x.archived ? 'folder' : 'flag' })),
        { sep: true },
        { key: '__new', label: 'New project', icon: 'plus' },
      ],
      (key) => {
        if (key === '__new') goCreateProject(router);
        else if (key !== p.id) {
          setActiveProject(key);
          router.push(`/lead/${key}/${tab}`);
        }
      }
    );
  }

  async function copyRecruit() {
    // The real, openable link: a public join page backed by the shared listing.
    // Falls back to the stored link only before the project has been published.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = p.listingId ? `${origin}/join/${p.listingId}` : p.recruitLink;
    if (!p.listingId) {
      toast({ title: "Join link isn't on yet", message: 'It turns on once this project is published.', tone: 'warn' });
      return;
    }
    if (p.archived) {
      toast({ title: 'This project is archived', message: "Its join link doesn't take applications, so there's nothing to share.", tone: 'warn' });
      return;
    }
    const ok = await copyText(link);
    toast(
      ok
        ? { title: 'Join link copied', message: 'Anyone with the link can see this project and apply.', tone: 'ok' }
        : { title: 'Copy this link', message: link, tone: 'warn' }
    );
  }

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:28px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            <div style={S('font:500 13px/1 Geist;color:#6B635C')}>{p.orgClass === 'official' ? 'Volunteer program' : 'Student project'}</div>
            <div style={s('padding:4px 8px;border-radius:6px', `background:${chip.bg}`, 'font:500 12px/1 Geist', `color:${chip.color}`)}>{chip.label}</div>
            {p.sponsor.verified ? (
              <div style={S('display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 12px/1 Geist;color:#3F6B4E')}>
                <Icon name="check" size={12} />
                Verified organization
              </div>
            ) : p.sponsor.verificationRequestedAt ? (
              <div style={S('padding:4px 8px;border-radius:6px;background:#FDF3E7;font:500 12px/1 Geist;color:#8A5A20')}>Verification requested</div>
            ) : (
              <div style={S('padding:4px 8px;border-radius:6px;background:#F6F2EE;font:500 12px/1 Geist;color:#57504A')}>Not verified yet</div>
            )}
          </div>
          <div style={S('margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
            <h1 style={S('margin:0;font:600 32px/1.05 Geist;letter-spacing:-0.04em')}>{p.name}</h1>
            <Pressable
              label="Switch project"
              expanded={false}
              onClick={switchProject}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
            >
              Switch project
              <Icon name="chevron-down" size={13} />
            </Pressable>
          </div>
          <div style={S('margin-top:9px;display:flex;flex-wrap:wrap;column-gap:16px;row-gap:4px;font:450 14px/1.4 Geist;color:#6B635C')}>
            {[p.site, p.cadence, p.termWeeks ? `${p.termWeeks}-week term` : '', sentence(p.createdLabel)].filter(Boolean).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
        <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <Pressable
            label="Copy join link"
            onClick={copyRecruit}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer;transition:background .16s ease, transform .16s ease')}
          >
            <Icon name="link" size={15} />
            Copy join link
          </Pressable>
          <Pressable
            label="New project"
            onClick={() => goCreateProject(router)}
            className={cx(H.secondaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease')}
          >
            New project
          </Pressable>
        </div>
      </div>

      <div className="vu-scroll-x" role="tablist" aria-label="Project sections" style={S('margin-top:22px;border-bottom:1px solid #E8E1D9;display:flex;gap:2px')}>
        {TABS.map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable
              key={k}
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              label={k === 'messages' && unreadMessages ? `${label}, ${unreadMessages} unread` : label}
              onClick={() => goTab(k)}
              className={cx(on ? '' : H.nav, H.press)}
              style={s(
                'display:flex;align-items:center;gap:7px;padding:10px 14px;border-radius:9px 9px 0 0',
                `background:${on ? '#1F1B18' : 'transparent'}`,
                `color:${on ? '#FFFFFF' : '#6B635C'}`,
                'font:500 13px/1 Geist;cursor:pointer;white-space:nowrap;transition:background .16s ease, color .16s ease'
              )}
            >
              {label}
              <span style={S(`font:500 10px/1 ${MONO};opacity:.75`)}>{badgeFor(k)}</span>
            </Pressable>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === 'overview' ? (isTeam(p) ? <TeamOverview p={p} goTab={goTab} linkApps={linkApps} /> : <Overview p={p} goTab={goTab} crossPending={crossPending} memberHours={memberHours} apps={linkApps} />) : null}
        {tab === 'people' ? <People p={p} params={params} setParam={setParam} linkApps={linkApps} /> : null}
        {tab === 'tasks' ? <TasksTab p={p} /> : null}
        {tab === 'pipeline' ? <PipelineTab p={p} /> : null}
        {tab === 'positions' ? <Positions p={p} /> : null}
        {tab === 'shifts' ? <Shifts p={p} goTab={goTab} apps={linkApps} /> : null}
        {tab === 'attendance' ? <AttendanceTab p={p} params={params} setParam={setParam} goTab={goTab} /> : null}
        {tab === 'applications' ? <ApplicationsTab p={p} params={params} setParam={setParam} goTab={goTab} onCopyLink={copyRecruit} /> : null}
        {tab === 'hours' ? <HoursTab p={p} /> : null}
        {tab === 'quality' ? <QualityTab p={p} params={params} setParam={setParam} goTab={goTab} /> : null}
        {tab === 'messages' ? (
          <div style={S('margin-top:22px;display:flex;flex-direction:column;gap:18px')}>
            <AnnouncementBoard listingId={p.listingId} canPost title="Updates for your team" />
            <MessagesTab p={p} params={params} setParam={setParam} embedded />
          </div>
        ) : null}
        {tab === 'settings' ? <SettingsTab p={p} /> : null}
      </div>
    </div>
  );
}

/* ---- overview ----------------------------------------------------------- */

function Overview({ p, goTab, crossPending = 0, memberHours = [], apps = [] }) {
  const progress = taskProgress(p);
  const localPending = pendingApplications(p);
  const appsCount = localPending.length + crossPending;
  const localHours = pendingHours(p);
  const hoursCount = localHours.length + memberHours.length;
  const hoursTotal = [...localHours.map((q) => q.hrs), ...memberHours.map((r) => r.h.hrs)].reduce((a, n) => a + (Number(n) || 0), 0);
  const hoursPeople = new Set([...localHours.map((q) => q.personId || q.n || q.id), ...memberHours.map((r) => r.app.id)]).size;
  const flagged = localHours.filter((q) => !q.ok).length;
  const shortSession = shortSessions({ ...p, sessions: p.sessions.map((x) => withFill(p, x, apps)) })[0];
  const crew = p.people.filter((x) => x.st === 'Active').sort((a, b) => b.hrs - a.hrs).slice(0, 4);
  const oldest = localPending.slice().sort((a, b) => b.ts - a.ts)[0];
  const lh = p.leadHours || { planning: 0, sessions: 0, recruiting: 0 };
  const leadTotal = fmtHrs(lh.planning + lh.sessions + lh.recruiting);
  const nextRow = nextUpcomingShift(p);
  const next = nextRow ? withFill(p, nextRow, apps) : null;
  const ns = p.nextSession || {};
  const matches = openLinkSuggestions(p);

  const facts = next
    ? [
        { l: 'Spots filled', v: `${next.filledCount} of ${next.cap}` },
        { l: 'Check-in code', v: p.checkinCode },
        ns.materials ? { l: 'Materials', v: ns.materials } : null,
        ns.setting ? { l: 'Setting', v: ns.setting } : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px;min-width:0')}>
        <CrossApplications listingId={p.listingId} />
        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:20px')}>
            <div style={S('min-width:0')}>
              <div style={S('font:500 13px/1 Geist;color:#6B635C')}>Next shift</div>
              <div style={S('margin-top:10px;font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>
                {next ? `${next.d}, ${fmtTime(next.t)}` : 'Nothing scheduled'}
              </div>
              <div style={S('margin-top:7px;font:450 13px/1.45 Geist;color:#6B635C')}>
                {next ? (next.loc || p.siteShort) : 'Add a shift so volunteers can sign up.'}
              </div>
            </div>
            <div style={S('display:flex;gap:9px;flex:none;flex-wrap:wrap')}>
              {next ? (
                <>
                  <Pressable
                    label="Message team"
                    onClick={() => goTab('messages')}
                    className={cx(H.secondary, H.press)}
                    style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
                  >
                    Message team
                  </Pressable>
                  <Pressable
                    label="Open roster"
                    onClick={() => goTab('people')}
                    className={cx(H.primary, H.press)}
                    style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
                  >
                    Open roster
                  </Pressable>
                </>
              ) : (
                <Pressable
                  label="Add a shift"
                  onClick={() => goTab('shifts')}
                  className={cx(H.primary, H.press)}
                  style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
                >
                  Add a shift
                </Pressable>
              )}
            </div>
          </div>
          {facts.length ? (
            <dl style={S('margin:18px 0 0;padding-top:16px;border-top:1px solid #F1EBE4;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px')}>
              {facts.map((k) => (
                <div key={k.l} style={S('min-width:0')}>
                  <dt style={S('font:450 12px/1.2 Geist;color:#6B635C')}>{k.l}</dt>
                  <dd style={S('margin:6px 0 0;font:600 16px/1.2 Geist;color:#1A1714')}>{k.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <h2 style={S(`margin:0;${LABEL}`)}>Setup steps</h2>
              <div style={S(`font:500 12px/1 ${MONO};color:#A8482A`)}>
                {progress.done} of {progress.total}
              </div>
            </div>
            <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:12px')}>
              {p.tasks.map((t) => (
                <label key={t.id} htmlFor={`task-${t.id}`} className={H.link} style={S('display:flex;gap:11px;align-items:flex-start;cursor:pointer')}>
                  <input
                    id={`task-${t.id}`}
                    type="checkbox"
                    className="vu-sr"
                    checked={t.done}
                    onChange={() => {
                      const updated = toggleTask(p.id, t.id);
                      if (updated && updated.done) toast({ title: 'Checked off', message: updated.t, tone: 'ok', timeout: 2400 });
                    }}
                  />
                  <span
                    aria-hidden="true"
                    style={s(
                      'width:17px;height:17px;border-radius:5px;flex:none;margin-top:2px;display:grid;place-items:center;color:#fff',
                      `border:1px solid ${t.done ? '#C2603C' : '#D8CFC5'}`,
                      `background:${t.done ? '#C2603C' : '#fff'}`,
                      'transition:border-color .16s ease, background .16s ease'
                    )}
                  >
                    {t.done ? <Icon name="check" size={11} stroke={2.5} /> : null}
                  </span>
                  <span style={s('font:450 14px/1.45 Geist', t.done ? 'color:#6B635C' : 'color:#332D28')}>{t.t}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <h2 style={S(`margin:0;${LABEL}`)}>Activity</h2>
            <div style={S('margin-top:8px;display:flex;flex-direction:column')}>
              {p.activity.length ? (
                p.activity.slice(0, 5).map((a, i, arr) => (
                  <div key={a.id} style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0', i < arr.length - 1 ? 'border-bottom:1px solid #F1EBE4' : '')}>
                    <div style={S('font:450 13px/1.45 Geist;color:#332D28')}>{a.t}</div>
                    <div style={S('font:450 12px/1.45 Geist;color:#6B635C;flex:none')}>{a.w}</div>
                  </div>
                ))
              ) : (
                <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>No activity yet. New applications and posted attendance show up here.</div>
              )}
            </div>
          </div>
        </div>

        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <h2 style={S(`margin:0;${LABEL}`)}>Team</h2>
            <Pressable label="Manage people" onClick={() => goTab('people')} className={H.link} style={S('font:500 13px/1 Geist;color:#A8482A;cursor:pointer')}>
              Manage people
            </Pressable>
          </div>
          {crew.length ? (
            <div style={S('display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-top:16px')}>
              {crew.map((c) => (
                <Pressable
                  key={c.id}
                  label={`${c.n}, ${c.role}`}
                  onClick={() => goTab('people')}
                  className={cx(H.cardSoft, H.press)}
                  style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;text-align:center;cursor:pointer;transition:border-color .16s ease')}
                >
                  <div style={S('width:44px;height:44px;margin:0 auto;border-radius:50%;overflow:hidden')}>
                    <Avatar name={c.n} fs={15} />
                  </div>
                  <div style={S('margin-top:10px;font:500 13px/1.2 Geist')}>{c.short || c.n}</div>
                  <div style={S('margin-top:4px;font:450 12px/1.2 Geist;color:#6B635C')}>{c.role}</div>
                  <div style={S(`margin-top:8px;font:500 12px/1 ${MONO};color:#A8482A`)}>{fmtHrs(c.hrs)} hrs</div>
                </Pressable>
              ))}
            </div>
          ) : (
            <div style={S('margin-top:8px')}>
              <EmptyState compact icon="users" title="No one on the team yet" body="Accept an application or add a student on the People tab." cta="Review applications" onCta={() => goTab('applications')} />
            </div>
          )}
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px;min-width:0')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Needs you today</h2>
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
            {appsCount ? (
              <NeedCard
                title={`${plural(appsCount, 'application')} waiting`}
                sub={oldest && !crossPending ? `Oldest is ${plural(Math.max(1, Math.round(oldest.ts / 24)), 'day')} old` : 'Accept or decline on the Applications tab'}
                onClick={() => goTab('applications')}
              />
            ) : null}
            {hoursCount ? (
              <NeedCard
                title={hoursTotal > 0 ? `${fmtHrs(hoursTotal)} ${hoursTotal === 1 ? 'hour' : 'hours'} to confirm` : `${plural(hoursCount, 'hours entry', 'hours entries')} to confirm`}
                sub={flagged ? `${flagged} flagged as leaving early` : `From ${plural(hoursPeople, 'volunteer')}, on the Hours tab`}
                onClick={() => goTab('hours')}
              />
            ) : null}
            {shortSession ? (
              <NeedCard
                title={`${shortSession.d} needs ${plural(shortSession.cap - shortSession.filledCount, 'more person', 'more people')}`}
                sub="See shifts"
                onClick={() => goTab('shifts')}
              />
            ) : null}
            {matches.length ? (
              <NeedCard
                title={`${plural(matches.length, 'possible match', 'possible matches')} on the roster`}
                sub="Same name as someone you added. Check on People"
                onClick={() => goTab('people')}
              />
            ) : null}
            {!appsCount && !hoursCount && !shortSession && !matches.length ? (
              <div style={S('padding:14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#57504A')}>
                Nothing waiting on you. No applications or hours to review.
              </div>
            ) : null}
          </div>
        </div>

        <SponsorCard p={p} />

        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Your lead hours</h2>
          <div style={S('margin-top:10px;font:600 32px/1 Geist;letter-spacing:-0.04em')}>
            {leadTotal}
            <span style={S('font-size:13px;font-weight:450;letter-spacing:0;color:#6B635C')}> hours</span>
          </div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
            <SideRow l="Planning" v={fmtHrs(lh.planning)} />
            <SideRow l="Running shifts" v={fmtHrs(lh.sessions)} />
            <SideRow l="Recruiting" v={fmtHrs(lh.recruiting)} />
          </div>
        </div>

        <CrewFunnel p={p} crossPending={crossPending} />
      </div>
    </div>
  );
}

function NeedCard({ title, sub, onClick }) {
  return (
    <Pressable
      label={title}
      onClick={onClick}
      className={cx(H.card, H.press)}
      style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC;cursor:pointer;transition:border-color .16s ease')}
    >
      <div style={S('min-width:0')}>
        <div style={S('font:500 13px/1.25 Geist')}>{title}</div>
        <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#6B635C')}>{sub}</div>
      </div>
      <span style={S('color:#A8482A;flex:none')}><Icon name="chevron-right" size={15} /></span>
    </Pressable>
  );
}

function SideRow({ l, v }) {
  return (
    <div style={S('display:flex;justify-content:space-between;gap:10px')}>
      <span>{l}</span>
      <span style={S('color:#1A1714;font-weight:500;text-align:right;min-width:0;overflow-wrap:anywhere')}>{v}</span>
    </div>
  );
}

/* Organization panel. Shows only honest status: not verified until a reviewer
   confirms, and a persisted "request verification" action. */
function SponsorCard({ p }) {
  const sp = p.sponsor || {};
  const named = sp.name && sp.name.trim();
  const status = sp.verified ? 'Verified organization'
    : sp.verificationRequestedAt ? 'Verification requested'
    : named ? 'Not verified yet'
    : 'No organization added yet';

  const openRequest = () => {
    openModal({
      title: 'Request verification',
      subtitle: 'Send the organization name and a staff contact. A reviewer checks them before the verified badge appears.',
      Body: ({ api }) => <VerifyForm p={p} api={api} />,
    });
  };

  return (
    <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
      <h2 style={S(`margin:0;${LABEL}`)}>Organization</h2>
      <div style={S('margin-top:14px;display:flex;align-items:center;gap:11px')}>
        <div style={S('width:36px;height:36px;border-radius:10px;overflow:hidden;flex:none;background:#EFE9E2')}>
          {named ? <Avatar name={named} fs={13} /> : null}
        </div>
        <div style={S('min-width:0')}>
          <div style={S('display:flex;align-items:center;gap:6px;font:500 14px/1.2 Geist')}>
            <span className="vu-trunc">{named || 'Not set'}</span>
            {sp.verified ? <span style={S('color:#3F6B4E;flex:none')}><Icon name="check-circle" size={14} label="Verified" /></span> : null}
          </div>
          <div className="vu-trunc" style={S('margin-top:3px;font:450 12px/1.2 Geist;color:#6B635C')}>{status}</div>
        </div>
      </div>
      {sp.contact && sp.contact !== '-' ? (
        <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
          <SideRow l="Contact" v={sp.contact} />
        </div>
      ) : null}
      {!sp.verified ? (
        <button
          type="button"
          onClick={openRequest}
          className={cx(H.secondary, H.press)}
          style={S('margin-top:16px;width:100%;padding:10px;border-radius:10px;border:1px solid #E4DDD4;background:#FAF6F3;font:500 13px/1 Geist;color:#8A5A20;cursor:pointer')}
        >
          {sp.verificationRequestedAt ? 'Update verification request' : 'Request verification'}
        </button>
      ) : null}
    </div>
  );
}

function VerifyForm({ p, api }) {
  const [name, setName] = useState((p.sponsor && p.sponsor.name) || '');
  const [contact, setContact] = useState((p.sponsor && p.sponsor.contact !== '-' && p.sponsor.contact) || '');
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const e = {};
    if (!name.trim()) e.name = 'Enter the organization name.';
    if (!contact.trim()) e.contact = 'Enter a staff name and email.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    requestProjectVerification(p.id, { name, contact });
    toast({ title: 'Verification requested', message: 'Your status shows as requested until a reviewer checks it.', tone: 'ok' });
    api.close();
  };
  return (
    <div style={S('display:flex;flex-direction:column;gap:14px')}>
      <Field label="Organization name" value={name} onChange={setName} placeholder="e.g. Rivertown Public Library" error={err.name} required maxLength={90} />
      <Field label="Staff contact" value={contact} onChange={setContact} placeholder="e.g. Ms. Alvarez, alvarez@school.edu" error={err.contact} required maxLength={120} />
      <div style={S('display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap')}>
        <button type="button" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('padding:10px 16px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:500 13px/1 Geist;cursor:pointer')}>Cancel</button>
        <button type="button" onClick={submit} disabled={busy} className={cx(H.primary, H.press)} style={S('padding:10px 16px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:500 13px/1 Geist;cursor:pointer')}>{busy ? 'Sending' : 'Send for review'}</button>
      </div>
    </div>
  );
}

/* Where people on the team stand, from the roster and the application rows
   (local plus the ones that came in through the join link). */
function CrewFunnel({ p, crossPending = 0 }) {
  const waiting = p.applications.filter((a) => a.status === 'pending').length + crossPending;
  const onboarding = p.people.filter((x) => x.st === 'Onboarding').length;
  const active = p.people.filter((x) => x.st === 'Active').length;
  return (
    <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
      <h2 style={S(`margin:0;${LABEL}`)}>Team status</h2>
      <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
        <SideRow l="Applications waiting" v={waiting} />
        <SideRow l="Onboarding" v={onboarding} />
        <SideRow l="Active" v={active} />
        {p.eventsHosted > 0 ? <SideRow l="Events hosted (your count)" v={p.eventsHosted} /> : null}
        {p.approxVolunteers > 0 ? <SideRow l="Volunteers so far (your estimate)" v={p.approxVolunteers} /> : null}
      </div>
    </div>
  );
}

/* ---- team overview (orgType 'team') ------------------------------------- */

/* A team member's role and whether they've read its briefing. People who came
   in through the join link get their role on the application's assignment
   (Tasks > Members from your join link), so that row wins over the roster. */
function teamRoleFor(m, appsById) {
  const app = m.appId ? appsById.get(m.appId) : null;
  if (app && app.status === 'accepted') {
    const roleId = (app.assignment && app.assignment.role && app.assignment.role.id) || null;
    const ack = app.member_state && app.member_state.briefingAck;
    return { roleId, acked: !!(roleId && ack && ack[roleId]), canAck: true };
  }
  // A row the lead added (People > Change role). That student has no account
  // tied to this project, so there's no briefing for them to read in the app.
  const roleId = m.teamRoleId || null;
  return { roleId, acked: !!(roleId && m.briefingAck && m.briefingAck[roleId]), canAck: false };
}

const NO_TEAM_ROLE = 'No role yet';

/* On a team the roster's role column is the team role (Tasks > Role for ...),
   not the position the row was created with. Returns new rows; the stored
   roster is left alone. */
function rosterWithTeamRoles(p, linkApps) {
  if (!isTeam(p)) return p.people;
  const appsById = new Map(linkApps.map((a) => [a.id, a]));
  return p.people.map((m) => {
    const { roleId } = teamRoleFor(m, appsById);
    const r = roleId ? roleOf(p, roleId) : null;
    return { ...m, role: r ? r.name : NO_TEAM_ROLE };
  });
}

function TeamOverview({ p, goTab, linkApps = [] }) {
  const stats = taskStats(p);
  const roles = taskRoles(p);
  const tasks = tasksOf(p);
  const inProgress = tasks.filter((t) => t.status === 'doing').slice(0, 4);
  const unassigned = tasks.filter((t) => !t.assigneeId && t.status !== 'done');
  const members = p.people.filter((x) => x.st === 'Active' || x.st === 'Onboarding');
  const appsById = new Map(linkApps.map((a) => [a.id, a]));
  const memberRoles = members.map((m) => teamRoleFor(m, appsById));
  const needsBriefing = memberRoles.filter((r) => r.roleId && r.canAck && !r.acked);
  const matches = openLinkSuggestions(p);

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px;min-width:0')}>
        <CrossApplications listingId={p.listingId} />

        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:20px')}>
            <div>
              <div style={S('font:500 13px/1 Geist;color:#6B635C')}>Task board</div>
              <div style={S('margin-top:10px;font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>{stats.total ? `${stats.done} of ${plural(stats.total, 'task')} done` : 'No tasks yet'}</div>
              <div style={S('margin-top:7px;font:450 13px/1.45 Geist;color:#6B635C')}>{stats.doing} in progress, {stats.todo} to do, {plural(stats.roles, 'role')}</div>
            </div>
            <Pressable label="Open board" onClick={() => goTab('tasks')} className={cx(H.primary, H.press)} style={S('flex:none;display:inline-flex;align-items:center;gap:8px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer')}>
              Open board
            </Pressable>
          </div>
          <div style={S('margin-top:16px;height:8px;border-radius:99px;background:#F1EBE4;overflow:hidden')}>
            <div style={s('height:100%;border-radius:99px;background:#C2603C;transition:width .3s ease', `width:${stats.pct}%`)} />
          </div>
        </div>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <h2 style={S(`margin:0;${LABEL}`)}>In progress</h2>
              <Pressable label="Open board" onClick={() => goTab('tasks')} className={H.link} style={S('font:500 13px/1 Geist;color:#A8482A;cursor:pointer')}>Open board</Pressable>
            </div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
              {inProgress.length ? inProgress.map((t) => {
                const r = roleOf(p, t.roleId);
                const who = p.people.find((x) => x.id === t.assigneeId);
                return (
                  <div key={t.id} style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                    <div style={S('font:500 13px/1.35 Geist;color:#1A1714')}>{t.title || t.t || t.name || 'Untitled task'}</div>
                    <div style={S('margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                      {r ? <span style={s('padding:3px 7px;border-radius:6px;font:500 11px/1 Geist', `background:${r.color}18`, `color:${r.color}`)}>{r.name}</span> : null}
                      {who ? <span style={S('font:450 12px/1 Geist;color:#6B635C')}>{who.short || who.n}</span> : null}
                    </div>
                  </div>
                );
              }) : (
                <div style={S('font:450 13px/1.5 Geist;color:#6B635C')}>Nothing in progress. Move a task to In progress on the board.</div>
              )}
            </div>
          </div>

          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <h2 style={S(`margin:0;${LABEL}`)}>Activity</h2>
            <div style={S('margin-top:8px;display:flex;flex-direction:column')}>
              {p.activity.length ? p.activity.slice(0, 5).map((a, i, arr) => (
                <div key={a.id} style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0', i < arr.length - 1 ? 'border-bottom:1px solid #F1EBE4' : '')}>
                  <div style={S('font:450 13px/1.45 Geist;color:#332D28')}>{a.t}</div>
                  <div style={S('font:450 12px/1.45 Geist;color:#6B635C;flex:none')}>{a.w}</div>
                </div>
              )) : <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>No activity yet. Task changes and new members show up here.</div>}
            </div>
          </div>
        </div>

        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <h2 style={S(`margin:0;${LABEL}`)}>Roles</h2>
            <Pressable label="Manage roles" onClick={() => goTab('tasks')} className={H.link} style={S('font:500 13px/1 Geist;color:#A8482A;cursor:pointer')}>Manage roles</Pressable>
          </div>
          <div className="vu-3col" style={S('margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px')}>
            {roles.length ? roles.map((r) => {
              const count = memberRoles.filter((x) => x.roleId === r.id).length;
              return (
                <div key={r.id} style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <div style={S('display:flex;align-items:center;gap:8px')}>
                    <span style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${r.color}`)} />
                    <div style={S('font:600 13px/1.2 Geist')}>{r.name}</div>
                  </div>
                  <div style={S('margin-top:9px;font:450 12px/1 Geist;color:#6B635C')}>{plural(count, 'member')}</div>
                </div>
              );
            }) : (
              <div style={S('grid-column:1 / -1')}>
                <EmptyState compact title="No roles yet" body="Add roles with briefings so members know what they own." cta="Set up roles" onCta={() => goTab('tasks')} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px;min-width:0')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Needs you</h2>
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
            {unassigned.length ? <NeedCard title={`${plural(unassigned.length, 'task')} without an owner`} sub="Assign them on the task board" onClick={() => goTab('tasks')} /> : null}
            {needsBriefing.length ? <NeedCard title={`${plural(needsBriefing.length, 'member')} not briefed`} sub="They haven't read their role briefing" onClick={() => goTab('people')} /> : null}
            {matches.length ? <NeedCard title={`${plural(matches.length, 'possible match', 'possible matches')} on the team`} sub="Same name as someone you added. Check on the Team tab" onClick={() => goTab('people')} /> : null}
            {!unassigned.length && !needsBriefing.length && !matches.length ? (
              <div style={S('padding:14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#57504A')}>Nothing waiting on you. Every task has an owner and everyone has read their briefing.</div>
            ) : null}
          </div>
        </div>

        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Mission</h2>
          {p.mission ? <div style={S('margin-top:10px;font:450 14px/1.55 Geist;color:#332D28')}>{p.mission}</div> : null}
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
            <SideRow l="Team size" v={members.length} />
            {p.cadence ? <SideRow l="Cadence" v={p.cadence} /> : null}
            {p.termWeeks ? <SideRow l="Term" v={plural(p.termWeeks, 'week')} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- people ------------------------------------------------------------- */

const PAGE = 8;
const STATUSES = ['all', 'Active', 'Onboarding', 'Invited', 'Waitlist', 'Inactive'];
/** 'Invited' stays the stored key; nothing is sent, so the label says 'Added'. */
const statusLabel = (st) => (st === 'Invited' ? 'Added' : st);
const GRADES = ['7', '8', '9', '10', '11', '12'];

/** True below the phone breakpoint, so the roster can switch from a table to rows. */
function useNarrow(max = 720) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${max}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, [max]);
  return narrow;
}

const SMALL_BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;height:30px;border-radius:8px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease';
const FILTER_BTN = 'display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:38px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 13px/1 Geist;color:#57504A;cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease';
const BTN_PRIMARY = 'display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:38px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease';
const BTN_SECONDARY = 'display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:38px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer;transition:background .16s ease, border-color .16s ease';
const MODAL_PRIMARY = 'display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer';
const MODAL_SECONDARY = 'display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer';

function People({ p: stored, params, setParam, linkApps = [] }) {
  const p = { ...stored, people: rosterWithTeamRoles(stored, linkApps) };
  const q = params.get('pq') || '';
  const status = params.get('pstatus') || 'all';
  const role = params.get('prole') || 'all';
  const page = Math.max(1, Number(params.get('ppage')) || 1);
  const [selected, setSelected] = useState([]);
  const [draftQuery, setDraftQuery] = useState(q);
  const narrow = useNarrow();

  const filtered = filterPeople(p, { q, status, role });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * PAGE, safePage * PAGE);
  const roleSource = isTeam(p) ? taskRoles(p).map((r) => r.name) : p.positions.map((x) => x.t);
  const roles = ['all', ...Array.from(new Set([...roleSource, ...p.people.map((x) => x.role)].filter(Boolean)))];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const filtering = !!(q || status !== 'all' || role !== 'all');

  const count = (st) => p.people.filter((x) => x.st === st).length;
  const summary = `${count('Active')} active, ${count('Onboarding')} onboarding, ${count('Waitlist')} on the waitlist`;
  const matches = openLinkSuggestions(stored);
  const team = isTeam(stored);
  const appsById = new Map(linkApps.map((a) => [a.id, a]));

  function linkMatch(m) {
    if (confirmLinkSuggestion(stored.id, m.appId, m.row.id)) {
      toast({ title: 'Linked', message: `${m.row.n} is one row now, tied to the account they joined with.`, tone: 'ok' });
    } else {
      toast({ title: "Couldn't link them", message: 'One of the rows changed. Check the roster and try again.', tone: 'warn' });
    }
  }

  function keepSeparate(m) {
    dismissLinkSuggestion(stored.id, m.appId);
    toast({ title: 'Kept separate', message: `${m.row.n} stays as 2 rows.`, tone: 'ok', timeout: 2200 });
  }

  function teamRolePicker(person) {
    const app = person.appId ? appsById.get(person.appId) : null;
    openModal({
      title: `Role for ${person.n}`,
      subtitle: app && app.status === 'accepted' ? 'They see the role and its briefing on their project page.' : 'Shows on the Team tab and in your roster download.',
      Body: function RoleBody({ api }) {
        return <TeamRoleForm api={api} project={stored} person={person} app={app && app.status === 'accepted' ? app : null} />;
      },
    });
  }

  function addStudent() {
    openModal({
      title: 'Add a student',
      subtitle: 'They show on the roster as Added until you mark them active. Nothing is sent to them.',
      Body: function AddBody({ api }) {
        return <AddPersonForm api={api} project={p} />;
      },
    });
  }

  function importList() {
    openModal({
      title: 'Import from a list',
      subtitle: 'One student per line: name, school, grade.',
      Body: function ImportBody({ api }) {
        return <ImportForm api={api} project={p} />;
      },
    });
  }

  function noteFor(person) {
    openModal({
      title: `Note on ${person.n}`,
      subtitle: 'Only you can see notes.',
      Body: function NoteBody({ api }) {
        return <NoteForm api={api} project={p} person={person} />;
      },
    });
  }

  function personProfile(person) {
    openModal({
      title: person.n,
      subtitle: schoolLine(person),
      Body: function ProfileBody({ api }) {
        return (
          <PersonProfile
            api={api}
            project={p}
            person={person}
            onNote={() => { api.close(); noteFor(person); }}
            onRole={team ? () => { api.close(); teamRolePicker(person); } : null}
          />
        );
      },
    });
  }

  function personMenu(e, person) {
    menuFromEvent(
      e,
      [
        ...(team ? [{ key: 'role', label: person.role === NO_TEAM_ROLE ? 'Give a role' : 'Change role', icon: 'flag' }, { sep: true }] : []),
        { key: 'active', label: 'Mark active', icon: 'check', disabled: person.st === 'Active' },
        { key: 'waitlist', label: 'Move to waitlist', icon: 'clock', disabled: person.st === 'Waitlist' },
        { key: 'inactive', label: 'Mark inactive', icon: 'minus', disabled: person.st === 'Inactive' },
        { sep: true },
        { key: 'consent', label: person.consent ? 'Mark consent form missing' : 'Mark consent form received', icon: 'file' },
        { key: 'trained', label: person.trained ? 'Mark training not done' : 'Mark training done', icon: 'award' },
        { sep: true },
        { key: 'remove', label: 'Remove from roster', icon: 'trash', tone: 'danger' },
      ],
      async (key) => {
        const done = {
          active: ['Marked active', () => updatePerson(p.id, person.id, { st: 'Active' })],
          waitlist: ['Moved to waitlist', () => updatePerson(p.id, person.id, { st: 'Waitlist' })],
          inactive: ['Marked inactive', () => updatePerson(p.id, person.id, { st: 'Inactive' })],
          consent: [person.consent ? 'Consent form marked missing' : 'Consent form marked received', () => updatePerson(p.id, person.id, { consent: !person.consent })],
          trained: [person.trained ? 'Training marked not done' : 'Training marked done', () => updatePerson(p.id, person.id, { trained: !person.trained })],
        }[key];
        if (key === 'role') {
          teamRolePicker(person);
          return;
        }
        if (key === 'remove') {
          const ok = await confirmDialog({
            title: `Remove ${person.n} from the roster?`,
            body: 'They come off this project’s roster and its setup steps. You can add them again later.',
            confirmLabel: 'Remove from roster',
          });
          if (ok) {
            removePerson(p.id, person.id);
            setSelected((sel) => sel.filter((i) => i !== person.id));
            toast({ title: 'Removed from roster', message: person.n, tone: 'ok' });
          }
          return;
        }
        if (!done) return;
        done[1]();
        toast({ title: done[0], message: person.n, tone: 'ok', timeout: 2200 });
      }
    );
  }

  function bulkMenu(e) {
    const n = selected.length;
    menuFromEvent(
      e,
      [
        { key: 'active', label: `Mark ${n} active`, icon: 'check' },
        { key: 'waitlist', label: `Move ${n} to waitlist`, icon: 'clock' },
        { key: 'export', label: 'Download selection as CSV', icon: 'download' },
        { sep: true },
        { key: 'clear', label: 'Clear selection', icon: 'x' },
      ],
      (key) => {
        if (key === 'active' || key === 'waitlist') {
          selected.forEach((id) => updatePerson(p.id, id, { st: key === 'active' ? 'Active' : 'Waitlist' }));
          toast({ title: key === 'active' ? `Marked ${n} active` : `Moved ${n} to waitlist`, tone: 'ok' });
          setSelected([]);
        } else if (key === 'export') {
          const subset = { ...p, people: p.people.filter((x) => selected.includes(x.id)) };
          download('roster-selection.csv', rosterCSV(subset));
          toast({ title: 'Downloaded roster-selection.csv', message: plural(subset.people.length, 'person', 'people'), tone: 'ok' });
        } else if (key === 'clear') setSelected([]);
      }
    );
  }

  const toggleRow = (id) => setSelected((sel) => (sel.includes(id) ? sel.filter((i) => i !== id) : [...sel, id]));
  const COLS = 'grid-template-columns:26px 2fr 1.2fr 1fr .7fr .8fr 1.2fr 92px';

  const rowActions = (x) => (
    <div style={S('display:flex;gap:6px;justify-content:flex-end;flex:none')}>
      <Pressable label={`Add a note on ${x.n}`} onClick={() => noteFor(x)} className={cx(H.secondary, H.press)} style={S(SMALL_BTN)}>
        Note
      </Pressable>
      <Pressable label={`More actions for ${x.n}`} expanded={false} onClick={(e) => personMenu(e, x)} className={cx(H.secondary, H.press)} style={S(`${SMALL_BTN};padding:0 8px`)}>
        <Icon name="more" size={15} />
      </Pressable>
    </div>
  );

  const statusChip = (x) => {
    const t = tone(PERSON_TONE, x.st);
    return <span style={S(`display:inline-block;padding:5px 9px;border-radius:7px;background:${t.stBg};font:500 12px/1 Geist;color:${t.stColor}`)}>{statusLabel(x.st)}</span>;
  };

  return (
    <div style={S('margin-top:22px')}>
      <p style={S('margin:0;padding:2px 2px 0;font:450 14px/1.4 Geist;color:#57504A')}>{summary}</p>

      {matches.length ? (
        <section aria-label="Possible matches on your roster" style={S('margin-top:16px;padding:16px 20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3;display:flex;flex-direction:column;gap:14px')}>
          {matches.map((m, i) => {
            const where = schoolLine(m.row);
            return (
              <div key={m.appId} className="vu-stack vu-stack-gap" style={s('display:flex;align-items:center;justify-content:space-between;gap:16px', i ? 'padding-top:14px;border-top:1px solid #EFE3DC' : '')}>
                <div style={S('min-width:0')}>
                  <h2 style={S(`margin:0;${LABEL}`)}>Same person?</h2>
                  <p style={S('margin:6px 0 0;font:450 13px/1.5 Geist;color:#57504A')}>
                    {m.added.n} joined through your join link. Your roster already has someone you added with that name{where ? ` (${where})` : ''}.
                    Link them only if it's the same student. Their account gets that row's hours, notes and attendance.
                  </p>
                </div>
                <div style={S('display:flex;gap:9px;flex:none;flex-wrap:wrap')}>
                  <Pressable label={`Link to ${m.row.n}`} onClick={() => linkMatch(m)} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
                    Link to {m.row.n}
                  </Pressable>
                  <Pressable label={`Keep ${m.row.n} separate`} onClick={() => keepSeparate(m)} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
                    Keep separate
                  </Pressable>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <div style={S('margin-top:16px;border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
          <div style={S('display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap;min-width:0')}>
            <input
              type="search"
              value={draftQuery}
              placeholder="Search name, school or tag"
              aria-label="Search people"
              onChange={(e) => {
                setDraftQuery(e.target.value);
                setParam({ pq: e.target.value, ppage: null });
              }}
              className={H.input}
              style={S('flex:1 1 220px;max-width:340px;min-width:0;width:100%;height:38px;padding:0 13px;border-radius:10px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 14px/1.15 Geist;color:#1A1714;transition:border-color .16s ease')}
            />
            <Pressable
              label={`Filter by status, now ${status === 'all' ? 'all statuses' : statusLabel(status)}`}
              expanded={false}
              onClick={(e) => menuFromEvent(e, STATUSES.map((v) => ({ key: v, label: v === 'all' ? 'All statuses' : statusLabel(v), checked: v === status })), (v) => setParam({ pstatus: v === 'all' ? null : v, ppage: null }))}
              className={cx(H.secondary, H.press)}
              style={S(FILTER_BTN)}
            >
              {status === 'all' ? 'All statuses' : statusLabel(status)}
              <Icon name="chevron-down" size={13} />
            </Pressable>
            <Pressable
              label={`Filter by role, now ${role === 'all' ? 'all roles' : role}`}
              expanded={false}
              onClick={(e) => menuFromEvent(e, roles.map((v) => ({ key: v, label: v === 'all' ? 'All roles' : v, checked: v === role })), (v) => setParam({ prole: v === 'all' ? null : v, ppage: null }))}
              className={cx(H.secondary, H.press)}
              style={S(FILTER_BTN)}
            >
              {role === 'all' ? 'All roles' : role}
              <Icon name="chevron-down" size={13} />
            </Pressable>
          </div>
          <div style={S('display:flex;gap:9px;flex:none;flex-wrap:wrap')}>
            {selected.length ? (
              <Pressable label={`Actions for ${selected.length} selected`} expanded={false} onClick={bulkMenu} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
                {selected.length} selected
                <Icon name="chevron-down" size={13} />
              </Pressable>
            ) : (
              <Pressable label="Import from a list" onClick={importList} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
                <Icon name="upload" size={14} />
                Import from a list
              </Pressable>
            )}
            <Pressable label="Add student" onClick={addStudent} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
              <Icon name="plus" size={14} />
              Add student
            </Pressable>
          </div>
        </div>

        {rows.length && narrow ? (
          <div>
            <label style={S('display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:450 13px/1 Geist;color:#57504A;cursor:pointer')}>
              <input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))} style={S('appearance:auto;-webkit-appearance:checkbox;width:16px;height:16px;accent-color:#C2603C;cursor:pointer')} />
              Select all on this page
            </label>
            {rows.map((x) => {
              const on = selected.includes(x.id);
              return (
                <div key={x.id} style={s('padding:14px 20px;border-bottom:1px solid #F1EBE4', on ? 'background:#FAF6F3' : '')}>
                  <div style={S('display:flex;align-items:center;gap:12px')}>
                    <input type="checkbox" aria-label={`Select ${x.n}`} checked={on} onChange={() => toggleRow(x.id)} style={S('appearance:auto;-webkit-appearance:checkbox;width:16px;height:16px;flex:none;accent-color:#C2603C;cursor:pointer')} />
                    <Pressable label={`Open ${x.n}'s profile`} onClick={() => personProfile(x)} style={S('display:flex;align-items:center;gap:11px;cursor:pointer;min-width:0;flex:1')}>
                      <div style={S('width:34px;height:34px;border-radius:50%;overflow:hidden;flex:none')}>
                        <Avatar name={x.n} fs={13} />
                      </div>
                      <div style={S('min-width:0')}>
                        <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>{x.n}</div>
                        <div className="vu-trunc" style={S('margin-top:3px;font:450 12px/1.2 Geist;color:#6B635C')}>{schoolLine(x)}</div>
                      </div>
                    </Pressable>
                    {rowActions(x)}
                  </div>
                  <div style={S('margin-top:10px;padding-left:28px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font:450 12px/1.3 Geist;color:#57504A')}>
                    {statusChip(x)}
                    <span>{x.role}</span>
                    <span style={S(`font-family:${MONO}`)}>{fmtHrs(x.hrs)} hrs</span>
                    {x.last ? <span style={S('color:#6B635C')}>Last seen {x.last}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : rows.length ? (
          <div className="vu-table-wrap" style={S('position:relative')}>
            <div role="table" aria-label="Roster">
              <div role="row" style={S(`display:grid;${COLS};gap:12px;padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 12px/1.2 Geist;color:#6B635C`)}>
                <div role="columnheader">
                  <input
                    type="checkbox"
                    aria-label="Select all people on this page"
                    checked={allOnPage}
                    onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))}
                    style={S('appearance:auto;-webkit-appearance:checkbox;width:15px;height:15px;accent-color:#C2603C;cursor:pointer')}
                  />
                </div>
                <div role="columnheader">Student</div><div role="columnheader">Role</div><div role="columnheader">Status</div><div role="columnheader">Hours</div><div role="columnheader">Last seen</div><div role="columnheader">Tags</div><div role="columnheader"><span className="vu-sr">Actions</span></div>
              </div>
              {rows.map((x) => {
                const on = selected.includes(x.id);
                return (
                  <div
                    key={x.id}
                    role="row"
                    className={H.row}
                    style={s(`display:grid;${COLS};gap:12px;padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease`, on ? 'background:#FAF6F3' : '')}
                  >
                    <div role="cell">
                      <input type="checkbox" aria-label={`Select ${x.n}`} checked={on} onChange={() => toggleRow(x.id)} style={S('appearance:auto;-webkit-appearance:checkbox;width:15px;height:15px;border-radius:4px;accent-color:#C2603C;cursor:pointer')} />
                    </div>
                    <div role="cell" style={S('min-width:0')}>
                    <Pressable label={`Open ${x.n}'s profile`} onClick={() => personProfile(x)} style={S('display:flex;align-items:center;gap:11px;cursor:pointer;min-width:0')}>
                      <div style={S('width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none')}>
                        <Avatar name={x.n} fs={12} />
                      </div>
                      <div style={S('min-width:0')}>
                        <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{x.n}</div>
                        <div className="vu-trunc" style={S('margin-top:3px;font:450 12px/1.2 Geist;color:#6B635C')}>{schoolLine(x)}</div>
                      </div>
                    </Pressable>
                    </div>
                    <div role="cell" className="vu-trunc" style={S('font:450 13px/1.2 Geist;color:#332D28')}>{x.role}</div>
                    <div role="cell">{statusChip(x)}</div>
                    <div role="cell" style={S(`font:500 13px/1 ${MONO};color:#332D28`)}>{fmtHrs(x.hrs)}</div>
                    <div role="cell" style={S('font:450 12px/1.2 Geist;color:#6B635C')}>{x.last}</div>
                    <div role="cell" style={S('display:flex;gap:5px;flex-wrap:wrap')}>
                      {x.tags.map((t2) => (
                        <span key={t2} style={S('padding:4px 7px;border-radius:6px;background:#F6F2EE;font:500 11px/1 Geist;color:#57504A')}>{t2}</span>
                      ))}
                    </div>
                    <div role="cell">{rowActions(x)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={S('padding:8px 20px')}>
            <EmptyState
              compact
              icon={filtering ? 'search' : 'users'}
              title={filtering ? 'Nobody matches that' : 'No one on the roster yet'}
              body={filtering ? 'Clear the search or widen the status and role filters.' : 'Accept an application or add a student yourself.'}
              cta={filtering ? 'Clear filters' : 'Add student'}
              onCta={() => {
                if (filtering) {
                  setDraftQuery('');
                  setParam({ pq: null, pstatus: null, prole: null, ppage: null });
                } else addStudent();
              }}
            />
          </div>
        )}

        <div style={S('padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font:450 13px/1.2 Geist;color:#6B635C')}>
          <div>
            {rows.length ? `${(safePage - 1) * PAGE + 1}-${(safePage - 1) * PAGE + rows.length}` : '0'} of {plural(filtered.length, 'person', 'people')}
            {filtered.length !== p.people.length ? ` (filtered from ${p.people.length})` : ''}
          </div>
          {pages > 1 ? (
            <div style={S('display:flex;gap:8px')}>
              <Pressable
                label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setParam({ ppage: safePage - 1 })}
                className={cx(safePage > 1 ? H.secondary : '', H.press)}
                style={s(SMALL_BTN, `cursor:${safePage > 1 ? 'pointer' : 'default'}`, safePage <= 1 ? 'opacity:.45' : '')}
              >
                Previous
              </Pressable>
              <Pressable
                label="Next page"
                disabled={safePage >= pages}
                onClick={() => setParam({ ppage: safePage + 1 })}
                className={cx(safePage < pages ? H.secondary : '', H.press)}
                style={s(SMALL_BTN, `cursor:${safePage < pages ? 'pointer' : 'default'}`, safePage >= pages ? 'opacity:.45' : '')}
              >
                Next
              </Pressable>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Pick a team role for one roster row. A member who joined through the link
    gets it on their application (the same place Tasks writes it), so they see
    the role and its briefing. A row the lead added keeps it on the roster. */
function TeamRoleForm({ api, project, person, app }) {
  const roles = taskRoles(project);
  const current = app ? (app.assignment && app.assignment.role && app.assignment.role.id) || '' : person.teamRoleId || '';
  const [roleId, setRoleId] = useState(roles.some((r) => r.id === current) ? current : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const role = roles.find((r) => r.id === roleId) || null;
    if (app) {
      setBusy(true);
      setErr('');
      let res;
      try {
        res = await setMemberAssignment(app.id, { role: role ? { id: role.id, name: role.name, briefing: role.briefing, color: role.color } : null });
      } catch (e) {
        res = { ok: false, error: e };
      }
      setBusy(false);
      if (!res.ok) {
        console.error('[lead] could not save team role', res.error);
        setErr("Couldn't save the role. Check your connection and try again.");
        return;
      }
      window.dispatchEvent(new Event('vu:applications-changed'));
    } else {
      updatePerson(project.id, person.id, { teamRoleId: role ? role.id : null });
    }
    api.close();
    toast({ title: role ? 'Role saved' : 'Role cleared', message: role ? `${person.n} is now ${role.name}` : person.n, tone: 'ok', timeout: 2200 });
  }

  if (!roles.length) {
    return (
      <div>
        <div style={S('font:450 14px/1.5 Geist;color:#57504A')}>This team has no roles yet. Add one on the Tasks tab first.</div>
        <div style={S('margin-top:18px;display:flex;justify-content:flex-end')}>
          <Pressable label="Close" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
            Close
          </Pressable>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Select label="Team role" value={roleId} options={[{ v: '', l: NO_TEAM_ROLE }, ...roles.map((r) => ({ v: r.id, l: r.name }))]} onChange={setRoleId} />
      {err ? <div role="alert" style={S('margin-top:10px;font:450 13px/1.4 Geist;color:#A8482A')}>{err}</div> : null}
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
          Cancel
        </Pressable>
        <Pressable label="Save role" disabled={busy} onClick={save} className={cx(H.primary, H.press)} style={s(MODAL_PRIMARY, busy ? 'opacity:.6;cursor:default' : '')}>
          {busy ? 'Saving role' : 'Save role'}
        </Pressable>
      </div>
    </div>
  );
}

function PersonProfile({ api, project, person, onNote, onRole }) {
  const st = tone(PERSON_TONE, person.st);
  const facts = [
    { l: isTeam(project) ? 'Role' : 'Position', v: person.role },
    { l: 'Hours', v: `${fmtHrs(person.hrs)} hrs` },
    { l: 'Last seen', v: person.last },
  ].filter((f) => f.v);
  const flag = (ok, yes, no) => (
    <span style={S(`display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:${ok ? '#EAF3EC' : '#FDF3E7'};font:500 12px/1 Geist;color:${ok ? '#3F6B4E' : '#8A5A20'}`)}>
      <Icon name={ok ? 'check' : 'alert'} size={13} />
      {ok ? yes : no}
    </span>
  );
  return (
    <div style={S('display:flex;flex-direction:column;gap:16px')}>
      <div style={S('display:flex;align-items:center;gap:14px')}>
        <div style={S('width:52px;height:52px;border-radius:50%;overflow:hidden;flex:none')}>
          <Avatar name={person.n} fs={18} />
        </div>
        <div style={S('min-width:0;flex:1')}>
          <div style={S('font:600 18px/1.2 Geist;letter-spacing:-0.02em')}>{person.n}</div>
          <div style={S('margin-top:4px;font:450 13px/1.3 Geist;color:#6B635C')}>{schoolLine(person)}</div>
        </div>
        <span style={S(`flex:none;padding:5px 9px;border-radius:7px;background:${st.stBg};font:500 12px/1 Geist;color:${st.stColor}`)}>{statusLabel(person.st)}</span>
      </div>

      <dl style={S('margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;padding:12px 0;border-top:1px solid #F1EBE4;border-bottom:1px solid #F1EBE4')}>
        {facts.map((f) => (
          <div key={f.l}>
            <dt style={S('font:450 12px/1.2 Geist;color:#6B635C')}>{f.l}</dt>
            <dd style={S('margin:5px 0 0;font:600 15px/1.25 Geist;color:#1A1714')}>{f.v}</dd>
          </div>
        ))}
      </dl>

      <div style={S('display:flex;gap:8px;flex-wrap:wrap')}>
        {flag(person.consent, 'Parent consent form received', 'Parent consent form not received')}
        {flag(person.trained, 'Training done', 'Training not done')}
      </div>

      {person.tags.length ? (
        <div>
          <div style={S('font:500 13px/1.2 Geist;color:#57504A')}>Tags</div>
          <div style={S('margin-top:8px;display:flex;gap:6px;flex-wrap:wrap')}>
            {person.tags.map((tg) => (
              <span key={tg} style={S('padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 Geist;color:#57504A')}>{tg}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div style={S('font:500 13px/1.2 Geist;color:#57504A')}>Notes</div>
        {person.notes.length ? (
          <div style={S('margin-top:8px;display:flex;flex-direction:column;gap:8px')}>
            {person.notes.map((nn, i) => (
              <div key={nn.id || i} className="vu-break" style={S('padding:10px 12px;border-radius:10px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13px/1.5 Geist;color:#332D28')}>
                {typeof nn === 'string' ? nn : nn.t || nn.text}
              </div>
            ))}
          </div>
        ) : (
          <div style={S('margin-top:8px;font:450 13px/1.4 Geist;color:#6B635C')}>No notes yet.</div>
        )}
      </div>

      <div style={S('display:flex;gap:10px;margin-top:4px;flex-wrap:wrap')}>
        <Pressable label="Add a note" onClick={onNote} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>
          Add a note
        </Pressable>
        {onRole ? (
          <Pressable label={person.role === NO_TEAM_ROLE ? `Give ${person.n} a role` : `Change ${person.n}'s role`} onClick={onRole} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
            {person.role === NO_TEAM_ROLE ? 'Give a role' : 'Change role'}
          </Pressable>
        ) : null}
        <Pressable label="Close" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
          Close
        </Pressable>
      </div>
    </div>
  );
}

function ConsentCheck({ checked, onChange }) {
  return (
    <label style={S('margin-top:14px;display:flex;align-items:flex-start;gap:10px;cursor:pointer;font:450 13px/1.45 Geist;color:#332D28')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={S('appearance:auto;-webkit-appearance:checkbox;margin-top:2px;width:16px;height:16px;flex:none;accent-color:#C2603C;cursor:pointer')} />
      <span>
        I already have their parent consent form
        <span style={S('display:block;margin-top:2px;font-size:12px;color:#6B635C')}>Leave this off if you haven't collected it yet.</span>
      </span>
    </label>
  );
}

function AddPersonForm({ api, project }) {
  const { state } = useSnapshot();
  const mySchool = (state.account && state.account.school) || '';
  const [f, setF] = useState({ n: '', school: mySchool, grade: '10', positionId: project.positions[0] ? project.positions[0].id : '', consent: false });
  const [err, setErr] = useState({});
  const submit = () => {
    const e = {};
    if (!f.n.trim() || !f.n.trim().includes(' ')) e.n = 'Enter their first and last name.';
    if (!f.school.trim()) e.school = 'Enter their school.';
    setErr(e);
    if (Object.keys(e).length) return;
    const pos = project.positions.find((x) => x.id === f.positionId);
    addPerson(project.id, { n: f.n.trim(), school: f.school.trim(), grade: f.grade, role: pos ? pos.t : 'Volunteer', positionId: f.positionId, consentOnFile: f.consent });
    api.close();
    toast({ title: 'Added to roster', message: `${f.n.trim()} is on the roster. They weren’t notified.`, tone: 'ok' });
  };
  return (
    <div>
      <Field label="Full name" value={f.n} onChange={(v) => setF((x) => ({ ...x, n: v }))} placeholder="e.g. Ana Castillo" required error={err.n} maxLength={60} onEnter={submit} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="School" value={f.school} onChange={(v) => setF((x) => ({ ...x, school: v }))} placeholder="e.g. Riverside High" required error={err.school} maxLength={60} />
        <Select label="Grade" value={f.grade} options={GRADES} onChange={(v) => setF((x) => ({ ...x, grade: v }))} />
      </div>
      {project.positions.length ? (
        <div style={S('margin-top:14px')}>
          <Select
            label="Position"
            value={f.positionId}
            options={project.positions.map((pos) => ({ v: pos.id, l: `${pos.t} (${positionLabel(pos)} filled)` }))}
            onChange={(v) => setF((x) => ({ ...x, positionId: v }))}
          />
        </div>
      ) : null}
      <ConsentCheck checked={f.consent} onChange={(v) => setF((x) => ({ ...x, consent: v }))} />
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
          Cancel
        </Pressable>
        <Pressable label="Add student" onClick={submit} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>
          Add student
        </Pressable>
      </div>
    </div>
  );
}

function ImportForm({ api, project }) {
  const [text, setText] = useState('');
  const parsed = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(',').map((x) => x.trim()))
    .filter((parts) => parts[0]);
  const valid = parsed.filter((r) => r.length >= 3 && r[0].includes(' ') && r[1] && /^\d{1,2}$/.test(r[2]) && Number(r[2]) >= 6 && Number(r[2]) <= 12);
  const bad = parsed.length - valid.length;
  const submit = () => {
    if (!valid.length) return;
    const pos = project.positions[0];
    valid.forEach(([n, school, grade]) => addPerson(project.id, { n, school, grade, role: pos ? pos.t : 'Volunteer', positionId: pos ? pos.id : null }));
    api.close();
    toast({ title: `Imported ${plural(valid.length, 'student')}`, message: 'They’re on the roster as Added. Nobody was notified.', tone: 'ok' });
  };
  return (
    <div>
      <label htmlFor="imp" style={S('font:500 13px/1 Geist;color:#57504A')}>Your list</label>
      <textarea
        id="imp"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Ana Castillo, Riverside High, 11\nMarcus Bell, Riverside High, 12'}
        className={H.input}
        style={S('margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:140px;font:450 14px/1.6 Geist;color:#332D28')}
      />
      {parsed.length ? (
        <div className="vu-hint" aria-live="polite" style={S(`margin-top:8px;font:450 13px/1.4 Geist;color:${bad ? '#8A5A20' : '#3F6B4E'}`)}>
          {bad
            ? `${valid.length} of ${plural(parsed.length, 'row')} ready. Each row needs a full name, a school and a grade from 6 to 12.`
            : `${plural(valid.length, 'row')} ready to import.`}
        </div>
      ) : null}
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
          Cancel
        </Pressable>
        <Pressable
          label={valid.length ? `Import ${plural(valid.length, 'student')}` : 'Import students'}
          disabled={!valid.length}
          onClick={submit}
          className={cx(H.primary, H.press)}
          style={s(MODAL_PRIMARY, !valid.length ? 'opacity:.5;cursor:default' : '')}
        >
          {valid.length ? `Import ${plural(valid.length, 'student')}` : 'Import students'}
        </Pressable>
      </div>
    </div>
  );
}

function NoteForm({ api, project, person }) {
  const [text, setText] = useState('');
  const save = () => {
    if (!text.trim()) return;
    addNote(project.id, person.id, text.trim());
    api.close();
    toast({ title: 'Note saved', message: person.n, tone: 'ok' });
  };
  return (
    <div>
      {person.notes.length ? (
        <div style={S('margin-bottom:16px;display:flex;flex-direction:column;gap:8px;max-height:180px;overflow:auto')}>
          {person.notes.map((n, i) => (
            <div key={n.id || i} style={S('padding:12px 14px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4')}>
              <div className="vu-break" style={S('font:450 13px/1.5 Geist;color:#332D28')}>{typeof n === 'string' ? n : n.t || n.text}</div>
              {n.w ? <div style={S('margin-top:6px;font:450 12px/1 Geist;color:#6B635C')}>{sentence(n.w)}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
      <label htmlFor={`note-${person.id}`} className="vu-sr">Note</label>
      <textarea
        id={`note-${person.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={400}
        placeholder="e.g. Prefers the early shift. Great with the younger kids."
        className={H.input}
        style={S('display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:100px;font:450 14px/1.55 Geist;color:#332D28')}
      />
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
          Cancel
        </Pressable>
        <Pressable label="Save note" disabled={!text.trim()} onClick={save} className={cx(H.primary, H.press)} style={s(MODAL_PRIMARY, !text.trim() ? 'opacity:.5;cursor:default' : '')}>
          Save note
        </Pressable>
      </div>
    </div>
  );
}

/* ---- positions ---------------------------------------------------------- */

const REQUIREMENTS = ['Guardian consent', 'Media release', 'Food handling', 'Reading training', 'Transport form'];

function Positions({ p }) {
  function editPosition(pos) {
    openModal({
      title: pos ? `Edit ${pos.t}` : 'Add a position',
      subtitle: pos ? '' : 'A role people can fill on this project, like Reading tutor or Snack table.',
      Body: function PosBody({ api }) {
        return <PositionForm api={api} project={p} pos={pos} />;
      },
    });
  }

  return (
    <div className="vu-split" style={S('margin-top:22px;display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;min-width:0')}>
        <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Positions</h2>
          <Pressable label="Add position" onClick={() => editPosition(null)} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
            <Icon name="plus" size={14} />
            Add position
          </Pressable>
        </div>
        {p.positions.length ? (
          p.positions.map((x) => (
            <div key={x.id} style={S('padding:18px 20px;border-bottom:1px solid #F1EBE4')}>
              <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
                <div style={S('min-width:0')}>
                  <div style={S('display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>
                    <div style={S('font:600 16px/1.2 Geist;letter-spacing:-0.02em')}>{x.t}</div>
                    <div style={S('padding:4px 8px;border-radius:6px;background:#F6F2EE;font:500 12px/1 Geist;color:#57504A')}>{positionLabel(x)} filled</div>
                    {x.open ? null : <div style={S('padding:4px 8px;border-radius:6px;background:#F6F2EE;font:500 12px/1 Geist;color:#57504A')}>Closed</div>}
                  </div>
                  {x.note ? <div style={S('margin-top:7px;font:450 13px/1.4 Geist;color:#6B635C')}>{x.note}</div> : null}
                </div>
                <div style={S('display:flex;gap:8px;flex:none')}>
                  <Pressable label={`Edit ${x.t}`} onClick={() => editPosition(x)} className={cx(H.secondary, H.press)} style={S(SMALL_BTN)}>
                    Edit
                  </Pressable>
                  <Pressable
                    label={`Duplicate ${x.t}`}
                    onClick={() => {
                      const copy = duplicatePosition(p.id, x.id);
                      if (copy) toast({ title: 'Position duplicated', message: `${copy.t} is right below the original.`, tone: 'ok' });
                    }}
                    className={cx(H.secondary, H.press)}
                    style={S(SMALL_BTN)}
                  >
                    Duplicate
                  </Pressable>
                </div>
              </div>
              <dl style={S('margin:14px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px')}>
                {[
                  { l: 'Minimum age', v: x.age },
                  { l: 'Training', v: plainLabel(x.train) },
                  { l: 'Commitment', v: x.commit },
                  { l: 'Applications', v: positionAppsLabel(p, x) },
                ].map((k) => (
                  <div key={k.l}>
                    <dt style={S('font:450 12px/1.2 Geist;color:#6B635C')}>{k.l}</dt>
                    <dd style={S('margin:6px 0 0;font:500 13px/1.3 Geist;color:#1A1714')}>{k.v}</dd>
                  </div>
                ))}
              </dl>
              {(x.requirements || []).length ? (
                <div style={S('margin-top:12px;font:450 12px/1.4 Geist;color:#57504A')}>Needs: {x.requirements.join(', ')}</div>
              ) : null}
            </div>
          ))
        ) : (
          <div style={S('padding:8px 20px 20px')}>
            <EmptyState compact icon="list" title="No positions yet" body="A position is what students apply for, like Reading tutor." cta="Add position" onCta={() => editPosition(null)} />
          </div>
        )}
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px;min-width:0')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Spots filled</h2>
          {p.positions.length ? (
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
              {p.positions.map((x) => {
                const pct = x.slots ? Math.min(100, Math.round((x.filledCount / x.slots) * 100)) : 0;
                return (
                  <div key={x.id}>
                    <div style={S('display:flex;justify-content:space-between;gap:10px;font:450 13px/1.2 Geist;color:#332D28')}>
                      <span className="vu-trunc">{x.t}</span>
                      <span style={S('flex:none;color:#57504A')}>{x.filledCount} of {x.slots}</span>
                    </div>
                    <div role="progressbar" aria-label={`${x.t} spots filled`} aria-valuemin={0} aria-valuemax={x.slots} aria-valuenow={x.filledCount} style={S('margin-top:7px;height:6px;border-radius:4px;background:#F1EBE4;overflow:hidden')}>
                      <div style={s(`width:${pct}%`, 'height:100%;border-radius:4px;background:#C2603C;transition:width .36s cubic-bezier(.16,1,.3,1)')} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={S('margin-top:10px;font:450 13px/1.5 Geist;color:#6B635C')}>Add a position to track how many spots are filled.</div>
          )}
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Requirements</h2>
          <div style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:7px')}>
            {REQUIREMENTS.map((r) => {
              const used = p.positions.filter((x) => (x.requirements || []).includes(r));
              return (
                <Pressable
                  key={r}
                  label={`Where ${r} is required`}
                  onClick={() =>
                    toast({
                      title: r,
                      message: used.length ? `Needed for ${used.map((u) => u.t).join(', ')}.` : 'No position needs this yet. Add it when you edit a position.',
                      tone: used.length ? 'brand' : 'warn',
                    })
                  }
                  className={cx(H.secondary, H.press)}
                  style={S(`${SMALL_BTN};height:32px`)}
                >
                  {r}
                  {used.length ? <span style={S(`font:500 11px/1 ${MONO};color:#A8482A`)}>{used.length}</span> : null}
                </Pressable>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const TRAINING_OPTS = ['None', 'Required · 15 min', 'Required · 30 min', 'Required · 45 min', 'Food handling'];

function PositionForm({ api, project, pos }) {
  const [f, setF] = useState({
    t: pos ? pos.t : '',
    slots: pos ? String(pos.slots) : '2',
    age: pos ? pos.age : '13+',
    train: pos ? pos.train : 'None',
    commit: pos ? pos.commit : '1 hr weekly',
    note: pos ? pos.note : '',
    requirements: pos ? (pos.requirements || []).slice() : [],
    open: pos ? pos.open !== false : true,
  });
  const [err, setErr] = useState({});
  const trainOpts = Array.from(new Set([...TRAINING_OPTS, f.train].filter(Boolean))).map((v) => ({ v, l: plainLabel(v) }));
  const commitOpts = Array.from(new Set(['1 hr monthly', '1 hr weekly', '2 hrs weekly', '2.5 hrs weekly', '4 hrs weekly', f.commit].filter(Boolean)));

  const save = () => {
    const e = {};
    if (!f.t.trim()) e.t = 'Enter a position name.';
    const n = Number(f.slots);
    if (!n || n < 1 || n > 200) e.slots = 'Enter a number from 1 to 200.';
    setErr(e);
    if (Object.keys(e).length) return;
    upsertPosition(project.id, { ...(pos ? { id: pos.id } : {}), ...f, t: f.t.trim(), slots: n, minAge: Number(String(f.age).replace(/\D/g, '')) || 13 });
    api.close();
    toast({ title: pos ? 'Position saved' : 'Position added', message: f.t.trim(), tone: 'ok' });
  };

  return (
    <div>
      <Field label="Position name" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} placeholder="e.g. Reading tutor" required error={err.t} maxLength={40} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Spots" value={f.slots} onChange={(v) => setF((x) => ({ ...x, slots: v.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" error={err.slots} />
        <Select label="Minimum age" value={f.age} options={['13+', '14+', '15+', '16+', '18+']} onChange={(v) => setF((x) => ({ ...x, age: v }))} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Select label="Training" value={f.train} options={trainOpts} onChange={(v) => setF((x) => ({ ...x, train: v }))} />
        <Select label="Commitment" value={f.commit} options={commitOpts} onChange={(v) => setF((x) => ({ ...x, commit: v }))} />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="What they do" value={f.note} onChange={(v) => setF((x) => ({ ...x, note: v }))} maxLength={90} placeholder="e.g. Read picture books with 1st graders" />
      </div>
      <div style={S('margin-top:16px')}>
        <div style={S('font:500 13px/1 Geist;color:#57504A')}>Requirements</div>
        <div style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
          {REQUIREMENTS.map((r) => (
            <Chip
              key={r}
              label={r}
              role="checkbox"
              py={8}
              px={12}
              fs={13}
              on={f.requirements.includes(r)}
              onClick={() => setF((x) => ({ ...x, requirements: x.requirements.includes(r) ? x.requirements.filter((y) => y !== r) : [...x.requirements, r] }))}
            />
          ))}
        </div>
      </div>
      <label style={S('margin-top:16px;display:flex;align-items:center;gap:10px;cursor:pointer;font:450 13px/1.3 Geist;color:#332D28')}>
        <input type="checkbox" checked={f.open} onChange={(e) => setF((x) => ({ ...x, open: e.target.checked }))} style={S('appearance:auto;-webkit-appearance:checkbox;width:16px;height:16px;accent-color:#C2603C;cursor:pointer')} />
        Open for applications
      </label>
      <div style={S('margin-top:18px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap')}>
        {pos ? (
          <Pressable
            label={`Delete ${pos.t}`}
            onClick={async () => {
              api.close();
              const ok = await confirmDialog({
                title: `Delete ${pos.t}?`,
                body: 'The position comes off this project. Students already in it stay on the roster.',
                confirmLabel: 'Delete position',
              });
              if (ok) {
                deletePosition(project.id, pos.id);
                toast({ title: 'Position deleted', message: pos.t, tone: 'ok' });
              }
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;gap:7px;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            <Icon name="trash" size={14} />
            Delete position
          </Pressable>
        ) : (
          <span />
        )}
        <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
            Cancel
          </Pressable>
          <Pressable label={pos ? 'Save position' : 'Add position'} onClick={save} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>
            {pos ? 'Save position' : 'Add position'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}

/* ---- shifts ------------------------------------------------------------- */

/** Past shifts read "Done" (the stored status says nothing about the calendar). */
function shiftLabel(x) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (x.st !== 'Cancelled' && parseSessionDate(x.d) < today) return 'Done';
  if (x.st === 'Complete') return 'Done';
  return sessionStatus(x);
}

function reminderOptions(label) {
  const l = String(label || '').toLowerCase();
  if (/text/.test(l)) return ['1 day before', '2 days before', '3 days before', 'Off'];
  if (/email|guardian|parent/.test(l)) return ['3 days before', '1 week before', '2 weeks before', 'Off'];
  if (/digest/.test(l)) return ['Mondays', 'Fridays', 'Monthly', 'Off'];
  return ['1 day before', '2 days before', '1 week before', 'Off'];
}

/** "Rosa Quintero, Lee Park and 3 more": at most `max` names on a row. */
function nameList(apps, max = 4) {
  const names = apps.map((a) => String(a.applicant_name || '').trim() || 'Volunteer');
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** The names under a shift row: who's coming, and who picked it but is
    still waiting on the lead. Renders nothing when nobody signed up. */
function SignUpNames({ su, style = '' }) {
  if (!su || (!su.going.length && !su.waiting.length)) return null;
  return (
    <div style={S(`display:flex;flex-direction:column;gap:3px;font:450 12px/1.4 Geist;color:#57504A;min-width:0;${style}`)}>
      {su.going.length ? (
        <div className="vu-trunc">
          <span style={S('color:#1A1714;font-weight:500')}>Signed up: </span>
          {nameList(su.going)}
        </div>
      ) : null}
      {su.waiting.length ? (
        <div className="vu-trunc">
          <span style={S('color:#8A5A20;font-weight:500')}>Waiting on you: </span>
          {nameList(su.waiting)}
        </div>
      ) : null}
    </div>
  );
}

function Shifts({ p, goTab, apps = [] }) {
  function editSession(ses) {
    const signUps = ses && p.listingId ? shiftSignUps(apps, ses.id) : null;
    openModal({
      title: ses ? `Edit ${ses.d}` : 'Add a shift',
      Body: function SesBody({ api }) {
        return (
          <SessionForm
            api={api}
            project={p}
            ses={ses}
            signUps={signUps}
            onReview={() => {
              api.close();
              goTab('applications');
            }}
          />
        );
      },
    });
  }

  async function regenerate() {
    const ok = await confirmDialog({
      title: 'Change the check-in code?',
      body: 'The current code stops working right away. Anyone who has it will need the new one.',
      confirmLabel: 'Change code',
    });
    if (!ok) return;
    const code = regenerateCode(p.id);
    toast({ title: 'Check-in code changed', message: `The new code is ${code}. Share it before the next shift.`, tone: 'ok' });
  }

  async function repeat() {
    if (!p.sessions.length) {
      toast({ title: 'Add a shift first', message: 'Repeat weekly copies your last shift.', tone: 'warn' });
      return;
    }
    const last = p.sessions[p.sessions.length - 1];
    const ok = await confirmDialog({
      title: 'Add 4 more weekly shifts?',
      body: `They copy ${last.d} (time, place and spots) for the next 4 weeks and start as drafts.`,
      confirmLabel: 'Add 4 shifts',
      tone: 'brand',
    });
    if (!ok) return;
    const n = repeatWeekly(p.id, 4);
    toast({ title: `Added ${plural(n, 'shift')}`, message: 'They’re drafts. Edit one to open it.', tone: 'ok' });
  }

  function reminder(r) {
    const options = Array.from(new Set([...reminderOptions(r.l), r.v].filter(Boolean)));
    openModal({
      title: r.l,
      subtitle: 'Pick when you plan to send it. VolunteerU doesn’t send these for you yet.',
      Body: function RemBody({ api }) {
        return (
          <div role="radiogroup" aria-label={r.l} style={S('display:flex;flex-direction:column;gap:10px')}>
            {options.map((o) => (
              <Pressable
                key={o}
                role="radio"
                aria-checked={r.v === o}
                label={o}
                onClick={() => {
                  setReminder(p.id, r.l, o);
                  api.close();
                  toast({ title: 'Reminder plan saved', message: `${r.l}, ${o.toLowerCase()}.`, tone: 'ok' });
                }}
                className={cx(H.chip, H.press)}
                style={s('padding:14px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between', `border:1px solid ${r.v === o ? '#C2603C' : '#E8E1D9'}`, `background:${r.v === o ? '#FAF6F3' : '#FCFAF8'}`)}
              >
                <span style={S('font:500 14px/1 Geist')}>{o}</span>
                {r.v === o ? <span style={S('color:#C2603C')}><Icon name="check" size={15} /></span> : null}
              </Pressable>
            ))}
          </div>
        );
      },
    });
  }

  const COLS = 'grid-template-columns:1.1fr 1.2fr 1.7fr .8fr .9fr 70px';
  const narrow = useNarrow();
  const toneOf = (label) => (label === 'Done' ? { stBg: '#F6F2EE', stColor: '#57504A' } : sessionTone(label));

  return (
    <div className="vu-split" style={S('margin-top:22px;display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;min-width:0')}>
        <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Shifts</h2>
          <div style={S('display:flex;gap:9px;flex-wrap:wrap')}>
            <Pressable label="Repeat weekly" onClick={repeat} className={cx(H.secondary, H.press)} style={S(`${BTN_SECONDARY};border-color:#E7C0AC;color:#A8482A`)}>
              <Icon name="refresh" size={14} />
              Repeat weekly
            </Pressable>
            <Pressable label="Add shift" onClick={() => editSession(null)} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
              <Icon name="plus" size={14} />
              Add shift
            </Pressable>
          </div>
        </div>
        {narrow && p.sessions.length ? (
          <ul aria-label="Shifts" style={S('margin:0;padding:0;list-style:none')}>
            {p.sessions.map((raw) => {
              const x = withFill(p, raw, apps);
              const label = shiftLabel(x);
              const t = toneOf(label);
              return (
                <li key={x.id} style={S('padding:14px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;gap:12px')}>
                  <div style={S('min-width:0;flex:1')}>
                    <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                      <span style={S('font:600 14px/1.2 Geist')}>{x.d}</span>
                      <span style={S('font:450 13px/1.2 Geist;color:#57504A')}>{fmtTime(x.t)}</span>
                    </div>
                    <div className="vu-trunc" style={S('margin-top:4px;font:450 12px/1.3 Geist;color:#6B635C')}>{x.loc}</div>
                    <div style={S('margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
                      <span style={S(`display:inline-block;padding:5px 9px;border-radius:7px;background:${t.stBg || t.bg};font:500 12px/1 Geist;color:${t.stColor || t.color}`)}>{label}</span>
                      <span style={S(`font:500 12px/1 ${MONO};color:#332D28`)}>{x.filledCount} of {x.cap} filled</span>
                    </div>
                    {p.listingId ? <SignUpNames su={shiftSignUps(apps, raw.id)} style="margin-top:8px" /> : null}
                  </div>
                  <Pressable label={`Edit shift ${x.d}`} onClick={() => editSession(raw)} className={cx(H.secondary, H.press)} style={S(SMALL_BTN)}>
                    Edit
                  </Pressable>
                </li>
              );
            })}
          </ul>
        ) : (
        <div className="vu-table-wrap" style={S('position:relative')}>
          <div role="table" aria-label="Shifts">
            <div role="row" style={S(`display:grid;${COLS};gap:12px;padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 12px/1.2 Geist;color:#6B635C`)}>
              <div role="columnheader">Date</div><div role="columnheader">Time</div><div role="columnheader">Location</div><div role="columnheader">Filled</div><div role="columnheader">Status</div><div role="columnheader"><span className="vu-sr">Actions</span></div>
            </div>
            {p.sessions.length ? (
              p.sessions.map((raw) => {
                const x = withFill(p, raw, apps);
                const label = shiftLabel(x);
                const t = toneOf(label);
                const su = p.listingId ? shiftSignUps(apps, raw.id) : null;
                return (
                  <div key={x.id} role="row" className={H.row} style={S(`display:grid;${COLS};gap:12px;padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease`)}>
                    <div role="cell" style={S('font:500 13px/1.2 Geist')}>{x.d}</div>
                    <div role="cell" style={S('font:450 13px/1.2 Geist;color:#57504A')}>{fmtTime(x.t)}</div>
                    <div role="cell" className="vu-trunc" style={S('font:450 13px/1.2 Geist;color:#57504A')}>{x.loc}</div>
                    <div role="cell" style={S(`font:500 13px/1 ${MONO}`)}>{x.filledCount} of {x.cap}</div>
                    <div role="cell">
                      <span style={S(`display:inline-block;padding:5px 9px;border-radius:7px;background:${t.stBg || t.bg};font:500 12px/1 Geist;color:${t.stColor || t.color}`)}>{label}</span>
                    </div>
                    <div role="cell" style={S('display:flex;justify-content:flex-end')}>
                      <Pressable label={`Edit shift ${x.d}`} onClick={() => editSession(raw)} className={cx(H.secondary, H.press)} style={S(SMALL_BTN)}>
                        Edit
                      </Pressable>
                    </div>
                    {su && (su.going.length || su.waiting.length) ? (
                      <div role="cell" style={S('grid-column:1 / -1;margin-top:-4px')}>
                        <SignUpNames su={su} />
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div style={S('padding:8px 20px 20px')}>
                <EmptyState compact icon="calendar" title="No shifts yet" body="Add 1 shift, then repeat it weekly to fill out the term." cta="Add shift" onCta={() => editSession(null)} />
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px;min-width:0')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Check-in code</h2>
          <div style={S(`margin-top:12px;font:600 30px/1 ${MONO};letter-spacing:.04em;font-variant-numeric:tabular-nums`)}>{p.checkinCode}</div>
          <div style={S('margin-top:9px;font:450 13px/1.5 Geist;color:#57504A')}>Volunteers enter this code when they arrive.</div>
          <Pressable label="Change the check-in code" onClick={regenerate} className={cx(H.secondary, H.press)} style={S(`margin-top:14px;${BTN_SECONDARY};height:36px;border-color:#E7C0AC;color:#A8482A`)}>
            Change code
          </Pressable>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Reminder plan</h2>
          <div style={S('margin-top:6px;font:450 13px/1.45 Geist;color:#6B635C')}>Not sent automatically. Post reminders on the Messages tab.</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px;font:450 13px/1.4 Geist;color:#57504A')}>
            {(p.reminders || []).map((r) => (
              <Pressable
                key={r.l}
                label={`Change ${r.l} plan, now ${r.v}`}
                onClick={() => reminder(r)}
                className={cx(H.toInk, H.press)}
                style={S('display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;transition:color .16s ease')}
              >
                <span>{r.l}</span>
                <span style={S('display:inline-flex;align-items:center;gap:4px;color:#1A1714;font-weight:500')}>
                  {r.v}
                  <Icon name="chevron-right" size={13} />
                </span>
              </Pressable>
            ))}
          </div>
          <Pressable label="Post a reminder" onClick={() => goTab && goTab('messages')} className={H.link} style={S('margin-top:14px;display:inline-flex;font:500 13px/1 Geist;color:#A8482A;cursor:pointer')}>
            Post a reminder
          </Pressable>
        </div>
      </div>
    </div>
  );
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "sat oct 24", "Oct 24" or "Sat, October 24" -> "Sat, Oct 24" with the right weekday; null when unreadable. */
function normalizeShiftDate(raw) {
  const m = /^(?:[A-Za-z]{3,9}\.?,?\s+)?([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})$/.exec(String(raw || '').trim());
  if (!m) return null;
  const mon = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  const day = Number(m[2]);
  const mi = MONTH_ABBR.indexOf(mon);
  if (mi < 0 || day < 1 || day > 31) return null;
  const at = parseSessionDate(`${mon} ${day}`);
  if (at.getMonth() !== mi || at.getDate() !== day) return null;
  return formatSessionDate(at);
}

/** Everyone who picked this shift on the join page, in the Edit dialog. */
function ShiftSignUpList({ su, onReview }) {
  const row = (a, waiting) => (
    <li key={a.id} style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid #F1EBE4')}>
      <div style={S('min-width:0')}>
        <div className="vu-trunc" style={S('font:500 14px/1.3 Geist;color:#1A1714')}>{String(a.applicant_name || '').trim() || 'Volunteer'}</div>
        {a.position ? <div className="vu-trunc" style={S('margin-top:2px;font:450 12px/1.3 Geist;color:#6B635C')}>{a.position}</div> : null}
      </div>
      {waiting ? (
        <span style={S('flex:none;padding:4px 8px;border-radius:6px;background:#FDF3E7;font:500 12px/1 Geist;color:#8A5A20')}>Waiting on you</span>
      ) : (
        <span style={S('flex:none;padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 12px/1 Geist;color:#3F6B4E')}>Member</span>
      )}
    </li>
  );
  const total = su.going.length + su.waiting.length;
  return (
    <section aria-label="Signed up for this shift" style={S('margin-top:18px')}>
      <h3 style={S(`margin:0;${LABEL}`)}>Signed up ({total})</h3>
      {total ? (
        <ul style={S('margin:8px 0 0;padding:0;list-style:none')}>
          {su.going.map((a) => row(a, false))}
          {su.waiting.map((a) => row(a, true))}
        </ul>
      ) : (
        <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>Nobody has picked this shift on the join page yet.</div>
      )}
      {su.waiting.length ? (
        <div style={S('margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font:450 13px/1.45 Geist;color:#6B635C')}>
          <span>Accept an applicant and they fill a spot.</span>
          {onReview ? (
            <Pressable label="Review applications" onClick={onReview} className={cx(H.secondary, H.press)} style={S(SMALL_BTN)}>
              Review applications
            </Pressable>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SessionForm({ api, project, ses, signUps = null, onReview }) {
  const [f, setF] = useState({
    d: ses ? ses.d : '',
    t: ses ? ses.t : '10:00 AM-12:00 PM',
    loc: ses ? ses.loc : project.siteShort,
    cap: ses ? String(ses.cap) : '9',
    st: ses ? ses.st : 'Draft',
  });
  const [err, setErr] = useState({});
  const statusOpts = Array.from(new Set(['Draft', 'Open', 'Needs', 'Staffed', 'Cancelled', f.st].filter(Boolean))).map((v) => ({ v, l: v === 'Needs' ? 'Needs people' : v === 'Complete' ? 'Done' : v }));

  const save = () => {
    const e = {};
    const d = normalizeShiftDate(f.d);
    if (!d) e.d = 'Enter a date like Sat, Oct 24.';
    const tErr = shiftTimeError(f.t);
    if (tErr) e.t = tErr;
    const cap = Number(f.cap);
    if (!cap || cap < 1 || cap > 500) e.cap = 'Enter a number from 1 to 500.';
    setErr(e);
    if (Object.keys(e).length) return;
    upsertSession(project.id, { ...(ses ? { id: ses.id } : {}), ...f, d, t: f.t.trim(), cap });
    api.close();
    toast({ title: ses ? 'Shift saved' : 'Shift added', message: `${d} at ${f.t.trim()}`, tone: 'ok' });
  };

  return (
    <div>
      <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Date" value={f.d} onChange={(v) => setF((x) => ({ ...x, d: v }))} placeholder="e.g. Sat, Oct 24" required error={err.d} />
        <Field label="Time" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} placeholder="e.g. 10:00 AM-12:00 PM" required error={err.t} />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Location" value={f.loc} onChange={(v) => setF((x) => ({ ...x, loc: v }))} maxLength={80} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Spots" value={f.cap} onChange={(v) => setF((x) => ({ ...x, cap: v.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" error={err.cap} />
        {ses ? <Select label="Status" value={f.st} options={statusOpts} onChange={(v) => setF((x) => ({ ...x, st: v }))} /> : <span />}
      </div>
      {signUps ? <ShiftSignUpList su={signUps} onReview={onReview} /> : null}
      <div style={S('margin-top:18px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap')}>
        {ses ? (
          <Pressable
            label={`Delete shift ${ses.d}`}
            onClick={async () => {
              api.close();
              const ok = await confirmDialog({
                title: `Delete ${ses.d}?`,
                body: 'It comes off the schedule. Nobody is notified, so tell your team on the Messages tab. To keep it listed as cancelled, set its status to Cancelled instead.',
                confirmLabel: 'Delete shift',
              });
              if (ok) {
                deleteSession(project.id, ses.id);
                toast({ title: 'Shift deleted', message: `${ses.d} is off the schedule.`, tone: 'ok' });
              }
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;gap:7px;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            <Icon name="trash" size={14} />
            Delete shift
          </Pressable>
        ) : (
          <span />
        )}
        <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>
            Cancel
          </Pressable>
          <Pressable label={ses ? 'Save shift' : 'Add shift'} onClick={save} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>
            {ses ? 'Save shift' : 'Add shift'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
