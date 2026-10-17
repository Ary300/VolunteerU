'use client';

/* ==========================================================================
   Detail.jsx, design screen: `isDetail` (one opportunity)
   "Sign up" leads to the apply flow, the sidebar then reads "Signed up", and
   "Cancel sign-up" is offered only while the shift is still ahead.
   ========================================================================== */

import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState } from '../ui.jsx';
import { AddressMap } from '../MapPanel.jsx';
import { useSnapshot } from '../../lib/store.js';
import { openModal, toast, confirmDialog } from '../../lib/overlays.js';
import { getOpportunity, isSaved, toggleSaved, spotsLeft, applicationFor, withdrawApplication, copyText } from '../../lib/db.js';
import { googleCalUrl, isPastShift } from '../../lib/calendar.js';
import { formatShiftTime, VERIFIED_LABEL, VERIFIED_NOTE, SR_ONLY } from './JoinListing.jsx';

const MONO = "'Geist Mono',monospace";
const SIDE_BTN = 'margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;padding:0 18px;height:40px;border-radius:11px;background:#fff;font:600 14px/1 Geist;cursor:pointer;text-decoration:none;transition:background .16s ease, border-color .16s ease, transform .16s ease';

/** "1:00 to 4:00 PM" → "1–4 PM", "9:00 AM to 12:00 PM" → "9 AM–noon". One
    formatter for every screen, shared with the join page. */
export function shiftTime(t) {
  return formatShiftTime(t);
}

export function ArrowLeft() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h7v7M13 3L4 12" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

const NEW_TAB = <span style={S('position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap')}>(opens in a new tab)</span>;

/** The shift to show selected: the ?shift= one if it's ahead, else the first open upcoming one. */
function pickSelected(shifts, param) {
  const upcoming = shifts.filter((x) => !isPastShift(x));
  const fromParam = upcoming.find((x) => x.id === param);
  return fromParam || upcoming.find((x) => spotsLeft(x) > 0) || upcoming[0] || null;
}

function BackToDiscover({ router }) {
  return (
    <Pressable label="Back to Discover" onClick={() => router.push('/discover')} className={H.toInk} style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}>
      <ArrowLeft />
      Back to Discover
    </Pressable>
  );
}

export default function Detail({ id }) {
  const router = useRouter();
  const params = useSearchParams();
  useSnapshot(); // subscribe so saves / applications re-render

  const opp = getOpportunity(id);

  if (!opp) {
    return (
      <div className="vu-pad-40" style={S('padding:32px 40px 96px')}>
        <BackToDiscover router={router} />
        <EmptyState
          icon={<SearchIcon />}
          title="This link is out of date"
          body="Search for the opportunity by name to find its current page."
          cta="Search opportunities"
          onCta={() => router.push('/discover')}
        />
      </div>
    );
  }

  const selected = pickSelected(opp.shifts, params.get('shift'));
  const selectedId = selected ? selected.id : null;
  const saved = isSaved(opp.id);
  const app = applicationFor(opp.id);
  const signedUp = !!app && app.st !== 'Withdrawn' && app.st !== 'Declined';
  const myShift = signedUp ? opp.shifts.find((x) => x.id === app.shiftId) || null : null;
  const myShiftPast = myShift ? isPastShift(myShift) : false;
  const full = selected ? spotsLeft(selected) <= 0 : true;
  const upcomingCount = opp.shifts.filter((x) => !isPastShift(x)).length;
  const calShift = myShift || selected;
  const calUrl = calShift && !myShiftPast ? googleCalUrl(opp, calShift) : null;

  const pickShift = (sid) => router.replace(`/opportunity/${opp.id}?shift=${sid}`, { scroll: false });

  function directions() {
    openModal({
      title: 'Getting there',
      subtitle: opp.address,
      body: (
        <div>
          <div style={S('border-radius:12px;overflow:hidden;border:1px solid #E8E1D9')}>
            <AddressMap address={opp.address} />
          </div>
          <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:11px;font:450 14px/1.5 Geist;color:#332D28')}>
            {opp.travelMin ? (
              <div style={S('display:flex;justify-content:space-between;gap:12px')}>
                <span style={S('color:#57504A')}>Drive</span>
                <span style={S('font-weight:500')}>{opp.travelMin} min</span>
              </div>
            ) : null}
            {opp.transit ? (
              <div style={S('display:flex;justify-content:space-between;gap:12px')}>
                <span style={S('color:#57504A')}>Transit</span>
                <span style={S('font-weight:500;text-align:right')}>{opp.transit}</span>
              </div>
            ) : null}
          </div>
          <div style={S('margin-top:18px;display:flex;gap:10px;flex-wrap:wrap')}>
            <Pressable
              label="Copy address"
              onClick={async () => {
                const ok = await copyText(`${opp.org}, ${opp.address}`);
                toast(ok ? { title: 'Address copied', tone: 'ok' } : { title: "Couldn't copy", message: `${opp.org}, ${opp.address}`, tone: 'warn' });
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}
            >
              Copy address
            </Pressable>
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(opp.address)}`}
              target="_blank"
              rel="noreferrer noopener"
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;text-decoration:none')}
            >
              Open in maps
              <ExternalIcon />
              {NEW_TAB}
            </a>
          </div>
        </div>
      ),
    });
  }

  async function cancelSignUp() {
    if (!app || myShiftPast) return;
    const ok = await confirmDialog({
      title: 'Cancel your sign-up?',
      body: `${opp.org} will see you're not coming. You can sign up again if spots are left.`,
      confirmLabel: 'Cancel sign-up',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    withdrawApplication(app.id);
    toast({ title: 'Sign-up canceled', message: 'Your spot is open for someone else now.', tone: 'ok' });
  }

  const facts = [
    `${opp.hours} ${opp.hours === 1 ? 'hour' : 'hours'} per shift`,
    opp.cause,
  ].filter(Boolean).join(', ');

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <BackToDiscover router={router} />

      <div className="vu-split" style={S('display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:26px;margin-top:18px;align-items:start')}>
        <div style={S('min-width:0')}>
          <div style={S('border-radius:16px;overflow:hidden;border:1px solid #E8E1D9;height:300px')}>
            <ImageSlot src={opp.heroImg || opp.img} shape="rect" placeholder={opp.ph} alt={opp.ph} />
          </div>
          <div style={S('margin-top:22px;display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            {opp.verified ? <div title={VERIFIED_LABEL} style={S(`padding:5px 9px;border-radius:7px;background:#EAF3EC;font:500 12px/1 ${MONO};color:#3F6B4E`)}>Verified<span style={S(SR_ONLY)}>. {VERIFIED_NOTE}</span></div> : null}
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 ${MONO};color:#57504A`)}>Ages {opp.minAge}+</div>
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 ${MONO};color:#57504A`)}>{opp.groupShift ? 'Group shift' : 'Small team'}</div>
          </div>
          <h1 className="vu-break" style={S('margin:14px 0 0;font:600 34px/1.1 Geist;letter-spacing:-0.038em')}>{opp.title}</h1>
          <div style={S('margin-top:10px;font:450 15px/1.5 Geist;color:#6B635C')}>
            {opp.org}, {opp.address}
          </div>
          <p style={S('margin:22px 0 0;max-width:600px;font:400 16px/1.65 Geist;color:#332D28;text-wrap:pretty')}>{opp.description}</p>
          <div style={S('margin-top:14px;font:500 14px/1.5 Geist;color:#57504A')}>{facts}</div>

          <div style={S('margin-top:26px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;max-width:600px')}>
            <AddressMap address={opp.address} />
            <div style={S('padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
              <div style={S('min-width:0;font:450 13px/1.4 Geist;color:#6B635C')}>
                {[opp.travelMin ? `${opp.travelMin} min drive` : '', opp.transit || ''].filter(Boolean).join(', ')}
              </div>
              <Pressable label={`Directions to ${opp.address}`} onClick={directions} className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C;cursor:pointer;flex:none')}>
                Directions
              </Pressable>
            </div>
          </div>

          <h2 id="vu-shift-label" style={S('margin:28px 0 0;font:600 17px/1.25 Geist;letter-spacing:-0.02em')}>
            {upcomingCount === 0 ? 'No upcoming dates' : upcomingCount === 1 ? '1 date' : 'Pick a date'}
          </h2>
          <div role="radiogroup" aria-labelledby="vu-shift-label" style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px;max-width:600px')}>
            {opp.shifts.map((sh) => {
              const past = isPastShift(sh);
              const on = !past && sh.id === selectedId;
              const left = spotsLeft(sh);
              const status = past ? 'Past' : left === 0 ? 'Full' : `${left} of ${sh.cap} left`;
              return (
                <Pressable
                  key={sh.id}
                  role="radio"
                  aria-checked={on}
                  disabled={past}
                  tabIndex={on ? 0 : -1}
                  label={`${sh.d}, ${shiftTime(sh.tLong || sh.t)}, ${status}`}
                  onClick={() => !past && pickShift(sh.id)}
                  className={cx(on || past ? '' : H.chip, H.press)}
                  style={s(
                    'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:12px',
                    `border:1px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                    `background:${on ? '#FAF6F3' : past ? '#F6F2EE' : '#fff'}`,
                    `cursor:${past ? 'default' : 'pointer'};transition:border-color .16s ease, background .16s ease`
                  )}
                >
                  <div style={s('font:500 15px/1.2 Geist', past ? 'color:#8A8179' : on ? '' : 'color:#332D28')}>
                    {sh.d}, {shiftTime(sh.tLong || sh.t)}
                  </div>
                  <div style={s(`font:500 12px/1 ${MONO};flex:none`, `color:${past ? '#8A8179' : left === 0 || on ? '#A8482A' : '#8A8179'}`)}>{status}</div>
                </Pressable>
              );
            })}
          </div>
        </div>

        <div className="vu-sticky-side" style={S('display:flex;flex-direction:column;gap:14px;position:sticky;top:28px')}>
          <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            {signedUp ? (
              <>
                <h2 style={S('margin:0;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>{myShiftPast ? 'You signed up' : 'Signed up'}</h2>
                <div style={S('margin-top:6px;font:450 14px/1.45 Geist;color:#57504A')}>
                  {myShift ? `${myShift.d}, ${shiftTime(myShift.tLong || myShift.t)}` : 'Shift details are on your profile.'}
                  {app.role ? `, ${app.role}` : ''}
                </div>
                <div style={S('margin-top:14px;padding:14px;border-radius:11px;background:#EAF3EC;border:1px solid #DCEADF')}>
                  <div style={S('font:600 13px/1.3 Geist;color:#3F6B4E')}>
                    {app.st === 'Accepted' ? `${opp.org} confirmed your spot` : `Waiting on ${opp.org} to confirm`}
                  </div>
                  <div style={S('margin-top:5px;font:450 12px/1.45 Geist;color:#4E6B57')}>
                    {myShiftPast ? 'This shift already happened.' : app.st === 'Accepted' ? 'Check in with the staff lead when you arrive.' : `Sent ${String(app.when || '').toLowerCase()}. ${opp.replyTime || ''}`}
                  </div>
                </div>
                {calUrl ? (
                  <a
                    href={calUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cx(H.secondaryLift, H.press)}
                    style={S(`${SIDE_BTN};border:1px solid #E7C0AC;color:#C2603C`)}
                  >
                    Add to calendar
                    <ExternalIcon />
                    {NEW_TAB}
                  </a>
                ) : null}
                {!myShiftPast ? (
                  <Pressable
                    label="Cancel sign-up"
                    onClick={cancelSignUp}
                    className={cx(H.danger, H.press)}
                    style={S(`${SIDE_BTN};border:1px solid #EBD3C8;color:#A8482A`)}
                  >
                    Cancel sign-up
                  </Pressable>
                ) : null}
              </>
            ) : selected ? (
              <>
                <div style={S('font:500 13px/1 Geist;color:#8A8179')}>Your shift</div>
                <div style={S('margin-top:8px;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>
                  {selected.d}
                  <br />
                  {shiftTime(selected.tLong || selected.t)}
                </div>
                <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
                  <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                    <span>Length</span>
                    <span style={S('color:#1A1714;font-weight:500')}>{opp.hours} {opp.hours === 1 ? 'hour' : 'hours'}</span>
                  </div>
                  <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                    <span>Spots left</span>
                    <span style={S('color:#1A1714;font-weight:500')}>{spotsLeft(selected)} of {selected.cap}</span>
                  </div>
                </div>
                <Pressable
                  label={full ? 'This shift is full' : `Sign up for ${selected.d}`}
                  disabled={full}
                  onClick={() => router.push(`/apply/${opp.id}?shift=${selectedId}`)}
                  className={cx(full ? '' : H.primary, H.press)}
                  style={s(
                    'margin-top:18px;display:flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 18px;height:46px;border-radius:11px;font:600 15px/1 Geist;transition:background .16s ease',
                    full ? 'border:1px solid #E4DDD4;background:#F6F2EE;color:#8A8179;cursor:default' : 'border:1px solid #A8482A;background:#C2603C;color:#fff;cursor:pointer'
                  )}
                >
                  {full ? 'Shift is full' : 'Sign up'}
                </Pressable>
              </>
            ) : (
              <>
                <h2 style={S('margin:0;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>No upcoming dates</h2>
                <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C')}>Save it to check back, or find something open this week.</div>
                <Pressable
                  label="Find opportunities"
                  onClick={() => router.push('/discover')}
                  className={cx(H.primary, H.press)}
                  style={S('margin-top:16px;display:flex;align-items:center;justify-content:center;padding:0 18px;height:44px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer')}
                >
                  Find opportunities
                </Pressable>
              </>
            )}

            <Pressable
              label={saved ? 'Saved, remove from saved' : 'Save'}
              pressed={saved}
              onClick={() => {
                const now = toggleSaved(opp.id);
                toast(
                  now
                    ? { title: 'Saved', message: opp.title, tone: 'ok', actionLabel: 'Undo', onAction: () => toggleSaved(opp.id) }
                    : { title: 'Removed from saved', tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(opp.id) }
                );
              }}
              className={cx(H.secondaryLift, H.press)}
              style={s(
                SIDE_BTN,
                'margin-top:10px',
                `border:1px solid ${saved ? '#E4C9BB' : '#E4DDD4'}`,
                `background:${saved ? '#FAF6F3' : '#fff'}`,
                `color:${saved ? '#A8482A' : '#1A1714'}`
              )}
            >
              {saved ? 'Saved' : 'Save'}
            </Pressable>
            <div style={S('margin-top:14px;font:450 12px/1.5 Geist;color:#8A8179')}>
              {opp.org} confirms your hours after the shift.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
