'use client';

/* ==========================================================================
   Onboarding.jsx — design screen: `isOnboard`
   Two steps that branch on intent. Everything entered here carries into the
   workspace or the match feed, exactly as the copy promises.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Field, Select, Chip, ImageSlot, Pressable, TextArea } from '../ui.jsx';
import { Logo } from '../Logo.jsx';
import { useSnapshot, update } from '../../lib/store.js';
import { toast } from '../../lib/overlays.js';
import { intents, CAUSES, WINDOWS } from '../../lib/seed.js';
import { createProject, perform } from '../../lib/db.js';
import { defaultDraft, generatedSessions } from '../../lib/createDraft.js';

const MONO = "'Geist Mono',monospace";
const MISSION_MAX = 240;
const POSITION_SUGGESTIONS = ['Tutor', 'Check-in lead', 'Supply lead', 'Photographer', 'Snacks'];
const EXPERIENCE = ['First time', 'Helped run something', 'Led a group before'];
const VOLUNTEERED = ['Never', 'A few times', 'Regularly'];
const CAUSE_OPTIONS = ['Education', 'Food & hunger', 'Environment', 'Civic', 'Animals', 'Health', 'Seniors', 'Arts', 'Homelessness', 'Disaster relief'];
const CREW_OPTIONS = ['4 to 6', '8 to 12', '12 to 20', '20+'];
const RADIUS_OPTIONS = [
  { v: '2', l: '2 miles' },
  { v: '5', l: '5 miles' },
  { v: '10', l: '10 miles' },
  { v: '25', l: '25 miles' },
];

const DEFAULT_START = {
  name: '',
  cause: 'Education',
  site: '',
  crew: '8 to 12',
  mission: '',
  positions: [],
  experience: 'First time',
};

const INTEREST_MAX = 150;

const DEFAULT_JOIN = {
  interest: '',
  location: '',
  causes: [],
  windows: [],
  radius: '5',
  hoursGoal: '40 by June',
  volunteered: 'Never',
};

export default function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { state } = useSnapshot();
  const ob = state.onboarding;

  const [step, setStep] = useState(ob.step === 2 ? 2 : 1);
  const [intent, setIntent] = useState(ob.intent || 'start');
  const [identity, setIdentity] = useState({ firstName: ob.firstName || '', zip: ob.zip || '' });
  const [start, setStart] = useState({ ...DEFAULT_START, ...(ob.draft && ob.draft.start) });
  const [join, setJoin] = useState({ ...DEFAULT_JOIN, ...(ob.draft && ob.draft.join) });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // A landing CTA can preselect the intent.
  useEffect(() => {
    const q = params.get('intent');
    if (q === 'start' || q === 'join' || q === 'both') setIntent(q);
  }, [params]);

  // Persist as the student types so a refresh mid-flow loses nothing.
  useEffect(() => {
    update(
      (st) => {
        st.onboarding = { ...st.onboarding, step, intent, firstName: identity.firstName, zip: identity.zip, draft: { start, join } };
      },
      { silent: true }
    );
  }, [step, intent, identity, start, join]);

  const isStart = intent === 'start';

  function validateStep1() {
    const e = {};
    if (!identity.firstName.trim()) e.firstName = 'We need a first name to set up your profile.';
    else if (identity.firstName.trim().length > 40) e.firstName = 'That is longer than 40 characters.';
    if (!/^\d{5}$/.test(identity.zip.trim())) e.zip = 'Enter a five digit ZIP code.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  function validateStep2() {
    const e = {};
    if (isStart) {
      if (!start.name.trim()) e.name = 'Give your project a working name.';
      if (!start.site.trim()) e.site = 'Where does it happen?';
      if (!start.mission.trim()) e.mission = 'One sentence is enough.';
      else if (start.mission.length > MISSION_MAX) e.mission = `Trim it to ${MISSION_MAX} characters.`;
      if (!start.positions.length) e.positions = 'Pick at least one position you need.';
    } else {
      if (!join.interest.trim() || join.interest.trim().length < 8) e.interest = 'A sentence about what you want to do helps us match you.';
      else if (join.interest.trim().length > INTEREST_MAX) e.interest = `Keep it under ${INTEREST_MAX} characters.`;
      if (!join.location.trim()) e.location = 'Where are you based? A city or area is enough.';
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  function next() {
    if (!validateStep1()) {
      toast({ title: 'Check the highlighted fields', tone: 'warn' });
      return;
    }
    setErrors({});
    setStep(2);
    window.scrollTo(0, 0);
  }

  async function finish() {
    if (busy) return;
    if (!validateStep2()) {
      toast({ title: 'Almost there', message: 'A couple of fields still need an answer.', tone: 'warn' });
      return;
    }
    setBusy(true);
    try {
      await perform('onboarding.finish', () => {
        update((st) => {
          st.account.firstName = identity.firstName.trim();
          st.account.name = `${identity.firstName.trim()} ${st.account.lastName}`.trim();
          st.account.zip = identity.zip.trim();
          st.onboarding.completed = true;
          st.onboarding.intent = intent;
          if (!isStart) {
            st.prefs.interest = join.interest.trim();
            st.prefs.location = join.location.trim();
            st.account.city = join.location.trim() || st.account.city;
            st.prefs.causes = join.causes.slice();
            st.prefs.windows = join.windows.slice();
            st.prefs.radius = Number(join.radius) || 5;
            st.prefs.experience = join.volunteered;
            const goal = parseInt(String(join.hoursGoal).replace(/\D/g, ''), 10);
            if (goal) {
              st.prefs.hoursGoal = goal;
              st.requirement.termGoal = goal;
              st.requirement.yearGoal = goal;
            }
          }
        });

        if (isStart) {
          const d = defaultDraft();
          createProject({
            ...d,
            name: start.name.trim(),
            cause: start.cause,
            site: start.site.trim(),
            mission: start.mission.trim(),
            bio: '',
            crewTarget: Number(String(start.crew).split(' ')[0]) || 9,
            positions: start.positions.map((t) => ({ t, slots: t === 'Tutor' ? 8 : 1, age: '13+', train: 'None', commit: '1 hr weekly', note: '', requirements: [] })),
            sessions: generatedSessions(d),
            audience: ['High school', 'First timers welcome'],
          });
        }
      });

      if (isStart) {
        toast({ title: 'Workspace created', message: 'Add your organization and open positions — you can request verification anytime.', tone: 'ok' });
        router.replace('/lead');
      } else {
        toast({ title: 'Matches ready', message: 'Ranked to your causes, radius and free time.', tone: 'ok' });
        router.replace('/discover');
      }
    } catch (err) {
      if (err && err.code === 'OFFLINE') toast({ title: 'You are offline', message: 'Your answers are saved. Reconnect and finish up.', tone: 'danger' });
      else if (!err || err.code !== 'DUPLICATE') toast({ title: 'That did not save', message: 'Try once more.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    update((st) => {
      st.onboarding.completed = true;
    });
    toast({ title: 'Skipped for now', message: 'You can set your causes any time in Settings.', actionLabel: 'Open settings', onAction: () => router.push('/settings/preferences') });
    router.replace('/app');
  }

  const togglePosition = (p) =>
    setStart((f) => ({ ...f, positions: f.positions.includes(p) ? f.positions.filter((x) => x !== p) : [...f.positions, p] }));
  const toggleCause = (c) => setJoin((f) => ({ ...f, causes: f.causes.includes(c) ? f.causes.filter((x) => x !== c) : [...f.causes, c] }));
  const toggleWindow = (w) => setJoin((f) => ({ ...f, windows: f.windows.includes(w) ? f.windows.filter((x) => x !== w) : [...f.windows, w] }));

  return (
    <div className="vu-onboard vu-fixed-width vu-screen" style={S('display:grid;grid-template-columns:1fr 1.08fr;min-height:100vh;min-width:1180px')}>
      <div
        className="vu-onboard-aside"
        style={S('position:relative;background:#1F1B18;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 1px,transparent 1px 8px);padding:56px 52px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden')}
      >
        <div aria-hidden="true" style={S('position:absolute;top:-120px;left:-120px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(210,119,91,.3),rgba(210,119,91,0) 62%)')} />
        <Link href="/" style={S('position:relative;display:flex;align-items:center;gap:9px;width:max-content;color:inherit')}>
          <Logo size={24} />
          <div style={S('font:600 16px/1 Geist;letter-spacing:-0.03em;color:#fff')}>VolunteerU</div>
        </Link>
        <div style={S('position:relative;max-width:400px')}>
          <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#D2775B`)}>Step {step} of 2</div>
          <h2 style={S('margin:16px 0 0;font:600 34px/1.14 Geist;letter-spacing:-0.04em;color:#fff;text-wrap:balance')}>Two minutes and you are running</h2>
          <p style={S('margin:14px 0 0;font:400 16px/1.6 Geist;color:#A79E96;text-wrap:pretty')}>
            Whatever you enter here carries straight into your workspace. Nothing to redo later.
          </p>
          <div style={S('margin-top:34px;padding:18px;border-radius:14px;background:#26221E;border:1px solid #363029')}>
            <div style={S('font:450 14px/1.55 Geist;color:#CFC7BF')}>
              “I filled this out on a Tuesday. Sponsor said yes Wednesday, nine people signed up by the weekend.”
            </div>
            <div style={S('margin-top:12px;display:flex;align-items:center;gap:10px')}>
              <div style={S('width:26px;height:26px;border-radius:50%;overflow:hidden;flex:none')}>
                <ImageSlot src="https://picsum.photos/seed/ob_face/400/400?grayscale" shape="circle" placeholder="face" />
              </div>
              <div style={S('font:500 12px/1 Geist;color:#8B8078')}>Sofia K. · Grade 10</div>
            </div>
          </div>
        </div>
        <div role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={2} aria-label="Onboarding progress" style={S('position:relative;display:flex;gap:6px')}>
          <div style={S('width:80px;height:3px;border-radius:2px;background:#D2775B;transition:background .24s ease')} />
          <div style={s('width:80px;height:3px;border-radius:2px;transition:background .24s ease', `background:${step >= 2 ? '#D2775B' : '#3A332D'}`)} />
        </div>
      </div>

      <div className="vu-onboard-form" id="vu-main" style={S('background:#FAF8F5;padding:56px 60px;display:flex;flex-direction:column;justify-content:center')}>
        <div style={S('max-width:540px;width:100%')}>
          {step === 1 ? (
            <div className="vu-screen">
              <h1 style={S('margin:0;font:600 34px/1.08 Geist;letter-spacing:-0.04em')}>What are you here to do</h1>
              <p style={S('margin:10px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>Pick one. The next page changes to match.</p>
              <div role="radiogroup" aria-label="What are you here to do" style={S('margin-top:24px;display:flex;flex-direction:column;gap:10px')}>
                {intents.map((i) => {
                  const on = intent === i.k;
                  return (
                    <Pressable
                      key={i.k}
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      onClick={() => setIntent(i.k)}
                      className={cx(on ? '' : H.chip, H.press)}
                      style={s(
                        'padding:20px;border-radius:14px',
                        `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`,
                        `background:${on ? '#1F1B18' : '#FFFFFF'}`,
                        'cursor:pointer;transition:border-color .16s ease, background .16s ease'
                      )}
                    >
                      <div style={s('font:600 19px/1.2 Geist;letter-spacing:-0.03em', `color:${on ? '#FFFFFF' : '#1A1714'}`)}>{i.t}</div>
                      <div style={s('margin-top:7px;font:450 14px/1.4 Geist', `color:${on ? '#CFC7BF' : '#8A8179'}`)}>{i.b}</div>
                    </Pressable>
                  );
                })}
              </div>
              <div className="vu-2col-keep" style={S('margin-top:26px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
                <Field
                  label="First name"
                  value={identity.firstName}
                  onChange={(v) => setIdentity((f) => ({ ...f, firstName: v }))}
                  onEnter={next}
                  placeholder="Eli"
                  autoComplete="given-name"
                  maxLength={40}
                  required
                  error={errors.firstName}
                />
                <Field
                  label="ZIP code"
                  value={identity.zip}
                  onChange={(v) => setIdentity((f) => ({ ...f, zip: v.replace(/\D/g, '').slice(0, 5) }))}
                  onEnter={next}
                  placeholder="46220"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  required
                  error={errors.zip}
                />
              </div>
              <Pressable
                label="Continue"
                onClick={next}
                className={H.press}
                style={S('margin-top:28px;display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 24px;height:46px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55);transition:background .16s ease, transform .16s ease')}
              >
                <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>▷</span>
                Continue
              </Pressable>
              <div style={S('margin-top:18px;font:450 13px/1.5 Geist;color:#A9A097')}>
                Already have an account?{' '}
                <Link href="/signin" className={H.link} style={S('color:#C2603C;font-weight:500')}>
                  Sign in
                </Link>
              </div>
            </div>
          ) : (
            <div className="vu-screen">
              <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>
                {isStart ? 'Tell us what you want to run' : 'Tell us what you want to join'}
              </div>

              {isStart ? (
                <>
                  <h1 style={S('margin:14px 0 0;font:600 32px/1.08 Geist;letter-spacing:-0.04em')}>Describe what you want to run</h1>
                  <p style={S('margin:10px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>This becomes your project the moment you sign in. You can extend it later.</p>
                  <div className="vu-2col-keep" style={S('margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
                    <Field label="Working name" value={start.name} onChange={(v) => setStart((f) => ({ ...f, name: v }))} maxLength={60} required error={errors.name} />
                    <Select label="Cause area" value={start.cause} onChange={(v) => setStart((f) => ({ ...f, cause: v }))} options={CAUSE_OPTIONS} />
                    <Field label="Where it happens" value={start.site} onChange={(v) => setStart((f) => ({ ...f, site: v }))} maxLength={80} required error={errors.site} />
                    <Select label="People you need" value={start.crew} onChange={(v) => setStart((f) => ({ ...f, crew: v }))} options={CREW_OPTIONS} />
                  </div>
                  <div style={S('margin-top:20px')}>
                    <TextArea
                      label="Mission in a sentence"
                      value={start.mission}
                      onChange={(v) => setStart((f) => ({ ...f, mission: v }))}
                      maxLength={MISSION_MAX}
                      counter
                      minHeight={80}
                      error={errors.mission}
                    />
                  </div>
                  <div style={S('margin-top:20px')}>
                    <div id="ob-pos" style={S('font:500 12px/1 Geist;color:#57504A')}>Positions you already know you need</div>
                    <div role="group" aria-labelledby="ob-pos" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
                      {POSITION_SUGGESTIONS.map((p) => (
                        <Chip key={p} label={p} on={start.positions.includes(p)} onClick={() => togglePosition(p)} py={9} px={13} fs={13} role="checkbox" />
                      ))}
                    </div>
                    {errors.positions ? <div className="vu-err">{errors.positions}</div> : null}
                  </div>
                  <div style={S('margin-top:20px')}>
                    <div id="ob-exp" style={S('font:500 12px/1 Geist;color:#57504A')}>Have you organized anything before</div>
                    <div role="radiogroup" aria-labelledby="ob-exp" style={S('margin-top:10px;display:flex;gap:8px;flex-wrap:wrap')}>
                      {EXPERIENCE.map((e) => (
                        <Chip key={e} label={e} on={start.experience === e} onClick={() => setStart((f) => ({ ...f, experience: e }))} py={11} px={15} fs={14} />
                      ))}
                    </div>
                    <div style={S('margin-top:10px;font:450 13px/1.5 Geist;color:#8A8179')}>
                      First time is the common answer. You get the setup checklist and can request verification for your organization when you are ready.
                    </div>
                  </div>
                  <FinishRow label="Create my workspace" note="Verification is optional and requested from your workspace" busy={busy} onFinish={finish} onBack={() => setStep(1)} onSkip={skip} />
                </>
              ) : (
                <>
                  <h1 style={S('margin:14px 0 0;font:600 32px/1.08 Geist;letter-spacing:-0.04em')}>What do you want to do</h1>
                  <p style={S('margin:10px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>Tell us in your own words and where you are. We match you to real openings — remote and in person — by cross-referencing what you wrote.</p>
                  <div style={S('margin-top:22px')}>
                    <TextArea
                      label="In a sentence or two, what do you want to do?"
                      value={join.interest}
                      onChange={(v) => setJoin((f) => ({ ...f, interest: v }))}
                      maxLength={INTEREST_MAX}
                      counter
                      minHeight={84}
                      placeholder="e.g. Tutor kids in reading, help at a food bank on weekends, or anything with animals."
                      error={errors.interest}
                    />
                  </div>
                  <div className="vu-2col-keep" style={S('margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
                    <Field label="Where are you?" value={join.location} onChange={(v) => setJoin((f) => ({ ...f, location: v }))} placeholder="City or area — e.g. San Diego" maxLength={60} required error={errors.location} />
                    <Select label="How far can you travel" value={join.radius} onChange={(v) => setJoin((f) => ({ ...f, radius: v }))} options={RADIUS_OPTIONS} />
                  </div>

                  <div id="ob-cause" style={S('margin-top:24px;font:500 12px/1 Geist;color:#57504A')}>Causes you care about <span style={S('color:#A9A097;font-weight:400')}>(optional — sharpens your matches)</span></div>
                  <div role="group" aria-labelledby="ob-cause" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
                    {CAUSES.map((c) => (
                      <Chip key={c} label={c} on={join.causes.includes(c)} onClick={() => toggleCause(c)} py={10} px={14} fs={14} role="checkbox" />
                    ))}
                  </div>
                  <div id="ob-win" style={S('margin-top:24px;font:500 12px/1 Geist;color:#57504A')}>When are you free <span style={S('color:#A9A097;font-weight:400')}>(optional)</span></div>
                  <div role="group" aria-labelledby="ob-win" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
                    {WINDOWS.map((w) => (
                      <Chip key={w} label={w} on={join.windows.includes(w)} onClick={() => toggleWindow(w)} py={10} px={14} fs={14} role="checkbox" />
                    ))}
                  </div>
                  {errors.windows ? <div className="vu-err">{errors.windows}</div> : null}
                  <div style={S('margin-top:22px;max-width:260px')}>
                    <Field label="Hours you need" value={join.hoursGoal} onChange={(v) => setJoin((f) => ({ ...f, hoursGoal: v }))} maxLength={30} />
                  </div>
                  <div style={S('margin-top:22px')}>
                    <div id="ob-vol" style={S('font:500 12px/1 Geist;color:#57504A')}>Volunteered before</div>
                    <div role="radiogroup" aria-labelledby="ob-vol" style={S('margin-top:10px;display:flex;gap:8px;flex-wrap:wrap')}>
                      {VOLUNTEERED.map((v) => (
                        <Chip key={v} label={v} on={join.volunteered === v} onClick={() => setJoin((f) => ({ ...f, volunteered: v }))} py={11} px={15} fs={14} />
                      ))}
                    </div>
                  </div>
                  <FinishRow label="Show my matches" note="Accredited and student organizations both" busy={busy} onFinish={finish} onBack={() => setStep(1)} onSkip={skip} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FinishRow({ label, note, busy, onFinish, onBack, onSkip }) {
  return (
    <>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:26px;display:flex;align-items:center;gap:12px')}>
        <Pressable
          label={label}
          disabled={busy}
          onClick={onFinish}
          className={H.press}
          style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 24px;height:46px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55);transition:background .16s ease, transform .16s ease')}
        >
          {busy ? <span className="vu-spin" /> : <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>▷</span>}
          {busy ? 'Setting up' : label}
        </Pressable>
        <div style={S('font:450 13px/1.4 Geist;color:#A9A097')}>{note}</div>
      </div>
      <div style={S('margin-top:18px;display:flex;align-items:center;gap:16px')}>
        <Pressable label="Back to step one" onClick={onBack} className={H.toInk} style={S('font:500 14px/1 Geist;color:#8A8179;cursor:pointer')}>
          ← Back
        </Pressable>
        <Pressable label="Skip for now" onClick={onSkip} className={H.toInk} style={S('font:450 13px/1 Geist;color:#A9A097;cursor:pointer')}>
          Skip for now
        </Pressable>
      </div>
    </>
  );
}
