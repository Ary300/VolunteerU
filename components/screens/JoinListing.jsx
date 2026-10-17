'use client';

/* ==========================================================================
   JoinListing.jsx, the public page a shared link opens
   Anyone can view it signed out. Applying goes through sign-in and lands back
   here. It reads the live Supabase listing (never local seed data), so the
   application it creates is the one the organizer sees on /lead.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot } from '../ui.jsx';
import { Logo } from '../Logo.jsx';
import { toast, confirmDialog } from '../../lib/overlays.js';
import { getListing, applyToListing, loadMyApplications, setApplicationStatus, myId, listingShifts, myShiftSignUps, signUpForShift, cancelShiftSignUp } from '../../lib/listings.js';
import { safeUrl } from '../MemberProjects.jsx';
import { isPastShift, parseTimeRange } from '../../lib/calendar.js';
import { isArchivedApplication } from '../VolunteerApplications.jsx';

const MONO = "'Geist Mono',monospace";
/* The "Verified" badge says one word on screen; the explanation is its hover
   title and screen-reader text. Shared with Detail and Apply. */
export const VERIFIED_NOTE = 'A VolunteerU reviewer checked this organization by hand.';
export const VERIFIED_LABEL = `Verified. ${VERIFIED_NOTE}`;
export const SR_ONLY = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
const KIND = { meeting: 'Meeting', form: 'Form', training: 'Training', check: 'Check' };
const NOTE_MAX = 400;

const PRIMARY_BTN = 'flex:none;padding:0 20px;height:46px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center';
const SECONDARY_BTN = 'flex:none;padding:0 18px;height:46px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;color:#1A1714;font:600 14px/1 Geist;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center';
const DANGER_BTN = 'flex:none;padding:0 18px;height:46px;border-radius:12px;border:1px solid #EBD3C8;background:#fff;color:#A8482A;font:600 14px/1 Geist;cursor:pointer';
const SMALL_PRIMARY = 'flex:none;padding:0 16px;height:38px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer';
const SMALL_DANGER = 'flex:none;padding:0 14px;height:38px;border-radius:10px;border:1px solid #EBD3C8;background:#fff;color:#A8482A;font:600 13px/1 Geist;cursor:pointer';
/* Application statuses that can hold shift sign-ups (lib/listings.js agrees). */
const SIGNUP_STATUSES = ['pending', 'accepted'];

/* One clock reading in the house style: "9 AM", "9:30 PM", "noon", "midnight". */
function clockPart(min) {
  if (min === 12 * 60) return { text: 'noon', mer: '' };
  if (min === 0 || min === 24 * 60) return { text: 'midnight', mer: '' };
  const h24 = Math.floor(min / 60) % 24;
  const mm = min % 60;
  const h = h24 % 12 || 12;
  return { text: mm ? `${h}:${String(mm).padStart(2, '0')}` : String(h), mer: h24 >= 12 ? 'PM' : 'AM' };
}

const END_RX = '(?:\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?|noon|midnight)';
const WHOLE_RANGE_RX = new RegExp(`^${END_RX}\\s*(?:to|\\u2013|-)\\s*${END_RX}$`, 'i');
const SINGLE_TIME_RX = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;

/**
 * Any shift time the app has stored, in the one format every screen shows:
 * "10:00 AM - 12:00 PM" → "10 AM–noon", "3:30-5:30 PM" → "3:30–5:30 PM",
 * "1:00-4:00 PM" → "1–4 PM", "12:00 PM" → "noon". Text that isn't a time
 * comes back as it was.
 */
export function formatShiftTime(t) {
  const raw = String(t || '').trim();
  const one = SINGLE_TIME_RX.exec(raw);
  if (one) {
    const h = Number(one[1]);
    const mm = Number(one[2] || 0);
    if (h < 1 || h > 12 || mm > 59) return raw;
    const pm = /pm/i.test(one[3]);
    const c = clockPart(((h % 12) + (pm ? 12 : 0)) * 60 + mm);
    return c.mer ? `${c.text} ${c.mer}` : c.text;
  }
  const range = WHOLE_RANGE_RX.test(raw) ? parseTimeRange(raw) : null;
  if (!range) return raw;
  const a = clockPart(range.start);
  const b = clockPart(range.end);
  const end = b.mer ? `${b.text} ${b.mer}` : b.text;
  if (a.mer && a.mer === b.mer) return `${a.text}–${end}`;
  return `${a.mer ? `${a.text} ${a.mer}` : a.text}–${end}`;
}

/* Splits a stored next-shift label into its date and time. The app has
   written "Sat, Oct 24 · 1:00-4:00 PM", "Sat, Oct 24 at 1:00-4:00 PM" and
   "Sat, Oct 24, 1:00-4:00 PM"; all three read the same. */
function splitShift(text) {
  const dot = /^(.+?)\s*·\s*(.+)$/.exec(text);
  if (dot) return [dot[1], dot[2]];
  const at = /^(.+?)\s+at\s+(.+)$/.exec(text);
  if (at) return [at[1], at[2]];
  const comma = /^([A-Za-z]{3},\s*[A-Za-z]{3}\s+\d{1,2}),\s*(.+)$/.exec(text);
  if (comma) return [comma[1], comma[2]];
  return [text, ''];
}

/** Reads a stored next shift ("Sat, Oct 24 · 1:00-4:00 PM") into the label
    every screen shows ("Sat, Oct 24 at 1–4 PM") and whether it already happened. */
export function nextShiftInfo(raw, now = new Date()) {
  const text = String(raw || '').trim();
  if (!text || /not scheduled/i.test(text)) return null;
  const [datePart, timePart] = splitShift(text);
  const label = timePart ? `${datePart} at ${formatShiftTime(timePart)}` : datePart;
  return { label, past: isPastShift({ d: datePart, t: timePart }, now) };
}

/** "Sat, Oct 24 at 1–4 PM" for one published shift. */
export function shiftLabel(sh) {
  if (!sh) return '';
  const t = formatShiftTime(sh.t);
  return t ? `${sh.d} at ${t}` : String(sh.d || '');
}

function friendlyError(e) {
  const msg = String((e && e.message) || '');
  if (/already applied/i.test(msg)) return 'You already applied to this one.';
  if (/sign in/i.test(msg)) return 'Sign in again, then apply.';
  return "Your application didn't send. Check your connection and try again.";
}

/* Listing ids are UUIDs. Anything else on /join is a typo or an old link. */
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* A retired /opportunity, /apply or /projects link (the old built-in
   catalogue) lands here with ?old=1. Public, so a signed-out visitor never
   meets a sign-in step just to learn the link is old. */
function OutdatedLink({ signedIn }) {
  const href = signedIn ? '/discover' : '/#search';
  return (
    <div style={S('padding:48px 32px;text-align:center;border-radius:18px;border:1px solid #E8E1D9;background:#fff')}>
      <h1 style={S('margin:0;font:600 22px/1.2 Geist;letter-spacing:-0.03em')}>This link is out of date</h1>
      <div style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#6B635C')}>Search for the opportunity by name to find its current page.</div>
      <Link href={href} className={H.press} style={S(`margin-top:18px;${PRIMARY_BTN};height:44px;font-size:14px`)}>Search opportunities</Link>
    </div>
  );
}

export default function JoinListing({ id, outdated = false }) {
  const router = useRouter();
  const stale = outdated && !UUID_RX.test(String(id || ''));
  const [listing, setListing] = useState(undefined); // undefined=loading, null=missing
  const [me, setMe] = useState(undefined);
  const [app, setApp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState('');
  const [note, setNote] = useState('');
  const [posError, setPosError] = useState('');
  const [shiftPick, setShiftPick] = useState('');
  const [shiftBusy, setShiftBusy] = useState(''); // id of the shift being saved
  // The member's application when the organizer archived this project: RLS
  // hides the listing from them, so the read above comes back empty.
  const [archivedApp, setArchivedApp] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [l, uid] = await Promise.all([getListing(id), myId()]);
      if (!alive) return;
      // A malformed id can't match any application's listing_id (a UUID).
      if (uid && !l && UUID_RX.test(String(id || ''))) {
        // A hidden listing may be a project this member was in that got
        // archived. Check before showing "This link isn't active".
        let gone = null;
        try {
          const mine = await loadMyApplications({ throwOnError: true });
          gone = mine.find((a) => a.listing_id === id && isArchivedApplication(a)) || null;
        } catch (err) {
          console.error('[join] could not load your applications', err);
        }
        if (!alive) return;
        setArchivedApp(gone);
      }
      setListing(l);
      setMe(uid || null);
      if (uid && l) {
        try {
          const mine = await loadMyApplications({ throwOnError: true });
          const found = mine.find((a) => a.listing_id === l.id);
          if (alive && found) setApp(found);
        } catch (err) {
          console.error('[join] could not load your applications', err);
        }
      }
    })();
    return () => { alive = false; };
  }, [id]);

  /** Re-reads this listing's application. Returns the row it found, or null. */
  async function refreshApp(fallback) {
    try {
      const mine = await loadMyApplications({ throwOnError: true });
      const found = mine.find((a) => a.listing_id === listing.id) || null;
      setApp(found || fallback);
      return found;
    } catch (err) {
      console.error('[join] could not reload your application', err);
      setApp(fallback);
      return null;
    }
  }

  async function apply() {
    if (busy || !listing) return;
    if (!me) { router.push(`/signin?next=${encodeURIComponent(`/join/${id}`)}`); return; }
    const positions = listing.positions || [];
    if (positions.length > 1 && !position) {
      setPosError('Choose a role.');
      return;
    }
    setPosError('');
    const chosen = position || (positions.length === 1 ? positions[0].t : '');
    const pick = shiftPick ? listingShifts(listing).find((x) => x.id === shiftPick) : null;
    setBusy(true);
    try {
      await applyToListing(listing, { position: chosen || undefined, note: note.trim() });
      const found = await refreshApp({ id: null, status: 'pending', position: chosen });
      if (pick) {
        const res = found && found.id ? await signUpForShift(found.id, pick.id) : null;
        if (res && res.ok) {
          setApp({ ...found, member_state: res.member_state });
          setShiftPick('');
          toast({ title: 'Applied and signed up', message: `${listing.name} has your application. You're signed up for ${shiftLabel(pick)}.`, tone: 'ok' });
        } else {
          if (res) console.error('[join] shift sign-up after applying failed', res.error);
          toast({ title: 'Applied, shift not saved', message: 'Sign up for the shift below.', tone: 'warn' });
        }
      } else {
        toast({ title: 'Applied', message: `${listing.name} will see your application.`, tone: 'ok' });
      }
    } catch (e) {
      if (e && e.code === 'DUPLICATE') {
        // Applied from another tab or device. Show where that application
        // stands instead of leaving the form up.
        const found = await refreshApp(null);
        if (found) {
          toast({
            title: 'Already applied',
            message: found.status === 'withdrawn' ? 'You withdrew it earlier. Apply again to reopen it.' : `You applied to ${listing.name} earlier.`,
            tone: 'ok',
          });
        }
        else toast({ title: "Couldn't apply", message: friendlyError(e), tone: 'danger' });
      } else {
        console.error('[join] apply failed', e);
        toast({ title: "Couldn't apply", message: friendlyError(e), tone: 'danger' });
      }
    }
    setBusy(false);
  }

  async function withdraw() {
    if (busy || !app || !app.id) return;
    const ok = await confirmDialog({
      title: 'Withdraw your application?',
      body: `${listing.name} will see you withdrew. You can apply again later.`,
      confirmLabel: 'Withdraw application',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    const { ok: saved, error } = await setApplicationStatus(app.id, 'withdrawn');
    if (saved) {
      await refreshApp({ ...app, status: 'withdrawn' });
      toast({ title: 'Application withdrawn', tone: 'ok' });
    } else {
      console.error('[join] withdraw failed', error);
      toast({ title: "Couldn't withdraw", message: 'Check your connection and try again.', tone: 'danger' });
    }
    setBusy(false);
  }

  /* A refused shift (canceled, moved or already over) means this page shows
     an old list, so read the listing again. */
  async function reloadListing() {
    try {
      const l = await getListing(id);
      if (l) setListing(l);
    } catch (err) {
      console.error('[join] could not reload the listing', err);
    }
  }

  async function signUpShift(sh) {
    if (shiftBusy || !app || !app.id) return;
    setShiftBusy(sh.id);
    const res = await signUpForShift(app.id, sh.id);
    if (res.ok) {
      setApp((prev) => ({ ...prev, member_state: res.member_state }));
      toast({ title: 'Signed up', message: `${shiftLabel(sh)}, ${listing.name}.`, tone: 'ok' });
    } else {
      console.error('[join] shift sign-up failed', res.error);
      toast({ title: "Couldn't sign up", message: res.error.message, tone: 'danger' });
      if (['GONE', 'PAST'].includes(res.error.code)) await reloadListing();
      if (res.error.code === 'CLOSED') await refreshApp(app);
    }
    setShiftBusy('');
  }

  async function cancelShift(sh) {
    if (shiftBusy || !app || !app.id) return;
    const ok = await confirmDialog({
      title: 'Cancel your sign-up?',
      body: `${listing.name} will see you're not coming on ${shiftLabel(sh)}. You can sign up again before it starts.`,
      confirmLabel: 'Cancel sign-up',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    setShiftBusy(sh.id);
    const res = await cancelShiftSignUp(app.id, sh.id);
    if (res.ok) {
      setApp((prev) => ({ ...prev, member_state: res.member_state }));
      toast({ title: 'Sign-up canceled', message: `${shiftLabel(sh)}.`, tone: 'ok' });
    } else {
      console.error('[join] cancel shift sign-up failed', res.error);
      toast({ title: "Couldn't cancel", message: res.error.message, tone: 'danger' });
    }
    setShiftBusy('');
  }

  async function applyAgain() {
    if (busy || !app || !app.id) return;
    setBusy(true);
    const { ok: saved, error } = await setApplicationStatus(app.id, 'pending');
    if (saved) {
      await refreshApp({ ...app, status: 'pending' });
      toast({ title: 'Applied', message: `${listing.name} will see your application.`, tone: 'ok' });
    } else {
      console.error('[join] re-apply failed', error);
      toast({ title: "Couldn't apply", message: 'Check your connection and try again.', tone: 'danger' });
    }
    setBusy(false);
  }

  if (listing === undefined) {
    return <Shell><div role="status" style={S('padding:60px 0;text-align:center;font:450 15px/1.5 Geist;color:#8A8179')}>Loading</div></Shell>;
  }
  if (stale) {
    return <Shell><OutdatedLink signedIn={!!me} /></Shell>;
  }
  if (listing === null && archivedApp) {
    return <Shell><ArchivedProject app={archivedApp} /></Shell>;
  }
  if (listing === null || listing.status !== 'live') {
    return (
      <Shell>
        <div style={S('padding:48px 32px;text-align:center;border-radius:18px;border:1px solid #E8E1D9;background:#fff')}>
          <h1 style={S('margin:0;font:600 22px/1.2 Geist;letter-spacing:-0.03em')}>This link isn't active</h1>
          <div style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#6B635C')}>The organizer may have paused it, or the link has a typo.</div>
          <Link href="/discover" className={H.press} style={S(`margin-top:18px;${PRIMARY_BTN};height:44px;font-size:14px`)}>Browse opportunities</Link>
        </div>
      </Shell>
    );
  }

  const isTeam = listing.org_type === 'team';
  const isOwner = !!me && me === listing.owner_id;
  const roles = listing.task_roles || [];
  const positions = listing.positions || [];
  const pipeline = (listing.pipeline || []).filter((x) => x && x.label);
  const needsConsent = pipeline.some((x) => /consent/i.test(x.label));
  const shift = isTeam ? null : nextShiftInfo(listing.next_session);
  const shifts = isTeam ? [] : listingShifts(listing);
  const canPickShifts = !isOwner && !!app && !!app.id && SIGNUP_STATUSES.includes(app.status);
  const mySignUps = canPickShifts ? myShiftSignUps(app).filter((x) => !x.past) : [];
  const signedUpIds = new Set(mySignUps.map((x) => x.id));
  // Upcoming sign-ups for a shift the organizer has since taken off the list.
  const orphanSignUps = mySignUps.filter((x) => !shifts.some((sh) => sh.id === x.id));
  // Signed in without an application: shifts are picked in the apply form.
  const pickInForm = !!me && !isOwner && !app && shifts.length > 0;
  const facts = [
    listing.events_hosted ? `${listing.events_hosted} ${listing.events_hosted === 1 ? 'event' : 'events'} hosted` : '',
    listing.approx_volunteers ? `about ${listing.approx_volunteers} volunteers so far` : '',
  ].filter(Boolean).join(', ');

  return (
    <Shell>
      <div style={S('border-radius:18px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div style={S('height:180px;position:relative')}>
          <ImageSlot src={listing.cover} shape="rounded" radius={0} placeholder="cover" alt="" />
        </div>
        <div className="vu-join-body" style={S('padding:24px 28px 28px')}>
          <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            {/* Who runs it, the same way the Lead header says it. */}
            {listing.org_class === 'official' ? (
              <Tag bg="#EAF3EC" color="#3F6B4E">Organization</Tag>
            ) : (
              <Tag bg="#FDF3E7" color="#8A5A20">Student project</Tag>
            )}
            {listing.verified ? (
              <Tag bg="#EAF3EC" color="#3F6B4E" title={VERIFIED_LABEL}>
                <CheckIcon />
                Verified
                <span style={S(SR_ONLY)}>. {VERIFIED_NOTE}</span>
              </Tag>
            ) : null}
            {isTeam ? <Tag bg="#F1EBE4" color="#57504A">Task team</Tag> : null}
            {listing.cause ? <Tag bg="#F1EBE4" color="#57504A">{listing.cause}</Tag> : null}
          </div>
          <h1 className="vu-break" style={S('margin:14px 0 0;font:600 30px/1.1 Geist;letter-spacing:-0.04em')}>{listing.name}</h1>
          {listing.site ? <div className="vu-break" style={S('margin-top:8px;font:450 14px/1.4 Geist;color:#8A8179')}>{listing.site}</div> : null}
          {listing.mission ? <div className="vu-break" style={S('margin-top:16px;font:400 16px/1.6 Geist;color:#332D28;max-width:640px')}>{listing.mission}</div> : null}
          {listing.bio ? <div className="vu-break" style={S('margin-top:12px;font:450 14px/1.6 Geist;color:#57504A;max-width:640px')}>{listing.bio}</div> : null}

          {(!isTeam && !shifts.length) || facts ? (
            <div style={S('margin-top:18px;display:flex;flex-direction:column;gap:6px;font:450 14px/1.5 Geist;color:#57504A')}>
              {!isTeam && !shifts.length ? (
                <div>
                  <span style={S('color:#1A1714;font-weight:600')}>Next shift </span>
                  {shift && !shift.past ? shift.label : 'No upcoming shift posted yet'}
                </div>
              ) : null}
              {facts ? <div style={S('color:#8A8179')}>{facts.charAt(0).toUpperCase() + facts.slice(1)}</div> : null}
            </div>
          ) : null}

          {/* apply / status */}
          <div id="vu-join-apply" aria-live="polite" style={S('margin-top:22px;padding:18px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3')}>
            {isOwner ? (
              <StatusRow
                title="You run this project"
                body="Volunteers apply from this page. Their applications show up in Lead."
              >
                <Link href="/lead" className={cx(H.secondary, H.press)} style={S(SECONDARY_BTN)}>Open Lead</Link>
              </StatusRow>
            ) : app ? (
              <AppStatus app={app} listing={listing} busy={busy} hasShifts={shifts.length > 0} onWithdraw={withdraw} onApplyAgain={applyAgain} />
            ) : (
              <div>
                <h2 style={S('margin:0;font:600 16px/1.3 Geist;color:#1A1714')}>Applications are open</h2>
                <div style={S('margin-top:4px;font:450 13px/1.5 Geist;color:#6B635C')}>
                  {me ? 'The organizer reads each one and replies in the app.' : "Sign in or create a free account to apply. You'll come back here after."}
                </div>
                {needsConsent ? (
                  <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#6B635C')}>
                    If you're under 16, you'll need a parent's OK on the consent form before your first shift.
                  </div>
                ) : null}

                {me && positions.length > 1 ? (
                  <fieldset style={S('margin:16px 0 0;padding:0;border:0;min-width:0')}>
                    <legend style={S('padding:0;font:600 13px/1.3 Geist;color:#332D28')}>Which role?</legend>
                    <div style={S('margin-top:8px;display:flex;flex-wrap:wrap;gap:8px')}>
                      {positions.map((pos) => {
                        const on = position === pos.t;
                        return (
                          <button
                            key={pos.id || pos.t}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => { setPosition(pos.t); setPosError(''); }}
                            className={cx('vu-break', on ? '' : H.chip, H.press)}
                            style={s(
                              'padding:9px 13px;border-radius:10px;text-align:left;cursor:pointer;font:500 13px/1.25 Geist;max-width:100%',
                              `border:1px solid ${on ? '#C2603C' : '#E4DDD4'}`,
                              `background:${on ? '#fff' : '#FCFAF8'}`,
                              `color:${on ? '#A8482A' : '#332D28'}`
                            )}
                          >
                            {pos.t}
                            {pos.m ? <span style={S('display:block;margin-top:3px;font:450 11.5px/1.3 Geist;color:#8A8179')}>{String(pos.m).replace(/\s*·\s*/g, ', ')}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                    {posError ? <div className="vu-err" role="alert">{posError}</div> : null}
                  </fieldset>
                ) : null}

                {pickInForm ? (
                  <div style={S('margin-top:16px')}>
                    <div id="vu-join-shift-label" style={S('font:600 13px/1.3 Geist;color:#332D28')}>{shifts.length === 1 ? 'Shift' : 'Which shift?'} <span style={S('font-weight:450;color:#8A8179')}>(optional)</span></div>
                    <div role="radiogroup" aria-labelledby="vu-join-shift-label" style={S('margin-top:8px;display:flex;flex-wrap:wrap;gap:8px')}>
                      {shifts.map((sh) => {
                        const on = shiftPick === sh.id;
                        return (
                          <button
                            key={sh.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setShiftPick(on ? '' : sh.id)}
                            className={cx(on ? '' : H.chip, H.press)}
                            style={s(
                              'padding:9px 13px;border-radius:10px;text-align:left;cursor:pointer;font:500 13px/1.25 Geist;max-width:100%',
                              `border:1px solid ${on ? '#C2603C' : '#E4DDD4'}`,
                              `background:${on ? '#fff' : '#FCFAF8'}`,
                              `color:${on ? '#A8482A' : '#332D28'}`
                            )}
                          >
                            {shiftLabel(sh)}
                          </button>
                        );
                      })}
                    </div>
                    <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>You can change shifts after you apply.</div>
                  </div>
                ) : null}

                {me ? (
                  <label style={S('display:block;margin-top:16px')}>
                    <span style={S('font:600 13px/1.3 Geist;color:#332D28')}>Note to the organizer (optional)</span>
                    <textarea
                      value={note}
                      maxLength={NOTE_MAX}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Free most Saturday afternoons"
                      rows={3}
                      style={S('display:block;box-sizing:border-box;margin-top:8px;width:100%;padding:11px 12px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:450 14px/1.5 Geist;color:#1A1714;resize:vertical')}
                    />
                    <span style={S(`display:block;margin-top:4px;text-align:right;font:450 11px/1 ${MONO};color:#A9A097`)}>{note.length}/{NOTE_MAX}</span>
                  </label>
                ) : null}

                <div style={S('margin-top:14px;display:flex;gap:10px;flex-wrap:wrap')}>
                  <button type="button" onClick={apply} disabled={busy} data-busy={busy ? 'true' : undefined} className={cx(H.primary, H.press)} style={S(PRIMARY_BTN)}>
                    {busy ? 'Applying' : me ? 'Apply to join' : 'Sign in to apply'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* the listing's upcoming shifts; applicants sign up for each one here */}
          {!isTeam && !pickInForm && (shifts.length || orphanSignUps.length) ? (
            canPickShifts ? (
            <Section title="Shifts">
              {shifts.map((sh) => (
                <ShiftRow
                  key={sh.id}
                  shift={sh}
                  site={listing.site}
                  canPick={canPickShifts}
                  signedUp={signedUpIds.has(sh.id)}
                  busy={shiftBusy === sh.id}
                  disabled={!!shiftBusy}
                  onSignUp={() => signUpShift(sh)}
                  onCancel={() => cancelShift(sh)}
                />
              ))}
              {orphanSignUps.map((sh) => (
                <ShiftRow
                  key={sh.id}
                  shift={sh}
                  site={listing.site}
                  canPick
                  signedUp
                  removed
                  busy={shiftBusy === sh.id}
                  disabled={!!shiftBusy}
                  onCancel={() => cancelShift(sh)}
                />
              ))}
            </Section>
            ) : (
              <Section title="Shifts" divided>
                {shifts.map((sh) => <PlainShift key={sh.id} shift={sh} site={listing.site} />)}
              </Section>
            )
          ) : null}

          {/* roles (team) or positions (volunteering) */}
          {isTeam && roles.length ? (
            <Section title="Roles on this team">
              {roles.map((r) => (
                <div key={r.id} style={S('padding:14px 16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <div style={S('display:flex;align-items:center;gap:8px')}>
                    <span aria-hidden="true" style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${r.color || '#C2603C'}`)} />
                    <div className="vu-break" style={S('min-width:0;font:600 14px/1.2 Geist')}>{r.name}</div>
                  </div>
                  {r.briefing ? <div className="vu-break" style={S('margin-top:6px;font:450 12.5px/1.5 Geist;color:#57504A')}>{r.briefing}</div> : null}
                </div>
              ))}
            </Section>
          ) : null}
          {!isTeam && positions.length ? (
            <Section title="Roles they need">
              {positions.map((pos) => (
                <div key={pos.id || pos.t} style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <div className="vu-break" style={S('font:600 14px/1.2 Geist')}>{pos.t}</div>
                  {pos.m ? <div className="vu-break" style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{String(pos.m).replace(/\s*·\s*/g, ', ')}</div> : null}
                </div>
              ))}
            </Section>
          ) : null}

          {/* steps before the first shift (volunteering) */}
          {!isTeam && pipeline.length ? (
            <Section title="Before your first shift">
              {pipeline.map((step, i) => (
                <div key={step.id || i} style={S('display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <span aria-hidden="true" style={S(`width:22px;height:22px;border-radius:7px;flex:none;display:grid;place-items:center;background:#F1EBE4;font:600 10px/1 ${MONO};color:#8A8179`)}>{i + 1}</span>
                  <div style={S('min-width:0;flex:1')}>
                    <div className="vu-break" style={S('font:500 13px/1.3 Geist;color:#332D28')}>{step.label}</div>
                    {step.note ? <div className="vu-break" style={S('margin-top:2px;font:450 12px/1.4 Geist;color:#8A8179')}>{step.note}</div> : null}
                  </div>
                  <span style={S(`flex:none;font:500 10px/1 ${MONO};color:#A9A097`)}>{KIND[step.kind] || 'Step'}</span>
                </div>
              ))}
            </Section>
          ) : null}

          {(listing.announcements || []).length ? <OrganizerNotes items={listing.announcements} /> : null}

          {safeUrl(listing.website) ? (
            <div style={S('margin-top:22px')}>
              <a href={safeUrl(listing.website)} target="_blank" rel="noreferrer noopener" className={H.link} style={S('display:inline-flex;align-items:center;gap:6px;font:500 14px/1 Geist;color:#C2603C;text-decoration:none')}>
                Visit their website
                <ExternalIcon />
                <span style={S('position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap')}>(opens in a new tab)</span>
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function AppStatus({ app, listing, busy, hasShifts, onWithdraw, onApplyAgain }) {
  const role = app.position ? ` as ${app.position}` : '';
  if (app.status === 'accepted') {
    return (
      <StatusRow title="Accepted" body={`You're on ${listing.name}${role}. ${hasShifts ? 'Sign up for shifts below.' : 'Your role and next steps are on Home.'}`}>
        <Link href="/app" className={cx(H.secondary, H.press)} style={S(SECONDARY_BTN)}>Go to Home</Link>
        <button type="button" onClick={onWithdraw} disabled={busy} className={cx(H.danger, H.press)} style={S(DANGER_BTN)}>Withdraw application</button>
      </StatusRow>
    );
  }
  if (app.status === 'declined') {
    return (
      <StatusRow title="Not accepted" body={`${listing.name} passed on your application. Other opportunities are open on Discover.`}>
        <Link href="/discover" className={cx(H.secondary, H.press)} style={S(SECONDARY_BTN)}>Find opportunities</Link>
      </StatusRow>
    );
  }
  if (app.status === 'withdrawn') {
    return (
      <StatusRow title="Withdrawn" body="You withdrew this application. You can apply again.">
        <button type="button" onClick={onApplyAgain} disabled={busy} data-busy={busy ? 'true' : undefined} className={cx(H.primary, H.press)} style={S(PRIMARY_BTN)}>
          {busy ? 'Applying' : 'Apply again'}
        </button>
      </StatusRow>
    );
  }
  return (
    <StatusRow title="Applied" body={`You applied${role}. Waiting to hear back, and their reply shows up on Home.${hasShifts && app.id ? ' You can sign up for shifts now.' : ''}`}>
      <Link href="/app" className={cx(H.secondary, H.press)} style={S(SECONDARY_BTN)}>Go to Home</Link>
      {app.id ? <button type="button" onClick={onWithdraw} disabled={busy} className={cx(H.danger, H.press)} style={S(DANGER_BTN)}>Withdraw application</button> : null}
    </StatusRow>
  );
}

/* One published shift. An applicant signs up or cancels from the row; anyone
   else just sees the date. A past shift is never listed (listingShifts). */
function ShiftRow({ shift, site, canPick, signedUp, removed, busy, disabled, onSignUp, onCancel }) {
  const label = shiftLabel(shift);
  const where = shift.loc && shift.loc !== site ? shift.loc : '';
  return (
    <div style={s('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:11px', `border:1px solid ${signedUp ? '#DCEADF' : '#F1EBE4'}`, `background:${signedUp ? '#F4F9F5' : '#FCFAF8'}`)}>
      <div style={S('min-width:0;flex:1 1 200px')}>
        <div className="vu-break" style={S('font:600 14px/1.3 Geist;color:#1A1714')}>{label}</div>
        {where ? <div className="vu-break" style={S('margin-top:3px;font:450 12px/1.4 Geist;color:#8A8179')}>{where}</div> : null}
        {removed ? <div style={S('margin-top:3px;font:450 12px/1.4 Geist;color:#A8482A')}>The organizer took this shift off the list.</div> : null}
      </div>
      {canPick ? (
        <div style={S('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
          {signedUp ? (
            <>
              <span style={S('display:inline-flex;align-items:center;gap:5px;font:600 13px/1 Geist;color:#3F6B4E')}>
                <CheckIcon />
                Signed up
              </span>
              <button type="button" onClick={onCancel} disabled={disabled} aria-label={`Cancel sign-up for ${label}`} data-busy={busy ? 'true' : undefined} className={cx(H.danger, H.press)} style={S(SMALL_DANGER)}>
                {busy ? 'Canceling' : 'Cancel sign-up'}
              </button>
            </>
          ) : (
            <button type="button" onClick={onSignUp} disabled={disabled} aria-label={`Sign up for ${label}`} data-busy={busy ? 'true' : undefined} className={cx(H.primary, H.press)} style={S(SMALL_PRIMARY)}>
              {busy ? 'Signing up' : 'Sign up'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* A shift for someone who can't sign up from here (signed out, or not an
   applicant): a plain line under a divider, so it doesn't read as an input. */
function PlainShift({ shift, site }) {
  const where = shift.loc && shift.loc !== site ? shift.loc : '';
  return (
    <div style={S('padding:11px 0;border-bottom:1px solid #F1EBE4')}>
      <div className="vu-break" style={S('font:500 14px/1.35 Geist;color:#1A1714')}>{shiftLabel(shift)}</div>
      {where ? <div className="vu-break" style={S('margin-top:2px;font:450 12px/1.4 Geist;color:#8A8179')}>{where}</div> : null}
    </div>
  );
}

/** "Sat, Oct 17" for an organizer post ("Sat, Oct 17, 2025" in another year), '' if unreadable. */
function postedOn(at) {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/* The organizer's posts (listings.announcements, newest first), read-only:
   a heading and the messages, split by dividers. */
function OrganizerNotes({ items }) {
  return (
    <Section title="From the organizer" divided>
      {items.map((an) => (
        <div key={an.id} style={S('padding:12px 0;border-bottom:1px solid #F1EBE4')}>
          <div className="vu-break" style={S('font:450 14px/1.6 Geist;color:#332D28;white-space:pre-wrap')}>{an.body}</div>
          {postedOn(an.at) ? <div style={S(`margin-top:6px;font:500 11px/1 ${MONO};color:#8A8179`)}>{postedOn(an.at)}</div> : null}
        </div>
      ))}
    </Section>
  );
}

function StatusRow({ title, body, children }) {
  return (
    <div style={S('display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap')}>
      <div style={S('min-width:0;flex:1 1 260px')}>
        <h2 className="vu-break" style={S('margin:0;font:600 16px/1.3 Geist;color:#1A1714')}>{title}</h2>
        <div className="vu-break" style={S('margin-top:4px;font:450 13px/1.5 Geist;color:#6B635C')}>{body}</div>
      </div>
      <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>{children}</div>
    </div>
  );
}

function Tag({ bg, color, title, children }) {
  return (
    <span title={title} style={s('display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:6px', `background:${bg}`, `font:500 10px/1 ${MONO}`, `color:${color}`)}>
      {children}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h7v7M13 3L4 12" />
    </svg>
  );
}

/** "Oct 16" for an archive stamp ("Oct 16, 2025" in another year), '' if unreadable. */
function archivedOn(closedAt) {
  const d = new Date(closedAt);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

function hrsText(n) {
  const h = Math.round(Number(n || 0) * 10) / 10;
  return `${h} ${h === 1 ? 'hr' : 'hrs'}`;
}

/* What a member sees on the link of a project the organizer archived: its
   name from the copy saved on their application, when it closed, and the
   hours they logged there (confirmed ones counted from the organizer's
   assignment.confirmedHours). */
function ArchivedProject({ app }) {
  const name = (app.listings && app.listings.name) || 'This project';
  const on = archivedOn(app.assignment.closedAt);
  const log = (app.member_state && app.member_state.hoursLog) || [];
  const confirmed = (app.assignment && app.assignment.confirmedHours) || {};
  const logged = log.reduce((a, h) => a + (Number(h.hrs) || 0), 0);
  const ok = log.filter((h) => confirmed[h.id]).reduce((a, h) => a + (Number(h.hrs) || 0), 0);
  let hoursLine = "You didn't log hours there.";
  if (logged > 0) {
    if (ok <= 0) hoursLine = `You logged ${hrsText(logged)} there. They stay on your profile.`;
    else if (ok >= logged) hoursLine = `You logged ${hrsText(logged)} there, all confirmed by the organizer. They stay on your profile.`;
    else hoursLine = `You logged ${hrsText(logged)} there and the organizer confirmed ${hrsText(ok)}. They stay on your profile.`;
  }
  return (
    <div style={S('padding:48px 32px;text-align:center;border-radius:18px;border:1px solid #E8E1D9;background:#fff')}>
      <h1 className="vu-break" style={S('margin:0;font:600 22px/1.2 Geist;letter-spacing:-0.03em')}>{name} was archived</h1>
      <div style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#6B635C')}>
        {on ? `The organizer archived it on ${on}, so this link is closed.` : 'The organizer archived it, so this link is closed.'} {hoursLine}
      </div>
      <Link href="/crew" className={H.press} style={S(`margin-top:18px;${PRIMARY_BTN};height:44px;font-size:14px`)}>See your projects</Link>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="vu-join-shell" style={S('min-height:100vh;padding:32px 24px 80px')}>
      <div style={S('max-width:720px;margin:0 auto')}>
        <Link href="/" aria-label="VolunteerU home" style={S('display:inline-flex;align-items:center;gap:9px;text-decoration:none;margin-bottom:22px')}>
          <Logo size={30} />
          <span style={S('font:600 17px/1 Geist;letter-spacing:-0.02em;color:#1A1714')}>VolunteerU</span>
        </Link>
        <main>{children}</main>
      </div>
    </div>
  );
}

function Section({ title, divided = false, children }) {
  return (
    <section style={S('margin-top:26px')}>
      <h2 style={S('margin:0;font:600 15px/1.3 Geist;letter-spacing:-0.01em;color:#1A1714')}>{title}</h2>
      <div style={S(divided ? 'margin-top:4px;display:flex;flex-direction:column' : 'margin-top:10px;display:flex;flex-direction:column;gap:10px')}>{children}</div>
    </section>
  );
}
