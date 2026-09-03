'use client';

/* ==========================================================================
   Profile.jsx, design screen: `isProfile` (the student's verified record)
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState, Field, TextArea, Select } from '../ui.jsx';
import { safeUrl } from '../MemberProjects.jsx';
import { track } from '../../lib/analytics.js';
import { useSnapshot, update } from '../../lib/store.js';
import { openModal, toast, confirmDialog } from '../../lib/overlays.js';
import { APP_TONE, GRADE_TONE, tone, transcriptCSV, download, copyText, withdrawApplication, updateAccount } from '../../lib/db.js';
import { openLogHours } from '../LogHoursForm.jsx';
import MyRatings from '../MyRatings.jsx';
import MyServiceHours from '../MyServiceHours.jsx';
import VolunteerApplications from '../VolunteerApplications.jsx';

const MONO = "'Geist Mono',monospace";

export default function Profile() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { state } = useSnapshot();
  const badgesRef = useRef(null);

  const a = state.account;
  const st = state.stats;
  const isolated = params.get('cause') || '';
  const showAll = params.get('history') === 'all';
  const focus = params.get('focus');
  const apps = state.applications.filter((x) => x.st !== 'Withdrawn');
  const history = showAll ? state.hoursLog : state.hoursLog.slice(0, 4);
  const maxCause = Math.max(1, ...state.causeBars.map((b) => b.n));

  useEffect(() => {
    if (focus === 'badges' && badgesRef.current) badgesRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (focus === 'applications') {
      const el = document.getElementById('vu-applications');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focus]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params.toString());
    if (!v) next.delete(k);
    else next.set(k, v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  function logService() {
    openLogHours();
  }

  function editProfile() {
    openModal({
      title: 'Edit your profile',
      subtitle: 'This is what organizers see when you apply. Saved to your account.',
      Body: ({ api }) => <ProfileEditForm api={api} account={a} />,
    });
  }

  function shareCard() {
    const link = typeof window !== 'undefined' ? window.location.origin : 'https://volunteeru.app';
    openModal({
      title: 'Share your record',
      subtitle: 'Download a verified record a school or scholarship can check. The link points to VolunteerU, never your address or contact details.',
      body: (
        <div>
          <div style={S('padding:22px;border-radius:16px;background:#1F1B18;position:relative;overflow:hidden')}>
            <div aria-hidden="true" style={S('position:absolute;top:-90px;right:-70px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(210,119,91,.35),rgba(210,119,91,0) 62%)')} />
            <div style={S('position:relative')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#7C726A`)}>VolunteerU record</div>
              <div style={S('margin-top:14px;font:600 34px/1 Geist;letter-spacing:-0.04em;color:#fff')}>{st.verifiedHours} verified hours</div>
              <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#A79E96')}>
                {[a.name, a.grade ? `Grade ${a.grade}` : null, `${st.orgs} organizations`, `${st.causes} causes`].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={S('margin-top:16px')}>
            <Field label="Link to VolunteerU" value={link} readOnly />
          </div>
          <div style={S('margin-top:14px;display:flex;gap:10px;flex-wrap:wrap')}>
            <Pressable
              label="Copy the link"
              onClick={async () => {
                const ok = await copyText(link);
                toast(ok ? { title: 'Link copied', tone: 'ok' } : { title: 'Could not copy', message: link, tone: 'warn' });
              }}
              className={cx(H.primary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:8px;padding:0 16px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
            >
              Copy link
            </Pressable>
            <Pressable
              label="Download as CSV"
              onClick={() => {
                download(`volunteeru-record-${a.name.toLowerCase().replace(/\s+/g, '-')}.csv`, transcriptCSV());
                toast({ title: 'Record downloaded', message: 'A signed CSV a counselor can verify.', tone: 'ok' });
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
            >
              Download CSV
            </Pressable>
          </div>
        </div>
      ),
    });
  }

  function downloadPdf() {
    toast({
      title: 'Opening your record for print',
      message: 'Choose “Save as PDF” in the print dialog.',
      tone: 'brand',
    });
    setTimeout(() => window.print(), 400);
  }

  function requestReview() {
    openModal({
      title: 'Request a score review',
      subtitle: 'Reviews go to the organizer who ran the session. They have 14 days to respond.',
      Body: function ReviewBody({ api }) {
        return <ReviewForm api={api} rows={state.myAttendance} />;
      },
    });
  }

  function manageCounselor() {
    openModal({
      title: 'Counselor access',
      subtitle: 'A counselor can view and confirm your record. They can never edit it.',
      Body: function CounselorBody({ api }) {
        return <CounselorForm api={api} account={a} />;
      },
    });
  }

  async function viewApplication(app) {
    const opp = state.opportunities.find((o) => o.id === app.oppId);
    openModal({
      title: app.n,
      subtitle: `${app.role} · sent ${app.when}`,
      body: (
        <div>
          <div style={S('display:flex;flex-direction:column;gap:11px;font:450 14px/1.5 Geist;color:#332D28')}>
            <Row l="Status" v={app.st} />
            {opp ? <Row l="Where" v={opp.address} /> : null}
            {opp ? <Row l="Hours" v={`${opp.hours.toFixed(1)} verified`} /> : null}
            <Row l="Shared with them" v={app.shareRecord === false ? 'Basic profile only' : 'Verified hours and cause history'} />
          </div>
          {app.note ? (
            <div style={S('margin-top:16px;padding:14px;border-radius:12px;background:#FCFAF8;border:1px solid #F1EBE4')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your note</div>
              <div className="vu-break" style={S('margin-top:8px;font:450 13px/1.55 Geist;color:#332D28')}>{app.note}</div>
            </div>
          ) : null}
        </div>
      ),
      footer: (api) => (
        <>
          {opp ? (
            <Pressable
              label="Open the listing"
              onClick={() => {
                api.close();
                router.push(`/opportunity/${opp.id}`);
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
            >
              Open listing
            </Pressable>
          ) : null}
          {app.st !== 'Accepted' ? (
            <Pressable
              label="Withdraw this application"
              onClick={async () => {
                api.close();
                const ok = await confirmDialog({
                  title: 'Withdraw this application?',
                  body: `${app.n} will be told the spot is free again.`,
                  confirmLabel: 'Withdraw',
                });
                if (ok) {
                  withdrawApplication(app.id);
                  toast({ title: 'Application withdrawn', tone: 'ok' });
                }
              }}
              className={cx(H.danger, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 14px/1 Geist;color:#A8482A;cursor:pointer')}
            >
              Withdraw
            </Pressable>
          ) : null}
        </>
      ),
    });
  }

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Profile</h1>
          <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>
            What organizations and project leads see when you apply. Every hour on it is confirmed by the host.
          </p>
        </div>
        <div className="vu-noprint" style={S('display:flex;gap:10px')}>
          <Pressable
            label="Share your record card"
            onClick={shareCard}
            className={cx(H.secondaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease')}
          >
            Share card
          </Pressable>
          <Pressable
            label="Download your record as a PDF"
            onClick={downloadPdf}
            className={cx(H.primaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer;transition:transform .16s ease, box-shadow .16s ease, background .16s ease')}
          >
            <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
            Download PDF
          </Pressable>
        </div>
      </div>

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 330px;gap:24px;margin-top:26px;align-items:start')}>
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div className="vu-stack vu-stack-gap" style={S('padding:28px 30px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;gap:18px')}>
            <div style={S('width:72px;height:72px;border-radius:50%;overflow:hidden;flex:none')}>
              <ImageSlot src={a.avatar} shape="circle" placeholder="portrait" />
            </div>
            <div style={S('flex:1;min-width:0')}>
              <div className="vu-break" style={S('font:600 28px/1.1 Geist;letter-spacing:-0.035em')}>{a.name}</div>
              <div style={S('margin-top:7px;font:450 14px/1.35 Geist;color:#8A8179')}>
                {[a.city, a.grade ? `Grade ${a.grade}` : null, a.school].filter(Boolean).join(' · ') || 'Add your school and grade in settings'}
              </div>
            </div>
            <div style={S('text-align:right;flex:none')}>
              <div style={S('font:600 34px/1 Geist;letter-spacing:-0.04em')}>{st.verifiedHours}</div>
              <div style={S(`margin-top:5px;font:500 11px/1 ${MONO};letter-spacing:.06em;text-transform:uppercase;color:#3F6B4E`)}>Verified hrs</div>
            </div>
          </div>

          <div className="vu-4col" style={S('display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #F1EBE4')}>
            {[
              { v: st.events, l: 'Events' },
              { v: st.orgs, l: 'Organizations' },
              { v: st.causes, l: 'Cause areas' },
              { v: st.leadershipHours, l: 'Leadership hrs' },
            ].map((k, i) => (
              <div key={k.l} style={s('padding:20px 22px', i < 3 ? 'border-right:1px solid #F1EBE4' : '')}>
                <div style={S('font:600 20px/1 Geist;letter-spacing:-0.03em')}>{k.v}</div>
                <div style={S('margin-top:6px;font:450 12px/1 Geist;color:#8A8179')}>{k.l}</div>
              </div>
            ))}
          </div>

          <div style={S('padding:26px 30px;border-bottom:1px solid #F1EBE4')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>About you</div>
              <Pressable
                label="Edit profile"
                onClick={editProfile}
                className={cx(H.secondary, H.press)}
                style={S('flex:none;padding:0 13px;height:32px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}
              >
                Edit profile
              </Pressable>
            </div>
            {(a.headline || a.pronouns) ? (
              <div style={S('margin-top:12px;font:500 14px/1.4 Geist;color:#1A1714')}>
                {a.headline}{a.pronouns ? <span style={S('color:#8A8179;font-weight:450')}>{a.headline ? '  ·  ' : ''}{a.pronouns}</span> : null}
              </div>
            ) : null}
            {a.bio ? (
              <div className="vu-break" style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#332D28;white-space:pre-wrap')}>{a.bio}</div>
            ) : null}
            {(a.skills || '').trim() ? (
              <div style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:7px')}>
                {a.skills.split(',').map((sk) => sk.trim()).filter(Boolean).slice(0, 12).map((sk) => (
                  <span key={sk} style={S(`padding:4px 10px;border-radius:7px;background:#F6F2EE;font:500 12px/1 Geist;color:#57504A`)}>{sk}</span>
                ))}
              </div>
            ) : null}
            {(a.experience || '').trim() ? (
              <div style={S('margin-top:14px')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Experience</div>
                <div className="vu-break" style={S('margin-top:6px;font:450 13px/1.55 Geist;color:#332D28;white-space:pre-wrap')}>{a.experience}</div>
              </div>
            ) : null}
            {(a.goals || '').trim() ? (
              <div style={S('margin-top:14px')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Goals</div>
                <div className="vu-break" style={S('margin-top:6px;font:450 13px/1.55 Geist;color:#332D28;white-space:pre-wrap')}>{a.goals}</div>
              </div>
            ) : null}
            {safeUrl(a.resumeUrl) ? (
              <a href={safeUrl(a.resumeUrl)} target="_blank" rel="noopener noreferrer" style={S('margin-top:14px;display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;text-decoration:none')}>
                View résumé →
              </a>
            ) : null}
            {!a.bio && !a.headline && !(a.skills || '').trim() && !(a.experience || '').trim() && !safeUrl(a.resumeUrl) ? (
              <div style={S('margin-top:10px;font:450 13px/1.6 Geist;color:#8A8179')}>
                Add a bio, skills, experience and a résumé link so organizers know who they are accepting. Everything here is saved to your account.
              </div>
            ) : null}
          </div>

          <div id="vu-applications" style={S('padding:26px 30px;border-bottom:1px solid #F1EBE4')}>
            <VolunteerApplications showEmpty />
          </div>

          <div style={S('padding:26px 30px')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Top causes</div>
              {isolated ? (
                <Pressable label="Show all causes" onClick={() => setParam('cause', '')} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer')}>
                  Show all
                </Pressable>
              ) : null}
            </div>
            <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:13px')}>
              {state.causeBars.length === 0 ? (
                <div style={S('padding:16px;border-radius:12px;border:1px dashed #E7DED6;background:#FCFAF8;font:450 13px/1.6 Geist;color:#8A8179')}>
                  Your causes chart fills in as your verified hours post. Log service with an organization and it shows up here, split by cause.
                </div>
              ) : null}
              {state.causeBars.map((b) => {
                const dim = isolated && isolated !== b.name;
                return (
                  <Pressable
                    key={b.name}
                    label={`${b.name}, ${b.n} hours`}
                    pressed={isolated === b.name}
                    onClick={() => setParam('cause', isolated === b.name ? '' : b.name)}
                    style={S('cursor:pointer')}
                  >
                    <div style={s('display:flex;justify-content:space-between;gap:10px;font:450 13px/1 Geist', `color:${isolated === b.name ? '#1A1714' : '#332D28'}`)}>
                      <span>{b.name}</span>
                      <span style={S('color:#8A8179')}>{b.n} hrs</span>
                    </div>
                    <div style={S('margin-top:7px;height:6px;border-radius:4px;background:#F1EBE4')}>
                      <div style={s(`width:${Math.round((b.n / maxCause) * 100)}%`, 'height:100%;border-radius:4px', `background:${dim ? '#E7DED6' : b.c}`, 'transition:background .16s ease, width .36s cubic-bezier(.16,1,.3,1)')} />
                    </div>
                  </Pressable>
                );
              })}
            </div>

            <div style={S('height:1px;background:#F1EBE4;margin:26px 0')} />
            <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Attendance and scores</div>
              <div style={S('font:450 12px/1 Geist;color:#8A8179')}>Posted by the organizer who ran the session</div>
            </div>
            <div className="vu-table-wrap" style={S('margin-top:14px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
              <div>
                <div style={S(`display:grid;grid-template-columns:.7fr 1.6fr 1fr .6fr 1fr;gap:12px;padding:11px 16px;background:#FCFAF8;border-bottom:1px solid #F1EBE4;font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>
                  <div>Date</div><div>Project</div><div>Arrival</div><div>Hours</div><div>Score</div>
                </div>
                {state.myAttendance.length ? state.myAttendance.map((x) => {
                  const g = GRADE_TONE[x.grade] || GRADE_TONE['Not scored'];
                  return (
                    <div key={x.id} style={S('display:grid;grid-template-columns:.7fr 1.6fr 1fr .6fr 1fr;gap:12px;padding:13px 16px;border-bottom:1px solid #F1EBE4;align-items:center')}>
                      <div style={S('font:450 12px/1 Geist;color:#8A8179')}>{x.d}</div>
                      <div style={S('font:500 13px/1 Geist')}>{x.p}</div>
                      <div style={S('font:450 12px/1 Geist;color:#57504A')}>{x.st}</div>
                      <div style={S(`font:500 13px/1 ${MONO}`)}>{x.hrs}</div>
                      <div>
                        <span style={S(`padding:5px 9px;border-radius:7px;background:${g.gBg};font:500 11px/1 ${MONO};color:${g.gColor}`)}>{x.grade}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={S('padding:22px 16px;text-align:center;font:450 13px/1.5 Geist;color:#8A8179')}>
                    No sessions scored yet. After you attend and an organizer confirms your hours, each session shows up here with its score.
                  </div>
                )}
              </div>
            </div>
            <div style={S('margin-top:16px;padding:16px 18px;border-radius:14px;border:1px solid #E8E1D9;background:#FCFAF8')}>
              <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Reliability</div>
                {state.myAttendance && state.myAttendance.length ? (
                  <Pressable label="Request a review of a score" onClick={requestReview} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer;flex:none')}>
                    Request a review
                  </Pressable>
                ) : null}
              </div>
              <div style={S('margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px')}>
                {[
                  { l: 'Show rate', v: `${st.showRate}%` },
                  { l: 'On time', v: `${st.onTime}%` },
                  { l: 'Average score', v: st.averageScore },
                ].map((k) => (
                  <div key={k.l}>
                    <div style={S('font:600 24px/1 Geist;letter-spacing:-0.03em;color:#1A1714')}>{k.v}</div>
                    <div style={S('margin-top:5px;font:450 12px/1 Geist;color:#8A8179')}>{k.l}</div>
                  </div>
                ))}
              </div>
              <div style={S('margin-top:12px;font:450 12px/1.5 Geist;color:#8A8179')}>
                Organizations see this when you apply. A strong, consistent record helps you get picked and invited back.
              </div>
            </div>

            {state.leadFeedback.length ? (
              <>
                <div style={S('height:1px;background:#F1EBE4;margin:26px 0')} />
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Notes from organizers</div>
                <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
                  {state.leadFeedback.map((f) => (
                    <div key={f.id} style={S('padding:16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                      <div style={S('font:450 14px/1.55 Geist;color:#332D28')}>{f.t}</div>
                      <div style={S('margin-top:10px;display:flex;align-items:center;gap:10px')}>
                        <div style={S('width:24px;height:24px;border-radius:50%;overflow:hidden;flex:none')}>
                          <ImageSlot src={''} shape="circle" placeholder="face" />
                        </div>
                        <div style={S('font:500 12px/1.3 Geist;color:#57504A')}>{f.who}</div>
                        <div style={S(`margin-left:auto;font:500 10px/1 ${MONO};color:#A9A097;flex:none`)}>{f.when}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <div style={S('margin-top:22px')}>
              <MyServiceHours />
            </div>

            <div style={S('margin-top:22px')}>
              <MyRatings />
            </div>

            <div style={S('height:1px;background:#F1EBE4;margin:26px 0')} />
            <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Service history</div>
              <Pressable
                label="Log hours"
                onClick={logService}
                className={cx(H.secondary, H.press)}
                style={S('flex:none;display:inline-flex;align-items:center;gap:7px;padding:0 13px;height:34px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}
              >
                + Log hours
              </Pressable>
            </div>
            {state.hoursLog.length === 0 ? (
              <div style={S('margin-top:14px;padding:18px;border-radius:12px;border:1px dashed #E0D8CF;background:#FCFAF8;font:450 13px/1.6 Geist;color:#8A8179')}>
                No hours logged yet. Log service you have done, an organization can confirm it later, and confirmed hours count on your verified record.
              </div>
            ) : (
              <div style={S('margin-top:12px;display:flex;flex-direction:column')}>
                {history.map((r) => (
                  <div key={r.id} style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #F1EBE4')}>
                    <div style={S('min-width:0')}>
                      <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                        <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>{r.name}</div>
                        {r.category ? (
                          <span style={S(`padding:3px 8px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>{r.category}</span>
                        ) : null}
                      </div>
                      <div className="vu-trunc" style={S('font:450 12px/1.2 Geist;color:#8A8179;margin-top:3px')}>
                        {[r.org, r.date].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={S('display:flex;align-items:center;gap:8px;flex:none')}>
                      <span style={S(`font:500 13px/1 ${MONO}`)}>{r.hrs} hrs</span>
                      {r.verified ? (
                        <span title="Verified by the organization" style={S('color:#3F6B4E;font-size:12px')}>✓</span>
                      ) : (
                        <span style={S(`padding:3px 7px;border-radius:6px;background:#FDF3E7;font:500 10px/1 ${MONO};color:#8A5A20`)}>Self-reported</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {state.hoursLog.length > 4 ? (
              <Pressable
                label={showAll ? 'Show fewer events' : `View all ${state.hoursLog.length} events`}
                onClick={() => setParam('history', showAll ? '' : 'all')}
                className={H.link}
                style={S('margin-top:16px;font:500 13px/1 Geist;color:#C2603C;cursor:pointer;width:max-content')}
              >
                {showAll ? 'Show less' : `View all ${state.hoursLog.length} events`}
              </Pressable>
            ) : null}
          </div>
        </div>

        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          <div style={S('padding:22px;border-radius:16px;background:#1F1B18;overflow:hidden;position:relative')}>
            <div aria-hidden="true" style={S('position:absolute;top:-90px;right:-70px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(210,119,91,.35),rgba(210,119,91,0) 62%)')} />
            <div style={S('position:relative')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#7C726A`)}>Shareable card</div>
              <div style={S('margin-top:14px;font:600 30px/1 Geist;letter-spacing:-0.04em;color:#fff')}>{st.verifiedHours} hours</div>
              <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#A79E96')}>
                {[`${st.causes} causes`, `${st.orgs} organizations`, a.grade ? `Grade ${a.grade}` : null].filter(Boolean).join(' · ')}
              </div>
              <div style={S('margin-top:18px;display:flex;gap:8px')}>
                {['Instagram', 'TikTok', 'Link'].map((k) => (
                  <Pressable
                    key={k}
                    label={`Share to ${k}`}
                    onClick={async () => {
                      const link = typeof window !== 'undefined' ? window.location.origin : 'https://volunteeru.app';
                      if (k === 'Link') {
                        const ok = await copyText(link);
                        toast(ok ? { title: 'Link copied', message: 'Paste it anywhere.', tone: 'ok' } : { title: 'Could not copy', message: link, tone: 'warn' });
                      } else {
                        const ok = await copyText(`${st.verifiedHours} verified volunteer hours on VolunteerU, ${link}`);
                        toast({
                          title: `Caption copied for ${k}`,
                          message: ok ? 'Paste it into your story with the card image.' : 'Copy the link from the share dialog.',
                          tone: ok ? 'ok' : 'warn',
                        });
                      }
                    }}
                    style={S('flex:1;text-align:center;padding:10px;border-radius:10px;background:#26221E;border:1px solid #363029;font:500 12px/1 Geist;color:#E6DFD8;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
                  >
                    {k}
                  </Pressable>
                ))}
              </div>
            </div>
          </div>

          <div ref={badgesRef} style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Badges</div>
            <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px')}>
              {state.badges.map((b) => (
                <div key={b.id} title={b.on ? 'Earned' : 'Locked'} style={s('padding:13px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8', b.on ? '' : 'opacity:.72')}>
                  <div style={S('font:500 13px/1.3 Geist')}>{b.t}</div>
                  <div style={S('margin-top:5px;font:450 11px/1.3 Geist;color:#A9A097')}>{b.s}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S('padding:22px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Counselor access</div>
            <div style={S('margin-top:10px;font:450 13px/1.5 Geist;color:#6B635C')}>
              {a.counselor.access
                ? `${a.counselor.name} can view and confirm this record. Last checked ${a.counselor.lastChecked}.`
                : 'No counselor has access to this record right now.'}
            </div>
            <Pressable
              label="Manage counselor access"
              onClick={manageCounselor}
              className={cx(H.secondaryLift, H.press)}
              style={S('margin-top:14px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease')}
            >
              Manage access
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div style={S('display:flex;justify-content:space-between;gap:12px')}>
      <span style={S('color:#57504A')}>{l}</span>
      <span style={S('font-weight:500')}>{v}</span>
    </div>
  );
}

function ReviewForm({ api, rows }) {
  const [pick, setPick] = useState(rows[0] ? rows[0].id : '');
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <div>
      <div style={S('display:flex;flex-direction:column;gap:10px')}>
        {rows.map((r) => (
          <Pressable
            key={r.id}
            role="radio"
            aria-checked={pick === r.id}
            label={`${r.p}, ${r.d}, scored ${r.grade}`}
            onClick={() => setPick(r.id)}
            className={cx(H.chip, H.press)}
            style={s(
              'padding:14px;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer',
              `border:1px solid ${pick === r.id ? '#C2603C' : '#E8E1D9'}`,
              `background:${pick === r.id ? '#FAF6F3' : '#FCFAF8'}`
            )}
          >
            <div>
              <div style={S('font:500 14px/1.2 Geist')}>{r.p}</div>
              <div style={S('margin-top:4px;font:450 12px/1.3 Geist;color:#8A8179')}>
                {r.d} · {r.hrs} hrs · scored {r.grade}
              </div>
            </div>
          </Pressable>
        ))}
      </div>
      <div style={S('margin-top:16px')}>
        <label htmlFor="rv-why" style={S('font:500 12px/1 Geist;color:#57504A')}>What should the organizer reconsider?</label>
        <textarea
          id="rv-why"
          value={why}
          maxLength={400}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Give the organizer something concrete to check, a time, a task, a person who saw it."
          className={H.input}
          style={S('margin-top:8px;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:90px;font:450 14px/1.55 Geist;color:#332D28')}
        />
        {err ? <div className="vu-err">{err}</div> : <div className="vu-hint">Reviews are logged on the project's audit trail with your name.</div>}
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Send review request"
          onClick={() => {
            if (why.trim().length < 12) {
              setErr('Add a sentence so the organizer knows what to check.');
              return;
            }
            api.close();
            toast({ title: 'Review requested', message: 'The organizer has 14 days to respond. You will get a notification either way.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Send request
        </Pressable>
      </div>
    </div>
  );
}

/* Downscale a chosen image to a square ~256px JPEG data URL, small enough to
   ride along in the account blob, no storage bucket needed. */
function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Not an image')); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error('That image is too large (max 12MB).')); return; }
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
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
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
      toast({ title: 'Could not use that image', message: e2.message || 'Try a JPG or PNG.', tone: 'danger' });
    }
  }

  function save() {
    const e = {};
    if (!f.firstName.trim()) e.firstName = 'Your first name.';
    if (f.resumeUrl.trim() && !safeUrl(f.resumeUrl)) e.resumeUrl = 'Use a full link, e.g. https://…';
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
    toast({ title: 'Profile saved', message: 'Your changes are synced to your account.', tone: 'ok' });
  }

  return (
    <div>
      <div style={S('display:flex;align-items:center;gap:16px;margin-bottom:16px')}>
        <div style={S('width:66px;height:66px;border-radius:50%;overflow:hidden;flex:none;background:#F1EBE4')}>
          <ImageSlot src={f.avatar} shape="circle" placeholder="portrait" />
        </div>
        <div style={S('min-width:0')}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={S('display:none')} />
          <div style={S('display:flex;gap:9px;flex-wrap:wrap')}>
            <Pressable label="Upload a profile photo" onClick={() => fileRef.current && fileRef.current.click()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
              {f.avatar ? 'Change photo' : 'Upload photo'}
            </Pressable>
            {f.avatar ? (
              <Pressable label="Remove photo" onClick={() => set('avatar', '')} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#8A8179;cursor:pointer')}>
                Remove
              </Pressable>
            ) : null}
          </div>
          <div style={S('margin-top:7px;font:450 12px/1.4 Geist;color:#8A8179')}>JPG or PNG. It is cropped to a square and saved to your account.</div>
        </div>
      </div>
      <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="First name" value={f.firstName} onChange={(v) => set('firstName', v)} maxLength={40} required error={err.firstName} />
        <Field label="Last name" value={f.lastName} onChange={(v) => set('lastName', v)} maxLength={40} />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Headline" value={f.headline} onChange={(v) => set('headline', v)} placeholder="e.g. Student volunteer · loves tutoring and food banks" maxLength={80} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Pronouns (optional)" value={f.pronouns} onChange={(v) => set('pronouns', v)} placeholder="she/her, he/him, they/them" maxLength={24} />
        <Field label="Age (optional)" value={f.age} onChange={(v) => set('age', v.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="e.g. 16" maxLength={2} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="School (optional)" value={f.school} onChange={(v) => set('school', v)} maxLength={60} />
        <Field label="City (optional)" value={f.city} onChange={(v) => set('city', v)} maxLength={60} />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Bio" value={f.bio} onChange={(v) => set('bio', v)} placeholder="A couple of sentences about you and why you volunteer." maxLength={400} minHeight={80} counter />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Skills & interests (comma separated)" value={f.skills} onChange={(v) => set('skills', v)} placeholder="Tutoring, Spanish, first aid, event setup" maxLength={160} />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Experience (optional)" value={f.experience} onChange={(v) => set('experience', v)} placeholder="Where you have volunteered before and what you did." maxLength={400} minHeight={70} counter />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Goals (optional)" value={f.goals} onChange={(v) => set('goals', v)} placeholder="What you want to get out of volunteering." maxLength={300} minHeight={60} counter />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Résumé or portfolio link (optional)" value={f.resumeUrl} onChange={(v) => set('resumeUrl', v)} placeholder="https://… a link to your résumé or portfolio" maxLength={300} inputMode="url" error={err.resumeUrl} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
        <Pressable label="Save profile" onClick={save} className={cx(H.primary, H.press)} style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}>Save profile</Pressable>
      </div>
    </div>
  );
}

function CounselorForm({ api, account }) {
  const [name, setName] = useState(account.counselor.name);
  const [access, setAccess] = useState(account.counselor.access);
  return (
    <div>
      <Field label="Counselor name" value={name} onChange={setName} maxLength={60} />
      <div style={S('margin-top:16px;padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
        <div>
          <div style={S('font:500 13px/1.3 Geist')}>Allow view and confirm</div>
          <div style={S('margin-top:4px;font:450 12px/1.45 Geist;color:#8A8179')}>They see hours, scores and organizer notes. They can never edit them.</div>
        </div>
        <Pressable
          role="switch"
          aria-checked={access}
          label="Counselor access"
          onClick={() => setAccess(!access)}
          style={s('width:38px;height:22px;border-radius:12px;position:relative;cursor:pointer;flex:none', `background:${access ? '#C2603C' : '#EFE7DF'}`, `border:1px solid ${access ? '#A8482A' : '#E4DAD0'}`)}
        >
          <span aria-hidden="true" style={s('position:absolute;top:2px;width:16px;height:16px;border-radius:50%;transition:left .16s ease', `left:${access ? 18 : 2}px`, `background:${access ? '#fff' : '#C2603C'}`)} />
        </Pressable>
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
          Cancel
        </Pressable>
        <Pressable
          label="Save counselor access"
          onClick={() => {
            updateAccount({ counselor: { ...account.counselor, name: name.trim() || account.counselor.name, access } });
            api.close();
            toast({ title: access ? 'Counselor access on' : 'Counselor access off', message: access ? `${name} can confirm your record.` : 'Nobody can confirm your record right now.', tone: 'ok' });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Save
        </Pressable>
      </div>
    </div>
  );
}
