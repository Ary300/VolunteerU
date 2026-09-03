'use client';

/* ==========================================================================
   Settings.jsx, account, notifications, privacy, appearance, data, about
   Built from the design system; the design implies these surfaces (sidebar
   account menu, permissions, counselor access) without drawing them.
   ========================================================================== */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, Toggle, Chip, ImageSlot } from '../ui.jsx';
import { useSnapshot, exportState, importState, resetStore } from '../../lib/store.js';
import { confirmDialog, toast, openModal } from '../../lib/overlays.js';
import {
  updateAccount, setPref, togglePref, toggleInList, signOut, transcriptCSV, download,
  requestNotificationPermission, requestLocationPermission, validateEmail,
} from '../../lib/db.js';
import { CAUSES, WINDOWS } from '../../lib/seed.js';

const MONO = "'Geist Mono',monospace";

export const SECTIONS = [
  { k: 'account', label: 'Account', icon: '☺' },
  { k: 'preferences', label: 'Matching', icon: '◎' },
  { k: 'notifications', label: 'Notifications', icon: '☰' },
  { k: 'privacy', label: 'Privacy', icon: '◈' },
  { k: 'appearance', label: 'Appearance', icon: '◐' },
  { k: 'permissions', label: 'Permissions', icon: '⚑' },
  { k: 'data', label: 'Your data', icon: '▤' },
  { k: 'help', label: 'Help and safety', icon: '?' },
  { k: 'about', label: 'About', icon: '◇' },
];

export default function Settings({ section = 'account' }) {
  const router = useRouter();
  const { state } = useSnapshot();
  const active = SECTIONS.some((s2) => s2.k === section) ? section : 'account';

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px;max-width:1100px')}>
      <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Settings</h1>
      <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>
        Everything about your account, what we match you to, and what leaves this device.
      </p>

      <div className="vu-split" style={S('margin-top:26px;display:grid;grid-template-columns:230px 1fr;gap:28px;align-items:start')}>
        <nav aria-label="Settings sections" style={S('display:flex;flex-direction:column;gap:2px')}>
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
                <span aria-hidden="true" style={S('font-size:12px;opacity:.55')}>{sec.icon}</span>
                {sec.label}
              </Pressable>
            );
          })}
        </nav>

        <div>
          {active === 'account' ? <AccountSection state={state} router={router} /> : null}
          {active === 'preferences' ? <PreferencesSection state={state} /> : null}
          {active === 'notifications' ? <NotificationsSection state={state} /> : null}
          {active === 'privacy' ? <PrivacySection state={state} /> : null}
          {active === 'appearance' ? <AppearanceSection state={state} /> : null}
          {active === 'permissions' ? <PermissionsSection state={state} /> : null}
          {active === 'data' ? <DataSection state={state} router={router} /> : null}
          {active === 'help' ? <HelpSection router={router} /> : null}
          {active === 'about' ? <AboutSection /> : null}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, sub, children }) {
  return (
    <div className="vu-screen" style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;margin-bottom:16px')}>
      <div style={S('padding:20px 22px;border-bottom:1px solid #F1EBE4;background:#FCFAF8')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>{title}</div>
        {sub ? <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#6B635C')}>{sub}</div> : null}
      </div>
      <div style={S('padding:22px')}>{children}</div>
    </div>
  );
}

function ToggleRow({ label, hint, on, onChange, disabled }) {
  return (
    <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #F1EBE4')}>
      <div style={S('min-width:0')}>
        <div style={S('font:450 14px/1.4 Geist;color:#332D28')}>{label}</div>
        {hint ? <div style={S('margin-top:5px;font:450 12px/1.45 Geist;color:#8A8179')}>{hint}</div> : null}
      </div>
      <Toggle on={on} label={label} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/* ---- account ------------------------------------------------------------ */

function AccountSection({ state, router }) {
  const a = state.account;
  const [f, setF] = useState({
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
    phone: a.phone,
    school: a.school,
    grade: String(a.grade),
    city: a.city,
    zip: a.zip,
    guardianEmail: a.guardianEmail,
  });
  const [err, setErr] = useState({});
  const [saved, setSaved] = useState(false);

  function save() {
    const e = {};
    if (!f.firstName.trim()) e.firstName = 'Enter your first name.';
    const em = validateEmail(f.email);
    if (em) e.email = em;
    if (!/^\d{5}$/.test(f.zip.trim())) e.zip = 'Five digits.';
    setErr(e);
    if (Object.keys(e).length) {
      toast({ title: 'Check the highlighted fields', tone: 'warn' });
      return;
    }
    updateAccount({
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      phone: f.phone.trim(),
      school: f.school.trim(),
      grade: Number(f.grade),
      city: f.city.trim(),
      zip: f.zip.trim(),
      guardianEmail: f.guardianEmail.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast({ title: 'Account updated', tone: 'ok' });
  }

  async function deleteAccount() {
    const ok = await confirmDialog({
      title: 'Delete your account?',
      body: 'This removes your profile, verified hours, applications and any project you lead from this device. Organizations keep their own attendance records. This cannot be undone.',
      confirmLabel: 'Delete everything',
      requireText: 'DELETE',
    });
    if (!ok) return;
    resetStore();
    toast({ title: 'Account deleted', message: 'Everything on this device has been cleared.', tone: 'ok' });
    router.push('/');
  }

  return (
    <>
      <Panel title="Profile" sub="This is what organizations see when you apply.">
        <div style={S('display:flex;align-items:center;gap:16px;margin-bottom:20px')}>
          <div style={S('width:56px;height:56px;border-radius:50%;overflow:hidden;flex:none')}>
            <ImageSlot src={a.avatar} shape="circle" placeholder="portrait" />
          </div>
          <div>
            <div style={S('font:600 16px/1.2 Geist')}>{a.name}</div>
            <div style={S('margin-top:4px;font:450 12px/1.3 Geist;color:#8A8179')}>Grade {a.grade} · {a.school}</div>
          </div>
        </div>
        <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
          <Field label="First name" value={f.firstName} onChange={(v) => setF((x) => ({ ...x, firstName: v }))} required error={err.firstName} maxLength={40} />
          <Field label="Last name" value={f.lastName} onChange={(v) => setF((x) => ({ ...x, lastName: v }))} maxLength={40} />
          <Field label="Email" type="email" value={f.email} onChange={(v) => setF((x) => ({ ...x, email: v }))} required error={err.email} />
          <Field label="Phone" value={f.phone} onChange={(v) => setF((x) => ({ ...x, phone: v }))} inputMode="tel" hint="Used for shift reminders only." />
          <Field label="School" value={f.school} onChange={(v) => setF((x) => ({ ...x, school: v }))} maxLength={60} />
          <Select label="Grade" value={f.grade} options={['9', '10', '11', '12']} onChange={(v) => setF((x) => ({ ...x, grade: v }))} />
          <Field label="City" value={f.city} onChange={(v) => setF((x) => ({ ...x, city: v }))} maxLength={60} />
          <Field label="ZIP code" value={f.zip} onChange={(v) => setF((x) => ({ ...x, zip: v.replace(/\D/g, '').slice(0, 5) }))} inputMode="numeric" error={err.zip} />
        </div>
        <div style={S('margin-top:14px')}>
          <Field label="Guardian email" value={f.guardianEmail} onChange={(v) => setF((x) => ({ ...x, guardianEmail: v }))} hint="Required while you are under 16. Guardians confirm consent once per organization." />
        </div>
        <div style={S('margin-top:20px;display:flex;align-items:center;gap:12px')}>
          <Pressable
            label="Save account changes"
            onClick={save}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)')}
          >
            <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
            Save changes
          </Pressable>
          {saved ? <span style={S('font:500 13px/1 Geist;color:#3F6B4E')}>Saved</span> : null}
        </div>
      </Panel>

      <Panel title="Session">
        <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:16px')}>
          <div>
            <div style={S('font:450 14px/1.4 Geist;color:#332D28')}>Signed in as {a.email}</div>
            <div style={S('margin-top:5px;font:450 12px/1.45 Geist;color:#8A8179')}>Signing out keeps everything on this device.</div>
          </div>
          <Pressable
            label="Sign out"
            onClick={async () => {
              const ok = await confirmDialog({ title: 'Sign out?', body: 'Your record and projects stay on this device.', confirmLabel: 'Sign out' });
              if (!ok) return;
              signOut();
              toast({ title: 'Signed out', tone: 'ok' });
              router.push('/');
            }}
            className={cx(H.secondary, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
          >
            Sign out
          </Pressable>
        </div>
      </Panel>

      <Panel title="Danger zone">
        <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:16px')}>
          <div>
            <div style={S('font:450 14px/1.4 Geist;color:#332D28')}>Delete your account</div>
            <div style={S('margin-top:5px;font:450 12px/1.45 Geist;color:#8A8179')}>
              Removes your profile, hours, applications and projects from this device. Organizations keep their own attendance records.
            </div>
          </div>
          <Pressable
            label="Delete account"
            onClick={deleteAccount}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;white-space:nowrap;padding:0 16px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 14px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            Delete account
          </Pressable>
        </div>
      </Panel>
    </>
  );
}

/* ---- matching preferences ------------------------------------------------ */

function PreferencesSection({ state }) {
  const p = state.prefs;
  return (
    <>
      <Panel title="Causes" sub="We rank openings against these first.">
        <div style={S('display:flex;flex-wrap:wrap;gap:8px')}>
          {CAUSES.map((c) => (
            <Chip key={c} label={c} role="checkbox" on={p.causes.includes(c)} py={9} px={13} fs={13} onClick={() => toggleInList('prefs.causes', c)} />
          ))}
        </div>
        {!p.causes.length ? <div className="vu-hint">Nothing selected, we will show you everything nearby.</div> : null}
      </Panel>

      <Panel title="When you are free">
        <div style={S('display:flex;flex-wrap:wrap;gap:8px')}>
          {WINDOWS.map((w) => (
            <Chip key={w} label={w} role="checkbox" on={p.windows.includes(w)} py={9} px={13} fs={13} onClick={() => toggleInList('prefs.windows', w)} />
          ))}
        </div>
      </Panel>

      <Panel title="Hours goal">
        <Field
          label="Your hours goal (optional)"
          value={String(p.hoursGoal)}
          inputMode="numeric"
          onChange={(v) => setPref('hoursGoal', Number(v.replace(/\D/g, '')) || 0)}
          hint="A personal target. Track progress on your record."
        />
      </Panel>
    </>
  );
}

/* ---- notifications ------------------------------------------------------- */

function NotificationsSection({ state }) {
  const n = state.prefs.notifications;
  return (
    <>
      <Panel title="What we send you" sub="Application updates and crew messages appear in your in-app notification center now. Reminders and the digest are delivered once email and text channels are switched on.">
        <ToggleRow label="Shift reminders" hint="24 hours before, and again when check-in opens." on={n.shiftReminders} onChange={(v) => setPref('notifications.shiftReminders', v)} />
        <ToggleRow label="Application updates" hint="When an organization accepts, waitlists or declines you. Shows in your notifications." on={n.applicationUpdates} onChange={(v) => setPref('notifications.applicationUpdates', v)} />
        <ToggleRow label="Crew messages" hint="Announcements from projects you are on. Shows in your notifications." on={n.crewMessages} onChange={(v) => setPref('notifications.crewMessages', v)} />
        <ToggleRow label="Weekly digest" hint="Monday summary of hours, upcoming shifts and new matches." on={n.weeklyDigest} onChange={(v) => setPref('notifications.weeklyDigest', v)} />
        <ToggleRow label="Product news" hint="Occasional updates about new features. Off by default." on={n.productNews} onChange={(v) => setPref('notifications.productNews', v)} />
      </Panel>
      <Panel title="How we send it" sub="In-app notifications are always on. Email and text delivery are rolling out, your choices here are saved and take effect when they do.">
        <ToggleRow label="Push notifications" on={n.channel.push} onChange={(v) => setPref('notifications.channel.push', v)} />
        <ToggleRow label="Email" on={n.channel.email} onChange={(v) => setPref('notifications.channel.email', v)} />
        <ToggleRow label="Text message" hint="Only for shift reminders and cancellations." on={n.channel.sms} onChange={(v) => setPref('notifications.channel.sms', v)} />
      </Panel>
    </>
  );
}

/* ---- privacy ------------------------------------------------------------- */

function PrivacySection({ state }) {
  const p = state.prefs.privacy;
  return (
    <Panel title="Who can see what" sub="Your address, phone and guardian details are never shown to other students.">
      <ToggleRow label="Public record page" hint="Lets anyone with your share link see hours, causes and organizer notes." on={p.publicProfile} onChange={(v) => setPref('privacy.publicProfile', v)} />
      <ToggleRow label="Show my school" hint="Appears on your record and on applications." on={p.showSchool} onChange={(v) => setPref('privacy.showSchool', v)} />
      <ToggleRow label="Show me in “friends going”" hint="Other students from your school can see which shifts you claimed." on={p.showFriendsGoing} onChange={(v) => setPref('privacy.showFriendsGoing', v)} />
      <ToggleRow label="Share my record when I apply" hint="Organizations see verified hours and cause history with each application." on={p.shareRecordOnApply} onChange={(v) => setPref('privacy.shareRecordOnApply', v)} />
      <ToggleRow label="Counselor access" hint="Lets your counselor view and confirm the record. They can never edit it." on={p.counselorAccess} onChange={(v) => setPref('privacy.counselorAccess', v)} />
    </Panel>
  );
}

/* ---- appearance ---------------------------------------------------------- */

function AppearanceSection({ state }) {
  const a = state.prefs.appearance;
  const OPT = (label, value, current, onPick) => (
    <Chip key={value} label={label} on={current === value} py={9} px={13} fs={13} onClick={() => onPick(value)} />
  );
  return (
    <>
      <Panel title="Motion" sub="Turning motion off removes every transition and animation.">
        <div style={S('display:flex;gap:8px;flex-wrap:wrap')}>
          {OPT('Follow my system', 'system', a.motion, (v) => setPref('appearance.motion', v))}
          {OPT('Reduce motion', 'off', a.motion, (v) => setPref('appearance.motion', v))}
        </div>
      </Panel>
      <Panel title="Text size">
        <div style={S('display:flex;gap:8px;flex-wrap:wrap')}>
          {OPT('Default', 'default', a.textSize, (v) => setPref('appearance.textSize', v))}
          {OPT('Large', 'large', a.textSize, (v) => setPref('appearance.textSize', v))}
          {OPT('Extra large', 'xlarge', a.textSize, (v) => setPref('appearance.textSize', v))}
        </div>
      </Panel>
      <Panel title="Contrast">
        <div style={S('display:flex;gap:8px;flex-wrap:wrap')}>
          {OPT('Default', 'default', a.contrast, (v) => setPref('appearance.contrast', v))}
          {OPT('Higher contrast', 'high', a.contrast, (v) => setPref('appearance.contrast', v))}
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
  dismissed: { label: 'Dismissed', tone: 'warn' },
  unavailable: { label: 'Unavailable', tone: 'warn' },
  unsupported: { label: 'Not supported in this browser', tone: 'mute' },
  default: { label: 'Not asked yet', tone: 'mute' },
};

const TONES = {
  ok: { bg: '#EAF3EC', color: '#3F6B4E' },
  warn: { bg: '#FDF3E7', color: '#8A5A20' },
  bad: { bg: '#F5E7E0', color: '#A8482A' },
  mute: { bg: '#F6F2EE', color: '#6B635C' },
};

function PermissionsSection({ state }) {
  const perms = state.prefs.permissions;
  const [busy, setBusy] = useState('');

  const row = (key, title, why, current, request) => {
    const meta = PERMISSION_COPY[current] || PERMISSION_COPY.unknown;
    const t = TONES[meta.tone];
    const blocked = current === 'denied';
    return (
      <div style={S('padding:16px 0;border-bottom:1px solid #F1EBE4')}>
        <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
          <div style={S('min-width:0')}>
            <div style={S('font:600 14px/1.35 Geist')}>{title}</div>
            <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>{why}</div>
          </div>
          <div style={S('display:flex;align-items:center;gap:10px;flex:none')}>
            <span style={S(`padding:5px 9px;border-radius:7px;background:${t.bg};font:500 11px/1 ${MONO};color:${t.color}`)}>{meta.label}</span>
            <Pressable
              label={`Allow ${title}`}
              disabled={busy === key || current === 'granted' || current === 'unsupported'}
              onClick={async () => {
                setBusy(key);
                const result = await request();
                setBusy('');
                if (result === 'granted') toast({ title: `${title} allowed`, tone: 'ok' });
                else if (result === 'denied')
                  toast({
                    title: `${title} is blocked`,
                    message: 'Your browser remembers this. Re-allow it from the padlock icon in the address bar.',
                    tone: 'warn',
                    timeout: 7000,
                  });
                else if (result === 'unsupported') toast({ title: 'Not supported in this browser', tone: 'warn' });
                else toast({ title: 'No answer given', message: 'Nothing changed, you can ask again any time.', tone: 'brand' });
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer')}
            >
              {busy === key ? <span className="vu-spin" /> : current === 'granted' ? 'Allowed' : 'Allow'}
            </Pressable>
          </div>
        </div>
        {blocked ? (
          <div style={S('margin-top:12px;padding:12px 14px;border-radius:11px;background:#FDF3E7;border:1px solid #F3E3CD;font:450 12px/1.5 Geist;color:#8A5A20')}>
            Your browser is blocking this. Open the padlock icon next to the address bar, set it back to “Ask”, then reload.
            {key === 'location' ? ' Until then, matches are ranked from your ZIP code instead.' : ' Until then, reminders show inside the app only.'}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Panel title="Device permissions" sub="Nothing is requested until you ask for it here, and the app works without any of them.">
      {row('location', 'Location', 'Ranks openings by real travel time instead of your ZIP code centre. We never store your coordinates.', perms.location, requestLocationPermission)}
      {row('notifications', 'Notifications', 'Shift reminders and application decisions while the tab is closed.', perms.notifications, requestNotificationPermission)}
    </Panel>
  );
}

/* ---- data ---------------------------------------------------------------- */

function DataSection({ state, router }) {
  const fileRef = useRef(null);

  return (
    <>
      <Panel title="Export" sub="Everything on this device, in formats a counselor or a scholarship reviewer can open.">
        <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <Pressable
            label="Download my verified hours as CSV"
            onClick={() => {
              download('volunteeru-hours.csv', transcriptCSV());
              toast({ title: 'Hours exported', tone: 'ok' });
            }}
            className={cx(H.secondary, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
          >
            Hours as CSV
          </Pressable>
          <Pressable
            label="Download a full backup"
            onClick={() => {
              download('volunteeru-backup.json', exportState(), 'application/json');
              toast({ title: 'Backup downloaded', message: 'Keep it somewhere safe, it restores everything.', tone: 'ok' });
            }}
            className={cx(H.secondary, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
          >
            Full backup (JSON)
          </Pressable>
        </div>
      </Panel>

      <Panel title="Restore" sub="Replaces everything currently on this device with the contents of a backup file.">
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="vu-sr"
          onChange={async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            e.target.value = '';
            const ok = await confirmDialog({
              title: 'Restore from this backup?',
              body: 'Everything currently on this device is replaced. Export a backup first if you are not sure.',
              confirmLabel: 'Restore',
            });
            if (!ok) return;
            try {
              const text = await file.text();
              importState(text);
              toast({ title: 'Backup restored', tone: 'ok' });
            } catch (err) {
              toast({ title: 'That file did not load', message: err.message, tone: 'danger' });
            }
          }}
        />
        <Pressable
          label="Choose a backup file"
          onClick={() => fileRef.current && fileRef.current.click()}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Choose backup file
        </Pressable>
      </Panel>

      <Panel title="Reset this device" sub="Clears the local copy of your workspace on this device and starts empty. Your cloud account and record are not deleted, sign in again to reload them.">
        <Pressable
          label="Reset this device"
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Reset this device?',
              body: 'The local copy of your workspace on this device is cleared and the app starts empty. Your account still exists, sign in to reload your record.',
              confirmLabel: 'Reset',
              requireText: 'RESET',
            });
            if (!ok) return;
            resetStore();
            toast({ title: 'Reset complete', tone: 'ok' });
            router.push('/');
          }}
          className={cx(H.danger, H.press)}
          style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 14px/1 Geist;color:#A8482A;cursor:pointer')}
        >
          Reset app data
        </Pressable>
      </Panel>
    </>
  );
}

/* ---- help / about --------------------------------------------------------- */

function HelpSection({ router }) {
  const items = [
    ['How hours get verified', 'Check-in and check-out are geofenced to the site, then the organizer confirms attendance. Hours post to your record the same day.'],
    ['If something feels unsafe', 'Leave, then tell the staff lead and file it from the project page. Every session has a named background-checked adult on site.'],
    ['A score you disagree with', 'Request a review from your profile within 14 days. It goes to the organizer who ran the session.'],
    ['Hours that never posted', 'Open the shift from your profile and use “Request a review”. Organizers have to rule on it, and the hour stays frozen until they do.'],
  ];
  return (
    <>
      <Panel title="Common questions">
        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          {items.map(([t, b]) => (
            <div key={t}>
              <div style={S('font:600 14px/1.35 Geist')}>{t}</div>
              <div style={S('margin-top:6px;font:450 13px/1.6 Geist;color:#6B635C')}>{b}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Safety">
        <div style={S('font:450 14px/1.6 Geist;color:#57504A')}>
          Every listed organization is checked for registration, insurance and a named staff contact. Age minimums, guardian consent and the two-adult rule
          are enforced before a listing is ever shown to you.
        </div>
        <Pressable
          label="Read the full safety policy"
          onClick={() => router.push('/safety')}
          className={cx(H.secondary, H.press)}
          style={S('margin-top:16px;display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Safety policy
        </Pressable>
      </Panel>
    </>
  );
}

function AboutSection() {
  return (
    <Panel title="About VolunteerU">
      <div style={S('font:450 14px/1.6 Geist;color:#57504A')}>
        VolunteerU matches students to real, age-eligible volunteering near them, and gives any student the workspace to run their own project under a
        verified sponsor. Free for students on both sides.
      </div>
      <div style={S('margin-top:18px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
        <div style={S('display:flex;justify-content:space-between;gap:12px')}>
          <span>Version</span>
          <span style={S('color:#1A1714;font-weight:500')}>1.0.0</span>
        </div>
        <div style={S('display:flex;justify-content:space-between;gap:12px')}>
          <span>Data</span>
          <span style={S('color:#1A1714;font-weight:500')}>Stored on this device only</span>
        </div>
        <div style={S('display:flex;justify-content:space-between;gap:12px')}>
          <span>Map tiles</span>
          <span style={S('color:#1A1714;font-weight:500')}>© OpenStreetMap contributors</span>
        </div>
      </div>
    </Panel>
  );
}
