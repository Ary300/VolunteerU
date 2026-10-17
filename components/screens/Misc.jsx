'use client';

/* ==========================================================================
   Misc.jsx, notifications, saved, friends going, peer project page
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState, ErrorState, SkeletonRows, Icon } from '../ui.jsx';
import { useSnapshot } from '../../lib/store.js';
import { toast } from '../../lib/overlays.js';
import {
  markNotificationsSeen, getNotificationsSeenAt,
  getOpportunity, toggleSaved, spotsLeft, upcomingShifts, applicationFor, applicationStatus,
} from '../../lib/db.js';
import { loadMyNotifications, loadMyApplications, loadListingsByIds, loadOwnerApplications } from '../../lib/listings.js';
import { nextShiftInfo } from './JoinListing.jsx';

const MONO = "'Geist Mono',monospace";
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TONE_DOT = { ok: '#3F6B4E', warn: '#8A5A20', danger: '#A8482A', brand: '#C2603C', accepted: '#3F6B4E', declined: '#A8482A', rating: '#C2603C', announcement: '#5B6BB0', application: '#8A5A20' };

const PAGE = 'padding:32px 40px 96px';
const TITLE = 'margin:0;font:600 30px/1.1 Geist;letter-spacing:-0.035em';
const LEDE = 'margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C';
const BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 15px;height:36px;border-radius:10px;font:600 13px/1 Geist;cursor:pointer;white-space:nowrap';
const PRIMARY = `${BTN};border:1px solid #A8482A;background:#C2603C;color:#fff`;
const SECONDARY = `${BTN};border:1px solid #E4DDD4;background:#fff;color:#57504A`;
const CHIP = `display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border-radius:7px;font:500 11px/1 ${MONO}`;

function notifWhen(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusChip({ st }) {
  const meta = applicationStatus(st);
  return <span style={S(`${CHIP};background:${meta.bg};color:${meta.color}`)}>{meta.label}</span>;
}

function VerifiedChip() {
  return (
    <span style={S(`${CHIP};background:#EAF3EC;color:#3F6B4E`)}>
      <Icon name="check" size={11} stroke={2.4} /> Verified
    </span>
  );
}

/* ---- notification centre -------------------------------------------------- */

/** One "New application" item per pending application to the signed-in
    owner's listings, linked to that project's Applications tab when the
    listing belongs to one of their workspaces. */
function ownerApplicationItems(apps, projects) {
  const pidFor = new Map((projects || []).filter((p) => p.listingId).map((p) => [p.listingId, p.id]));
  return (apps || [])
    .filter((a) => a && a.status === 'pending')
    .map((a) => {
      const who = String(a.applicant_name || '').trim() || 'A volunteer';
      const project = a.listings && a.listings.name;
      const pid = pidFor.get(a.listing_id);
      return {
        id: `app-new-${a.id}`,
        type: 'application',
        title: project ? `${who} applied to ${project}` : `${who} applied`,
        body: [a.position, a.note].filter(Boolean).map(String).join(', ').slice(0, 280),
        at: a.created_at || null,
        href: pid ? `/lead/${encodeURIComponent(pid)}/applications` : '/lead',
      };
    });
}

/** Feed items newest first, one per id, capped like loadMyNotifications. */
function mergeFeed(...lists) {
  const seen = new Set();
  const out = [];
  for (const n of lists.flat()) {
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  out.sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
  return out.slice(0, 40);
}

export function Notifications() {
  const router = useRouter();
  const { state } = useSnapshot();
  // A lead's feed is new applications and messages from their volunteers, so
  // the subtitle and empty state describe that instead of a volunteer's.
  const openProjects = (state.projects || []).filter((p) => p && !p.archived);
  const leads = openProjects.length > 0;
  const homeProject = openProjects.find((p) => p.id === state.activeProjectId) || openProjects[0] || null;
  const [notifs, setNotifs] = useState(null);
  const [ownerApps, setOwnerApps] = useState([]);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Snapshot the prior "seen" time on mount so items that arrived since then
  // keep their fresh highlight, even though we mark everything seen below.
  const [seenAt, setSeenAt] = useState(0);

  useEffect(() => {
    setSeenAt(getNotificationsSeenAt());
    // Opening the page marks everything seen (clears the unread badge).
    markNotificationsSeen();
  }, []);

  useEffect(() => {
    let alive = true;
    setNotifs(null);
    setFailed(false);
    // Both reads throw on failure, so an outage shows the error state instead
    // of "No notifications yet".
    Promise.all([loadMyNotifications(), loadOwnerApplications({ throwOnError: true })])
      .then(([n, owned]) => {
        if (!alive) return;
        setOwnerApps(owned || []);
        setNotifs(n || []);
      })
      .catch((err) => {
        console.error('[notifications] load failed', err);
        if (alive) { setFailed(true); setOwnerApps([]); setNotifs([]); }
      });
    return () => { alive = false; };
  }, [nonce]);

  // Built at render so the links follow the workspace once it syncs in.
  const list = useMemo(
    () => (notifs ? mergeFeed(notifs, ownerApplicationItems(ownerApps, state.projects)) : []),
    [notifs, ownerApps, state.projects],
  );

  let body;
  if (failed) {
    body = <ErrorState title="Couldn't load notifications" body="Check your connection and try again." onRetry={() => setNonce((n) => n + 1)} />;
  } else if (notifs === null) {
    body = <div aria-busy="true" style={S('padding:18px 20px')}><SkeletonRows n={3} h={52} /></div>;
  } else if (!list.length) {
    body = (
      <EmptyState
        icon="bell"
        title="No notifications yet"
        body={leads
          ? "Share your project's join link so volunteers can apply."
          : "Apply to an opportunity and the organization's reply shows up here."}
        cta={leads ? 'Open your project' : 'Search opportunities'}
        onCta={() => router.push(leads && homeProject ? `/lead/${encodeURIComponent(homeProject.id)}/overview` : '/discover')}
      />
    );
  } else {
    body = list.map((n) => {
      const fresh = n.at && new Date(n.at).getTime() > seenAt;
      return (
        <Pressable
          key={n.id}
          label={n.body ? `${n.title}. ${n.body}` : n.title}
          onClick={() => { if (n.href) router.push(n.href); }}
          className={cx(H.row, H.press)}
          style={s('display:flex;gap:13px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid #F1EBE4;cursor:pointer;transition:background .16s ease', fresh ? 'background:#FCFAF8' : '')}
        >
          <span aria-hidden="true" style={s('width:8px;height:8px;border-radius:50%;flex:none;margin-top:6px', `background:${TONE_DOT[n.type] || '#C2603C'}`)} />
          <div style={S('flex:1;min-width:0')}>
            <div style={S('font:600 14px/1.35 Geist;color:#1A1714')}>{n.title}</div>
            {n.body ? <div style={S('margin-top:5px;font:450 13px/1.5 Geist;color:#8A8179;overflow-wrap:anywhere')}>{n.body}</div> : null}
          </div>
          <div style={S(`font:500 11px/1 ${MONO};color:#8A8179;flex:none;margin-top:4px`)}>{notifWhen(n.at)}</div>
        </Pressable>
      );
    });
  }

  return (
    <div className="vu-screen vu-pad-40" style={S(PAGE)}>
      <h1 style={S(TITLE)}>Notifications</h1>
      <p style={S(LEDE)}>
        {leads
          ? 'New applications and messages from volunteers on your projects.'
          : 'Application decisions and updates from organizations you\'ve joined.'}
      </p>
      <div style={S('margin-top:26px;border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>{body}</div>
    </div>
  );
}

/* ---- rows shared by Saved and Friends -------------------------------------- */

function RowShell({ thumb, children }) {
  return (
    <div className={cx('vu-media-row', H.card)} style={S('display:grid;grid-template-columns:180px 1fr;border-radius:14px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;transition:border-color .16s ease')}>
      {thumb}
      <div style={S('padding:18px 20px;min-width:0')}>{children}</div>
    </div>
  );
}

/** A saved local catalogue opportunity (sign up goes to its next upcoming shift). */
function OpportunityRow({ opp, router, trailing }) {
  const next = upcomingShifts(opp).find((x) => spotsLeft(x) > 0);
  const open = () => router.push(`/opportunity/${opp.id}`);
  return (
    <RowShell
      thumb={
        <Pressable className={cx('vu-media-thumb', H.press)} label={`${opp.title} at ${opp.org}`} onClick={open} style={S('min-height:150px;cursor:pointer')}>
          <ImageSlot src={opp.img} shape="rect" placeholder={opp.ph} alt={opp.ph} />
        </Pressable>
      }
    >
      <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap')}>
        <Pressable label={`Open ${opp.title}`} onClick={open} style={S('cursor:pointer;min-width:0')}>
          <div style={S('font:600 17px/1.25 Geist;letter-spacing:-0.025em')}>{opp.title}</div>
          <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>{[opp.org, opp.meta].filter(Boolean).join(', ')}</div>
        </Pressable>
        {opp.verified ? <VerifiedChip /> : null}
      </div>
      {opp.why ? <div style={S('margin-top:12px;font:450 13px/1.45 Geist;color:#6B635C')}>{opp.why}</div> : null}
      <div className="vu-stack vu-stack-gap" style={S('margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
        <div style={S('font:450 13px/1.4 Geist;color:#6B635C')}>
          {next ? `Next shift ${next.d}, ${spotsLeft(next)} of ${next.cap} spots left` : 'No upcoming shifts with space'}
        </div>
        {trailing}
      </div>
    </RowShell>
  );
}

/** A saved live listing (posted by an organization or a student project). */
function ListingRow({ listing, app, onRemove, router }) {
  const official = (listing.org_class || 'student') === 'official';
  const live = listing.status === 'live';
  const isTeam = listing.org_type === 'team';
  const shift = isTeam ? null : nextShiftInfo(listing.next_session);
  const meta = [listing.cause, listing.site].filter(Boolean).join(', ');
  const open = () => router.push(`/join/${listing.id}`);
  return (
    <RowShell
      thumb={
        <Pressable className={cx('vu-media-thumb', H.press)} label={`Open ${listing.name}`} onClick={open} style={S('min-height:150px;cursor:pointer')}>
          <ImageSlot src={listing.cover} shape="rect" placeholder={listing.cause || 'opportunity'} alt="" />
        </Pressable>
      }
    >
      <Pressable label={`Open ${listing.name}`} onClick={open} style={S('cursor:pointer;display:block;min-width:0')}>
        <span style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
          <span style={S('font:600 17px/1.25 Geist;letter-spacing:-0.025em;color:#1A1714')}>{listing.name}</span>
          <span style={S(`${CHIP};${official ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FDF3E7;color:#8A5A20'}`)}>{official ? 'Nonprofit' : 'Student project'}</span>
          {listing.verified ? <VerifiedChip /> : null}
        </span>
        {meta ? <span style={S('display:block;margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>{meta}</span> : null}
        {listing.mission ? (
          <span style={S('display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:10px;font:450 13px/1.5 Geist;color:#57504A')}>{listing.mission}</span>
        ) : null}
      </Pressable>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
        <div style={S('font:450 13px/1.4 Geist;color:#6B635C;display:flex;align-items:center;gap:6px')}>
          {isTeam ? (
            <>
              <Icon name="laptop" size={14} /> Team project, no set shifts
            </>
          ) : (
            <>
              <Icon name="calendar" size={14} />
              {shift && !shift.past ? `Next shift ${shift.label}` : 'No upcoming shift posted yet'}
            </>
          )}
        </div>
        <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
          <button type="button" onClick={onRemove} aria-label={`Remove ${listing.name} from saved`} className={cx(H.secondary, H.press)} style={S(SECONDARY)}>
            Remove
          </button>
          {app ? (
            <StatusChip st={app.status} />
          ) : !live ? (
            <span style={S(`${CHIP};background:#F6F2EE;color:#6B635C`)}>Paused</span>
          ) : (
            // The join page picks the role, takes a note and shows the
            // parent's-OK notice, so applying always goes through it.
            <button type="button" onClick={open} aria-label={`Apply to ${listing.name}`} className={cx(H.primary, H.press)} style={S(PRIMARY)}>
              Apply
            </button>
          )}
        </div>
      </div>
    </RowShell>
  );
}

function GoneRow({ id }) {
  return (
    <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-radius:14px;border:1px dashed #E0D8CF;background:#FCFAF8')}>
      <div style={S('font:450 14px/1.4 Geist;color:#6B635C')}>A saved opportunity is no longer listed.</div>
      <button
        type="button"
        onClick={() => { toggleSaved(id); toast({ title: 'Removed from saved', tone: 'brand' }); }}
        className={cx(H.secondary, H.press)}
        style={S(SECONDARY)}
      >
        Remove
      </button>
    </div>
  );
}

/* ---- saved ------------------------------------------------------------- */

export function Saved() {
  const router = useRouter();
  const { state } = useSnapshot();
  const ids = state.saved || [];
  const liveIds = ids.filter((id) => UUID_RX.test(String(id)));
  const [cache, setCache] = useState(() => new Map()); // listing id -> row | null
  const [apps, setApps] = useState(null); // listing id -> application
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const key = liveIds.join('|');
  useEffect(() => {
    let alive = true;
    const missing = liveIds.filter((id) => !cacheRef.current.has(id));
    if (!missing.length && apps && !failed) return undefined;
    setFailed(false);
    (async () => {
      try {
        // Both reads throw on failure, so an outage shows the error state
        // instead of every saved row reading "no longer listed". Only an id
        // that a successful read didn't return counts as gone.
        const [mine, rows] = await Promise.all([
          loadMyApplications({ throwOnError: true }),
          loadListingsByIds(missing),
        ]);
        if (!alive) return;
        const byId = new Map(rows.map((r) => [String(r.id), r]));
        setApps(new Map(mine.map((a) => [a.listing_id, a])));
        setCache((prev) => {
          const next = new Map(prev);
          missing.forEach((id) => next.set(id, byId.get(String(id)) || null));
          return next;
        });
      } catch (err) {
        console.error('[saved] load failed', err);
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  function remove(id, name) {
    toggleSaved(id);
    toast({ title: 'Removed from saved', message: name, tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(id) });
  }

  const loading = !failed && liveIds.length > 0 && (apps === null || liveIds.some((id) => !cache.has(id)));

  let body;
  if (!ids.length) {
    body = (
      <EmptyState
        icon="bookmark"
        title="Nothing saved yet"
        body="Tap Save on any opportunity in Discover to keep it here."
        cta="Search opportunities"
        onCta={() => router.push('/discover')}
      />
    );
  } else if (failed) {
    body = <ErrorState title="Couldn't load your saved list" body="Check your connection and try again." onRetry={() => setNonce((n) => n + 1)} />;
  } else if (loading && apps === null) {
    body = <SkeletonRows n={Math.min(ids.length, 3)} h={150} />;
  } else {
    body = ids.map((id) => {
      const opp = getOpportunity(id);
      if (opp) {
        const local = applicationFor(opp.id);
        return (
          <OpportunityRow
            key={id}
            opp={opp}
            router={router}
            trailing={
              <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                <button type="button" onClick={() => remove(opp.id, opp.title)} aria-label={`Remove ${opp.title} from saved`} className={cx(H.secondary, H.press)} style={S(SECONDARY)}>
                  Remove
                </button>
                {local && local.st !== 'Withdrawn' ? (
                  <StatusChip st={local.st} />
                ) : (
                  <button type="button" onClick={() => router.push(`/opportunity/${opp.id}`)} aria-label={`Pick a shift for ${opp.title}`} className={cx(H.primary, H.press)} style={S(PRIMARY)}>
                    Pick a shift
                  </button>
                )}
              </div>
            }
          />
        );
      }
      const listing = cache.get(id);
      if (listing === undefined && UUID_RX.test(String(id))) return <SkeletonRows key={id} n={1} h={150} />;
      if (!listing) return <GoneRow key={id} id={id} />;
      return (
        <ListingRow
          key={id}
          listing={listing}
          app={apps ? apps.get(listing.id) : null}
          onRemove={() => remove(listing.id, listing.name)}
          router={router}
        />
      );
    });
  }

  return (
    <div className="vu-screen vu-pad-40" style={S(PAGE)}>
      <h1 style={S(TITLE)}>Saved</h1>
      {ids.length ? <p style={S(LEDE)}>{ids.length} saved</p> : null}
      <div style={S('margin-top:26px;display:flex;flex-direction:column;gap:14px')}>{body}</div>
    </div>
  );
}

/* ---- friends going --------------------------------------------------------- */

export function Friends() {
  const router = useRouter();
  const { state } = useSnapshot();
  const rows = (state.friendsGoing || []).map(getOpportunity).filter(Boolean);
  const school = (state.account && state.account.school) || 'your school';

  return (
    <div className="vu-screen vu-pad-40" style={S(PAGE)}>
      <h1 style={S(TITLE)}>Friends going</h1>
      <p style={S(LEDE)}>
        Shifts students from {school} signed up for.
      </p>

      <div style={S('margin-top:26px;display:flex;flex-direction:column;gap:14px')}>
        {rows.length ? (
          rows.map((opp) => (
            <OpportunityRow
              key={opp.id}
              opp={opp}
              router={router}
              trailing={
                <div style={S('display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
                  {Number(opp.friendsGoing) > 0 ? (
                    <div style={S('font:500 13px/1 Geist;color:#3F6B4E')}>{opp.friendsGoing} from your school</div>
                  ) : null}
                  <button type="button" onClick={() => router.push(`/opportunity/${opp.id}`)} aria-label={`See shifts for ${opp.title}`} className={cx(H.primary, H.press)} style={S(PRIMARY)}>
                    See shifts
                  </button>
                </div>
              }
            />
          ))
        ) : (
          <EmptyState
            icon="users"
            title="Nobody from your school yet"
            body="When students from your school sign up for shifts, they show up here."
            cta="Search opportunities"
            onCta={() => router.push('/discover')}
          />
        )}
      </div>
    </div>
  );
}

/* ---- peer project page ---------------------------------------------------- */

function Fact({ label, children, tone }) {
  return (
    <div style={S('display:flex;justify-content:space-between;gap:10px')}>
      <span>{label}</span>
      <span style={s('font-weight:500;text-align:right', `color:${tone || '#1A1714'}`)}>{children}</span>
    </div>
  );
}

export function PeerProject({ id }) {
  const router = useRouter();
  const { state } = useSnapshot();
  const p = (state.peerProjects || []).find((x) => x.id === id);

  if (!p) {
    return (
      <div className="vu-pad-40" style={S(PAGE)}>
        <EmptyState
          icon="flag"
          title="This project isn't listed"
          body="The lead may have closed it. Other student projects are open on Discover."
          cta="Browse student projects"
          onCta={() => router.push('/discover?kind=student')}
        />
      </div>
    );
  }

  const cap = Number(p.crewCap) || 0;
  const filled = Number(p.crewFilled) || 0;
  const open = Math.max(0, cap - filled);
  const existing = applicationFor(p.id);
  const hasApp = existing && existing.st !== 'Withdrawn';

  function request() {
    if (p.listingId) {
      router.push(`/join/${p.listingId}`);
      return;
    }
    toast({
      title: "Requests aren't open yet",
      message: 'Nothing was sent. Live student projects are on Discover.',
      tone: 'warn',
      actionLabel: 'Open Discover',
      onAction: () => router.push('/discover?kind=student'),
    });
  }

  return (
    <div className="vu-screen vu-pad-40" style={S(PAGE)}>
      <Pressable label="Back to Discover" onClick={() => router.push('/discover?kind=student')} className={H.toInk} style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}>
        <Icon name="arrow-left" size={14} /> Back to Discover
      </Pressable>

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 340px;gap:26px;margin-top:18px;align-items:start')}>
        <div>
          <div style={S('border-radius:16px;overflow:hidden;border:1px solid #E8E1D9;height:300px')}>
            <ImageSlot src={p.img} shape="rect" placeholder="project cover" />
          </div>
          <div style={S('margin-top:22px;display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            <span style={S(`${CHIP};background:#FDF3E7;color:#8A5A20`)}>Student project</span>
            {p.cause ? <span style={S(`${CHIP};background:#F6F2EE;color:#57504A`)}>{p.cause}</span> : null}
          </div>
          <h1 style={S('margin:14px 0 0;font:600 34px/1.1 Geist;letter-spacing:-0.038em')}>{p.t}</h1>
          <div style={S('margin-top:10px;font:450 15px/1.5 Geist;color:#6B635C')}>
            {[p.lead && `Led by ${p.lead}`, p.org && `with ${p.org}`].filter(Boolean).join(' ')}
          </div>
          {p.blurb || p.mission ? (
            <p style={S('margin:22px 0 0;max-width:600px;font:400 16px/1.65 Geist;color:#332D28;text-wrap:pretty')}>{p.blurb || p.mission}</p>
          ) : null}
        </div>

        <div className="vu-sticky-side" style={S('display:flex;flex-direction:column;gap:14px;position:sticky;top:28px')}>
          <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S('font:500 13px/1 Geist;color:#8A8179')}>Next meetup</div>
            <div style={S('margin-top:8px;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>{p.next || 'Not scheduled yet'}</div>
            <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
              {p.role ? <Fact label="Role">{p.role}</Fact> : null}
              {cap ? <Fact label="Team">{`${filled} of ${cap}`}</Fact> : null}
              {cap ? <Fact label="Open spots" tone={open ? '#1A1714' : '#A8482A'}>{open || 'None right now'}</Fact> : null}
              {p.org ? <Fact label="Confirms hours">{p.org}</Fact> : null}
            </div>
            {hasApp ? (
              <div style={S('margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
                <StatusChip st={existing.st} />
                <span style={S('font:450 13px/1.4 Geist;color:#6B635C')}>{applicationStatus(existing.st).detail}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={request}
                className={cx(H.primary, H.press)}
                style={S('margin-top:18px;width:100%;display:flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 18px;height:46px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 15px/1 Geist;cursor:pointer')}
              >
                {open || !cap ? 'Request a spot' : 'Join the waitlist'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
