'use client';

/* ==========================================================================
   Apply.jsx, design screen: `isApply`
   Three steps plus a confirmation. "Sign up" on the review step becomes
   "Signed up". Only upcoming shifts can be picked, and an existing sign-up is
   respected. The draft survives navigating away.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, Field, TextArea, RadioDot, Checkbox, EmptyState } from '../ui.jsx';
import { useSnapshot, update } from '../../lib/store.js';
import { toast } from '../../lib/overlays.js';
import { getOpportunity, spotsLeft, spotsLabel, applicationFor, submitApplication, updateAccount, perform, validateEmail } from '../../lib/db.js';
import { isPastShift } from '../../lib/calendar.js';
import { shiftTime, ArrowLeft, SearchIcon } from './Detail.jsx';
import { VERIFIED_LABEL, VERIFIED_NOTE, SR_ONLY } from './JoinListing.jsx';

const MONO = "'Geist Mono',monospace";
const STEP_LABELS = ['Role and date', 'About you', 'Review'];
const NOTE_MAX = 400;
const PRIMARY = 'display:inline-flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer;transition:background .16s ease, transform .16s ease';
const SECONDARY = 'display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;flex:none;padding:0 16px;height:44px;border-radius:12px;border:1px solid #E7C0AC;background:#fff;font:600 15px/1 Geist;color:#C2603C;cursor:pointer';
const SMALL_LABEL = `font:500 12px/1 ${MONO};color:#8A8179`;

const isActive = (app) => !!app && app.st !== 'Withdrawn' && app.st !== 'Declined';
const shiftLine = (sh) => `${sh.d}, ${shiftTime(sh.tLong || sh.t)}`;

/** Keep ?shift= only when it's an upcoming shift of this opportunity. */
function upcomingShiftId(opp, id) {
  if (!opp || !id) return null;
  const sh = opp.shifts.find((x) => x.id === id);
  return sh && !isPastShift(sh) ? sh.id : null;
}

export default function Apply({ id }) {
  const router = useRouter();
  const params = useSearchParams();
  const { state } = useSnapshot();
  const opp = getOpportunity(id);

  const saved = state.drafts.apply[id];
  const [draft, setDraft] = useState(() => {
    const base = { step: 1, roleId: null, shiftId: null, why: '', shareRecord: true, ...(saved || {}) };
    // A finished draft starts over on a fresh visit; an active sign-up then
    // shows the "already signed up" panel instead of the form.
    if (base.step === 4) base.step = 1;
    const fromParam = upcomingShiftId(opp, params.get('shift'));
    const kept = upcomingShiftId(opp, base.shiftId);
    return { ...base, shiftId: fromParam || kept };
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState({
    name: state.account.name || '',
    school: state.account.school || '',
    guardianEmail: state.account.guardianEmail || '',
  });

  // Autosave the draft so a back-navigation mid-application loses nothing.
  useEffect(() => {
    if (!opp) return;
    update(
      (st) => {
        st.drafts.apply = { ...st.drafts.apply, [id]: draft };
      },
      { silent: true }
    );
  }, [draft, id, opp]);

  if (!opp) {
    return (
      <div className="vu-pad-40" style={S('padding:28px 40px 96px;max-width:1040px')}>
        <EmptyState
          icon={<SearchIcon />}
          title="This opportunity isn't listed anymore"
          body="The organization took it down. Other opportunities are open on Discover."
          cta="Browse opportunities"
          onCta={() => router.push('/discover')}
        />
      </div>
    );
  }

  const step = Math.min(4, Math.max(1, draft.step || 1));
  const existing = applicationFor(opp.id);
  const alreadySent = isActive(existing) && step !== 4;
  const existingShift = existing ? opp.shifts.find((x) => x.id === existing.shiftId) : null;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  function validateStep(n) {
    const e = {};
    if (n === 1) {
      if (!draft.roleId) e.role = 'Choose a role.';
      const sh = draft.shiftId ? opp.shifts.find((x) => x.id === draft.shiftId) : null;
      if (!sh) e.shift = 'Choose a date.';
      else if (isPastShift(sh)) e.shift = 'That date already passed. Choose another.';
      else if (spotsLeft(sh) <= 0) e.shift = 'That shift filled up. Choose another date.';
    }
    if (n === 2) {
      if (!profile.name.trim()) e.name = 'Enter your name.';
      if (!profile.school.trim()) e.school = 'Enter your school.';
      if (profile.guardianEmail && profile.guardianEmail !== 'consent on file') {
        const err = validateEmail(profile.guardianEmail);
        if (err) e.guardianEmail = err;
      }
      if (draft.why && draft.why.length > NOTE_MAX) e.why = `Keep this under ${NOTE_MAX} characters.`;
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  function next() {
    if (!validateStep(step)) {
      toast({ title: 'Check the highlighted fields', message: step === 1 ? 'Choose a role and a date.' : undefined, tone: 'warn' });
      return;
    }
    if (step === 2) updateAccount({ name: profile.name.trim(), school: profile.school.trim(), guardianEmail: profile.guardianEmail.trim() });
    setErrors({});
    set({ step: step + 1 });
    window.scrollTo(0, 0);
  }

  function prev() {
    setErrors({});
    set({ step: Math.max(1, step - 1) });
    window.scrollTo(0, 0);
  }

  async function submit() {
    if (sending) return;
    if (!validateStep(1)) {
      set({ step: 1 });
      return;
    }
    setSending(true);
    try {
      await perform('apply.submit', () =>
        submitApplication({
          oppId: opp.id,
          roleId: draft.roleId,
          shiftId: draft.shiftId,
          note: draft.why,
          shareRecord: draft.shareRecord,
          remindMe: false,
        })
      );
      const sh = opp.shifts.find((x) => x.id === draft.shiftId);
      set({ step: 4 });
      window.scrollTo(0, 0);
      toast({ title: 'Signed up', message: sh ? `${shiftLine(sh)} at ${opp.org}.` : opp.org, tone: 'ok' });
    } catch (err) {
      if (err && err.code === 'OFFLINE') {
        toast({ title: "You're offline", message: 'Nothing was sent. Your answers are saved.', tone: 'danger' });
      } else if (err && err.code === 'DUPLICATE') {
        toast({ title: 'Already signed up', message: 'You signed up for this date before.', tone: 'warn' });
      } else {
        console.error('[apply] sign-up failed', err);
        toast({ title: "Sign-up didn't go through", message: (err && err.message) || 'Try again in a moment.', tone: 'danger' });
      }
    } finally {
      setSending(false);
    }
  }

  const steps = [1, 2, 3].map((n) => ({
    n,
    label: STEP_LABELS[n - 1],
    bg: step === n ? '#1F1B18' : '#FFFFFF',
    color: step === n ? '#FFFFFF' : '#8A8179',
    border: step === n ? '#1F1B18' : '#E8E1D9',
    titleColor: step >= n ? '#1A1714' : '#8A8179',
    reachable: n <= step && step !== 4,
  }));
  const consentLine = state.account.guardianConsent
    ? "Your parent's OK is on file."
    : `If you're under 16, ${opp.org} may ask for a parent's OK before your first shift.`;

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:28px 40px 96px;max-width:1040px')}>
      <Pressable label="Back to the opportunity" onClick={() => router.push(`/opportunity/${opp.id}`)} className={H.toInk} style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}>
        <ArrowLeft />
        Back to the opportunity
      </Pressable>

      <div style={S('margin-top:16px;display:flex;align-items:center;gap:12px')}>
        <div style={S('width:44px;height:44px;border-radius:11px;overflow:hidden;flex:none')}>
          <ImageSlot src={opp.img || ''} shape="rounded" radius={11} placeholder="logo" alt="" />
        </div>
        <div style={S('min-width:0')}>
          <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            <h1 className="vu-break" style={S('margin:0;font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>{opp.title}</h1>
            {opp.verified ? <span title={VERIFIED_LABEL} style={S(`padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 11px/1 ${MONO};color:#3F6B4E`)}>Verified<span style={S(SR_ONLY)}>. {VERIFIED_NOTE}</span></span> : null}
          </div>
          <div style={S('margin-top:5px;font:450 13px/1.3 Geist;color:#8A8179')}>
            {opp.org}, {opp.hours} {opp.hours === 1 ? 'hour' : 'hours'} per shift
          </div>
        </div>
      </div>

      {alreadySent ? (
        <div style={S('margin-top:24px;padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3;max-width:620px')}>
          <h2 style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.02em')}>You already signed up for this one</h2>
          <div style={S('margin-top:7px;font:450 13px/1.55 Geist;color:#6B635C')}>
            {existing.role}
            {existingShift ? `, ${shiftLine(existingShift)}` : ''}. {existing.st === 'Accepted' ? `${opp.org} confirmed your spot.` : `Waiting on ${opp.org} to confirm.`} To pick a different date, cancel this sign-up on the opportunity page first.
          </div>
          <div style={S('margin-top:16px;display:flex;gap:10px;flex-wrap:wrap')}>
            <Pressable label="See my sign-up" onClick={() => router.push(`/opportunity/${opp.id}`)} className={cx(H.primary, H.press)} style={S(PRIMARY)}>
              See my sign-up
            </Pressable>
            <Pressable label="Keep browsing" onClick={() => router.push('/discover')} className={cx(H.secondary, H.press)} style={S(SECONDARY)}>
              Keep browsing
            </Pressable>
          </div>
        </div>
      ) : (
        <div className="vu-split" style={S('margin-top:24px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:28px;align-items:start')}>
          <div style={S('display:flex;flex-direction:column;gap:6px')}>
            {steps.map((st) => (
              <Pressable
                key={st.n}
                label={`Step ${st.n}, ${st.label}`}
                current={st.n === step ? 'step' : undefined}
                disabled={!st.reachable}
                onClick={() => st.reachable && set({ step: st.n })}
                className={cx(st.reachable ? H.nav : '', H.press)}
                style={s('display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:11px;transition:background .16s ease', `cursor:${st.reachable ? 'pointer' : 'default'}`)}
              >
                <div style={s('width:24px;height:24px;border-radius:8px;display:grid;place-items:center;flex:none', `border:1px solid ${st.border}`, `background:${st.bg}`, `color:${st.color}`, `font:600 11px/1 ${MONO}`)}>
                  {st.n}
                </div>
                <div style={s('font:500 13px/1 Geist', `color:${st.titleColor}`)}>{st.label}</div>
              </Pressable>
            ))}
            <div style={S('margin-top:14px;padding:16px;border-radius:12px;border:1px solid #EFE3DC;background:#FAF6F3')}>
              <div style={S('font:600 13px/1.2 Geist;color:#332D28')}>Good to know</div>
              <div style={S('margin-top:8px;font:450 12.5px/1.5 Geist;color:#6B635C')}>
                {opp.groupShift ? "It's a group shift. " : ''}
                {consentLine}
              </div>
            </div>
          </div>

          <div style={S('min-width:0')}>
            {step === 1 ? <StepRole opp={opp} draft={draft} set={set} errors={errors} onNext={next} /> : null}
            {step === 2 ? <StepAbout opp={opp} draft={draft} set={set} account={state.account} profile={profile} setProfile={setProfile} errors={errors} onNext={next} onBack={prev} /> : null}
            {step === 3 ? <StepReview opp={opp} draft={draft} account={state.account} sending={sending} onSubmit={submit} onBack={prev} /> : null}
            {step === 4 ? <StepDone opp={opp} draft={draft} router={router} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function stepLabel(n) {
  return `Step ${Math.min(3, n)} of 3`;
}

function CardShell({ children, pad = 26 }) {
  return <div className="vu-screen" style={s(`padding:${pad}px`, 'border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>{children}</div>;
}

function NextButton({ label, busyLabel, onClick, busy }) {
  return (
    <Pressable label={label} disabled={busy} onClick={onClick} className={cx(H.primary, H.press)} style={S(PRIMARY)}>
      {busy ? <span className="vu-spin" aria-hidden="true" /> : null}
      {busy ? busyLabel || label : label}
    </Pressable>
  );
}

function BackLink({ onClick }) {
  return (
    <Pressable label="Back" onClick={onClick} className={H.toInk} style={S('font:500 14px/1 Geist;color:#8A8179;cursor:pointer')}>
      Back
    </Pressable>
  );
}

function StepRole({ opp, draft, set, errors, onNext }) {
  const upcoming = opp.shifts.filter((x) => !isPastShift(x));
  return (
    <CardShell>
      <div style={S(SMALL_LABEL)}>{stepLabel(1)}</div>
      <h2 style={S('margin:12px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Pick a role</h2>
      <div role="radiogroup" aria-label="Role" style={S('margin-top:18px;display:flex;flex-direction:column;gap:10px')}>
        {opp.roles.map((r) => {
          const on = draft.roleId === r.id;
          return (
            <Pressable
              key={r.id}
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              label={`${r.t}, ${String(r.m).replace(/\s*·\s*/g, ', ')}`}
              onClick={() => set({ roleId: r.id })}
              className={cx(H.chip, H.press)}
              style={s(
                'padding:16px;border-radius:12px',
                `border:1px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                `background:${on ? '#FAF6F3' : '#FCFAF8'}`,
                'display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;transition:border-color .16s ease, background .16s ease'
              )}
            >
              <div style={S('min-width:0')}>
                <div style={S('font:500 15px/1.2 Geist')}>{r.t}</div>
                <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>{String(r.m).replace(/\s*·\s*/g, ', ')}</div>
              </div>
              <RadioDot checked={on} />
            </Pressable>
          );
        })}
      </div>
      {errors.role ? <div className="vu-err" role="alert">{errors.role}</div> : null}

      <h3 id="vu-apply-shift" style={S('margin:26px 0 0;font:600 17px/1.25 Geist;letter-spacing:-0.02em')}>
        {upcoming.length === 0 ? 'No upcoming dates' : upcoming.length === 1 ? '1 date' : 'Pick a date'}
      </h3>
      <div role="radiogroup" aria-labelledby="vu-apply-shift" style={S('margin-top:12px')}>
        {opp.shifts.map((sh) => {
          const past = isPastShift(sh);
          const on = !past && draft.shiftId === sh.id;
          const full = spotsLeft(sh) <= 0;
          const blocked = past || full;
          const status = past ? 'Past' : full ? 'Full' : spotsLabel(sh);
          return (
            <Pressable
              key={sh.id}
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={blocked}
              label={`${shiftLine(sh)}, ${status}`}
              onClick={() => !blocked && set({ shiftId: sh.id })}
              className={cx(blocked ? '' : H.chip, H.press)}
              style={s(
                'margin-bottom:10px;padding:15px 16px;border-radius:12px',
                `border:1px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                `background:${on ? '#FAF6F3' : blocked ? '#F6F2EE' : '#FCFAF8'}`,
                'display:flex;align-items:center;justify-content:space-between;gap:12px',
                `cursor:${blocked ? 'not-allowed' : 'pointer'}`,
                'transition:border-color .16s ease, background .16s ease'
              )}
            >
              <div style={s('font:500 15px/1.2 Geist', blocked ? 'color:#8A8179' : '')}>{shiftLine(sh)}</div>
              <div style={s(`font:500 12px/1 ${MONO};flex:none`, `color:${full && !past ? '#A8482A' : '#8A8179'}`)}>{status}</div>
            </Pressable>
          );
        })}
      </div>
      {errors.shift ? <div className="vu-err" role="alert">{errors.shift}</div> : null}

      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextButton label="Next" onClick={onNext} />
      </div>
    </CardShell>
  );
}

function StepAbout({ opp, draft, set, account, profile, setProfile, errors, onNext, onBack }) {
  const grade = account.grade ? `Grade ${account.grade}` : 'Not set';
  return (
    <CardShell>
      <div style={S(SMALL_LABEL)}>{stepLabel(2)}</div>
      <h2 style={S('margin:12px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>About you</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C')}>From your profile. Edit anything before you sign up.</div>
      <div className="vu-2col-keep" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Name" value={profile.name} onChange={(v) => setProfile((p) => ({ ...p, name: v }))} bg="#FCFAF8" fs={14} autoComplete="name" required error={errors.name} />
        <Field label="Grade" value={grade} readOnly bg="#FCFAF8" fs={14} hint="Change it in Settings, under Account." />
        <Field label="School" value={profile.school} onChange={(v) => setProfile((p) => ({ ...p, school: v }))} bg="#FCFAF8" fs={14} required error={errors.school} />
        <Field
          label="Parent or guardian email"
          value={profile.guardianEmail}
          onChange={(v) => setProfile((p) => ({ ...p, guardianEmail: v }))}
          bg="#FCFAF8"
          fs={14}
          type="email"
          autoComplete="off"
          hint="Needed if you're under 16."
          error={errors.guardianEmail}
        />
      </div>
      <div style={S('margin-top:22px')}>
        <TextArea
          label="Why this shift (optional)"
          value={draft.why}
          onChange={(v) => set({ why: v })}
          maxLength={NOTE_MAX}
          counter
          minHeight={88}
          bg="#FCFAF8"
          fs={14}
          placeholder="e.g. I helped at my church's food drive"
          error={errors.why}
        />
      </div>
      <div style={S('margin-top:18px;display:flex;flex-direction:column;gap:12px')}>
        <Checkbox checked={draft.shareRecord} onChange={(v) => set({ shareRecord: v })} label={`Let ${opp.org} see the hours I've logged`} />
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextButton label="Review" onClick={onNext} />
        <BackLink onClick={onBack} />
      </div>
    </CardShell>
  );
}

function StepReview({ opp, draft, account, sending, onSubmit, onBack }) {
  const role = opp.roles.find((r) => r.id === draft.roleId);
  const shift = opp.shifts.find((x) => x.id === draft.shiftId);
  const rows = [
    ['Role', role ? role.t : 'Not chosen'],
    ['Date', shift ? shiftLine(shift) : 'Not chosen'],
    ['Length', `${opp.hours} ${opp.hours === 1 ? 'hour' : 'hours'}`],
  ];
  return (
    <CardShell>
      <div style={S(SMALL_LABEL)}>{stepLabel(3)}</div>
      <h2 style={S('margin:12px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Check your sign-up</h2>
      <div style={S('margin-top:20px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
        {rows.map(([l, v]) => (
          <div key={l} style={S('padding:14px 16px;border-bottom:1px solid #F1EBE4;display:flex;justify-content:space-between;gap:12px;font:450 14px/1.3 Geist;color:#57504A')}>
            <span>{l}</span>
            <span style={S('color:#1A1714;font-weight:500;text-align:right')}>{v}</span>
          </div>
        ))}
        <div style={S('padding:14px 16px;display:flex;justify-content:space-between;gap:12px;font:450 14px/1.3 Geist;color:#57504A')}>
          <span>Parent's OK</span>
          <span style={s('font-weight:500;text-align:right', account.guardianConsent ? 'color:#3F6B4E' : 'color:#8A5A20')}>
            {account.guardianConsent ? 'On file' : 'Not on file yet'}
          </span>
        </div>
      </div>
      {draft.why ? (
        <div style={S('margin-top:14px;padding:16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
          <div style={S('font:600 13px/1.2 Geist;color:#332D28')}>What {opp.org} will see</div>
          <div className="vu-break" style={S('margin-top:8px;font:450 14px/1.55 Geist;color:#332D28')}>{draft.why}</div>
        </div>
      ) : null}
      <div style={S('margin-top:20px;font:450 13px/1.55 Geist;color:#6B635C')}>
        {opp.replyTime ? `${opp.replyTime} ` : ''}Their answer shows up on the opportunity page.
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextButton label="Sign up" busyLabel="Signing up" onClick={onSubmit} busy={sending} />
        <BackLink onClick={onBack} />
      </div>
    </CardShell>
  );
}

function StepDone({ opp, draft, router }) {
  const shift = opp.shifts.find((x) => x.id === draft.shiftId);
  return (
    <CardShell pad={34}>
      <div className="vu-pop" aria-hidden="true" style={S('width:40px;height:40px;border-radius:12px;background:#EAF3EC;display:grid;place-items:center;color:#3F6B4E')}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5l3.2 3L13 4.5" />
        </svg>
      </div>
      <h2 style={S('margin:18px 0 0;font:600 28px/1.1 Geist;letter-spacing:-0.035em')}>Signed up</h2>
      <div style={S('margin-top:10px;max-width:460px;font:450 15px/1.6 Geist;color:#6B635C')}>
        {shift ? `${shiftLine(shift)} at ${opp.org}. ` : ''}
        {opp.org} still has to confirm your spot. You'll see their answer on the opportunity page.
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;gap:10px;flex-wrap:wrap')}>
        <Pressable label="See my sign-up" onClick={() => router.push(`/opportunity/${opp.id}`)} className={cx(H.primary, H.press)} style={S(PRIMARY)}>
          See my sign-up
        </Pressable>
        <Pressable label="Keep browsing" onClick={() => router.push('/discover')} className={cx(H.secondary, H.press)} style={S(SECONDARY)}>
          Keep browsing
        </Pressable>
      </div>
    </CardShell>
  );
}
