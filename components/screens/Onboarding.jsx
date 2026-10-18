'use client';

/* ==========================================================================
   Onboarding.jsx, design screen: `isOnboard`
   Two steps that branch on intent. Step 1 asks what the student is here for,
   plus first name and ZIP. Step 2 either sets up a student project or saves
   volunteer preferences that sort Discover. Every answer is persisted to
   `state.onboarding` as it changes, so a refresh resumes where it left off.

   Layout: the form on white on the left, a photo of the work on the right
   that follows the chosen intent. Under 1180px the photo goes and the form
   starts right under a slim top bar.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s } from '../../lib/style.js';
import { C, F, causeOf } from '../../lib/tokens.js';
import { Field, Select, Chip, TextArea, Button, RadioDot, countWords } from '../ui.jsx';
import { Wordmark } from '../Logo.jsx';
import { causeLabel } from '../LogHoursForm.jsx';
import { useSnapshot, update, getState } from '../../lib/store.js';
import { toast, dismissToast, clearToasts } from '../../lib/overlays.js';
import { CAUSES, WINDOWS } from '../../lib/seed.js';
import { PHOTOS } from '../../lib/photos.js';
import { createProject, perform, signOut, addDays, formatSessionDate } from '../../lib/db.js';
import { track } from '../../lib/analytics.js';
import { defaultDraft, generatedSessions } from '../../lib/createDraft.js';
import { sameSitePath } from '../../lib/safePath.js';
import { markOnboardingFinished } from '../../lib/onboardingFlag.js';

const MISSION_MAX = 240;
const INTEREST_MIN_CHARS = 8;
const INTEREST_MAX_WORDS = 150;
const POSITION_SUGGESTIONS = ['Tutor', 'Check-in lead', 'Supply lead', 'Photographer', 'Snacks'];
const EXPERIENCE = ['First time', 'Helped run something', 'Led a group before'];
const VOLUNTEERED = ['Never', 'A few times', 'Regularly'];
const CAUSE_OPTIONS = ['Education', 'Food & hunger', 'Environment', 'Civic', 'Animals', 'Health', 'Seniors', 'Arts', 'Homelessness', 'Disaster relief'];
const CAUSE_OPTION_ITEMS = CAUSE_OPTIONS.map((c) => ({ v: c, l: causeLabel(c) }));
const CREW_OPTIONS = ['4 to 6', '8 to 12', '12 to 20', '20+'];
const INTENT_KEYS = ['join', 'start', 'both'];

// Discovery comes first, so "Volunteer" leads the list and is the default.
const INTENTS = [
  { k: 'join', t: 'Volunteer', b: 'Find opportunities and nonprofits near me' },
  { k: 'start', t: 'Start a student project', b: 'Run my own project and find people to help' },
  { k: 'both', t: 'Both', b: 'Volunteer now, start a project later' },
];

// The photo beside the form follows the intent. Crops keep faces in a tall frame.
const INTENT_PHOTO = {
  join: { ...PHOTOS.food, pos: '38% center', alt: 'Volunteers packing boxes of food at a food bank' },
  start: { ...PHOTOS.outdoor, pos: '72% center', alt: 'A student holding a clipboard with a volunteer sign-up sheet at a park cleanup' },
  both: { ...PHOTOS.reading, pos: '28% center', alt: 'Volunteers sorting donations, one holding a clipboard' },
};

const DEFAULT_START = { name: '', cause: 'Education', site: '', crew: '8 to 12', mission: '', positions: [], experience: 'First time' };
const DEFAULT_JOIN = { interest: '', location: '', causes: [], windows: [], radius: '5', hoursGoal: '', volunteered: 'Never' };

// Pages a ?next= target may not send a student back to from here.
const NEXT_BLOCKLIST = /^\/(onboarding|signin|signup|forgot|reset)(\/|\?|#|$)/;

const LABEL = `display:block;font:600 13px/1.2 ${F.body};color:${C.ink}`;
const OPTIONAL = `color:${C.ink2};font-weight:400`;
const HINT = `margin:8px 0 0;font:400 13px/1.45 ${F.body};color:${C.ink2}`;


/** A ?next= value that stays on this site and doesn't loop back into auth. */
function safeNext(raw) {
  const p = sameSitePath(raw);
  return p && !NEXT_BLOCKLIST.test(p) ? p : '';
}

/** The join form's last button names where it goes: the listing the student
    came from, another page they were on, or Discover. */
function finishLabel(nextPath) {
  if (!nextPath) return 'Show opportunities';
  return nextPath.startsWith('/join/') ? 'Back to the opportunity' : 'Save and continue';
}

/** "Sat, Oct 24" for the first Saturday after today, so new projects never start in the past. */
function nextSaturdayLabel() {
  const today = new Date();
  const ahead = ((6 - today.getDay() + 7) % 7) || 7;
  return formatSessionDate(addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), ahead));
}

/* Step 2 is mirrored in the URL (?step=2) with its own history entry, so the
   browser Back button and the Android back gesture return to step 1 instead
   of leaving onboarding. Step 1 is the bare /onboarding; other params
   (?intent=, ?next=) are kept. */
function readUrlStep() {
  try {
    return new URLSearchParams(window.location.search).get('step') === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}

function writeUrlStep(n, mode) {
  try {
    const url = new URL(window.location.href);
    if (n === 2) url.searchParams.set('step', '2');
    else url.searchParams.delete('step');
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (mode !== 'push' && href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    // null state: Next.js adds its own router state to native history calls.
    if (mode === 'push') window.history.pushState(null, '', href);
    else window.history.replaceState(null, '', href);
  } catch {
    /* History unavailable: the step still lives in state.onboarding. */
  }
}

function toggleIn(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Arrow-key handler for a roving-tabindex radio group. */
function radioKeys(e, options, value, choose, root) {
  const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
  if (!dir) return;
  e.preventDefault();
  const i = Math.max(0, options.indexOf(value));
  const next = (i + dir + options.length) % options.length;
  choose(options[next]);
  const el = root && root.querySelectorAll('[role="radio"]')[next];
  if (el) el.focus();
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
  // Stays set once finish() succeeds, so a second click during navigation
  // can't create a second project.
  const finishing = useRef(false);
  // The "Check the highlighted fields" toast, cleared once the form moves on.
  const warnId = useRef(null);
  const warn = () => {
    warnId.current = toast({ title: 'Check the highlighted fields', tone: 'warn' });
  };
  const clearWarn = () => {
    if (warnId.current) dismissToast(warnId.current);
    warnId.current = null;
  };

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
      const interest = join.interest.trim();
      if (interest.length < INTEREST_MIN_CHARS) e.interest = 'Enter a few words about what you want to do.';
      else if (countWords(interest) > INTEREST_MAX_WORDS) e.interest = `Keep it to ${INTEREST_MAX_WORDS} words.`;
      if (!join.location.trim()) e.location = 'Enter your city or town.';
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  function goStep(n) {
    clearWarn();
    setErrors({});
    setStep(n);
    window.scrollTo(0, 0);
    // The button that was pressed is gone, so put focus on the new heading.
    requestAnimationFrame(() => {
      const h = document.querySelector('.vu-ob-h1');
      if (h) h.focus({ preventScroll: true });
    });
  }

  // True while the history entry under the current one is this page's step 1,
  // so the on-page Back can pop it instead of stacking another entry.
  const step1Below = useRef(false);

  function next() {
    if (!validateStep1()) {
      warn();
      return;
    }
    setIntentChosen(true);
    goStep(2);
    writeUrlStep(2, 'push');
    step1Below.current = true;
  }

  // The on-page Back matches the browser's: pop to the step 1 entry when it's
  // there (the popstate handler shows step 1), otherwise rewrite this entry.
  function back() {
    if (step1Below.current && readUrlStep() === 2) {
      step1Below.current = false;
      window.history.back();
      return;
    }
    goStep(1);
    writeUrlStep(1, 'replace');
  }

  // On open, line the URL up with the saved step. A resume on step 2 gets a
  // step 1 entry under it so Back still has somewhere to go. Deferred a tick
  // so Next.js has patched history and keeps its router URL in step.
  useEffect(() => {
    const t = setTimeout(() => {
      const u = readUrlStep();
      if (step === 2 && u !== 2) {
        writeUrlStep(1, 'replace');
        writeUrlStep(2, 'push');
        step1Below.current = true;
      } else if (step === 1 && u === 2) {
        writeUrlStep(1, 'replace');
      }
    }, 0);
    return () => clearTimeout(t);
    // Runs once on open; later moves go through next, back and popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser Back and Forward. Refreshed every render so it sees current
  // answers when it validates a forward move to step 2.
  const onHistory = useRef(null);
  onHistory.current = () => {
    if (finishing.current) return;
    const u = readUrlStep();
    if (u === step) return;
    if (u === 2) {
      if (!validateStep1()) {
        warn();
        writeUrlStep(1, 'replace');
        return;
      }
      setIntentChosen(true);
      step1Below.current = true;
    } else {
      step1Below.current = false;
    }
    goStep(u);
  };
  useEffect(() => {
    const h = () => onHistory.current && onHistory.current();
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

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
    if (busy || finishing.current) return;
    if (!validateStep2()) {
      warn();
      return;
    }
    finishing.current = true;
    clearWarn();
    setBusy(true);
    try {
      // Back from the new project lands here again; an account that already
      // finished never creates a second project from this form.
      const alreadyDone = Boolean(getState().onboarding && getState().onboarding.completed);
      markOnboardingFinished();
      await perform('onboarding.finish', () => update(saveAnswers));
      if (isStart && alreadyDone) {
        router.replace('/lead');
        return;
      }
      const project = isStart ? await createProject(projectDraft()) : null;
      track('onboarding_completed', { intent, causes: isStart ? [start.cause] : join.causes, has_location: isStart ? !!start.site.trim() : !!join.location.trim() });
      // The result toast below replaces anything still up from sign-up.
      clearToasts();
      if (isStart) {
        const listed = !!(project && getState().projects.find((p) => p.id === project.id && p.listingId));
        toast({ title: 'Project created', message: listed ? "It's listed on Discover now." : "It's saved, but not listed on Discover yet.", tone: listed ? 'ok' : 'warn' });
        router.replace(project ? `/lead/${project.id}/overview` : '/lead');
      } else {
        // Coming back to a listing, the listing itself is the next step, so no toast.
        if (!nextPath) toast({ title: 'Preferences saved', message: `Showing opportunities near ${join.location.trim()}.`, tone: 'ok' });
        // Show my matches carries the answers just given. Later visits to
        // Discover seed causes only, never free time (see Discover.jsx).
        const qs = new URLSearchParams();
        if (join.causes && join.causes.length) qs.set('causes', join.causes.join('|'));
        if (join.windows && join.windows.length) qs.set('windows', join.windows.join('|'));
        router.replace(nextPath || (qs.toString() ? `/discover?${qs.toString()}` : '/discover'));
      }
      // Leave busy on: the page is navigating away.
    } catch (err) {
      finishing.current = false;
      setBusy(false);
      if (err && err.code === 'OFFLINE') toast({ title: "You're offline", message: 'Your answers are saved. Reconnect and try again.', tone: 'danger' });
      else if (!err || err.code !== 'DUPLICATE') {
        console.error('onboarding.finish failed', err);
        toast({ title: "Couldn't finish setup", message: 'Your answers are saved. Try again.', tone: 'danger' });
      }
    }
  }

  // Skip keeps every answer already given. A project can't be half-created,
  // so the start path says plainly that nothing was made.
  function skip() {
    clearWarn();
    markOnboardingFinished();
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
    // Back to a listing (a signed-out Apply sent them here), the page they
    // came for is the answer; a note about Settings would only sit on top of
    // the apply toast that comes next.
    clearToasts();
    if (nextPath) {
      /* no toast */
    } else if (isStart) {
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

  const photo = INTENT_PHOTO[intent] || INTENT_PHOTO.join;

  return (
    <div className="vu-ob vu-screen">
      <div className="vu-ob-main" id="vu-main">
        <header className="vu-ob-top">
          <Link href="/" aria-label="VolunteerU home" style={S('display:inline-flex;color:inherit;border-radius:10px')}>
            <Wordmark size={26} />
          </Link>
          <StepMeter step={step} />
        </header>
        <div className="vu-ob-body">
          <div className="vu-ob-col">
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
              <StartForm start={start} setStart={setStart} errors={errors} busy={busy} onFinish={finish} onBack={back} onSkip={skip} />
            ) : (
              <JoinForm join={join} setJoin={setJoin} errors={errors} busy={busy} onFinish={finish} onBack={back} onSkip={skip} finishLabel={finishLabel(nextPath)} />
            )}
          </div>
        </div>
      </div>
      <div className="vu-ob-photo" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* 16px like every other photo; 24px is kept for the landing hero only. */}
        <img key={photo.src} src={photo.src} alt="" style={{ objectPosition: photo.pos, borderRadius: 'var(--r-photo)' }} />
      </div>
    </div>
  );
}

/** "Step 1 of 2" with a two-segment bar, exposed as one progressbar. */
function StepMeter({ step }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={2}
      aria-label={`Step ${step} of 2`}
      style={S('display:flex;align-items:center;gap:12px')}
    >
      <span style={S(`font:600 13px/1 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums;white-space:nowrap`)}>Step {step} of 2</span>
      <span aria-hidden="true" style={S('display:flex;gap:4px')}>
        {[1, 2].map((n) => (
          <span key={n} style={s('width:28px;height:4px;border-radius:999px;transition:background .24s ease', `background:${n <= step ? C.ink : C.line2}`)} />
        ))}
      </span>
    </div>
  );
}

function Heading({ children, sub }) {
  return (
    <div>
      <h1 className="vu-ob-h1" tabIndex={-1} style={S(`margin:0;font:700 40px/1.05 ${F.display};letter-spacing:-0.03em;color:${C.ink};text-wrap:balance`)}>{children}</h1>
      {sub ? <p style={S(`margin:10px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{sub}</p> : null}
    </div>
  );
}

function StepOne({ intent, setIntent, identity, setIdentity, errors, onNext, onSkip, email, onSwitch }) {
  const groupRef = useRef(null);
  const keys = INTENTS.map((x) => x.k);

  return (
    <div className="vu-screen">
      <Heading sub="Pick one. You can do the other later.">What brings you here?</Heading>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="What brings you here?"
        className="vu-ob-opts"
        onKeyDown={(e) => radioKeys(e, keys, intent, setIntent, groupRef.current)}
        style={S('margin-top:24px')}
      >
        {INTENTS.map((i) => {
          const on = intent === i.k;
          return (
            <div
              key={i.k}
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className="vu-ob-opt"
              onClick={() => setIntent(i.k)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setIntent(i.k);
                }
              }}
            >
              <span style={S('margin-top:1px')}>
                <RadioDot checked={on} />
              </span>
              <span style={S('min-width:0')}>
                <span style={S(`display:block;font:600 16px/1.3 ${F.body};color:${C.ink}`)}>{i.t}</span>
                <span style={S(`display:block;margin-top:3px;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>{i.b}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="vu-ob-pair" style={S('margin-top:28px')}>
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
          placeholder="e.g. 46032"
          inputMode="numeric"
          autoComplete="postal-code"
          required
          error={errors.zip}
        />
      </div>
      <div className="vu-ob-actions">
        <Button variant="primary" size="lg" onClick={onNext} extra="min-width:132px">
          Next
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
      {email ? (
        <p style={S(`margin:28px 0 0;font:400 13px/1.5 ${F.body};color:${C.ink2};overflow-wrap:anywhere`)}>
          Signed in as {email}.{' '}
          <button type="button" onClick={onSwitch} className="vu-link-ul" style={S(`padding:0;border:0;background:none;font:600 13px/1.5 ${F.body};color:${C.ink};cursor:pointer;text-decoration:underline;text-underline-offset:3px`)}>
            Sign out
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** A labelled single-choice row of pills (role=radiogroup, arrow keys move). */
function PillChoice({ id, label, options, value, onChange }) {
  const ref = useRef(null);
  return (
    <div>
      <div id={id} style={S(LABEL)}>{label}</div>
      <div
        ref={ref}
        role="radiogroup"
        aria-labelledby={id}
        onKeyDown={(e) => radioKeys(e, options, value, onChange, ref.current)}
        style={S('margin-top:10px;display:flex;gap:8px;flex-wrap:wrap')}
      >
        {options.map((o) => {
          const on = value === o;
          return (
            <button key={o} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className="vu-ob-pill" onClick={() => onChange(o)}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StartForm({ start, setStart, errors, busy, onFinish, onBack, onSkip }) {
  const set = (k) => (v) => setStart((f) => ({ ...f, [k]: v }));
  return (
    <div className="vu-screen">
      <Heading sub="This fills in your project page. You can change all of it later.">About your project</Heading>
      <div style={S('margin-top:28px')}>
        <div className="vu-ob-sec vu-ob-pair">
          <Field label="Project name" value={start.name} onChange={set('name')} placeholder="e.g. Northside Reading Circle" maxLength={60} required error={errors.name} />
          <Select label="Cause" value={start.cause} onChange={set('cause')} options={CAUSE_OPTION_ITEMS} />
          <Field label="Where it happens" value={start.site} onChange={set('site')} placeholder="e.g. Central Library, Indianapolis" maxLength={80} required error={errors.site} />
          <Select label="People you need" value={start.crew} onChange={set('crew')} options={CREW_OPTIONS} />
        </div>
        <div className="vu-ob-sec">
          <TextArea
            label="What it does, in a sentence"
            value={start.mission}
            onChange={set('mission')}
            placeholder="e.g. Reading help for 2nd graders after school"
            maxLength={MISSION_MAX}
            counter
            required
            minHeight={88}
            error={errors.mission}
          />
        </div>
        <div className="vu-ob-sec">
          <div id="ob-pos" style={S(LABEL)}>
            Positions you need<span aria-hidden="true" style={S(`color:${C.ember}`)}> *</span>
          </div>
          <div role="group" aria-labelledby="ob-pos" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
            {POSITION_SUGGESTIONS.map((p) => (
              <Chip key={p} label={p} on={start.positions.includes(p)} onClick={() => setStart((f) => ({ ...f, positions: toggleIn(f.positions, p) }))} py={10} px={15} fs={14} role="checkbox" />
            ))}
          </div>
          {errors.positions ? <div className="vu-err" role="alert">{errors.positions}</div> : <p style={S(HINT)}>Pick any that fit. You can add your own later.</p>}
        </div>
        <div className="vu-ob-sec">
          <PillChoice id="ob-exp" label="Have you organized anything before?" options={EXPERIENCE} value={start.experience} onChange={set('experience')} />
          <p style={S(HINT)}>Most people pick First time. Your project page starts with a setup checklist.</p>
        </div>
      </div>
      <FinishRow label="Create project" busyLabel="Creating project" busy={busy} onFinish={onFinish} onBack={onBack} onSkip={onSkip} />
    </div>
  );
}

function JoinForm({ join, setJoin, errors, busy, onFinish, onBack, onSkip, finishLabel: label }) {
  const set = (k) => (v) => setJoin((f) => ({ ...f, [k]: v }));
  return (
    <div className="vu-screen">
      <Heading sub="We use this to sort Discover. Change it any time in Settings.">What are you looking for?</Heading>
      <div style={S('margin-top:28px')}>
        <div className="vu-ob-sec">
          <Field label="Where are you?" value={join.location} onChange={set('location')} placeholder="City or town, e.g. Indianapolis" autoComplete="address-level2" maxLength={60} required error={errors.location} />
        </div>
        <div className="vu-ob-sec">
          <TextArea
            label="What kind of volunteering sounds good?"
            value={join.interest}
            onChange={set('interest')}
            maxWords={INTEREST_MAX_WORDS}
            counter
            required
            minHeight={88}
            placeholder="e.g. Tutoring younger kids on weekends"
            hint="A sentence or two is plenty."
            error={errors.interest}
          />
        </div>
        <div className="vu-ob-sec">
          <div id="ob-cause" style={S(LABEL)}>
            What do you want to help with? <span style={S(OPTIONAL)}>(optional)</span>
          </div>
          <div role="group" aria-labelledby="ob-cause" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
            {CAUSES.map((c) => (
              <Chip key={c} label={causeLabel(c)} icon={causeOf(c).icon} on={join.causes.includes(c)} onClick={() => setJoin((f) => ({ ...f, causes: toggleIn(f.causes, c) }))} py={9} px={14} fs={14} role="checkbox" />
            ))}
          </div>
        </div>
        <div className="vu-ob-sec">
          <div id="ob-win" style={S(LABEL)}>
            When are you usually free? <span style={S(OPTIONAL)}>(optional)</span>
          </div>
          <div role="group" aria-labelledby="ob-win" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
            {WINDOWS.map((w) => (
              <Chip key={w} label={w} on={join.windows.includes(w)} onClick={() => setJoin((f) => ({ ...f, windows: toggleIn(f.windows, w) }))} py={9} px={14} fs={14} role="checkbox" />
            ))}
          </div>
        </div>
        <div className="vu-ob-sec" style={S('max-width:340px')}>
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
        <div className="vu-ob-sec">
          <PillChoice id="ob-vol" label="Have you volunteered before?" options={VOLUNTEERED} value={join.volunteered} onChange={set('volunteered')} />
        </div>
      </div>
      <FinishRow label={label} busyLabel="Saving" busy={busy} onFinish={onFinish} onBack={onBack} onSkip={onSkip} />
    </div>
  );
}

function FinishRow({ label, busyLabel, busy, onFinish, onBack, onSkip }) {
  return (
    <div className="vu-ob-actions" style={S(`margin-top:36px;padding-top:24px;border-top:1px solid ${C.line}`)}>
      <Button variant="primary" size="lg" busy={busy} onClick={onFinish} extra="min-width:188px">
        {busy ? busyLabel : label}
      </Button>
      <span style={S('display:inline-flex;align-items:center;gap:20px')}>
        <Button variant="ghost" size="sm" icon="arrow-left" iconSize={15} onClick={onBack}>
          Back
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip for now
        </Button>
      </span>
    </div>
  );
}

