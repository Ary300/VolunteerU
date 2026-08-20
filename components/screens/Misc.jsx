'use client';

/* ==========================================================================
   Misc.jsx — notification centre, shortlist, friends going, peer project page
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState } from '../ui.jsx';
import { useSnapshot } from '../../lib/store.js';
import { confirmDialog, toast } from '../../lib/overlays.js';
import {
  markNotificationRead, markAllNotificationsRead, clearNotifications, unreadNotifications, markNotificationsSeen, getNotificationsSeenAt,
  getOpportunity, isSaved, toggleSaved, spotsLeft, spotsLabel, claimSpot,
} from '../../lib/db.js';
import { loadMyNotifications } from '../../lib/listings.js';

const MONO = "'Geist Mono',monospace";

const TONE_DOT = { ok: '#3F6B4E', warn: '#8A5A20', danger: '#A8482A', brand: '#C2603C', accepted: '#3F6B4E', declined: '#A8482A', rating: '#C2603C', announcement: '#5B6BB0' };

function notifWhen(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---- notification centre -------------------------------------------------- */

export function Notifications() {
  const router = useRouter();
  const [notifs, setNotifs] = useState(null);
  // Snapshot the prior "seen" time on mount so items that arrived since then
  // keep their fresh highlight, even though we mark everything seen below.
  const [seenAt, setSeenAt] = useState(0);

  useEffect(() => {
    let alive = true;
    setSeenAt(getNotificationsSeenAt());
    loadMyNotifications().then((n) => { if (alive) setNotifs(n); }).catch(() => { if (alive) setNotifs([]); });
    // Opening the page marks everything seen (clears the unread badge).
    markNotificationsSeen();
    return () => { alive = false; };
  }, []);

  const list = notifs || [];

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Notifications</h1>
          <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>
            Application decisions, ratings from organizers, and updates from the organizations you've joined.
          </p>
        </div>
      </div>

      <div style={S('margin-top:26px;border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        {notifs === null ? (
          <div style={S('padding:26px 20px;font:450 14px/1.5 Geist;color:#8A8179')}>Loading…</div>
        ) : list.length ? (
          list.map((n) => {
            const fresh = n.at && new Date(n.at).getTime() > seenAt;
            return (
              <Pressable
                key={n.id}
                label={n.title}
                onClick={() => { if (n.href) router.push(n.href); }}
                className={cx(H.row, H.press)}
                style={s('display:flex;gap:13px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid #F1EBE4;cursor:pointer;transition:background .16s ease', fresh ? 'background:#FCFAF8' : '')}
              >
                <span aria-hidden="true" style={s('width:8px;height:8px;border-radius:50%;flex:none;margin-top:6px', `background:${TONE_DOT[n.type] || '#C2603C'}`)} />
                <div style={S('flex:1;min-width:0')}>
                  <div style={S('font:600 14px/1.35 Geist;color:#1A1714')}>{n.title}</div>
                  {n.body ? <div style={S('margin-top:5px;font:450 13px/1.5 Geist;color:#8A8179')}>{n.body}</div> : null}
                </div>
                <div style={S(`font:500 10px/1 ${MONO};color:#A9A097;flex:none;margin-top:4px`)}>{notifWhen(n.at)}</div>
              </Pressable>
            );
          })
        ) : (
          <EmptyState
            icon="☰"
            title="Nothing yet"
            body="When an organization accepts your application, rates you, or posts an update, it shows up here."
            cta="Find openings"
            onCta={() => router.push('/discover')}
          />
        )}
      </div>
    </div>
  );
}

/* ---- shortlist and friends ------------------------------------------------ */

function OpportunityRow({ opp, router, trailing }) {
  const openShift = opp.shifts.find((x) => spotsLeft(x) > 0);
  return (
    <div className={cx('vu-media-row', H.card)} style={S('display:grid;grid-template-columns:180px 1fr;border-radius:14px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;transition:border-color .16s ease')}>
      <Pressable className={cx('vu-media-thumb', H.press)} label={`${opp.title} at ${opp.org}`} onClick={() => router.push(`/opportunity/${opp.id}`)} style={S('min-height:150px;cursor:pointer')}>
        <ImageSlot src={opp.img} shape="rect" placeholder={opp.ph} alt={opp.ph} />
      </Pressable>
      <div style={S('padding:18px 20px')}>
        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:14px')}>
          <Pressable label={`Open ${opp.title}`} onClick={() => router.push(`/opportunity/${opp.id}`)} style={S('cursor:pointer')}>
            <div style={S('font:600 17px/1.25 Geist;letter-spacing:-0.025em')}>{opp.title}</div>
            <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>
              {opp.org} · {opp.meta}
            </div>
          </Pressable>
          <div style={S('flex:none;display:flex;align-items:center;gap:6px')}>
            {opp.verified ? <div style={S(`padding:5px 9px;border-radius:7px;background:#EAF3EC;font:500 11px/1 ${MONO};color:#3F6B4E`)}>✓ VERIFIED</div> : null}
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F5E7E0;font:500 12px/1 ${MONO};color:#A8482A`)}>{opp.score}%</div>
          </div>
        </div>
        <div style={S('margin-top:12px;font:450 13px/1.45 Geist;color:#6B635C')}>{opp.why}</div>
        <div className="vu-stack vu-stack-gap" style={S('margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
          <div style={S(`font:500 12px/1 ${MONO};color:#A9A097`)}>
            {opp.hrs} · {openShift ? spotsLabel(openShift).replace(' left', ' spots left') : 'no spots left'}
          </div>
          {trailing}
        </div>
      </div>
    </div>
  );
}

export function Saved() {
  const router = useRouter();
  const { state } = useSnapshot();
  const rows = state.saved.map(getOpportunity).filter(Boolean);

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Shortlist</h1>
      <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>
        {rows.length ? `${rows.length} saved. We will tell you if one is about to fill up.` : 'Nothing saved yet.'}
      </p>

      <div style={S('margin-top:26px;display:flex;flex-direction:column;gap:14px')}>
        {rows.length ? (
          rows.map((opp) => (
            <OpportunityRow
              key={opp.id}
              opp={opp}
              router={router}
              trailing={
                <div style={S('display:flex;gap:8px')}>
                  <Pressable
                    label={`Remove ${opp.title} from the shortlist`}
                    onClick={() => {
                      toggleSaved(opp.id);
                      toast({ title: 'Removed from your shortlist', tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(opp.id) });
                    }}
                    className={cx(H.secondary, H.press)}
                    style={S('display:inline-flex;align-items:center;padding:9px 15px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#8A8179;cursor:pointer')}
                  >
                    Remove
                  </Pressable>
                  <Pressable
                    label={`Claim a spot for ${opp.title}`}
                    onClick={() => {
                      try {
                        const { shift } = claimSpot(opp.id);
                        router.push(`/apply/${opp.id}?shift=${shift.id}`);
                      } catch {
                        toast({ title: 'Every shift is full', message: 'We will tell you when a spot opens.', tone: 'warn' });
                      }
                    }}
                    className={cx(H.primaryLift, H.press)}
                    style={S('display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}
                  >
                    <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
                    Claim spot
                  </Pressable>
                </div>
              }
            />
          ))
        ) : (
          <EmptyState
            icon="★"
            title="Nothing on your shortlist"
            body="Save an opening from its page and it waits here until you are ready to apply."
            cta="Browse openings"
            onCta={() => router.push('/discover')}
          />
        )}
      </div>
    </div>
  );
}

export function Friends() {
  const router = useRouter();
  const { state } = useSnapshot();
  const rows = state.friendsGoing.map(getOpportunity).filter(Boolean);

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <h1 style={S('margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em')}>Friends going</h1>
      <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C')}>
        Shifts other students from {state.account.school} already claimed. You can turn this off in Settings → Privacy.
      </p>

      <div style={S('margin-top:26px;display:flex;flex-direction:column;gap:14px')}>
        {rows.length ? (
          rows.map((opp) => (
            <OpportunityRow
              key={opp.id}
              opp={opp}
              router={router}
              trailing={
                <div style={S('display:flex;align-items:center;gap:12px')}>
                  <div style={S(`font:500 12px/1 ${MONO};color:#3F6B4E`)}>{opp.friendsGoing || 2} from your school</div>
                  <Pressable
                    label={`Open ${opp.title}`}
                    onClick={() => router.push(`/opportunity/${opp.id}`)}
                    className={cx(H.primaryLift, H.press)}
                    style={S('display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}
                  >
                    <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
                    Go together
                  </Pressable>
                </div>
              }
            />
          ))
        ) : (
          <EmptyState
            icon="☺"
            title="Nobody from your school yet"
            body="When someone from your school claims a shift you can see, it shows up here."
            cta="Browse openings"
            onCta={() => router.push('/discover')}
          />
        )}
      </div>
    </div>
  );
}

/* ---- peer project page ---------------------------------------------------- */

export function PeerProject({ id }) {
  const router = useRouter();
  const { state } = useSnapshot();
  const p = state.peerProjects.find((x) => x.id === id);

  if (!p) {
    return (
      <div className="vu-pad-40" style={S('padding:32px 40px 96px')}>
        <EmptyState
          title="That project is no longer listed"
          body="Student projects close once every seat is filled or the term ends."
          cta="Browse student projects"
          onCta={() => router.push('/discover?tab=projects')}
        />
      </div>
    );
  }

  const open = Math.max(0, p.crewCap - p.crewFilled);

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <Pressable label="Back to Discover" onClick={() => router.push('/discover?tab=projects')} className={H.toInk} style={S('font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}>
        ← Back to Discover
      </Pressable>

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 340px;gap:26px;margin-top:18px;align-items:start')}>
        <div>
          <div style={S('border-radius:16px;overflow:hidden;border:1px solid #E8E1D9;height:300px')}>
            <ImageSlot src={p.img} shape="rect" placeholder="project cover" />
          </div>
          <div style={S('margin-top:22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 ${MONO};color:#57504A`)}>Student led</div>
            <div style={S(`padding:5px 9px;border-radius:7px;background:#EAF3EC;font:500 12px/1 ${MONO};color:#3F6B4E`)}>Sponsored by {p.org} ✓</div>
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 ${MONO};color:#57504A`)}>{p.cause}</div>
          </div>
          <h1 style={S('margin:14px 0 0;font:600 34px/1.1 Geist;letter-spacing:-0.038em')}>{p.t}</h1>
          <div style={S('margin-top:10px;font:450 15px/1.5 Geist;color:#6B635C')}>
            {p.lead} · {p.next}
          </div>
          <p style={S('margin:22px 0 0;max-width:600px;font:400 16px/1.65 Geist;color:#332D28;text-wrap:pretty')}>
            A student-run project operating under {p.org}, which supplies the site, the insurance and a named staff contact for every session. Hours you
            earn here verify through that sponsor exactly like an accredited listing.
          </p>
          <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:26px')}>
            {[
              { l: 'Crew', v: `${p.crewFilled} / ${p.crewCap}` },
              { l: 'Open seats', v: String(open) },
              { l: 'Role', v: p.role },
            ].map((k) => (
              <div key={k.l} style={S('padding:16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>{k.l}</div>
                <div style={S('margin-top:8px;font:600 22px/1 Geist;letter-spacing:-0.03em')}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="vu-sticky-side" style={S('display:flex;flex-direction:column;gap:14px;position:sticky;top:28px')}>
          <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Next session</div>
            <div style={S('margin-top:10px;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>{p.next}</div>
            <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
              <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                <span>Sponsor</span>
                <span style={S('color:#1A1714;font-weight:500')}>{p.org}</span>
              </div>
              <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                <span>Hours verified by</span>
                <span style={S('color:#1A1714;font-weight:500')}>The sponsor</span>
              </div>
              <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                <span>Open seats</span>
                <span style={s('font-weight:500', `color:${open ? '#1A1714' : '#A8482A'}`)}>{open || 'None right now'}</span>
              </div>
            </div>
            <Pressable
              label={open ? `Request a spot on ${p.t}` : 'Join the waitlist'}
              onClick={() =>
                toast({
                  title: open ? 'Request sent' : 'Added to the waitlist',
                  message: open
                    ? `${p.leadName} reviews requests and usually replies within a day.`
                    : 'We will tell you the moment a seat opens.',
                  tone: 'ok',
                })
              }
              className={cx(H.primaryLift, H.press)}
              style={S('margin-top:18px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:46px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)')}
            >
              <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
              {open ? 'Request a spot' : 'Join the waitlist'}
            </Pressable>
            <div style={S('margin-top:14px;font:450 12px/1.5 Geist;color:#A9A097')}>
              Student projects are run by another student. The sponsor supplies supervision and confirms every hour.
            </div>
          </div>

          <div style={S('padding:18px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Safety</div>
            <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.45 Geist;color:#332D28')}>
              {['A staff member from the sponsor is on every session', 'Never fewer than two volunteers on site', 'Guardian consent collected under 16'].map((t) => (
                <div key={t} style={S('display:flex;gap:9px')}>
                  <span aria-hidden="true" style={S('color:#3F6B4E')}>✓</span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
