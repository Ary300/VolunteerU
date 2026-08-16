'use client';

/* ==========================================================================
   Auth.jsx — sign in, sign up, forgot / reset password
   The design shows a "Sign in" entry point but no auth screens, so these are
   built from the same split layout the onboarding screen uses.
   ========================================================================== */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Field, PrimaryButton, SecondaryButton, ImageSlot, Checkbox } from '../ui.jsx';
import { toast } from '../../lib/overlays.js';
import { useSnapshot, update, resetStore } from '../../lib/store.js';
import { supabase } from '../../lib/supabase.js';
import { validateEmail, validatePassword, passwordStrength, signIn, signUp, perform } from '../../lib/db.js';

const MONO = "'Geist Mono',monospace";

const COPY = {
  signin: {
    kicker: 'Welcome back',
    title: 'Sign in to VolunteerU',
    sub: 'Your hours, applications and workspace are exactly where you left them.',
    cta: 'Sign in',
  },
  signup: {
    kicker: 'Two minutes to set up',
    title: 'Create your account',
    sub: 'Free for students, on both sides. You pick what you want to do next.',
    cta: 'Create account',
  },
  forgot: {
    kicker: 'Password help',
    title: 'Reset your password',
    sub: 'We send a reset link to the email on your account. It expires in an hour.',
    cta: 'Send reset link',
  },
};

export default function Auth({ mode = 'signin' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/app';
  const { state } = useSnapshot();

  const [form, setForm] = useState({
    email: mode === 'signin' ? state.account.email : '',
    password: '',
    confirm: '',
    firstName: '',
    lastName: '',
    remember: true,
    agree: false,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const copy = COPY[mode];
  const strength = passwordStrength(form.password);

  function validate() {
    const e = {};
    const emailErr = validateEmail(form.email);
    if (emailErr) e.email = emailErr;
    if (mode !== 'forgot') {
      const pwErr = validatePassword(form.password);
      if (pwErr) e.password = pwErr;
    }
    if (mode === 'signup') {
      if (!form.firstName.trim()) e.firstName = 'Enter your first name.';
      if (form.confirm !== form.password) e.confirm = 'Those passwords do not match.';
      if (!form.agree) e.agree = 'You need to accept the terms to create an account.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    if (!validate()) {
      toast({ title: 'Check the highlighted fields', tone: 'warn' });
      return;
    }
    setBusy(true);
    try {
      await perform(`auth.${mode}`, async () => {
        if (mode === 'signin') {
          await signIn(form.email.trim(), form.password);
          update((st) => {
            st.session.remember = form.remember;
          });
        } else if (mode === 'signup') {
          await signUp({
            email: form.email.trim(),
            password: form.password,
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
          });
        }
      });

      if (mode === 'forgot') {
        setSent(true);
        toast({ title: 'Reset link sent', message: `Check ${form.email} for a link that expires in an hour.`, tone: 'ok' });
      } else if (mode === 'signin') {
        toast({ title: `Welcome back, ${state.account.firstName}`, tone: 'ok' });
        router.replace(next);
      } else {
        toast({ title: 'Account created', message: 'Now tell us what you are here to do.', tone: 'ok' });
        router.replace('/onboarding');
      }
    } catch (err) {
      if (err && err.code === 'OFFLINE') {
        toast({ title: 'You are offline', message: 'Reconnect and try again — nothing was sent.', tone: 'danger' });
      } else if (err && err.code === 'AUTH') {
        toast({ title: mode === 'signup' ? 'Could not create your account' : 'Could not sign you in', message: err.message, tone: 'danger' });
      } else if (err && err.code !== 'DUPLICATE') {
        toast({ title: 'That did not go through', message: 'Try again in a moment.', tone: 'danger' });
      }
    } finally {
      setBusy(false);
    }
  }

  function demo() {
    // A preview of the seeded record — no real account needed. It persists for
    // this browser (via a flag the auth bridge respects) until sign-out.
    try { sessionStorage.setItem('vu.demo', '1'); } catch { /* private mode */ }
    // Drop any real session so it can't override the seed on the next load.
    if (supabase) supabase.auth.signOut().catch(() => {});
    resetStore(); // state = the full seeded record (record, project, roster)
    update((st) => {
      st.session.authed = true;
      st.session.signedInAt = Date.now();
      st.onboarding.completed = true;
    });
    toast({ title: `Signed in as ${state.account.name}`, message: 'Demo account with a seeded record and one live project.', tone: 'ok' });
    router.replace(next);
  }

  return (
    <div className="vu-onboard vu-fixed-width vu-screen" style={S('display:grid;grid-template-columns:1fr 1.08fr;min-height:100vh;min-width:1180px')}>
      <div
        className="vu-onboard-aside"
        style={S('position:relative;background:#1F1B18;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 1px,transparent 1px 8px);padding:56px 52px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden')}
      >
        <div aria-hidden="true" style={S('position:absolute;top:-120px;left:-120px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(210,119,91,.3),rgba(210,119,91,0) 62%)')} />
        <Link href="/" style={S('position:relative;display:flex;align-items:center;gap:9px;width:max-content;color:inherit')}>
          <div aria-hidden="true" style={S('width:24px;height:24px;border-radius:7px;background:linear-gradient(150deg,#D2775B,#B14E2C);display:grid;place-items:center;color:#fff;font:700 12px/1 Geist')}>V</div>
          <div style={S('font:600 16px/1 Geist;letter-spacing:-0.03em;color:#fff')}>VolunteerU</div>
        </Link>
        <div style={S('position:relative;max-width:400px')}>
          <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#D2775B`)}>{copy.kicker}</div>
          <h2 style={S('margin:16px 0 0;font:600 34px/1.14 Geist;letter-spacing:-0.04em;color:#fff;text-wrap:balance')}>
            Your hours count themselves
          </h2>
          <p style={S('margin:14px 0 0;font:400 16px/1.6 Geist;color:#A79E96;text-wrap:pretty')}>
            Check in when you arrive and out when you leave. The organization confirms each shift, so your verified hours are ready the moment a school or scholarship asks.
          </p>
          <div style={S('margin-top:34px;padding:18px;border-radius:14px;background:#26221E;border:1px solid #363029')}>
            <div style={S('font:450 14px/1.55 Geist;color:#CFC7BF')}>
              “The verified hours page went straight into my scholarship application. No chasing signatures.”
            </div>
            <div style={S('margin-top:12px;display:flex;align-items:center;gap:10px')}>
              <div style={S('width:26px;height:26px;border-radius:50%;overflow:hidden;flex:none')}>
                <ImageSlot src="https://picsum.photos/seed/proof2/400/400?grayscale" shape="circle" placeholder="face" />
              </div>
              <div style={S('font:500 12px/1 Geist;color:#8B8078')}>Deven A. · Grade 12</div>
            </div>
          </div>
        </div>
        <div style={S('position:relative;font:450 12px/1.5 Geist;color:#6E655D')}>Free for students · Vetted organizations only · Ages 13+</div>
      </div>

      <div className="vu-onboard-form" id="vu-main" style={S('background:#FAF8F5;padding:56px 60px;display:flex;flex-direction:column;justify-content:center')}>
        <div style={S('max-width:460px;width:100%')}>
          <h1 style={S('margin:0;font:600 34px/1.08 Geist;letter-spacing:-0.04em')}>{copy.title}</h1>
          <p style={S('margin:10px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>{copy.sub}</p>

          {sent ? (
            <div style={S('margin-top:26px;padding:20px;border-radius:14px;border:1px solid #DCEADF;background:#EAF3EC')}>
              <div style={S('font:600 15px/1.3 Geist;color:#3F6B4E')}>Check your inbox</div>
              <div style={S('margin-top:7px;font:450 13px/1.55 Geist;color:#4E6B57')}>
                If an account exists for {form.email} we just sent a reset link. It expires in an hour.
              </div>
              <div style={S('margin-top:16px;display:flex;gap:10px;flex-wrap:wrap')}>
                <SecondaryButton h={40} px={16} r={11} fs={14} onClick={() => router.push('/signin')}>
                  Back to sign in
                </SecondaryButton>
                <SecondaryButton h={40} px={16} r={11} fs={14} onClick={() => setSent(false)}>
                  Use a different email
                </SecondaryButton>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate style={S('margin-top:26px')}>
              {mode === 'signup' ? (
                <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
                  <Field label="First name" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" maxLength={40} required error={errors.firstName} />
                  <Field label="Last name" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" maxLength={40} />
                </div>
              ) : null}

              <div style={S(mode === 'signup' ? 'margin-top:14px' : '')}>
                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="you@school.edu"
                  autoComplete="email"
                  inputMode="email"
                  required
                  error={errors.email}
                />
              </div>

              {mode !== 'forgot' ? (
                <div style={S('margin-top:14px')}>
                  <Field
                    label="Password"
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    error={errors.password}
                    hint={mode === 'signup' && form.password && !errors.password ? `Strength: ${strength.label}` : undefined}
                  />
                  {mode === 'signup' && form.password ? (
                    <div style={S('margin-top:8px;display:flex;gap:4px')} aria-hidden="true">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          style={s(
                            'flex:1;height:3px;border-radius:2px',
                            `background:${i < strength.score ? (strength.score >= 4 ? '#3F6B4E' : strength.score >= 3 ? '#C2603C' : '#E0A188') : '#EFE7DF'}`,
                            'transition:background .16s ease'
                          )}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {mode === 'signup' ? (
                <div style={S('margin-top:14px')}>
                  <Field label="Confirm password" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required error={errors.confirm} />
                </div>
              ) : null}

              {mode === 'signin' ? (
                <div style={S('margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
                  <Checkbox checked={form.remember} onChange={set('remember')} label="Keep me signed in" size={16} />
                  <Link href="/forgot" className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C')}>
                    Forgot password?
                  </Link>
                </div>
              ) : null}

              {mode === 'signup' ? (
                <div style={S('margin-top:16px')}>
                  <Checkbox
                    checked={form.agree}
                    onChange={set('agree')}
                    size={16}
                    label="I am 13 or older and accept the terms and privacy policy."
                  />
                  {errors.agree ? <div className="vu-err">{errors.agree}</div> : null}
                </div>
              ) : null}

              <div style={S('margin-top:24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
                <PrimaryButton type="submit" h={46} px={24} r={12} fs={15} sh="inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55)" busy={busy} lift iconSize={12}>
                  {busy ? 'Working' : copy.cta}
                </PrimaryButton>
                {mode === 'forgot' ? (
                  <Link href="/signin" className={H.toInk} style={S('font:500 14px/1 Geist;color:#8A8179')}>
                    Back to sign in
                  </Link>
                ) : null}
              </div>
            </form>
          )}

          {mode !== 'forgot' && !sent ? (
            <>
              <div style={S('margin-top:26px;display:flex;align-items:center;gap:12px')}>
                <div style={S('flex:1;height:1px;background:#EFE9E2')} />
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#BEB5AC`)}>or</div>
                <div style={S('flex:1;height:1px;background:#EFE9E2')} />
              </div>
              <div style={S('margin-top:18px')}>
                <SecondaryButton full center h={44} px={18} r={12} fs={14} onClick={demo}>
                  Continue as {state.account.name} (demo account)
                </SecondaryButton>
                <div className="vu-hint">Loads a seeded record: 86 verified hours, four applications and one live project.</div>
              </div>
            </>
          ) : null}

          {!sent ? (
            <div style={S('margin-top:24px;font:450 13px/1.5 Geist;color:#8A8179')}>
              {mode === 'signin' ? (
                <>
                  New here?{' '}
                  <Link href="/signup" className={H.link} style={S('color:#C2603C;font-weight:500')}>
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Link href="/signin" className={H.link} style={S('color:#C2603C;font-weight:500')}>
                    Sign in
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
