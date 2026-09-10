'use client';

/* ==========================================================================
   Home.jsx, design screen: `isHome`
   ========================================================================== */

import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable } from '../ui.jsx';
import VolunteerApplications from '../VolunteerApplications.jsx';
import MemberProjects from '../MemberProjects.jsx';
import WebNonprofits from '../WebNonprofits.jsx';
import HomeCharts from '../HomeCharts.jsx';
import { openLogHours } from '../LogHoursForm.jsx';
import { useSnapshot, update } from '../../lib/store.js';
import { activeProject, taskProgress, getOpportunity, nextBadge, effectiveStreak } from '../../lib/db.js';
import { suggestedIds } from '../../lib/seed.js';
import { todayLabel, word, lowerWord, plural, checkinTime, startTime } from '../../lib/format.js';

const MONO = "'Geist Mono',monospace";

const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;

function buildTiles(state) {
  const st = state.stats;
  const proj = activeProject();
  const lead = proj ? proj.leadHours : { planning: 0, sessions: 0, recruiting: 0 };
  const leadTotal = round1(lead.planning + lead.sessions + lead.recruiting);
  const liveProjects = state.projects.filter((p) => !p.archived).length;
  const streak = effectiveStreak();
  const bestStreak = st.bestStreak || 0;

  // Every figure below is derived from what the volunteer has actually logged or
  // run, no stored placeholders that never update. Empty simply reads as zero.
  const log = state.hoursLog || [];
  const totalLogged = round1(log.reduce((a, h) => a + Number(h.hrs || 0), 0));
  const verifiedLogged = round1(log.filter((h) => h.verified).reduce((a, h) => a + Number(h.hrs || 0), 0));
  const pending = round1(log.filter((h) => !h.verified).reduce((a, h) => a + Number(h.hrs || 0), 0));
  const avgShift = log.length ? round1(totalLogged / log.length) : 0;
  const recruited = state.projects
    .filter((p) => !p.archived)
    .reduce((a, p) => a + (p.positions || []).reduce((b, pos) => b + (pos.filledCount || 0), 0), 0);

  const tiles = [
    {
      k: 'hours',
      label: 'Verified hours',
      big: String(st.verifiedHours),
      unit: 'hrs',
      sub: `${st.events} ${plural(st.events, 'event')} · ${st.orgs} ${plural(st.orgs, 'organization')}`,
      sign: pending ? `${pending} pending` : null,
      href: '/profile',
      rows: [
        { l: 'Logged so far', v: `${totalLogged} hrs` },
        { l: 'Verified', v: `${verifiedLogged} hrs` },
        { l: 'Awaiting confirmation', v: `${pending} hrs` },
        { l: 'Average shift', v: `${avgShift} hrs` },
      ],
    },
    {
      k: 'lead',
      label: 'Leadership hours',
      big: String(leadTotal),
      unit: 'hrs',
      sub: `${liveProjects} ${plural(liveProjects, 'project')}${recruited ? ` · ${recruited} recruited` : ''}`,
      sign: leadTotal ? `${leadTotal} hrs total` : null,
      href: '/lead',
      rows: [
        { l: 'Planning', v: `${lead.planning.toFixed(1)} hrs` },
        { l: 'Running sessions', v: `${lead.sessions.toFixed(1)} hrs` },
        { l: 'Recruiting', v: `${lead.recruiting.toFixed(1)} hrs` },
        { l: 'Crew recruited', v: `${recruited} ${plural(recruited, 'member')}` },
      ],
    },
    {
      k: 'streak',
      label: 'Weekly streak',
      big: String(streak),
      unit: plural(streak, 'week'),
      sub: streak > 0 ? 'Keep it alive, log a shift each week' : 'Log volunteering to start a streak',
      sign: streak > 0 ? '🔥 active' : null,
      href: '/profile',
      rows: [
        { l: 'Current streak', v: `${streak} ${plural(streak, 'week')}` },
        { l: 'Best streak', v: `${bestStreak} ${plural(bestStreak, 'week')}` },
        { l: 'Shifts booked', v: `${state.bookings.length} upcoming` },
        { l: 'Causes touched', v: String(st.causes) },
      ],
    },
  ];
  // Leadership is only meaningful once you actually lead a project, hide the
  // organizer tile from pure volunteers so their snapshot stays about them.
  return tiles.filter((t) => t.k !== 'lead' || liveProjects > 0);
}

export default function Home() {
  const router = useRouter();
  const { state } = useSnapshot();
  const proj = activeProject();
  const tiles = buildTiles(state);
  const openCard = state.ui.openCard;
  const openTile = tiles.find((t) => t.k === openCard) || null;
  const suggested = suggestedIds.map(getOpportunity).filter(Boolean);
  const peers = state.peerProjects.filter((p) => !p.mine).slice(0, 3);
  const bookingCount = state.bookings.length;
  const tutorPos = proj && proj.positions.find((p) => p.t === 'Tutor');
  const tutorsShort = tutorPos ? Math.max(0, tutorPos.slots - tutorPos.filledCount) : 0;
  const badge = nextBadge();
  const progress = proj ? taskProgress(proj) : { done: 0, total: 0, pct: 0 };
  const remaining = progress.total - progress.done;
  // The real signed-in name: their first name, else the first word of their full
  // name. Never a placeholder, and never a dangling "Welcome back," with no name.
  const greetName = ((state.account.firstName || '').trim() || (state.account.name || '').trim().split(/\s+/)[0] || '').trim();

  const toggleTile = (k) =>
    update((st) => {
      st.ui = { ...st.ui, openCard: st.ui.openCard === k ? null : k };
    });

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>{todayLabel()}</div>
          <h1 style={S('margin:12px 0 0;font:600 34px/1.06 Geist;letter-spacing:-0.04em')}>Welcome back{greetName ? `, ${greetName}` : ''}</h1>
          <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>
            {bookingCount > 0
              ? `${word(bookingCount)} ${plural(bookingCount, 'shift')} booked this week.`
              : 'No shifts booked this week.'}
            {proj && tutorsShort > 0
              ? ` ${proj.name} needs ${lowerWord(tutorsShort)} more ${plural(tutorsShort, 'tutor')}.`
              : ''}
          </p>
        </div>
        <div style={S('display:flex;gap:10px')}>
          <Pressable
            label="Student projects"
            onClick={() => router.push('/discover?tab=projects')}
            className={cx(H.secondaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease')}
          >
            Student projects
          </Pressable>
          <Pressable
            label="Find openings"
            onClick={() => router.push('/discover')}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:background .16s ease, transform .16s ease')}
          >
            <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
            Find openings
          </Pressable>
        </div>
      </div>

      <div style={S('margin-top:26px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Your snapshot</div>
        <div style={S('display:flex;align-items:center;gap:12px')}>
          <Pressable
            label="Log volunteer hours"
            onClick={() => openLogHours()}
            className={cx(H.press)}
            style={S('display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}
          >
            <span aria-hidden="true" style={S('font:600 15px/1 Geist')}>+</span> Log hours
          </Pressable>
          <Pressable label="See your full record" onClick={() => router.push('/profile')} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}>
            Full record →
          </Pressable>
        </div>
      </div>
      <div className="vu-4col" style={S(`display:grid;grid-template-columns:repeat(${tiles.length},1fr);gap:14px;margin-top:12px;align-items:stretch`)}>
        {tiles.map((t) => {
          const open = openCard === t.k;
          return (
            <Pressable
              key={t.k}
              label={`${t.label}: ${t.big} ${t.unit}`}
              expanded={open}
              onClick={() => toggleTile(t.k)}
              className={cx(H.card, H.press)}
              style={s(
                'padding:20px;border-radius:14px;display:flex;flex-direction:column',
                `border:1px solid ${open ? '#E0D5C9' : '#E8E1D9'}`,
                `background:${open ? '#FCFAF8' : '#FFFFFF'}`,
                'cursor:pointer;transition:border-color .16s ease, background .16s ease'
              )}
            >
              <div style={S('display:flex;align-items:center;justify-content:space-between;gap:8px')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>{t.label}</div>
                <div style={S('display:flex;align-items:center;gap:7px')}>
                  {t.sign ? <div style={S(`font:500 12px/1 ${MONO};color:#C2603C`)}>{t.sign}</div> : null}
                  <span aria-hidden="true" style={s('font-size:10px;color:#B9AFA5;transition:transform .18s ease', open ? 'transform:rotate(180deg)' : 'transform:none')}>▾</span>
                </div>
              </div>
              <div style={S('margin-top:14px;display:flex;align-items:baseline;gap:6px')}>
                <div className="vu-stat-big" style={S('font:600 40px/1 Geist;letter-spacing:-0.045em')}>{t.big}</div>
                <div style={S('font:450 13px/1 Geist;color:#8A8179')}>{t.unit}</div>
              </div>
              <div style={S('margin-top:10px;font:450 12px/1.4 Geist;color:#8A8179')}>{t.sub}</div>
            </Pressable>
          );
        })}
      </div>
      {openTile ? (
        <div className="vu-screen" style={S('margin-top:14px;padding:18px 20px 20px;border-radius:14px;border:1px solid #E4DDD4;background:#FCFAF8')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>{openTile.label} · breakdown</div>
            <Pressable
              label={`Open full record for ${openTile.label}`}
              onClick={() => router.push(openTile.href)}
              className={H.link}
              style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer;flex:none')}
            >
              View full record →
            </Pressable>
          </div>
          <div style={S('margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px')}>
            {openTile.rows.map((r) => (
              <div key={r.l} style={S('display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:11px;background:#fff;border:1px solid #F1EBE4')}>
                <span style={S('font:450 12px/1.2 Geist;color:#8A8179')}>{r.l}</span>
                <span style={S('font:600 17px/1 Geist;letter-spacing:-0.02em;color:#1A1714')}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <HomeCharts />

      <div style={S('margin-top:20px;display:flex;flex-direction:column;gap:16px')}>
        <MemberProjects />
        <VolunteerApplications />
      </div>

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 320px;gap:20px;margin-top:20px;align-items:start')}>
        <div style={S('padding:24px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Openings for you</div>
            <Pressable label="See all openings" onClick={() => router.push('/discover')} className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C;cursor:pointer')}>
              See all →
            </Pressable>
          </div>
          <div style={S('margin-top:16px')}>
            <div style={S('padding:18px;border-radius:12px;border:1px dashed #E4DDD4;background:#FCFAF8;text-align:center')}>
              <div style={S('font:500 14px/1.3 Geist;color:#332D28')}>Find your next opportunity</div>
              <div style={S('margin-top:6px;font:450 12px/1.5 Geist;color:#8A8179')}>Search real student projects and nonprofits by cause, kind and location, remote or in person.</div>
              <Pressable label="Browse openings" onClick={() => router.push('/discover')} className={cx(H.primary, H.press)} style={S('margin-top:14px;display:inline-flex;align-items:center;gap:8px;padding:0 16px;height:38px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}>
                <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
                Browse openings
              </Pressable>
            </div>
            <div style={S('margin-top:16px')}>
              <WebNonprofits
                near={[state.prefs.location || (state.account.city || ''), state.onboarding?.zip || ''].filter(Boolean).join(' ')}
                causes={state.prefs.causes || []}
                heading="Nonprofits suggested for you"
              />
            </div>
          </div>
        </div>

        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Upcoming</div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
              {state.bookings.length ? (
                state.bookings.map((b) => {
                  const opp = getOpportunity(b.oppId);
                  if (!opp) return null;
                  const shift = opp.shifts.find((x) => x.id === b.shiftId) || opp.shifts[0];
                  const tag = b.oppId === 'opp-reading-buddies' ? 'Bring your library card' : `Check-in opens ${checkinTime(shift.t)}`;
                  return (
                    <Pressable
                      key={b.id}
                      label={`${opp.title}, ${shift.d}`}
                      onClick={() => router.push(`/opportunity/${opp.id}`)}
                      className={cx(H.cardSoft, H.press)}
                      style={S('padding:14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8;cursor:pointer;transition:border-color .16s ease')}
                    >
                      <div style={S('font:600 14px/1.25 Geist;letter-spacing:-0.02em')}>{opp.title}</div>
                      <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>
                        {shift.d} · {startTime(shift.t)} · {opp.org.split(' ')[0]}
                      </div>
                      <div style={S(`margin-top:10px;font:500 11px/1 ${MONO};color:#C2603C`)}>{tag}</div>
                    </Pressable>
                  );
                })
              ) : (
                <div style={S('padding:16px;border-radius:11px;border:1px dashed #E4DDD4;background:#FCFAF8;text-align:center')}>
                  <div style={S('font:500 13px/1.3 Geist;color:#57504A')}>Nothing booked yet</div>
                  <div style={S('margin-top:6px;font:450 12px/1.45 Geist;color:#8A8179')}>Claim a shift and it shows up here with the check-in time.</div>
                  <Pressable label="Find a shift" onClick={() => router.push('/discover')} className={H.link} style={S('margin-top:12px;font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}>
                    Find a shift →
                  </Pressable>
                </div>
              )}
            </div>
          </div>

          {proj ? (
            <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your project</div>
              <div style={S('margin-top:12px;font:600 16px/1.3 Geist;letter-spacing:-0.02em')}>{proj.name}</div>
              <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>
                {tutorsShort ? `${word(tutorsShort)} ${plural(tutorsShort, 'tutor')} short of launch.` : 'Fully staffed for launch.'} Checklist is {remaining}{' '}
                {plural(remaining, 'item')} from done.
              </div>
              <div style={S('margin-top:14px;height:6px;border-radius:4px;background:#F1EBE4')}>
                <div style={s(`width:${Math.round(progress.pct)}%`, 'height:100%;border-radius:4px;background:#C2603C;transition:width .36s cubic-bezier(.16,1,.3,1)')} />
              </div>
              <Pressable
                label="Open Lead workspace"
                onClick={() => router.push(`/lead/${proj.id}/overview`)}
                className={cx(H.secondary, H.press)}
                style={S('margin-top:16px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
              >
                <span aria-hidden="true" style={S('font-size:10px;color:#C2603C')}>▷</span>
                Open Lead
              </Pressable>
            </div>
          ) : (
            <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your project</div>
              <div style={S('margin-top:12px;font:600 16px/1.3 Geist;letter-spacing:-0.02em')}>Nothing running yet</div>
              <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>Set one up under a verified sponsor and recruit a crew from schools near you.</div>
              <Pressable
                label="Start a project"
                onClick={() => router.push('/create')}
                className={cx(H.secondary, H.press)}
                style={S('margin-top:16px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease')}
              >
                <span aria-hidden="true" style={S('font-size:10px;color:#C2603C')}>▷</span>
                Start a project
              </Pressable>
            </div>
          )}

          {badge ? (
            <Pressable
              label={`Next badge: ${badge.t}`}
              onClick={() => router.push('/profile?focus=badges')}
              className={cx(H.card, H.press)}
              style={S('padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3;cursor:pointer;transition:border-color .16s ease')}
            >
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Next badge</div>
              <div style={S('margin-top:10px;font:600 26px/1 Geist;letter-spacing:-0.04em')}>{badge.t}</div>
              <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#6B635C')}>
                {badge.remaining} hours to go. {word(Math.ceil(badge.remaining / 7))} more Saturdays does it.
              </div>
            </Pressable>
          ) : null}
        </div>
      </div>
    </div>
  );
}
