'use client';

/* ==========================================================================
   Landing.jsx — design screen: `isLanding`
   Transcribed 1:1 from `VolunteerU Design.dc.html`; the design's dead links and
   inert CTAs are the only things that changed, and only to gain destinations.
   ========================================================================== */

import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable } from '../ui.jsx';
import { MarketingHeader, MarketingFooter } from '../Marketing.jsx';
import { useSnapshot } from '../../lib/store.js';
import {
  proofCards, paths, timeline, sponsorMatches, shareStats, allInOne,
  effortAlone, effortWith, aloneRows, faqs, PEXELS,
} from '../../lib/seed.js';

const CREW = [
  { slot: 'crew_a', seed: 'crew-a', n: 'Maya R.', role: 'Supply lead', st: 'CONFIRMED', c: '#3F6B4E' },
  { slot: 'crew_b', seed: 'crew-b', n: 'Deven A.', role: 'Check-in', st: 'CONFIRMED', c: '#3F6B4E' },
  { slot: 'crew_c', seed: 'crew-c', n: 'Sofia K.', role: 'Tutor', st: 'REVIEW', c: '#8A5A20' },
];

const WAITING = [
  { slug: 'a-priya', n: 'Priya Nair', role: 'Tutor', when: '2 hours ago' },
  { slug: 'a-marcus', n: 'Marcus Odom', role: 'Tutor', when: 'Yesterday' },
  { slug: 'a-ava', n: 'Ava Lindqvist', role: 'Photographer', when: 'Yesterday' },
  { slug: 'a-ben', n: 'Ben Ortiz', role: 'Tutor', when: '2 days ago' },
];

const ATTEND = [
  { n: 'Maya Rodriguez', st: 'Present', stBg: '#EAF3EC', stColor: '#3F6B4E', hrs: '2.2', grade: 'Exceptional', gBg: '#F5E7E0', gColor: '#A8482A' },
  { n: 'Deven Achebe', st: 'Present', stBg: '#EAF3EC', stColor: '#3F6B4E', hrs: '2.3', grade: 'Strong', gBg: '#F6F2EE', gColor: '#57504A' },
  { n: 'Sofia Kaur', st: 'Late', stBg: '#FDF3E7', stColor: '#8A5A20', hrs: '1.6', grade: 'Strong', gBg: '#F6F2EE', gColor: '#57504A' },
  { n: 'Theo Marsh', st: 'Present', stBg: '#EAF3EC', stColor: '#3F6B4E', hrs: '2.1', grade: 'Solid', gBg: '#F6F2EE', gColor: '#57504A' },
  { n: 'Jonah Park', st: 'Absent', stBg: '#F5E7E0', stColor: '#A8482A', hrs: '0.0', grade: 'Not scored', gBg: '#F6F2EE', gColor: '#A19891' },
  { n: 'Nina Oyelaran', st: 'Present', stBg: '#EAF3EC', stColor: '#3F6B4E', hrs: '1.4', grade: 'Needs support', gBg: '#FDF3E7', gColor: '#8A5A20' },
];

const MONO = "'Geist Mono',monospace";

const SAMPLE_MATCHES = [
  { id: 's1', title: 'Food Bank Sort', org: 'Community Food Bank', meta: 'Food & hunger · Sat AM', hrs: '3 hrs', score: 96, img: '' },
  { id: 's2', title: 'Shelter Meal Service', org: 'Downtown Shelter', meta: 'Homelessness · Weeknights', hrs: '2 hrs', score: 91, img: '' },
  { id: 's3', title: 'Beach Cleanup Crew', org: 'Coastkeepers', meta: 'Environment · Sun AM', hrs: '2.5 hrs', score: 88, img: '' },
];

export default function Landing() {
  const router = useRouter();
  const { state } = useSnapshot();
  // Illustrative preview rows for the marketing hero (the real feed lives behind
  // sign-in at /discover). Clearly a product preview, so it never shows a blank
  // panel to a logged-out visitor.
  const matches = SAMPLE_MATCHES;
  const proofPill = state.ui.heroProofPill !== false;
  const trustRow = state.ui.showTrustRow !== false;

  const go = (path) => () => router.push(path);

  return (
    <div className="vu-screen vu-fixed-width" style={S('width:100%;min-width:1180px;overflow:hidden;padding-bottom:56px')}>
      <MarketingHeader />

      {/* ---- hero ---- */}
      <div
        id="vu-main"
        className="vu-hero vu-pad-32"
        style={S('position:relative;max-width:1180px;min-width:1180px;margin:0 auto;padding:132px 32px 128px;display:grid;grid-template-columns:600px 516px;gap:0;align-items:center')}
      >
        <div
          aria-hidden="true"
          style={S('position:absolute;top:-80px;left:-160px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle at 40% 40%, rgba(210,119,91,.16), rgba(210,119,91,0) 65%);pointer-events:none')}
        />
        <div style={S('position:relative')}>
          {proofPill ? (
            <div
              style={S(
                `display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:6px 12px 6px 8px;border-radius:999px;background:#fff;border:1px solid #E8E1D9;font:500 12px/1 ${MONO};letter-spacing:.02em;color:#57504A;box-shadow:0 1px 2px rgba(30,20,10,.05)`
              )}
            >
              <span aria-hidden="true" style={S('width:6px;height:6px;border-radius:50%;background:#C2603C')} />
              312 student organizations launched this month
            </div>
          ) : null}
          <h1 className="vu-h1" style={S('margin:22px 0 0;font:600 62px/1.02 Geist;letter-spacing:-0.045em;text-wrap:balance')}>
            Volunteering
            <br />
            built around you
          </h1>
          <p style={S('margin:22px 0 0;max-width:470px;font:400 18px/1.55 Geist;color:#57504A;text-wrap:pretty')}>
            Tell us who you are and we find real openings near you, or hand you everything you need to run your own organization. Either way the hours
            verify themselves and land on a record colleges can check.
          </p>
          <div style={S('display:grid;grid-template-columns:repeat(2,minmax(0,215px));gap:16px;margin-top:36px;justify-content:start')}>
            <div>
              <Pressable
                label="Start a nonprofit"
                onClick={go('/onboarding?intent=start')}
                className={H.press}
                style={S(
                  'display:flex;width:100%;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 20px;height:52px;border-radius:13px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 16px/1 Geist;letter-spacing:-0.01em;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(80,30,12,.22), 0 10px 20px -8px rgba(150,60,30,.55);transition:background .16s ease, transform .16s ease'
                )}
              >
                <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>
                  ▷
                </span>
                Start a nonprofit
              </Pressable>
              <div style={S('margin-top:12px;font:450 13px/1.45 Geist;color:#8A8179')}>Set up your project in minutes</div>
            </div>
            <div>
              <Pressable
                label="Join one"
                onClick={go('/onboarding?intent=join')}
                className={cx(H.secondaryLift, H.press)}
                style={S(
                  'display:flex;width:100%;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 20px;height:52px;border-radius:13px;border:1px solid #E4DDD4;background:#fff;color:#1A1714;font:600 16px/1 Geist;letter-spacing:-0.01em;cursor:pointer;box-shadow:0 1px 2px rgba(30,20,10,.06);transition:background .16s ease, border-color .16s ease, transform .16s ease'
                )}
              >
                Join one
              </Pressable>
              <div style={S('margin-top:12px;font:450 13px/1.45 Geist;color:#8A8179')}>Find openings ranked to your time</div>
            </div>
          </div>
          {trustRow ? (
            <div style={S('display:flex;align-items:center;gap:18px;margin-top:34px;font:450 13px/1.4 Geist;color:#8A8179')}>
              {['Free for students', 'Vetted organizations only', 'Ages 13+'].map((t) => (
                <div key={t} style={S('display:flex;align-items:center;gap:7px')}>
                  <span aria-hidden="true" style={S('color:#C2603C')}>
                    ✓
                  </span>
                  {t}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="vu-hero-art" style={S('position:relative;min-width:516px')}>
          <div style={S('border-radius:20px;overflow:hidden;background:#fff;border:1px solid #E8E1D9;box-shadow:0 50px 90px -50px rgba(70,45,28,.5), 0 2px 6px rgba(70,45,28,.06);transform:none')}>
            <div style={S('padding:12px 16px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;background:#FCFAF8')}>
              <div aria-hidden="true" style={S('display:flex;align-items:center;gap:8px')}>
                <div style={S('width:9px;height:9px;border-radius:50%;background:#E4DAD0')} />
                <div style={S('width:9px;height:9px;border-radius:50%;background:#E4DAD0')} />
                <div style={S('width:9px;height:9px;border-radius:50%;background:#E4DAD0')} />
              </div>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>volunteeru.app / my project</div>
              <div style={S('width:44px')} />
            </div>
            <div style={S('height:212px;position:relative')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PEXELS.outdoor} alt="Volunteers setting up outdoors" style={S('width:100%;height:100%;object-fit:cover;display:block')} />
              <div style={S('position:absolute;left:16px;bottom:14px;display:flex;align-items:center;gap:8px')}>
                <span style={S(`padding:5px 9px;border-radius:7px;background:rgba(255,255,255,.94);font:500 10px/1 ${MONO};color:#3F6B4E`)}>✓ VERIFIED SPONSOR</span>
                <span style={S(`padding:5px 9px;border-radius:7px;background:rgba(31,27,24,.82);font:500 10px/1 ${MONO};color:#fff`)}>SESSION 3 OF 8</span>
              </div>
            </div>
            <div style={S('padding:20px')}>
              <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
                <div>
                  <div style={S('font:600 19px/1.2 Geist;letter-spacing:-0.03em')}>Saturday Reading Circle</div>
                  <div style={S('margin-top:5px;font:450 13px/1.3 Geist;color:#8A8179')}>Indy Public Library, Branch 4 · Saturdays 10:00 AM</div>
                </div>
                <div style={S('text-align:right;flex:none')}>
                  <div style={S('font:600 22px/1 Geist;letter-spacing:-0.03em')}>
                    9<span style={S('font-size:12px;color:#8A8179')}> / 12</span>
                  </div>
                  <div style={S(`margin-top:5px;font:500 10px/1 ${MONO};color:#A9A097`)}>CREW</div>
                </div>
              </div>
              <div style={S('margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px')}>
                {[
                  { l: 'Verified hrs', v: '54', warm: false },
                  { l: 'Show rate', v: '92%', warm: false },
                  { l: 'To review', v: '4', warm: true },
                ].map((k) => (
                  <div key={k.l} style={s('padding:12px;border-radius:11px', `border:1px solid ${k.warm ? '#EFE3DC' : '#F1EBE4'}`, `background:${k.warm ? '#FAF6F3' : '#FCFAF8'}`)}>
                    <div style={S(`font:500 9px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>{k.l}</div>
                    <div style={s('margin-top:7px;font:600 17px/1 Geist;letter-spacing:-0.03em', k.warm ? 'color:#A8482A' : '')}>{k.v}</div>
                  </div>
                ))}
              </div>
              <div style={S('margin-top:16px;padding-top:16px;border-top:1px solid #F1EBE4')}>
                <div style={S('display:flex;align-items:center;justify-content:space-between')}>
                  <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Crew joining</div>
                  <div style={S(`font:500 10px/1 ${MONO};color:#3F6B4E`)}>4 TODAY</div>
                </div>
                <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px')}>
                  {CREW.map((c) => (
                    <div key={c.slot} style={S('display:flex;align-items:center;gap:10px')}>
                      <div style={S('width:24px;height:24px;border-radius:50%;overflow:hidden;flex:none')}>
                        <ImageSlot src={`https://picsum.photos/seed/${c.seed}/400/400?grayscale`} shape="circle" placeholder="face" />
                      </div>
                      <div style={S('font:500 12px/1 Geist;color:#332D28')}>{c.n}</div>
                      <div style={S('font:450 11px/1 Geist;color:#A9A097')}>{c.role}</div>
                      <div style={S(`margin-left:auto;font:500 10px/1 ${MONO};color:${c.c}`)}>{c.st}</div>
                    </div>
                  ))}
                </div>
                <div style={S('margin-top:14px;height:5px;border-radius:3px;background:#F1EBE4')}>
                  <div style={S('width:75%;height:100%;border-radius:3px;background:#C2603C')} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- proof strip ---- */}
      <div style={S('padding:26px 0 34px;border-top:1px solid #EFE9E2;border-bottom:1px solid #EFE9E2;background:#fff;background-image:repeating-linear-gradient(90deg,rgba(31,27,24,.02) 0 1px,transparent 1px 9px)')}>
        <div className="vu-pad-32 vu-stack vu-stack-gap" style={S('max-width:1180px;margin:0 auto;padding:0 32px 22px;display:flex;align-items:baseline;justify-content:space-between')}>
          <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Trusted by students &amp; organizations in 38 states</div>
          <div style={S('font:450 13px/1 Geist;color:#8A8179')}>1,940 partner organizations</div>
        </div>
        <div style={S('position:relative;overflow:hidden;padding:0')}>
          <div className="vu-4col vu-pad-32" style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1180px;margin:0 auto;padding:0 32px')}>
            {proofCards.map((p) => (
              <div key={p.slot} style={S('padding:20px;border-radius:14px;border:1px solid #EDE6DE;background:#FCFAF8')}>
                <div style={S('font:450 14px/1.5 Geist;color:#332D28;text-wrap:pretty')}>{p.quote}</div>
                <div style={S('margin-top:14px;display:flex;align-items:center;gap:10px')}>
                  <div style={S('width:28px;height:28px;border-radius:50%;overflow:hidden;flex:none')}>
                    <ImageSlot src={`https://picsum.photos/seed/${p.slot}/400/400?grayscale`} shape="circle" placeholder="face" />
                  </div>
                  <div style={S('font:500 12px/1.3 Geist;color:#57504A')}>{p.who}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- two ways in ---- */}
      <div className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:150px 32px 0')}>
        <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-end;justify-content:space-between;gap:48px')}>
          <div>
            <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#C2603C`)}>Two ways in</div>
            <h2 className="vu-h2-big" style={S('margin:16px 0 0;font:600 56px/1 Geist;letter-spacing:-0.05em;max-width:640px')}>
              Build one or join one
            </h2>
          </div>
          <p style={S('margin:0;max-width:320px;font:400 15px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>
            Same hub, same verified hours. The only question is how much you want to run.
          </p>
        </div>
        <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:40px')}>
          {paths.map((p) => (
            <div key={p.slot} className={H.card} style={S('border-radius:18px;border:1px solid #E8E1D9;background:#fff;padding:20px;display:flex;flex-direction:column;transition:border-color .16s ease')}>
              <div style={S('height:240px;border-radius:12px;overflow:hidden')}>
                <ImageSlot src={p.img} shape="rounded" radius={12} placeholder="photo" />
              </div>
              <div style={S(`margin-top:18px;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>{p.k}</div>
              <div style={S('margin-top:12px;font:600 26px/1.08 Geist;letter-spacing:-0.038em')}>{p.t}</div>
              <div style={S('margin-top:10px;font:450 15px/1.55 Geist;color:#6B635C;text-wrap:pretty')}>{p.b}</div>
              <div style={S('margin-top:18px;padding-top:16px;border-top:1px solid #F1EBE4;display:flex;flex-direction:column;gap:10px;flex:1')}>
                {p.rows.map((r) => (
                  <div key={r.t} style={S('display:flex;gap:10px;align-items:flex-start;font:450 14px/1.5 Geist;color:#332D28')}>
                    <span aria-hidden="true" style={S('color:#C2603C;font-size:11px;margin-top:3px')}>
                      ▪
                    </span>
                    {r.t}
                  </div>
                ))}
              </div>
              <Pressable
                label={p.cta}
                onClick={go(`/onboarding?intent=${p.goal === 'lead' ? 'start' : 'join'}`)}
                className={cx(H.primary, H.press)}
                style={S(
                  'margin-top:20px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:44px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:background .16s ease'
                )}
              >
                <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>
                  ▷
                </span>
                {p.cta}
              </Pressable>
            </div>
          ))}
        </div>
      </div>

      {/* ---- 01 volunteering ---- */}
      <div id="how-it-works" style={S('border-top:1px solid #EFE9E2;margin-top:150px')}>
        <div className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:190px 32px 200px')}>
          <div style={S('display:flex;align-items:baseline;gap:18px')}>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#C2603C`)}>01</div>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#A9A097`)}>Volunteering</div>
          </div>
          <h2 className="vu-h2-big" style={S('margin:28px 0 0;font:600 116px/.92 Geist;letter-spacing:-0.06em;max-width:900px')}>
            Join in a minute
          </h2>
          <p style={S('margin:28px 0 0;max-width:560px;font:400 20px/1.55 Geist;color:#57504A;text-wrap:pretty')}>
            Accredited institutions and student organizations in one feed, ranked to your causes, your radius and the hours you still need. One
            application, then you show up and the hours count themselves.
          </p>

          <div style={S('margin-top:64px;border-radius:20px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
            <div style={S('padding:20px 26px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;background:#FCFAF8')}>
              <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Matches near you</div>
              <div style={S('display:flex;gap:8px')}>
                <span style={S('padding:7px 11px;border-radius:8px;background:#1F1B18;color:#fff;font:500 12px/1 Geist')}>All causes</span>
                <span style={S('padding:7px 11px;border-radius:8px;border:1px solid #E8E1D9;background:#fff;color:#57504A;font:500 12px/1 Geist')}>Sat afternoon</span>
                <span style={S('padding:7px 11px;border-radius:8px;border:1px solid #E8E1D9;background:#fff;color:#57504A;font:500 12px/1 Geist')}>Under 5 mi</span>
              </div>
            </div>
            {matches.map((m) => (
              <Pressable
                key={m.id}
                label={`${m.title} at ${m.org}`}
                onClick={go('/signup')}
                className={cx(H.row, H.press)}
                style={S('padding:22px 26px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:24px;cursor:pointer;transition:background .16s ease')}
              >
                <div style={S('display:flex;align-items:center;gap:16px')}>
                  <div style={S('width:56px;height:56px;border-radius:12px;overflow:hidden;flex:none')}>
                    <ImageSlot src={m.img} shape="rounded" radius={12} placeholder="photo" />
                  </div>
                  <div>
                    <div style={S('display:flex;align-items:center;gap:9px')}>
                      <div style={S('font:600 19px/1.2 Geist;letter-spacing:-0.028em')}>{m.title}</div>
                      <span style={S(`padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>✓ VERIFIED</span>
                    </div>
                    <div style={S('margin-top:7px;font:450 14px/1.3 Geist;color:#8A8179')}>
                      {m.org} · {m.meta} · {m.hrs}
                    </div>
                  </div>
                </div>
                <div style={S('display:flex;align-items:center;gap:16px;flex:none')}>
                  <div style={S('text-align:right')}>
                    <div style={S('font:600 18px/1 Geist;letter-spacing:-0.03em;color:#A8482A')}>{m.score}%</div>
                    <div style={S(`margin-top:5px;font:500 10px/1 ${MONO};color:#A9A097`)}>MATCH</div>
                  </div>
                  <span style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:44px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist')}>
                    <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>
                      ▷
                    </span>
                    Apply
                  </span>
                </div>
              </Pressable>
            ))}
          </div>

          <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:72px;border-top:1px solid #E8E1D9')}>
            {[
              { n: '01', t: 'Verified or student led', b: 'A green check means we confirmed registration, insurance and a named staff contact. Student projects show the lead and the sponsor behind them.', pad: 'padding:36px 32px 0 0;border-right:1px solid #E8E1D9' },
              { n: '02', t: 'One application', b: 'Your record, availability and causes are already attached. Pick a role, pick a shift, send.', pad: 'padding:36px 32px 0;border-right:1px solid #E8E1D9' },
              { n: '03', t: 'Hours count themselves', b: 'Check in on arrival. The organizer confirms attendance and the hours post to your record that day.', pad: 'padding:36px 0 0 32px' },
            ].map((c) => (
              <div key={c.n} style={S(c.pad)}>
                <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;color:#C2603C`)}>{c.n}</div>
                <div style={S('margin-top:20px;font:600 30px/1.08 Geist;letter-spacing:-0.04em')}>{c.t}</div>
                <div style={S('margin-top:12px;max-width:300px;font:450 16px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>{c.b}</div>
              </div>
            ))}
          </div>

          <div style={S('margin-top:56px')}>
            <Pressable
              label="Browse openings near me"
              onClick={go('/discover')}
              className={cx(H.press)}
              style={S(
                'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 26px;height:50px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 16px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55);transition:background .16s ease, transform .16s ease'
              )}
            >
              <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>
                ▷
              </span>
              Browse openings near me
            </Pressable>
          </div>
        </div>
      </div>

      {/* ---- 02 starting your own ---- */}
      <div style={S('border-top:1px solid #EFE9E2;background:#fff')}>
        <div className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:190px 32px 200px')}>
          <div style={S('display:flex;align-items:baseline;gap:18px')}>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#C2603C`)}>02</div>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#A9A097`)}>Starting your own</div>
          </div>
          <h2 className="vu-h2-big" style={S('margin:28px 0 0;font:600 116px/.92 Geist;letter-spacing:-0.06em;max-width:940px')}>
            Build the whole thing
          </h2>
          <p style={S('margin:28px 0 0;max-width:560px;font:400 20px/1.55 Geist;color:#57504A;text-wrap:pretty')}>
            Set it up under a verified sponsor, open positions, recruit a crew from schools nearby, take attendance and post verified hours. The admin an
            adult nonprofit needs, in one workspace built for a student.
          </p>

          <div className="vu-4col" style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:64px;border-top:1px solid #E8E1D9')}>
            {timeline.map((t) => (
              <div key={t.d} style={S('padding:32px 28px 36px 0;border-right:1px solid #E8E1D9;position:relative')}>
                <div aria-hidden="true" style={S('position:absolute;top:-6px;left:0;width:11px;height:11px;border-radius:50%;background:#C2603C')} />
                <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#C2603C`)}>{t.d}</div>
                <div style={S('margin-top:18px;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>{t.t}</div>
                <div style={S('margin-top:12px;font:450 15px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>{t.b}</div>
              </div>
            ))}
          </div>

          {/* step one */}
          <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:72px;align-items:center')}>
            <div>
              <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#C2603C`)}>Step one</div>
              <div className="vu-h2" style={S('margin-top:16px;font:600 36px/1.06 Geist;letter-spacing:-0.045em')}>
                Run under a real sponsor
              </div>
              <p style={S('margin:14px 0 0;max-width:420px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
                You do not need a 501(c)(3) or a lawyer. Name the organization that supervises your project — a school, library or nonprofit — use the safety
                templates they already accept, and request a verified badge when you are set up.
              </p>
              <div style={S('margin-top:24px;display:flex;flex-direction:column;gap:11px')}>
                {['Safety plan and waiver templates they already accept', 'A named staff contact on every session', 'Their verified badge on your project page'].map((t) => (
                  <div key={t} style={S('display:flex;gap:10px;align-items:flex-start;font:450 15px/1.5 Geist;color:#332D28')}>
                    <span aria-hidden="true" style={S('color:#C2603C;font-size:11px;margin-top:4px')}>
                      ▪
                    </span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#FCFAF8;overflow:hidden')}>
              <div style={S('padding:16px 22px;border-bottom:1px solid #F1EBE4;background:#fff;display:flex;align-items:center;justify-content:space-between')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Verified organizations</div>
                <div style={S(`font:500 11px/1 ${MONO};color:#3F6B4E`)}>✓ VERIFIED</div>
              </div>
              {sponsorMatches.map((sp) => (
                <div key={sp.slug} style={S('padding:18px 22px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fff')}>
                  <div style={S('display:flex;align-items:center;gap:13px')}>
                    <div style={S('width:40px;height:40px;border-radius:11px;overflow:hidden;flex:none')}>
                      <ImageSlot src={`https://picsum.photos/seed/${sp.slug}/400/400?grayscale`} shape="rounded" radius={11} placeholder="logo" />
                    </div>
                    <div>
                      <div style={S('font:500 15px/1.2 Geist')}>
                        {sp.n}{' '}
                        <span aria-label="verified" style={S('color:#3F6B4E')}>
                          ✓
                        </span>
                      </div>
                      <div style={S('margin-top:5px;font:450 12px/1.2 Geist;color:#8A8179')}>{sp.m}</div>
                    </div>
                  </div>
                  <span style={S(`padding:6px 10px;border-radius:7px;background:${sp.stBg};font:500 11px/1 ${MONO};color:${sp.stColor};flex:none`)}>{sp.st}</span>
                </div>
              ))}
            </div>
          </div>

          {/* step two */}
          <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:72px;align-items:center')}>
            <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
              <div style={S(`padding:16px 22px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>
                Your recruiting page
              </div>
              <div style={S('padding:22px')}>
                <div style={S('height:150px;border-radius:12px;overflow:hidden')}>
                  <ImageSlot src={PEXELS.reading} shape="rounded" radius={12} placeholder="cover" />
                </div>
                <div style={S('margin-top:16px;font:600 20px/1.2 Geist;letter-spacing:-0.03em')}>Saturday Reading Circle</div>
                <div style={S('margin-top:6px;font:450 13px/1.4 Geist;color:#8A8179')}>Led by Eli F. · sponsored by Indy Public Library ✓</div>
                <div style={S('margin-top:16px;display:flex;gap:8px;flex-wrap:wrap')}>
                  <span style={S(`padding:6px 10px;border-radius:8px;background:#F6F2EE;font:500 11px/1 ${MONO};color:#57504A`)}>TUTOR · 3 OPEN</span>
                  <span style={S(`padding:6px 10px;border-radius:8px;background:#F6F2EE;font:500 11px/1 ${MONO};color:#57504A`)}>PHOTOS · 1 OPEN</span>
                  <span style={S(`padding:6px 10px;border-radius:8px;background:#F5E7E0;font:500 11px/1 ${MONO};color:#A8482A`)}>2 HRS WEEKLY</span>
                </div>
                <Pressable
                  label="Browse openings like this"
                  onClick={go('/discover')}
                  className={cx(H.primary, H.press)}
                  style={S(
                    'margin-top:18px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:44px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer;transition:background .16s ease'
                  )}
                >
                  <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>
                    ▷
                  </span>
                  Browse openings
                </Pressable>
              </div>
            </div>
            <div>
              <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#C2603C`)}>Step two</div>
              <div className="vu-h2" style={S('margin-top:16px;font:600 36px/1.06 Geist;letter-spacing:-0.045em')}>
                The crew comes to you
              </div>
              <p style={S('margin:14px 0 0;max-width:420px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
                Publishing gives you a page in the feed of every eligible student nearby, plus one link for a group chat or a story. No begging, no chasing.
              </p>
              <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:28px;max-width:440px')}>
                {shareStats.map((st) => (
                  <div key={st.v}>
                    <div style={S('font:600 32px/1 Geist;letter-spacing:-0.045em')}>{st.v}</div>
                    <div style={S('margin-top:9px;font:450 13px/1.45 Geist;color:#6B635C;text-wrap:pretty')}>{st.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* step three */}
          <div style={S('margin-top:72px;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden')}>
            <div style={S('padding:20px 26px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between')}>
              <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Step three · the workspace</div>
              <div style={S('display:flex;gap:8px')}>
                <span style={S('padding:7px 11px;border-radius:8px;background:#1F1B18;color:#fff;font:500 12px/1 Geist')}>Applications</span>
                <span style={S('padding:7px 11px;border-radius:8px;border:1px solid #E8E1D9;background:#fff;color:#57504A;font:500 12px/1 Geist')}>Attendance</span>
              </div>
            </div>
            <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr')}>
              <div style={S('border-right:1px solid #F1EBE4')}>
                <div style={S('padding:16px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between')}>
                  <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Waiting on you</div>
                  <div style={S(`font:500 11px/1 ${MONO};color:#C2603C`)}>4</div>
                </div>
                {WAITING.map((a) => (
                  <div key={a.slug} style={S('padding:16px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:14px')}>
                    <div style={S('display:flex;align-items:center;gap:12px')}>
                      <div style={S('width:34px;height:34px;border-radius:50%;overflow:hidden;flex:none')}>
                        <ImageSlot src={`https://picsum.photos/seed/${a.slug}/400/400?grayscale`} shape="circle" placeholder="face" />
                      </div>
                      <div>
                        <div style={S('font:500 14px/1.2 Geist')}>{a.n}</div>
                        <div style={S('margin-top:4px;font:450 12px/1.2 Geist;color:#8A8179')}>
                          {a.role} · {a.when}
                        </div>
                      </div>
                    </div>
                    <div style={S('display:flex;gap:7px;flex:none')}>
                      <span style={S('padding:8px 12px;border-radius:9px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 12px/1 Geist')}>Accept</span>
                      <span style={S('padding:8px 12px;border-radius:9px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#57504A')}>Later</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={S('padding:16px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between')}>
                  <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Attendance · Sat, Jul 19</div>
                  <div style={S(`font:500 11px/1 ${MONO};color:#3F6B4E`)}>POSTED</div>
                </div>
                {ATTEND.map((a) => (
                  <div key={a.n} style={S('padding:14px 24px;border-bottom:1px solid #F1EBE4;display:grid;grid-template-columns:1.5fr .9fr .5fr 1fr;gap:10px;align-items:center')}>
                    <div style={S('font:500 13px/1 Geist')}>{a.n}</div>
                    <div>
                      <span style={S(`padding:4px 8px;border-radius:6px;background:${a.stBg};font:500 10px/1 ${MONO};color:${a.stColor}`)}>{a.st}</span>
                    </div>
                    <div style={S(`font:500 12px/1 ${MONO}`)}>{a.hrs}</div>
                    <div>
                      <span style={S(`padding:4px 8px;border-radius:6px;background:${a.gBg};font:500 10px/1 ${MONO};color:${a.gColor}`)}>{a.grade}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="vu-4col" style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:56px')}>
            {allInOne.map((a) => (
              <div key={a.k} style={S('padding:28px;border-radius:16px;background:#FCFAF8;border:1px solid #F1EBE4')}>
                <div style={S(`font:500 11px/1 ${MONO};color:#C2603C`)}>{a.k}</div>
                <div style={S('margin-top:20px;font:600 22px/1.12 Geist;letter-spacing:-0.032em')}>{a.t}</div>
                <div style={S('margin-top:11px;font:450 15px/1.55 Geist;color:#6B635C;text-wrap:pretty')}>{a.b}</div>
              </div>
            ))}
          </div>

          <div style={S('margin-top:56px')}>
            <Pressable
              label="Start an organization"
              onClick={go('/onboarding?intent=start')}
              className={H.press}
              style={S(
                'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 26px;height:50px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 16px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55);transition:background .16s ease, transform .16s ease'
              )}
            >
              <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>
                ▷
              </span>
              Start an organization
            </Pressable>
          </div>
        </div>
      </div>

      {/* ---- the painful part ---- */}
      <div style={S('border-top:1px solid #EFE9E2;margin-top:130px')}>
        <div className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:130px 32px 0')}>
          <div style={S('text-align:center')}>
            <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>The painful part</div>
            <h2 className="vu-h2-big" style={S('margin:16px auto 0;max-width:640px;font:600 52px/1.02 Geist;letter-spacing:-0.05em')}>
              The same project, two ways
            </h2>
            <p style={S('margin:18px auto 0;max-width:520px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Everything below is work a student normally eats alone. Left is what it costs you. Right is what we already handle.
            </p>
          </div>
          <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:56px;text-align:left')}>
            <div style={S('padding:34px;border-radius:18px;border:1px solid #E8E1D9;background:#FCFAF8')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A19891`)}>Doing it yourself</div>
              <div style={S('margin-top:18px;font:600 30px/1.06 Geist;letter-spacing:-0.04em;color:#57504A')}>A semester of admin</div>
              <div style={S('margin-top:26px;display:flex;flex-direction:column')}>
                {effortAlone.map((e) => (
                  <div key={e.l} style={S('padding:16px 0;border-top:1px solid #EEE7DF;display:flex;gap:18px;align-items:baseline')}>
                    <div style={S('width:120px;flex:none;font:600 26px/1 Geist;letter-spacing:-0.04em;color:#A19891')}>{e.v}</div>
                    <div style={S('font:450 14px/1.5 Geist;color:#8A8179')}>{e.l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={S('padding:34px;border-radius:18px;border:1px solid #EFE3DC;background:#fff')}>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#C2603C`)}>On VolunteerU</div>
              <div style={S('margin-top:18px;font:600 30px/1.06 Geist;letter-spacing:-0.04em')}>One sitting, then a week</div>
              <div style={S('margin-top:26px;display:flex;flex-direction:column')}>
                {effortWith.map((e) => (
                  <div key={e.l} style={S('padding:16px 0;border-top:1px solid #F1EBE4;display:flex;gap:18px;align-items:baseline')}>
                    <div style={S('width:120px;flex:none;font:600 26px/1 Geist;letter-spacing:-0.04em;color:#C2603C')}>{e.v}</div>
                    <div style={S('font:450 14px/1.5 Geist;color:#332D28')}>{e.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={S('margin-top:44px;border-radius:18px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
            <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr')}>
              <div style={S(`padding:18px 24px;border-right:1px solid #F1EBE4;border-bottom:1px solid #F1EBE4;background:#FCFAF8;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>
                On your own
              </div>
              <div style={S(`padding:18px 24px;border-bottom:1px solid #F1EBE4;background:#FAF6F3;font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#C2603C`)}>
                With VolunteerU
              </div>
            </div>
            {aloneRows.map((r) => (
              <div key={r.a} className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #F1EBE4')}>
                <div style={S('padding:18px 24px;border-right:1px solid #F1EBE4;font:450 15px/1.45 Geist;color:#A19891')}>{r.a}</div>
                <div style={S('padding:18px 24px;font:500 15px/1.45 Geist;color:#1A1714')}>{r.b}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- questions ---- */}
      <div className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:96px 32px 0')}>
        <div className="vu-split" style={S('display:grid;grid-template-columns:300px 1fr;gap:56px')}>
          <h2 className="vu-h2" style={S('margin:0;font:600 40px/1.02 Geist;letter-spacing:-0.05em')}>
            Questions
          </h2>
          <div className="vu-2col" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
            {faqs.map((f) => (
              <div key={f.q} className={H.card} style={S('padding:24px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;transition:border-color .16s ease')}>
                <div style={S('font:600 17px/1.25 Geist;letter-spacing:-0.025em')}>{f.q}</div>
                <div style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- final CTA ---- */}
      <div className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:96px 32px')}>
        <div
          style={S(
            'position:relative;border-radius:26px;border:1px solid #EDE6DE;background:linear-gradient(180deg,#FFFFFF,#FBF7F4);background-image:repeating-linear-gradient(135deg,rgba(31,27,24,.018) 0 1px,transparent 1px 7px);padding:64px 48px;text-align:center;overflow:hidden;box-shadow:0 40px 80px -60px rgba(70,45,28,.5)'
          )}
        >
          <div
            aria-hidden="true"
            style={S('position:absolute;bottom:-200px;left:50%;transform:translateX(-50%);width:700px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(210,119,91,.18),rgba(210,119,91,0) 65%)')}
          />
          <div style={S('position:relative')}>
            <h2 className="vu-h2" style={S('margin:0;font:600 46px/1.06 Geist;letter-spacing:-0.045em;text-wrap:balance')}>
              Tell us who you are.
              <br />
              We will show you how to help.
            </h2>
            <p style={S('margin:18px auto 0;max-width:470px;font:400 17px/1.6 Geist;color:#57504A')}>
              Two minutes to set up. Your first match before you close the tab.
            </p>
            <div style={S('display:flex;gap:12px;justify-content:center;margin-top:30px')}>
              <Pressable
                label="Create my profile"
                onClick={go('/onboarding')}
                className={cx(H.primaryLift, H.press)}
                style={S(
                  'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 26px;height:46px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;letter-spacing:-0.01em;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(80,30,12,.22), 0 10px 20px -8px rgba(150,60,30,.55);transition:transform .16s ease, box-shadow .16s ease, background .16s ease'
                )}
              >
                <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>
                  ▷
                </span>
                Create my profile
              </Pressable>
              <Pressable
                label="For counselors"
                onClick={go('/schools?for=counselors')}
                className={cx(H.secondaryLift, H.press)}
                style={S(
                  'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 22px;height:46px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;color:#1A1714;font:600 15px/1 Geist;cursor:pointer;box-shadow:0 1px 2px rgba(30,20,10,.06);transition:background .16s ease, border-color .16s ease, transform .16s ease'
                )}
              >
                For counselors
              </Pressable>
            </div>
          </div>
        </div>
      </div>

      <MarketingFooter />
    </div>
  );
}
