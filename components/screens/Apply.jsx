'use client';

/* ==========================================================================
   Apply.jsx, design screen: `isApply`
   Three steps plus a confirmation. The draft survives navigating away.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, Field, TextArea, RadioDot, Checkbox, EmptyState } from '../ui.jsx';
import { useSnapshot, update } from '../../lib/store.js';
import { toast } from '../../lib/overlays.js';
import { getOpportunity, spotsLeft, spotsLabel, applicationFor, submitApplication, updateAccount, perform, validateEmail } from '../../lib/db.js';

const MONO = "'Geist Mono',monospace";
const STEP_LABELS = ['Role and shift', 'About you', 'Review'];

export default function Apply({ id }) {
  const router = useRouter();
  const params = useSearchParams();
  const { state } = useSnapshot();
  const opp = getOpportunity(id);

  const saved = state.drafts.apply[id];
  const [draft, setDraft] = useState(() => ({
    step: 1,
    roleId: null,
    shiftId: params.get('shift') || null,
    why: '',
    shareRecord: true,
    remindMe: true,
    ...(saved || {}),
  }));
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState({
    name: state.account.name,
    school: state.account.school,
    guardianEmail: state.account.guardianEmail,
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
          title="That opening is no longer listed"
          body="The organization closed this listing. Other shifts near you are still open this week."
          cta="Browse openings"
          onCta={() => router.push('/discover')}
        />
      </div>
    );
  }

  const step = Math.min(4, Math.max(1, draft.step || 1));
  const existing = applicationFor(opp.id);
  const alreadySent = existing && existing.st !== 'Withdrawn' && existing.st !== 'Declined' && step !== 4;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  function validateStep(n) {
    const e = {};
    if (n === 1) {
      if (!draft.roleId) e.role = 'Pick the role you want.';
      if (!draft.shiftId) e.shift = 'Pick a shift.';
      else {
        const sh = opp.shifts.find((x) => x.id === draft.shiftId);
        if (sh && spotsLeft(sh) <= 0) e.shift = 'That shift filled up. Pick another.';
      }
    }
    if (n === 2) {
      if (!profile.name.trim()) e.name = 'The organization needs a name.';
      if (!profile.school.trim()) e.school = 'Which school are you at?';
      if (profile.guardianEmail && profile.guardianEmail !== 'consent on file') {
        const err = validateEmail(profile.guardianEmail);
        if (err) e.guardianEmail = err;
      }
      if (draft.why && draft.why.length > 400) e.why = 'Trim this to 400 characters.';
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  function next() {
    if (!validateStep(step)) {
      toast({ title: 'One thing first', message: step === 1 ? 'Choose a role and a shift.' : 'Check the highlighted fields.', tone: 'warn' });
      return;
    }
    if (step === 2) updateAccount({ name: profile.name.trim(), school: profile.school.trim(), guardianEmail: profile.guardianEmail });
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
          remindMe: draft.remindMe,
        })
      );
      set({ step: 4 });
      window.scrollTo(0, 0);
      toast({ title: 'Application sent', message: `${opp.org} will reply soon.`, tone: 'ok' });
    } catch (err) {
      if (err && err.code === 'OFFLINE') {
        toast({ title: 'You are offline', message: 'Nothing was sent. Your answers are saved, try again once you reconnect.', tone: 'danger' });
      } else if (err && err.code === 'DUPLICATE') {
        toast({ title: 'Already sending', message: 'Give it a second.', tone: 'warn' });
      } else {
        toast({ title: 'That did not send', message: (err && err.message) || 'Try again in a moment.', tone: 'danger' });
      }
    } finally {
      setSending(false);
    }
  }

  const steps = [1, 2, 3].map((n) => ({
    n,
    label: STEP_LABELS[n - 1],
    bg: step === n ? '#1F1B18' : '#FFFFFF',
    color: step === n ? '#FFFFFF' : '#A9A097',
    border: step === n ? '#1F1B18' : '#E8E1D9',
    titleColor: step >= n ? '#1A1714' : '#A9A097',
    reachable: n <= step,
  }));

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:28px 40px 96px;max-width:1040px')}>
      <Pressable label="Back to the opportunity" onClick={() => router.push(`/opportunity/${opp.id}`)} className={H.toInk} style={S('font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}>
        ← Back to the opportunity
      </Pressable>

      <div style={S('margin-top:16px;display:flex;align-items:center;gap:12px')}>
        <div style={S('width:44px;height:44px;border-radius:11px;overflow:hidden;flex:none')}>
          <ImageSlot src={''} shape="rounded" radius={11} placeholder="logo" />
        </div>
        <div>
          <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            <div style={S('font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>{opp.title}</div>
            {opp.verified ? <span style={S(`padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>✓ VERIFIED</span> : null}
          </div>
          <div style={S('margin-top:5px;font:450 13px/1 Geist;color:#8A8179')}>
            {opp.org} · {opp.distance} mi · {opp.hours} hours per shift
          </div>
        </div>
      </div>

      {alreadySent ? (
        <div style={S('margin-top:24px;padding:20px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3;max-width:620px')}>
          <div style={S('font:600 16px/1.3 Geist;letter-spacing:-0.02em')}>You already applied to this one</div>
          <div style={S('margin-top:7px;font:450 13px/1.55 Geist;color:#6B635C')}>
            Your application is {String(existing.st).toLowerCase()} for {existing.role}. You can withdraw it from the opportunity page before applying to a
            different shift.
          </div>
          <div style={S('margin-top:16px;display:flex;gap:10px;flex-wrap:wrap')}>
            <Pressable
              label="See my application"
              onClick={() => router.push(`/opportunity/${opp.id}`)}
              className={cx(H.primary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:9px;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)')}
            >
              <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
              See my application
            </Pressable>
            <Pressable
              label="Keep browsing"
              onClick={() => router.push('/discover')}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 16px;height:44px;border-radius:12px;border:1px solid #E7C0AC;background:#fff;font:600 15px/1 Geist;color:#C2603C;cursor:pointer')}
            >
              Keep browsing
            </Pressable>
          </div>
        </div>
      ) : (
        <div className="vu-split" style={S('margin-top:24px;display:grid;grid-template-columns:220px 1fr;gap:28px;align-items:start')}>
          <div style={S('display:flex;flex-direction:column;gap:6px')}>
            {steps.map((st) => (
              <Pressable
                key={st.n}
                label={`Step ${st.n}: ${st.label}`}
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
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Good to know</div>
              <div style={S('margin-top:10px;font:450 12px/1.5 Geist;color:#6B635C')}>
                {opp.groupShift ? 'Never a solo shift. ' : ''}A background-checked staff lead runs every session and your guardian consent is already on file.
              </div>
            </div>
          </div>

          <div>
            {step === 1 ? <StepRole opp={opp} draft={draft} set={set} errors={errors} onNext={next} /> : null}
            {step === 2 ? <StepAbout opp={opp} draft={draft} set={set} profile={profile} setProfile={setProfile} errors={errors} onNext={next} onBack={prev} /> : null}
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

function NextButton({ label, onClick, busy }) {
  return (
    <Pressable
      label={label}
      disabled={busy}
      onClick={onClick}
      className={H.press}
      style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:background .16s ease, transform .16s ease')}
    >
      {busy ? <span className="vu-spin" /> : <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>}
      {busy ? 'Sending' : label}
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
  return (
    <CardShell>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>{stepLabel(1)}</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Pick a role</h2>
      <div role="radiogroup" aria-label="Role" style={S('margin-top:18px;display:flex;flex-direction:column;gap:10px')}>
        {opp.roles.map((r) => {
          const on = draft.roleId === r.id;
          return (
            <Pressable
              key={r.id}
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              label={`${r.t}. ${r.m}`}
              onClick={() => set({ roleId: r.id })}
              className={cx(H.chip, H.press)}
              style={s(
                'padding:16px;border-radius:12px',
                `border:1px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                `background:${on ? '#FAF6F3' : '#FCFAF8'}`,
                'display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;transition:border-color .16s ease, background .16s ease'
              )}
            >
              <div>
                <div style={S('font:500 15px/1.2 Geist')}>{r.t}</div>
                <div style={S('margin-top:5px;font:450 12px/1.3 Geist;color:#8A8179')}>{r.m}</div>
              </div>
              <RadioDot checked={on} />
            </Pressable>
          );
        })}
      </div>
      {errors.role ? <div className="vu-err">{errors.role}</div> : null}

      <div id="vu-apply-shift" style={S(`margin-top:26px;font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>
        Choose your shift
      </div>
      <div role="radiogroup" aria-labelledby="vu-apply-shift" style={S('margin-top:14px')}>
        {opp.shifts.map((sh) => {
          const on = draft.shiftId === sh.id;
          const left = spotsLeft(sh);
          const full = left <= 0;
          return (
            <Pressable
              key={sh.id}
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={full}
              label={`${sh.d}, ${sh.tLong}${full ? ', full' : `, ${spotsLabel(sh)}`}`}
              onClick={() => !full && set({ shiftId: sh.id })}
              className={cx(full ? '' : H.chip, H.press)}
              style={s(
                'margin-bottom:10px;padding:15px 16px;border-radius:12px',
                `border:1px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                `background:${on ? '#FAF6F3' : '#FCFAF8'}`,
                'display:flex;align-items:center;justify-content:space-between;gap:12px',
                `cursor:${full ? 'not-allowed' : 'pointer'}`,
                'transition:border-color .16s ease, background .16s ease'
              )}
            >
              <div style={S('font:500 15px/1 Geist')}>
                {sh.d} · {sh.tLong}
              </div>
              <div style={s(`font:500 12px/1 ${MONO};flex:none`, `color:${full ? '#A8482A' : '#8A8179'}`)}>{full ? 'full' : spotsLabel(sh)}</div>
            </Pressable>
          );
        })}
      </div>
      {errors.shift ? <div className="vu-err">{errors.shift}</div> : null}

      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextButton label="Continue" onClick={onNext} />
        <div style={S('font:450 13px/1 Geist;color:#A9A097')}>Takes about a minute</div>
      </div>
    </CardShell>
  );
}

function StepAbout({ opp, draft, set, profile, setProfile, errors, onNext, onBack }) {
  const a = { grade: 11, age: 16 };
  return (
    <CardShell>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>{stepLabel(2)}</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>About you</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C')}>Pulled from your profile. Edit anything before it goes to the organization.</div>
      <div className="vu-2col-keep" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Name" value={profile.name} onChange={(v) => setProfile((p) => ({ ...p, name: v }))} bg="#FCFAF8" fs={14} autoComplete="name" required error={errors.name} />
        <Field label="Grade and age" value={`Grade ${a.grade} · ${a.age}`} readOnly bg="#FCFAF8" fs={14} hint="Change this in Settings → Account." />
        <Field label="School" value={profile.school} onChange={(v) => setProfile((p) => ({ ...p, school: v }))} bg="#FCFAF8" fs={14} required error={errors.school} />
        <Field label="Guardian email" value={profile.guardianEmail} onChange={(v) => setProfile((p) => ({ ...p, guardianEmail: v }))} bg="#FCFAF8" fs={14} error={errors.guardianEmail} />
      </div>
      <div style={S('margin-top:22px')}>
        <TextArea
          label="Why this shift"
          value={draft.why}
          onChange={(v) => set({ why: v })}
          maxLength={400}
          counter
          minHeight={88}
          bg="#FCFAF8"
          fs={14}
          placeholder="A sentence or two about why you want this shift and what you can bring."
          error={errors.why}
        />
      </div>
      <div style={S('margin-top:18px;display:flex;flex-direction:column;gap:12px')}>
        <Checkbox checked={draft.shareRecord} onChange={(v) => set({ shareRecord: v })} label="Share my verified hours and cause history with this organization" />
        <Checkbox checked={draft.remindMe} onChange={(v) => set({ remindMe: v })} label="Text me a reminder 24 hours before the shift" />
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
    ['Role', role ? role.t : '-'],
    ['Shift', shift ? `${shift.d} · ${shift.tLong}` : '-'],
    ['Hours credited', `${opp.hours.toFixed(1)} verified`],
    ['Counts toward school', opp.countsForSchool ? 'Yes' : 'No'],
  ];
  return (
    <CardShell>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>{stepLabel(3)}</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Check and send</h2>
      <div style={S('margin-top:20px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
        {rows.map(([l, v]) => (
          <div key={l} style={S('padding:14px 16px;border-bottom:1px solid #F1EBE4;display:flex;justify-content:space-between;gap:12px;font:450 14px/1 Geist;color:#57504A')}>
            <span>{l}</span>
            <span style={S('color:#1A1714;font-weight:500')}>{v}</span>
          </div>
        ))}
        <div style={S('padding:14px 16px;display:flex;justify-content:space-between;gap:12px;font:450 14px/1 Geist;color:#57504A')}>
          <span>Guardian consent</span>
          <span style={S('color:#3F6B4E;font-weight:500')}>{account.guardianConsent ? 'On file' : 'Needed'}</span>
        </div>
      </div>
      {draft.why ? (
        <div style={S('margin-top:14px;padding:16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your note</div>
          <div className="vu-break" style={S('margin-top:8px;font:450 14px/1.55 Geist;color:#332D28')}>{draft.why}</div>
        </div>
      ) : null}
      <div style={S('margin-top:20px;padding:16px;border-radius:12px;background:#FCFAF8;border:1px solid #F1EBE4;font:450 13px/1.55 Geist;color:#6B635C')}>
        {opp.replyTime} You will get the room details and the check-in code once you are confirmed.
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextButton label="Send application" onClick={onSubmit} busy={sending} />
        <BackLink onClick={onBack} />
      </div>
    </CardShell>
  );
}

function StepDone({ opp, draft, router }) {
  const shift = opp.shifts.find((x) => x.id === draft.shiftId);
  return (
    <CardShell pad={34}>
      <div className="vu-pop" style={S('width:40px;height:40px;border-radius:12px;background:#EAF3EC;display:grid;place-items:center;font:600 16px/1 Geist;color:#3F6B4E')}>✓</div>
      <h2 style={S('margin:18px 0 0;font:600 28px/1.1 Geist;letter-spacing:-0.035em')}>Application sent</h2>
      <div style={S('margin-top:10px;max-width:460px;font:450 15px/1.6 Geist;color:#6B635C')}>
        It is now in your projects as pending. We will text you when {opp.org.split(' ')[0]} confirms, and the shift will appear on your dashboard.
        {shift ? ` Your shift is ${shift.d}, ${shift.tLong}.` : ''}
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;gap:10px')}>
        <Pressable
          label="See my applications"
          onClick={() => router.push('/profile?focus=applications')}
          className={cx(H.primaryLift, H.press)}
          style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:background .16s ease, transform .16s ease')}
        >
          <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
          See my applications
        </Pressable>
        <Pressable
          label="Keep browsing"
          onClick={() => router.push('/discover')}
          className={cx(H.secondaryLift, H.press)}
          style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 16px;height:44px;border-radius:12px;border:1px solid #E7C0AC;background:#fff;font:600 15px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease')}
        >
          Keep browsing
        </Pressable>
      </div>
    </CardShell>
  );
}
