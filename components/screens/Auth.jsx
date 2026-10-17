'use client';

/* ==========================================================================
   Auth.jsx, sign in, sign up, forgot / reset password
   Same split layout as onboarding: a dark aside with what the app does and a
   photo, and the form on the cream side. On phones the aside shrinks to a
   logo bar so the form starts near the top of the screen.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, H } from '../../lib/style.js';
import { Field, PrimaryButton, SecondaryButton, Checkbox } from '../ui.jsx';
import { Logo } from '../Logo.jsx';
import { toast } from '../../lib/overlays.js';
import { useSnapshot, getState } from '../../lib/store.js';
import { supabase } from '../../lib/supabase.js';
import { EMAIL_RX, passwordStrength, signIn, signUp, perform } from '../../lib/db.js';
import { sameSitePath } from '../../lib/safePath.js';
import { PEXELS } from '../../lib/seed.js';

// The only ?intent= values onboarding understands.
const SIGNUP_INTENTS = ['start', 'join', 'both'];

const COPY = {
  signin: { title: 'Sign in', sub: '', cta: 'Sign in', busy: 'Signing in' },
  signup: {
    title: 'Create your account',
    sub: "Find volunteer opportunities and nonprofits near you. It's free.",
    cta: 'Create account',
    busy: 'Creating account',
  },
  forgot: {
    title: 'Reset your password',
    sub: "Enter the email you signed up with and we'll send you a reset link.",
    cta: 'Send reset link',
    busy: 'Sending link',
  },
  reset: { title: 'Choose a new password', sub: '', cta: 'Save new password', busy: 'Saving password' },
};

const PASSWORD_RULE = 'At least 8 characters, with a letter and a number.';
const FIELD_ORDER = ['firstName', 'email', 'password', 'confirm', 'agree'];
const FIELD_ID = { firstName: 'auth-first', email: 'auth-email', password: 'auth-password', confirm: 'auth-confirm', agree: 'auth-agree' };

/* Phone layout lives here because globals.css is shared; class names are
   scoped to this screen. */
const AUTH_CSS = `
@media (max-width: 1179px) {
  .vu-auth { grid-template-columns:1fr !important; grid-template-rows:auto 1fr; }
  .vu-auth-aside { padding:16px 20px !important; }
  .vu-auth-pitch, .vu-auth-foot { display:none !important; }
  .vu-auth-form { justify-content:flex-start !important; padding:32px 20px 48px !important; }
}
`;

function newPasswordError(v) {
  if (!v) return 'Enter a password.';
  if (v.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/i.test(v) || !/[0-9]/.test(v)) return 'Use at least 1 letter and 1 number.';
  return null;
}

function emailError(v) {
  const t = (v || '').trim();
  if (!t) return 'Enter your email address.';
  if (!EMAIL_RX.test(t)) return 'Enter an email address like name@example.com.';
  return null;
}

/** Map a failed auth call to a plain message. Raw server text only goes to the console. */
function describeFailure(mode, err, email) {
  const raw = String((err && err.message) || '');
  if (raw) console.warn(`[auth.${mode}]`, raw);
  const forgotHref = `/forgot${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  const signinHref = `/signin${email ? `?email=${encodeURIComponent(email)}` : ''}`;

  if (err && err.code === 'OFFLINE') return { title: "You're offline", body: 'Check your connection and try again.' };
  if (err && err.code === 'NO_RECOVERY') {
    return {
      title: 'This page needs your reset link',
      body: 'Open the link in your reset email to choose a new password.',
      action: { href: '/forgot', label: 'Send a new link' },
    };
  }
  if (/invalid login credentials/i.test(raw)) {
    return {
      title: "Couldn't sign you in",
      body: "That email and password don't match. Check both and try again.",
      action: { href: forgotHref, label: 'Reset your password' },
    };
  }
  if (/already (been )?registered|already exists/i.test(raw)) {
    return {
      title: `There's already an account for ${email}`,
      body: 'Sign in with it, or reset the password if you forgot it.',
      action: { href: signinHref, label: 'Sign in' },
    };
  }
  if (/email not confirmed|confirm your account/i.test(raw)) {
    return { title: 'Confirm your email first', body: `Open the link we sent to ${email}, then sign in.` };
  }
  if (/rate limit|too many|security purposes/i.test(raw)) return { title: 'Too many tries', body: 'Wait a minute, then try again.' };
  if (/not configured/i.test(raw)) return { title: "Sign-in isn't working right now", body: 'Try again in a few minutes.' };
  if (/failed to fetch|network|load failed/i.test(raw)) return { title: "Couldn't reach VolunteerU", body: 'Check your connection and try again.' };
  if (/different from the old|same password/i.test(raw)) {
    return { title: "That's your current password", body: 'Choose a different one.' };
  }
  if (mode === 'reset' && /expired|jwt|session|token/i.test(raw)) {
    return { title: 'Your reset link expired', body: 'Request a new one and use it within 1 hour.', action: { href: '/forgot', label: 'Send a new link' } };
  }
  if (/password/i.test(raw) && /(weak|short|at least|should)/i.test(raw)) {
    return { title: 'Choose a stronger password', body: PASSWORD_RULE };
  }
  const fallback = {
    signin: { title: "Couldn't sign you in", body: 'Check your email and password and try again.' },
    signup: { title: "Couldn't create your account", body: 'Try again in a minute.' },
    forgot: { title: "Couldn't send the reset link", body: 'Try again in a minute.' },
    reset: { title: "Couldn't save your new password", body: 'Try again, or request a new reset link.', action: { href: '/forgot', label: 'Send a new link' } },
  };
  return fallback[mode];
}

async function runAuth(mode, form) {
  const email = form.email.trim();
  if (mode === 'signin') {
    await signIn(email, form.password);
    return;
  }
  if (mode === 'signup') {
    await signUp({ email, password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim() });
    return;
  }
  if (!supabase) throw { code: 'AUTH', message: 'The backend is not configured.' };
  if (mode === 'forgot') {
    // The reply is the same whether or not the email has an account, so the
    // screen never reveals who has signed up.
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` });
    if (error) throw { code: 'AUTH', message: error.message };
    return;
  }
  // reset: the recovery link put us in a temporary session; set the password against it.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw { code: 'NO_RECOVERY', message: 'No recovery session' };
  const { error } = await supabase.auth.updateUser({ password: form.password });
  if (error) throw { code: 'AUTH', message: error.message || 'expired' };
}

export default function Auth({ mode = 'signin' }) {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = sameSitePath(params.get('next'));
  const next = nextParam || '/app';
  // A landing CTA can preselect what the student came to do; onboarding reads it.
  const intentParam = SIGNUP_INTENTS.includes(params.get('intent')) ? params.get('intent') : '';
  const carry = new URLSearchParams();
  if (nextParam) carry.set('next', nextParam);
  if (intentParam) carry.set('intent', intentParam);
  const nextQuery = carry.toString() ? `?${carry.toString()}` : '';
  const emailParam = (params.get('email') || '').slice(0, 254);
  const { state } = useSnapshot();

  const [form, setForm] = useState({
    email: emailParam || (mode === 'signin' ? state.account.email || '' : ''),
    password: '',
    confirm: '',
    firstName: '',
    lastName: '',
    agree: false,
  });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [photoOk, setPhotoOk] = useState(true);
  const [focusField, setFocusField] = useState(null);

  // Move focus to the first field with an error once it has rendered.
  useEffect(() => {
    if (!focusField) return;
    const el = document.getElementById(FIELD_ID[focusField.key]);
    if (el) el.focus();
  }, [focusField]);

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    if (failure) setFailure(null);
  };

  const copy = COPY[mode];
  const strength = passwordStrength(form.password);
  const newPassword = mode === 'signup' || mode === 'reset';

  function validate() {
    const e = {};
    if (mode !== 'reset') {
      const emailErr = emailError(form.email);
      if (emailErr) e.email = emailErr;
    }
    if (mode === 'signin' && !form.password) e.password = 'Enter your password.';
    if (newPassword) {
      const pwErr = newPasswordError(form.password);
      if (pwErr) e.password = pwErr;
      if (!form.confirm) e.confirm = 'Enter the password again.';
      else if (form.confirm !== form.password) e.confirm = "Passwords don't match.";
    }
    if (mode === 'signup') {
      if (!form.firstName.trim()) e.firstName = 'Enter your first name.';
      if (!form.agree) e.agree = "Confirm you're 13 or older to create an account.";
    }
    setErrors(e);
    const first = FIELD_ORDER.find((k) => e[k]);
    if (first) setFocusField({ key: first });
    return !first;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFailure(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await perform(`auth.${mode}`, () => runAuth(mode, form));
      if (mode === 'forgot') {
        setSent(true);
      } else if (mode === 'reset') {
        toast({ title: 'Password saved', message: "You're signed in.", tone: 'ok' });
        router.replace('/app');
      } else if (mode === 'signin') {
        const first = (getState().account || {}).firstName;
        toast({ title: first ? `Signed in as ${first}` : 'Signed in', tone: 'ok' });
        router.replace(next);
      } else {
        toast({ title: 'Account created', tone: 'ok' });
        router.replace(`/onboarding${nextQuery}`);
      }
    } catch (err) {
      if (!err || err.code !== 'DUPLICATE') setFailure(describeFailure(mode, err, form.email.trim()));
    } finally {
      setBusy(false);
    }
  }

  const pwHint = newPassword && !errors.password ? (form.password && !newPasswordError(form.password) ? `Strength: ${strength.label}` : PASSWORD_RULE) : undefined;

  return (
    <div className="vu-auth vu-screen" style={S('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);min-height:100vh')}>
      <style>{AUTH_CSS}</style>
      <div
        className="vu-auth-aside"
        style={S('position:relative;background:#1F1B18;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 1px,transparent 1px 8px);padding:48px 52px;display:flex;flex-direction:column;gap:40px;overflow:hidden')}
      >
        <Link href="/" style={S('display:flex;align-items:center;gap:9px;width:max-content;color:inherit')}>
          <Logo size={24} />
          <span style={S('font:600 16px/1 Geist;letter-spacing:-0.03em;color:#fff')}>VolunteerU</span>
        </Link>
        <div className="vu-auth-pitch" style={S('flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;max-width:470px')}>
          <div>
            <p style={S('margin:0;font:600 34px/1.14 Geist;letter-spacing:-0.04em;color:#fff;text-wrap:balance')}>Find somewhere to volunteer this week</p>
            <p style={S('margin:14px 0 0;font:400 16px/1.6 Geist;color:#B5ACA4;text-wrap:pretty')}>
              Search nonprofits and open volunteer spots near you. Sign up for one and keep a log of the hours you put in.
            </p>
          </div>
          {photoOk ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={PEXELS.food}
              alt="Volunteers packing food at a food bank"
              onError={() => setPhotoOk(false)}
              style={S('display:block;width:100%;height:clamp(200px,32vh,300px);object-fit:cover;border-radius:14px;border:1px solid #363029;background:#26221E')}
            />
          ) : null}
        </div>
        <div className="vu-auth-foot" style={S('font:450 13px/1.5 Geist;color:#8B8078')}>Free for students, ages 13 and up.</div>
      </div>

      <div className="vu-auth-form" id="vu-main" style={S('background:#FAF8F5;padding:48px 60px;display:flex;flex-direction:column;justify-content:center')}>
        <div style={S('max-width:440px;width:100%;margin:0 auto')}>
          <h1 style={S('margin:0;font:600 34px/1.08 Geist;letter-spacing:-0.04em')}>{sent ? 'Check your email' : copy.title}</h1>
          {copy.sub && !sent ? <p style={S('margin:10px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>{copy.sub}</p> : null}

          {sent ? (
            <div role="status" style={S('margin-top:14px')}>
              <p style={S('margin:0;font:450 15px/1.55 Geist;color:#57504A;overflow-wrap:anywhere')}>
                If there's an account for <strong style={S('font-weight:600;color:#1A1714')}>{form.email.trim()}</strong>, we sent a reset link. It works for 1 hour.
              </p>
              <div style={S('margin-top:22px;display:flex;gap:10px;flex-wrap:wrap')}>
                <SecondaryButton h={42} px={16} r={11} fs={14} onClick={() => router.push(`/signin?email=${encodeURIComponent(form.email.trim())}`)}>
                  Back to sign in
                </SecondaryButton>
                <SecondaryButton h={42} px={16} r={11} fs={14} onClick={() => setSent(false)}>
                  Use a different email
                </SecondaryButton>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate style={S('margin-top:24px')}>
              {mode === 'signup' ? (
                <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px')}>
                  <Field id={FIELD_ID.firstName} label="First name" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" maxLength={40} required error={errors.firstName} />
                  <Field id="auth-last" label="Last name" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" maxLength={40} />
                </div>
              ) : null}

              {mode !== 'reset' ? (
                <Field
                  id={FIELD_ID.email}
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="name@example.com"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  required
                  error={errors.email}
                />
              ) : null}

              {mode !== 'forgot' ? (
                <div style={S(mode === 'reset' ? '' : 'margin-top:14px')}>
                  <Field
                    id={FIELD_ID.password}
                    label={mode === 'reset' ? 'New password' : 'Password'}
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    autoComplete={newPassword ? 'new-password' : 'current-password'}
                    required
                    error={errors.password}
                    hint={pwHint}
                  />
                  {newPassword && form.password ? (
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

              {newPassword ? (
                <div style={S('margin-top:14px')}>
                  <Field id={FIELD_ID.confirm} label="Confirm password" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required error={errors.confirm} />
                </div>
              ) : null}

              {mode === 'signin' ? (
                <div style={S('margin-top:12px;display:flex;justify-content:flex-end')}>
                  <Link href={`/forgot${form.email.trim() ? `?email=${encodeURIComponent(form.email.trim())}` : ''}`} className={H.link} style={S('font:500 13px/1.4 Geist;color:#A8482A')}>
                    Forgot password?
                  </Link>
                </div>
              ) : null}

              {mode === 'signup' ? (
                <div style={S('margin-top:18px')}>
                  <Checkbox
                    id={FIELD_ID.agree}
                    checked={form.agree}
                    onChange={set('agree')}
                    size={16}
                    describedBy={errors.agree ? 'auth-agree-err' : undefined}
                    label={
                      <>
                        I'm 13 or older and agree to the{' '}
                        <Link href="/privacy" target="_blank" rel="noopener" className={H.link} style={S('color:#A8482A;font-weight:500;text-decoration:underline;text-underline-offset:2px')}>
                          privacy policy
                        </Link>
                        .
                      </>
                    }
                  />
                  {errors.agree ? <div className="vu-err" id="auth-agree-err">{errors.agree}</div> : null}
                </div>
              ) : null}

              {failure ? (
                <div role="alert" style={S('margin-top:18px;padding:13px 15px;border-radius:12px;border:1px solid #EFD3C7;background:#FBEFEA')}>
                  <div style={S('font:600 14px/1.35 Geist;color:#8F3B20;overflow-wrap:anywhere')}>{failure.title}</div>
                  <div style={S('margin-top:4px;font:450 13px/1.5 Geist;color:#6E3A27')}>
                    {failure.body}
                    {failure.action ? (
                      <>
                        {' '}
                        <Link href={failure.action.href} className={H.link} style={S('color:#8F3B20;font-weight:600;text-decoration:underline;text-underline-offset:2px')}>
                          {failure.action.label}
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div style={S('margin-top:22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap')}>
                <PrimaryButton type="submit" h={46} px={22} r={12} fs={15} icon={null} busy={busy}>
                  {busy ? copy.busy : copy.cta}
                </PrimaryButton>
                {mode === 'forgot' ? (
                  <Link href={`/signin${form.email.trim() ? `?email=${encodeURIComponent(form.email.trim())}` : ''}`} className={H.toInk} style={S('font:500 14px/1 Geist;color:#6B635C')}>
                    Back to sign in
                  </Link>
                ) : null}
              </div>
            </form>
          )}

          {!sent && mode !== 'forgot' ? (
            <div style={S('margin-top:22px;font:450 14px/1.5 Geist;color:#6B635C')}>
              {mode === 'signin' ? (
                <>
                  New here?{' '}
                  <Link href={`/signup${nextQuery}`} className={H.link} style={S('color:#A8482A;font-weight:500')}>
                    Create an account
                  </Link>
                </>
              ) : mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <Link href={`/signin${nextQuery}`} className={H.link} style={S('color:#A8482A;font-weight:500')}>
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  Link expired?{' '}
                  <Link href="/forgot" className={H.link} style={S('color:#A8482A;font-weight:500')}>
                    Send a new one
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
