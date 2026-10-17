'use client';

/* ==========================================================================
   Settings.jsx, account, interests, notifications, privacy, appearance,
   permissions, data, help and about. Copy here only describes what the code
   does: notification choices are saved but email and text are not sent yet,
   and "Delete my data" erases the saved workspace (the sign-in itself stays,
   since a browser can't delete a Supabase auth user).
   ========================================================================== */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, Toggle, Chip, ImageSlot, Icon } from '../ui.jsx';
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

const MONO = "'Geist Mono',monospace";
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

const BTN_PRIMARY = `display:inline-flex;align-items:center;gap:9px;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer`;
const BTN_SECONDARY = 'display:inline-flex;align-items:center;gap:8px;white-space:nowrap;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer';
const BTN_DANGER = 'display:inline-flex;align-items:center;white-space:nowrap;padding:0 16px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 14px/1 Geist;color:#A8482A;cursor:pointer';

/* Below the desktop breakpoint the section list wraps into two columns
   instead of a nine-row stack above the content. */
const NAV_CSS = `
@media (max-width: 1179px) {
  .vu-set-nav { display:grid !important; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:4px !important; }
}
`;

export default function Settings({ section = 'account' }) {
  const router = useRouter();
  const { state } = useSnapshot();
  const active = SECTIONS.some((s2) => s2.k === section) ? section : 'account';

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px;max-width:1100px')}>
      <style dangerouslySetInnerHTML={{ __html: NAV_CSS }} />
      <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Settings</h1>

      <div className="vu-split" style={S('margin-top:24px;display:grid;grid-template-columns:230px 1fr;gap:28px;align-items:start')}>
        <nav aria-label="Settings sections" className="vu-set-nav" style={S('display:flex;flex-direction:column;gap:2px')}>
          {SECTIONS.map((sec) => {
            const on = active === sec.k;
            return (
              <Pressable
                key={sec.k}
                label={sec.label}
                current={on ? 'page' : undefined}
                onClick={() => router.push(`/settings/${sec.k}`)}
                className={cx(on ? '' : H.nav, H.press)}
                style={s(
                  'display:flex;align-items:center;gap:10px;padding:10px;border-radius:9px;cursor:pointer;font-family:Geist;font-size:14px;line-height:1;transition:background .16s ease',
                  `background:${on ? '#F2ECE5' : 'transparent'}`,
                  `color:${on ? '#1A1714' : '#6B635C'}`,
                  `font-weight:${on ? '600' : '450'}`
                )}
              >
                <span aria-hidden="true" style={S(`display:inline-flex;opacity:${on ? '.9' : '.6'}`)}>
                  <Icon name={sec.icon} size={15} />
                </span>
                {sec.label}
              </Pressable>
            );
          })}
        </nav>

        <div style={S('min-width:0')}>
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

function Panel({ title, sub, children }) {
  return (
    <section className="vu-screen" style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;margin-bottom:16px;padding:20px 22px 22px')}>
      <h2 style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.01em;color:#1A1714')}>{title}</h2>
      {sub ? <p style={S('margin:6px 0 0;font:450 13px/1.5 Geist;color:#6B635C;max-width:620px')}>{sub}</p> : null}
      <div style={S('margin-top:16px')}>{children}</div>
    </section>
  );
}

function ToggleRow({ label, hint, on, onChange, disabled, last }) {
  return (
    <div style={S(`display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;${last ? '' : 'border-bottom:1px solid #F1EBE4'}`)}>
      <div style={S('min-width:0')}>
        <div style={S('font:450 14px/1.4 Geist;color:#332D28')}>{label}</div>
        {hint ? <div style={S('margin-top:4px;font:450 12px/1.45 Geist;color:#8A8179')}>{hint}</div> : null}
      </div>
      <Toggle on={!!on} label={label} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function ActionRow({ title, body, children }) {
  return (
    <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:16px')}>
      <div style={S('min-width:0')}>
        <div style={S('font:450 14px/1.4 Geist;color:#332D28;overflow-wrap:anywhere')}>{title}</div>
        {body ? <div style={S('margin-top:5px;font:450 12px/1.45 Geist;color:#8A8179')}>{body}</div> : null}
      </div>
      <div style={S('flex:none')}>{children}</div>
    </div>
  );
}

function initials(a) {
  const f = (a.firstName || a.name || '').trim();
  const l = (a.lastName || '').trim();
  return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || '?';
}

/* Sign out, then land on the home page. Navigating first matters: signOut()
   waits until the tab is off a signed-in route, and a route guard that sees
   the session end first would send the person to /signin?next=... instead. */
async function signOutToHome(router) {
  router.push('/');
  await signOut();
}

/* ---- account ------------------------------------------------------------ */

function PasswordPanel() {
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
      toast({
        title: "Password wasn't changed",
        message: (ex && ex.friendly) || friendlyAuthMessage(ex),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Password">
      <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field
          label="New password"
          type="password"
          value={pw}
          onChange={(v) => { setPw(v); if (err.pw) setErr((x) => ({ ...x, pw: undefined })); }}
          onEnter={submit}
          autoComplete="new-password"
          required
          error={err.pw}
          hint={pw && !err.pw ? `Strength: ${strength.label}` : 'At least 8 characters.'}
        />
        <Field
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(v) => { setConfirm(v); if (err.confirm) setErr((x) => ({ ...x, confirm: undefined })); }}
          onEnter={submit}
          autoComplete="new-password"
          required
          error={err.confirm}
        />
      </div>
      <div style={S('margin-top:18px')}>
        <Pressable label="Update password" onClick={submit} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
          {busy ? 'Updating password' : 'Update password'}
        </Pressable>
      </div>
    </Panel>
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
    const ok = await confirmDialog({
      title: 'Sign out?',
      body: 'Your hours and projects will be here when you sign back in.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    });
    if (!ok) return;
    await signOutToHome(router);
    toast({ title: 'Signed out', tone: 'ok' });
  }

  async function deleteData() {
    if (deleting) return;
    const ok = await confirmDialog({
      title: 'Delete your data?',
      body: 'This erases the hours you logged, your projects and your settings, removes you from the volunteer directory, then signs you out. Organizations keep the applications and messages you sent them. You can sign in with this email again and start over.',
      confirmLabel: 'Delete my data',
      cancelLabel: 'Keep it',
      requireText: 'DELETE',
    });
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
      <Panel title="Profile" sub="Organizations see your name and school when you apply.">
        <div style={S('display:flex;align-items:center;gap:14px;margin-bottom:20px')}>
          <div style={S('width:52px;height:52px;border-radius:50%;overflow:hidden;flex:none;background:#F2ECE5;display:flex;align-items:center;justify-content:center')}>
            {a.avatar ? (
              <ImageSlot src={a.avatar} shape="circle" />
            ) : (
              <span aria-hidden="true" style={S('font:600 17px/1 Geist;color:#6B635C')}>{initials(a)}</span>
            )}
          </div>
          <div style={S('min-width:0')}>
            <div style={S('font:600 16px/1.2 Geist')}>{a.name || 'Your name'}</div>
            {meta ? <div style={S('margin-top:4px;font:450 12px/1.3 Geist;color:#8A8179')}>{meta}</div> : null}
          </div>
        </div>
        <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
          <Field label="First name" value={f.firstName} onChange={set('firstName')} required error={err.firstName} maxLength={40} autoComplete="given-name" />
          <Field label="Last name" value={f.lastName} onChange={set('lastName')} maxLength={40} autoComplete="family-name" />
          <Field label="Email" type="email" value={signInEmail} readOnly bg="#F6F2EE" hint="You sign in with this email." />
          <Field label="Phone" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" hint="Not shown to organizations or students." />
          <Field label="School" value={f.school} onChange={set('school')} maxLength={60} />
          <Select label="Grade" value={f.grade} options={GRADES} onChange={set('grade')} />
          <Field label="City" value={f.city} onChange={set('city')} maxLength={60} autoComplete="address-level2" />
          <Field label="ZIP code" value={f.zip} onChange={(v) => setF((x) => ({ ...x, zip: v.replace(/\D/g, '').slice(0, 5) }))} inputMode="numeric" autoComplete="postal-code" error={err.zip} />
        </div>
        <div style={S('margin-top:14px')}>
          <Field
            label="Parent or guardian email"
            type="email"
            value={f.guardianEmail}
            onChange={set('guardianEmail')}
            error={err.guardianEmail}
            hint="Some organizations need a parent's OK if you're under 16."
          />
        </div>
        <div style={S('margin-top:20px;display:flex;align-items:center;gap:12px')}>
          <Pressable label="Save changes" onClick={save} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
            Save changes
          </Pressable>
          {saved ? (
            <span role="status" style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#3F6B4E')}>
              <Icon name="check" size={14} />
              Saved
            </span>
          ) : null}
        </div>
      </Panel>

      <PasswordPanel />

      <Panel title="Signed in">
        <ActionRow title={signInEmail} body="Your hours and projects are saved to your account.">
          <Pressable label="Sign out" onClick={signOutNow} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
            <Icon name="log-out" size={15} />
            Sign out
          </Pressable>
        </ActionRow>
      </Panel>

      <Panel title="Delete your data">
        <ActionRow
          title="Erase what you've saved on VolunteerU"
          body="Clears your logged hours, projects and settings, then signs you out. Your sign-in email still works."
        >
          <Pressable label="Delete my data" onClick={deleteData} disabled={deleting} className={cx(H.danger, H.press)} style={S(BTN_DANGER)}>
            {deleting ? 'Deleting your data' : 'Delete my data'}
          </Pressable>
        </ActionRow>
      </Panel>
    </>
  );
}

/* ---- interests (route key stays "preferences") -------------------------- */

function PreferencesSection({ state }) {
  const p = state.prefs;
  const goal = p.hoursGoal ? String(p.hoursGoal) : '';
  return (
    <>
      <Panel title="Causes" sub="Discover starts filtered to the causes you pick.">
        <div style={S('display:flex;flex-wrap:wrap;gap:8px')}>
          {CAUSES.map((c) => (
            <Chip key={c} label={c} role="checkbox" on={p.causes.includes(c)} py={9} px={13} fs={13} onClick={() => toggleInList('prefs.causes', c)} />
          ))}
        </div>
        {!p.causes.length ? <div className="vu-hint">None picked, so Discover shows every cause.</div> : null}
      </Panel>

      <Panel title="When you're free">
        <div style={S('display:flex;flex-wrap:wrap;gap:8px')}>
          {WINDOWS.map((w) => (
            <Chip key={w} label={w} role="checkbox" on={p.windows.includes(w)} py={9} px={13} fs={13} onClick={() => toggleInList('prefs.windows', w)} />
          ))}
        </div>
      </Panel>

      <Panel title="Hours goal">
        <div style={S('max-width:260px')}>
          <Field
            label="Hours you need this year"
            value={goal}
            inputMode="numeric"
            placeholder="e.g. 40"
            onChange={(v) => setPref('hoursGoal', Number(v.replace(/\D/g, '').slice(0, 4)) || 0)}
            hint="Leave it blank if your school doesn't require hours."
          />
        </div>
      </Panel>
    </>
  );
}

/* ---- notifications ------------------------------------------------------- */

function NotificationsSection({ state }) {
  const n = state.prefs.notifications;
  const ch = n.channel || {};
  return (
    <>
      <Panel
        title="What we send you"
        sub="Updates always show under Notifications in the app. We don't send email or texts yet, so these choices apply once we do."
      >
        <ToggleRow label="Shift reminders" hint="The day before each shift you signed up for." on={n.shiftReminders} onChange={(v) => setPref('notifications.shiftReminders', v)} />
        <ToggleRow label="Application updates" hint="When an organization accepts you or passes on your application." on={n.applicationUpdates} onChange={(v) => setPref('notifications.applicationUpdates', v)} />
        <ToggleRow label="Project messages" hint="Updates posted by the lead of a project you're on." on={n.crewMessages} onChange={(v) => setPref('notifications.crewMessages', v)} />
        <ToggleRow label="Weekly summary" hint="Your upcoming shifts and new opportunities, every Monday." on={n.weeklyDigest} onChange={(v) => setPref('notifications.weeklyDigest', v)} />
        <ToggleRow label="Product news" hint="New VolunteerU features, a few times a year." on={n.productNews} onChange={(v) => setPref('notifications.productNews', v)} last />
      </Panel>
      <Panel title="How we reach you">
        <ToggleRow label="Browser notifications" hint="Needs permission, see Permissions." on={ch.push} onChange={(v) => setPref('notifications.channel.push', v)} />
        <ToggleRow label="Email" on={ch.email} onChange={(v) => setPref('notifications.channel.email', v)} />
        <ToggleRow label="Text message" hint="Shift reminders and cancellations only." on={ch.sms} onChange={(v) => setPref('notifications.channel.sms', v)} last />
      </Panel>
    </>
  );
}

/* ---- privacy ------------------------------------------------------------- */

function PrivacySection({ state, router }) {
  const p = state.prefs.privacy;
  return (
    <>
      <Panel title="Volunteer directory">
        <ToggleRow
          label="Show me in the volunteer directory"
          hint="Signed-in students and organizations see your name, city, grade, causes, bio and confirmed hours."
          on={p.publicProfile}
          onChange={(v) => setPref('privacy.publicProfile', v)}
          last
        />
      </Panel>
      <Panel title="Who sees what">
        <div style={S('display:flex;flex-direction:column;gap:10px;font:450 14px/1.55 Geist;color:#57504A')}>
          <p style={S('margin:0')}>An organization sees your name, school and application when you apply to them.</p>
          <p style={S('margin:0')}>Nobody else sees your address, phone number or your parent's email.</p>
        </div>
        <Pressable label="Read privacy policy" onClick={() => router.push('/privacy')} className={cx(H.secondary, H.press)} style={S(`margin-top:16px;${BTN_SECONDARY}`)}>
          Read privacy policy
        </Pressable>
      </Panel>
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
    <Chip key={value} label={label} on={current === value} py={9} px={13} fs={13} onClick={() => setPref(path, value)} />
  );
  return (
    <>
      <Panel title="Motion" sub="Reduce motion turns off transitions and animations.">
        <div role="group" aria-label="Motion" style={S('display:flex;gap:8px;flex-wrap:wrap')}>
          {OPT('Follow my system', 'system', motion, 'appearance.motion')}
          {OPT('Reduce motion', 'off', motion, 'appearance.motion')}
        </div>
      </Panel>
      <Panel title="Text size">
        <div role="group" aria-label="Text size" style={S('display:flex;gap:8px;flex-wrap:wrap')}>
          {OPT('Default', 'default', textSize, 'appearance.textSize')}
          {OPT('Large', 'large', textSize, 'appearance.textSize')}
          {OPT('Extra large', 'xlarge', textSize, 'appearance.textSize')}
        </div>
      </Panel>
      <Panel title="Contrast" sub="Higher contrast darkens light gray text and borders.">
        <div role="group" aria-label="Contrast" style={S('display:flex;gap:8px;flex-wrap:wrap')}>
          {OPT('Default', 'default', contrast, 'appearance.contrast')}
          {OPT('Higher contrast', 'high', contrast, 'appearance.contrast')}
        </div>
      </Panel>
    </>
  );
}

/* ---- permissions --------------------------------------------------------- */

const PERMISSION_COPY = {
  unknown: { label: 'Not asked yet', tone: 'mute' },
  granted: { label: 'Allowed', tone: 'ok' },
  denied: { label: 'Blocked', tone: 'bad' },
  dismissed: { label: 'No answer', tone: 'warn' },
  unavailable: { label: 'Unavailable', tone: 'warn' },
  unsupported: { label: 'Not supported', tone: 'mute' },
  default: { label: 'Not asked yet', tone: 'mute' },
};

const TONES = {
  ok: { bg: '#EAF3EC', color: '#3F6B4E' },
  warn: { bg: '#FDF3E7', color: '#8A5A20' },
  bad: { bg: '#F5E7E0', color: '#A8482A' },
  mute: { bg: '#F6F2EE', color: '#6B635C' },
};

function PermissionRow({ id, title, why, current, request, busy, setBusy, last }) {
  const meta = PERMISSION_COPY[current] || PERMISSION_COPY.unknown;
  const t = TONES[meta.tone];

  async function ask() {
    setBusy(id);
    const result = await request();
    setBusy('');
    if (result === 'granted') toast({ title: `${title} allowed`, tone: 'ok' });
    else if (result === 'denied')
      toast({
        title: `${title} is blocked`,
        message: 'Allow it again from the padlock icon in the address bar.',
        tone: 'warn',
        timeout: 7000,
      });
    else if (result === 'unsupported') toast({ title: 'Not supported in this browser', tone: 'warn' });
    else if (result === 'unavailable') toast({ title: `${title} isn't available`, message: 'Your device didn\'t return it. Try again later.', tone: 'warn' });
    else toast({ title: 'Nothing changed', message: 'You can ask again any time.', tone: 'brand' });
  }

  return (
    <div style={S(`padding:14px 0;${last ? '' : 'border-bottom:1px solid #F1EBE4'}`)}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
        <div style={S('min-width:0')}>
          <div style={S('font:600 14px/1.35 Geist')}>{title}</div>
          <div style={S('margin-top:5px;font:450 13px/1.5 Geist;color:#6B635C')}>{why}</div>
        </div>
        <div style={S('display:flex;align-items:center;gap:10px;flex:none')}>
          <span style={S(`padding:5px 9px;border-radius:7px;background:${t.bg};font:500 11px/1 ${MONO};color:${t.color}`)}>{meta.label}</span>
          <Pressable
            label={`Allow ${title.toLowerCase()}`}
            disabled={busy === id || current === 'granted' || current === 'unsupported'}
            onClick={ask}
            className={cx(H.secondary, H.press)}
            style={S('display:inline-flex;align-items:center;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer')}
          >
            {busy === id ? <span className="vu-spin" /> : current === 'granted' ? 'Allowed' : 'Allow'}
          </Pressable>
        </div>
      </div>
      {current === 'denied' ? (
        <div style={S('margin-top:12px;padding:12px 14px;border-radius:11px;background:#FDF3E7;border:1px solid #F3E3CD;font:450 12px/1.5 Geist;color:#8A5A20')}>
          Your browser is blocking this. Open the padlock icon next to the address bar, set it back to Ask, then reload.
        </div>
      ) : null}
    </div>
  );
}

function PermissionsSection({ state }) {
  const perms = state.prefs.permissions;
  const [busy, setBusy] = useState('');
  return (
    <Panel title="Device permissions" sub="We only ask when you press Allow. The app works without either one.">
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
        last
      />
    </Panel>
  );
}

/* ---- data ---------------------------------------------------------------- */

async function restoreFrom(file) {
  const text = await file.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object' || !('__schema' in parsed)) throw new Error("That file isn't a VolunteerU backup.");
  const me = getSyncUser();
  if (me && parsed.__owner && parsed.__owner !== me) throw new Error('That backup is from a different account.');
  const session = { ...getState().session };
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
      toast({
        title: 'Hours downloaded',
        message: count ? `${count} ${count === 1 ? 'row' : 'rows'} in volunteeru-hours.csv.` : 'No hours logged yet, so the file only has headings.',
        tone: 'ok',
      });
    } finally {
      setDownloading(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const ok = await confirmDialog({
      title: 'Restore this backup?',
      body: 'Your saved hours, projects and settings get replaced with what is in the file.',
      confirmLabel: 'Restore backup',
      cancelLabel: 'Go back',
    });
    if (!ok) return;
    try {
      await restoreFrom(file);
      toast({ title: 'Backup restored', tone: 'ok' });
    } catch (err) {
      console.warn('restore failed', err);
      toast({ title: "Backup wasn't restored", message: (err && err.message) || 'Choose a VolunteerU backup file.', tone: 'danger' });
    }
  }

  async function clearDevice() {
    if (clearing) return;
    const ok = await confirmDialog({
      title: 'Sign out and clear this device?',
      body: 'This signs you out and removes everything VolunteerU stored in this browser. Your account keeps your hours and projects.',
      confirmLabel: 'Sign out and clear',
      cancelLabel: 'Go back',
      requireText: 'RESET',
    });
    if (!ok) return;
    setClearing(true);
    await signOutToHome(router);
    resetStore();
    toast({ title: 'Device cleared', message: "You're signed out.", tone: 'ok' });
  }

  return (
    <>
      <Panel title="Download" sub="Your hours as a spreadsheet, or a full backup you can restore later.">
        <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <Pressable label="Download hours (CSV)" onClick={downloadHours} disabled={downloading} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
            <Icon name="download" size={15} />
            {downloading ? 'Downloading hours' : 'Download hours (CSV)'}
          </Pressable>
          <Pressable
            label="Download backup (JSON)"
            onClick={() => {
              download('volunteeru-backup.json', exportState(), 'application/json');
              toast({ title: 'Backup downloaded', message: 'Saved as volunteeru-backup.json.', tone: 'ok' });
            }}
            className={cx(H.secondary, H.press)}
            style={S(BTN_SECONDARY)}
          >
            <Icon name="download" size={15} />
            Download backup (JSON)
          </Pressable>
        </div>
      </Panel>

      <Panel title="Restore a backup" sub="Replaces your saved hours, projects and settings with a backup file.">
        <input ref={fileRef} type="file" accept="application/json,.json" className="vu-sr" tabIndex={-1} aria-hidden="true" onChange={onFile} />
        <Pressable label="Choose backup file" onClick={() => fileRef.current && fileRef.current.click()} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
          <Icon name="upload" size={15} />
          Choose backup file
        </Pressable>
      </Panel>

      <Panel title="Clear this device" sub="Signs you out and removes what VolunteerU stored in this browser. Sign in again to get it back.">
        <Pressable label="Sign out and clear" onClick={clearDevice} disabled={clearing} className={cx(H.danger, H.press)} style={S(BTN_DANGER)}>
          {clearing ? 'Clearing this device' : 'Sign out and clear'}
        </Pressable>
      </Panel>
    </>
  );
}

/* ---- help / about --------------------------------------------------------- */

const HELP = [
  ['How hours get confirmed', 'Log your hours after a shift. The organization that ran it confirms them, and your profile shows confirmed hours apart from hours you logged on your own.'],
  ['Hours that were never confirmed', 'Find the application on your profile, press Message and ask the organizer to check. Until they confirm, the hours stay logged on your own.'],
  ['If something feels unsafe', 'Leave first. Then tell the adult in charge and a parent or guardian.'],
];

function HelpSection({ router }) {
  return (
    <>
      <Panel title="Common questions">
        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          {HELP.map(([t, b]) => (
            <div key={t}>
              <h3 style={S('margin:0;font:600 14px/1.35 Geist')}>{t}</h3>
              <p style={S('margin:6px 0 0;font:450 13px/1.6 Geist;color:#6B635C')}>{b}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Safety">
        <p style={S('margin:0;font:450 14px/1.6 Geist;color:#57504A')}>
          Someone on the VolunteerU team reviews an organization before it gets a verified badge. An opportunity without the badge hasn't been reviewed yet, so
          check who runs it before you go.
        </p>
        <Pressable label="Read safety policy" onClick={() => router.push('/safety')} className={cx(H.secondary, H.press)} style={S(`margin-top:16px;${BTN_SECONDARY}`)}>
          <Icon name="shield" size={15} />
          Read safety policy
        </Pressable>
      </Panel>
    </>
  );
}

function AboutSection({ router }) {
  const rows = [
    ['Version', '1.0.0'],
    ['Your data', 'Saved to your account'],
    ['Nonprofit data', 'IRS records via ProPublica'],
    ['Map tiles', '© OpenStreetMap contributors'],
  ];
  return (
    <Panel title="About VolunteerU">
      <p style={S('margin:0;font:450 14px/1.6 Geist;color:#57504A')}>
        VolunteerU helps students find volunteer opportunities and nonprofits near them, sign up for shifts and get their hours confirmed by the organization.
        Students can also run their own student project. It's free for students.
      </p>
      <dl style={S('margin:18px 0 0;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
        {rows.map(([k, v]) => (
          <div key={k} style={S('display:flex;justify-content:space-between;gap:12px')}>
            <dt>{k}</dt>
            <dd style={S('margin:0;color:#1A1714;font-weight:500;text-align:right')}>{v}</dd>
          </div>
        ))}
      </dl>
      <div style={S('margin-top:18px;display:flex;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Privacy policy" onClick={() => router.push('/privacy')} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
          Privacy policy
        </Pressable>
        <Pressable label="Safety policy" onClick={() => router.push('/safety')} className={cx(H.secondary, H.press)} style={S(BTN_SECONDARY)}>
          Safety policy
        </Pressable>
      </div>
    </Panel>
  );
}
