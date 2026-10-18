'use client';

/* ==========================================================================
   Lead.jsx, design screen: `isLead` (project workspace)
   Shell, tab bar, and the Overview / People / Positions / Shifts tabs.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, EmptyState, Field, Select, TextArea, Chip, Avatar, Icon, Button, StatusPill, StatusText, useHeldValue } from '../ui.jsx';
import { C, F, R, CAUSE } from '../../lib/tokens.js';
import { resolveCover, PHOTOS } from '../../lib/photos.js';
import DateBlock from '../vu/DateBlock.jsx';
import { useSnapshot, update as updateStore, getState } from '../../lib/store.js';
import { isPastShift, shiftDates, parseTimeRange } from '../../lib/calendar.js';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import CrossApplications from '../CrossApplications.jsx';
import TasksTab from '../lead/TasksTab.jsx';
import PipelineTab from '../lead/PipelineTab.jsx';
import AnnouncementBoard from '../AnnouncementBoard.jsx';
import MessageThread from '../MessageThread.jsx';
import {
  whenLabel, stampLabel,
  getProject, taskProgress, toggleTask, pendingApplications, pendingHours,
  positionLabel, positionAppsLabel, sessionStatus, shortSessions, filterPeople,
  copyText, upsertPosition, duplicatePosition, deletePosition,
  upsertSession, deleteSession, repeatWeekly, regenerateCode, addPerson, updatePerson,
  removePerson, addNote, rosterCSV, download, setActiveProject, projects as allProjects,
  isTeam, orgTypeLabel, taskStats, taskRoles, tasksOf, roleOf, pipelineFor,
  requestProjectVerification, parseSessionDate, formatSessionDate, uid, shortName, messageTemplateOptions,
} from '../../lib/db.js';
import { loadOwnerApplications, loadListingThreads, myShiftSignUps, shiftSignUpCount, setMemberAssignment, postAnnouncement } from '../../lib/listings.js';
import { createInvites, revokeInvite, inviteEmailError, inviteLink, inviteMailto, inviteSms, invitesAsText, EMAIL_MAX } from '../../lib/invites.js';
import {
  AttendanceTab, ApplicationsTab, HoursTab, QualityTab, MessagesTab, SettingsTab,
} from '../lead/Tabs.jsx';

/* ---- type and layout atoms (photo-first system, tokens from lib/tokens.js) ---- */

/** Section heading (h2): Funnel Display, sentence case, no eyebrow above it. */
const H2 = `margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;
/** Rail heading (h2 in the 312px rail). */
const H3 = `margin:0;font:600 18px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`;
/** Old card heading, kept for dialogs and small sub-sections. */
const LABEL = `font:600 15px/1.25 ${F.body};color:${C.ink}`;
const META = `font:400 14px/1.4 ${F.body};color:${C.ink2}`;
const SMALL = `font:400 13px/1.45 ${F.body};color:${C.ink2}`;
const NUM = 'font-variant-numeric:tabular-nums';
/** A row divided from the next by a 1px rule. */
const RULE = `border-bottom:1px solid ${C.line}`;
/** Native checkboxes in tables: 16px, ink when checked. */
const CHECK = `appearance:auto;-webkit-appearance:checkbox;width:16px;height:16px;flex:none;margin:0;accent-color:${C.ink};cursor:pointer`;
/** Underlined ink text action ("Manage people"), links are never colored. */
const TEXT_LINK = `font:600 14px/1.2 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;cursor:pointer;background:none;border:0;padding:0`;

/* Media-query rules for this screen (inline styles can't hold them).
   - Phones: the Next shift facts wrap without a "·" starting a line.
   - One column (< 1180px): the rail's needs block is hidden there, so the
     first visible rail section would add a rule and 28px on top of the grid
     gap. It starts flush instead. */
const LEAD_CSS = `
.vu-pl-row { display: grid; grid-template-columns: 220px minmax(0, 1fr); column-gap: 20px; row-gap: 12px; align-items: center; }
.vu-pl-row.has-end { grid-template-columns: 220px minmax(0, 1fr) auto; }
.vu-pl-end { display: flex; align-items: center; justify-content: flex-end; }
@media (max-width: 719px) {
  .vu-pl-row, .vu-pl-row.has-end { grid-template-columns: minmax(0, 1fr) auto; }
  .vu-pl-who { grid-column: 1; grid-row: 1; }
  .vu-pl-end { grid-column: 2; grid-row: 1; }
  .vu-pl-steps { grid-column: 1 / -1; grid-row: 2; }
}
@media (max-width: 719px) {
  .vu-lead-facts .vu-sep { display: none; }
  .vu-lead-facts { column-gap: 14px; }
}
@media (max-width: 1179px) {
  .vu-lead-aside > .vu-hide-mobile + .vu-rail-sec { margin-top: 0; padding-top: 0; border-top: 0; }
}
`;

/** An activity row's age from its stored time ("12 min ago", "Oct 18").
    Rows saved before times were stored and labeled "now" show no age
    rather than a "now" that never changes. */
function activityWhen(a) {
  const label = whenLabel(a);
  return a && a.at == null && /^(just )?now$/i.test(label.trim()) ? '' : label;
}

/** When someone was last at a shift. A real time wins; the old "Just now"
    label (written when attendance was posted) becomes the date of the latest
    posted shift they attended, and a row that was only added shows nothing. */
function lastSeen(p, x) {
  if (!x) return '';
  if (x.lastAt != null) return whenLabel({ at: x.lastAt });
  const saved = String(x.last || '').trim();
  if (!/^(just )?now$/i.test(saved)) return saved;
  let best = null;
  for (const meta of (p && p.attendanceSessions) || []) {
    if (!meta.posted) continue;
    const row = ((p.attendance && p.attendance[meta.id]) || []).find((r) => r.personId === x.id);
    if (!row || row.st === 'Absent' || !(Number(row.hrs) > 0)) continue;
    const at = parseSessionDate(meta.d);
    const t = at instanceof Date ? at.getTime() : NaN;
    if (Number.isFinite(t) && (!best || t > best.t)) best = { t, d: meta.d };
  }
  return best ? String(best.d).replace(/^[A-Za-z]{3},\s*/, '') : '';
}

/** "3" not "3.0", "2.5" not "2.48". */
function fmtHrs(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "LIVE" -> "Live", "created Sep 2" -> "Created Sep 2". */
/** "1 hr", "2.5 hrs". */
function hrsText(n) {
  const v = fmtHrs(n);
  return `${v} ${v === '1' ? 'hr' : 'hrs'}`;
}

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
  if (s || !x.appId) return s;
  return x.inviteId || x.viaInvite ? 'Joined with your invite link' : 'Applied on VolunteerU';
}

/** "10:00 AM-11:00 AM" -> "10 to 11 AM", "3:30 PM-6:00 PM" -> "3:30 to 6 PM". Unreadable text passes through. */
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
  return am === bm ? `${a} to ${b} ${bm}` : `${a} ${am} to ${b} ${bm}`;
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

/** Everything waiting on the lead, counted once for the whole screen.
    Applications: the project's own pending rows plus pending join-link rows.
    Hours: shifts logged on the People tab plus shifts members logged
    themselves, with the hours and the people behind them. */
function waitingTotals(p, linkApps) {
  const localApps = pendingApplications(p);
  const crossApps = linkApps.filter((a) => a.status === 'pending');
  const localHours = pendingHours(p);
  const memberHours = memberHoursWaiting(linkApps);
  const hrs = [...localHours.map((q) => q.hrs), ...memberHours.map((r) => r.h.hrs)].reduce((a, n) => a + (Number(n) || 0), 0);
  return {
    apps: localApps.length + crossApps.length,
    localApps,
    crossApps: crossApps.length,
    hours: {
      count: localHours.length + memberHours.length,
      hrs: Math.round(hrs * 10) / 10,
      people: new Set([...localHours.map((q) => q.personId || q.n || q.id), ...memberHours.map((r) => r.app.id)]).size,
      flagged: localHours.filter((q) => !q.ok).length,
    },
  };
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
/* The roster invite an accepted application came from (claim_roster_invite
   writes assignment.inviteId and assignment.invite), or null. */
function inviteOf(app) {
  const a = app && app.assignment;
  if (!a || typeof a.inviteId !== 'string' || !a.inviteId) return null;
  const facts = a.invite && typeof a.invite === 'object' ? a.invite : {};
  return { id: a.inviteId, school: typeof facts.school === 'string' ? facts.school : '', grade: facts.grade == null ? '' : String(facts.grade), consent: facts.consent === true };
}

/* An application's shift sign-ups, past ones included, as Attendance reads them. */
const shiftPicks = (app) => myShiftSignUps(app).map((x) => ({ id: String(x.id), d: x.d || '', t: x.t || '' }));

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
        // The shifts their application signed up for, so Attendance expects
        // them only there.
        const picks = shiftPicks(app);
        if (JSON.stringify(picks) !== JSON.stringify(person.signUps || [])) {
          if (picks.length) person.signUps = picks;
          else delete person.signUps;
          changed = true;
        }
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
      // The student opened the invite link the lead sent: their Invited row
      // becomes this account's row. The invite id is written by the server
      // (claim_roster_invite), so a name typed at sign-up can't take a row.
      const invite = inviteOf(app);
      const invited = invite ? p.people.find((x) => x.inviteId === invite.id && !x.appId) : null;
      if (invited) {
        invited.appId = app.id;
        invited.accountId = app.applicant_id;
        invited.linkConfirmed = true;
        invited.linkHrs = confirmedMemberHours(app);
        invited.hrs = Math.round(((Number(invited.hrs) || 0) + invited.linkHrs) * 10) / 10;
        if (invited.st === 'Invited') invited.st = 'Active';
        if (shiftPicks(app).length) invited.signUps = shiftPicks(app);
        p.activity = [{ id: uid('ac'), t: `${invited.n} joined with your invite link`, w: stampLabel(), at: Date.now() }, ...(p.activity || [])].slice(0, 30);
        continue;
      }
      const pos = p.positions.find((x) => norm(x.t) === norm(app.position)) || p.positions.find((x) => x.open !== false) || p.positions[0];
      const hrs = confirmedMemberHours(app);
      p.people.unshift({
        id: uid('per'),
        n: name,
        short: shortName(name),
        s: invite && invite.school ? `${invite.school}${invite.grade ? `, grade ${invite.grade}` : ''}` : '',
        school: invite && invite.school ? invite.school : '',
        grade: invite && Number(invite.grade) ? Number(invite.grade) : null,
        role: pos ? pos.t : app.position || 'Volunteer',
        positionId: pos ? pos.id : null,
        st: 'Active',
        hrs,
        // Not seen at a shift yet; Attendance fills this in.
        last: '',
        tags: [],
        slug: linkSlug(name, app.id),
        // Nobody's consent form or training is assumed on file, unless the
        // lead ticked it when they invited this student.
        consent: !!(invite && invite.consent === true),
        trained: false,
        notes: [],
        appId: app.id,
        accountId: app.applicant_id,
        linkAdded: true,
        ...(invite ? { viaInvite: true } : {}),
        linkHrs: hrs,
        ...(shiftPicks(app).length ? { signUps: shiftPicks(app) } : {}),
      });
      // Stamped with when the lead accepted, so the row ages ("12 min ago", then "Oct 18").
      const at = app.decided_at ? new Date(app.decided_at).getTime() : NaN;
      const ms = Number.isFinite(at) ? at : Date.now();
      const how = invite ? ' with your invite link' : app.position ? ` as ${app.position}` : '';
      p.activity = [{ id: uid('ac'), t: `${name} joined${how}`, w: stampLabel(ms), at: ms }, ...(p.activity || [])].slice(0, 30);
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
    p.activity = [{ id: uid('ac'), t: `${row.n} linked to the account they joined with`, w: stampLabel(), at: Date.now() }, ...(p.activity || [])].slice(0, 30);
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
        .catch((err) => { if (alive) console.error('[lead] could not load applications', err); });
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
        .catch((err) => { if (alive) console.error('[lead] could not count unread messages', err); });
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

/** Navigate to the new-project wizard. /create explains when a project is
    blocked and links to the project that needs attendance. */
function goCreateProject(router) {
  router.push('/create');
}

/* Header status chip. Turning off "Show project on Discover" pauses the
   listing, so the header says so instead of "Live". */
function headerStatus(p) {
  if (p.archived) return { label: 'Archived', tone: 'mute' };
  const pub = (p.settings || []).find((r) => r.id === 'set-public');
  if (pub && pub.on === false) return { label: 'Hidden', tone: 'wait' };
  return { label: sentence(p.status), tone: 'ok' };
}

/** The project's own cover photo. A project without one shows nothing here:
    the title leads, and no stand-in tile pretends to be a picture. */
function ProjectTile({ p, size }) {
  const photo = resolveCover(p.cover);
  if (!photo) return null;
  return (
    <img
      src={photo.sm || photo.src}
      alt=""
      width={size}
      height={size}
      style={S(`width:${size}px;height:${size}px;flex:none;object-fit:cover;object-position:${photo.pos || 'center'};border-radius:${size > 64 ? R.photo : R.control};background:${C.mist}`)}
    />
  );
}

/** Header status, as one meta line: a dot and the word for the listing
    state, then the verification state and the created date as plain text. */
const STATE_DOT = { ok: C.confirmed, wait: C.waiting, mute: C.ink3 };
function HeaderMeta({ chip, verify, created }) {
  const sep = <span className="vu-sep" aria-hidden="true" style={S('white-space:pre')}>{' · '}</span>;
  return (
    <p style={S(`margin:10px 0 0;display:flex;align-items:center;flex-wrap:wrap;row-gap:4px;${META}`)}>
      <span style={S(`display:inline-flex;align-items:center;gap:7px;font-weight:600;color:${C.ink}`)}>
        <i aria-hidden="true" style={S(`width:6px;height:6px;border-radius:50%;flex:none;background:${STATE_DOT[chip.tone] || C.ink3}`)} />
        <span>{chip.label}</span>
      </span>
      {sep}
      <span style={S('display:inline-flex;align-items:center;gap:4px')}>
        <span>{verify.label}</span>
        {verify.icon ? <span style={S(`color:${C.confirmed};display:inline-flex`)}><Icon name="badge-check" size={15} label="Verified" /></span> : null}
      </span>
      {created ? (
        <>
          {sep}
          <span>{created}</span>
        </>
      ) : null}
    </p>
  );
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

const MISSING_TITLE = "Project isn't available, VolunteerU";

/* A project link that doesn't match any of this lead's projects: deleted,
   someone else's, or mistyped. Says so and links to the projects they do run. */
function ProjectMissing({ projects, tab }) {
  const live = projects.filter((x) => !x.archived);
  const list = [...live, ...projects.filter((x) => x.archived)];
  return (
    <div className="vu-page">
      <section aria-labelledby="lead-missing" style={S('max-width:640px')}>
        <h1 id="lead-missing" style={S(`margin:0;font:700 clamp(28px, 6.4vw, 36px)/1.08 ${F.display};letter-spacing:-0.03em;color:${C.ink}`)}>This project isn't available</h1>
        <p style={S(`margin:12px 0 0;font:400 16px/1.55 ${F.body};color:${C.ink2}`)}>
          It may have been deleted, or it belongs to another account. Open one of your projects instead.
        </p>
        <h2 style={S(`${H3};margin:36px 0 0`)}>Your projects</h2>
        <ul style={S(`margin:12px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
          {list.map((x) => (
            <li key={x.id} style={S(RULE)}>
              <Link
                href={`/lead/${x.id}/${tabsFor(x).some(([k]) => k === tab) ? tab : 'overview'}`}
                onClick={() => setActiveProject(x.id)}
                className={cx(H.row, H.press)}
                style={S('display:flex;align-items:center;gap:14px;padding:14px 0;text-decoration:none;color:inherit')}
              >
                <ProjectTile p={x} size={48} />
                <span style={S('min-width:0;flex:1')}>
                  <span className="vu-trunc" style={S(`display:block;${LABEL}`)}>{x.name}</span>
                  <span className="vu-trunc" style={S(`display:block;margin-top:3px;${SMALL}`)}>
                    {[x.orgClass === 'official' ? 'Volunteer program' : 'Student project', x.archived ? 'Archived' : x.siteShort || x.site].filter(Boolean).map((m, i) => (
                      <span key={i}>
                        {i ? <span className="vu-sep" aria-hidden="true">{' · '}</span> : null}
                        {m}
                      </span>
                    ))}
                  </span>
                </span>
                <span aria-hidden="true" style={S(`color:${C.ink3};flex:none`)}><Icon name="chevron-right" size={18} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Lead({ projectId, tab: tabParam }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { state } = useSnapshot();

  const owned = state.projects || [];
  // /lead with a stale active id still opens one of the lead's projects. A
  // project link (/lead/<id>/...) only ever opens that project.
  const p = projectId ? getProject(projectId) : getProject(state.activeProjectId) || owned.find((x) => !x.archived) || owned[0] || null;
  const missing = !p && !!projectId && owned.length > 0;
  const TABS = tabsFor(p);
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam : 'overview';
  const tabLabel = (TABS.find(([k]) => k === tab) || [])[1] || 'Overview';
  useDocumentTitle(p ? `${p.name} \u00b7 ${tabLabel}, VolunteerU` : missing ? MISSING_TITLE : LEAD_TITLE);
  const linkApps = useListingApps(p);
  const unreadMessages = useUnreadMessages(p ? p.listingId : null, tab);
  // The tab lives in the URL, so a click marks its tab right away and holds
  // it until the route lands; the panel dims while it's on the way.
  const [heldTab, holdTab] = useHeldValue(`${p ? p.id : ''}/${tab}`);
  const [tabLoading, startTabNav] = useTransition();
  const shownTab = heldTab === undefined ? tab : heldTab;

  if (missing) return <ProjectMissing projects={owned} tab={tab} />;

  if (!p) {
    const photo = PHOTOS.outdoor;
    return (
      <div className="vu-page" style={S('display:flex;flex-direction:column;gap:40px')}>
        <CrossApplications />
        <section className="vu-2col" aria-labelledby="lead-empty" style={S('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:32px 56px;align-items:center;max-width:1080px')}>
          <div style={S('min-width:0')}>
            <h1 id="lead-empty" style={S(`margin:0;font:700 clamp(30px, 7vw, 40px)/1.05 ${F.display};letter-spacing:-0.03em;color:${C.ink}`)}>No student project yet</h1>
            <p style={S(`margin:14px 0 0;max-width:460px;font:400 16px/1.55 ${F.body};color:${C.ink2}`)}>
              Post a project and other students can apply to help. You plan the shifts here and confirm everyone's hours after each one.
            </p>
            <div style={S('margin-top:24px')}>
              {(() => {
                // Save and exit on /create keeps the draft; say so instead of offering a fresh start.
                const d = state.drafts && state.drafts.create;
                const draftName = d && String(d.name || '').trim();
                return draftName ? (
                  <Button variant="primary" icon="edit" onClick={() => goCreateProject(router)}>{`Continue your draft: ${draftName}`}</Button>
                ) : (
                  <Button variant="primary" icon="plus" onClick={() => goCreateProject(router)}>Start a student project</Button>
                );
              })()}
            </div>
          </div>
          <img
            src={photo.src}
            alt="A volunteer checking a sign-up sheet at a park cleanup"
            style={S(`display:block;width:100%;aspect-ratio:4/3;object-fit:cover;object-position:${photo.pos};border-radius:${R.photo};background:${C.mist}`)}
          />
        </section>
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

  const goTab = (k) => {
    const key = String(k).split('?')[0];
    if (key !== tab) holdTab(key);
    startTabNav(() => router.push(`/lead/${p.id}/${k}`));
  };

  const chip = headerStatus(p);
  // One count of each thing for the whole screen: tab badges, Needs you
  // today and Team status all read these two totals.
  const waiting = waitingTotals(p, linkApps);
  const openAttendance = p.attendanceSessions.filter((x) => !x.posted).length;
  // Applications, hours, attendance, plus unread messages from volunteers.
  const badgeFor = (k) => ({ applications: waiting.apps, hours: waiting.hours.count, attendance: openAttendance, messages: unreadMessages }[k] || '') || '';

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

  const verify = p.sponsor.verified
    ? { label: 'Verified organization', tone: 'ok', icon: 'badge-check' }
    : p.sponsor.verificationRequestedAt
      ? { label: 'Verification requested', tone: 'wait', icon: false }
      : { label: 'Not verified yet', tone: 'mute', icon: false };
  // An archived project has no more shifts, so its schedule drops out of the line.
  const meta = [p.orgClass === 'official' ? 'Volunteer program' : 'Student project', p.siteShort || p.site, p.archived ? '' : p.cadence, !p.archived && p.termWeeks ? `${p.termWeeks}-week term` : ''].filter(Boolean);

  function onTabKey(e) {
    const i = TABS.findIndex(([k]) => k === shownTab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = TABS[(to + TABS.length) % TABS.length][0];
    goTab(next);
    requestAnimationFrame(() => {
      const el = document.getElementById(`lead-tab-${next}`);
      if (el) el.focus();
    });
  }

  return (
    <div className="vu-page vu-lead">
      <style dangerouslySetInnerHTML={{ __html: LEAD_CSS }} />
      <header className="vu-lead-head" style={S('display:flex;align-items:flex-start;flex-wrap:wrap;gap:16px 20px')}>
        <span className="vu-hide-mobile" style={S('display:contents')}><ProjectTile p={p} size={88} /></span>
        <span className="vu-show-mobile" style={S('display:contents')}><ProjectTile p={p} size={56} /></span>
        <div style={S('flex:1 1 260px;min-width:0')}>
          <div style={S('display:flex;align-items:center;gap:10px 12px;flex-wrap:wrap')}>
            <h1 className="vu-lead-title" style={S(`margin:0;min-width:0;font:700 clamp(26px, 6.4vw, 34px)/1.08 ${F.display};letter-spacing:-0.03em;color:${C.ink};overflow-wrap:anywhere`)}>{p.name}</h1>
            <button
              type="button"
              aria-label="Switch project"
              aria-haspopup="menu"
              aria-expanded="false"
              onClick={switchProject}
              className={cx('vu-btn', 'vu-btn-outline', H.press)}
              style={S(`flex:none;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:${R.pill};border:1px solid ${C.line2};background:#fff;font:600 13px/1 ${F.body};color:${C.ink};cursor:pointer`)}
            >
              Switch project
              <Icon name="chevron-down" size={14} />
            </button>
          </div>
          <p style={S(`margin:6px 0 0;${META}`)}>
            {meta.map((m, i) => (
              <span key={i}>
                {i ? <span className="vu-sep" aria-hidden="true">{' · '}</span> : null}
                {m}
              </span>
            ))}
          </p>
          <HeaderMeta chip={chip} verify={verify} created={p.createdLabel ? sentence(p.createdLabel) : ''} />
          {p.archived ? (
            <p style={S(`margin:8px 0 0;${META}`)}>
              Its join link is closed and no shifts run.{' '}
              <Link href={`/lead/${p.id}/settings`} className={cx('vu-link', H.link)} style={S(`color:${C.ink};font-weight:600;text-decoration:underline;text-underline-offset:3px`)}>Restore it in Settings</Link>
            </p>
          ) : null}
        </div>
        <div className="vu-lead-actions" style={S('display:flex;gap:10px;flex:none;flex-wrap:wrap')}>
          <Button variant="outline" size="sm" icon="plus" onClick={() => goCreateProject(router)} aria-label="New project">
            New project
          </Button>
          {p.archived ? null : (
            <Button variant="dark" size="sm" icon="link" onClick={copyRecruit} aria-label="Copy join link">
              Copy join link
            </Button>
          )}
        </div>
      </header>

      <div
        className="vu-scroll-x vu-lead-tabs"
        role="tablist"
        aria-label="Project sections"
        onKeyDown={onTabKey}
        style={S(`margin-top:28px;border-bottom:1px solid ${C.line};display:flex;gap:24px`)}
      >
        {TABS.map(([k, label]) => {
          const on = shownTab === k;
          const n = badgeFor(k);
          const unread = k === 'messages' && n;
          return (
            <button
              key={k}
              id={`lead-tab-${k}`}
              type="button"
              role="tab"
              aria-selected={on ? 'true' : 'false'}
              tabIndex={on ? 0 : -1}
              aria-label={unread ? `${label}, ${n} unread` : undefined}
              onClick={() => goTab(k)}
              className={cx('vu-tab', on ? 'is-on' : '')}
              style={s(
                'flex:none;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;background:none;border:0;cursor:pointer',
                'padding:12px 0 13px;margin-bottom:-1px',
                `border-bottom:2px solid ${on ? C.ink : 'transparent'}`,
                `font:${on ? 600 : 500} 15px/1 ${F.body}`,
                `color:${on ? C.ink : C.ink2}`
              )}
            >
              {label}
              {n ? (
                unread ? (
                  <span style={S(`min-width:18px;height:18px;padding:0 5px;border-radius:${R.pill};background:${C.ember};color:#fff;display:inline-grid;place-items:center;font:700 11px/1 ${F.body};${NUM}`)}>{n}</span>
                ) : (
                  <span style={S(`font-weight:500;color:${C.ink3};${NUM}`)}>{n}</span>
                )
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={tab} id={`lead-panel-${tab}`} aria-busy={tabLoading ? 'true' : undefined} className="vu-tabpanel" data-loading={tabLoading && shownTab !== tab ? 'true' : undefined}>
        {tab === 'overview' ? (isTeam(p) ? <TeamOverview p={p} goTab={goTab} linkApps={linkApps} /> : <Overview p={p} goTab={goTab} waiting={waiting} apps={linkApps} />) : null}
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
          <div style={S('margin-top:32px;display:flex;flex-direction:column;gap:32px')}>
            <AnnouncementBoard listingId={p.listingId} canPost title="Updates for your team" templates={messageTemplateOptions(p)} />
            <MessagesTab p={p} params={params} setParam={setParam} embedded />
          </div>
        ) : null}
        {tab === 'settings' ? <SettingsTab p={p} /> : null}
      </div>
    </div>
  );
}

/* ---- overview ----------------------------------------------------------- */

function Overview({ p, goTab, waiting, apps = [] }) {
  const progress = taskProgress(p);
  const localPending = waiting.localApps;
  const appsCount = waiting.apps;
  const crossPending = waiting.crossApps;
  const { count: hoursCount, hrs: hoursTotal, people: hoursPeople, flagged } = waiting.hours;
  // Say why an entry was flagged in the Hours tab's own words ("Added by you,
  // arrived late") when there's one; several just get a count.
  const flaggedOne = flagged === 1 ? pendingHours(p).find((q) => !q.ok) : null;
  const flaggedSrc = flaggedOne && String(flaggedOne.src || '').trim();
  const flaggedText = !flagged ? ''
    : flaggedSrc ? `1 flagged (${flaggedSrc.charAt(0).toLowerCase()}${flaggedSrc.slice(1)})`
    : `${flagged} flagged for a closer look`;
  // An archived project runs no more shifts: no short-staffed nudge, no Next shift.
  const shortSession = p.archived ? null : shortSessions({ ...p, sessions: p.sessions.map((x) => withFill(p, x, apps)) })[0];
  const crew = p.people.filter((x) => x.st === 'Active').sort((a, b) => b.hrs - a.hrs).slice(0, 4);
  // `ts` (hours since the application came in) only exists on some older
  // rows. Show an age only when every waiting application has one.
  const aged = localPending.length > 0 && localPending.every((a) => typeof a.ts === 'number' && Number.isFinite(a.ts));
  const oldest = aged ? localPending.slice().sort((a, b) => b.ts - a.ts)[0] : null;
  const lh = p.leadHours || { planning: 0, sessions: 0, recruiting: 0 };
  const leadTotal = fmtHrs(lh.planning + lh.sessions + lh.recruiting);
  const nextRow = p.archived ? null : nextUpcomingShift(p);
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

  const needs = [
    appsCount
      ? {
          k: 'apps',
          title: `${plural(appsCount, 'application')} waiting`,
          sub: oldest && !crossPending ? `Oldest is ${plural(Math.max(1, Math.round(oldest.ts / 24)), 'day')} old` : 'Accept or decline on the Applications tab',
          go: 'applications',
        }
      : null,
    hoursCount
      ? {
          k: 'hours',
          title: hoursTotal > 0 ? `${fmtHrs(hoursTotal)} ${hoursTotal === 1 ? 'hour' : 'hours'} to confirm` : `${plural(hoursCount, 'shift')} to confirm`,
          // The shift count is the Hours tab badge, so the two read as one number.
          sub: [`${plural(hoursCount, 'shift')} from ${plural(hoursPeople, 'volunteer')}`, flaggedText].filter(Boolean).join(', '),
          go: 'hours',
        }
      : null,
    shortSession
      ? { k: 'short', title: `${shortSession.d} needs ${plural(shortSession.cap - shortSession.filledCount, 'more person', 'more people')}`, sub: 'See shifts', go: 'shifts' }
      : null,
    matches.length
      ? { k: 'match', title: `${plural(matches.length, 'possible match', 'possible matches')} on the roster`, sub: 'Same name as someone you added. Check on People', go: 'people' }
      : null,
  ].filter(Boolean);

  const needsPanel = (id) => (
    <NeedsPanel id={id} title="Needs you today" needs={needs} goTab={goTab} empty="Nothing waiting on you. No applications or hours to review." />
  );

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <div style={S('min-width:0;display:flex;flex-direction:column;gap:48px')}>
        <CrossApplications listingId={p.listingId} title="From your join link" />
        <div className="vu-show-mobile">{needsPanel('ov-needs-m')}</div>

        <section aria-labelledby="ov-next">
          <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
            <h2 id="ov-next" style={S(H2)}>Next shift</h2>
            {next ? (
              <div style={S('display:flex;gap:8px;flex-wrap:wrap')}>
                <Button variant="outline" size="sm" icon="message" onClick={() => goTab('messages')}>Message team</Button>
                <Button variant="outline" size="sm" icon="users" onClick={() => goTab('people')}>Open roster</Button>
              </div>
            ) : null}
          </div>
          {next ? (
            <>
              <div style={S('margin-top:18px;display:flex;align-items:center;gap:16px')}>
                <DateBlock date={next.d} size="lg" month />
                <div style={S('min-width:0')}>
                  <div style={S(`font:600 20px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>{fmtTime(next.t) || next.d}</div>
                  <div style={S(`margin-top:5px;${META}`)}>{next.loc || p.siteShort}</div>
                </div>
              </div>
              {facts.length ? (
                <dl className="vu-lead-facts" style={S(`margin:16px 0 0;display:flex;flex-wrap:wrap;align-items:baseline;row-gap:6px;${META}`)}>
                  {facts.map((k, i) => (
                    <div key={k.l} style={S('display:inline-flex;align-items:baseline;min-width:0')}>
                      {i ? <span className="vu-sep" aria-hidden="true" style={S('white-space:pre')}>{' · '}</span> : null}
                      <dt style={S('display:inline')}>{k.l}</dt>
                      <dd style={S(`display:inline;margin:0 0 0 5px;font-weight:600;color:${C.ink};${NUM};overflow-wrap:anywhere`)}>{k.v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          ) : (
            <div style={S('margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap')}>
              {p.archived ? (
                <p style={S(`margin:0;${META}`)}>No shifts while this project is archived.</p>
              ) : (
                <>
                  <p style={S(`margin:0;${META}`)}>Nothing scheduled. Add a shift so volunteers can sign up.</p>
                  <Button variant="primary" size="sm" icon="plus" onClick={() => goTab('shifts')}>Add a shift</Button>
                </>
              )}
            </div>
          )}
        </section>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:48px 40px')}>
          <section aria-labelledby="ov-steps">
            <div className="vu-sec-head">
              <h2 id="ov-steps" style={S(H2)}>Launch checklist</h2>
              <span style={S(`${SMALL};${NUM};flex:none`)}>
                {progress.done} of {progress.total} done
              </span>
            </div>
            <ul style={S(`margin:14px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
              {p.tasks.map((t) => (
                <li key={t.id} style={S(RULE)}>
                  <label htmlFor={`task-${t.id}`} className="vu-lead-check" style={S('display:flex;gap:12px;align-items:flex-start;padding:13px 0;cursor:pointer')}>
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
                      className="vu-lead-box"
                      style={s(
                        'width:20px;height:20px;border-radius:6px;flex:none;margin-top:0;display:grid;place-items:center;color:#fff',
                        `border:1.5px solid ${t.done ? C.ink : C.line2}`,
                        `background:${t.done ? C.ink : '#fff'}`,
                        'transition:border-color .16s ease, background .16s ease'
                      )}
                    >
                      {t.done ? <Icon name="check" size={13} stroke={2.5} /> : null}
                    </span>
                    <span style={s(`font:500 15px/1.35 ${F.body}`, t.done ? `color:${C.ink2}` : `color:${C.ink}`)}>{t.t}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ov-activity">
            <h2 id="ov-activity" style={S(H2)}>Activity</h2>
            {p.activity.length ? (
              <ul style={S(`margin:14px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
                {p.activity.slice(0, 5).map((a) => (
                  <li key={a.id} style={S(`display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:14px 0;${RULE}`)}>
                    <span style={S(`font:400 14px/1.45 ${F.body};color:${C.ink}`)}>{a.t}</span>
                    <span style={S(`${SMALL};flex:none;${NUM}`)}>{activityWhen(a)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={S(`margin:14px 0 0;${META}`)}>No activity yet. New applications and posted attendance show up here.</p>
            )}
          </section>
        </div>

        <section aria-labelledby="ov-team">
          <div className="vu-sec-head">
            <h2 id="ov-team" style={S(H2)}>Team</h2>
            <button type="button" onClick={() => goTab('people')} className={cx('vu-link', H.press)} style={S(TEXT_LINK)}>
              Manage people
            </button>
          </div>
          {crew.length ? (
            <div className="vu-np-grid" style={S('margin-top:8px')}>
              {crew.map((c) => (
                <Pressable
                  key={c.id}
                  label={`${c.n}, ${c.role}`}
                  onClick={() => goTab('people')}
                  className={cx(H.row, H.press)}
                  style={S(`display:flex;align-items:center;gap:14px;padding:14px 0;cursor:pointer;${RULE}`)}
                >
                  <span className="vu-row-avatar">
                    <Avatar name={c.n} fs={13} />
                  </span>
                  <div style={S('min-width:0;flex:1')}>
                    <div className="vu-trunc" style={S(`font:600 15px/1.25 ${F.body};color:${C.ink}`)}>{c.n || c.short}</div>
                    <div className="vu-trunc" style={S(`margin-top:3px;${SMALL}`)}>{c.role}</div>
                  </div>
                  <div style={S(`flex:none;font:600 15px/1 ${F.body};color:${C.ink};${NUM}`)}>{hrsText(c.hrs)}</div>
                </Pressable>
              ))}
            </div>
          ) : (
            <EmptyState compact icon="users" title="No one on the team yet" body="Accept an application or add a student on the People tab." cta="Add a student" ctaVariant="outline" onCta={() => goTab('people?add=student')} />
          )}
        </section>
      </div>

      <aside aria-label="Project summary" className="vu-lead-aside" style={S('min-width:0;display:flex;flex-direction:column')}>
        <div className="vu-hide-mobile vu-rail-sec">{needsPanel('ov-needs')}</div>

        <SponsorCard p={p} />

        <section aria-labelledby="ov-lead-hrs" className="vu-rail-sec">
          <h2 id="ov-lead-hrs" style={S(H3)}>Your lead hours</h2>
          <LeadHoursLine total={leadTotal} parts={lh} />
        </section>

        <CrewFunnel p={p} />
      </aside>
    </div>
  );
}

/** Things waiting on the lead: a plain section of chevron rows. Rendered in
    the rail on desktop and right under the applications on phones. */
function NeedsPanel({ id, title, needs, goTab, empty }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} style={S(H3)}>{title}</h2>
      {needs.length ? (
        <ul style={S('margin:8px 0 0;padding:0;list-style:none')}>
          {needs.map((n, i) => (
            <li key={n.k}>
              <NeedCard title={n.title} sub={n.sub} onClick={() => goTab(n.go)} last={i === needs.length - 1} />
            </li>
          ))}
        </ul>
      ) : (
        <p style={S(`margin:10px 0 0;${META}`)}>{empty}</p>
      )}
    </section>
  );
}

/** One thing that needs the lead, as a row that opens the tab where it's done. */
function NeedCard({ title, sub, onClick, last }) {
  return (
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      className={cx('vu-row', 'vu-row--nolead', 'vu-lead-need', H.press)}
      style={S(`width:100%;grid-template-columns:minmax(0,1fr) auto;background:none;border:0;border-bottom:${last ? '0' : `1px solid ${C.line}`};text-align:left;font:inherit;color:inherit;cursor:pointer`)}
    >
      <span style={S('min-width:0')}>
        <span className="vu-row-t" style={S('white-space:normal')}>{title}</span>
        <span className="vu-row-m" style={S('white-space:normal')}>{sub}</span>
      </span>
      <span aria-hidden="true" style={S(`color:${C.ink3};display:inline-flex`)}><Icon name="chevron-right" size={18} /></span>
    </button>
  );
}

function SideRow({ l, v }) {
  return (
    <div style={S('display:flex;justify-content:space-between;gap:12px')}>
      <span>{l}</span>
      <span style={S(`color:${C.ink};font-weight:600;text-align:right;min-width:0;overflow-wrap:anywhere;${NUM}`)}>{v}</span>
    </div>
  );
}

/* Organization panel. Shows only honest status: not verified until a reviewer
   confirms, and a persisted "request verification" action. */
function SponsorCard({ p }) {
  const sp = p.sponsor || {};
  const named = sp.name && sp.name.trim();
  const status = sp.verified ? 'Verified organization'
    : sp.verificationRequestedAt ? 'Requested, waiting on a reviewer'
    : named ? 'Not checked by a reviewer yet'
    : 'No organization added yet';

  const openRequest = () => {
    openModal({
      title: 'Request verification',
      subtitle: 'Send the organization name and a staff contact. A reviewer checks them before the verified badge appears.',
      Body: ({ api }) => <VerifyForm p={p} api={api} />,
    });
  };

  return (
    <section aria-labelledby="ov-org" className="vu-rail-sec">
      <h2 id="ov-org" style={S(H3)}>Organization</h2>
      <div style={S('margin-top:10px;min-width:0')}>
        <div style={S(`display:flex;align-items:center;gap:6px;font:600 15px/1.3 ${F.body};color:${C.ink}`)}>
          <span className="vu-trunc">{named || 'No organization added yet'}</span>
          {sp.verified ? <span style={S(`color:${C.confirmed};flex:none;display:inline-flex`)}><Icon name="badge-check" size={15} label="Verified" /></span> : null}
        </div>
        {named || sp.verified || sp.verificationRequestedAt ? <div style={S(`margin-top:2px;${SMALL}`)}>{status}</div> : null}
      </div>
      {sp.contact && sp.contact !== '-' ? (
        <div style={S(`margin-top:14px;display:flex;flex-direction:column;gap:9px;${META}`)}>
          <SideRow l="Contact" v={sp.contact} />
        </div>
      ) : null}
      {!sp.verified ? (
        <div style={S('margin-top:16px')}>
          <Button variant="outline" size="sm" full icon="badge-check" onClick={openRequest}>
            {sp.verificationRequestedAt ? 'Update verification request' : 'Request verification'}
          </Button>
        </div>
      ) : null}
    </section>
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
    else if (!/[^\s@]+@[^\s@]+\.[^\s@]+/.test(contact) && !/\d{3}\D?\d{3}\D?\d{4}/.test(contact)) e.contact = "Add the staff member's email so the reviewer can reach them.";
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    requestProjectVerification(p.id, { name, contact });
    toast({ title: 'Verification requested', message: 'Your status shows as requested until a reviewer checks it.', tone: 'ok' });
    api.close();
  };
  return (
    <div style={S('display:flex;flex-direction:column;gap:14px')}>
      <Field label="Organization name" value={name} onChange={setName} placeholder="e.g. Indianapolis Public Library" error={err.name} required maxLength={90} />
      <Field label="Staff contact" value={contact} onChange={setContact} placeholder="e.g. Ms. Alvarez, alvarez@school.edu" error={err.contact} required maxLength={120} />
      <ModalActions>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" onClick={submit} busy={busy}>{busy ? 'Sending' : 'Send for review'}</Button>
      </ModalActions>
    </div>
  );
}

/** Dialog footer: actions on the right, an optional destructive action on the left. */
function ModalActions({ left = null, children }) {
  return (
    <div style={S(`margin-top:20px;display:flex;justify-content:${left ? 'space-between' : 'flex-end'};align-items:center;gap:10px;flex-wrap:wrap`)}>
      {left}
      <div style={S('display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto')}>{children}</div>
    </div>
  );
}

/** "a", "a and b", "a, b and c". */
function joinAnd(items) {
  if (items.length < 2) return items;
  return items.flatMap((x, i) => (i === 0 ? [x] : [i === items.length - 1 ? ' and ' : ', ', x]));
}

/** A number in a sentence: 600 ink, tabular. */
const Num = ({ children }) => <b style={S(`font-weight:600;color:${C.ink};${NUM}`)}>{children}</b>;

/* The lead's own hours as one sentence: "6 lead hours: 2 planning,
   3 running shifts and 1 recruiting". Parts at zero are left out. */
function LeadHoursLine({ total, parts }) {
  const p = parts || {};
  const items = [['planning', p.planning], ['running shifts', p.sessions], ['recruiting', p.recruiting]]
    .filter(([, v]) => Number(v) > 0)
    .map(([l, v]) => <span key={l}><Num>{fmtHrs(v)}</Num> {l}</span>);
  if (!(Number(total) > 0)) return <p style={S(`margin:10px 0 0;${META}`)}>No lead hours logged yet.</p>;
  return (
    <p style={S(`margin:10px 0 0;${META}`)}>
      <Num>{total}</Num> {total === '1' ? 'lead hour' : 'lead hours'}
      {items.length ? ': ' : ''}
      {joinAnd(items)}.
    </p>
  );
}

/* Where the team stands, as one sentence from the roster ("5 active,
   2 onboarding."), plus the lead's own count of past events and volunteers.
   Applications waiting already lead Needs you today, so they aren't repeated. */
function CrewFunnel({ p }) {
  const onboarding = p.people.filter((x) => x.st === 'Onboarding').length;
  const active = p.people.filter((x) => x.st === 'Active').length;
  const roster = [
    active ? <span key="a"><Num>{active}</Num> active</span> : null,
    onboarding ? <span key="o"><Num>{onboarding}</Num> onboarding</span> : null,
  ].filter(Boolean);
  const events = Number(p.eventsHosted) > 0 ? Number(p.eventsHosted) : 0;
  const reached = Number(p.approxVolunteers) > 0 ? Number(p.approxVolunteers) : 0;
  let record = null;
  if (events && reached) record = <>By your count you've run <Num>{events}</Num> {events === 1 ? 'event' : 'events'} with about <Num>{reached}</Num> {reached === 1 ? 'volunteer' : 'volunteers'}.</>;
  else if (events) record = <>By your count you've run <Num>{events}</Num> {events === 1 ? 'event' : 'events'}.</>;
  else if (reached) record = <>By your estimate about <Num>{reached}</Num> {reached === 1 ? 'volunteer has' : 'volunteers have'} joined so far.</>;
  if (!roster.length && !record) return null;
  return (
    <section aria-labelledby="ov-status" className="vu-rail-sec">
      <h2 id="ov-status" style={S(H3)}>Team status</h2>
      <p style={S(`margin:10px 0 0;${META}`)}>
        {roster.length ? <>{roster.length === 2 ? [roster[0], ', ', roster[1]] : roster}. </> : null}
        {record}
      </p>
    </section>
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

/* A stored role color drawn as the muted cause tone the Tasks tab uses for
   it, so a role keeps one color across tabs. The stored "Red" (#C2603C)
   reads as Ember, so it draws as the civic tone; no role is red. */
const ROLE_DOT = {
  '#C2603C': CAUSE.civic.fg,
  '#3F6B4E': CAUSE.environment.fg,
  '#5B6BB0': CAUSE.education.fg,
  '#8A5A20': CAUSE.animals.fg,
  '#9B4A6B': CAUSE.arts.fg,
  '#4A7C8A': CAUSE.health.fg,
};
function roleDot(color) {
  const raw = String(color || '').toUpperCase();
  if (ROLE_DOT[raw]) return ROLE_DOT[raw];
  if (raw === CAUSE.food.fg.toUpperCase()) return CAUSE.civic.fg;
  return color || C.ink2;
}

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
  const needs = [
    unassigned.length ? { k: 'un', title: `${plural(unassigned.length, 'task')} without an owner`, sub: 'Assign them on the task board', go: 'tasks' } : null,
    needsBriefing.length ? { k: 'br', title: `${plural(needsBriefing.length, 'member')} not briefed`, sub: "They haven't read their role briefing", go: 'people' } : null,
    matches.length ? { k: 'mt', title: `${plural(matches.length, 'possible match', 'possible matches')} on the team`, sub: 'Same name as someone you added. Check on the Team tab', go: 'people' } : null,
  ].filter(Boolean);

  const needsPanel = (id) => (
    <NeedsPanel id={id} title="Needs you" needs={needs} goTab={goTab} empty="Nothing waiting on you. Every task has an owner and everyone has read their briefing." />
  );

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <div style={S('min-width:0;display:flex;flex-direction:column;gap:48px')}>
        <CrossApplications listingId={p.listingId} />
        <div className="vu-show-mobile">{needsPanel('to-needs-m')}</div>

        <section aria-labelledby="to-board">
          <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
            <h2 id="to-board" style={S(H2)}>Task board</h2>
            <Button variant="outline" size="sm" icon="list" onClick={() => goTab('tasks')}>Open board</Button>
          </div>
          {stats.total ? (
            <p style={S(`margin:14px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2};${NUM}`)}>
              <b style={S(`font-weight:600;color:${C.ink}`)}>{stats.done}</b> of <b style={S(`font-weight:600;color:${C.ink}`)}>{stats.total}</b> {stats.total === 1 ? 'task' : 'tasks'} done
              <span className="vu-sep" aria-hidden="true">{' · '}</span>
              {stats.doing} in progress
              <span className="vu-sep" aria-hidden="true">{' · '}</span>
              {stats.todo} to do
            </p>
          ) : (
            <p style={S(`margin:14px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>No tasks yet. Add the first one on the board.</p>
          )}
        </section>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:48px 40px')}>
          <section aria-labelledby="to-doing">
            <div className="vu-sec-head">
              <h2 id="to-doing" style={S(H2)}>In progress</h2>
            </div>
            {inProgress.length ? (
              <ul style={S(`margin:14px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
                {inProgress.map((t) => {
                  const r = roleOf(p, t.roleId);
                  const who = p.people.find((x) => x.id === t.assigneeId);
                  return (
                    <li key={t.id} style={S(`padding:13px 0;${RULE}`)}>
                      <div style={S(`font:600 15px/1.35 ${F.body};color:${C.ink}`)}>{t.title || t.t || t.name || 'Untitled task'}</div>
                      <div style={S(`margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;${SMALL}`)}>
                        {r ? (
                          <span style={S('display:inline-flex;align-items:center;gap:6px')}>
                            <span aria-hidden="true" style={s('width:8px;height:8px;border-radius:50%;flex:none', `background:${roleDot(r.color)}`)} />
                            {r.name}
                          </span>
                        ) : null}
                        {who ? <span>{who.n || who.short}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={S(`margin:14px 0 0;${META}`)}>Nothing in progress. Move a task to In progress on the board.</p>
            )}
          </section>

          <section aria-labelledby="to-activity">
            <h2 id="to-activity" style={S(H2)}>Activity</h2>
            {p.activity.length ? (
              <ul style={S(`margin:14px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
                {p.activity.slice(0, 5).map((a) => (
                  <li key={a.id} style={S(`display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:14px 0;${RULE}`)}>
                    <span style={S(`font:400 14px/1.45 ${F.body};color:${C.ink}`)}>{a.t}</span>
                    <span style={S(`${SMALL};flex:none;${NUM}`)}>{activityWhen(a)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={S(`margin:14px 0 0;${META}`)}>No activity yet. Task changes and new members show up here.</p>
            )}
          </section>
        </div>

        <section aria-labelledby="to-roles">
          <div className="vu-sec-head">
            <h2 id="to-roles" style={S(H2)}>Roles</h2>
            <button type="button" onClick={() => goTab('tasks')} className={cx('vu-link', H.press)} style={S(TEXT_LINK)}>Manage roles</button>
          </div>
          {roles.length ? (
            <div className="vu-np-grid" style={S('margin-top:8px')}>
              {roles.map((r) => {
                const count = memberRoles.filter((x) => x.roleId === r.id).length;
                return (
                  <div key={r.id} style={S(`display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;${RULE}`)}>
                    <div style={S('display:flex;align-items:center;gap:10px;min-width:0')}>
                      <span aria-hidden="true" style={s('width:10px;height:10px;border-radius:50%;flex:none', `background:${roleDot(r.color)}`)} />
                      <div className="vu-trunc" style={S(`font:600 15px/1.25 ${F.body};color:${C.ink}`)}>{r.name}</div>
                    </div>
                    <div style={S(`${SMALL};flex:none;${NUM}`)}>{plural(count, 'member')}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState compact title="No roles yet" body="Add roles with briefings so members know what they own." cta="Set up roles" onCta={() => goTab('tasks')} />
          )}
        </section>
      </div>

      <aside aria-label="Team summary" className="vu-lead-aside" style={S('min-width:0;display:flex;flex-direction:column')}>
        <div className="vu-hide-mobile vu-rail-sec">{needsPanel('to-needs')}</div>

        <section aria-labelledby="to-mission" className="vu-rail-sec">
          <h2 id="to-mission" style={S(H3)}>Mission</h2>
          {p.mission ? (
            <p style={S(`margin:10px 0 0;font:400 15px/1.55 ${F.body};color:${C.ink}`)}>{p.mission}</p>
          ) : (
            <p style={S(`margin:10px 0 0;${META}`)}>No mission written yet. Add one in Settings so members know what the team is for.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ---- people ------------------------------------------------------------- */

const PAGE = 8;
const STATUSES = ['all', 'Active', 'Onboarding', 'Invited', 'Waitlist', 'Inactive', 'Withdrawn'];
/** 'Invited' is the stored key. A row with an invite link reads Invited; a
    row the lead added without one (an unpublished project, or older rows)
    reads Added, since nothing can reach that student yet. */
const statusLabel = (st, person) => (person && person.withdrew ? 'Withdrew' : st === 'Invited' && person && !person.inviteToken ? 'Added' : st);
/** A member who withdrew their application. People hides them unless the
    Withdrawn filter is on. */
const withdrewFrom = (x, appsById) => x.st === 'Inactive' && x.leftVia === 'app' && !!x.appId && (appsById.get(x.appId) || {}).status === 'withdrawn';
/** A roster row whose invite link is out and hasn't been used yet. */
const pendingInvite = (x) => !!(x && x.inviteToken && x.inviteId && !x.appId);
/** The lead's first name, to sign the invite they send. */
function leadFirstName() {
  const a = getState().account || {};
  return String(a.firstName || a.name || '').trim().split(/\s+/)[0] || '';
}
/** Open a mailto: or sms: link in the lead's own email or texting app. */
function openExternal(href) {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
/** True on a touch phone, where an sms: link opens the texting app. */
function useCanText() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setCan(window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches);
  }, []);
  return can;
}
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

/** Small outline button inside table rows (Note, more actions, Edit). */
const ROW_BTN = `display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;height:36px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:600 13px/1 ${F.body};color:${C.ink};cursor:pointer;white-space:nowrap;transition:background .16s ease`;
/** Filter dropdown trigger: a pill, like the chips. */
const FILTER_BTN = `display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:40px;border-radius:${R.pill};border:1px solid ${C.line2};background:#fff;font:500 14px/1 ${F.body};color:${C.ink};cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease`;
/** Table header cell text. */
const TH = `font:600 13px/1.2 ${F.body};color:${C.ink2}`;

/** Roster status word to a pill tone. */
const PERSON_PILL = { Active: 'ok', Onboarding: 'wait', Invited: 'mute', Waitlist: 'mute', Inactive: 'mute', Removed: 'bad' };

function People({ p: stored, params, setParam, linkApps = [] }) {
  const appsById = new Map(linkApps.map((a) => [a.id, a]));
  const roster = rosterWithTeamRoles(stored, linkApps).map((x) => (withdrewFrom(x, appsById) ? { ...x, withdrew: true } : x));
  const p = { ...stored, people: roster };
  const q = params.get('pq') || '';
  const status = params.get('pstatus') || 'all';
  const role = params.get('prole') || 'all';
  const page = Math.max(1, Number(params.get('ppage')) || 1);
  const [selected, setSelected] = useState([]);
  const [draftQuery, setDraftQuery] = useState(q);
  const narrow = useNarrow();

  const listed = p.people.filter((x) => (status === 'Withdrawn' ? x.withdrew : !x.withdrew));
  // The Withdrawn filter only shows up once someone has withdrawn.
  const hasWithdrawn = p.people.some((x) => x.withdrew);
  const filtered = filterPeople({ ...p, people: listed }, { q, status: status === 'Withdrawn' ? 'all' : status, role });
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
  // The accepted application behind a roster row, so the lead can message
  // that member in the same thread the Applications tab opens.
  const memberApp = (person) => {
    const app = person.appId ? appsById.get(person.appId) : null;
    return app && app.status === 'accepted' && app.applicant_id ? app : null;
  };

  function messageMember(app) {
    openModal({
      title: app.applicant_name,
      subtitle: stored.name ? `About ${stored.name}` : 'Member',
      Body: () => <MessageThread applicationId={app.id} recipientId={app.applicant_id} recipientName={app.applicant_name} />,
    });
  }

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
      subtitle: stored.listingId
        ? 'You get a link to send them from your own email or phone. It puts them on this project when they make an account.'
        : 'They show on the roster as Added. Publish the project to get a link that puts them on it.',
      Body: function AddBody({ api }) {
        return <AddPersonForm api={api} project={p} onInvited={shareInvite} />;
      },
    });
  }

  /* Send one student's invite link: copy it, or open the lead's own email
     or texting app with it filled in. */
  function shareInvite(person) {
    openModal({
      title: `Send ${person.n} their invite`,
      subtitle: 'VolunteerU doesn’t send email for you yet. Send the link from your own email or phone.',
      Body: function ShareBody({ api }) {
        return <InviteShare api={api} project={stored} person={person} />;
      },
    });
  }

  /* An Added row on a published project gets its link here. */
  async function makeInvite(person) {
    const pos = p.positions.find((x) => x.id === person.positionId);
    const res = await createInvites(stored.listingId, [{ name: person.n, email: person.email, school: person.school, grade: person.grade, position: pos ? pos.t : person.role, consent: person.consent === true }]);
    if (!res.ok) {
      toast({ title: "Couldn't make the invite link", message: 'Check your connection and try again.', tone: 'warn' });
      return;
    }
    const inv = res.invites[0];
    updatePerson(stored.id, person.id, { inviteId: inv.id, inviteToken: inv.token });
    shareInvite({ ...person, inviteId: inv.id, inviteToken: inv.token });
  }

  // Overview's empty Team section links here with ?add=student; open the
  // form once and drop the param so a reload doesn't reopen it.
  const addParam = params.get('add');
  const addOpened = useRef(false);
  useEffect(() => {
    if (addParam !== 'student' || addOpened.current) return;
    addOpened.current = true;
    setParam({ add: null });
    addStudent();
  }, [addParam]);

  function importList() {
    openModal({
      title: 'Import from a list',
      subtitle: stored.listingId ? 'One student per line: name, school, grade and email if you have it.' : 'One student per line: name, school, grade.',
      Body: function ImportBody({ api }) {
        return <ImportForm api={api} project={p} onInvited={shareInviteList} />;
      },
    });
  }

  /* Every new link from one import, with Copy and Email per student. */
  function shareInviteList(people) {
    openModal({
      title: `Send ${plural(people.length, 'invite link')}`,
      subtitle: 'VolunteerU doesn’t send email for you yet. Send each link from your own email or phone.',
      Body: function ShareListBody({ api }) {
        return <InviteShareList api={api} project={stored} people={people} />;
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
      Body: function ProfileBody({ api }) {
        return (
          <PersonProfile
            project={p}
            person={person}
            onNote={() => { api.close(); noteFor(person); }}
            onMessage={memberApp(person) ? () => { api.close(); messageMember(memberApp(person)); } : null}
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
        ...(memberApp(person) ? [{ key: 'message', label: 'Message', icon: 'message' }, { sep: true }] : []),
        ...(pendingInvite(person)
          ? [
              { key: 'invite-copy', label: 'Copy invite link', icon: 'link' },
              { key: 'invite-email', label: 'Email invite', icon: 'mail' },
              { key: 'invite-resend', label: 'Resend', icon: 'send' },
              { sep: true },
            ]
          : stored.listingId && person.st === 'Invited' && unclaimedRow(person)
            ? [{ key: 'invite-make', label: 'Create invite link', icon: 'link' }, { sep: true }]
            : []),
        ...(team ? [{ key: 'role', label: person.role === NO_TEAM_ROLE ? 'Give a role' : 'Change role', icon: 'flag' }, { sep: true }] : []),
        { key: 'active', label: 'Mark active', icon: 'check', disabled: person.st === 'Active' },
        { key: 'waitlist', label: 'Move to waitlist', icon: 'clock', disabled: person.st === 'Waitlist' },
        { key: 'inactive', label: 'Mark inactive', icon: 'minus', disabled: person.st === 'Inactive' },
        { sep: true },
        { key: 'consent', label: person.consent ? 'Mark guardian consent form missing' : 'Mark guardian consent form received', icon: 'file' },
        { key: 'trained', label: person.trained ? 'Mark training not done' : 'Mark training done', icon: 'award' },
        { sep: true },
        { key: 'remove', label: 'Remove from roster', icon: 'trash', tone: 'danger' },
      ],
      async (key) => {
        const done = {
          active: ['Marked active', () => updatePerson(p.id, person.id, { st: 'Active' })],
          waitlist: ['Moved to waitlist', () => updatePerson(p.id, person.id, { st: 'Waitlist' })],
          inactive: ['Marked inactive', () => updatePerson(p.id, person.id, { st: 'Inactive' })],
          consent: [person.consent ? 'Guardian consent form marked missing' : 'Guardian consent form marked received', () => updatePerson(p.id, person.id, { consent: !person.consent })],
          trained: [person.trained ? 'Training marked not done' : 'Training marked done', () => updatePerson(p.id, person.id, { trained: !person.trained })],
        }[key];
        if (key === 'role') {
          teamRolePicker(person);
          return;
        }
        if (key === 'invite-copy') {
          const ok = await copyText(inviteLink(person.inviteToken));
          toast(ok ? { title: 'Link copied', message: `Send it to ${person.n} from your own email or phone.`, tone: 'ok', timeout: 2600 } : { title: "Couldn't copy the link", message: 'Use Resend to see it and copy it by hand.', tone: 'warn' });
          return;
        }
        if (key === 'invite-email') {
          openExternal(inviteMailto({ email: person.email, name: person.n, projectName: stored.name, leadName: leadFirstName(), link: inviteLink(person.inviteToken) }));
          return;
        }
        if (key === 'invite-resend') {
          shareInvite(person);
          return;
        }
        if (key === 'invite-make') {
          await makeInvite(person);
          return;
        }
        if (key === 'message') {
          const app = memberApp(person);
          if (app) messageMember(app);
          return;
        }
        if (key === 'remove') {
          const ok = await confirmDialog({
            title: `Remove ${person.n} from the roster?`,
            body: 'They come off this project’s roster and its setup steps. You can add them again later.',
            confirmLabel: 'Remove from roster',
          });
          if (ok) {
            // Their link stops working too.
            if (pendingInvite(person)) revokeInvite(person.inviteId);
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
  // Last seen and Tags only get a column when someone on the roster has one.
  const showLast = p.people.some((x) => lastSeen(stored, x));
  const showTags = p.people.some((x) => x.tags && x.tags.length);
  const COLS = `grid-template-columns:20px minmax(0,2.2fr) minmax(0,1.2fr) 112px 56px${showLast ? ' 80px' : ''}${showTags ? ' minmax(0,1fr)' : ''} 98px`;

  const rowActions = (x) => (
    <div style={S('display:flex;gap:4px;align-items:center;justify-content:flex-end;flex:none')}>
      <Pressable label={`Add a note on ${x.n}`} onClick={() => noteFor(x)} className={cx(H.secondary, H.press)} style={S(ROW_BTN)}>
        Note
      </Pressable>
      <Pressable label={`More actions for ${x.n}`} expanded={false} onClick={(e) => personMenu(e, x)} className={cx('vu-iconbtn-sm', H.press)} style={S('width:36px;height:36px;cursor:pointer')}>
        <Icon name="more" size={18} />
      </Pressable>
    </div>
  );

  const statusChip = (x) => <StatusText tone={PERSON_PILL[x.st] || 'mute'}>{statusLabel(x.st, x)}</StatusText>;

  return (
    <div style={S('margin-top:32px')}>
      {matches.length ? (
        <section aria-label="Possible matches on your roster" style={S(`margin:-8px 0 40px;display:flex;flex-direction:column;border-bottom:1px solid ${C.line}`)}>
          {matches.map((m, i) => {
            const where = schoolLine(m.row);
            return (
              <div key={m.appId} className="vu-stack vu-stack-gap" style={s('display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 0', i ? `border-top:1px solid ${C.line}` : '')}>
                <div style={S('min-width:0;max-width:640px')}>
                  <h2 style={S(`${H3};display:flex;align-items:center;gap:8px`)}>
                    <span aria-hidden="true" style={S(`color:${C.waiting};display:inline-flex`)}><Icon name="alert" size={16} /></span>
                    Same person?
                  </h2>
                  <p style={S(`margin:6px 0 0;${META}`)}>
                    {m.added.n} joined through your join link. Your roster already has someone you added with that name{where ? ` (${where})` : ''}.
                    Link them only if it's the same student. Their account gets that row's hours, notes and attendance.
                  </p>
                </div>
                <div style={S('display:flex;gap:10px;flex:none;flex-wrap:wrap')}>
                  <Button variant="outline" size="sm" onClick={() => keepSeparate(m)} aria-label={`Keep ${m.row.n} separate`}>Keep separate</Button>
                  <Button variant="dark" size="sm" onClick={() => linkMatch(m)} aria-label={`Link to ${m.row.n}`}>Link to {m.row.n}</Button>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
        <div style={S('min-width:0')}>
          <h2 style={S(H2)}>Roster</h2>
          <p style={S(`margin:6px 0 0;${META}`)}>{summary}</p>
        </div>
        <div style={S('display:flex;gap:10px;flex:none;flex-wrap:wrap')}>
          {selected.length ? (
            <Button variant="outline" size="sm" onClick={bulkMenu} aria-label={`Actions for ${selected.length} selected`} aria-haspopup="menu" aria-expanded="false">
              {selected.length} selected
              <Icon name="chevron-down" size={14} />
            </Button>
          ) : (
            <Button variant="outline" size="sm" icon="upload" onClick={importList}>Import from a list</Button>
          )}
          <Button variant="primary" size="sm" icon="plus" onClick={addStudent}>Add student</Button>
        </div>
      </div>

      <div style={S('margin-top:20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
        <div style={S('position:relative;flex:1 1 240px;max-width:360px;min-width:0')}>
          <span aria-hidden="true" style={S(`position:absolute;left:14px;top:50%;transform:translateY(-50%);color:${C.ink3};display:grid`)}><Icon name="search" size={17} /></span>
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
            style={S(`width:100%;height:40px;padding:0 14px 0 40px;border-radius:${R.pill};border:1px solid ${C.line2};background:#fff;font:400 14px/1.2 ${F.body};color:${C.ink};transition:border-color .16s ease`)}
          />
        </div>
        <Pressable
          label={`Filter by status, now ${status === 'all' ? 'all statuses' : statusLabel(status)}`}
          expanded={false}
          onClick={(e) => menuFromEvent(e, STATUSES.filter((v) => v !== 'Withdrawn' || hasWithdrawn || status === v).map((v) => ({ key: v, label: v === 'all' ? 'All statuses' : statusLabel(v), checked: v === status })), (v) => setParam({ pstatus: v === 'all' ? null : v, ppage: null }))}
          className={cx(H.secondary, H.press)}
          style={S(`${FILTER_BTN}${status !== 'all' ? `;background:${C.ink};border:1px solid ${C.ink};color:#fff` : ''}`)}
        >
          {status === 'all' ? 'All statuses' : statusLabel(status)}
          <Icon name="chevron-down" size={14} />
        </Pressable>
        <Pressable
          label={`Filter by role, now ${role === 'all' ? 'all roles' : role}`}
          expanded={false}
          onClick={(e) => menuFromEvent(e, roles.map((v) => ({ key: v, label: v === 'all' ? 'All roles' : v, checked: v === role })), (v) => setParam({ prole: v === 'all' ? null : v, ppage: null }))}
          className={cx(H.secondary, H.press)}
          style={S(`${FILTER_BTN}${role !== 'all' ? `;background:${C.ink};border:1px solid ${C.ink};color:#fff` : ''}`)}
        >
          {role === 'all' ? 'All roles' : role}
          <Icon name="chevron-down" size={14} />
        </Pressable>
      </div>

      <div style={S('margin-top:16px')}>
        {rows.length && narrow ? (
          <div style={S(`border-top:1px solid ${C.line}`)}>
            <label style={S(`display:flex;align-items:center;gap:12px;padding:12px 0;${RULE};${SMALL};cursor:pointer`)}>
              <input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))} style={S(CHECK)} />
              Select all on this page
            </label>
            {rows.map((x) => {
              const on = selected.includes(x.id);
              return (
                <div key={x.id} style={s(`padding:14px 0;${RULE}`, on ? `background:${C.mist};margin:0 -16px;padding:14px 16px` : '')}>
                  <div style={S('display:flex;align-items:center;gap:12px')}>
                    <input type="checkbox" aria-label={`Select ${x.n}`} checked={on} onChange={() => toggleRow(x.id)} style={S(CHECK)} />
                    <Pressable label={`Open ${x.n}'s profile`} onClick={() => personProfile(x)} style={S('display:flex;align-items:center;gap:12px;cursor:pointer;min-width:0;flex:1')}>
                      <span className="vu-row-avatar">
                        <Avatar name={x.n} fs={13} />
                      </span>
                      <div style={S('min-width:0')}>
                        <div className="vu-trunc" style={S(`font:600 15px/1.25 ${F.body};color:${C.ink}`)}>{x.n}</div>
                        <div className="vu-trunc" style={S(`margin-top:2px;${SMALL}`)}>{schoolLine(x)}</div>
                      </div>
                    </Pressable>
                    {rowActions(x)}
                  </div>
                  <div style={S(`margin-top:10px;padding-left:28px;display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;${SMALL}`)}>
                    {statusChip(x)}
                    <span style={S(`color:${C.ink}`)}>{x.role}</span>
                    <span style={S(`color:${C.ink};font-weight:600;${NUM}`)}>{hrsText(x.hrs)}</span>
                    {lastSeen(stored, x) ? <span>Last seen {lastSeen(stored, x)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : rows.length ? (
          <div className="vu-table-wrap" style={S('position:relative')}>
            <div role="table" aria-label="Roster">
              <div role="row" style={S(`display:grid;${COLS};gap:16px;align-items:center;padding:0 0 10px;border-bottom:1px solid ${C.line};${TH}`)}>
                <div role="columnheader">
                  <input
                    type="checkbox"
                    aria-label="Select all people on this page"
                    checked={allOnPage}
                    onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))}
                    style={S(CHECK)}
                  />
                </div>
                <div role="columnheader">Student</div><div role="columnheader">Role</div><div role="columnheader">Status</div><div role="columnheader" style={S('text-align:right')}>Hours</div>
                {showLast ? <div role="columnheader">Last seen</div> : null}
                {showTags ? <div role="columnheader">Tags</div> : null}
                <div role="columnheader"><span className="vu-sr">Actions</span></div>
              </div>
              {rows.map((x) => {
                const on = selected.includes(x.id);
                return (
                  <div
                    key={x.id}
                    role="row"
                    className={H.row}
                    style={s(`display:grid;${COLS};gap:16px;padding:12px 0;${RULE};align-items:center;transition:background .16s ease`, on ? `background:${C.mist}` : '')}
                  >
                    <div role="cell">
                      <input type="checkbox" aria-label={`Select ${x.n}`} checked={on} onChange={() => toggleRow(x.id)} style={S(CHECK)} />
                    </div>
                    <div role="cell" style={S('min-width:0')}>
                      <Pressable label={`Open ${x.n}'s profile`} onClick={() => personProfile(x)} className="vu-lead-person" style={S('display:flex;align-items:center;gap:12px;cursor:pointer;min-width:0')}>
                        <span className="vu-row-avatar">
                          <Avatar name={x.n} fs={13} />
                        </span>
                        <div style={S('min-width:0')}>
                          <div className="vu-trunc" style={S(`font:600 15px/1.25 ${F.body};color:${C.ink}`)}>{x.n}</div>
                          <div className="vu-trunc" style={S(`margin-top:2px;${SMALL}`)}>{schoolLine(x)}</div>
                        </div>
                      </Pressable>
                    </div>
                    <div role="cell" className="vu-trunc" style={S(`font:400 14px/1.3 ${F.body};color:${C.ink}`)}>{x.role}</div>
                    <div role="cell">{statusChip(x)}</div>
                    <div role="cell" style={S(`text-align:right;font:600 15px/1 ${F.body};color:${C.ink};${NUM}`)}>{fmtHrs(x.hrs)}</div>
                    {showLast ? <div role="cell" style={S(`${SMALL};${NUM}`)}>{lastSeen(stored, x) || 'Not yet'}</div> : null}
                    {showTags ? (
                      <div role="cell" className="vu-trunc" style={S(`min-width:0;${SMALL}`)} title={(x.tags || []).join(', ')}>
                        {(x.tags || []).join(', ')}
                      </div>
                    ) : null}
                    <div role="cell">{rowActions(x)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={S(`border-top:1px solid ${C.line}`)}>
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

        <div style={S(`padding:16px 0 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;${SMALL};${NUM}`)}>
          <div>
            {rows.length ? `${(safePage - 1) * PAGE + 1}-${(safePage - 1) * PAGE + rows.length}` : '0'} of {plural(filtered.length, 'person', 'people')}
            {filtered.length !== listed.length ? ` (filtered from ${listed.length})` : ''}
          </div>
          {pages > 1 ? (
            <div style={S('display:flex;gap:8px')}>
              <Pressable
                label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setParam({ ppage: safePage - 1 })}
                className={cx(safePage > 1 ? H.secondary : '', H.press)}
                style={s(ROW_BTN, `cursor:${safePage > 1 ? 'pointer' : 'default'}`, safePage <= 1 ? 'opacity:.45' : '')}
              >
                <Icon name="chevron-left" size={14} />
                Previous
              </Pressable>
              <Pressable
                label="Next page"
                disabled={safePage >= pages}
                onClick={() => setParam({ ppage: safePage + 1 })}
                className={cx(safePage < pages ? H.secondary : '', H.press)}
                style={s(ROW_BTN, `cursor:${safePage < pages ? 'pointer' : 'default'}`, safePage >= pages ? 'opacity:.45' : '')}
              >
                Next
                <Icon name="chevron-right" size={14} />
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
        <p style={S(`margin:0;${META}`)}>This team has no roles yet. Add one on the Tasks tab first.</p>
        <ModalActions>
          <Button variant="outline" onClick={() => api.close()}>Close</Button>
        </ModalActions>
      </div>
    );
  }

  return (
    <div>
      <Select label="Team role" value={roleId} options={[{ v: '', l: NO_TEAM_ROLE }, ...roles.map((r) => ({ v: r.id, l: r.name }))]} onChange={setRoleId} />
      {err ? <div role="alert" style={S(`margin-top:10px;font:500 13px/1.4 ${F.body};color:${C.emberDeep}`)}>{err}</div> : null}
      <ModalActions>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={save} aria-label="Save role">{busy ? 'Saving role' : 'Save role'}</Button>
      </ModalActions>
    </div>
  );
}

function PersonProfile({ project, person, onNote, onRole, onMessage }) {
  const facts = [
    { l: isTeam(project) ? 'Role' : 'Position', v: person.role },
    { l: 'Hours', v: `${fmtHrs(person.hrs)} hrs` },
    { l: 'Last seen', v: lastSeen(project, person) },
  ].filter((f) => f.v);
  const flag = (ok, yes, no) => <StatusText tone={ok ? 'ok' : 'wait'}>{ok ? yes : no}</StatusText>;
  return (
    <div style={S('display:flex;flex-direction:column;gap:18px')}>
      <div style={S('display:flex;align-items:center;gap:14px')}>
        <div style={S('width:44px;height:44px;border-radius:50%;overflow:hidden;flex:none')}>
          <Avatar name={person.n} fs={16} />
        </div>
        <div style={S(`min-width:0;flex:1;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>{schoolLine(person)}</div>
        <StatusPill tone={PERSON_PILL[person.st] || 'mute'} size="sm">{statusLabel(person.st, person)}</StatusPill>
      </div>

      <dl style={S(`margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;padding:14px 0;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line}`)}>
        {facts.map((f) => (
          <div key={f.l}>
            <dt style={S(SMALL)}>{f.l}</dt>
            <dd style={S(`margin:4px 0 0;font:600 15px/1.25 ${F.body};color:${C.ink};${NUM}`)}>{f.v}</dd>
          </div>
        ))}
      </dl>

      <div style={S('display:flex;gap:10px 20px;flex-wrap:wrap')}>
        {flag(person.consent, 'Guardian consent form received', 'Guardian consent form missing')}
        {flag(person.trained, 'Training done', 'Training not done')}
      </div>

      {person.tags.length ? (
        <div>
          <div style={S(LABEL)}>Tags</div>
          <p style={S(`margin:6px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink}`)}>{person.tags.join(', ')}</p>
        </div>
      ) : null}

      <div>
        <div style={S(LABEL)}>Notes</div>
        {person.notes.length ? (
          <ul style={S(`margin:8px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
            {person.notes.map((nn, i) => (
              <li key={nn.id || i} className="vu-break" style={S(`padding:10px 0;${RULE};font:400 14px/1.5 ${F.body};color:${C.ink}`)}>
                {typeof nn === 'string' ? nn : nn.t || nn.text}
              </li>
            ))}
          </ul>
        ) : (
          <div style={S(`margin-top:6px;${SMALL}`)}>No notes yet.</div>
        )}
      </div>

      <div style={S('display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end')}>
        {onMessage ? (
          <Button variant="outline" icon="message" onClick={onMessage} aria-label={`Message ${person.n}`}>Message</Button>
        ) : null}
        {onRole ? (
          <Button variant="outline" onClick={onRole} aria-label={person.role === NO_TEAM_ROLE ? `Give ${person.n} a role` : `Change ${person.n}'s role`}>
            {person.role === NO_TEAM_ROLE ? 'Give a role' : 'Change role'}
          </Button>
        ) : null}
        <Button variant="primary" icon="edit" onClick={onNote}>Add a note</Button>
      </div>
    </div>
  );
}

function ConsentCheck({ checked, onChange }) {
  return (
    <label style={S(`margin-top:16px;display:flex;align-items:flex-start;gap:10px;cursor:pointer;font:500 14px/1.45 ${F.body};color:${C.ink}`)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={S(`${CHECK};margin-top:2px`)} />
      <span>
        I already have their guardian consent form
        <span style={S(`display:block;margin-top:2px;${SMALL}`)}>Leave this off if you haven't collected it yet.</span>
      </span>
    </label>
  );
}

function AddPersonForm({ api, project, onInvited }) {
  const { state } = useSnapshot();
  const mySchool = (state.account && state.account.school) || '';
  const [f, setF] = useState({ n: '', email: '', school: mySchool, grade: '10', positionId: project.positions[0] ? project.positions[0].id : '', consent: false });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const published = !!project.listingId;
  const submit = async () => {
    if (busy) return;
    const e = {};
    if (!f.n.trim() || !f.n.trim().includes(' ')) e.n = 'Enter their first and last name.';
    const emailErr = inviteEmailError(f.email);
    if (emailErr) e.email = emailErr;
    if (!f.school.trim()) e.school = 'Enter their school.';
    setErr(e);
    if (Object.keys(e).length) return;
    const pos = project.positions.find((x) => x.id === f.positionId);
    const name = f.n.trim();
    const email = f.email.trim();
    const person = addPerson(project.id, { n: name, school: f.school.trim(), grade: f.grade, role: pos ? pos.t : 'Volunteer', positionId: f.positionId, consentOnFile: f.consent });
    if (!person) return;
    if (email) updatePerson(project.id, person.id, { email });
    if (!published) {
      api.close();
      toast({ title: 'Added to roster', message: `${name} is on the roster as Added. Publish the project to get their invite link.`, tone: 'ok' });
      return;
    }
    setBusy(true);
    const res = await createInvites(project.listingId, [{ name, email, school: f.school.trim(), grade: f.grade, position: pos ? pos.t : 'Volunteer', consent: f.consent }]);
    setBusy(false);
    api.close();
    if (!res.ok) {
      toast({ title: 'Added to roster, no invite link yet', message: `${name} is on the roster as Added. Choose Create invite link from their row's menu to try again.`, tone: 'warn' });
      return;
    }
    const inv = res.invites[0];
    updatePerson(project.id, person.id, { inviteId: inv.id, inviteToken: inv.token });
    if (onInvited) onInvited({ ...person, email, inviteId: inv.id, inviteToken: inv.token });
  };
  return (
    <div>
      <Field label="Full name" value={f.n} onChange={(v) => setF((x) => ({ ...x, n: v }))} placeholder="e.g. Ana Castillo" required error={err.n} maxLength={60} onEnter={submit} />
      <div style={S('margin-top:14px')}>
          <Field
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={f.email}
            onChange={(v) => { setF((x) => ({ ...x, email: v })); if (err.email) setErr((x) => ({ ...x, email: undefined })); }}
            placeholder="e.g. ana@gmail.com"
            error={err.email}
            hint={err.email ? undefined : published ? 'Optional. It fills in the To line when you email them their link.' : 'Optional. You can email them a link once the project is published.'}
            maxLength={EMAIL_MAX}
            onEnter={submit}
          />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="School" value={f.school} onChange={(v) => setF((x) => ({ ...x, school: v }))} placeholder="e.g. North Central High School" required error={err.school} maxLength={60} />
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
      {Number(f.grade) < 10 && !f.consent ? (
        <div role="note" style={S(`margin-top:14px;display:flex;align-items:flex-start;gap:8px;padding:12px 14px;border-radius:${R.thumb};background:${C.waitingTint};font:500 13px/1.45 ${F.body};color:${C.waiting}`)}>
          <span style={S('flex:none;margin-top:1px')}><Icon name="alert" size={15} /></span>
          Students under 16 need a guardian consent form before their first shift. Tick the box below once you have it.
        </div>
      ) : null}
      <ConsentCheck checked={f.consent} onChange={(v) => setF((x) => ({ ...x, consent: v }))} />
      <ModalActions>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={submit}>{busy ? 'Adding student' : 'Add student'}</Button>
      </ModalActions>
    </div>
  );
}

/* The invite link, with Copy, Email and (on phones) Text. */
function InviteShare({ api, project, person }) {
  const [copied, setCopied] = useState(false);
  const canText = useCanText();
  const link = inviteLink(person.inviteToken);
  const msg = { email: person.email, name: person.n, projectName: project.name, leadName: leadFirstName(), link };
  const copy = async () => {
    const ok = await copyText(link);
    if (ok) setCopied(true);
    else toast({ title: "Couldn't copy the link", message: 'Select it in the box and copy it by hand.', tone: 'warn' });
  };
  return (
    <div>
      <p style={S(`margin:0;${META}`)}>
        <span style={S(`color:${C.ink};font-weight:600`)}>{person.n}</span> is on the roster as Invited. When they open the link and make an account, they show up as Active.
      </p>
      <label htmlFor={`inv-${person.id}`} style={S(`display:block;margin-top:18px;font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Invite link</label>
      <input
        id={`inv-${person.id}`}
        readOnly
        value={link}
        onFocus={(e) => e.target.select()}
        className={H.input}
        style={S(`margin-top:8px;width:100%;height:44px;padding:0 12px;border-radius:${R.control};border:1px solid ${C.line2};background:${C.mist};font:400 14px/1.2 ${F.body};color:${C.ink};text-overflow:ellipsis`)}
      />
      <div style={S('margin-top:12px;display:flex;gap:10px;flex-wrap:wrap')}>
        <Button variant="primary" icon={copied ? 'check' : 'copy'} onClick={copy} aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</Button>
        <Button variant="outline" icon="mail" href={inviteMailto(msg)}>Email invite</Button>
        {canText ? <Button variant="outline" icon="message" href={inviteSms(msg)}>Text invite</Button> : null}
      </div>
      <p style={S(`margin:14px 0 0;${SMALL}`)}>
        {person.email ? `Email invite opens your email app with a message to ${person.email}.` : 'Email invite opens your email app with the message filled in. Add their address there.'}
      </p>
      <ModalActions>
        <Button variant="outline" onClick={() => api.close()}>Done</Button>
      </ModalActions>
    </div>
  );
}

/* Links from one import, one row per student. */
function InviteShareList({ api, project, people }) {
  const [copied, setCopied] = useState('');
  const lead = leadFirstName();
  const copy = async (key, text) => {
    const ok = await copyText(text);
    if (ok) setCopied(key);
    else toast({ title: "Couldn't copy the links", message: 'Open a student’s menu on People and choose Copy invite link.', tone: 'warn' });
  };
  const all = invitesAsText(people.map((x) => ({ name: x.n, token: x.inviteToken })));
  return (
    <div>
      <ul style={S(`margin:0;padding:0;list-style:none;border-top:1px solid ${C.line};max-height:min(52vh, 420px);overflow:auto`)}>
        {people.map((x) => {
          const link = inviteLink(x.inviteToken);
          return (
            <li key={x.id} style={S(`display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;${RULE};flex-wrap:wrap`)}>
              <div style={S('min-width:0;flex:1 1 180px')}>
                <div className="vu-trunc" style={S(LABEL)}>{x.n}</div>
                <div className="vu-trunc" style={S(`margin-top:2px;${SMALL}`)}>{x.email || 'No email on file'}</div>
              </div>
              <div style={S('display:flex;gap:8px;flex:none')}>
                <Button variant="outline" size="sm" icon={copied === x.id ? 'check' : 'copy'} onClick={() => copy(x.id, link)} aria-label={`Copy invite link for ${x.n}`}>
                  {copied === x.id ? 'Link copied' : 'Copy link'}
                </Button>
                <Button variant="outline" size="sm" icon="mail" href={inviteMailto({ email: x.email, name: x.n, projectName: project.name, leadName: lead, link })} aria-label={`Email invite to ${x.n}`}>
                  Email
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ModalActions left={<Button variant="ghost" size="sm" onClick={() => copy('all', all)}>{copied === 'all' ? 'All links copied' : 'Copy all links'}</Button>}>
        <Button variant="outline" onClick={() => api.close()}>Done</Button>
      </ModalActions>
    </div>
  );
}

const TEXTAREA = `display:block;width:100%;padding:12px 14px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:400 15px/1.55 ${F.body};color:${C.ink}`;

function ImportForm({ api, project, onInvited }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(',').map((x) => x.trim()))
    .filter((parts) => parts[0]);
  // name, school, grade, then an optional email.
  const valid = parsed.filter((r) => r.length >= 3 && r.length <= 4 && r[0].includes(' ') && r[1] && /^\d{1,2}$/.test(r[2]) && Number(r[2]) >= 6 && Number(r[2]) <= 12 && !inviteEmailError(r[3]));
  const bad = parsed.length - valid.length;
  const published = !!project.listingId;
  const submit = async () => {
    if (!valid.length || busy) return;
    const pos = project.positions[0];
    const added = valid.map(([n, school, grade, email]) => {
      const person = addPerson(project.id, { n, school, grade, role: pos ? pos.t : 'Volunteer', positionId: pos ? pos.id : null });
      if (person && email) updatePerson(project.id, person.id, { email });
      return person ? { ...person, email: email || '' } : null;
    }).filter(Boolean);
    const title = `Imported ${plural(added.length, 'student')}`;
    if (!published) {
      api.close();
      toast({ title, message: 'They’re on the roster as Added. Publish the project to get their invite links.', tone: 'ok' });
      return;
    }
    setBusy(true);
    const res = await createInvites(project.listingId, added.map((x) => ({ name: x.n, email: x.email, school: x.school, grade: x.grade, position: x.role, consent: false })));
    setBusy(false);
    api.close();
    if (!res.ok) {
      toast({ title, message: 'Their invite links didn’t save. Choose Create invite link from each row’s menu to try again.', tone: 'warn' });
      return;
    }
    const invited = added.map((x, i) => ({ ...x, inviteId: res.invites[i].id, inviteToken: res.invites[i].token }));
    invited.forEach((x) => updatePerson(project.id, x.id, { inviteId: x.inviteId, inviteToken: x.inviteToken }));
    toast({ title, message: 'They’re on the roster as Invited. Send each one their link.', tone: 'ok' });
    if (onInvited) onInvited(invited);
  };
  return (
    <div>
      <label htmlFor="imp" style={S(`display:block;font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Your list</label>
      <textarea
        id="imp"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Ana Castillo, North Central High School, 11, ana@example.org\nMarcus Bell, Shortridge High School, 12'}
        className={H.input}
        style={S(`margin-top:8px;min-height:140px;${TEXTAREA}`)}
      />
      {parsed.length ? (
        <div className="vu-hint" aria-live="polite" style={S(`margin-top:8px;font:500 13px/1.4 ${F.body};color:${bad ? C.waiting : C.confirmed}`)}>
          {bad
            ? `${valid.length} of ${plural(parsed.length, 'row')} ready. Each row needs a full name, a school and a grade from 6 to 12, then an email if you have one.`
            : `${plural(valid.length, 'row')} ready to import.`}
        </div>
      ) : null}
      <ModalActions>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" busy={busy} disabled={!valid.length} aria-disabled={valid.length ? undefined : 'true'} onClick={submit}>
          {busy ? 'Importing students' : valid.length ? `Import ${plural(valid.length, 'student')}` : 'Import students'}
        </Button>
      </ModalActions>
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
        <ul style={S(`margin:0 0 16px;padding:0;list-style:none;max-height:180px;overflow:auto;border-top:1px solid ${C.line}`)}>
          {person.notes.map((n, i) => (
            <li key={n.id || i} style={S(`padding:10px 0;${RULE}`)}>
              <div className="vu-break" style={S(`font:400 14px/1.5 ${F.body};color:${C.ink}`)}>{typeof n === 'string' ? n : n.t || n.text}</div>
              {n.w ? <div style={S(`margin-top:4px;${SMALL};color:${C.ink3}`)}>{sentence(n.w)}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={`note-${person.id}`} className="vu-sr">Note</label>
      <textarea
        id={`note-${person.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={400}
        placeholder="e.g. Prefers the early shift. Great with the younger kids."
        className={H.input}
        style={S(`min-height:100px;${TEXTAREA}`)}
      />
      <ModalActions>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" disabled={!text.trim()} aria-disabled={text.trim() ? undefined : 'true'} onClick={save}>Save note</Button>
      </ModalActions>
    </div>
  );
}

/* ---- positions ---------------------------------------------------------- */

const REQUIREMENTS = ['Guardian consent', 'Media release', 'Food handling', 'Reading training', 'Transport form'];

/** How to spot each requirement in a setup step or a project rule. */
const REQ_MATCH = {
  'Guardian consent': /consent/i,
  'Media release': /media release|photo release/i,
  'Food handling': /food (handling|safety)/i,
  'Reading training': /reading training/i,
  'Transport form': /transport/i,
};

/* Where a requirement applies on this project: positions that ask for it,
   setup steps every volunteer finishes, and the project's own rules (the
   consent rule for under-16s). Quality and Setup steps read the same data,
   so the three tabs agree. */
function requirementUse(p, r) {
  const re = REQ_MATCH[r];
  const positions = p.positions.filter((x) => (x.requirements || []).includes(r));
  const steps = re ? pipelineFor(p).filter((st) => re.test(`${st.label || ''} ${st.note || ''}`)) : [];
  const rules = re ? (p.rules || []).filter((t) => re.test(String(t))) : [];
  const under16 = [...steps.map((st) => `${st.label} ${st.note || ''}`), ...rules].some((t) => /under[ -]?16/i.test(t));
  let value = 'Not used';
  if (positions.length) value = plural(positions.length, 'position');
  else if (under16) value = 'Under 16';
  else if (steps.length) value = 'Setup step';
  else if (rules.length) value = 'Project rule';
  const where = [
    positions.length ? `Needed for ${positions.map((u) => u.t).join(', ')}.` : '',
    steps.length ? `Setup step for every volunteer: ${steps.map((st) => st.label).join(', ')}.` : '',
    rules.length ? `Project rule: ${rules.join('; ')}.` : '',
  ].filter(Boolean).join(' ');
  return { value, used: positions.length + steps.length + rules.length > 0, message: where || 'No position needs this yet. Add it when you edit a position.' };
}

/** "No training", "Required, 30 min training", "Food handling training". */
function trainingText(v) {
  const t = plainLabel(v).trim();
  if (!t || /^none$/i.test(t)) return 'No training';
  return /training$/i.test(t) ? t : `${t} training`;
}

/** "Applications open", "Applications open, 2 waiting", "Applications closed". */
function appsText(p, pos) {
  const label = positionAppsLabel(p, pos);
  if (label === 'Closed') return 'Applications closed';
  if (label === 'Open') return 'Applications open';
  return `Applications open, ${label}`;
}

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

  const sep = <span className="vu-sep" aria-hidden="true">{' · '}</span>;
  // The rail lists only requirements this project uses; the rest get one line.
  const reqs = REQUIREMENTS.map((r) => ({ r, use: requirementUse(p, r) }));
  const used = reqs.filter((x) => x.use.used);
  const unused = reqs.filter((x) => !x.use.used).map((x) => x.r);

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <section aria-labelledby="pos-h" style={S('min-width:0')}>
        <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
          <h2 id="pos-h" style={S(H2)}>Positions</h2>
          <Button variant="primary" size="sm" icon="plus" onClick={() => editPosition(null)}>Add position</Button>
        </div>
        {p.positions.length ? (
          <ul style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
            {p.positions.map((x) => {
              const full = !!x.slots && x.filledCount >= x.slots;
              return (
                <li key={x.id} style={S(`padding:18px 0;${RULE}`)}>
                  <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
                    <div style={S('min-width:0;flex:1')}>
                      <div style={S('display:flex;align-items:center;gap:6px 14px;flex-wrap:wrap')}>
                        <h3 style={S(`margin:0;font:600 17px/1.3 ${F.body};color:${C.ink}`)}>{x.t}</h3>
                        {x.open ? null : <StatusText tone="mute">Closed</StatusText>}
                      </div>
                      {x.note ? <p style={S(`margin:4px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink}`)}>{x.note}</p> : null}
                      <p style={S(`margin:6px 0 0;${META}`)}>
                        <span
                          role="progressbar"
                          aria-label={`${x.t} spots filled`}
                          aria-valuemin={0}
                          aria-valuemax={x.slots}
                          aria-valuenow={x.filledCount}
                          aria-valuetext={`${x.filledCount} of ${x.slots} filled`}
                          style={S(`font-weight:600;color:${full ? C.confirmed : C.ink};${NUM}`)}
                        >
                          {positionLabel(x)} filled
                        </span>
                        {sep}
                        <span>Ages {x.age}</span>
                        {sep}
                        <span>{trainingText(x.train)}</span>
                        {sep}
                        <span>{x.commit}</span>
                        {sep}
                        <span>{appsText(p, x)}</span>
                      </p>
                      {(x.requirements || []).length ? (
                        <p style={S(`margin:4px 0 0;${SMALL}`)}>Needs {x.requirements.join(', ')}</p>
                      ) : null}
                    </div>
                    <div style={S('display:flex;gap:4px;align-items:center;flex:none')}>
                      <Pressable label={`Edit ${x.t}`} onClick={() => editPosition(x)} className={cx(H.secondary, H.press)} style={S(ROW_BTN)}>
                        Edit
                      </Pressable>
                      <Pressable
                        label={`Duplicate ${x.t}`}
                        title={`Duplicate ${x.t}`}
                        onClick={() => {
                          const copy = duplicatePosition(p.id, x.id);
                          if (copy) toast({ title: 'Position duplicated', message: `${copy.t} is right below the original.`, tone: 'ok' });
                        }}
                        className={cx('vu-iconbtn-sm', H.press)}
                        style={S('width:36px;height:36px;cursor:pointer')}
                      >
                        <Icon name="copy" size={18} />
                      </Pressable>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon="list" title="No positions yet" body="A position is what students apply for, like Reading tutor." cta="Add position" onCta={() => editPosition(null)} />
        )}
      </section>

      <aside aria-label="Positions summary" style={S('min-width:0;display:flex;flex-direction:column')}>
        <section aria-labelledby="pos-req">
          <h2 id="pos-req" style={S(H3)}>Requirements</h2>
          <p style={S(`margin:6px 0 0;${SMALL}`)}>Forms and training a position or setup step asks for.</p>
          {used.length ? (
          <ul style={S(`margin:12px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
            {used.map(({ r, use }) => {
              return (
                <li key={r}>
                  <button
                    type="button"
                    aria-label={`Where ${r} is required`}
                    onClick={() =>
                      toast({ title: r, message: use.message, tone: use.used ? 'brand' : 'warn' })
                    }
                    className={cx('vu-row', 'vu-row--nolead', H.press)}
                    style={S(`width:100%;grid-template-columns:minmax(0,1fr) auto;padding:12px 0;background:none;border:0;border-bottom:1px solid ${C.line};text-align:left;font:inherit;cursor:pointer`)}
                  >
                    <span className="vu-row-t" style={S('font-weight:500')}>{r}</span>
                    <span style={S(`${SMALL};${NUM};white-space:nowrap`)}>
                      {use.value}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          ) : null}
          {unused.length ? (
            <p style={S(`margin:12px 0 0;${SMALL}`)}>
              {unusedLine(unused)} Turn one on when you edit a position.
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

/** "a, b and c". */
function listJoin(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Media release, food handling and transport form aren't used." */
function unusedLine(names) {
  const list = listJoin(names.map((r, i) => (i ? r.toLowerCase() : r)));
  return `${list} ${names.length === 1 ? "isn't" : "aren't"} used.`;
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
        <div style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Requirements</div>
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
      <label style={S(`margin-top:16px;display:flex;align-items:center;gap:10px;cursor:pointer;font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
        <input type="checkbox" checked={f.open} onChange={(e) => setF((x) => ({ ...x, open: e.target.checked }))} style={S(CHECK)} />
        Open for applications
      </label>
      <ModalActions
        left={
          pos ? (
            <Button
              variant="danger"
              icon="trash"
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
              aria-label={`Delete ${pos.t}`}
            >
              Delete position
            </Button>
          ) : null
        }
      >
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" onClick={save}>{pos ? 'Save position' : 'Add position'}</Button>
      </ModalActions>
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

/* A reminder for the next shift, posted as a team update. It's the same
   update the Messages tab posts, so it shows on the join page and on each
   member's home. Nothing is texted or emailed, and the copy says so. */
function ShiftReminder({ p, goTab }) {
  const next = p.archived ? null : nextUpcomingShift(p);
  const when = next ? `${next.d}, ${fmtTime(next.t)}` : '';
  function open() {
    openModal({
      title: `Remind your team about ${next.d}`,
      subtitle: "It posts as an update on your join page and on members' home. Nothing is texted or emailed.",
      Body: function ReminderBody({ api }) {
        return <ReminderForm api={api} p={p} ses={next} />;
      },
    });
  }
  return (
    <section aria-labelledby="sh-rem" className="vu-rail-sec">
      <h2 id="sh-rem" style={S(H3)}>Shift reminder</h2>
      {!p.listingId ? (
        <p style={S(`margin:8px 0 0;${SMALL}`)}>You can post reminders once your project is published.</p>
      ) : p.archived ? (
        <p style={S(`margin:8px 0 0;${SMALL}`)}>This project is archived, so there's no shift to remind people about.</p>
      ) : !next ? (
        <p style={S(`margin:8px 0 0;${SMALL}`)}>Add a shift and you can remind your team about it here.</p>
      ) : (
        <>
          <p style={S(`margin:8px 0 0;${SMALL}`)}>
            Next up is <span style={S(`color:${C.ink};font-weight:600`)}>{when}</span>. Post a reminder and your team sees it on their home.
          </p>
          <div style={S('margin-top:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap')}>
            <Button variant="outline" size="sm" icon="bell" onClick={open}>Post a reminder</Button>
            <button type="button" onClick={() => goTab && goTab('messages')} className={cx('vu-link', H.press)} style={S(TEXT_LINK)}>
              See updates
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ReminderForm({ api, p, ses }) {
  const where = ses.loc || p.siteShort || p.site || '';
  const [body, setBody] = useState(`Reminder: we're on for ${ses.d}, ${fmtTime(ses.t)}${where ? ` at ${where}` : ''}. Message me if you can't make it.`);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function post() {
    if (busy) return;
    if (!body.trim()) {
      setErr('Enter the reminder.');
      return;
    }
    setErr('');
    setBusy(true);
    const res = await postAnnouncement(p.listingId, body).catch((error) => ({ ok: false, error }));
    setBusy(false);
    if (!res.ok) {
      console.error('[lead] could not post reminder', res.error);
      toast({ title: "Couldn't post the reminder", message: 'Check your connection and try again.', tone: 'danger' });
      return;
    }
    api.close();
    toast({ title: 'Reminder posted', message: "It's on your join page and on members' home.", tone: 'ok' });
  }
  return (
    <div style={S('display:flex;flex-direction:column;gap:14px')}>
      <TextArea label="Reminder" value={body} onChange={setBody} maxLength={1000} error={err} required />
      <ModalActions>
        <Button variant="outline" onClick={() => api.close()}>Go back</Button>
        <Button variant="primary" icon="send" onClick={post} busy={busy}>{busy ? 'Posting' : 'Post reminder'}</Button>
      </ModalActions>
    </div>
  );
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
    <div style={S(`display:flex;flex-direction:column;gap:3px;${SMALL};min-width:0;${style}`)}>
      {su.going.length ? (
        <div className="vu-trunc">
          <span style={S(`color:${C.ink};font-weight:600`)}>Signed up: </span>
          {nameList(su.going)}
        </div>
      ) : null}
      {su.waiting.length ? (
        <div className="vu-trunc">
          <span style={S(`color:${C.waiting};font-weight:600`)}>Waiting on you: </span>
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
      body: 'Share the new code before the next shift. Check-ins with the old code get flagged for you on Setup steps.',
      confirmLabel: 'Change code',
    });
    if (!ok) return;
    const code = regenerateCode(p.id);
    toast({ title: 'Check-in code changed', message: `The new code is ${code}. Share it before the next shift.`, tone: 'ok' });
  }

  async function copyCode() {
    const ok = await copyText(String(p.checkinCode || ''));
    toast(ok ? { title: 'Check-in code copied', message: `${p.checkinCode}. Share it with your team before the shift.`, tone: 'ok', timeout: 2200 } : { title: 'Copy this code', message: String(p.checkinCode || ''), tone: 'warn' });
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

  /* Shifts at the project site don't repeat its name. Location shows only
     on shifts held somewhere else, and its column only when one exists. */
  const siteNames = new Set([p.site, p.siteShort].map((v) => String(v || '').trim().toLowerCase()).filter(Boolean));
  const offSite = (loc) => {
    const v = String(loc || '').trim();
    return v && !siteNames.has(v.toLowerCase()) ? v : '';
  };
  const showLoc = p.sessions.some((x) => offSite(x.loc));
  const COLS = `grid-template-columns:44px minmax(0,1fr)${showLoc ? ' minmax(0,1.5fr)' : ''} 72px 112px 76px`;
  const narrow = useNarrow();
  const pillOf = (label) => (label === 'Staffed' ? 'ok' : label === 'Cancelled' ? 'bad' : /^Needs/.test(label) ? 'wait' : 'mute');
  const editBtn = (x, raw) => (
    <Pressable label={`Edit shift ${x.d}`} onClick={() => editSession(raw)} className={cx(H.secondary, H.press)} style={S(ROW_BTN)}>
      Edit
    </Pressable>
  );

  return (
    <div className="vu-layout-rail" style={S('margin-top:32px')}>
      <section aria-labelledby="sh-h" style={S('min-width:0')}>
        <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
          <h2 id="sh-h" style={S(H2)}>Shifts</h2>
          <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
            <Button variant="outline" size="sm" icon="refresh" onClick={repeat}>Repeat weekly</Button>
            <Button variant="primary" size="sm" icon="plus" onClick={() => editSession(null)}>Add shift</Button>
          </div>
        </div>
        {narrow && p.sessions.length ? (
          <ul aria-label="Shifts" style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
            {p.sessions.map((raw) => {
              const x = withFill(p, raw, apps);
              const label = shiftLabel(x);
              return (
                <li key={x.id} style={S(`padding:14px 0;${RULE};display:flex;align-items:flex-start;gap:14px`)}>
                  <DateBlock date={x.d} size="sm" month />
                  <div style={S('min-width:0;flex:1')}>
                    <div style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{fmtTime(x.t)}</div>
                    {offSite(x.loc) ? <div className="vu-trunc" style={S(`margin-top:2px;${SMALL}`)}>{offSite(x.loc)}</div> : null}
                    <div style={S('margin-top:8px;display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap')}>
                      <StatusText tone={pillOf(label)}>{label}</StatusText>
                      <span style={S(`font:600 13px/1 ${F.body};color:${C.ink};${NUM}`)}>{x.filledCount} of {x.cap} filled</span>
                    </div>
                    {p.listingId ? <SignUpNames su={shiftSignUps(apps, raw.id)} style="margin-top:8px" /> : null}
                  </div>
                  {editBtn(x, raw)}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="vu-table-wrap" style={S('position:relative;margin-top:16px')}>
            <div role="table" aria-label="Shifts">
              <div role="row" style={S(`display:grid;${COLS};gap:16px;align-items:center;padding:0 0 10px;border-bottom:1px solid ${C.line};${TH}`)}>
                <div role="columnheader">Date</div><div role="columnheader">Time</div>{showLoc ? <div role="columnheader">Location</div> : null}<div role="columnheader">Filled</div><div role="columnheader">Status</div><div role="columnheader"><span className="vu-sr">Actions</span></div>
              </div>
              {p.sessions.length ? (
                p.sessions.map((raw) => {
                  const x = withFill(p, raw, apps);
                  const label = shiftLabel(x);
                  const su = p.listingId ? shiftSignUps(apps, raw.id) : null;
                  return (
                    <div key={x.id} role="row" className={H.row} style={S(`display:grid;${COLS};gap:6px 16px;padding:12px 0;${RULE};align-items:center;transition:background .16s ease`)}>
                      <div role="cell"><DateBlock date={x.d} size="sm" month /><span className="vu-sr">{x.d}</span></div>
                      <div role="cell" style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{fmtTime(x.t)}</div>
                      {showLoc ? <div role="cell" className="vu-trunc" style={S(`font:400 14px/1.3 ${F.body};color:${C.ink2}`)}>{offSite(x.loc)}</div> : null}
                      <div role="cell" style={S(`font:600 15px/1 ${F.body};color:${C.ink};${NUM}`)}>{x.filledCount} of {x.cap}</div>
                      <div role="cell"><StatusText tone={pillOf(label)}>{label}</StatusText></div>
                      <div role="cell" style={S('display:flex;justify-content:flex-end')}>{editBtn(x, raw)}</div>
                      {su && (su.going.length || su.waiting.length) ? (
                        <div role="cell" style={S('grid-column:2 / -1')}>
                          <SignUpNames su={su} />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <EmptyState compact icon="calendar" title="No shifts yet" body="Add 1 shift, then repeat it weekly to fill out the term." cta="Add shift" onCta={() => editSession(null)} />
              )}
            </div>
          </div>
        )}
      </section>

      <aside aria-label="Shift tools" style={S('min-width:0;display:flex;flex-direction:column')}>
        <section aria-labelledby="sh-code" className="vu-rail-sec">
          <h2 id="sh-code" style={S(H3)}>Check-in code</h2>
          <p style={S(`margin:6px 0 0;${SMALL}`)}>Volunteers enter this code when they arrive.</p>
          <div style={S('margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
            <span style={S(`font:600 28px/1 ${F.display};letter-spacing:0.04em;color:${C.ink};${NUM}`)}>{p.checkinCode}</span>
            <Button variant="outline" size="sm" icon="copy" onClick={copyCode} aria-label="Copy the check-in code">Copy</Button>
          </div>
          <div style={S('margin-top:12px')}>
            <button type="button" onClick={regenerate} aria-label="Change the check-in code" className={cx('vu-link', H.press)} style={S(TEXT_LINK)}>Change code</button>
          </div>
        </section>
        <ShiftReminder p={p} goTab={goTab} />
      </aside>
    </div>
  );
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* The Add shift form uses native date and time inputs ("2026-10-24",
   "13:00") and stores the app's labels ("Sat, Oct 24", "1:00 PM-4:00 PM").
   Labels carry no year and are read as the nearest one, so shifts go at
   most 6 months out. */
const MAX_SHIFT_AHEAD_DAYS = 183;
const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
const hhmm = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
function fromIsoDay(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.getMonth() === Number(m[2]) - 1 ? dt : null;
}
function minutesOf(v) {
  const m = /^(\d{2}):(\d{2})/.exec(String(v || ''));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const clock12 = (min) => `${Math.floor(min / 60) % 12 || 12}:${pad2(min % 60)} ${min < 720 ? 'AM' : 'PM'}`;

/** Everyone who picked this shift on the join page, in the Edit dialog. */
function ShiftSignUpList({ su, onReview }) {
  const row = (a, waiting) => (
    <li key={a.id} style={S(`display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid ${C.line}`)}>
      <div style={S('min-width:0')}>
        <div className="vu-trunc" style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{String(a.applicant_name || '').trim() || 'Volunteer'}</div>
        {a.position ? <div className="vu-trunc" style={S(`margin-top:2px;${SMALL}`)}>{a.position}</div> : null}
      </div>
      {waiting ? <StatusText tone="wait">Waiting on you</StatusText> : <StatusText tone="ok">Member</StatusText>}
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
        <div style={S(`margin-top:6px;${SMALL}`)}>Nobody has picked this shift on the join page yet.</div>
      )}
      {su.waiting.length ? (
        <div style={S(`margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;${SMALL}`)}>
          <span>Accept an applicant and they fill a spot.</span>
          {onReview ? (
            <Button variant="outline" size="sm" onClick={onReview}>Review applications</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Spots for a new shift: what most of the project's shifts already hold,
    else the positions total, else 9 (the wizard's default). */
function defaultSpots(project) {
  const counts = new Map();
  for (const x of project.sessions || []) {
    const c = Number(x.cap);
    if (c > 0 && x.st !== 'Cancelled') counts.set(c, (counts.get(c) || 0) + 1);
  }
  if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const total = (project.positions || []).reduce((a, x) => a + (Number(x.slots) || 0), 0);
  return total > 0 ? Math.min(total, 500) : 9;
}

/** Start and end of the project's latest dated shift, so a new shift copies
    the hours the team already keeps. 10 AM to 12 PM when there is none. */
function latestShiftRange(project) {
  let best = null;
  for (const x of (project && project.sessions) || []) {
    const r = parseTimeRange(x.t);
    const at = parseSessionDate(x.d);
    const t = at instanceof Date ? at.getTime() : NaN;
    if (!r || !(r.end > r.start) || !Number.isFinite(t)) continue;
    if (!best || t >= best.t) best = { t, r };
  }
  return best ? best.r : { start: 600, end: 720 };
}

function SessionForm({ api, project, ses, signUps = null, onReview }) {
  const range = ses ? parseTimeRange(ses.t) : null;
  const seed = range || latestShiftRange(project);
  const [f, setF] = useState({
    date: ses ? isoDay(parseSessionDate(ses.d)) : '',
    start: hhmm(seed.start),
    end: hhmm(seed.end),
    loc: ses ? ses.loc : project.siteShort,
    cap: ses ? String(ses.cap) : String(defaultSpots(project)),
    st: ses ? ses.st : 'Draft',
  });
  const [err, setErr] = useState({});
  const statusOpts = Array.from(new Set(['Draft', 'Open', 'Needs', 'Staffed', 'Cancelled', f.st].filter(Boolean))).map((v) => ({ v, l: v === 'Needs' ? 'Needs people' : v === 'Complete' ? 'Done' : v }));

  const save = () => {
    const e = {};
    const day = fromIsoDay(f.date);
    const start = minutesOf(f.start);
    const end = minutesOf(f.end);
    // An unchanged date or time keeps the label it was saved with.
    const sameTime = !!ses && !!range && start === range.start && end === range.end;
    const d = day ? (ses && isoDay(parseSessionDate(ses.d)) === f.date ? ses.d : formatSessionDate(day)) : '';
    const t = sameTime ? ses.t : start != null && end != null ? `${clock12(start)}-${clock12(end)}` : '';
    // A shift that already happened keeps its date and time (its attendance
    // still works); a new or moved shift has to be ahead.
    const moved = !ses || d !== ses.d || !range || start !== range.start || end !== range.end;
    const now = new Date();
    if (!day) e.d = 'Choose a date.';
    else if (moved && day < startOfDay(now)) e.d = "That date already passed. Choose a date that's coming up.";
    else if (moved && (day - startOfDay(now)) / 864e5 > MAX_SHIFT_AHEAD_DAYS) e.d = 'Choose a date in the next 6 months.';
    if (start == null || end == null) e.t = 'Enter a start and end time.';
    else if (end <= start) e.t = 'The end time has to be after the start time.';
    else if (!e.d && moved && day && new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, end) <= now) e.t = 'That time already passed today. Choose a later time.';
    const cap = Number(f.cap);
    if (!cap || cap < 1 || cap > 500) e.cap = 'Enter a number from 1 to 500.';
    setErr(e);
    if (Object.keys(e).length) return;
    upsertSession(project.id, { ...(ses ? { id: ses.id } : {}), loc: f.loc, cap, st: f.st, d, t });
    api.close();
    toast({ title: ses ? 'Shift saved' : 'Shift added', message: `${d} at ${fmtTime(t)}`, tone: 'ok' });
  };

  return (
    <div>
      <Field label="Date" type="date" value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} required error={err.d} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Starts" type="time" value={f.start} onChange={(v) => setF((x) => ({ ...x, start: v }))} required error={err.t} />
        <Field label="Ends" type="time" value={f.end} onChange={(v) => setF((x) => ({ ...x, end: v }))} required />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Location" value={f.loc} onChange={(v) => setF((x) => ({ ...x, loc: v }))} maxLength={80} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Spots" value={f.cap} onChange={(v) => setF((x) => ({ ...x, cap: v.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" error={err.cap} />
        {ses ? <Select label="Status" value={f.st} options={statusOpts} onChange={(v) => setF((x) => ({ ...x, st: v }))} /> : <span />}
      </div>
      {signUps ? <ShiftSignUpList su={signUps} onReview={onReview} /> : null}
      <ModalActions
        left={
          ses ? (
            <Button
              variant="danger"
              icon="trash"
              aria-label={`Delete shift ${ses.d}`}
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
            >
              Delete shift
            </Button>
          ) : null
        }
      >
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" onClick={save}>{ses ? 'Save shift' : 'Add shift'}</Button>
      </ModalActions>
    </div>
  );
}
