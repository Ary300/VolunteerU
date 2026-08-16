'use client';

/* ==========================================================================
   Profile.jsx — design screen: `isProfile` (the student's verified record)
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState, Field } from '../ui.jsx';
import { useSnapshot, update } from '../../lib/store.js';
import { openModal, toast, confirmDialog } from '../../lib/overlays.js';
import { APP_TONE, GRADE_TONE, tone, transcriptCSV, download, copyText, withdrawApplication, updateAccount } from '../../lib/db.js';
import MyRatings from '../MyRatings.jsx';

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

  function shareCard() {
    const link = typeof window !== 'undefined' ? window.location.origin : 'https://volunteeru.app';
    openModal({
      title: 'Share your record',
      subtitle: 'Download a verified record a school or scholarship can check. The link points to VolunteerU — never your address or contact details.',
      body: (
        <div>
          <div style={S('padding:22px;border-radius:16px;background:#1F1B18;position:relative;overflow:hidden')}>
            <div aria-hidden="true" style={S('position:absolute;top:-90px;right:-70px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(210,119,91,.35),rgba(210,119,91,0) 62%)')} />
            <div style={S('position:relative')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#7C726A`)}>VolunteerU record</div>
              <div style={S('margin-top:14px;font:600 34px/1 Geist;letter-spacing:-0.04em;color:#fff')}>{st.verifiedHours} verified hours</div>
              <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#A79E96')}>
                {a.name} · Grade {a.grade} · {st.orgs} organizations · {st.causes} causes
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
            {opp ? <Row l="Where" v={`${opp.address} · ${opp.distance} mi`} /> : null}
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
                {a.city} · Grade {a.grade} · {a.school}
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

          <div id="vu-applications" style={S('padding:26px 30px;border-bottom:1px solid #F1EBE4')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Applications and projects</div>
              <Pressable label="Find more openings" onClick={() => router.push('/discover')} className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C;cursor:pointer')}>
                Find more
              </Pressable>
            </div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
              {apps.length ? (
                apps.map((x) => {
                  const t = tone(APP_TONE, x.st);
                  return (
                    <div key={x.id} style={S('padding:14px 16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
                      <div style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
                        <div style={S('width:34px;height:34px;border-radius:9px;overflow:hidden;flex:none')}>
                          <ImageSlot src={`https://picsum.photos/seed/${x.slug}/400/400?grayscale`} shape="rounded" radius={9} placeholder="logo" />
                        </div>
                        <div style={S('min-width:0')}>
                          <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>{x.n}</div>
                          <div className="vu-trunc" style={S('margin-top:4px;font:450 12px/1.3 Geist;color:#8A8179')}>
                            {x.role} · sent {x.when}
                          </div>
                        </div>
                      </div>
                      <div style={S('display:flex;align-items:center;gap:10px;flex:none')}>
                        <span style={S(`padding:5px 9px;border-radius:7px;background:${t.stBg || t.bg};font:500 11px/1 ${MONO};color:${t.stColor || t.color}`)}>{x.st}</span>
                        <Pressable
                          label={`View application to ${x.n}`}
                          onClick={() => viewApplication(x)}
                          className={cx(H.secondary, H.press)}
                          style={S('padding:6px 10px;border-radius:8px;border:1px solid #E4DDD4;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
                        >
                          View
                        </Pressable>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  compact
                  title="No applications yet"
                  body="Apply to a shift and it will track here from submitted through accepted."
                  cta="Find openings"
                  onCta={() => router.push('/discover')}
                />
              )}
            </div>
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
                {state.myAttendance.map((x) => {
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
                })}
              </div>
            </div>
            <div style={S('margin-top:16px;padding:16px 18px;border-radius:14px;border:1px solid #E8E1D9;background:#FCFAF8')}>
              <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Reliability</div>
                <Pressable label="Request a review of a score" onClick={requestReview} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer;flex:none')}>
                  Request a review
                </Pressable>
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
                          <ImageSlot src={`https://picsum.photos/seed/${f.slug}/400/400?grayscale`} shape="circle" placeholder="face" />
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
              <MyRatings />
            </div>

            <div style={S('height:1px;background:#F1EBE4;margin:26px 0')} />
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Service history</div>
            <div style={S('margin-top:12px;display:flex;flex-direction:column')}>
              {history.map((r) => (
                <div key={r.id} style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #F1EBE4')}>
                  <div style={S('min-width:0')}>
                    <div className="vu-trunc" style={S('font:500 14px/1.2 Geist')}>{r.name}</div>
                    <div className="vu-trunc" style={S('font:450 12px/1.2 Geist;color:#8A8179;margin-top:3px')}>
                      {r.org} · {r.date}
                    </div>
                  </div>
                  <div style={S('display:flex;align-items:center;gap:8px;flex:none')}>
                    <span style={S(`font:500 13px/1 ${MONO}`)}>{r.hrs} hrs</span>
                    <span title="Verified" style={S('color:#3F6B4E;font-size:12px')}>✓</span>
                  </div>
                </div>
              ))}
            </div>
            <Pressable
              label={showAll ? 'Show fewer events' : `View all ${state.hoursLog.length} events`}
              onClick={() => setParam('history', showAll ? '' : 'all')}
              className={H.link}
              style={S('margin-top:16px;font:500 13px/1 Geist;color:#C2603C;cursor:pointer;width:max-content')}
            >
              {showAll ? 'Show less' : `View all ${state.hoursLog.length} events`}
            </Pressable>
          </div>
        </div>

        <div style={S('display:flex;flex-direction:column;gap:14px')}>
          <div style={S('padding:22px;border-radius:16px;background:#1F1B18;overflow:hidden;position:relative')}>
            <div aria-hidden="true" style={S('position:absolute;top:-90px;right:-70px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(210,119,91,.35),rgba(210,119,91,0) 62%)')} />
            <div style={S('position:relative')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#7C726A`)}>Shareable card</div>
              <div style={S('margin-top:14px;font:600 30px/1 Geist;letter-spacing:-0.04em;color:#fff')}>{st.verifiedHours} hours</div>
              <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#A79E96')}>
                {st.causes} causes · {st.orgs} organizations · Grade {a.grade}
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
                        const ok = await copyText(`${st.verifiedHours} verified volunteer hours on VolunteerU — ${link}`);
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
          placeholder="Give the organizer something concrete to check — a time, a task, a person who saw it."
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
