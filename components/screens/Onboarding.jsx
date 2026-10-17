'use client';

/* ==========================================================================
   Onboarding.jsx, design screen: `isOnboard`
   Two steps that branch on intent. Step 1 asks what the student is here for,
   plus first name and ZIP. Step 2 either sets up a student project or saves
   volunteer preferences that sort Discover. Every answer is persisted to
   `state.onboarding` as it changes, so a refresh resumes where it left off.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Field, Select, Chip, Pressable, TextArea, Icon, countWords } from '../ui.jsx';
import { Logo } from '../Logo.jsx';
import { useSnapshot, update, getState } from '../../lib/store.js';
import { toast } from '../../lib/overlays.js';
import { CAUSES, WINDOWS } from '../../lib/seed.js';
import { createProject, perform, signOut, addDays, formatSessionDate } from '../../lib/db.js';
import { track } from '../../lib/analytics.js';
import { defaultDraft, generatedSessions } from '../../lib/createDraft.js';
import { sameSitePath } from '../../lib/safePath.js';

const MONO = "'Geist Mono',monospace";
const MISSION_MAX = 240;
const INTEREST_MAX_WORDS = 150;
const POSITION_SUGGESTIONS = ['Tutor', 'Check-in lead', 'Supply lead', 'Photographer', 'Snacks'];
const EXPERIENCE = ['First time', 'Helped run something', 'Led a group before'];
const VOLUNTEERED = ['Never', 'A few times', 'Regularly'];
const CAUSE_OPTIONS = ['Education', 'Food & hunger', 'Environment', 'Civic', 'Animals', 'Health', 'Seniors', 'Arts', 'Homelessness', 'Disaster relief'];
const CREW_OPTIONS = ['4 to 6', '8 to 12', '12 to 20', '20+'];
const INTENT_KEYS = ['join', 'start', 'both'];

// Discovery comes first, so "Volunteer" leads the list and is the default.
const INTENTS = [
  { k: 'join', t: 'Volunteer', b: 'Find opportunities and nonprofits near me' },
  { k: 'start', t: 'Start a student project', b: 'Run my own project and find people to help' },
  { k: 'both', t: 'Both', b: 'Volunteer now, start a project later' },
];

const DEFAULT_START = { name: '', cause: 'Education', site: '', crew: '8 to 12', mission: '', positions: [], experience: 'First time' };
const DEFAULT_JOIN = { interest: '', location: '', causes: [], windows: [], radius: '5', hoursGoal: '', volunteered: 'Never' };

// Pages a ?next= target may not send a student back to from here.
const NEXT_BLOCKLIST = /^\/(onboarding|signin|signup|forgot|reset)(\/|\?|#|$)/;

const PRIMARY_BTN =
  'display:inline-flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;flex:none;padding:0 24px;height:46px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer;transition:background .16s ease, transform .16s ease';
const LABEL = 'font:500 12px/1.3 Geist;color:#57504A';
const OPTIONAL = 'color:#A9A097;font-weight:400';

/** A ?next= value that stays on this site and doesn't loop back into auth. */
function safeNext(raw) {
  const p = sameSitePath(raw);
  return p && !NEXT_BLOCKLIST.test(p) ? p : '';
}

/** "Sat, Oct 24" for the first Saturday after today, so new projects never start in the past. */
function nextSaturdayLabel() {
  const today = new Date();
  const ahead = ((6 - today.getDay() + 7) % 7) || 7;
  return formatSessionDate(addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), ahead));
}

function toggleIn(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { state } = useSnapshot();
  const ob = state.onboarding;
  const nextPath = safeNext(params.get('next'));

  // A brand-new account has an empty draft; anything else is a resume.
  const resuming = !!(ob.draft && (ob.draft.join || ob.draft.start));
  const savedIntent = resuming && INTENT_KEYS.includes(ob.intent) ? ob.intent : null;
  const queryIntent = INTENT_KEYS.includes(params.get('intent')) ? params.get('intent') : null;
  // Once the student picks an intent (or moves past step 1), their choice
  // beats the landing CTA's ?intent=, which stays in the URL across reloads.
  const [intentChosen, setIntentChosen] = useState(!!(savedIntent && (ob.intentChosen || ob.step === 2)));
  const [step, setStep] = useState(ob.step === 2 ? 2 : 1);
  const [intent, setIntent] = useState(() => (intentChosen ? savedIntent : queryIntent || savedIntent || 'join'));
  const [identity, setIdentity] = useState({
    firstName: ob.firstName || state.account.firstName || '',
    zip: ob.zip || state.account.zip || '',
  });
  const [start, setStart] = useState({ ...DEFAULT_START, ...(ob.draft && ob.draft.start) });
  const [join, setJoin] = useState({ ...DEFAULT_JOIN, ...(ob.draft && ob.draft.join) });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // A landing CTA can preselect the intent. The mount value is applied above;
  // a later change to ?intent= only applies while the student hasn't chosen.
  const appliedQuery = useRef(queryIntent);
  useEffect(() => {
    if (queryIntent === appliedQuery.current) return;
    appliedQuery.current = queryIntent;
    if (queryIntent && !intentChosen) setIntent(queryIntent);
  }, [queryIntent, intentChosen]);

  function chooseIntent(k) {
    setIntent(k);
    setIntentChosen(true);
  }

  // Persist as the student types so a refresh mid-flow loses nothing.
  useEffect(() => {
    update(
      (st) => {
        st.onboarding = { ...st.onboarding, step, intent, intentChosen, firstName: identity.firstName, zip: identity.zip, draft: { start, join } };
      },
      { silent: true }
    );
  }, [step, intent, intentChosen, identity, start, join]);

  const isStart = intent === 'start';

  function validateStep1() {
    const e = {};
    const name = identity.firstName.trim();
    if (!name) e.firstName = 'Enter your first name.';
    else if (name.length > 40) e.firstName = 'Use 40 characters or fewer.';
    if (!/^\d{5}$/.test(identity.zip.trim())) e.zip = 'Enter a 5-digit ZIP code.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  function validateStep2() {
    const e = {};
    if (isStart) {
      if (!start.name.trim()) e.name = 'Enter a name for your project.';
      if (!start.site.trim()) e.site = 'Enter where it happens.';
      if (!start.mission.trim()) e.mission = 'Enter one sentence about the project.';
      else if (start.mission.length > MISSION_MAX) e.mission = `Keep it to ${MISSION_MAX} characters.`;
      if (!start.positions.length) e.positions = 'Choose at least 1 position.';
    } else {
      if (countWords(join.interest) > INTEREST_MAX_WORDS) e.interest = `Keep it to ${INTEREST_MAX_WORDS} words.`;
      if (!join.location.trim()) e.location = 'Enter your city or town.';
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  function goStep(n) {
    setErrors({});
    setStep(n);
    window.scrollTo(0, 0);
  }

  function next() {
    if (!validateStep1()) {
      toast({ title: 'Check the highlighted fields', tone: 'warn' });
      return;
    }
    setIntentChosen(true);
    goStep(2);
  }

  function saveAnswers(st) {
    st.account.firstName = identity.firstName.trim();
    st.account.name = `${identity.firstName.trim()} ${st.account.lastName || ''}`.trim();
    st.account.zip = identity.zip.trim();
    st.onboarding.completed = true;
    st.onboarding.intent = intent;
    if (isStart) return;
    saveJoinPrefs(st, { partial: false });
  }

  /**
   * Copy the volunteer answers into prefs. `partial` (used by Skip) writes
   * only the answers the student actually gave, so blanks never wipe a value.
   * Returns true when at least one answer was saved.
   */
  function saveJoinPrefs(st, { partial }) {
    const interest = join.interest.trim();
    const location = join.location.trim();
    const interestOk = countWords(interest) <= INTEREST_MAX_WORDS;
    let saved = false;
    if (!partial || (interest && interestOk)) {
      st.prefs.interest = interestOk ? interest : st.prefs.interest;
      saved = saved || !!interest;
    }
    if (!partial || location) {
      st.prefs.location = location;
      st.account.city = location || st.account.city;
      saved = saved || !!location;
    }
    if (!partial || join.causes.length) {
      st.prefs.causes = join.causes.slice();
      saved = saved || !!join.causes.length;
    }
    if (!partial || join.windows.length) {
      st.prefs.windows = join.windows.slice();
      saved = saved || !!join.windows.length;
    }
    st.prefs.radius = Number(join.radius) || 5;
    if (!partial || join.volunteered !== DEFAULT_JOIN.volunteered) {
      st.prefs.experience = join.volunteered;
      saved = saved || join.volunteered !== DEFAULT_JOIN.volunteered;
    }
    const goal = parseInt(String(join.hoursGoal).replace(/\D/g, ''), 10);
    if (goal) {
      st.prefs.hoursGoal = goal;
      st.requirement.termGoal = goal;
      st.requirement.yearGoal = goal;
      saved = true;
    }
    return saved;
  }

  function projectDraft() {
    const d = { ...defaultDraft(), firstSession: nextSaturdayLabel() };
    return {
      ...d,
      name: start.name.trim(),
      cause: start.cause,
      site: start.site.trim(),
      mission: start.mission.trim(),
      bio: '',
      founderExperience: start.experience,
      crewTarget: parseInt(start.crew, 10) || 9,
      positions: start.positions.map((t) => ({ t, slots: t === 'Tutor' ? 8 : 1, age: '13+', train: 'None', commit: '1 hr weekly', note: '', requirements: [] })),
      sessions: generatedSessions(d),
      audience: ['High school', 'First timers welcome'],
    };
  }

  async function finish() {
    if (busy) return;
    if (!validateStep2()) {
      toast({ title: 'Check the highlighted fields', tone: 'warn' });
      return;
    }
    setBusy(true);
    try {
      await perform('onboarding.finish', () => update(saveAnswers));
      const project = isStart ? await createProject(projectDraft()) : null;
      track('onboarding_completed', { intent, causes: isStart ? [start.cause] : join.causes, has_location: isStart ? !!start.site.trim() : !!join.location.trim() });
      if (isStart) {
        const listed = !!(project && getState().projects.find((p) => p.id === project.id && p.listingId));
        toast({ title: 'Project created', message: listed ? "It's listed on Discover now." : "It's saved, but not listed on Discover yet.", tone: listed ? 'ok' : 'warn' });
        router.replace(project ? `/lead/${project.id}/overview` : '/lead');
      } else {
        toast(nextPath
          ? { title: 'Preferences saved', tone: 'ok' }
          : { title: 'Preferences saved', message: `Showing opportunities near ${join.location.trim()}.`, tone: 'ok' });
        router.replace(nextPath || '/discover');
      }
    } catch (err) {
      if (err && err.code === 'OFFLINE') toast({ title: "You're offline", message: 'Your answers are saved. Reconnect and try again.', tone: 'danger' });
      else if (!err || err.code !== 'DUPLICATE') {
        console.error('onboarding.finish failed', err);
        toast({ title: "Couldn't finish setup", message: 'Your answers are saved. Try again.', tone: 'danger' });
      }
    } finally {
      setBusy(false);
    }
  }

  // Skip keeps every answer already given. A project can't be half-created,
  // so the start path says plainly that nothing was made.
  function skip() {
    let keptPrefs = false;
    update((st) => {
      const name = identity.firstName.trim();
      if (name && name.length <= 40) {
        st.account.firstName = name;
        st.account.name = `${name} ${st.account.lastName || ''}`.trim();
      }
      if (/^\d{5}$/.test(identity.zip.trim())) st.account.zip = identity.zip.trim();
      st.onboarding.completed = true;
      st.onboarding.intent = intent;
      if (!isStart) keptPrefs = saveJoinPrefs(st, { partial: true });
    });
    if (isStart) {
      toast({ title: 'Skipped for now', message: "Your project wasn't created. Start it any time from Lead a project.", actionLabel: 'Start project', onAction: () => router.push('/create') });
    } else {
      toast({
        title: 'Skipped for now',
        message: keptPrefs ? 'Your answers are saved. Change them any time in Settings.' : 'Set your causes and schedule any time in Settings.',
        actionLabel: 'Open settings',
        onAction: () => router.push('/settings/preferences'),
      });
    }
    router.replace(nextPath || '/app');
  }

  // signOut() waits for the page to leave signed-in routes, so navigate first.
  async function switchAccount() {
    router.replace('/');
    await signOut();
    toast({ title: 'Signed out', tone: 'ok' });
  }

  return (
    <div className="vu-onboard vu-fixed-width vu-screen" style={S('display:grid;grid-template-columns:1fr 1.08fr;min-height:100vh;min-width:1180px')}>
      <Aside step={step} isStart={isStart} />
      <div className="vu-onboard-form" id="vu-main" style={S('background:#FAF8F5;padding:56px 60px;display:flex;flex-direction:column;justify-content:center')}>
        <div style={S('max-width:540px;width:100%')}>
          {step === 1 ? (
            <StepOne
              intent={intent}
              setIntent={chooseIntent}
              identity={identity}
              setIdentity={setIdentity}
              errors={errors}
              onNext={next}
              onSkip={skip}
              email={state.account.email || state.session.email}
              onSwitch={switchAccount}
            />
          ) : isStart ? (
            <StartForm start={start} setStart={setStart} errors={errors} busy={busy} onFinish={finish} onBack={() => goStep(1)} onSkip={skip} />
          ) : (
            <JoinForm join={join} setJoin={setJoin} errors={errors} busy={busy} onFinish={finish} onBack={() => goStep(1)} onSkip={skip} />
          )}
        </div>
      </div>
    </div>
  );
}

function Aside({ step, isStart }) {
  return (
    <div
      className="vu-onboard-aside"
      style={S('position:relative;background:#1F1B18;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 1px,transparent 1px 8px);padding:56px 52px;display:flex;flex-direction:column;justify-content:space-between;gap:32px;overflow:hidden')}
    >
      <Link href="/" aria-label="VolunteerU home" style={S('position:relative;display:flex;align-items:center;gap:9px;width:max-content;color:inherit')}>
        <Logo size={24} />
        <div style={S('font:600 16px/1 Geist;letter-spacing:-0.03em;color:#fff')}>VolunteerU</div>
      </Link>
      <div style={S('position:relative;max-width:400px')}>
        <div style={S(`font:500 13px/1 ${MONO};color:#D2775B`)}>Step {step} of 2</div>
        <h2 style={S('margin:14px 0 0;font:600 34px/1.14 Geist;letter-spacing:-0.04em;color:#fff;text-wrap:balance')}>
          {isStart ? '2 steps, then your project page is set up' : "2 steps, then we'll show what's near you"}
        </h2>
        <p style={S('margin:14px 0 0;font:400 16px/1.6 Geist;color:#A79E96;text-wrap:pretty')}>
          {isStart
            ? 'What you enter here fills in your project page. You can edit all of it later.'
            : 'Your town and causes sort what you see on Discover. Change them any time in Settings.'}
        </p>
      </div>
      <div role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={2} aria-label={`Step ${step} of 2`} style={S('position:relative;display:flex;gap:6px')}>
        <div style={S('width:80px;height:3px;border-radius:2px;background:#D2775B')} />
        <div style={s('width:80px;height:3px;border-radius:2px;transition:background .24s ease', `background:${step >= 2 ? '#D2775B' : '#3A332D'}`)} />
      </div>
    </div>
  );
}

function StepOne({ intent, setIntent, identity, setIdentity, errors, onNext, onSkip, email, onSwitch }) {
  const groupRef = useRef(null);

  // Arrow keys move the choice, the standard radio group pattern.
  function onKeyDown(e) {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = INTENTS.findIndex((x) => x.k === intent);
    const nextIdx = (i + dir + INTENTS.length) % INTENTS.length;
    setIntent(INTENTS[nextIdx].k);
    const el = groupRef.current && groupRef.current.querySelectorAll('[role="radio"]')[nextIdx];
    if (el) el.focus();
  }

  return (
    <div className="vu-screen">
      <h1 style={S('margin:0;font:600 34px/1.08 Geist;letter-spacing:-0.04em')}>What brings you here?</h1>
      <p style={S('margin:10px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>Pick one. You can do the other later.</p>
      <div ref={groupRef} role="radiogroup" aria-label="What brings you here?" onKeyDown={onKeyDown} style={S('margin-top:24px;display:flex;flex-direction:column;gap:10px')}>
        {INTENTS.map((i) => {
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
                'padding:18px 20px;border-radius:14px',
                `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`,
                `background:${on ? '#1F1B18' : '#FFFFFF'}`,
                'cursor:pointer;transition:border-color .16s ease, background .16s ease'
              )}
            >
              <div style={s('font:600 18px/1.2 Geist;letter-spacing:-0.03em', `color:${on ? '#FFFFFF' : '#1A1714'}`)}>{i.t}</div>
              <div style={s('margin-top:6px;font:450 14px/1.4 Geist', `color:${on ? '#CFC7BF' : '#6B635C'}`)}>{i.b}</div>
            </Pressable>
          );
        })}
      </div>
      <div className="vu-2col-keep" style={S('margin-top:26px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field
          label="First name"
          value={identity.firstName}
          onChange={(v) => setIdentity((f) => ({ ...f, firstName: v }))}
          onEnter={onNext}
          autoComplete="given-name"
          maxLength={40}
          required
          error={errors.firstName}
        />
        <Field
          label="ZIP code"
          value={identity.zip}
          onChange={(v) => setIdentity((f) => ({ ...f, zip: v.replace(/\D/g, '').slice(0, 5) }))}
          onEnter={onNext}
          placeholder="e.g. 46220"
          inputMode="numeric"
          autoComplete="postal-code"
          required
          error={errors.zip}
        />
      </div>
      <div style={S('margin-top:28px;display:flex;align-items:center;gap:18px;flex-wrap:wrap')}>
        <Pressable label="Next" onClick={onNext} className={H.press} style={S(PRIMARY_BTN)}>
          Next
        </Pressable>
        <Pressable label="Skip for now" onClick={onSkip} className={H.toInk} style={S('font:500 14px/1 Geist;color:#6B635C;cursor:pointer')}>
          Skip for now
        </Pressable>
      </div>
      {email ? (
        <div style={S('margin-top:22px;font:450 13px/1.5 Geist;color:#6B635C;overflow-wrap:anywhere')}>
          Signed in as {email}.{' '}
          <Pressable as="span" label="Sign out" onClick={onSwitch} className={H.link} style={S('color:#C2603C;font-weight:500;cursor:pointer')}>
            Sign out
          </Pressable>
        </div>
      ) : null}
    </div>
  );
}

function StartForm({ start, setStart, errors, busy, onFinish, onBack, onSkip }) {
  const set = (k) => (v) => setStart((f) => ({ ...f, [k]: v }));
  return (
    <div className="vu-screen">
      <h1 style={S('margin:0;font:600 32px/1.08 Geist;letter-spacing:-0.04em')}>About your project</h1>
      <div className="vu-2col-keep" style={S('margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Project name" value={start.name} onChange={set('name')} placeholder="e.g. Northside Reading Circle" maxLength={60} required error={errors.name} />
        <Select label="Cause" value={start.cause} onChange={set('cause')} options={CAUSE_OPTIONS} />
        <Field label="Where it happens" value={start.site} onChange={set('site')} placeholder="e.g. Eastside Library" maxLength={80} required error={errors.site} />
        <Select label="People you need" value={start.crew} onChange={set('crew')} options={CREW_OPTIONS} />
      </div>
      <div style={S('margin-top:20px')}>
        <TextArea
          label="What it does, in a sentence"
          value={start.mission}
          onChange={set('mission')}
          placeholder="e.g. Reading help for 2nd graders after school"
          maxLength={MISSION_MAX}
          counter
          minHeight={80}
          error={errors.mission}
        />
      </div>
      <div style={S('margin-top:20px')}>
        <div id="ob-pos" style={S(LABEL)}>Positions you need</div>
        <div role="group" aria-labelledby="ob-pos" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
          {POSITION_SUGGESTIONS.map((p) => (
            <Chip key={p} label={p} on={start.positions.includes(p)} onClick={() => setStart((f) => ({ ...f, positions: toggleIn(f.positions, p) }))} py={9} px={13} fs={13} role="checkbox" />
          ))}
        </div>
        {errors.positions ? <div className="vu-err" role="alert">{errors.positions}</div> : null}
      </div>
      <div style={S('margin-top:20px')}>
        <div id="ob-exp" style={S(LABEL)}>Have you organized anything before?</div>
        <div role="group" aria-labelledby="ob-exp" style={S('margin-top:10px;display:flex;gap:8px;flex-wrap:wrap')}>
          {EXPERIENCE.map((e) => (
            <Chip key={e} label={e} on={start.experience === e} onClick={() => setStart((f) => ({ ...f, experience: e }))} py={11} px={15} fs={14} />
          ))}
        </div>
        <div style={S('margin-top:10px;font:450 13px/1.5 Geist;color:#6B635C')}>Most people pick First time. Your project page starts with a setup checklist.</div>
      </div>
      <FinishRow label="Create project" busyLabel="Creating project" busy={busy} onFinish={onFinish} onBack={onBack} onSkip={onSkip} />
    </div>
  );
}

function JoinForm({ join, setJoin, errors, busy, onFinish, onBack, onSkip }) {
  const set = (k) => (v) => setJoin((f) => ({ ...f, [k]: v }));
  return (
    <div className="vu-screen">
      <h1 style={S('margin:0;font:600 32px/1.08 Geist;letter-spacing:-0.04em')}>What are you looking for?</h1>
      <p style={S('margin:10px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>Only your town is required. The rest helps us sort what you see.</p>
      <div style={S('margin-top:22px')}>
        <Field label="Where are you?" value={join.location} onChange={set('location')} placeholder="City or town, e.g. Fairfax" autoComplete="address-level2" maxLength={60} required error={errors.location} />
      </div>
      <div style={S('margin-top:20px')}>
        <TextArea
          label="What kind of volunteering sounds good? (optional)"
          value={join.interest}
          onChange={set('interest')}
          maxWords={INTEREST_MAX_WORDS}
          counter
          minHeight={96}
          placeholder="e.g. Tutoring younger kids on weekends"
          error={errors.interest}
        />
      </div>
      <div id="ob-cause" style={S(`margin-top:24px;${LABEL}`)}>What do you want to help with? <span style={S(OPTIONAL)}>(optional)</span></div>
      <div role="group" aria-labelledby="ob-cause" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
        {CAUSES.map((c) => (
          <Chip key={c} label={c} on={join.causes.includes(c)} onClick={() => setJoin((f) => ({ ...f, causes: toggleIn(f.causes, c) }))} py={10} px={14} fs={14} role="checkbox" />
        ))}
      </div>
      <div id="ob-win" style={S(`margin-top:24px;${LABEL}`)}>When are you usually free? <span style={S(OPTIONAL)}>(optional)</span></div>
      <div role="group" aria-labelledby="ob-win" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
        {WINDOWS.map((w) => (
          <Chip key={w} label={w} on={join.windows.includes(w)} onClick={() => setJoin((f) => ({ ...f, windows: toggleIn(f.windows, w) }))} py={10} px={14} fs={14} role="checkbox" />
        ))}
      </div>
      <div style={S('margin-top:22px;max-width:300px')}>
        <Field
          label="Hours your school requires (optional)"
          value={join.hoursGoal}
          onChange={(v) => setJoin((f) => ({ ...f, hoursGoal: v.replace(/[^0-9]/g, '').slice(0, 4) }))}
          inputMode="numeric"
          placeholder="e.g. 40"
          hint="Leave it blank if your school doesn't require hours."
          maxLength={4}
        />
      </div>
      <div style={S('margin-top:22px')}>
        <div id="ob-vol" style={S(LABEL)}>Have you volunteered before?</div>
        <div role="group" aria-labelledby="ob-vol" style={S('margin-top:10px;display:flex;gap:8px;flex-wrap:wrap')}>
          {VOLUNTEERED.map((v) => (
            <Chip key={v} label={v} on={join.volunteered === v} onClick={() => setJoin((f) => ({ ...f, volunteered: v }))} py={11} px={15} fs={14} />
          ))}
        </div>
      </div>
      <FinishRow label="Show opportunities" busyLabel="Saving" busy={busy} onFinish={onFinish} onBack={onBack} onSkip={onSkip} />
    </div>
  );
}

function FinishRow({ label, busyLabel, busy, onFinish, onBack, onSkip }) {
  return (
    <>
      <div style={S('margin-top:28px')}>
        <Pressable label={busy ? busyLabel : label} disabled={busy} onClick={onFinish} className={H.press} style={S(PRIMARY_BTN)}>
          {busy ? <span className="vu-spin" aria-hidden="true" /> : null}
          {busy ? busyLabel : label}
        </Pressable>
      </div>
      <div style={S('margin-top:18px;display:flex;align-items:center;gap:20px')}>
        <Pressable label="Back" onClick={onBack} className={H.toInk} style={S('display:inline-flex;align-items:center;gap:6px;font:500 14px/1 Geist;color:#6B635C;cursor:pointer')}>
          <Icon name="arrow-left" size={14} />
          Back
        </Pressable>
        <Pressable label="Skip for now" onClick={onSkip} className={H.toInk} style={S('font:500 14px/1 Geist;color:#6B635C;cursor:pointer')}>
          Skip for now
        </Pressable>
      </div>
    </>
  );
}
