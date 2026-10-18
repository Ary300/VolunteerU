'use client';

/* ==========================================================================
   Auth.jsx, sign in, sign up, forgot / reset password.
   Photo-first split: the form sits on white on the left with the logo above
   it and a short footer below; a real photo of volunteers fills the right
   half, inset from the window edge with the photo radius. Under 960px the
   photo becomes a short band under the logo so the form still starts high.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, s } from '../../lib/style.js';
import { C, F, R } from '../../lib/tokens.js';
import { PHOTOS } from '../../lib/photos.js';
import { Field, Button, LinkButton, Checkbox, Icon } from '../ui.jsx';
import { Wordmark } from '../Logo.jsx';
import { toast, dismissToast } from '../../lib/overlays.js';
import { useSnapshot, getState } from '../../lib/store.js';
import { supabase } from '../../lib/supabase.js';
import { EMAIL_RX, passwordStrength, signIn, signUp, perform } from '../../lib/db.js';
import { sameSitePath } from '../../lib/safePath.js';

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
  reset: { title: 'Choose a new password', sub: 'Use it the next time you sign in.', cta: 'Save new password', busy: 'Saving password' },
};

/* One photo per screen. Sign in and sign up share the warehouse sort shot
   with different crops: sign in frames the volunteer folding clothes on the
   left, sign up frames the two by the clothing rack on the right, so the
   pages don't read as the same screen with a new heading. Neither uses the
   "VOLUNTEER" tee shoot (shoot: 'tees'), which the landing hero already
   uses, or the donations shoot with DONATIONS printed on the boxes, and
   sign up skips the park clipboard (outdoor) because onboarding opens on
   it right after. Sign up switches to the Bloomington community garden
   photo once PHOTOS.garden exists. Forgot and reset are reached from sign
   in and keep its photo. */
const SIGNIN_PHOTO = { ...PHOTOS.shelter, pos: '4% 50%', band: 'center 36%', alt: 'Volunteers sorting donated clothes into bins in a bright warehouse' };
const SIGNUP_PHOTO = PHOTOS.garden
  ? { ...PHOTOS.garden, pos: '50% 56%', band: 'center 62%', alt: 'Four volunteers pushing wheelbarrows of mulch across a community garden on a spring day' }
  : { ...PHOTOS.shelter, pos: '100% 50%', band: '78% 30%', alt: 'Volunteers sorting clothes and storage bins beside a donation rack in a bright warehouse' };
const PHOTO = {
  signin: SIGNIN_PHOTO,
  signup: SIGNUP_PHOTO,
  forgot: SIGNIN_PHOTO,
  reset: SIGNIN_PHOTO,
};

const PASSWORD_RULE = 'At least 8 characters, with a letter and a number.';
// Supabase never accepts a password shorter than this, so a shorter one can't be right.
const MIN_EXISTING_PASSWORD = 6;
const FIELD_ORDER = ['firstName', 'email', 'password', 'confirm', 'agree'];
const FIELD_ID = { firstName: 'auth-first', email: 'auth-email', password: 'auth-password', confirm: 'auth-confirm', agree: 'auth-agree' };
const RATE_LIMIT_CODES = ['over_email_send_rate_limit', 'over_request_rate_limit'];
const BAD_ADDRESS_CODES = ['email_address_invalid', 'validation_failed'];
// The last email that signed in on this browser, so /signin can offer it after
// sign-out wipes the workspace. Only the address is kept, never a password.
const LAST_EMAIL_KEY = 'vu.lastEmail';

function readLastEmail() {
  try {
    return (localStorage.getItem(LAST_EMAIL_KEY) || '').slice(0, 254);
  } catch {
    return '';
  }
}

function rememberEmail(email) {
  try {
    if (email) localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    /* storage blocked: the field just starts empty next time */
  }
}

/* Layout, hover and phone rules. globals.css is shared, so the class names
   are scoped to this screen. */
const AUTH_CSS = `
.vu-auth { display:grid; grid-template-columns:minmax(440px,560px) minmax(0,1fr); min-height:100vh; min-height:100dvh; background:${C.white}; }
.vu-auth-col { display:flex; flex-direction:column; min-height:100vh; min-height:100dvh; padding:32px 64px 28px; }
.vu-auth-body { flex:1; display:flex; flex-direction:column; justify-content:center; padding:48px 0; }
.vu-auth-inner { width:100%; max-width:432px; }
.vu-auth-photo { position:sticky; top:16px; height:calc(100vh - 32px); height:calc(100dvh - 32px); margin:16px 16px 16px 0; border-radius:${R.photo}; overflow:hidden; background:${C.mist}; }
.vu-auth-photo img, .vu-auth-band img { display:block; width:100%; height:100%; object-fit:cover; }
.vu-auth-band { display:none; }
.vu-auth-h1 { margin:0; font:700 40px/1.05 ${F.display}; letter-spacing:-0.03em; color:${C.ink}; text-wrap:balance; }
.vu-auth a.vu-link-ul:hover { text-decoration-thickness:2px; }
.vu-auth-foot a { color:${C.ink2}; text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; }
.vu-auth-foot a:hover { color:${C.ink}; }
@media (max-width: 1180px) {
  .vu-auth-col { padding:28px 40px 24px; }
}
@media (max-width: 959px) {
  .vu-auth { grid-template-columns:minmax(0,1fr); }
  .vu-auth-photo { display:none; }
  .vu-auth-col { padding:14px 16px 20px; }
  .vu-auth-band { display:block; height:216px; margin:14px 0 0; border-radius:${R.photoMobile}; overflow:hidden; background:${C.mist}; }
  .vu-auth-body { justify-content:flex-start; padding:32px 0 40px; }
  .vu-auth--signup .vu-auth-band { height:148px; }
  .vu-auth-inner { max-width:none; }
  .vu-auth-h1 { font-size:32px; }
}
@media (max-width: 719px) {
  .vu-auth-band, .vu-auth--signup .vu-auth-band { height:120px; }
  .vu-auth-body { padding-top:28px; }
}
@media (max-width: 959px) and (max-height: 700px) {
  .vu-auth-band, .vu-auth--signup .vu-auth-band { height:112px; }
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

/**
 * Plain message for a failed reset-link request. Branches on the Supabase
 * error code first and the status second; the message text is a last resort.
 * Nothing here says whether the address has an account.
 * @param {{ authCode?: string, status?: number, message?: string }} err
 * @param {string} email
 */
function describeForgotFailure(err, email) {
  const code = String((err && err.authCode) || '');
  const status = Number((err && err.status) || 0);
  const raw = String((err && err.message) || '');

  if (RATE_LIMIT_CODES.includes(code) || status === 429 || /rate limit|security purposes|too many/i.test(raw)) {
    const secs = (raw.match(/(\d+)\s*seconds?/i) || [])[1];
    return {
      title: 'Too many reset emails',
      body: secs
        ? `Wait ${secs} seconds, then send another link.`
        : 'Wait a few minutes, then try again. If a reset email already came, its link still works.',
    };
  }
  if (BAD_ADDRESS_CODES.includes(code) || (status === 400 && /email/i.test(raw) && /invalid/i.test(raw))) {
    return { title: "We can't send email to that address", body: `Check the spelling of ${email}, or use a different email.` };
  }
  if (code === 'email_address_not_authorized' || /not authori[sz]ed/i.test(raw)) {
    return { title: "We couldn't email that address", body: 'Reset emails to that address are blocked right now. Try again later, or use a different email.' };
  }
  if ((status === 0 && code !== '') || /failed to fetch|network|load failed/i.test(raw)) {
    return { title: "Couldn't reach VolunteerU", body: 'Check your connection and try again.' };
  }
  return { title: "Couldn't send the reset link", body: 'Something went wrong on our end. Try again in a few minutes.' };
}

/** `?email=…&next=…` with whichever of the two is set, or '' when neither is. */
function authQuery(email, next) {
  const q = new URLSearchParams();
  if (email) q.set('email', email);
  if (next) q.set('next', next);
  const out = q.toString();
  return out ? `?${out}` : '';
}

/** Map a failed auth call to a plain message. Raw server text only goes to the console. */
function describeFailure(mode, err, email, next) {
  const raw = String((err && err.message) || '');
  if (raw) console.warn(`[auth.${mode}]`, (err && err.authCode) || '', raw);
  // Both links keep `next`, so a student who came from a listing still ends up back on it.
  const query = authQuery(email, next);
  const forgotHref = `/forgot${query}`;
  const signinHref = `/signin${query}`;

  if (err && err.code === 'OFFLINE') return { title: "You're offline", body: 'Check your connection and try again.' };
  if (mode === 'forgot') return describeForgotFailure(err, email);
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
      action2: { href: forgotHref, label: 'Reset your password' },
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
    reset: { title: "Couldn't save your new password", body: 'Try again, or request a new reset link.', action: { href: '/forgot', label: 'Send a new link' } },
  };
  return fallback[mode];
}

async function runAuth(mode, form) {
  const email = form.email.trim();
  if (mode === 'signin') {
    return signIn(email, form.password);
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
    if (error) throw { code: 'AUTH', authCode: error.code || '', status: error.status || 0, message: error.message || '' };
    return;
  }
  // reset: the recovery link put us in a temporary session; set the password against it.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw { code: 'NO_RECOVERY', message: 'No recovery session' };
  const { error } = await supabase.auth.updateUser({ password: form.password });
  if (error) throw { code: 'AUTH', authCode: error.code || '', status: error.status || 0, message: error.message || 'expired' };
}

/** Five-segment strength bar with its label, shown while a new password is typed. */
function StrengthMeter({ strength }) {
  const fill = strength.score >= 4 ? C.confirmed : C.waitingBar;
  return (
    <div style={S('margin-top:10px;display:flex;align-items:center;gap:12px')}>
      <div aria-hidden="true" style={S('flex:1;display:flex;gap:4px')}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={s(`flex:1;height:4px;border-radius:${R.pill}`, `background:${i < strength.score ? fill : C.line}`, 'transition:background .16s ease')} />
        ))}
      </div>
      <span aria-live="polite" style={S(`flex:none;font:500 13px/1 ${F.body};color:${C.ink2}`)}>Strength: {strength.label}</span>
    </div>
  );
}

/** Inline error under the form: what broke and what to do. Plain text with
    the same alert mark as a field error, no tinted box. */
function Failure({ failure }) {
  return (
    <div role="alert" style={S('margin-top:4px;display:flex;gap:8px;align-items:flex-start')}>
      <span style={S(`flex:none;margin-top:2px;color:${C.emberDeep}`)}>
        <Icon name="alert" size={16} />
      </span>
      <div style={S('min-width:0')}>
        <div style={S(`font:600 15px/20px ${F.body};color:${C.emberDeep};overflow-wrap:anywhere`)}>{failure.title}</div>
        <div style={S(`margin-top:2px;font:400 14px/20px ${F.body};color:${C.ink2}`)}>
          {failure.body}
          {failure.action ? (
            <>
              {' '}
              <Link href={failure.action.href} className="vu-link-ul">
                {failure.action.label}
              </Link>
            </>
          ) : null}
          {failure.action2 ? (
            <>
              {' or '}
              <Link href={failure.action2.href} className="vu-link-ul">
                {failure.action2.label.charAt(0).toLowerCase() + failure.action2.label.slice(1)}
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** "New here? Create an account" style line under the form. */
function SwitchLine({ lead, href, label }) {
  return (
    <p style={S(`margin:24px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
      {lead}{' '}
      <Link href={href} className="vu-link-ul">
        {label}
      </Link>
    </p>
  );
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
    email: emailParam || (mode === 'signin' ? state.account.email || readLastEmail() : ''),
    password: '',
    confirm: '',
    firstName: '',
    lastName: '',
    agree: false,
  });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const checkToast = useRef(null); // the "Check the highlighted fields" toast on screen
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
  const photo = PHOTO[mode] || PHOTO.signin;
  const strength = passwordStrength(form.password);
  const newPassword = mode === 'signup' || mode === 'reset';
  const typedEmail = form.email.trim();
  const emailQuery = authQuery(typedEmail, nextParam);

  function validate() {
    const e = {};
    if (mode !== 'reset') {
      const emailErr = emailError(form.email);
      if (emailErr) e.email = emailErr;
    }
    if (mode === 'signin') {
      if (!form.password) e.password = 'Enter your password.';
      else if (form.password.length < MIN_EXISTING_PASSWORD) e.password = "That's too short to be your password. Check what you typed.";
    }
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
    const flagged = FIELD_ORDER.filter((k) => e[k]);
    // One summary at a time, worded for what's flagged now.
    if (checkToast.current) dismissToast(checkToast.current);
    checkToast.current = null;
    if (flagged.length) {
      setFocusField({ key: flagged[0] });
      checkToast.current = toast({ title: flagged.length === 1 ? 'Check the highlighted field' : 'Check the highlighted fields', tone: 'warn' });
    }
    return !flagged.length;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFailure(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const result = await perform(`auth.${mode}`, () => runAuth(mode, form));
      if (mode === 'forgot') {
        setSent(true);
        toast({ title: 'Reset link sent', tone: 'ok' });
      } else if (mode === 'reset') {
        toast({ title: 'Password saved', message: "You're signed in.", tone: 'ok' });
        router.replace('/app');
      } else if (mode === 'signin') {
        rememberEmail(typedEmail);
        // The workspace can still be loading; the auth user carries the name from sign-up too.
        const meta = (result && result.user && result.user.user_metadata) || {};
        const first = (getState().account || {}).firstName || String(meta.first_name || '').trim();
        toast({ title: first ? `Signed in as ${first}` : 'Signed in', tone: 'ok' });
        router.replace(next);
      } else {
        rememberEmail(typedEmail);
        toast({ title: 'Account created', tone: 'ok' });
        // A lead's invite link joins the project first; setup can wait until
        // the student opens the app.
        router.replace(/^\/invite\/[0-9a-f]{64}$/.test(nextParam) ? nextParam : `/onboarding${nextQuery}`);
      }
    } catch (err) {
      if (!err || err.code !== 'DUPLICATE') setFailure(describeFailure(mode, err, typedEmail, nextParam));
    } finally {
      setBusy(false);
    }
  }

  const pwHint = newPassword && !errors.password && (!form.password || newPasswordError(form.password)) ? PASSWORD_RULE : undefined;

  const photoImg = (pos) =>
    photoOk ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={photo.src} alt={photo.alt} onError={() => setPhotoOk(false)} style={{ objectPosition: pos }} />
    ) : null;

  return (
    <div className={`vu-auth vu-auth--${mode} vu-screen`}>
      <style>{AUTH_CSS}</style>

      <main className="vu-auth-col" id="vu-main">
        <div>
          <Link href="/" aria-label="VolunteerU home" style={S(`display:inline-flex;border-radius:${R.control}`)}>
            <Wordmark size={28} />
          </Link>
        </div>

        <div className="vu-auth-band">{photoImg(photo.band)}</div>

        <div className="vu-auth-body">
          <div className="vu-auth-inner">
            {sent ? (
              <div role="status">
                <h1 className="vu-auth-h1">Check your email</h1>
                <p style={S(`margin:12px 0 0;font:400 16px/1.55 ${F.body};color:${C.ink2};overflow-wrap:anywhere`)}>
                  If there's an account for <strong style={S(`font-weight:600;color:${C.ink}`)}>{typedEmail}</strong>, we sent a reset link. It works for 1 hour.
                </p>
              </div>
            ) : (
              <>
                <h1 className="vu-auth-h1">{copy.title}</h1>
                {copy.sub ? <p style={S(`margin:12px 0 0;font:400 16px/1.5 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{copy.sub}</p> : null}
              </>
            )}

            {sent ? (
              <div style={S('margin-top:28px;display:flex;flex-direction:column;align-items:flex-start;gap:18px')}>
                <Button variant="outline" size="lg" full onClick={() => router.push(`/signin${emailQuery}`)}>
                  Back to sign in
                </Button>
                <LinkButton fs={15} onClick={() => setSent(false)}>
                  Use a different email
                </LinkButton>
              </div>
            ) : (
              <form onSubmit={submit} noValidate style={S('margin-top:28px;display:flex;flex-direction:column;gap:16px')}>
                {mode === 'signup' ? (
                  <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px')}>
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
                  <div>
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
                    {newPassword && form.password ? <StrengthMeter strength={strength} /> : null}
                    {mode === 'signin' ? (
                      <div style={S('margin-top:10px;display:flex;justify-content:flex-end')}>
                        <Link href={`/forgot${emailQuery}`} className="vu-link-ul" style={S(`font:500 14px/1.4 ${F.body};color:${C.ink2}`)}>
                          Forgot password?
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {newPassword ? (
                  <Field id={FIELD_ID.confirm} label="Confirm password" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required error={errors.confirm} />
                ) : null}

                {mode === 'signup' ? (
                  <div style={S('margin-top:2px')}>
                    <Checkbox
                      id={FIELD_ID.agree}
                      checked={form.agree}
                      onChange={set('agree')}
                      describedBy={errors.agree ? 'auth-agree-err' : undefined}
                      label={
                        <span style={S(`font:400 15px/1.45 ${F.body};color:${C.ink}`)}>
                          I'm 13 or older and agree to the{' '}
                          <Link href="/privacy" target="_blank" rel="noopener" className="vu-link-ul" style={S('font-weight:500')}>
                            privacy policy
                          </Link>
                          .
                        </span>
                      }
                    />
                    {errors.agree ? (
                      <div className="vu-err" id="auth-agree-err">
                        {errors.agree}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {failure ? <Failure failure={failure} /> : null}

                <Button type="submit" variant="primary" size="lg" full busy={busy} extra="margin-top:8px">
                  {busy ? copy.busy : copy.cta}
                </Button>
              </form>
            )}

            {sent ? null : mode === 'signin' ? (
              <SwitchLine lead="New here?" href={`/signup${nextQuery}`} label="Create an account" />
            ) : mode === 'signup' ? (
              <SwitchLine lead="Already have an account?" href={`/signin${nextQuery}`} label="Sign in" />
            ) : mode === 'forgot' ? (
              <SwitchLine lead="Remembered it?" href={`/signin${emailQuery}`} label="Back to sign in" />
            ) : (
              <>
                <SwitchLine lead="Link expired?" href="/forgot" label="Send a new one" />
                <p style={S(`margin:8px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
                  Remembered it?{' '}
                  <Link href="/signin" className="vu-link-ul">
                    Back to sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        <footer className="vu-auth-foot" style={S(`display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 20px;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>
          <span>Free for students 13 and up.</span>
          <span style={S('display:flex;gap:16px')}>
            <Link href="/privacy">Privacy</Link>
            <Link href="/safety">Safety</Link>
          </span>
        </footer>
      </main>

      <div className="vu-auth-photo">{photoImg(photo.pos)}</div>
    </div>
  );
}
