'use client';

/* ==========================================================================
   Lead.jsx, design screen: `isLead` (project workspace)
   Shell, tab bar, and the Overview / People / Positions / Shifts tabs.
   ========================================================================== */

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState, Field, Select, Chip } from '../ui.jsx';
import { useSnapshot } from '../../lib/store.js';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import CrossApplications from '../CrossApplications.jsx';
import TasksTab from '../lead/TasksTab.jsx';
import PipelineTab from '../lead/PipelineTab.jsx';
import AnnouncementBoard from '../AnnouncementBoard.jsx';
import {
  getProject, taskProgress, toggleTask, pendingApplications, pendingHours,
  positionLabel, positionAppsLabel, sessionStatus, sessionTone, shortSessions, peopleStats, filterPeople,
  PERSON_TONE, tone, copyText, upsertPosition, duplicatePosition, deletePosition,
  upsertSession, deleteSession, repeatWeekly, regenerateCode, setReminder, addPerson, updatePerson,
  removePerson, addNote, rosterCSV, download, setActiveProject, projects as allProjects,
  isTeam, orgTypeLabel, taskStats, taskRoles, tasksOf, roleOf, pipelineFor,
  requestProjectVerification, canCreateProject, projectBlockingCreation,
} from '../../lib/db.js';
import {
  AttendanceTab, ApplicationsTab, HoursTab, QualityTab, MessagesTab, SettingsTab,
} from '../lead/Tabs.jsx';

const MONO = "'Geist Mono',monospace";

/** Navigate to the new-project wizard, or explain why it's blocked. */
function goCreateProject(router) {
  if (canCreateProject()) { router.push('/create'); return; }
  const b = projectBlockingCreation();
  toast({
    title: 'Finish your current project first',
    message: b
      ? `${b.name} has no verified events yet. Run a session and post attendance before starting another.`
      : 'Run a session and post attendance on your current project before starting another.',
    tone: 'warn',
    timeout: 6000,
  });
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
  ['pipeline', 'Pipeline'],
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

export default function Lead({ projectId, tab: tabParam }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { state } = useSnapshot();

  const p = getProject(projectId || state.activeProjectId);
  const TABS = tabsFor(p);
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam : 'overview';

  if (!p) {
    return (
      <div className="vu-pad-40" style={S('padding:28px 40px 96px;display:flex;flex-direction:column;gap:20px')}>
        <CrossApplications />
        <EmptyState
          icon="◈"
          title="No project workspace yet"
          body="Set one up under a verified sponsor and you get applications, a roster, attendance and verified hours in one place."
          cta="Start a project"
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

  const appsBadge = pendingApplications(p).length;
  const hoursBadge = pendingHours(p).length;
  const openAttendance = p.attendanceSessions.filter((x) => !x.posted).length;
  // Matches the design's badge set exactly: applications, hours, attendance.
  const badgeFor = (k) => ({ applications: appsBadge, hours: hoursBadge, attendance: openAttendance }[k] || '') || '';

  function switchProject(e) {
    const list = allProjects();
    menuFromEvent(
      e,
      [
        ...list.map((x) => ({ key: x.id, label: x.name, checked: x.id === p.id, icon: x.archived ? '▤' : '◈' })),
        { sep: true },
        { key: '__new', label: 'New project', icon: '＋' },
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
      toast({ title: 'Almost ready', message: 'Your public link turns on once the project finishes publishing.', tone: 'warn' });
      return;
    }
    const ok = await copyText(link);
    toast(
      ok
        ? { title: 'Join link copied', message: 'Anyone with the link can view your project and apply.', tone: 'ok' }
        : { title: 'Copy this link', message: link, tone: 'warn' }
    );
  }

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:28px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <div style={S('display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>
            <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Project workspace</div>
            <div style={s('padding:4px 8px;border-radius:6px', `background:${p.archived ? '#F6F2EE' : '#EAF3EC'}`, `font:500 10px/1 ${MONO}`, `color:${p.archived ? '#6B635C' : '#3F6B4E'}`)}>{p.status}</div>
            {p.sponsor.verified ? (
              <div style={S(`padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>✓ VERIFIED ORGANIZATION</div>
            ) : p.sponsor.verificationRequestedAt ? (
              <div style={S(`padding:4px 8px;border-radius:6px;background:#FDF3E7;font:500 10px/1 ${MONO};color:#8A5A20`)}>VERIFICATION REQUESTED</div>
            ) : (
              <div style={S(`padding:4px 8px;border-radius:6px;background:#F6F2EE;font:500 10px/1 ${MONO};color:#8A8179`)}>SELF-REPORTED</div>
            )}
          </div>
          <div style={S('margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
            <h1 style={S('margin:0;font:600 32px/1.05 Geist;letter-spacing:-0.04em')}>{p.name}</h1>
            <Pressable
              label="Switch project"
              expanded={false}
              onClick={switchProject}
              className={cx(H.secondary, H.press)}
              style={S('padding:7px 10px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#6B635C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
            >
              Switch project ▾
            </Pressable>
          </div>
          <div style={S('margin-top:9px;font:450 14px/1.4 Geist;color:#8A8179')}>
            {p.site} · {p.cadence} · {p.termWeeks} week term · {p.createdLabel}
          </div>
        </div>
        <div style={S('display:flex;gap:10px')}>
          <Pressable
            label="Copy the recruit link"
            onClick={copyRecruit}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:background .16s ease, transform .16s ease')}
          >
            <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
            Copy recruit link
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
              label={label}
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
        {tab === 'overview' ? (isTeam(p) ? <TeamOverview p={p} goTab={goTab} /> : <Overview p={p} goTab={goTab} />) : null}
        {tab === 'people' ? <People p={p} params={params} setParam={setParam} /> : null}
        {tab === 'tasks' ? <TasksTab p={p} /> : null}
        {tab === 'pipeline' ? <PipelineTab p={p} /> : null}
        {tab === 'positions' ? <Positions p={p} /> : null}
        {tab === 'shifts' ? <Shifts p={p} /> : null}
        {tab === 'attendance' ? <AttendanceTab p={p} params={params} setParam={setParam} goTab={goTab} /> : null}
        {tab === 'applications' ? <ApplicationsTab p={p} params={params} setParam={setParam} goTab={goTab} onCopyLink={copyRecruit} /> : null}
        {tab === 'hours' ? <HoursTab p={p} /> : null}
        {tab === 'quality' ? <QualityTab p={p} params={params} setParam={setParam} goTab={goTab} /> : null}
        {tab === 'messages' ? (
          <div style={S('margin-top:22px;display:flex;flex-direction:column;gap:18px')}>
            <AnnouncementBoard listingId={p.listingId} canPost title="Team announcements board" />
            <MessagesTab p={p} params={params} setParam={setParam} embedded />
          </div>
        ) : null}
        {tab === 'settings' ? <SettingsTab p={p} /> : null}
      </div>
    </div>
  );
}

/* ---- overview ----------------------------------------------------------- */

function Overview({ p, goTab }) {
  const progress = taskProgress(p);
  const appsCount = pendingApplications(p).length;
  const hoursCount = pendingHours(p).length;
  const flagged = pendingHours(p).filter((q) => !q.ok).length;
  const shortSession = shortSessions(p)[0];
  const crew = p.people.filter((x) => x.st === 'Active').sort((a, b) => b.hrs - a.hrs).slice(0, 4);
  const oldest = pendingApplications(p).slice().sort((a, b) => b.ts - a.ts)[0];
  const leadTotal = (p.leadHours.planning + p.leadHours.sessions + p.leadHours.recruiting).toFixed(1);

  function messageCrew() {
    goTab('messages');
  }

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px')}>
        <CrossApplications />
        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:20px')}>
            <div>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Next session</div>
              <div style={S('margin-top:12px;font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>{p.nextSession.label}</div>
              <div style={S('margin-top:7px;font:450 13px/1.45 Geist;color:#8A8179')}>
                {p.siteShort} · {p.nextSession.confirmed} of {Math.max(p.nextSession.confirmed + p.nextSession.pending, p.crewTarget || (p.sessions[0] && p.sessions[0].cap) || p.nextSession.confirmed)} seats staffed · check-in code {p.checkinCode}
              </div>
            </div>
            <div style={S('display:flex;gap:9px;flex:none')}>
              <Pressable
                label="Message the crew"
                onClick={messageCrew}
                className={cx(H.secondary, H.press)}
                style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
              >
                Message crew
              </Pressable>
              <Pressable
                label="Open the roster"
                onClick={() => goTab('people')}
                className={cx(H.primary, H.press)}
                style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
              >
                <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
                Open roster
              </Pressable>
            </div>
          </div>
          <div className="vu-4col" style={S('margin-top:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px')}>
            {[
              { l: 'Confirmed', v: p.nextSession.confirmed },
              { l: 'Pending', v: p.nextSession.pending },
              { l: 'Materials', v: p.nextSession.materials },
              { l: 'Setting', v: p.nextSession.setting },
            ].map((k) => (
              <div key={k.l} style={S('padding:14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                <div style={S(`font:500 10px/1 ${MONO};color:#A9A097;letter-spacing:.08em;text-transform:uppercase`)}>{k.l}</div>
                <div style={S('margin-top:8px;font:600 18px/1 Geist')}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Launch checklist</div>
              <div style={S(`font:500 12px/1 ${MONO};color:#C2603C`)}>
                {progress.done} / {progress.total}
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
                      'width:17px;height:17px;border-radius:5px;flex:none;margin-top:2px;display:grid;place-items:center;font:600 9px/1 Geist;color:#C2603C',
                      `border:1px solid ${t.done ? '#C2603C' : '#E0D8CF'}`,
                      `background:${t.done ? '#FAF6F3' : '#FCFAF8'}`,
                      'transition:border-color .16s ease, background .16s ease'
                    )}
                  >
                    {t.done ? '✓' : ''}
                  </span>
                  <span style={S('font:450 14px/1.45 Geist;color:#332D28')}>{t.t}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Activity</div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column')}>
              {p.activity.length ? (
                p.activity.slice(0, 5).map((a) => (
                  <div key={a.id} style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #F1EBE4')}>
                    <div style={S('font:450 13px/1.45 Geist;color:#332D28')}>{a.t}</div>
                    <div style={S(`font:500 11px/1 ${MONO};color:#A9A097;flex:none;margin-top:2px`)}>{a.w}</div>
                  </div>
                ))
              ) : (
                <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>Nothing yet. Applications, check-outs and sponsor updates land here.</div>
              )}
            </div>
          </div>
        </div>

        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Crew snapshot</div>
            <Pressable label="Manage people" onClick={() => goTab('people')} className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C;cursor:pointer')}>
              Manage people
            </Pressable>
          </div>
          <div className="vu-4col" style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px')}>
            {crew.length ? (
              crew.map((c) => (
                <Pressable
                  key={c.id}
                  label={`${c.n}, ${c.role}`}
                  onClick={() => goTab('people')}
                  className={cx(H.cardSoft, H.press)}
                  style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;text-align:center;cursor:pointer;transition:border-color .16s ease')}
                >
                  <div style={S('width:48px;height:48px;margin:0 auto;border-radius:50%;overflow:hidden')}>
                    <ImageSlot src={''} shape="circle" placeholder="face" />
                  </div>
                  <div style={S('margin-top:11px;font:500 13px/1.2 Geist')}>{c.short}</div>
                  <div style={S('margin-top:4px;font:450 11px/1.2 Geist;color:#8A8179')}>{c.role}</div>
                  <div style={S(`margin-top:9px;font:500 11px/1 ${MONO};color:#C2603C`)}>{c.hrs.toFixed(1)} hrs</div>
                </Pressable>
              ))
            ) : (
              <div style={S('grid-column:1 / -1')}>
                <EmptyState compact title="No crew yet" body="Accept an application or add a student and they show up here." cta="Review applications" onCta={() => goTab('applications')} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Needs you today</div>
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
            {appsCount ? (
              <NeedCard
                title={`${appsCount} application${appsCount === 1 ? '' : 's'} waiting`}
                sub={oldest ? `Oldest is ${Math.max(1, Math.round(oldest.ts / 24))} day${Math.round(oldest.ts / 24) === 1 ? '' : 's'} old` : 'All fresh'}
                onClick={() => goTab('applications')}
              />
            ) : null}
            {hoursCount ? (
              <NeedCard
                title={`${hoursCount} hour log${hoursCount === 1 ? '' : 's'} to approve`}
                sub={flagged ? `${flagged} flagged as early leave` : 'All clean logs'}
                onClick={() => goTab('hours')}
              />
            ) : null}
            {shortSession ? (
              <NeedCard
                title={`${shortSession.d.replace(/^\w+, /, '')} is short ${shortSession.cap - shortSession.filledCount} tutors`}
                sub="Send a recruit link"
                onClick={() => goTab('shifts')}
              />
            ) : null}
            {!appsCount && !hoursCount && !shortSession ? (
              <div style={S('padding:14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#6B635C')}>
                Nothing waiting on you. Every session is staffed and every log is approved.
              </div>
            ) : null}
          </div>
        </div>

        <SponsorCard p={p} />

        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your leadership record</div>
          <div style={S('margin-top:10px;font:600 32px/1 Geist;letter-spacing:-0.04em')}>
            {leadTotal}
            <span style={S('font-size:13px;color:#8A8179')}> lead hrs</span>
          </div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
            <SideRow l="Planning" v={p.leadHours.planning.toFixed(1)} />
            <SideRow l="Sessions run" v={p.leadHours.sessions.toFixed(1)} />
            <SideRow l="Recruiting" v={p.leadHours.recruiting.toFixed(1)} />
          </div>
        </div>

        <CrewFunnel p={p} />

        {(p.eventsHosted > 0 || p.approxVolunteers > 0) ? (
          <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Track record</div>
            <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
              <SideRow l="Events hosted" v={p.eventsHosted} />
              <SideRow l="Volunteers reached" v={p.approxVolunteers} />
            </div>
          </div>
        ) : null}
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
      style={S('padding:12px 14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC;cursor:pointer;transition:border-color .16s ease')}
    >
      <div style={S('font:500 13px/1.2 Geist')}>{title}</div>
      <div style={S('margin-top:5px;font:450 11px/1.3 Geist;color:#8A8179')}>{sub}</div>
    </Pressable>
  );
}

function SideRow({ l, v }) {
  return (
    <div style={S('display:flex;justify-content:space-between;gap:10px')}>
      <span>{l}</span>
      <span style={S('color:#1A1714;font-weight:500')}>{v}</span>
    </div>
  );
}

/* Sponsor / organization panel. Shows only honest status, self-reported until a
   reviewer confirms, and offers a real, persisted "request verification" action.
   Nothing here claims an automated match is happening in the background. */
function SponsorCard({ p }) {
  const sp = p.sponsor || {};
  const named = sp.name && sp.name.trim();
  const status = sp.verified ? 'Verified organization'
    : sp.verificationRequestedAt ? 'Verification requested, under review'
    : named ? 'Self-reported (not yet verified)'
    : 'No organization added yet';

  const openRequest = () => {
    openModal({
      title: 'Request verification',
      subtitle: 'A reviewer confirms your registration and a named staff contact. This sends your details for review, free for students.',
      Body: ({ api }) => <VerifyForm p={p} api={api} />,
    });
  };

  return (
    <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Organization</div>
      <div style={S('margin-top:14px;display:flex;align-items:center;gap:11px')}>
        <div style={S('width:36px;height:36px;border-radius:10px;overflow:hidden;flex:none;background:#EFE9E2')}>
          {named ? <ImageSlot src={''} shape="rounded" radius={10} placeholder="logo" /> : null}
        </div>
        <div style={S('min-width:0')}>
          <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>
            {named || 'Not set'} {sp.verified ? <span aria-label="verified" style={S('color:#3F6B4E')}>✓</span> : null}
          </div>
          <div className="vu-trunc" style={S('margin-top:3px;font:450 11px/1.2 Geist;color:#8A8179')}>{status}</div>
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
          className={cx(H.press)}
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
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (!name.trim() || !contact.trim()) {
      toast({ title: 'Add both fields', message: 'We need the organization name and a staff contact to review.', tone: 'warn' });
      return;
    }
    setBusy(true);
    requestProjectVerification(p.id, { name, contact });
    toast({ title: 'Request received', message: 'A reviewer will confirm your organization. Status shows as “verification requested” until then.', tone: 'ok' });
    api.close();
  };
  return (
    <div style={S('display:flex;flex-direction:column;gap:14px')}>
      <Field label="Organization name" value={name} onChange={setName} placeholder="Registered nonprofit or sponsoring school" />
      <Field label="Staff contact (name + email)" value={contact} onChange={setContact} placeholder="Ms. Reyes · alvarez@school.edu" />
      <div style={S('display:flex;gap:10px;justify-content:flex-end')}>
        <button type="button" onClick={() => api.close()} className={cx(H.press)} style={S('padding:10px 16px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:500 13px/1 Geist;cursor:pointer')}>Cancel</button>
        <button type="button" onClick={submit} disabled={busy} className={cx(H.press)} style={S('padding:10px 16px;border-radius:10px;border:0;background:#C2603C;color:#fff;font:500 13px/1 Geist;cursor:pointer')}>Send for review</button>
      </div>
    </div>
  );
}

/* A simple, real bar chart of where the crew stands. Populates from live roster
   and application data, no fabricated numbers. */
function CrewFunnel({ p }) {
  const waiting = p.applications.filter((a) => a.status === 'pending').length;
  const onboarding = p.people.filter((x) => x.st === 'Onboarding').length;
  const active = p.people.filter((x) => x.st === 'Active').length;
  const rows = [
    { l: 'Applications waiting', v: waiting, c: '#8A5A20', bg: '#FDF3E7' },
    { l: 'Onboarding', v: onboarding, c: '#5B6BB0', bg: '#EEF3FB' },
    { l: 'Active crew', v: active, c: '#3F6B4E', bg: '#EAF3EC' },
  ];
  const max = Math.max(1, waiting, onboarding, active);
  const total = waiting + onboarding + active;
  return (
    <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Crew at a glance</div>
      {total === 0 ? (
        <div style={S('margin-top:12px;font:450 13px/1.5 Geist;color:#8A8179')}>No crew yet. As applications come in and you accept people, this chart fills in.</div>
      ) : (
        <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
          {rows.map((r) => (
            <div key={r.l}>
              <div style={S('display:flex;justify-content:space-between;gap:10px;font:450 12px/1 Geist;color:#57504A')}>
                <span>{r.l}</span>
                <span style={S('color:#1A1714;font-weight:600')}>{r.v}</span>
              </div>
              <div style={s('margin-top:6px;height:8px;border-radius:5px;overflow:hidden', `background:${r.bg}`)}>
                <div style={s('height:100%;border-radius:5px;transition:width .4s cubic-bezier(.16,1,.3,1)', `width:${Math.round((r.v / max) * 100)}%`, `background:${r.c}`)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- team overview (orgType 'team') ------------------------------------- */

function TeamOverview({ p, goTab }) {
  const stats = taskStats(p);
  const roles = taskRoles(p);
  const tasks = tasksOf(p);
  const inProgress = tasks.filter((t) => t.status === 'doing').slice(0, 4);
  const unassigned = tasks.filter((t) => !t.assigneeId && t.status !== 'done');
  const members = p.people.filter((x) => x.st === 'Active' || x.st === 'Onboarding');
  const needsBriefing = members.filter((m) => m.teamRoleId && !(m.briefingAck && m.briefingAck[m.teamRoleId]));

  return (
    <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:20px;margin-top:22px;align-items:start')}>
      <div style={S('display:flex;flex-direction:column;gap:16px')}>
        <CrossApplications />

        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:20px')}>
            <div>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Task board</div>
              <div style={S('margin-top:12px;font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>{stats.done} of {stats.total} done</div>
              <div style={S('margin-top:7px;font:450 13px/1.45 Geist;color:#8A8179')}>{stats.doing} in progress · {stats.todo} to do · {stats.roles} role{stats.roles === 1 ? '' : 's'}</div>
            </div>
            <Pressable label="Open the board" onClick={() => goTab('tasks')} className={cx(H.primary, H.press)} style={S('flex:none;display:inline-flex;align-items:center;gap:8px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}>
              <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
              Open board
            </Pressable>
          </div>
          <div style={S('margin-top:16px;height:8px;border-radius:99px;background:#F1EBE4;overflow:hidden')}>
            <div style={s('height:100%;border-radius:99px;background:linear-gradient(90deg,#D2775B,#C2603C);transition:width .3s ease', `width:${stats.pct}%`)} />
          </div>
        </div>

        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>In progress now</div>
              <Pressable label="Open the board" onClick={() => goTab('tasks')} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}>Board</Pressable>
            </div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
              {inProgress.length ? inProgress.map((t) => {
                const r = roleOf(p, t.roleId);
                const who = p.people.find((x) => x.id === t.assigneeId);
                return (
                  <div key={t.id} style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                    <div style={S('font:500 13px/1.35 Geist;color:#1A1714')}>{t.title}</div>
                    <div style={S('margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                      {r ? <span style={s('padding:2px 7px;border-radius:6px;font:500 10px/1 Geist', `background:${r.color}18`, `color:${r.color}`)}>{r.name}</span> : null}
                      {who ? <span style={S('font:450 11px/1 Geist;color:#8A8179')}>{who.short || who.n}</span> : null}
                    </div>
                  </div>
                );
              }) : (
                <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>Nothing in progress. Move a task to In progress on the board.</div>
              )}
            </div>
          </div>

          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Activity</div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column')}>
              {p.activity.length ? p.activity.slice(0, 5).map((a) => (
                <div key={a.id} style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #F1EBE4')}>
                  <div style={S('font:450 13px/1.45 Geist;color:#332D28')}>{a.t}</div>
                  <div style={S(`font:500 11px/1 ${MONO};color:#A9A097;flex:none;margin-top:2px`)}>{a.w}</div>
                </div>
              )) : <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>Task moves and new members land here.</div>}
            </div>
          </div>
        </div>

        <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Roles</div>
            <Pressable label="Manage roles" onClick={() => goTab('tasks')} className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C;cursor:pointer')}>Manage</Pressable>
          </div>
          <div className="vu-3col" style={S('margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px')}>
            {roles.length ? roles.map((r) => {
              const count = members.filter((m) => m.teamRoleId === r.id).length;
              return (
                <div key={r.id} style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <div style={S('display:flex;align-items:center;gap:8px')}>
                    <span style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${r.color}`)} />
                    <div style={S('font:600 13px/1.2 Geist')}>{r.name}</div>
                  </div>
                  <div style={S(`margin-top:9px;font:500 11px/1 ${MONO};color:#A9A097`)}>{count} member{count === 1 ? '' : 's'}</div>
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

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Needs you</div>
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
            {unassigned.length ? <NeedCard title={`${unassigned.length} task${unassigned.length === 1 ? '' : 's'} unassigned`} sub="Give each one an owner" onClick={() => goTab('tasks')} /> : null}
            {needsBriefing.length ? <NeedCard title={`${needsBriefing.length} member${needsBriefing.length === 1 ? '' : 's'} not briefed`} sub="They confirm before tasks unlock" onClick={() => goTab('people')} /> : null}
            {!unassigned.length && !needsBriefing.length ? (
              <div style={S('padding:14px;border-radius:11px;background:#fff;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#6B635C')}>Everything is assigned and everyone is briefed. Nice.</div>
            ) : null}
          </div>
        </div>

        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Mission</div>
          <div style={S('margin-top:10px;font:450 14px/1.55 Geist;color:#332D28')}>{p.mission}</div>
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
            <SideRow l="Team size" v={members.length} />
            <SideRow l="Cadence" v={p.cadence} />
            <SideRow l="Term" v={`${p.termWeeks} weeks`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- people ------------------------------------------------------------- */

const PAGE = 8;
const STATUSES = ['all', 'Active', 'Onboarding', 'Invited', 'Waitlist', 'Inactive'];

function People({ p, params, setParam }) {
  const q = params.get('pq') || '';
  const status = params.get('pstatus') || 'all';
  const role = params.get('prole') || 'all';
  const page = Math.max(1, Number(params.get('ppage')) || 1);
  const [selected, setSelected] = useState([]);
  const [draftQuery, setDraftQuery] = useState(q);

  const filtered = filterPeople(p, { q, status, role });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * PAGE, safePage * PAGE);
  const stats = peopleStats(p);
  const roles = ['all', ...Array.from(new Set(p.positions.map((x) => x.t)))];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  function addStudent() {
    openModal({
      title: 'Add a student',
      subtitle: 'They get an invite and appear on the roster straight away.',
      Body: function AddBody({ api }) {
        return <AddPersonForm api={api} project={p} />;
      },
    });
  }

  function importList() {
    openModal({
      title: 'Import from a list',
      subtitle: 'Paste one student per line as “Name, School, Grade”.',
      Body: function ImportBody({ api }) {
        return <ImportForm api={api} project={p} />;
      },
    });
  }

  function noteFor(person) {
    openModal({
      title: `Note on ${person.n}`,
      subtitle: person.notes.length ? `${person.notes.length} earlier note${person.notes.length === 1 ? '' : 's'}` : 'Notes are private to you and your co-leads.',
      Body: function NoteBody({ api }) {
        return <NoteForm api={api} project={p} person={person} />;
      },
    });
  }

  function personProfile(person) {
    openModal({
      title: person.n,
      subtitle: person.s,
      Body: function ProfileBody({ api }) {
        return <PersonProfile api={api} project={p} person={person} onNote={() => { api.close(); noteFor(person); }} />;
      },
    });
  }

  function personMenu(e, person) {
    menuFromEvent(
      e,
      [
        { key: 'active', label: 'Mark active', icon: '✓', disabled: person.st === 'Active' },
        { key: 'waitlist', label: 'Move to waitlist', icon: '⋯', disabled: person.st === 'Waitlist' },
        { key: 'inactive', label: 'Mark inactive', icon: '◌', disabled: person.st === 'Inactive' },
        { sep: true },
        { key: 'consent', label: person.consent ? 'Consent on file ✓' : 'Mark consent received', icon: '✎' },
        { key: 'trained', label: person.trained ? 'Training complete ✓' : 'Mark training complete', icon: '✎' },
        { sep: true },
        { key: 'remove', label: 'Remove from roster', icon: '✕', tone: 'danger' },
      ],
      async (key) => {
        if (key === 'active') updatePerson(p.id, person.id, { st: 'Active' });
        else if (key === 'waitlist') updatePerson(p.id, person.id, { st: 'Waitlist' });
        else if (key === 'inactive') updatePerson(p.id, person.id, { st: 'Inactive' });
        else if (key === 'consent') updatePerson(p.id, person.id, { consent: !person.consent });
        else if (key === 'trained') updatePerson(p.id, person.id, { trained: !person.trained });
        else if (key === 'remove') {
          const ok = await confirmDialog({
            title: `Remove ${person.n}?`,
            body: 'Their hours already posted to their record stay there. They lose their seat on upcoming sessions.',
            confirmLabel: 'Remove',
          });
          if (ok) {
            removePerson(p.id, person.id);
            toast({ title: `${person.n} removed`, tone: 'ok' });
          }
          return;
        }
        toast({ title: `${person.n} updated`, tone: 'ok', timeout: 2200 });
      }
    );
  }

  function bulkMenu(e) {
    menuFromEvent(
      e,
      [
        { key: 'active', label: `Mark ${selected.length} active`, icon: '✓' },
        { key: 'waitlist', label: `Move ${selected.length} to waitlist`, icon: '⋯' },
        { key: 'export', label: 'Export selection as CSV', icon: '↓' },
        { sep: true },
        { key: 'clear', label: 'Clear selection', icon: '✕' },
      ],
      (key) => {
        if (key === 'active' || key === 'waitlist') {
          selected.forEach((id) => updatePerson(p.id, id, { st: key === 'active' ? 'Active' : 'Waitlist' }));
          toast({ title: `${selected.length} updated`, tone: 'ok' });
          setSelected([]);
        } else if (key === 'export') {
          const subset = { ...p, people: p.people.filter((x) => selected.includes(x.id)) };
          download(`roster-selection.csv`, rosterCSV(subset));
          toast({ title: 'Selection exported', tone: 'ok' });
        } else setSelected([]);
      }
    );
  }

  return (
    <div style={S('margin-top:22px')}>
      <div className="vu-5col" style={S('display:grid;grid-template-columns:repeat(5,1fr);gap:12px')}>
        {stats.map((x) => (
          <div key={x.l} style={S('padding:16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>{x.l}</div>
            <div style={S('margin-top:10px;font:600 22px/1 Geist;letter-spacing:-0.03em')}>{x.v}</div>
          </div>
        ))}
      </div>

      <div style={S('margin-top:16px;border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
          <div style={S('display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap')}>
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
              style={S('flex:1;max-width:340px;min-width:180px;padding:10px 13px;border-radius:10px;border:1px solid #E8E1D9;background:#FCFAF8;font:450 13px/1.15 Geist;color:#1A1714;transition:border-color .16s ease')}
            />
            <Pressable
              label={`Filter by status, currently ${status}`}
              expanded={false}
              onClick={(e) => menuFromEvent(e, STATUSES.map((v) => ({ key: v, label: v === 'all' ? 'All statuses' : v, checked: v === status })), (v) => setParam({ pstatus: v === 'all' ? null : v, ppage: null }))}
              className={cx(H.secondary, H.press)}
              style={S('padding:9px 12px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease')}
            >
              Status: {status} ▾
            </Pressable>
            <Pressable
              label={`Filter by role, currently ${role}`}
              expanded={false}
              onClick={(e) => menuFromEvent(e, roles.map((v) => ({ key: v, label: v === 'all' ? 'All roles' : v, checked: v === role })), (v) => setParam({ prole: v === 'all' ? null : v, ppage: null }))}
              className={cx(H.secondary, H.press)}
              style={S('padding:9px 12px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;white-space:nowrap;transition:background .16s ease, border-color .16s ease')}
            >
              Role: {role} ▾
            </Pressable>
          </div>
          <div style={S('display:flex;gap:9px;flex:none')}>
            {selected.length ? (
              <Pressable
                label={`Actions for ${selected.length} selected`}
                onClick={bulkMenu}
                className={cx(H.secondary, H.press)}
                style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
              >
                {selected.length} selected ▾
              </Pressable>
            ) : (
              <Pressable
                label="Import from a list"
                onClick={importList}
                className={cx(H.secondary, H.press)}
                style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
              >
                Import from a list
              </Pressable>
            )}
            <Pressable
              label="Add student"
              onClick={addStudent}
              className={cx(H.primary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
            >
              <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
              Add student
            </Pressable>
          </div>
        </div>

        <div className="vu-table-wrap">
          <div>
            <div style={S(`display:grid;grid-template-columns:26px 2fr 1.2fr 1fr .7fr .8fr 1.2fr 80px;gap:12px;padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>
              <div>
                <input
                  type="checkbox"
                  aria-label="Select all people on this page"
                  checked={allOnPage}
                  onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))}
                  style={S('width:13px;height:13px;accent-color:#C2603C;cursor:pointer')}
                />
              </div>
              <div>Student</div><div>Role</div><div>Status</div><div>Hours</div><div>Last seen</div><div>Tags</div><div />
            </div>

            {rows.length ? (
              rows.map((x) => {
                const t = tone(PERSON_TONE, x.st);
                const on = selected.includes(x.id);
                return (
                  <div
                    key={x.id}
                    className={H.row}
                    style={s(
                      'display:grid;grid-template-columns:26px 2fr 1.2fr 1fr .7fr .8fr 1.2fr 80px;gap:12px;padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease',
                      on ? 'background:#FAF6F3' : ''
                    )}
                  >
                    <div>
                      <input
                        type="checkbox"
                        aria-label={`Select ${x.n}`}
                        checked={on}
                        onChange={() => setSelected((sel) => (sel.includes(x.id) ? sel.filter((i) => i !== x.id) : [...sel, x.id]))}
                        style={S('width:15px;height:15px;border-radius:4px;accent-color:#C2603C;cursor:pointer')}
                      />
                    </div>
                    <Pressable label={`Open ${x.n}'s profile`} onClick={() => personProfile(x)} style={S('display:flex;align-items:center;gap:11px;cursor:pointer;min-width:0')}>
                      <div style={S('width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none')}>
                        <ImageSlot src={''} shape="circle" placeholder="face" />
                      </div>
                      <div style={S('min-width:0')}>
                        <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{x.n}</div>
                        <div className="vu-trunc" style={S('margin-top:3px;font:450 11px/1.2 Geist;color:#8A8179')}>{x.s}</div>
                      </div>
                    </Pressable>
                    <div className="vu-trunc" style={S('font:450 13px/1 Geist;color:#332D28')}>{x.role}</div>
                    <div>
                      <span style={S(`padding:5px 9px;border-radius:7px;background:${t.stBg};font:500 11px/1 ${MONO};color:${t.stColor}`)}>{x.st}</span>
                    </div>
                    <div style={S(`font:500 13px/1 ${MONO};color:#332D28`)}>{x.hrs.toFixed(1)}</div>
                    <div style={S('font:450 12px/1 Geist;color:#8A8179')}>{x.last}</div>
                    <div style={S('display:flex;gap:5px;flex-wrap:wrap')}>
                      {x.tags.map((t2) => (
                        <span key={t2} style={S('padding:4px 7px;border-radius:6px;background:#F6F2EE;font:500 10px/1 Geist;color:#57504A')}>
                          {t2}
                        </span>
                      ))}
                    </div>
                    <div style={S('display:flex;gap:6px;justify-content:flex-end')}>
                      <Pressable
                        label={`Add a note on ${x.n}`}
                        onClick={() => noteFor(x)}
                        className={cx(H.secondary, H.press)}
                        style={S('padding:6px 8px;border-radius:7px;border:1px solid #E8E1D9;background:#fff;font:500 11px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                      >
                        Note
                      </Pressable>
                      <Pressable
                        label={`More actions for ${x.n}`}
                        expanded={false}
                        onClick={(e) => personMenu(e, x)}
                        className={cx(H.secondary, H.press)}
                        style={S('padding:6px 8px;border-radius:7px;border:1px solid #E8E1D9;background:#fff;font:500 11px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                      >
                        ···
                      </Pressable>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={S('padding:8px 20px')}>
                <EmptyState
                  compact
                  title={q || status !== 'all' || role !== 'all' ? 'Nobody matches that' : 'No one on the roster yet'}
                  body={q || status !== 'all' || role !== 'all' ? 'Clear the search or widen the status and role filters.' : 'Accept an application or add a student directly.'}
                  cta={q || status !== 'all' || role !== 'all' ? 'Clear filters' : 'Add student'}
                  onCta={() => {
                    if (q || status !== 'all' || role !== 'all') {
                      setDraftQuery('');
                      setParam({ pq: null, pstatus: null, prole: null, ppage: null });
                    } else addStudent();
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="vu-stack vu-stack-gap" style={S('padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;font:450 12px/1 Geist;color:#8A8179')}>
          <div>
            {rows.length ? `${(safePage - 1) * PAGE + 1}–${(safePage - 1) * PAGE + rows.length}` : '0'} of {filtered.length} people
            {filtered.length !== p.people.length ? ` (filtered from ${p.people.length})` : ''}
          </div>
          <div style={S('display:flex;gap:8px')}>
            <Pressable
              label="Previous page"
              disabled={safePage <= 1}
              onClick={() => setParam({ ppage: safePage - 1 })}
              className={cx(safePage > 1 ? H.secondary : '', H.press)}
              style={s('padding:6px 10px;border-radius:7px;border:1px solid #E8E1D9;transition:background .16s ease', `cursor:${safePage > 1 ? 'pointer' : 'default'}`, safePage <= 1 ? 'opacity:.45' : '')}
            >
              Previous
            </Pressable>
            <Pressable
              label="Next page"
              disabled={safePage >= pages}
              onClick={() => setParam({ ppage: safePage + 1 })}
              className={cx(safePage < pages ? H.secondary : '', H.press)}
              style={s('padding:6px 10px;border-radius:7px;border:1px solid #E8E1D9;transition:background .16s ease', `cursor:${safePage < pages ? 'pointer' : 'default'}`, safePage >= pages ? 'opacity:.45' : '')}
            >
              Next
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}

/* A member's reliability, derived from status, hours and readiness. This is the
   quality-control read a lead uses to staff sessions and a volunteer earns. */
function reliabilityOf(person) {
  const base = { Active: 84, Onboarding: 60, Invited: 50, Waitlist: 50, Inactive: 34, Removed: 30 }[person.st] ?? 55;
  const pct = Math.max(20, Math.min(99, Math.round(base + person.hrs * 1.2 + (person.trained ? 6 : 0) + (person.consent ? 4 : 0))));
  const label = pct >= 90 ? 'Exceptional' : pct >= 75 ? 'Strong' : pct >= 60 ? 'Solid' : pct >= 45 ? 'Developing' : 'At risk';
  const t = pct >= 75 ? { bg: '#EAF3EC', color: '#3F6B4E' } : pct >= 60 ? { bg: '#F6F2EE', color: '#57504A' } : { bg: '#F5E7E0', color: '#A8482A' };
  return { pct, label, t };
}

function PersonProfile({ api, project, person, onNote }) {
  const r = reliabilityOf(person);
  const st = tone(PERSON_TONE, person.st);
  const Stat = ({ l, v }) => (
    <div style={S('padding:12px 14px;border-radius:11px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S(`font:500 9px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>{l}</div>
      <div style={S('margin-top:6px;font:600 16px/1 Geist;letter-spacing:-0.02em;color:#1A1714')}>{v}</div>
    </div>
  );
  return (
    <div style={S('display:flex;flex-direction:column;gap:16px')}>
      <div style={S('display:flex;align-items:center;gap:14px')}>
        <div style={S('width:56px;height:56px;border-radius:50%;overflow:hidden;flex:none')}>
          <ImageSlot src={''} shape="circle" placeholder="face" />
        </div>
        <div style={S('min-width:0')}>
          <div style={S('font:600 18px/1.2 Geist;letter-spacing:-0.02em')}>{person.n}</div>
          <div style={S('margin-top:4px;font:450 13px/1.3 Geist;color:#8A8179')}>{person.school} · Grade {person.grade} · {person.role}</div>
        </div>
        <div style={S('margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px')}>
          <span style={S(`padding:5px 9px;border-radius:7px;background:${st.stBg};font:500 11px/1 ${MONO};color:${st.stColor}`)}>{person.st}</span>
          <span style={S(`padding:5px 9px;border-radius:7px;background:${r.t.bg};font:500 11px/1 ${MONO};color:${r.t.color}`)}>{r.label} · {r.pct}%</span>
        </div>
      </div>

      <div style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:10px')}>
        <Stat l="Hours logged" v={person.hrs.toFixed(1)} />
        <Stat l="Reliability" v={`${r.pct}%`} />
        <Stat l="Last seen" v={person.last} />
        <Stat l="Position" v={person.role} />
      </div>

      <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
        <span style={S(`padding:6px 10px;border-radius:8px;background:${person.consent ? '#EAF3EC' : '#FDF3E7'};font:500 12px/1 Geist;color:${person.consent ? '#3F6B4E' : '#8A5A20'}`)}>{person.consent ? '✓ Guardian consent on file' : '⚠ Consent pending'}</span>
        <span style={S(`padding:6px 10px;border-radius:8px;background:${person.trained ? '#EAF3EC' : '#F6F2EE'};font:500 12px/1 Geist;color:${person.trained ? '#3F6B4E' : '#57504A'}`)}>{person.trained ? '✓ Training complete' : 'Training pending'}</span>
      </div>

      {person.tags.length ? (
        <div>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Tags</div>
          <div style={S('margin-top:8px;display:flex;gap:6px;flex-wrap:wrap')}>
            {person.tags.map((tg) => (
              <span key={tg} style={S('padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 11px/1 Geist;color:#57504A')}>{tg}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Notes</div>
        {person.notes.length ? (
          <div style={S('margin-top:8px;display:flex;flex-direction:column;gap:8px')}>
            {person.notes.map((nn, i) => (
              <div key={i} style={S('padding:10px 12px;border-radius:10px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13px/1.5 Geist;color:#332D28')}>
                {typeof nn === 'string' ? nn : nn.text}
              </div>
            ))}
          </div>
        ) : (
          <div style={S('margin-top:8px;font:450 13px/1.4 Geist;color:#A9A097')}>No notes yet.</div>
        )}
      </div>

      <div style={S('display:flex;gap:10px;margin-top:4px')}>
        <Pressable label="Add a note" onClick={onNote} className={cx(H.primary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Add a note
        </Pressable>
        <Pressable label="Close" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#57504A;cursor:pointer')}>
          Close
        </Pressable>
      </div>
    </div>
  );
}

function AddPersonForm({ api, project }) {
  const [f, setF] = useState({ n: '', school: 'Riverside High', grade: '11', positionId: project.positions[0] ? project.positions[0].id : '' });
  const [err, setErr] = useState({});
  return (
    <div>
      <Field label="Full name" value={f.n} onChange={(v) => setF((x) => ({ ...x, n: v }))} required error={err.n} maxLength={60} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="School" value={f.school} onChange={(v) => setF((x) => ({ ...x, school: v }))} required error={err.school} maxLength={60} />
        <Select label="Grade" value={f.grade} options={['9', '10', '11', '12']} onChange={(v) => setF((x) => ({ ...x, grade: v }))} />
      </div>
      <div style={S('margin-top:14px')}>
        <Select
          label="Position"
          value={f.positionId}
          options={project.positions.map((p) => ({ v: p.id, l: `${p.t} (${positionLabel(p)})` }))}
          onChange={(v) => setF((x) => ({ ...x, positionId: v }))}
        />
      </div>
      {Number(f.grade) < 10 ? (
        <div style={S('margin-top:14px;padding:12px 14px;border-radius:11px;background:#FDF3E7;border:1px solid #F3E3CD;font:450 12px/1.5 Geist;color:#8A5A20')}>
          Under 16, they will start as Onboarding until guardian consent is on file.
        </div>
      ) : null}
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Add to the roster"
          onClick={() => {
            const e = {};
            if (!f.n.trim() || !f.n.trim().includes(' ')) e.n = 'Enter their first and last name.';
            if (!f.school.trim()) e.school = 'Which school?';
            setErr(e);
            if (Object.keys(e).length) return;
            const pos = project.positions.find((x) => x.id === f.positionId);
            addPerson(project.id, { n: f.n.trim(), school: f.school.trim(), grade: f.grade, role: pos ? pos.t : 'Tutor', positionId: f.positionId, consent: Number(f.grade) >= 10 });
            api.close();
            toast({ title: `${f.n.trim()} invited`, message: 'They show on the roster as Invited until they accept.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
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
  const valid = parsed.filter((p) => p.length >= 3 && /^\d+$/.test(p[2]));
  return (
    <div>
      <label htmlFor="imp" style={S('font:500 12px/1 Geist;color:#57504A')}>Paste your list</label>
      <textarea
        id="imp"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Maya Rodriguez, Riverside High, 11\nRowan Okafor, Riverside High, 12'}
        className={H.input}
        style={S('margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:140px;font:450 13px/1.6 Geist;color:#332D28')}
      />
      <div className="vu-hint">
        {parsed.length
          ? `${valid.length} of ${parsed.length} rows look right. Rows need a name, a school and a grade number.`
          : 'One student per line: Name, School, Grade.'}
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label={`Import ${valid.length} students`}
          disabled={!valid.length}
          onClick={() => {
            const pos = project.positions[0];
            valid.forEach(([n, school, grade]) => addPerson(project.id, { n, school, grade, role: pos ? pos.t : 'Tutor', positionId: pos ? pos.id : null, consent: Number(grade) >= 10 }));
            api.close();
            toast({ title: `${valid.length} students imported`, message: 'They are on the roster as Invited.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Import {valid.length || ''}
        </Pressable>
      </div>
    </div>
  );
}

function NoteForm({ api, project, person }) {
  const [text, setText] = useState('');
  return (
    <div>
      {person.notes.length ? (
        <div style={S('margin-bottom:16px;display:flex;flex-direction:column;gap:8px;max-height:180px;overflow:auto')}>
          {person.notes.map((n) => (
            <div key={n.id} style={S('padding:12px 14px;border-radius:11px;background:#FCFAF8;border:1px solid #F1EBE4')}>
              <div className="vu-break" style={S('font:450 13px/1.5 Geist;color:#332D28')}>{n.t}</div>
              <div style={S(`margin-top:6px;font:500 10px/1 ${MONO};color:#A9A097`)}>{n.w}</div>
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={400}
        placeholder={`Something worth remembering about ${person.short} next session.`}
        className={H.input}
        style={S('display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:100px;font:450 14px/1.55 Geist;color:#332D28')}
      />
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Save note"
          disabled={!text.trim()}
          onClick={() => {
            addNote(project.id, person.id, text.trim());
            api.close();
            toast({ title: 'Note saved', message: `Only you and your co-leads can see it.`, tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Save note
        </Pressable>
      </div>
    </div>
  );
}

/* ---- positions ---------------------------------------------------------- */

function Positions({ p }) {
  const groups = [
    { label: 'Tutor', items: p.positions.filter((x) => /tutor/i.test(x.t)) },
    { label: 'Support roles', items: p.positions.filter((x) => /lead|snack|supply|check/i.test(x.t)) },
    { label: 'Media', items: p.positions.filter((x) => /photo|media|video/i.test(x.t)) },
  ].filter((g) => g.items.length);

  function editPosition(pos) {
    openModal({
      title: pos ? `Edit ${pos.t}` : 'Add a position',
      subtitle: 'A position becomes an application form and a slot on every session.',
      Body: function PosBody({ api }) {
        return <PositionForm api={api} project={p} pos={pos} />;
      },
    });
  }

  return (
    <div className="vu-split" style={S('margin-top:22px;display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Positions</div>
          <Pressable
            label="Add position"
            onClick={() => editPosition(null)}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
          >
            <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
            Add position
          </Pressable>
        </div>
        {p.positions.length ? (
          p.positions.map((x) => (
            <div key={x.id} style={S('padding:18px 20px;border-bottom:1px solid #F1EBE4')}>
              <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
                <div>
                  <div style={S('display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>
                    <div style={S('font:600 16px/1.2 Geist;letter-spacing:-0.02em')}>{x.t}</div>
                    <div style={S(`padding:4px 8px;border-radius:6px;background:#F6F2EE;font:500 10px/1 ${MONO};color:#57504A`)}>{positionLabel(x)}</div>
                    {x.open ? null : <div style={S(`padding:4px 8px;border-radius:6px;background:#F6F2EE;font:500 10px/1 ${MONO};color:#A19891`)}>CLOSED</div>}
                  </div>
                  <div style={S('margin-top:7px;font:450 13px/1.4 Geist;color:#8A8179')}>{x.note}</div>
                </div>
                <div style={S('display:flex;gap:8px;flex:none')}>
                  <Pressable
                    label={`Edit ${x.t}`}
                    onClick={() => editPosition(x)}
                    className={cx(H.secondary, H.press)}
                    style={S('padding:8px 11px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                  >
                    Edit
                  </Pressable>
                  <Pressable
                    label={`Duplicate ${x.t}`}
                    onClick={() => {
                      const copy = duplicatePosition(p.id, x.id);
                      if (copy) toast({ title: `${copy.t} created`, message: 'Edit the slots and requirements when you are ready.', tone: 'ok' });
                    }}
                    className={cx(H.secondary, H.press)}
                    style={S('padding:8px 11px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                  >
                    Duplicate
                  </Pressable>
                </div>
              </div>
              <div className="vu-4col" style={S('margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px')}>
                {[
                  { l: 'Min age', v: x.age },
                  { l: 'Training', v: x.train },
                  { l: 'Commitment', v: x.commit },
                  { l: 'Applications', v: positionAppsLabel(p, x) },
                ].map((k) => (
                  <div key={k.l}>
                    <div style={S(`font:500 10px/1 ${MONO};color:#A9A097;letter-spacing:.08em;text-transform:uppercase`)}>{k.l}</div>
                    <div style={S('margin-top:7px;font:450 13px/1 Geist')}>{k.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={S('padding:8px 20px 20px')}>
            <EmptyState compact title="No positions defined" body="A position is what students apply for and what fills a seat on each session." cta="Add position" onCta={() => editPosition(null)} />
          </div>
        )}
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Coverage</div>
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
            {groups.map((g) => {
              const filled = g.items.reduce((a, x) => a + x.filledCount, 0);
              const slots = g.items.reduce((a, x) => a + x.slots, 0);
              const pct = slots ? Math.round((filled / slots) * 100) : 0;
              const color = pct >= 100 ? '#D2775B' : pct >= 50 ? '#C2603C' : '#E0A188';
              return (
                <div key={g.label}>
                  <div style={S('display:flex;justify-content:space-between;gap:10px;font:450 13px/1 Geist;color:#332D28')}>
                    <span>{g.label}</span>
                    <span style={S('color:#8A8179')}>
                      {filled} / {slots}
                    </span>
                  </div>
                  <div style={S('margin-top:7px;height:6px;border-radius:4px;background:#F1EBE4')}>
                    <div style={s(`width:${Math.max(pct, filled ? pct : 4)}%`, 'height:100%;border-radius:4px', `background:${color}`, 'transition:width .36s cubic-bezier(.16,1,.3,1)')} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Requirements library</div>
          <div style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:7px')}>
            {['Guardian consent', 'Media release', 'Food handling', 'Reading training', 'Transport form'].map((r) => {
              const used = p.positions.filter((x) => (x.requirements || []).includes(r));
              return (
                <Pressable
                  key={r}
                  label={`Where ${r} is required`}
                  onClick={() =>
                    toast({
                      title: r,
                      message: used.length ? `Required for ${used.map((u) => u.t).join(', ')}.` : 'Not required by any position yet. Add it when you edit a position.',
                      tone: used.length ? 'brand' : 'warn',
                    })
                  }
                  className={cx(H.secondary, H.press)}
                  style={S('padding:6px 10px;border-radius:8px;border:1px solid #E8E1D9;font:500 12px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
                >
                  {r}
                </Pressable>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionForm({ api, project, pos }) {
  const [f, setF] = useState({
    t: pos ? pos.t : '',
    slots: pos ? String(pos.slots) : '2',
    age: pos ? pos.age : '13+',
    train: pos ? pos.train : 'None',
    commit: pos ? pos.commit : '1 hr weekly',
    note: pos ? pos.note : '',
    requirements: pos ? (pos.requirements || []).slice() : [],
    open: pos ? pos.open : true,
  });
  const [err, setErr] = useState({});
  const REQ = ['Guardian consent', 'Media release', 'Food handling', 'Reading training', 'Transport form'];

  return (
    <div>
      <Field label="Position name" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} required error={err.t} maxLength={40} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Slots" value={f.slots} onChange={(v) => setF((x) => ({ ...x, slots: v.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" error={err.slots} />
        <Select label="Minimum age" value={f.age} options={['13+', '14+', '15+', '16+', '18+']} onChange={(v) => setF((x) => ({ ...x, age: v }))} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Select label="Training" value={f.train} options={['None', 'Required · 15 min', 'Required · 30 min', 'Required · 45 min', 'Food handling']} onChange={(v) => setF((x) => ({ ...x, train: v }))} />
        <Select label="Commitment" value={f.commit} options={['1 hr monthly', '1 hr weekly', '2 hrs weekly', '2.5 hrs weekly', '4 hrs weekly']} onChange={(v) => setF((x) => ({ ...x, commit: v }))} />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="What they actually do" value={f.note} onChange={(v) => setF((x) => ({ ...x, note: v }))} maxLength={90} placeholder="One line a student will read before applying." />
      </div>
      <div style={S('margin-top:16px')}>
        <div style={S('font:500 12px/1 Geist;color:#57504A')}>Requirements</div>
        <div style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
          {REQ.map((r) => (
            <Chip
              key={r}
              label={r}
              role="checkbox"
              py={8}
              px={12}
              fs={12}
              on={f.requirements.includes(r)}
              onClick={() => setF((x) => ({ ...x, requirements: x.requirements.includes(r) ? x.requirements.filter((y) => y !== r) : [...x.requirements, r] }))}
            />
          ))}
        </div>
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap')}>
        {pos ? (
          <Pressable
            label={`Delete ${pos.t}`}
            onClick={async () => {
              api.close();
              const ok = await confirmDialog({
                title: `Delete ${pos.t}?`,
                body: 'Anyone already in this position keeps their hours but loses the role. Applications for it are declined.',
                confirmLabel: 'Delete position',
              });
              if (ok) {
                deletePosition(project.id, pos.id);
                toast({ title: `${pos.t} deleted`, tone: 'ok' });
              }
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            Delete
          </Pressable>
        ) : (
          <span />
        )}
        <div style={S('display:flex;gap:10px')}>
          <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
            Cancel
          </Pressable>
          <Pressable
            label={pos ? 'Save position' : 'Create position'}
            onClick={() => {
              const e = {};
              if (!f.t.trim()) e.t = 'Give the position a name.';
              const n = Number(f.slots);
              if (!n || n < 1 || n > 200) e.slots = 'Between 1 and 200.';
              setErr(e);
              if (Object.keys(e).length) return;
              upsertPosition(project.id, { ...(pos ? { id: pos.id } : {}), ...f, t: f.t.trim(), slots: n });
              api.close();
              toast({ title: pos ? `${f.t.trim()} updated` : `${f.t.trim()} added`, tone: 'ok' });
            }}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
          >
            {pos ? 'Save' : 'Create'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}

/* ---- shifts ------------------------------------------------------------- */

function Shifts({ p }) {
  function editSession(ses) {
    openModal({
      title: ses ? `Edit ${ses.d}` : 'Add a session',
      Body: function SesBody({ api }) {
        return <SessionForm api={api} project={p} ses={ses} />;
      },
    });
  }

  async function regenerate() {
    const ok = await confirmDialog({
      title: 'Regenerate the check-in code?',
      body: 'The current code stops working immediately. Anyone who already has it will need the new one.',
      confirmLabel: 'Regenerate',
    });
    if (!ok) return;
    const code = regenerateCode(p.id);
    toast({ title: `New check-in code: ${code}`, message: 'Send it to the crew before the next session.', tone: 'ok' });
  }

  function reminder(r) {
    const options = {
      'Crew text': ['1 day before', '2 days before', '3 days before', 'Off'],
      'Guardian email': ['3 days before', '1 week before', '2 weeks before', 'Off'],
      'Sponsor digest': ['Mondays', 'Fridays', 'Monthly', 'Off'],
    }[r.l] || ['Off'];
    openModal({
      title: r.l,
      subtitle: 'Reminders go out automatically before each session.',
      Body: function RemBody({ api }) {
        return (
          <div style={S('display:flex;flex-direction:column;gap:10px')}>
            {options.map((o) => (
              <Pressable
                key={o}
                role="radio"
                aria-checked={r.v === o}
                label={o}
                onClick={() => {
                  setReminder(p.id, r.l, o);
                  api.close();
                  toast({ title: `${r.l}: ${o}`, tone: 'ok' });
                }}
                className={cx(H.chip, H.press)}
                style={s('padding:14px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between', `border:1px solid ${r.v === o ? '#C2603C' : '#E8E1D9'}`, `background:${r.v === o ? '#FAF6F3' : '#FCFAF8'}`)}
              >
                <span style={S('font:500 14px/1 Geist')}>{o}</span>
                {r.v === o ? <span style={S('color:#C2603C')}>✓</span> : null}
              </Pressable>
            ))}
          </div>
        );
      },
    });
  }

  return (
    <div className="vu-split" style={S('margin-top:22px;display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start')}>
      <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Sessions</div>
          <div style={S('display:flex;gap:9px')}>
            <Pressable
              label="Repeat weekly"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Add four more weekly sessions?',
                  body: 'They copy the last session’s time, location and capacity, and start as drafts you can edit.',
                  confirmLabel: 'Add sessions',
                  tone: 'brand',
                });
                if (!ok) return;
                const n = repeatWeekly(p.id, 4);
                toast({ title: `${n} sessions added`, message: 'They are drafts until you publish them.', tone: 'ok' });
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
            >
              Repeat weekly
            </Pressable>
            <Pressable
              label="Add session"
              onClick={() => editSession(null)}
              className={cx(H.primary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
            >
              <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
              Add session
            </Pressable>
          </div>
        </div>
        <div className="vu-table-wrap">
          <div>
            <div style={S(`display:grid;grid-template-columns:1.1fr 1.2fr 1.7fr .8fr .9fr 96px;gap:12px;padding:12px 20px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>
              <div>Date</div><div>Time</div><div>Location</div><div>Staffed</div><div>Status</div><div />
            </div>
            {p.sessions.length ? (
              p.sessions.map((x) => {
                const label = sessionStatus(x);
                const t = sessionTone(label);
                return (
                  <div key={x.id} className={H.row} style={S('display:grid;grid-template-columns:1.1fr 1.2fr 1.7fr .8fr .9fr 96px;gap:12px;padding:14px 20px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease')}>
                    <div style={S('font:500 13px/1 Geist')}>{x.d}</div>
                    <div style={S('font:450 13px/1 Geist;color:#57504A')}>{x.t}</div>
                    <div className="vu-trunc" style={S('font:450 13px/1 Geist;color:#57504A')}>{x.loc}</div>
                    <div style={S(`font:500 13px/1 ${MONO}`)}>
                      {x.filledCount} / {x.cap}
                    </div>
                    <div>
                      <span style={S(`padding:5px 9px;border-radius:7px;background:${t.stBg || t.bg};font:500 11px/1 ${MONO};color:${t.stColor || t.color}`)}>{label}</span>
                    </div>
                    <div style={S('display:flex;justify-content:flex-end;gap:6px')}>
                      <Pressable
                        label={`Edit session ${x.d}`}
                        onClick={() => editSession(x)}
                        className={cx(H.secondary, H.press)}
                        style={S('padding:6px 9px;border-radius:7px;border:1px solid #E8E1D9;font:500 11px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease')}
                      >
                        Edit
                      </Pressable>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={S('padding:8px 20px 20px')}>
                <EmptyState compact title="No sessions scheduled" body="Add one session and repeat it weekly to fill out the term." cta="Add session" onCta={() => editSession(null)} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:14px')}>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Check-in</div>
          <div style={S('margin-top:12px;font:600 30px/1 Geist;letter-spacing:-0.04em;font-variant-numeric:tabular-nums')}>{p.checkinCode}</div>
          <div style={S('margin-top:9px;font:450 13px/1.5 Geist;color:#6B635C')}>
            Crew enters this code on arrival, or check-in happens automatically inside the room geofence.
          </div>
          <Pressable
            label="Regenerate the check-in code"
            onClick={regenerate}
            className={cx(H.secondary, H.press)}
            style={S('margin-top:14px;display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
          >
            Regenerate code
          </Pressable>
        </div>
        <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Reminders</div>
          <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px;font:450 13px/1.4 Geist;color:#57504A')}>
            {p.reminders.map((r) => (
              <Pressable
                key={r.l}
                label={`Change ${r.l} reminder`}
                onClick={() => reminder(r)}
                className={cx(H.toInk, H.press)}
                style={S('display:flex;justify-content:space-between;gap:10px;cursor:pointer;transition:color .16s ease')}
              >
                <span>{r.l}</span>
                <span style={S('color:#1A1714;font-weight:500')}>{r.v}</span>
              </Pressable>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionForm({ api, project, ses }) {
  const [f, setF] = useState({
    d: ses ? ses.d : '',
    t: ses ? ses.t : '10:00 AM - 12:00 PM',
    loc: ses ? ses.loc : project.siteShort,
    cap: ses ? String(ses.cap) : '9',
    st: ses ? ses.st : 'Draft',
  });
  const [err, setErr] = useState({});
  return (
    <div>
      <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Date" value={f.d} onChange={(v) => setF((x) => ({ ...x, d: v }))} placeholder="Sat, Sep 13" required error={err.d} />
        <Field label="Time" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} placeholder="10:00 AM - 12:00 PM" required error={err.t} />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Location" value={f.loc} onChange={(v) => setF((x) => ({ ...x, loc: v }))} maxLength={80} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Seats" value={f.cap} onChange={(v) => setF((x) => ({ ...x, cap: v.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" error={err.cap} />
        <Select label="Status" value={f.st} options={['Draft', 'Open', 'Staffed', 'Cancelled']} onChange={(v) => setF((x) => ({ ...x, st: v }))} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap')}>
        {ses ? (
          <Pressable
            label={`Cancel session ${ses.d}`}
            onClick={async () => {
              api.close();
              const ok = await confirmDialog({
                title: `Cancel ${ses.d}?`,
                body: 'Everyone booked is notified. Hours already posted are unaffected.',
                confirmLabel: 'Cancel session',
              });
              if (ok) {
                deleteSession(project.id, ses.id);
                toast({ title: 'Session cancelled', message: 'The crew has been notified.', tone: 'ok' });
              }
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            Cancel session
          </Pressable>
        ) : (
          <span />
        )}
        <div style={S('display:flex;gap:10px')}>
          <Pressable label="Close" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
            Close
          </Pressable>
          <Pressable
            label={ses ? 'Save session' : 'Add session'}
            onClick={() => {
              const e = {};
              if (!/[A-Za-z]{3}\s+\d{1,2}/.test(f.d)) e.d = 'Use a date like “Sat, Sep 13”.';
              if (!f.t.trim()) e.t = 'Add a time.';
              const cap = Number(f.cap);
              if (!cap || cap < 1 || cap > 500) e.cap = 'Between 1 and 500 seats.';
              setErr(e);
              if (Object.keys(e).length) return;
              upsertSession(project.id, { ...(ses ? { id: ses.id } : {}), ...f, cap });
              api.close();
              toast({ title: ses ? 'Session updated' : 'Session added', tone: 'ok' });
            }}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
          >
            {ses ? 'Save' : 'Add session'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
