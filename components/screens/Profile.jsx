'use client';

/* ==========================================================================
   Profile.jsx, the student's profile and hour card
   The one screen where hours are the hero. Totals are kept apart on purpose:
   - confirmed: hours an organizer confirmed on a project the student joined
   - waiting: hours logged on a joined project the organizer hasn't confirmed
   - logged on your own: entries from the Log hours form (nobody can confirm)
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, Field, TextArea, Icon } from '../ui.jsx';
import { safeUrl } from '../MemberProjects.jsx';
import { track } from '../../lib/analytics.js';
import { useSnapshot } from '../../lib/store.js';
import { openModal, toast, confirmDialog } from '../../lib/overlays.js';
import { GRADE_TONE, download, copyText, updateAccount, removeHoursLog } from '../../lib/db.js';
import { loadMyApplications } from '../../lib/listings.js';
import { badges as BADGE_DEFS } from '../../lib/seed.js';
import { openLogHours, sortByLogDate } from '../LogHoursForm.jsx';
import MyRatings from '../MyRatings.jsx';
import MyServiceHours, { hrsShort } from '../MyServiceHours.jsx';
import VolunteerApplications from '../VolunteerApplications.jsx';

const MONO = "'Geist Mono',monospace";
const H2 = 'margin:0;font:600 16px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714';
const BTN_SECONDARY = 'display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer';
const BTN_PRIMARY = 'display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer';
const BTN_SMALL = 'flex:none;display:inline-flex;align-items:center;gap:6px;padding:0 13px;height:34px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer';
const DIVIDER = 'height:1px;background:#F1EBE4;margin:26px 0';
const HISTORY_PREVIEW = 4;
/* Tighter section padding on phones; globals.css has no class for this card. */
const PROFILE_CSS = '@media (max-width:720px){.vu-pfl-pad{padding-left:18px !important;padding-right:18px !important}}';

const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;
const hoursWord = (n) => `${round1(n)} ${round1(n) === 1 ? 'hour' : 'hours'}`;

/* ---- pure helpers -------------------------------------------------------- */

/** Org-logged hours from the volunteer's accepted applications, plus the
    listing's cause for the cause bars. Two sources, both counted the way the
    lead's Hours export counts them (lead/Tabs.jsx memberTotals):
    - member_state.hoursLog: hours the volunteer logged; confirmed once the lead
      ticks them in assignment.confirmedHours
    - assignment.attendanceHours: shifts the lead posted in Attendance; the lead
      wrote them, so they are confirmed */
export function summarizeService(apps) {
  const out = { verified: 0, pending: 0, entries: [] };
  for (const app of apps || []) {
    if (app.status !== 'accepted' || !app.listings) continue;
    const log = (app.member_state && app.member_state.hoursLog) || [];
    const assignment = app.assignment || {};
    const confirmed = assignment.confirmedHours || {};
    const posted = Array.isArray(assignment.attendanceHours) ? assignment.attendanceHours.filter((h) => h && h.id) : [];
    const base = { org: app.listings.name || 'A project', cause: app.listings.cause || '', applicationId: app.id };
    for (const h of log) {
      const verified = !!confirmed[h.id];
      const hrs = Number(h.hrs) || 0;
      if (verified) out.verified += hrs; else out.pending += hrs;
      // `id` is unique across applications (hour ids repeat between them);
      // `hourId` is the id inside this application's log.
      out.entries.push({ ...h, ...base, id: `${app.id}:${h.id}`, hourId: h.id, hrs, verified });
    }
    for (const h of posted) {
      const hrs = Number(h.hrs) || 0;
      if (hrs <= 0) continue;
      out.verified += hrs;
      out.entries.push({ ...h, ...base, id: `${app.id}:${h.id}`, hourId: h.id, activity: h.activity || 'Shift', hrs, verified: true, source: 'attendance' });
    }
  }
  out.verified = round1(out.verified);
  out.pending = round1(out.pending);
  // Confirmed first, newest first within each group.
  out.entries = sortByLogDate(out.entries).sort((a, b) => Number(b.verified) - Number(a.verified));
  return out;
}

/** Hours per cause across project hours and self-logged categories. */
export function causeTotals(serviceEntries, hoursLog) {
  const m = new Map();
  const add = (name, hrs) => {
    const k = (name || '').trim();
    if (!k) return;
    m.set(k, round1((m.get(k) || 0) + (Number(hrs) || 0)));
  };
  for (const e of serviceEntries || []) add(e.cause, e.hrs);
  for (const h of hoursLog || []) add(h.category, h.hrs);
  return [...m.entries()].map(([name, n]) => ({ name, n })).filter((b) => b.n > 0).sort((a, b) => b.n - a.n);
}

/** Badge progress computed from data, never from stored "earned" strings. */
export function badgeStatus(b, facts) {
  const have = b.kind === 'hours' ? facts.confirmed : b.kind === 'orgs' ? facts.orgs : b.kind === 'causes' ? facts.causes : facts.projects;
  const need = Number(b.need) || 0;
  if (have >= need) return { on: true, line: 'Earned' };
  const left = round1(need - have);
  if (b.kind === 'hours') return { on: false, line: `${hoursWord(left)} to go` };
  if (b.kind === 'orgs') return { on: false, line: `${left} more ${left === 1 ? 'organization' : 'organizations'}` };
  if (b.kind === 'causes') return { on: false, line: `${left} more ${left === 1 ? 'cause' : 'causes'}` };
  return { on: false, line: 'Run 1 student project' };
}

function csvEscape(v) {
  const t = String(v == null ? '' : v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Every hour on the profile, with its status spelled out, newest first. */
export function hoursCSV(serviceEntries, hoursLog) {
  const head = ['Date', 'Activity', 'Organization', 'Hours', 'Status'];
  const all = [
    ...(serviceEntries || []).map((e) => ({ date: e.date, row: [e.date, e.activity, e.org, e.hrs, e.verified ? 'Confirmed by organizer' : 'Waiting on organizer'] })),
    ...(hoursLog || []).map((h) => ({ date: h.date, row: [h.date, h.name, h.org, h.hrs, h.verified ? 'Confirmed by organizer' : 'Logged on your own'] })),
  ];
  const rows = sortByLogDate(all).map((x) => x.row);
  return { count: rows.length, text: [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') };
}

function initials(a) {
  const src = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || '';
  return src.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function shareLink() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://volunteeru.app';
}

function captionFor(confirmed) {
  return confirmed > 0
    ? `${hoursWord(confirmed)} of volunteering confirmed by organizers on VolunteerU. ${shareLink()}`
    : `Finding places to volunteer on VolunteerU. ${shareLink()}`;
}

async function copyWithToast(text, okTitle) {
  const ok = await copyText(text);
  toast(ok ? { title: okTitle, tone: 'ok' } : { title: "Couldn't copy", message: 'Select the text and copy it yourself.', tone: 'warn' });
  return ok;
}

/* ---- screen -------------------------------------------------------------- */

export default function Profile() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { state } = useSnapshot();
  const badgesRef = useRef(null);

  const [svc, setSvc] = useState(null);
  const [svcError, setSvcError] = useState(false);

  const loadService = useCallback(async () => {
    setSvcError(false);
    try {
      const apps = await loadMyApplications({ throwOnError: true });
      setSvc(summarizeService(apps));
    } catch (e) {
      console.error('Profile: loading project hours failed', e);
      setSvcError(true);
    }
  }, []);

  useEffect(() => { loadService(); }, [loadService]);

  const a = state.account;
  const isolated = params.get('cause') || '';
  const showAll = params.get('history') === 'all';
  const focus = params.get('focus');

  const svcEntries = svc ? svc.entries : [];
  // No useMemo on state.hoursLog: db.logHours/removeHoursLog change that array
  // in place, so its reference stays the same after a new entry.
  const selfLog = sortByLogDate(state.hoursLog || []);
  const selfConfirmed = round1(selfLog.filter((h) => h.verified).reduce((t, h) => t + Number(h.hrs || 0), 0));
  const ownLogged = round1(selfLog.filter((h) => !h.verified).reduce((t, h) => t + Number(h.hrs || 0), 0));
  const confirmed = round1((svc ? svc.verified : Number(state.stats.verifiedHours) || 0) + selfConfirmed);
  const waiting = svc ? svc.pending : 0;

  const causes = causeTotals(svcEntries, selfLog);
  const maxCause = Math.max(1, ...causes.map((b) => b.n));
  const orgCount = new Set([...svcEntries.map((e) => e.org), ...selfLog.map((h) => h.org)].map((o) => (o || '').trim().toLowerCase()).filter(Boolean)).size;
  const studentProjects = (state.projects || []).filter((p) => p.orgClass !== 'official').length;
  const facts = { confirmed, orgs: orgCount, causes: causes.length, projects: studentProjects };
  const confirmedEntries = svcEntries.filter((e) => e.verified);
  const confirmedOrgCount = new Set(confirmedEntries.map((e) => (e.org || '').trim().toLowerCase()).filter(Boolean)).size;

  const filteredLog = isolated ? selfLog.filter((h) => (h.category || '') === isolated) : selfLog;
  const history = showAll ? filteredLog : filteredLog.slice(0, HISTORY_PREVIEW);

  useEffect(() => {
    if (focus !== 'badges' && focus !== 'applications') return undefined;
    // Wait a beat so a route change's own scroll-to-top doesn't cancel ours.
    const t = setTimeout(() => {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior = reduce ? 'auto' : 'smooth';
      if (focus === 'badges' && badgesRef.current) badgesRef.current.scrollIntoView({ behavior, block: 'center' });
      if (focus === 'applications') {
        const el = document.getElementById('vu-applications');
        if (el) el.scrollIntoView({ behavior, block: 'start' });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [focus]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params.toString());
    if (!v) next.delete(k);
    else next.set(k, v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  function downloadCSV() {
    const { count, text } = hoursCSV(svcEntries, selfLog);
    if (!count) {
      toast({ title: 'Nothing to download yet', message: 'Log hours first, then download them here.', tone: 'warn' });
      return;
    }
    const slug = (a.name || 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'me';
    download(`volunteeru-hours-${slug}.csv`, text);
    toast({ title: 'Hours downloaded', message: `${count} ${count === 1 ? 'row' : 'rows'}, each marked confirmed, waiting or logged on your own.`, tone: 'ok' });
  }

  function editProfile() {
    openModal({
      title: 'Edit your profile',
      subtitle: 'Organizers see this when you apply.',
      Body: ({ api }) => <ProfileEditForm api={api} account={a} />,
    });
  }

  function shareHours() {
    const link = shareLink();
    const caption = captionFor(confirmed);
    openModal({
      title: 'Share your hours',
      subtitle: "The link opens VolunteerU's home page. Your contact details aren't in it.",
      body: (
        <div>
          <HourCardFace confirmed={confirmed} meta={cardMeta(a, confirmedOrgCount)} />
          <div style={S('margin-top:16px')}>
            <Field label="Caption" value={caption} readOnly />
          </div>
          <div style={S('margin-top:14px;display:flex;gap:10px;flex-wrap:wrap')}>
            <Pressable label="Copy caption" onClick={() => copyWithToast(caption, 'Caption copied')} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
              <Icon name="copy" size={15} />
              Copy caption
            </Pressable>
            <Pressable label="Copy link" onClick={() => copyWithToast(link, 'Link copied')} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
              <Icon name="link" size={15} />
              Copy link
            </Pressable>
            <Pressable label="Download CSV" onClick={downloadCSV} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
              <Icon name="download" size={15} />
              Download CSV
            </Pressable>
          </div>
        </div>
      ),
    });
  }

  function savePdf() {
    toast({ title: 'Opening the print dialog', message: 'Pick "Save as PDF" as the destination.', tone: 'brand' });
    setTimeout(() => window.print(), 400);
  }

  async function removeEntry(r) {
    const ok = await confirmDialog({
      title: 'Remove these hours?',
      body: `${r.name}, ${hrsShort(r.hrs)}${r.date ? ` on ${r.date}` : ''} comes off your profile.`,
      confirmLabel: 'Remove hours',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    const gone = removeHoursLog(r.id);
    toast(gone ? { title: 'Hours removed', message: `${r.name}, ${hrsShort(r.hrs)}.`, tone: 'ok' } : { title: "Couldn't remove those hours", message: 'Reload the page and try again.', tone: 'danger' });
  }

  const metaLine = [a.city, a.grade ? `Grade ${a.grade}` : null, a.school].filter(Boolean).join(', ');
  const hasAbout = a.bio || a.headline || (a.skills || '').trim() || (a.experience || '').trim() || (a.goals || '').trim() || safeUrl(a.resumeUrl);

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <style>{PROFILE_CSS}</style>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:24px')}>
        <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Profile</h1>
        <div className="vu-noprint" style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <Pressable label="Share your hours" onClick={shareHours} className={cx(H.secondaryLift, H.press)} style={S(BTN_SECONDARY)}>
            <Icon name="share" size={15} />
            Share hours
          </Pressable>
          <Pressable label="Save your profile as a PDF" onClick={savePdf} className={cx(H.primaryLift, H.press)} style={S(BTN_PRIMARY)}>
            <Icon name="download" size={15} />
            Save as PDF
          </Pressable>
        </div>
      </div>

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:24px;margin-top:22px;align-items:start')}>
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;min-width:0')}>
          {/* identity + totals */}
          <div className="vu-pfl-pad" style={S('padding:26px 30px;border-bottom:1px solid #F1EBE4')}>
            <div style={S('display:flex;align-items:center;gap:16px;flex-wrap:wrap')}>
              <div style={S('width:68px;height:68px;border-radius:50%;overflow:hidden;flex:none;background:#F1EBE4;display:flex;align-items:center;justify-content:center')}>
                {a.avatar ? (
                  <ImageSlot src={a.avatar} shape="circle" placeholder="portrait" />
                ) : (
                  <span aria-hidden="true" style={S('font:600 22px/1 Geist;letter-spacing:-0.02em;color:#57504A')}>{initials(a)}</span>
                )}
              </div>
              <div style={S('flex:1;min-width:180px')}>
                <div className="vu-break" style={S('font:600 26px/1.1 Geist;letter-spacing:-0.03em')}>{a.name}</div>
                {metaLine ? (
                  <div style={S('margin-top:6px;font:450 14px/1.35 Geist;color:#8A8179')}>{metaLine}</div>
                ) : (
                  <Pressable label="Add your city and school" onClick={editProfile} className={H.link} style={S('margin-top:6px;font:500 13px/1.35 Geist;color:#C2603C;cursor:pointer;width:max-content')}>
                    Add your city and school
                  </Pressable>
                )}
              </div>
            </div>
            <div style={S('margin-top:22px;display:flex;align-items:flex-end;gap:12px 28px;flex-wrap:wrap')}>
              <div>
                <div data-testid="hours-confirmed" style={S(`font:600 44px/1 Geist;letter-spacing:-0.04em;font-variant-numeric:tabular-nums;color:#1A1714`)}>{round1(confirmed)}</div>
                <div style={S('margin-top:6px;font:500 13px/1.2 Geist;color:#3F6B4E')}>{round1(confirmed) === 1 ? 'hour' : 'hours'} confirmed by organizers</div>
              </div>
              <div style={S('display:flex;flex-direction:column;gap:6px;padding-bottom:2px')}>
                {waiting > 0 ? <HoursFact testid="hours-waiting" n={waiting} label="waiting on an organizer" tone="#C98A2E" /> : null}
                {ownLogged > 0 ? <HoursFact testid="hours-own" n={ownLogged} label="logged on your own" tone="#B8AEA4" /> : null}
              </div>
            </div>
          </div>

          {/* about */}
          <div className="vu-pfl-pad" style={S('padding:24px 30px;border-bottom:1px solid #F1EBE4')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <h2 style={S(H2)}>About you</h2>
              <Pressable label="Edit profile" onClick={editProfile} className={cx(H.secondary, H.press)} style={S('flex:none;display:inline-flex;align-items:center;gap:6px;padding:0 13px;height:32px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}>
                <Icon name="edit" size={13} />
                Edit profile
              </Pressable>
            </div>
            {(a.headline || a.pronouns) ? (
              <div style={S('margin-top:12px;font:500 14px/1.4 Geist;color:#1A1714')}>
                {a.headline}
                {a.pronouns ? <span style={S('color:#8A8179;font-weight:450')}>{a.headline ? ` (${a.pronouns})` : a.pronouns}</span> : null}
              </div>
            ) : null}
            {a.bio ? <div className="vu-break" style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#332D28;white-space:pre-wrap')}>{a.bio}</div> : null}
            {(a.skills || '').trim() ? (
              <div style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:7px')}>
                {a.skills.split(',').map((sk) => sk.trim()).filter(Boolean).slice(0, 12).map((sk) => (
                  <span key={sk} style={S('padding:4px 10px;border-radius:7px;background:#F6F2EE;font:500 12px/1 Geist;color:#57504A')}>{sk}</span>
                ))}
              </div>
            ) : null}
            {(a.experience || '').trim() ? (
              <div style={S('margin-top:14px')}>
                <div style={S('font:600 13px/1.2 Geist;color:#57504A')}>Experience</div>
                <div className="vu-break" style={S('margin-top:5px;font:450 13px/1.55 Geist;color:#332D28;white-space:pre-wrap')}>{a.experience}</div>
              </div>
            ) : null}
            {(a.goals || '').trim() ? (
              <div style={S('margin-top:14px')}>
                <div style={S('font:600 13px/1.2 Geist;color:#57504A')}>Goals</div>
                <div className="vu-break" style={S('margin-top:5px;font:450 13px/1.55 Geist;color:#332D28;white-space:pre-wrap')}>{a.goals}</div>
              </div>
            ) : null}
            {safeUrl(a.resumeUrl) ? (
              <a href={safeUrl(a.resumeUrl)} target="_blank" rel="noopener noreferrer" style={S('margin-top:14px;display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;text-decoration:none')}>
                View résumé
                <Icon name="external" size={13} />
              </a>
            ) : null}
            {!hasAbout ? (
              <div style={S('margin-top:10px;font:450 13px/1.6 Geist;color:#8A8179')}>Add a bio and a few skills so organizers know who's applying.</div>
            ) : null}
          </div>

          <div id="vu-applications" className="vu-pfl-pad" style={S('padding:24px 30px;border-bottom:1px solid #F1EBE4')}>
            <VolunteerApplications showEmpty />
          </div>

          <div className="vu-pfl-pad" style={S('padding:24px 30px')}>
            {causes.length ? (
              <>
                <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                  <h2 style={S(H2)}>Hours by cause</h2>
                  {isolated ? (
                    <Pressable label="Show all causes" onClick={() => setParam('cause', '')} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}>
                      Show all
                    </Pressable>
                  ) : null}
                </div>
                <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>Includes hours that aren't confirmed yet.</div>
                <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:13px')}>
                  {causes.map((b) => {
                    const dim = isolated && isolated !== b.name;
                    return (
                      <Pressable key={b.name} label={`${b.name}, ${hoursWord(b.n)}`} pressed={isolated === b.name} onClick={() => setParam('cause', isolated === b.name ? '' : b.name)} style={S('cursor:pointer')}>
                        <div style={s('display:flex;justify-content:space-between;gap:10px;font:450 13px/1 Geist', `color:${dim ? '#A9A097' : '#332D28'}`)}>
                          <span>{b.name}</span>
                          <span style={S(`font-family:${MONO};color:#8A8179`)}>{hrsShort(b.n)}</span>
                        </div>
                        <div style={S('margin-top:7px;height:6px;border-radius:4px;background:#F1EBE4')}>
                          <div style={s(`width:${Math.round((b.n / maxCause) * 100)}%`, 'height:100%;border-radius:4px', `background:${dim ? '#E7DED6' : '#C2603C'}`, 'transition:background .16s ease, width .36s cubic-bezier(.16,1,.3,1)')} />
                        </div>
                      </Pressable>
                    );
                  })}
                </div>
                <div style={S(DIVIDER)} />
              </>
            ) : null}

            {state.myAttendance && state.myAttendance.length ? (
              <>
                <h2 style={S(H2)}>Attendance</h2>
                <div className="vu-table-wrap" style={S('margin-top:14px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
                  <div>
                    <div style={S('display:grid;grid-template-columns:.7fr 1.6fr 1fr .6fr 1fr;gap:12px;padding:11px 16px;background:#FCFAF8;border-bottom:1px solid #F1EBE4;font:500 12px/1 Geist;color:#8A8179')}>
                      <div>Date</div><div>Project</div><div>Arrival</div><div>Hours</div><div>Score</div>
                    </div>
                    {state.myAttendance.map((x) => {
                      const g = GRADE_TONE[x.grade] || GRADE_TONE['Not scored'];
                      return (
                        <div key={x.id} style={S('display:grid;grid-template-columns:.7fr 1.6fr 1fr .6fr 1fr;gap:12px;padding:13px 16px;border-bottom:1px solid #F1EBE4;align-items:center')}>
                          <div style={S('font:450 12px/1 Geist;color:#8A8179')}>{x.d}</div>
                          <div style={S('font:500 13px/1 Geist')}>{x.p}</div>
                          <div style={S('font:450 12px/1 Geist;color:#57504A')}>{x.st}</div>
                          <div style={S(`font:500 13px/1 ${MONO}`)}>{x.hrs}</div>
                          <div><span style={S(`padding:5px 9px;border-radius:7px;background:${g.gBg};font:500 11px/1 ${MONO};color:${g.gColor}`)}>{x.grade}</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={S(DIVIDER)} />
              </>
            ) : null}

            {state.leadFeedback && state.leadFeedback.length ? (
              <>
                <h2 style={S(H2)}>Notes from organizers</h2>
                <div style={S('margin-top:12px;display:flex;flex-direction:column')}>
                  {state.leadFeedback.map((f, i) => (
                    <div key={f.id} style={s('padding:12px 0', i ? 'border-top:1px solid #F1EBE4' : '')}>
                      <div className="vu-break" style={S('font:450 14px/1.55 Geist;color:#332D28')}>{f.t}</div>
                      <div style={S('margin-top:6px;font:450 12px/1.3 Geist;color:#8A8179')}>{[f.who, f.when].filter(Boolean).join(', ')}</div>
                    </div>
                  ))}
                </div>
                <div style={S(DIVIDER)} />
              </>
            ) : null}

            {svcError || (svc && svc.entries.length) ? (
              <>
                <MyServiceHours data={svc || { verified: 0, pending: 0, entries: [] }} error={svcError} onRetry={loadService} />
                <div style={S(DIVIDER)} />
              </>
            ) : null}

            <MyRatings divider={DIVIDER} />

            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
              <h2 style={S(H2)}>Hours you logged</h2>
              <Pressable label="Log hours" onClick={() => openLogHours()} className={cx(H.secondary, H.press)} style={S(BTN_SMALL)}>
                <Icon name="plus" size={13} stroke={2.25} />
                Log hours
              </Pressable>
            </div>
            {selfLog.length === 0 ? (
              <div style={S('margin-top:12px;font:450 13px/1.6 Geist;color:#8A8179')}>Nothing logged yet. Add volunteering you did outside VolunteerU.</div>
            ) : filteredLog.length === 0 ? (
              <div style={S('margin-top:12px;font:450 13px/1.6 Geist;color:#8A8179')}>Nothing you logged is tagged {isolated}.</div>
            ) : (
              <div style={S('margin-top:8px;display:flex;flex-direction:column')}>
                {history.map((r, i) => (
                  <div key={r.id} style={s('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0', i ? 'border-top:1px solid #F1EBE4' : '')}>
                    <div style={S('min-width:0;flex:1')}>
                      <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0')}>
                        <div className="vu-trunc" style={S('font:500 14px/1.2 Geist;min-width:0')}>{r.name}</div>
                        {r.category ? <span style={S('padding:3px 8px;border-radius:6px;background:#F6F2EE;font:500 11px/1 Geist;color:#57504A')}>{r.category}</span> : null}
                      </div>
                      <div className="vu-trunc" style={S('font:450 12px/1.2 Geist;color:#8A8179;margin-top:4px')}>{[r.org, r.date].filter(Boolean).join(', ')}</div>
                    </div>
                    <div style={S('display:flex;align-items:center;gap:8px;flex:none')}>
                      <span style={S(`font:500 13px/1 ${MONO}`)}>{hrsShort(r.hrs)}</span>
                      {r.verified ? (
                        <span style={S('display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 11px/1 Geist;color:#3F6B4E')}>
                          <Icon name="check" size={11} stroke={2.25} />
                          Confirmed
                        </span>
                      ) : (
                        <Pressable label={`Remove ${r.name}, ${hrsShort(r.hrs)}`} onClick={() => removeEntry(r)} className={cx(H.secondary, H.press, 'vu-noprint')} style={S('display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;border:1px solid #EFE7DF;background:#fff;color:#8A8179;cursor:pointer')}>
                          <Icon name="trash" size={14} />
                        </Pressable>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {filteredLog.length > HISTORY_PREVIEW ? (
              <Pressable label={showAll ? 'Show fewer' : `Show all ${filteredLog.length}`} onClick={() => setParam('history', showAll ? '' : 'all')} className={cx(H.link, 'vu-noprint')} style={S('margin-top:12px;font:500 13px/1 Geist;color:#C2603C;cursor:pointer;width:max-content')}>
                {showAll ? 'Show fewer' : `Show all ${filteredLog.length}`}
              </Pressable>
            ) : null}
          </div>
        </div>

        <div style={S('display:flex;flex-direction:column;gap:14px;min-width:0')}>
          <div style={S('padding:22px;border-radius:16px;background:#1F1B18')}>
            <HourCardFace confirmed={confirmed} meta={cardMeta(a, confirmedOrgCount)} bare />
            {confirmedEntries.length ? (
              <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:8px')}>
                {confirmedEntries.slice(0, 4).map((e, i) => (
                  <div key={`${e.id}-${i}`} style={S('display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;border:1px dashed #4A4239')}>
                    <div style={S('min-width:0;flex:1')}>
                      <div className="vu-trunc" style={S('font:500 12px/1.25 Geist;color:#E6DFD8')}>{e.org}</div>
                      <div className="vu-trunc" style={S('margin-top:2px;font:450 11px/1.25 Geist;color:#A79E96')}>{e.date}</div>
                    </div>
                    <span style={S(`flex:none;font:600 13px/1 ${MONO};color:#F0B49B`)}>{hrsShort(e.hrs)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <a href="/discover" data-testid="hourcard-find" onClick={(ev) => { ev.preventDefault(); router.push('/discover'); }} style={S('margin-top:14px;display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#F0B49B;cursor:pointer;text-decoration:none')}>
                Find opportunities
                <Icon name="arrow-right" size={13} />
              </a>
            )}
            <div className="vu-noprint" style={S('margin-top:18px;display:flex;gap:8px')}>
              <Pressable label="Copy caption" onClick={() => copyWithToast(captionFor(confirmed), 'Caption copied')} style={S('flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;border-radius:10px;background:#26221E;border:1px solid #363029;font:500 12px/1 Geist;color:#E6DFD8;cursor:pointer;transition:background .16s ease, border-color .16s ease')}>
                <Icon name="copy" size={13} />
                Copy caption
              </Pressable>
              <Pressable label="Copy link" onClick={() => copyWithToast(shareLink(), 'Link copied')} style={S('flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;border-radius:10px;background:#26221E;border:1px solid #363029;font:500 12px/1 Geist;color:#E6DFD8;cursor:pointer;transition:background .16s ease, border-color .16s ease')}>
                <Icon name="link" size={13} />
                Copy link
              </Pressable>
            </div>
          </div>

          <div ref={badgesRef} style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <h2 style={S(H2)}>Badges</h2>
            <div style={S('margin-top:10px;display:flex;flex-direction:column')}>
              {/* Definitions come from lib/seed.js, never from the saved
                  workspace: accounts made through sign-up store badges: [],
                  and earned/locked is derived from facts anyway. */}
              {BADGE_DEFS.map((b, i) => {
                const st = badgeStatus(b, facts);
                return (
                  <div key={b.id} data-earned={st.on ? 'true' : 'false'} style={s('display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0', i ? 'border-top:1px solid #F1EBE4' : '')}>
                    <div style={s('font:500 13px/1.3 Geist', st.on ? 'color:#1A1714' : 'color:#57504A')}>{b.t}</div>
                    {st.on ? (
                      <span style={S('flex:none;display:inline-flex;align-items:center;gap:4px;font:500 12px/1 Geist;color:#3F6B4E')}>
                        <Icon name="award" size={13} />
                        Earned
                      </span>
                    ) : (
                      <span style={S('flex:none;font:450 12px/1 Geist;color:#8A8179')}>{st.line}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="vu-noprint" style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <h2 style={S(H2)}>For your counselor</h2>
            <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#6B635C')}>
              There's no counselor login yet. Download your hours and send the file to your counselor.
            </div>
            <Pressable label="Download your hours as CSV" onClick={downloadCSV} className={cx(H.secondaryLift, H.press)} style={S('margin-top:14px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer')}>
              <Icon name="download" size={14} />
              Download CSV
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}

function HoursFact({ n, label, tone, testid }) {
  return (
    <div data-testid={testid} style={S('display:flex;align-items:center;gap:8px;font:450 13px/1.2 Geist;color:#57504A')}>
      <span aria-hidden="true" style={S(`width:8px;height:8px;border-radius:2px;flex:none;background:${tone}`)} />
      <span><span style={S(`font:600 13px/1 ${MONO};color:#1A1714`)}>{hrsShort(n)}</span> {label}</span>
    </div>
  );
}

function cardMeta(a, orgCount) {
  return [orgCount ? `${orgCount} ${orgCount === 1 ? 'organization' : 'organizations'}` : null, a.grade ? `Grade ${a.grade}` : null].filter(Boolean).join(', ');
}

function HourCardFace({ confirmed, meta, bare }) {
  const inner = (
    <>
      <div style={S('font:500 13px/1 Geist;color:#A79E96')}>{bare ? 'Your hour card' : 'VolunteerU'}</div>
      <div style={S(`margin-top:12px;font:600 34px/1 Geist;letter-spacing:-0.04em;font-variant-numeric:tabular-nums;color:#fff`)}>{round1(confirmed)}</div>
      <div style={S('margin-top:6px;font:450 13px/1.4 Geist;color:#D9CFC6')}>{round1(confirmed) === 1 ? 'hour' : 'hours'} confirmed by organizers</div>
      {meta ? <div style={S('margin-top:8px;font:450 13px/1.4 Geist;color:#A79E96')}>{meta}</div> : null}
    </>
  );
  if (bare) return inner;
  return <div style={S('padding:22px;border-radius:16px;background:#1F1B18')}>{inner}</div>;
}

/* Downscale a chosen image to a square ~256px JPEG data URL, small enough to
   ride along in the account blob, no storage bucket needed. */
function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose a JPG or PNG image.')); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error('Choose an image under 12 MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', 0.82)); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("We couldn't read that image. Try a JPG or PNG."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("We couldn't read that file. Try a JPG or PNG."));
    reader.readAsDataURL(file);
  });
}

function ProfileEditForm({ api, account }) {
  const fileRef = useRef(null);
  const [f, setF] = useState({
    firstName: account.firstName || '',
    lastName: account.lastName || '',
    avatar: account.avatar || '',
    headline: account.headline || '',
    pronouns: account.pronouns || '',
    age: account.age ? String(account.age) : '',
    school: account.school || '',
    city: account.city || '',
    phone: account.phone || '',
    bio: account.bio || '',
    skills: account.skills || '',
    experience: account.experience || '',
    goals: account.goals || '',
    resumeUrl: account.resumeUrl || '',
  });
  const [err, setErr] = useState({});
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function onPickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    try {
      const dataUrl = await fileToAvatar(file);
      set('avatar', dataUrl);
    } catch (e2) {
      console.error('Avatar read failed', e2);
      toast({ title: "Couldn't use that image", message: e2.message || 'Try a JPG or PNG.', tone: 'danger' });
    }
  }

  function save() {
    const e = {};
    if (!f.firstName.trim()) e.firstName = 'Enter your first name.';
    if (f.resumeUrl.trim() && !safeUrl(f.resumeUrl)) e.resumeUrl = 'Enter a full link that starts with https://';
    setErr(e);
    if (Object.keys(e).length) return;
    updateAccount({
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      avatar: f.avatar,
      headline: f.headline.trim(),
      pronouns: f.pronouns.trim(),
      age: f.age ? Number(f.age) : null,
      school: f.school.trim(),
      city: f.city.trim(),
      phone: f.phone.trim(),
      bio: f.bio.trim(),
      skills: f.skills.trim(),
      experience: f.experience.trim(),
      goals: f.goals.trim(),
      resumeUrl: f.resumeUrl.trim(),
    });
    api.close();
    track('profile_updated', { has_bio: !!f.bio.trim(), has_resume: !!f.resumeUrl.trim(), has_photo: !!f.avatar });
    toast({ title: 'Profile saved', tone: 'ok' });
  }

  return (
    <div>
      <div style={S('display:flex;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap')}>
        <div style={S('width:66px;height:66px;border-radius:50%;overflow:hidden;flex:none;background:#F1EBE4;display:flex;align-items:center;justify-content:center')}>
          {f.avatar ? <ImageSlot src={f.avatar} shape="circle" placeholder="portrait" /> : <Icon name="user" size={26} color="#8A8179" />}
        </div>
        <div style={S('min-width:0')}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={S('display:none')} aria-hidden="true" tabIndex={-1} />
          <div style={S('display:flex;gap:9px;flex-wrap:wrap')}>
            <Pressable label={f.avatar ? 'Change photo' : 'Upload photo'} onClick={() => fileRef.current && fileRef.current.click()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
              <Icon name="upload" size={14} />
              {f.avatar ? 'Change photo' : 'Upload photo'}
            </Pressable>
            {f.avatar ? (
              <Pressable label="Remove photo" onClick={() => set('avatar', '')} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#8A8179;cursor:pointer')}>
                Remove photo
              </Pressable>
            ) : null}
          </div>
          <div style={S('margin-top:7px;font:450 12px/1.4 Geist;color:#8A8179')}>JPG or PNG, cropped to a square.</div>
        </div>
      </div>
      <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="First name" value={f.firstName} onChange={(v) => set('firstName', v)} maxLength={40} required error={err.firstName} autoComplete="given-name" />
        <Field label="Last name" value={f.lastName} onChange={(v) => set('lastName', v)} maxLength={40} autoComplete="family-name" />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Headline" value={f.headline} onChange={(v) => set('headline', v)} placeholder="e.g. Tutors reading on weekends" maxLength={80} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Pronouns (optional)" value={f.pronouns} onChange={(v) => set('pronouns', v)} placeholder="e.g. she/her" maxLength={24} />
        <Field label="Age (optional)" value={f.age} onChange={(v) => set('age', v.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="e.g. 16" maxLength={2} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="School (optional)" value={f.school} onChange={(v) => set('school', v)} maxLength={60} />
        <Field label="City (optional)" value={f.city} onChange={(v) => set('city', v)} maxLength={60} />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Bio" value={f.bio} onChange={(v) => set('bio', v)} placeholder="e.g. Junior at Riverside High. I help at the food bank most Saturdays." maxLength={400} minHeight={80} counter />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Skills and interests, separated by commas" value={f.skills} onChange={(v) => set('skills', v)} placeholder="e.g. Tutoring, Spanish, first aid" maxLength={160} />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Experience (optional)" value={f.experience} onChange={(v) => set('experience', v)} placeholder="e.g. Library reading buddy, summer 2025" maxLength={400} minHeight={70} counter />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Goals (optional)" value={f.goals} onChange={(v) => set('goals', v)} placeholder="e.g. Try 2 new causes this year" maxLength={300} minHeight={60} counter />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Résumé or portfolio link (optional)" value={f.resumeUrl} onChange={(v) => set('resumeUrl', v)} placeholder="https://" maxLength={300} inputMode="url" error={err.resumeUrl} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>Cancel</Pressable>
        <Pressable label="Save profile" onClick={save} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>Save profile</Pressable>
      </div>
    </div>
  );
}
