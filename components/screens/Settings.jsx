'use client';

/* ==========================================================================
   Settings.jsx, account, interests, notifications, privacy, appearance,
   permissions, data, help and about. Copy here only describes what the code
   does: the two notification switches cover the in-app feed only (nothing
   sends email, texts or browser push yet), and "Delete my data" erases the
   saved workspace (the sign-in itself stays, since a browser can't delete a
   Supabase auth user).

   Layout: a section list on the left (a sideways tab strip under 1180px),
   then plain groups of divided rows. No boxed panels.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { S } from '../../lib/style.js';
import { C, F, causeOf } from '../../lib/tokens.js';
import { Pressable, Field, Select, Toggle, Chip, Icon, Avatar, Button, StatusText } from '../ui.jsx';
import { fmtHours } from '../vu/index.js';
import { causeLabel } from '../LogHoursForm.jsx';
import { useSnapshot, exportState, importState, resetStore, getState, update } from '../../lib/store.js';
import { confirmDialog, toast } from '../../lib/overlays.js';
import {
  updateAccount, setPref, toggleInList, signOut, exportHoursCSV, download,
  requestNotificationPermission, requestLocationPermission, validateEmail,
  changePassword, validatePassword, passwordStrength, friendlyAuthMessage, eraseMyData,
} from '../../lib/db.js';
import { getSyncUser, scheduleSync } from '../../lib/sync.js';
import { supabase } from '../../lib/supabase.js';
import { CAUSES, WINDOWS } from '../../lib/seed.js';

const GRADES = [{ v: '', l: 'Choose' }, '9', '10', '11', '12'];

export const SECTIONS = [
  { k: 'account', label: 'Account', icon: 'user' },
  { k: 'preferences', label: 'Interests', icon: 'compass' },
  { k: 'notifications', label: 'Notifications', icon: 'bell' },
  { k: 'privacy', label: 'Privacy', icon: 'eye' },
  { k: 'appearance', label: 'Appearance', icon: 'contrast' },
  { k: 'permissions', label: 'Permissions', icon: 'lock' },
  { k: 'data', label: 'Your data', icon: 'download' },
  { k: 'help', label: 'Help and safety', icon: 'help' },
  { k: 'about', label: 'About', icon: 'info' },
];

/* Hover, focus and the phone tab strip need real CSS. Colors use the global
   variables so Higher contrast reaches them too. */
const SETTINGS_CSS = `
.vu-set-grid { display:grid; grid-template-columns:208px minmax(0,1fr); gap:56px; align-items:start; margin-top:32px; }
.vu-set-body { min-width:0; max-width:720px; }
.vu-set-nav { display:flex; flex-direction:column; gap:2px; position:sticky; top:24px; }
.vu-set-tab { display:flex; align-items:center; gap:12px; height:42px; padding:0 12px; border-radius:10px; color:var(--ink-2); font:500 15px/1 var(--f-body); cursor:pointer; white-space:nowrap; transition:background var(--vu-dur-2) ease, color var(--vu-dur-2) ease; }
.vu-set-tab:hover { background:var(--mist); color:var(--ink); }
.vu-set-tab[aria-current="page"] { background:var(--mist); color:var(--ink); font-weight:600; }
.vu-set-tab[aria-current="page"] .vu-set-ic { color:var(--ember); }
.vu-set-tab:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
.vu-set-ic { display:inline-flex; color:var(--ink-3); }
.vu-set-group + .vu-set-group { margin-top:48px; }
.vu-set-row { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:18px 0; border-bottom:1px solid var(--line); }
.vu-set-row:last-child { border-bottom:none; }
.vu-set-rows { border-top:1px solid var(--line); margin-top:16px; }
.vu-set-fields { display:grid; grid-template-columns:1fr 1fr; gap:18px 16px; }
.vu-set-opts { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.vu-set-perm-text { min-width:0; flex:1 1 280px; }
@media (max-width:1179px) {
  .vu-set-grid { grid-template-columns:minmax(0,1fr); gap:0; margin-top:20px; }
  .vu-set-body { max-width:none; padding-top:28px; }
  .vu-set-nav { position:static; flex-direction:row; gap:24px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--line); margin:0 -28px; padding:0 28px; scroll-padding:0 28px; }
  .vu-set-nav::-webkit-scrollbar { display:none; }
  .vu-set-tab { flex:none; height:46px; padding:0; border-radius:0; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .vu-set-tab:hover, .vu-set-tab[aria-current="page"] { background:none; }
  .vu-set-tab[aria-current="page"] { border-bottom-color:var(--ink); }
  .vu-set-tab:focus-visible { outline-offset:-2px; }
  .vu-set-ic { display:none; }
}
@media (max-width:719px) {
  .vu-set-nav { margin:0 -16px; padding:0 16px; scroll-padding:0 16px; }
}
@media (max-width:640px) {
  .vu-set-fields { grid-template-columns:1fr; }
  .vu-set-row.vu-set-stack { flex-direction:column; align-items:stretch; gap:14px; }
  .vu-set-row.vu-set-stack .vu-set-opts { justify-content:flex-start; }
  .vu-set-row.vu-set-stack > .vu-set-perm-text { flex:none; }
}
`;

const T_H2 = `margin:0;font:600 20px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`;
const T_SUB = `margin:6px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2};max-width:560px`;
const T_LABEL = `font:500 15px/1.35 ${F.body};color:${C.ink}`;
const T_HINT = `margin-top:4px;font:400 13.5px/1.45 ${F.body};color:${C.ink2}`;

export default function Settings({ section = 'account' }) {
  const router = useRouter();
  const { state } = useSnapshot();
  const known = SECTIONS.some((s2) => s2.k === section);
  const active = known ? section : 'account';
  // An unknown section moves to Account, so the address matches the page.
  useEffect(() => {
    if (!known) router.replace('/settings/account');
  }, [known, router]);

  return (
    <div className="vu-page">
      <style dangerouslySetInnerHTML={{ __html: SETTINGS_CSS }} />
      <h1 className="vu-t-h1" style={S(`color:${C.ink}`)}>Settings</h1>

      <div className="vu-set-grid">
        <SectionNav active={active} router={router} />
        <div className="vu-set-body">
          {active === 'account' ? <AccountSection state={state} router={router} /> : null}
          {active === 'preferences' ? <PreferencesSection state={state} /> : null}
          {active === 'notifications' ? <NotificationsSection state={state} /> : null}
          {active === 'privacy' ? <PrivacySection state={state} router={router} /> : null}
          {active === 'appearance' ? <AppearanceSection state={state} /> : null}
          {active === 'permissions' ? <PermissionsSection state={state} /> : null}
          {active === 'data' ? <DataSection router={router} /> : null}
          {active === 'help' ? <HelpSection router={router} /> : null}
          {active === 'about' ? <AboutSection router={router} /> : null}
        </div>
      </div>
    </div>
  );
}

/** Left list on desktop, sideways tabs on phones. Keeps the current tab in view. */
function SectionNav({ active, router }) {
  const ref = useRef(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const cur = nav.querySelector('[aria-current="page"]');
    if (!cur) return;
    const navBox = nav.getBoundingClientRect();
    const box = cur.getBoundingClientRect();
    // Center the current tab so its neighbours show on both sides.
    nav.scrollLeft = Math.max(0, nav.scrollLeft + box.left - navBox.left - (navBox.width - box.width) / 2);
  }, [active]);

  return (
    <nav ref={ref} aria-label="Settings sections" className="vu-set-nav">
      {SECTIONS.map((sec) => (
        // Real links, so a section opens in a new tab and copies as a URL.
        <Link
          key={sec.k}
          href={`/settings/${sec.k}`}
          aria-current={active === sec.k ? 'page' : undefined}
          className="vu-set-tab"
          style={{ textDecoration: 'none' }}
        >
          <span aria-hidden="true" className="vu-set-ic">
            <Icon name={sec.icon} size={18} />
          </span>
          {sec.label}
        </Link>
      ))}
    </nav>
  );
}

function Group({ title, sub, children, id }) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section className="vu-set-group" aria-labelledby={hid}>
      <h2 id={hid} style={S(T_H2)}>{title}</h2>
      {sub ? <p style={S(T_SUB)}>{sub}</p> : null}
      {children}
    </section>
  );
}

function Rows({ children }) {
  return <div className="vu-set-rows">{children}</div>;
}

function ToggleRow({ label, hint, on, onChange, disabled }) {
  return (
    <div className="vu-set-row">
      <div style={S('min-width:0')}>
        <div style={S(T_LABEL)}>{label}</div>
        {hint ? <div style={S(T_HINT)}>{hint}</div> : null}
      </div>
      <Toggle on={!!on} label={label} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function ActionRow({ title, body, children, stack = true }) {
  return (
    <div className={stack ? 'vu-set-row vu-set-stack' : 'vu-set-row'}>
      <div style={S('min-width:0')}>
        <div style={S(`${T_LABEL};overflow-wrap:anywhere`)}>{title}</div>
        {body ? <div style={S(T_HINT)}>{body}</div> : null}
      </div>
      <div className="vu-set-opts" style={S('flex:none')}>{children}</div>
    </div>
  );
}

/* Sign out, then land on the home page. Navigating first matters: signOut()
   waits until the tab is off a signed-in route, and a route guard that sees
   the session end first would send the person to /signin?next=... instead. */
async function signOutToHome(router) {
  router.push('/');
  await signOut();
}

/* ---- account ------------------------------------------------------------ */

function PasswordGroup() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(pw);

  async function submit() {
    if (busy) return;
    const e = {};
    const pwErr = validatePassword(pw);
    if (pwErr) e.pw = pwErr;
    if (!pwErr && confirm !== pw) e.confirm = "Passwords don't match.";
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await changePassword(pw);
      setPw('');
      setConfirm('');
      toast({ title: 'Password updated', message: 'Use it the next time you sign in.', tone: 'ok' });
    } catch (ex) {
      console.error('changePassword failed', ex);
      toast({ title: "Password wasn't changed", message: (ex && ex.friendly) || friendlyAuthMessage(ex), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Group title="Password" id="set-pw">
      <div className="vu-set-fields" style={S('margin-top:20px')}>
        <Field label="New password" type="password" value={pw} onChange={(v) => { setPw(v); if (err.pw) setErr((x) => ({ ...x, pw: undefined })); }} onEnter={submit} autoComplete="new-password" required error={err.pw} hint={pw && !err.pw ? `Strength: ${strength.label}` : 'At least 8 characters.'} />
        <Field label="Confirm new password" type="password" value={confirm} onChange={(v) => { setConfirm(v); if (err.confirm) setErr((x) => ({ ...x, confirm: undefined })); }} onEnter={submit} autoComplete="new-password" required error={err.confirm} />
      </div>
      <div style={S('margin-top:20px')}>
        <Button variant="outline" onClick={submit} aria-busy={busy ? 'true' : undefined}>
          {busy ? 'Updating password' : 'Update password'}
        </Button>
      </div>
    </Group>
  );
}

function AccountSection({ state, router }) {
  const a = state.account;
  const signInEmail = a.email || (state.session && state.session.email) || '';
  const [f, setF] = useState({
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    phone: a.phone || '',
    school: a.school || '',
    grade: a.grade ? String(a.grade) : '',
    city: a.city || '',
    zip: a.zip || '',
    guardianEmail: a.guardianEmail || '',
  });
  const [err, setErr] = useState({});
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  function save() {
    const e = {};
    if (!f.firstName.trim()) e.firstName = 'Enter your first name.';
    if (f.zip.trim() && !/^\d{5}$/.test(f.zip.trim())) e.zip = 'Enter a 5-digit ZIP code.';
    if (f.guardianEmail.trim()) {
      const ge = validateEmail(f.guardianEmail);
      if (ge) e.guardianEmail = ge;
    }
    setErr(e);
    if (Object.keys(e).length) {
      toast({ title: 'Check the highlighted fields', tone: 'warn' });
      return;
    }
    updateAccount({
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      phone: f.phone.trim(),
      school: f.school.trim(),
      grade: f.grade ? Number(f.grade) : null,
      city: f.city.trim(),
      zip: f.zip.trim(),
      guardianEmail: f.guardianEmail.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast({ title: 'Account updated', tone: 'ok' });
  }

  async function signOutNow() {
    const ok = await confirmDialog({ title: 'Sign out?', body: 'Your hours and projects will be here when you sign back in.', confirmLabel: 'Sign out', cancelLabel: 'Stay signed in' });
    if (!ok) return;
    await signOutToHome(router);
    toast({ title: 'Signed out', tone: 'ok' });
  }

  async function deleteData() {
    if (deleting) return;
    const ok = await confirmDialog({ title: 'Delete your data?', body: 'This erases the hours you logged, your projects and your settings, removes you from the volunteer directory, then signs you out. Organizations keep the applications and messages you sent them. You can sign in with this email again and start over.', confirmLabel: 'Delete my data', cancelLabel: 'Keep it', requireText: 'DELETE' });
    if (!ok) return;
    setDeleting(true);
    try {
      // Signed-out or offline-only workspaces have nothing in the cloud to
      // erase; signing out below clears this browser's copy.
      if (supabase && getSyncUser()) await eraseMyData();
    } catch (ex) {
      console.error('delete data failed', ex);
      // eraseMyData resumed syncing. Push any edits made before Delete was
      // pressed, since restoring the sync user resets its pending counters.
      scheduleSync();
      setDeleting(false);
      toast({ title: "Your data wasn't deleted", message: 'Nothing was removed. Check your connection and try again.', tone: 'danger' });
      return;
    }
    await signOutToHome(router);
    resetStore();
    toast({ title: 'Data deleted', message: "You're signed out.", tone: 'ok' });
  }

  const meta = [a.grade ? `Grade ${a.grade}` : '', a.school].filter(Boolean).join(', ');

  return (
    <>
      <div style={S('display:flex;align-items:center;gap:16px')}>
        <div style={S('width:64px;height:64px;border-radius:50%;overflow:hidden;flex:none')}>
          <Avatar name={a.name || `${a.firstName || ''} ${a.lastName || ''}`} src={a.avatar || ''} fs={22} />
        </div>
        <div style={S('min-width:0')}>
          <div className="vu-trunc" style={S(`font:650 24px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`)}>{a.name || 'Your name'}</div>
          {meta ? <div style={S(`margin-top:5px;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>{meta}</div> : null}
        </div>
      </div>

      <div style={S('margin-top:40px')}>
        <Group title="Profile" sub="Organizations see your name and school when you apply." id="set-profile">
          <div className="vu-set-fields" style={S('margin-top:20px')}>
            <Field label="First name" value={f.firstName} onChange={set('firstName')} required error={err.firstName} maxLength={40} autoComplete="given-name" />
            <Field label="Last name" value={f.lastName} onChange={set('lastName')} maxLength={40} autoComplete="family-name" />
            <Field label="Email" type="email" value={signInEmail} readOnly disabled hint="You sign in with this email. It can't be changed here yet." />
            <Field label="Phone" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" hint="Not shown to organizations or students." />
            <Field label="School" value={f.school} onChange={set('school')} maxLength={60} />
            <Select label="Grade" value={f.grade} options={GRADES} onChange={set('grade')} />
            <Field label="City" value={f.city} onChange={set('city')} maxLength={60} autoComplete="address-level2" />
            <Field label="ZIP code" value={f.zip} onChange={(v) => setF((x) => ({ ...x, zip: v.replace(/\D/g, '').slice(0, 5) }))} inputMode="numeric" autoComplete="postal-code" error={err.zip} />
          </div>
          <div style={S('margin-top:18px')}>
            <Field label="Parent or guardian email" type="email" value={f.guardianEmail} onChange={set('guardianEmail')} error={err.guardianEmail} hint="Some organizations need a parent's OK if you're under 16." />
          </div>
          <div style={S('margin-top:24px;display:flex;align-items:center;gap:14px')}>
            <Button variant="primary" onClick={save}>Save changes</Button>
            {saved ? (
              <span role="status" style={S(`display:inline-flex;align-items:center;gap:6px;font:600 14px/1 ${F.body};color:${C.confirmed}`)}>
                <Icon name="check" size={16} />
                Saved
              </span>
            ) : null}
          </div>
        </Group>

        <PasswordGroup />

        <Group title="Sign out or delete" id="set-session">
          <Rows>
            <ActionRow title={signInEmail} body="Your hours and projects are saved to your account.">
              <Button variant="outline" size="sm" icon="log-out" onClick={signOutNow}>Sign out</Button>
            </ActionRow>
            <ActionRow
              title="Delete your data"
              body="Clears your logged hours, projects and settings, then signs you out. Your sign-in email still works."
            >
              <Button variant="danger" size="sm" onClick={deleteData} disabled={deleting}>
                {deleting ? 'Deleting your data' : 'Delete my data'}
              </Button>
            </ActionRow>
          </Rows>
        </Group>
      </div>
    </>
  );
}

/* ---- interests (route key stays "preferences") -------------------------- */

function PreferencesSection({ state }) {
  const p = state.prefs;
  const goal = p.hoursGoal ? String(p.hoursGoal) : '';
  // Interests save as they change. A short "Saved" line confirms each one,
  // after a pause for the hours field.
  const [savedAt, setSavedAt] = useState(0);
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  useEffect(() => {
    if (!savedAt) return undefined;
    const t = setTimeout(() => setSavedAt(0), 2200);
    return () => clearTimeout(t);
  }, [savedAt]);
  const flash = (delay = 0) => {
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedAt(Date.now()), delay);
  };
  const toggle = (path, v) => { toggleInList(path, v); flash(); };
  return (
    <>
      <p role="status" aria-live="polite" style={S(`margin:0;min-height:20px;font:500 14px/20px ${F.body};color:${C.confirmed}`)}>{savedAt ? 'Saved' : ''}</p>
      <Group title="Causes" sub="Discover starts filtered to the causes you pick. Clear them there any time." id="set-causes">
        <div style={S('margin-top:18px;display:flex;flex-wrap:wrap;gap:8px')}>
          {CAUSES.map((c) => (
            <Chip key={c} label={causeLabel(c)} icon={causeOf(c).icon} role="checkbox" on={p.causes.includes(c)} py={9} px={14} fs={14} onClick={() => toggle('prefs.causes', c)} />
          ))}
        </div>
        {!p.causes.length ? <div className="vu-hint" style={S('margin-top:12px')}>None picked, so Discover shows every cause.</div> : null}
      </Group>

      <Group title="When you're free" id="set-windows">
        <div style={S('margin-top:18px;display:flex;flex-wrap:wrap;gap:8px')}>
          {WINDOWS.map((w) => (
            <Chip key={w} label={w} role="checkbox" on={p.windows.includes(w)} py={9} px={14} fs={14} onClick={() => toggle('prefs.windows', w)} />
          ))}
        </div>
      </Group>

      <Group title="Hours goal" id="set-goal">
        <div style={S('margin-top:18px;max-width:280px')}>
          <Field label="Hours you need this year" value={goal} inputMode="numeric" placeholder="e.g. 40" onChange={(v) => { setPref('hoursGoal', Number(v.replace(/\D/g, '').slice(0, 4)) || 0); flash(700); }} hint="Leave it blank if your school doesn't require hours." />
        </div>
      </Group>
    </>
  );
}

/* ---- notifications ------------------------------------------------------- */

function NotificationsSection({ state }) {
  const n = state.prefs.notifications;
  /* Only the kinds of in-app notification the feed actually produces get a
     switch. Shift reminders, a weekly summary, product news and browser push
     were never generated by anything, so they're gone; their saved values are
     left alone in prefs. */
  return (
    <Group
      title="What shows in Notifications"
      sub="Inside the app only. We don't send email or texts yet."
      id="set-what"
    >
      <Rows>
        <ToggleRow label="Application updates" hint="When an organization accepts you or passes on your application." on={n.applicationUpdates} onChange={(v) => setPref('notifications.applicationUpdates', v)} />
        <ToggleRow label="Project messages" hint="Updates posted by the lead of a project you're on." on={n.crewMessages} onChange={(v) => setPref('notifications.crewMessages', v)} />
        <ToggleRow label="Confirmed hours" hint="When an organizer confirms hours you logged or posts attendance for a shift." on={n.hoursConfirmed !== false} onChange={(v) => setPref('notifications.hoursConfirmed', v)} />
      </Rows>
    </Group>
  );
}

/* ---- privacy ------------------------------------------------------------- */

/** The same fields syncVolunteerDirectory publishes, drawn the way people see them. */
function DirectoryPreview({ state, listed }) {
  const a = state.account;
  const p = state.prefs || {};
  const name = (a.name || `${a.firstName || ''} ${a.lastName || ''}`).trim() || 'Your name';
  const place = [a.grade ? `Grade ${a.grade}` : '', a.city || p.location || ''].filter(Boolean).join(', ');
  const hrs = (state.stats && state.stats.verifiedHours) || 0;
  const skills = Array.isArray(a.skills) ? a.skills.join(', ') : a.skills || '';
  const causes = Array.isArray(p.causes) ? p.causes : [];
  /* One row, drawn the way the directory lists people: neutral avatar, name,
     grade and city, then causes, bio and skills as plain meta lines. */
  return (
    <div style={S('margin-top:28px')}>
      <h3 style={S(`margin:0;font:600 15px/1.3 ${F.body};color:${C.ink}`)}>What people see</h3>
      <p style={S(`margin:4px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>
        {listed ? 'Your listing right now. It updates when you edit your account or interests.' : 'Nobody sees this while the switch is off.'}
      </p>
      <div
        aria-label="Preview of your directory listing"
        role="group"
        className="vu-list"
        style={S(`margin-top:14px;${listed ? '' : 'opacity:.62'}`)}
      >
        <div className="vu-row" style={S('align-items:start')}>
          <span className="vu-row-avatar" style={S('width:40px;height:40px')}>
            <Avatar name={name} fs={14} />
          </span>
          <div style={S('min-width:0')}>
            <span className="vu-row-t">{name}</span>
            {place ? <span className="vu-row-m">{place}</span> : null}
            {causes.length ? <span className="vu-row-m vu-row-m--wrap">{causes.map(causeLabel).join(', ')}</span> : null}
            {a.bio ? <span className="vu-row-m vu-row-m--wrap vu-break" style={S(`color:${C.ink};margin-top:6px`)}>{a.bio}</span> : null}
            {skills ? <span className="vu-row-m vu-row-m--wrap vu-break">{skills}</span> : null}
          </div>
          <div className="vu-row-end" style={S('align-self:center')}>
            <span className="vu-row-num">{fmtHours(hrs)} confirmed {Number(fmtHours(hrs)) === 1 ? 'hr' : 'hrs'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacySection({ state, router }) {
  const p = state.prefs.privacy;
  const listed = p.publicProfile === true;
  return (
    <>
      <Group
        title="Volunteer directory"
        sub="The directory lets students and organizations who are signed in find volunteers by name, cause and city. You're only in it if you turn this on."
        id="set-dir"
      >
        <Rows>
          <ToggleRow
            label="Show me in the volunteer directory"
            hint={listed ? "On. You're listed in the directory." : "Off. You're not listed, and nobody can look you up."}
            on={listed}
            onChange={(v) => setPref('privacy.publicProfile', v)}
          />
        </Rows>
        <DirectoryPreview state={state} listed={listed} />
        {listed ? (
          <div style={S('margin-top:14px')}>
            <Button variant="ghost" size="sm" href="/volunteers">Open the directory</Button>
          </div>
        ) : null}
      </Group>

      <Group title="Who sees what" id="set-who">
        <Rows>
          <ActionRow title="Organizations you apply to" body="Your name, school and the application you send them." stack={false} />
          <ActionRow title="The volunteer directory" body="Only what's in the preview above, and only while you're listed." stack={false} />
          <ActionRow title="Everyone else" body="Nobody else sees your address, phone number or your parent's email." stack={false} />
        </Rows>
        <div style={S('margin-top:20px')}>
          <Button variant="outline" size="sm" onClick={() => router.push('/privacy')}>Read privacy policy</Button>
        </div>
      </Group>
    </>
  );
}

/* ---- appearance ---------------------------------------------------------- */

function AppearanceSection({ state }) {
  const a = state.prefs.appearance || {};
  const motion = a.motion === 'off' ? 'off' : 'system';
  const textSize = a.textSize || 'default';
  const contrast = a.contrast || 'default';
  const OPT = (label, value, current, path) => (
    <Chip key={value} label={label} on={current === value} py={9} px={14} fs={14} onClick={() => setPref(path, value)} />
  );
  return (
    <Group title="Appearance" sub="Changes apply right away and follow you to other devices." id="set-look">
      <Rows>
        <ActionRow title="Motion" body="Reduce motion turns off transitions and animations.">
          <div role="group" aria-label="Motion" className="vu-set-opts">
            {OPT('Follow my system', 'system', motion, 'appearance.motion')}
            {OPT('Reduce motion', 'off', motion, 'appearance.motion')}
          </div>
        </ActionRow>
        <ActionRow title="Text size" body="Makes text and controls bigger across the app.">
          <div role="group" aria-label="Text size" className="vu-set-opts">
            {OPT('Default', 'default', textSize, 'appearance.textSize')}
            {OPT('Large', 'large', textSize, 'appearance.textSize')}
            {OPT('Extra large', 'xlarge', textSize, 'appearance.textSize')}
          </div>
        </ActionRow>
        <ActionRow title="Contrast" body="Higher contrast darkens light gray text and borders.">
          <div role="group" aria-label="Contrast" className="vu-set-opts">
            {OPT('Default', 'default', contrast, 'appearance.contrast')}
            {OPT('Higher contrast', 'high', contrast, 'appearance.contrast')}
          </div>
        </ActionRow>
      </Rows>
    </Group>
  );
}

/* ---- permissions --------------------------------------------------------- */

const PERMISSION_COPY = {
  unknown: { label: 'Not asked yet', tone: 'mute' },
  granted: { label: 'Allowed', tone: 'ok' },
  denied: { label: 'Blocked', tone: 'bad' },
  dismissed: { label: 'No answer', tone: 'wait' },
  unavailable: { label: 'Unavailable', tone: 'wait' },
  unsupported: { label: 'Not supported', tone: 'mute' },
  default: { label: 'Not asked yet', tone: 'mute' },
};

function PermissionRow({ id, title, why, current, request, busy, setBusy }) {
  const meta = PERMISSION_COPY[current] || PERMISSION_COPY.unknown;

  async function ask() {
    setBusy(id);
    const result = await request();
    setBusy('');
    if (result === 'granted') toast({ title: `${title} allowed`, tone: 'ok' });
    else if (result === 'denied')
      toast({ title: `${title} is blocked`, message: 'Allow it again from the padlock icon in the address bar.', tone: 'warn', timeout: 7000 });
    else if (result === 'unsupported') toast({ title: 'Not supported in this browser', tone: 'warn' });
    else if (result === 'unavailable') toast({ title: `${title} isn't available`, message: 'Your device didn\'t return it. Try again later.', tone: 'warn' });
    else toast({ title: 'Nothing changed', message: 'You can ask again any time.', tone: 'brand' });
  }

  return (
    <div className="vu-set-row vu-set-stack" style={S('flex-wrap:wrap')}>
      <div className="vu-set-perm-text">
        <div style={S(T_LABEL)}>{title}</div>
        <div style={S(T_HINT)}>{why}</div>
      </div>
      <div style={S('display:flex;align-items:center;gap:12px;flex:none')}>
        {/* Once granted, the disabled "Allowed" button says it; no second label. */}
        {current === 'granted' ? null : <StatusText tone={meta.tone}>{meta.label}</StatusText>}
        <Button
          variant="outline"
          size="sm"
          aria-label={`Allow ${title.toLowerCase()}`}
          disabled={busy === id || current === 'granted' || current === 'unsupported'}
          onClick={ask}
        >
          {busy === id ? <span className="vu-spin" /> : current === 'granted' ? 'Allowed' : 'Allow'}
        </Button>
      </div>
      {current === 'denied' ? (
        <p role="note" style={S(`flex-basis:100%;margin:0;display:flex;gap:8px;align-items:flex-start;font:400 14px/1.5 ${F.body};color:${C.ink}`)}>
          <span aria-hidden="true" style={S(`flex:none;display:inline-flex;margin-top:2px;color:${C.waiting}`)}>
            <Icon name="alert" size={16} />
          </span>
          <span>Your browser is blocking this. Open the padlock icon next to the address bar, set it back to Ask, then reload.</span>
        </p>
      ) : null}
    </div>
  );
}

function PermissionsSection({ state }) {
  const perms = state.prefs.permissions;
  const [busy, setBusy] = useState('');
  return (
    <Group title="Device permissions" sub="We only ask when you press Allow. The app works without either one." id="set-perm">
      <Rows>
        <PermissionRow
          id="location"
          title="Location"
          why="Lets your browser share where you are. Searches still use the city or ZIP you type, and we don't store your coordinates."
          current={perms.location}
          request={requestLocationPermission}
          busy={busy}
          setBusy={setBusy}
        />
        <PermissionRow
          id="notifications"
          title="Notifications"
          why="Lets your browser show alerts from VolunteerU. Notifications inside the app work without it."
          current={perms.notifications}
          request={requestNotificationPermission}
          busy={busy}
          setBusy={setBusy}
        />
      </Rows>
    </Group>
  );
}

/* ---- data ---------------------------------------------------------------- */

/* Read and check a backup file before anything is asked or replaced.
   Resolves to its text; throws with a message that says what to do. */
async function readBackup(file) {
  const text = await file.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  const isObj = (v) => !!v && typeof v === 'object';
  if (!isObj(parsed) || !('__schema' in parsed) || !isObj(parsed.account) || !isObj(parsed.prefs)) {
    throw new Error("That file isn't a VolunteerU backup. Choose the volunteeru-backup.json you downloaded here.");
  }
  if (parsed.__schema !== getState().__schema) throw new Error("That backup is from a different version of VolunteerU, so it can't be loaded.");
  const me = getSyncUser();
  if (me && parsed.__owner && parsed.__owner !== me) throw new Error('That backup is from a different account. Sign in to that account to restore it.');
  return text;
}

function restoreFrom(text) {
  const session = { ...getState().session };
  const me = getSyncUser();
  importState(text);
  // Keep this sign-in, and save the restored copy to the account.
  update((st) => {
    st.session = session;
    if (me) st.__owner = me;
  });
}

function DataSection({ router }) {
  const fileRef = useRef(null);
  const [clearing, setClearing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /* The count comes from the same rows that go into the file: project hours
     (read fresh) plus hours logged on your own. */
  async function downloadHours() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { count, text } = await exportHoursCSV();
      download('volunteeru-hours.csv', text);
      toast({ title: 'Hours downloaded', message: count ? `${count} ${count === 1 ? 'row' : 'rows'} in volunteeru-hours.csv.` : 'No hours logged yet, so the file only has headings.', tone: 'ok' });
    } finally {
      setDownloading(false);
    }
  }

  function downloadBackup() {
    download('volunteeru-backup.json', exportState(), 'application/json');
    toast({ title: 'Backup downloaded', message: 'Saved as volunteeru-backup.json.', tone: 'ok' });
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = '';
    // Check the file first, so a wrong file never reaches the confirm step.
    let text;
    try {
      text = await readBackup(file);
    } catch (err) {
      toast({ title: "Backup wasn't restored", message: (err && err.message) || 'Choose a VolunteerU backup file.', tone: 'danger' });
      return;
    }
    const ok = await confirmDialog({ title: 'Restore this backup?', body: 'Your saved hours, projects and settings get replaced with what is in the file.', confirmLabel: 'Restore backup', cancelLabel: 'Go back' });
    if (!ok) return;
    try {
      restoreFrom(text);
      toast({ title: 'Backup restored', tone: 'ok' });
    } catch (err) {
      console.warn('restore failed', err);
      toast({ title: "Backup wasn't restored", message: (err && err.message) || 'Choose a VolunteerU backup file.', tone: 'danger' });
    }
  }

  async function clearDevice() {
    if (clearing) return;
    const ok = await confirmDialog({ title: 'Sign out and clear this device?', body: 'This signs you out and removes everything VolunteerU stored in this browser. Your account keeps your hours and projects.', confirmLabel: 'Sign out and clear', cancelLabel: 'Go back', requireText: 'RESET' });
    if (!ok) return;
    setClearing(true);
    await signOutToHome(router);
    resetStore();
    toast({ title: 'Device cleared', message: "You're signed out.", tone: 'ok' });
  }

  return (
    <>
      <Group title="Download and restore" sub="Your hours as a spreadsheet, or a full backup you can restore later." id="set-dl">
        <Rows>
          <ActionRow title="Hours spreadsheet" body="Every hour on your account, confirmed or not, as a CSV file.">
            <Button variant="outline" size="sm" icon="download" onClick={downloadHours} aria-label="Download hours (CSV)" aria-busy={downloading ? 'true' : undefined}>
              {downloading ? 'Downloading hours' : 'Download hours (CSV)'}
            </Button>
          </ActionRow>
          <ActionRow title="Full backup" body="Your hours, projects and settings in one JSON file.">
            <Button variant="outline" size="sm" icon="download" onClick={downloadBackup}>Download backup (JSON)</Button>
          </ActionRow>
          <ActionRow title="Restore a backup" body="Replaces your saved hours, projects and settings with the file.">
            <input ref={fileRef} type="file" accept="application/json,.json" className="vu-sr" tabIndex={-1} aria-hidden="true" onChange={onFile} />
            <Button variant="outline" size="sm" icon="upload" onClick={() => fileRef.current && fileRef.current.click()}>Choose backup file</Button>
          </ActionRow>
        </Rows>
      </Group>

      <Group title="Clear this device" id="set-clear">
        <Rows>
          <ActionRow title="Sign out and clear this browser" body="Removes what VolunteerU stored here. Sign in again to get it back.">
            <Button variant="danger" size="sm" onClick={clearDevice} disabled={clearing}>
              {clearing ? 'Clearing this device' : 'Sign out and clear'}
            </Button>
          </ActionRow>
        </Rows>
      </Group>
    </>
  );
}

/* ---- help / about --------------------------------------------------------- */

const HELP = [
  ['How hours get confirmed', 'Log your hours after a shift. The organization that ran it confirms them, and your profile shows confirmed hours apart from hours you logged on your own.'],
  ['Hours that were never confirmed', 'Find the application on your profile, press Message and ask the organizer to check. Until they confirm, the hours show as Waiting.'],
  ['If something feels unsafe', 'Leave first. Then tell the adult in charge and a parent or guardian.'],
];

function HelpSection({ router }) {
  return (
    <>
      <Group title="Common questions" id="set-faq">
        <Rows>
          {HELP.map(([t, b]) => (
            <div key={t} className="vu-set-row" style={S('display:block')}>
              <h3 style={S(`margin:0;${T_LABEL};font-weight:600`)}>{t}</h3>
              <p style={S(`margin:6px 0 0;font:400 14.5px/1.55 ${F.body};color:${C.ink2};max-width:600px`)}>{b}</p>
            </div>
          ))}
        </Rows>
      </Group>
      <Group title="Safety" id="set-safety">
        <p style={S(`margin:12px 0 0;font:400 15px/1.55 ${F.body};color:${C.ink};max-width:600px`)}>
          Someone on the VolunteerU team reviews an organization before it gets a verified badge. An opportunity without the badge hasn't been reviewed yet, so
          check who runs it before you go.
        </p>
        <div style={S('margin-top:20px')}>
          <Button variant="outline" size="sm" icon="shield" onClick={() => router.push('/safety')}>Read safety policy</Button>
        </div>
      </Group>
    </>
  );
}

function AboutSection({ router }) {
  const rows = [
    ['Version', '1.0.0'],
    ['Your data', 'Saved to your account'],
    ['Nonprofit data', 'IRS records via ProPublica'],
  ];
  return (
    <Group title="About VolunteerU" id="set-about">
      <p style={S(`margin:12px 0 0;font:400 15px/1.55 ${F.body};color:${C.ink};max-width:600px`)}>
        VolunteerU helps students find volunteer opportunities and nonprofits near them, sign up for shifts and get their hours confirmed by the organization.
        Students can also run their own student project. It's free for students.
      </p>
      <dl className="vu-set-rows" style={S('margin:24px 0 0')}>
        {rows.map(([k, v]) => (
          <div key={k} className="vu-set-row" style={S('padding:14px 0')}>
            <dt style={S(`font:400 14.5px/1.4 ${F.body};color:${C.ink2}`)}>{k}</dt>
            <dd style={S(`margin:0;font:500 14.5px/1.4 ${F.body};color:${C.ink};text-align:right;font-variant-numeric:tabular-nums`)}>{v}</dd>
          </div>
        ))}
      </dl>
      <div style={S('margin-top:16px;display:flex;gap:24px;flex-wrap:wrap')}>
        <Button variant="ghost" size="sm" onClick={() => router.push('/privacy')}>Privacy policy</Button>
        <Button variant="ghost" size="sm" onClick={() => router.push('/safety')}>Safety policy</Button>
      </div>
    </Group>
  );
}
