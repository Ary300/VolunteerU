'use client';

/* ==========================================================================
   Landing.jsx — design screen: `isLanding`
   Transcribed 1:1 from `VolunteerU Design.dc.html`; the design's dead links and
   inert CTAs are the only things that changed, and only to gain destinations.
   ========================================================================== */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Avatar, Pressable } from '../ui.jsx';
import { MarketingHeader, MarketingFooter } from '../Marketing.jsx';
import { useSnapshot } from '../../lib/store.js';
import {
  proofCards, paths, timeline, sponsorMatches, shareStats, allInOne,
  faqs, PEXELS,
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

/* A plain, standard FAQ accordion. One row open at a time. */
function Faq({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div style={S('border-top:1px solid #E8E1D9')}>
      {items.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q} style={S('border-bottom:1px solid #E8E1D9')}>
            <button
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? -1 : i)}
              className={H.press}
              style={S('display:flex;width:100%;align-items:center;justify-content:space-between;gap:24px;padding:24px 6px;background:none;border:0;cursor:pointer;text-align:left')}
            >
              <span style={S('font:600 20px/1.3 Geist;letter-spacing:-0.025em;color:#1A1714')}>{f.q}</span>
              <span aria-hidden="true" style={s('font:400 22px/1 Geist;color:#C2603C;flex:none;transition:transform .2s ease', on ? 'transform:rotate(45deg)' : '')}>+</span>
            </button>
            <div style={s('overflow:hidden;transition:max-height .24s ease', on ? 'max-height:260px' : 'max-height:0')}>
              <div style={S('padding:0 6px 26px;font:450 16px/1.65 Geist;color:#57504A;max-width:720px;text-wrap:pretty')}>{f.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
          <p style={S('margin:22px 0 0;max-width:468px;font:400 18px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
            Find real openings near you, or run your own project. Either way, your hours verify themselves and land on a record colleges can check.
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
            {proofCards.map((p, i) => (
              <div key={p.slot} style={S('padding:24px 22px;border-radius:16px;border:1px solid #EDE6DE;background:#FCFAF8;display:flex;flex-direction:column')}>
                <div aria-hidden="true" style={S('font:600 30px/0.7 Geist;color:#E0C4B6;height:16px')}>&ldquo;</div>
                <div style={S('margin-top:10px;font:450 15px/1.55 Geist;color:#332D28;text-wrap:pretty;flex:1')}>{p.quote}</div>
                <div style={S('margin-top:18px;display:flex;align-items:center;gap:10px')}>
                  <div style={S('width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none')}>
                    <ImageSlot src={`https://i.pravatar.cc/120?img=${[13, 32, 45, 5][i] || 1}`} shape="circle" placeholder="face" />
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
        <div style={S('text-align:center;max-width:680px;margin:0 auto')}>
          <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#C2603C`)}>Two ways in</div>
          <h2 className="vu-h2-big" style={S('margin:16px 0 0;font:600 56px/1 Geist;letter-spacing:-0.05em')}>
            Build one or join one
          </h2>
          <p style={S('margin:16px auto 0;max-width:440px;font:400 17px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>
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

          <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:72px')}>
            {[
              { n: '01', t: 'Find your fit', b: 'Nonprofits and student projects in one feed, ranked to your causes, radius and free time.' },
              { n: '02', t: 'One application', b: 'Your record, availability and causes are already attached. Pick a role, pick a shift, send.' },
              { n: '03', t: 'Hours count themselves', b: 'Check in on arrival. The organizer confirms attendance and the hours post to your record that day.' },
            ].map((c) => (
              <div key={c.n} style={S('padding:30px 28px;border-radius:18px;background:#FCFAF8;border:1px solid #F1EBE4')}>
                <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;color:#C2603C`)}>{c.n}</div>
                <div style={S('margin-top:18px;font:600 27px/1.08 Geist;letter-spacing:-0.04em')}>{c.t}</div>
                <div style={S('margin-top:12px;font:450 16px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>{c.b}</div>
              </div>
            ))}
          </div>

          {/* volunteer record demo */}
          <div style={S('max-width:620px;margin:150px auto 0;text-align:center')}>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#C2603C`)}>Your record</div>
            <h3 style={S('margin:16px 0 0;font:600 44px/1.04 Geist;letter-spacing:-0.04em')}>Watch it add up</h3>
            <p style={S('margin:16px auto 0;max-width:480px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Every verified hour lands on one record that builds over the year, ready the moment a college or scholarship asks.
            </p>
          </div>
          <div style={S('margin-top:60px;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
            <div style={S('padding:20px 26px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between')}>
              <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Verified record · 2025 to 26</div>
              <div style={S(`font:500 11px/1 ${MONO};color:#3F6B4E`)}>✓ CONFIRMED BY ORGS</div>
            </div>
            <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1.2fr 1fr')}>
              <div style={S('padding:28px 30px;border-right:1px solid #F1EBE4')}>
                <div style={S('display:flex;align-items:baseline;gap:10px')}>
                  <div style={S('font:600 46px/1 Geist;letter-spacing:-0.04em')}>54</div>
                  <div style={S('font:450 14px/1 Geist;color:#8A8179')}>verified hours</div>
                  <div style={S(`margin-left:auto;font:500 11px/1 ${MONO};color:#3F6B4E`)}>+8 this month</div>
                </div>
                <div style={S('margin-top:26px;display:flex;align-items:flex-end;gap:14px;height:150px')}>
                  {[{ m: 'Sep', h: 34 }, { m: 'Oct', h: 55 }, { m: 'Nov', h: 44 }, { m: 'Dec', h: 72 }, { m: 'Jan', h: 64 }, { m: 'Feb', h: 92 }].map((b, i, arr) => (
                    <div key={b.m} style={S('flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end')}>
                      <div style={s('width:100%;border-radius:7px 7px 3px 3px', `height:${b.h}%`, `background:${i === arr.length - 1 ? 'linear-gradient(180deg,#D2775B,#C2603C)' : '#EFE3DC'}`)} />
                      <div style={S(`font:500 10px/1 ${MONO};color:#A9A097`)}>{b.m}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={S('padding:16px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between')}>
                  <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Recent</div>
                  <div style={S(`font:500 11px/1 ${MONO};color:#A9A097`)}>THIS TERM</div>
                </div>
                {[
                  { org: 'San Diego Food Bank', d: 'Feb 8', hrs: '3.0' },
                  { org: 'Ocean Beach Cleanup', d: 'Feb 1', hrs: '2.5' },
                  { org: 'Senior Tech Buddies', d: 'Jan 25', hrs: '1.5' },
                  { org: 'Little Library Helpers', d: 'Jan 18', hrs: '2.0' },
                ].map((e) => (
                  <div key={e.org} style={S('padding:14px 24px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                    <div style={S('min-width:0')}>
                      <div className="vu-trunc" style={S('font:500 13px/1.3 Geist;color:#1A1714')}>{e.org}</div>
                      <div style={S('margin-top:3px;font:450 11px/1 Geist;color:#8A8179')}>{e.d}</div>
                    </div>
                    <div style={S('display:flex;align-items:center;gap:8px;flex:none')}>
                      <span style={S(`font:600 14px/1 ${MONO};color:#1A1714`)}>{e.hrs}</span>
                      <span aria-hidden="true" style={S('color:#3F6B4E;font-size:12px')}>✓</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={S('margin-top:64px;display:flex;justify-content:center')}>
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
            Build your own
          </h2>
          <p style={S('margin:28px 0 0;max-width:600px;font:400 20px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
            You can also build, recruit and run your own nonprofit. Open positions, bring on a crew from schools nearby, take attendance, and post verified hours, all in one workspace built for a student.
          </p>

          <div className="vu-4col" style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:64px')}>
            {timeline.map((t) => (
              <div key={t.d} style={S('padding:30px 26px;border-radius:18px;background:#FCFAF8;border:1px solid #F1EBE4')}>
                <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#C2603C`)}>{t.d}</div>
                <div style={S('margin-top:16px;font:600 24px/1.12 Geist;letter-spacing:-0.035em')}>{t.t}</div>
                <div style={S('margin-top:11px;font:450 15px/1.6 Geist;color:#6B635C;text-wrap:pretty')}>{t.b}</div>
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
              <p style={S('margin:14px 0 0;max-width:420px;font:400 17px/1.65 Geist;color:#57504A;text-wrap:pretty')}>
                You do not need a 501(c)(3) or a lawyer. Name the organization that supervises your project, like a school, library or nonprofit. Use the safety templates they already accept, then request a verified badge when you are set up.
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
                <div
                  aria-hidden="true"
                  style={S(
                    'margin-top:18px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:44px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist'
                  )}
                >
                  <span style={S('font-size:11px;opacity:.9')}>▷</span>
                  Apply to join
                </div>
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
        </div>
      </div>

      {/* ---- the workspace (distinct white band) ---- */}
      <div style={S('background:#fff;border-top:1px solid #EFE9E2')}>
        <div className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:160px 32px 170px')}>
          <div style={S('text-align:center;max-width:660px;margin:0 auto')}>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#C2603C`)}>The workspace</div>
            <h2 className="vu-h2-big" style={S('margin:22px 0 0;font:600 60px/1.02 Geist;letter-spacing:-0.045em')}>
              Fully manage everything
            </h2>
            <p style={S('margin:20px auto 0;max-width:520px;font:400 19px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Applications, roster, attendance and verified hours in one place. Accept a volunteer, take attendance, and their hours post to every record the same day.
            </p>
          </div>

          {/* step three: applications + attendance */}
          <div style={S('margin-top:64px;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
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
                      <span style={S('padding:8px 12px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C')}>Later</span>
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


          {/* task board */}
          <div style={S('max-width:620px;margin:190px auto 0;text-align:center')}>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#C2603C`)}>Task board</div>
            <h3 style={S('margin:16px 0 0;font:600 44px/1.04 Geist;letter-spacing:-0.04em')}>Assign the work</h3>
            <p style={S('margin:16px auto 0;max-width:480px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              Set roles with a short briefing, then drop tasks on people. Everyone sees what they own and what is left.
            </p>
          </div>
          <div style={S('margin-top:60px;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
            <div style={S('padding:20px 26px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between')}>
              <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Fall Fundraiser · task board</div>
              <div style={S(`font:500 11px/1 ${MONO};color:#3F6B4E`)}>6 tasks · 3 roles</div>
            </div>
            <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr)')}>
              {[
                { name: 'Tutoring', color: '#5B6BB0', brief: 'Run the reading sessions', tasks: [
                  { t: 'Prep the week 3 worksheets', who: 'Maya R.', st: 'Doing', bg: '#FDF3E7', c: '#8A5A20' },
                  { t: 'Pair up the new tutors', who: 'You', st: 'Done', bg: '#EAF3EC', c: '#3F6B4E' },
                ] },
                { name: 'Outreach', color: '#C2603C', brief: 'Recruit and post', tasks: [
                  { t: 'Post to three school pages', who: 'Deven A.', st: 'Doing', bg: '#FDF3E7', c: '#8A5A20' },
                  { t: 'Email the library contact', who: 'Sofia K.', st: 'To do', bg: '#F6F2EE', c: '#57504A' },
                ] },
                { name: 'Photos', color: '#3F6B4E', brief: 'Capture the day', tasks: [
                  { t: 'Shoot Saturday session', who: 'Theo M.', st: 'To do', bg: '#F6F2EE', c: '#57504A' },
                  { t: 'Upload to the shared drive', who: 'Theo M.', st: 'Done', bg: '#EAF3EC', c: '#3F6B4E' },
                ] },
              ].map((role, i) => (
                <div key={role.name} style={S(`padding:28px 22px 44px${i < 2 ? ';border-right:1px solid #F1EBE4' : ''}`)}>
                  <div style={S('display:flex;align-items:center;gap:9px')}>
                    <span aria-hidden="true" style={s('width:8px;height:8px;border-radius:50%;flex:none', `background:${role.color}`)} />
                    <div style={S('font:600 15px/1 Geist')}>{role.name}</div>
                    <div style={S(`margin-left:auto;font:500 11px/1 ${MONO};color:#A9A097`)}>{role.tasks.length}</div>
                  </div>
                  <div style={S('margin-top:8px;font:450 12px/1.4 Geist;color:#8A8179')}>{role.brief}</div>
                  <div style={S('margin-top:18px;display:flex;flex-direction:column;gap:14px')}>
                    {role.tasks.map((t) => (
                      <div key={t.t} style={S('padding:20px 18px;border-radius:14px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                        <div style={S('font:500 14px/1.35 Geist;color:#1A1714')}>{t.t}</div>
                        <div style={S('margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:8px')}>
                          <div style={S('display:flex;align-items:center;gap:7px;min-width:0')}>
                            <div style={S('width:20px;height:20px;border-radius:50%;overflow:hidden;flex:none')}>
                              <Avatar name={t.who} fs={9} />
                            </div>
                            <div className="vu-trunc" style={S('font:450 11px/1 Geist;color:#8A8179')}>{t.who}</div>
                          </div>
                          <span style={S(`padding:3px 8px;border-radius:6px;background:${t.bg};font:500 10px/1 ${MONO};color:${t.c};flex:none`)}>{t.st}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* messaging */}
          <div style={S('max-width:620px;margin:190px auto 0;text-align:center')}>
            <div style={S(`font:500 12px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#C2603C`)}>Messaging</div>
            <h3 style={S('margin:16px 0 0;font:600 44px/1.04 Geist;letter-spacing:-0.04em')}>Keep everyone in the loop</h3>
            <p style={S('margin:16px auto 0;max-width:480px;font:400 17px/1.6 Geist;color:#57504A;text-wrap:pretty')}>
              One thread for the whole crew, plus a direct message with any applicant. No group chats to wrangle.
            </p>
          </div>
          <div style={S('margin-top:60px;max-width:760px;margin-left:auto;margin-right:auto;border-radius:20px;border:1px solid #E8E1D9;overflow:hidden;background:#fff')}>
            <div style={S('padding:18px 24px;border-bottom:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:space-between')}>
              <div style={S('font:600 15px/1 Geist')}>Crew announcements</div>
              <div style={S(`font:500 11px/1 ${MONO};color:#A9A097`)}>12 members</div>
            </div>
            <div style={S('padding:26px 24px;display:flex;flex-direction:column;gap:16px;background:#FCFAF8')}>
              {[
                { who: 'Maya R.', text: 'Rooms are booked for all four Saturdays.', w: '9:14 AM' },
                { you: true, text: 'Amazing. I just posted the sign-up link under Outreach.', w: '9:16 AM' },
                { who: 'Deven A.', text: 'Two new tutors applied overnight. Want me to accept them?', w: '9:20 AM' },
                { you: true, text: 'Yes, accept both and add them to the Tutoring role.', w: '9:21 AM' },
              ].map((m, i) => (m.you ? (
                <div key={i} style={S('align-self:flex-end;max-width:74%')}>
                  <div style={S('padding:12px 16px;border-radius:16px 16px 4px 16px;background:linear-gradient(180deg,#D2775B,#C2603C);color:#fff;font:450 14px/1.45 Geist')}>{m.text}</div>
                  <div style={S('margin-top:5px;text-align:right;font:450 11px/1 Geist;color:#A9A097')}>You · {m.w}</div>
                </div>
              ) : (
                <div key={i} style={S('align-self:flex-start;max-width:74%;display:flex;gap:10px')}>
                  <div style={S('width:28px;height:28px;border-radius:50%;overflow:hidden;flex:none')}>
                    <Avatar name={m.who} fs={11} />
                  </div>
                  <div>
                    <div style={S('padding:12px 16px;border-radius:16px 16px 16px 4px;background:#fff;border:1px solid #EDE6DE;font:450 14px/1.45 Geist;color:#332D28')}>{m.text}</div>
                    <div style={S('margin-top:5px;font:450 11px/1 Geist;color:#A9A097')}>{m.who} · {m.w}</div>
                  </div>
                </div>
              )))}
            </div>
            <div style={S('padding:14px 18px;border-top:1px solid #F1EBE4;display:flex;align-items:center;gap:10px;background:#fff')}>
              <div style={S('flex:1;padding:11px 14px;border-radius:10px;border:1px solid #E4DDD4;font:450 14px/1 Geist;color:#A9A097')}>Message the crew</div>
              <div aria-hidden="true" style={S('display:flex;align-items:center;padding:0 18px;height:40px;border-radius:10px;background:linear-gradient(180deg,#D2775B,#C2603C);color:#fff;font:600 13px/1 Geist')}>Send</div>
            </div>
          </div>

          <div style={S('margin-top:64px;display:flex;justify-content:center')}>
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

      {/* ---- questions ---- */}
      <div className="vu-pad-32" style={S('max-width:860px;margin:0 auto;padding:130px 32px 0')}>
        <h2 className="vu-h2" style={S('margin:0 0 32px;font:600 48px/1.02 Geist;letter-spacing:-0.05em;text-align:center')}>
          Questions
        </h2>
        <Faq items={faqs} />
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
                label="Get started"
                onClick={go('/onboarding')}
                className={cx(H.primaryLift, H.press)}
                style={S(
                  'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 28px;height:48px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;letter-spacing:-0.01em;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(80,30,12,.22), 0 10px 20px -8px rgba(150,60,30,.55);transition:transform .16s ease, box-shadow .16s ease, background .16s ease'
                )}
              >
                <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>
                  ▷
                </span>
                Get started
              </Pressable>
            </div>
          </div>
        </div>
      </div>

      <MarketingFooter />
    </div>
  );
}
