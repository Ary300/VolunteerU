'use client';

/* ==========================================================================
   Misc.jsx, notifications, saved, peer project page
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, s } from '../../lib/style.js';
import { C, F, R } from '../../lib/tokens.js';
import { ImageSlot, EmptyState, ErrorState, SkeletonRows, Icon, Button } from '../ui.jsx';
import { ListingCard, StatusText, statusTone, DateBlock, Sep } from '../vu/index.js';
import { usePhotoPicker, photoFor } from '../../lib/photos.js';
import { useSnapshot } from '../../lib/store.js';
import { toast } from '../../lib/overlays.js';
import {
  markNotificationsSeen, getNotificationsSeenAt,
  getOpportunity, toggleSaved, spotsLeft, upcomingShifts, applicationFor, applicationStatus,
} from '../../lib/db.js';
import { loadMyNotifications, loadMyApplications, loadListingsByIds, loadOwnerApplications, listingShifts, myShiftSignUps } from '../../lib/listings.js';
import { nextShiftInfo, shiftLabel } from './JoinListing.jsx';
import SavedNonprofits, { isNonprofitId } from '../SavedNonprofits.jsx';

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEDE = `margin:8px 0 0;max-width:620px;font:400 15px/1.5 ${F.body};color:${C.ink2}`;
const META = `font:400 14px/1.4 ${F.body};color:${C.ink2}`;

/** Page header: one h1 and an optional line under it. */
function PageHead({ title, sub }) {
  return (
    <header>
      <h1 className="vu-t-h1" style={S(`color:${C.ink}`)}>{title}</h1>
      {sub ? <p style={S(LEDE)}>{sub}</p> : null}
    </header>
  );
}

/* An empty screen (CARDS.md 4.1): one sentence and, only where a next step
   helps, one underlined link 12px below. No heading, no box, no filled
   button. Notifications uses it for the muted-feed line; Saved has its
   own empty layout below, so the screens don't share one. */
function EmptyNote({ children, linkLabel, href }) {
  return (
    <div className="vu-empty" style={S(`padding-top:20px;border-top:1px solid ${C.line}`)}>
      <p style={S(`margin:0;max-width:560px;font:400 15px/1.5 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{children}</p>
      {linkLabel && href ? (
        <p style={S('margin:12px 0 0')}>
          <Link href={href} className="vu-link-ul" style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>{linkLabel}</Link>
        </p>
      ) : null}
    </div>
  );
}

/** The feed types the user's own Settings > Notifications switches hide
    (lib/listings.js loadMyNotifications reads the same prefs), as the
    switch labels written into a sentence. A missing value counts as on. */
function mutedNotifLabels(prefs) {
  const np = (prefs && prefs.notifications) || {};
  return [
    np.applicationUpdates === false ? 'application updates' : '',
    np.crewMessages === false ? 'project messages' : '',
    np.hoursConfirmed === false ? 'confirmed hours' : '',
  ].filter(Boolean);
}

/* When a notification arrived, in one format for every row (VOICE.md
   dates and times): "Today at 3:40 PM" for today, the short date "Oct 11"
   for anything earlier, plus the year only when it falls before the
   current school year (which starts in August). */
function clockLabel(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 12 && m === 0) return 'noon';
  const hour = h % 12 || 12;
  const mins = m ? `:${String(m).padStart(2, '0')}` : '';
  return `${hour}${mins} ${h < 12 ? 'AM' : 'PM'}`;
}

function notifWhen(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today at ${clockLabel(d)}`;
  const schoolYearStart = new Date(now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1, 7, 1);
  const opts = d < schoolYearStart
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}

/* ---- notification centre -------------------------------------------------- */

/** The shifts an applicant picked, for the lead's feed: "Sat, Oct 31" or
    "Sat, Oct 31 and 2 more". '' when they picked none. */
function pickedShifts(a) {
  const mine = myShiftSignUps(a).filter((x) => !x.past && x.d);
  if (!mine.length) return '';
  return mine.length > 1 ? `${mine[0].d} and ${mine.length - 1} more` : String(mine[0].d);
}

/** Owner feed items for the signed-in owner's listings: one "New
    application" per pending application (with the role, the shift they
    picked and their note), and one "withdrew" per withdrawal. Each links to
    that project's Applications tab when the listing belongs to one of their
    workspaces. */
function ownerApplicationItems(apps, projects) {
  const pidFor = new Map((projects || []).filter((p) => p.listingId).map((p) => [p.listingId, p.id]));
  return (apps || [])
    .filter((a) => a && (a.status === 'pending' || (a.status === 'withdrawn' && a.decided_at)))
    .map((a) => {
      const who = String(a.applicant_name || '').trim() || 'A volunteer';
      const project = a.listings && a.listings.name;
      const pid = pidFor.get(a.listing_id);
      const href = pid ? `/lead/${encodeURIComponent(pid)}/applications` : '/lead';
      if (a.status === 'withdrawn') {
        return {
          id: `app-wd-${a.id}-${a.decided_at}`,
          type: 'application',
          title: project ? `${who} withdrew from ${project}` : `${who} withdrew`,
          body: a.position ? String(a.position) : '',
          at: a.decided_at,
          href,
        };
      }
      return {
        id: `app-new-${a.id}`,
        type: 'application',
        title: project ? `${who} applied to ${project}` : `${who} applied`,
        body: [a.position, pickedShifts(a), a.note].filter(Boolean).map(String).join(', ').slice(0, 280),
        at: a.created_at || null,
        href,
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

/* A row (CARDS.md 3.2): an Ember dot for unread or nothing, the title, then
   "{age} · {body}". No icon tile, no tinted background, nothing trailing:
   the whole row is the link. */
function NotificationRow({ n, fresh }) {
  const when = notifWhen(n.at);
  const cls = fresh ? 'vu-row vu-notif' : 'vu-row vu-row--nolead vu-notif';
  const inner = (
    <>
      {fresh ? (
        <span className="vu-row-dot" style={S('align-self:start;margin-top:6px')}>
          <span className="vu-sr">Unread</span>
        </span>
      ) : null}
      <span style={S('display:block;min-width:0')}>
        <span className="vu-row-t" style={S(`white-space:normal;overflow-wrap:anywhere;font-weight:${fresh ? 600 : 500}`)}>{n.title}</span>
        {when || n.body ? (
          <span className="vu-row-m vu-row-m--wrap" style={S('overflow-wrap:anywhere')}>
            {when ? <span style={S('font-variant-numeric:tabular-nums')}>{when}</span> : null}
            {when && n.body ? <Sep /> : null}
            {n.body || null}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <li style={S('list-style:none')}>
      {n.href ? (
        <Link href={n.href} className={cls} data-unread={fresh ? 'true' : undefined} style={S('color:inherit;text-decoration:none')}>
          {inner}
        </Link>
      ) : (
        <div className={cls} data-unread={fresh ? 'true' : undefined}>{inner}</div>
      )}
    </li>
  );
}

function FeedGroup({ title, items, fresh, first }) {
  if (!items.length) return null;
  return (
    <section style={S(first ? 'margin-top:28px' : 'margin-top:44px')} aria-label={title || 'Notifications'}>
      {title ? <h2 className="vu-t-h3s" style={S(`margin:0 0 12px;color:${C.ink}`)}>{title}</h2> : null}
      <ul className="vu-list" style={S('margin:0;padding:0')}>
        {items.map((n) => <NotificationRow key={n.id} n={n} fresh={fresh} />)}
      </ul>
    </section>
  );
}

export function Notifications() {
  const { state } = useSnapshot();
  // A lead's feed is new applications and messages from their volunteers, so
  // the subtitle and empty state describe that instead of a volunteer's.
  const openProjects = (state.projects || []).filter((p) => p && !p.archived);
  const leads = openProjects.length > 0;
  const muted = mutedNotifLabels(state.prefs);
  const [notifs, setNotifs] = useState(null);
  const [ownerApps, setOwnerApps] = useState([]);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Snapshot the prior "seen" time once per visit so items that arrived since
  // then keep their unread look, even though everything is marked seen below.
  // The ref guard matters in dev, where StrictMode runs this effect twice and
  // the second run would otherwise read the time the first run just wrote.
  const [seenAt, setSeenAt] = useState(Number.MAX_SAFE_INTEGER);
  const captured = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    setSeenAt(Number(getNotificationsSeenAt()) || 0);
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
  const isFresh = (n) => Boolean(n.at) && new Date(n.at).getTime() > seenAt;
  const fresh = list.filter(isFresh);
  const earlier = list.filter((n) => !isFresh(n));

  const emptyFeed = !failed && notifs !== null && !list.length;
  let body;
  if (failed) {
    body = <ErrorState title="Couldn't load notifications" body="Check your connection and try again." onRetry={() => setNonce((n) => n + 1)} />;
  } else if (notifs === null) {
    body = <div aria-busy="true" style={S('margin-top:28px')}><SkeletonRows n={3} h={64} /></div>;
  } else if (!list.length) {
    // When the user's own switches hide part of the feed, say so and point
    // at the switches instead of inviting them to apply again.
    body = (
      <div style={S('margin-top:24px')}>
        {muted.length ? (
          <EmptyNote linkLabel="Notification settings" href="/settings/notifications">
            {`You turned off ${muted.length > 2 ? `${muted.slice(0, -1).join(', ')} and ${muted[muted.length - 1]}` : muted.join(' and ')}, so they don't show up here.`}
          </EmptyNote>
        ) : (
          /* One plain line under the title, no rule or box. A volunteer
             gets an inline link to go apply to something. */
          <p className="vu-empty" style={S(`margin:-16px 0 0;max-width:620px;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
            {leads ? (
              'When a volunteer applies to your project or sends you a message, it shows up here.'
            ) : (
              <>
                Replies to your applications show up here.{' '}
                <Link href="/discover" className="vu-link-ul" style={S(`font-weight:600;color:${C.ink}`)}>Find a shift</Link>
              </>
            )}
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <FeedGroup title="New" items={fresh} fresh first />
        <FeedGroup title={fresh.length ? 'Earlier' : ''} items={earlier} fresh={false} first={!fresh.length} />
      </>
    );
  }

  return (
    <div className="vu-page">
      <div style={S('max-width:1040px')}>
        {/* An empty feed's own sentence says what lands here, so the
            subtitle would only repeat it. */}
        <PageHead
          title="Notifications"
          sub={emptyFeed ? '' : leads
            ? 'New applications and messages from volunteers on your projects.'
            : "Application decisions and updates from organizations you've joined."}
        />
        {body}
      </div>
    </div>
  );
}

/* ---- cards on the Saved page ----------------------------------------------- */

/* The photo badge for the viewer's own application (CARDS.md 1.4): accepted
   reads "You're in", pending reads "Applied", anything else shows nothing. */
const APP_BADGE = { accepted: 'in', pending: 'applied' };
const LOCAL_BADGE = { Accepted: 'in', Confirmed: 'in', Applied: 'applied', Pending: 'applied', Waiting: 'applied' };

/** Org line for a live listing: the first part of its site ("Riverbend Food Bank"),
    or '' for a remote site (line B already says Online). */
function placeOf(listing) {
  const place = String(listing.site || listing.location || '').trim();
  const first = place.split(',')[0].trim();
  return { place, first: /remote|online|virtual/i.test(first) ? '' : first };
}

/** True when the stored next shift is set and still ahead of now. */
function hasUpcomingShift(raw) {
  const info = nextShiftInfo(raw);
  return Boolean(info && !info.past);
}

/** ListingCard props shared by every live listing (org or student project).
    The card reads date and time from the stored label: a past or missing
    next shift falls back to the first published shift that hasn't ended,
    else no date (the tile then says "No dates yet"). No buttons under the
    card: the title opens /join/<id>, where Apply lives. */
export function liveCardProps(listing) {
  const student = (listing.org_class || 'student') !== 'official';
  const isTeam = listing.org_type === 'team';
  const shifts = isTeam ? [] : listingShifts(listing);
  const when = isTeam ? '' : hasUpcomingShift(listing.next_session) ? listing.next_session : shifts[0] ? shiftLabel(shifts[0]) : '';
  const { first } = placeOf(listing);
  return {
    href: `/join/${listing.id}`,
    title: listing.name,
    org: student ? undefined : first || undefined,
    verified: !student && Boolean(listing.verified),
    byline: student ? first || undefined : undefined,
    studentProject: student,
    when,
    moreDates: when && shifts.length > 1 ? shifts.length - 1 : 0,
    online: listing.delivery === 'remote',
    cause: listing.cause,
  };
}

/** A local catalogue opportunity (its next upcoming shift with space). */
function OpportunityCard({ opp, photo, saved, onToggleSave, badge }) {
  const next = upcomingShifts(opp).find((x) => spotsLeft(x) > 0);
  return (
    <ListingCard
      href={`/opportunity/${opp.id}`}
      title={opp.title}
      org={opp.org}
      verified={Boolean(opp.verified)}
      when={next ? shiftLabel(next) : ''}
      spots={next ? spotsLeft(next) : undefined}
      photo={photo}
      cause={opp.cause}
      saved={saved}
      onToggleSave={onToggleSave}
      badge={badge}
    />
  );
}

function GoneRow({ id }) {
  return (
    <li className="vu-row vu-row--nolead" style={S('list-style:none')}>
      <div style={S('min-width:0')}>
        <span className="vu-row-t">Closed or taken down</span>
        <span className="vu-row-m">This saved opportunity isn&apos;t listed anymore.</span>
      </div>
      <div className="vu-row-end">
        <Button
          size="sm"
          aria-label="Remove a listing that's no longer listed from saved"
          onClick={() => { toggleSaved(id); toast({ title: 'Removed from saved', tone: 'brand' }); }}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

/* ---- saved ------------------------------------------------------------- */

/* Saved, nothing yet: the bookmark it's about in the allowed empty-state
   circle, a short heading and the way to fill the list. */
function SavedEmpty() {
  return (
    <div className="vu-empty" style={S('display:flex;align-items:flex-start;gap:16px')}>
      <span aria-hidden="true" style={S(`flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:${C.mist};color:${C.ink2}`)}>
        <Icon name="bookmark" size={20} />
      </span>
      <div style={S('min-width:0;padding-top:2px')}>
        <h2 style={S(`margin:0;font:600 17px/1.3 ${F.body};color:${C.ink}`)}>Nothing saved yet</h2>
        <p style={S(`margin:4px 0 0;max-width:460px;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>Tap the bookmark on any opportunity to keep it here.</p>
        <p style={S('margin:12px 0 0')}>
          <Link href="/discover" className="vu-link-ul" style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>Browse Discover</Link>
        </p>
      </div>
    </div>
  );
}

export function Saved() {
  const { state } = useSnapshot();
  const allIds = state.saved || [];
  // Nonprofits saved from their page ("np:<ein>") get their own list below.
  const npIds = allIds.filter(isNonprofitId);
  const ids = allIds.filter((id) => !isNonprofitId(id));
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

  // Sort every saved id into what it resolves to, keeping the saved order.
  const entries = ids.map((id) => {
    const opp = getOpportunity(id);
    if (opp) return { id, kind: 'opp', opp, photoKey: { id, cover: opp.img, cause: opp.cause } };
    const listing = cache.get(id);
    if (listing === undefined && UUID_RX.test(String(id))) return { id, kind: 'loading' };
    if (!listing) return { id, kind: 'gone' };
    return { id, kind: 'listing', listing, photoKey: listing };
  });
  const shown = entries.filter((e) => e.kind === 'opp' || e.kind === 'listing');
  const gone = entries.filter((e) => e.kind === 'gone');
  const pending = entries.filter((e) => e.kind === 'loading');
  const photos = usePhotoPicker(shown.map((e) => e.photoKey));

  const loading = !failed && liveIds.length > 0 && (apps === null || liveIds.some((id) => !cache.has(id)));

  let body;
  if (!ids.length) {
    body = npIds.length ? null : <SavedEmpty />;
  } else if (failed) {
    body = <ErrorState title="Couldn't load your saved list" body="Check your connection and try again." onRetry={() => setNonce((n) => n + 1)} />;
  } else if (loading && apps === null) {
    body = <SkeletonRows n={Math.min(ids.length, 3)} h={120} />;
  } else {
    body = (
      <>
        {shown.length || pending.length ? (
          <div className="vu-grid-3">
            {shown.map((e) => {
              if (e.kind === 'opp') {
                const { opp } = e;
                const local = applicationFor(opp.id);
                const st = local && local.st !== 'Withdrawn' ? applicationStatus(local.st).label : '';
                return (
                  <OpportunityCard
                    key={e.id}
                    opp={opp}
                    photo={photos.get(e.id)}
                    saved
                    onToggleSave={() => remove(opp.id, opp.title)}
                    badge={LOCAL_BADGE[st] || ''}
                  />
                );
              }
              const { listing } = e;
              const app = apps ? apps.get(listing.id) : null;
              return (
                <ListingCard
                  key={e.id}
                  {...liveCardProps(listing)}
                  photo={photos.get(listing.id)}
                  saved
                  onToggleSave={() => remove(listing.id, listing.name)}
                  badge={app ? APP_BADGE[app.status] || '' : ''}
                />
              );
            })}
            {pending.map((e) => <SkeletonRows key={e.id} n={1} h={220} />)}
          </div>
        ) : null}
        {gone.length ? (
          <section style={S(shown.length || pending.length ? 'margin-top:56px' : '')} aria-label="No longer listed">
            {shown.length || pending.length ? (
              <h2 className="vu-t-h3s" style={S(`margin:0 0 12px;color:${C.ink}`)}>No longer listed</h2>
            ) : null}
            <ul className="vu-list" style={S('margin:0;padding:0')}>
              {gone.map((e) => <GoneRow key={e.id} id={e.id} />)}
            </ul>
          </section>
        ) : null}
      </>
    );
  }

  const n = ids.length;
  const nNp = npIds.length;
  const subParts = [
    n ? `${n} ${n === 1 ? 'opportunity' : 'opportunities'}` : '',
    nNp ? `${nNp} ${nNp === 1 ? 'nonprofit' : 'nonprofits'}` : '',
  ].filter(Boolean);
  return (
    <div className="vu-page">
      <div style={S('max-width:1040px')}>
        <PageHead title="Saved" sub={subParts.length ? `${subParts.join(' and ')} saved` : ''} />
        <div style={S('margin-top:28px')}>
          {body}
          <SavedNonprofits ids={npIds} withHeading={Boolean(n)} />
        </div>
      </div>
    </div>
  );
}

/* ---- peer project page ---------------------------------------------------- */

function Fact({ label, children, tone }) {
  return (
    <div style={S(`display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid ${C.line}`)}>
      <dt style={S(`margin:0;${META}`)}>{label}</dt>
      <dd style={s(`margin:0;font:600 14px/1.4 ${F.body};text-align:right;font-variant-numeric:tabular-nums`, `color:${tone || C.ink}`)}>{children}</dd>
    </div>
  );
}

export function PeerProject({ id }) {
  const router = useRouter();
  const { state } = useSnapshot();
  const p = (state.peerProjects || []).find((x) => x.id === id);

  if (!p) {
    return (
      <div className="vu-page">
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
  const photo = photoFor({ id: p.id, cover: p.img, cause: p.cause });
  const word = hasApp ? applicationStatus(existing.st).label : '';

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
    <div className="vu-page">
      <button
        type="button"
        onClick={() => router.push('/discover?kind=student')}
        className="h-to-ink"
        style={S(`display:inline-flex;align-items:center;gap:6px;padding:0;border:0;background:none;font:600 14px/1 ${F.body};color:${C.ink2};cursor:pointer`)}
      >
        <Icon name="arrow-left" size={16} /> Back to Discover
      </button>

      <div className="vu-layout-rail" style={S('margin-top:20px')}>
        <div style={S('min-width:0')}>
          <div style={S(`position:relative;aspect-ratio:16 / 9;max-height:420px;width:100%;border-radius:${R.photo};overflow:hidden;background:${C.mist}`)}>
            <ImageSlot src={photo ? photo.src : p.img} position={photo ? photo.pos : undefined} shape="rect" placeholder="project cover" alt="" />
          </div>
          <h1 className="vu-t-h1" style={S(`margin-top:24px;color:${C.ink}`)}>{p.t}</h1>
          <p style={S(`margin:10px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
            {['Student project', p.lead && `led by ${p.lead}`, p.org && `with ${p.org}`, p.cause].filter(Boolean).map((t, i) => (
              <span key={i}>{i ? <Sep /> : null}{t}</span>
            ))}
          </p>
          {p.blurb || p.mission ? (
            <p style={S(`margin:24px 0 0;max-width:640px;font:400 16px/1.6 ${F.body};color:${C.ink};text-wrap:pretty`)}>{p.blurb || p.mission}</p>
          ) : null}
        </div>

        <aside className="vu-sticky" aria-label="Join this project" style={S('min-width:0')}>
          <h2 className="vu-t-h3s" style={S(`margin:0;color:${C.ink}`)}>Next meetup</h2>
          <div style={S('margin-top:16px;display:flex;align-items:center;gap:14px')}>
            {p.next ? <DateBlock date={p.next} size="md" /> : null}
            <div style={S(`font:600 15px/20px ${F.body};color:${C.ink}`)}>{p.next || 'Not scheduled yet'}</div>
          </div>
          <dl style={S('margin:16px 0 0')}>
            {p.role ? <Fact label="Role">{p.role}</Fact> : null}
            {cap ? <Fact label="Team">{`${filled} of ${cap}`}</Fact> : null}
            {cap ? <Fact label="Open spots">{open || 'None right now'}</Fact> : null}
            {p.org ? <Fact label="Confirms hours">{p.org}</Fact> : null}
          </dl>
          {hasApp ? (
            <div style={S(`margin-top:16px;padding-top:16px;border-top:1px solid ${C.line};display:flex;flex-direction:column;align-items:flex-start;gap:8px`)}>
              <StatusText tone={statusTone(word)}>{word}</StatusText>
              <span style={S(META)}>{applicationStatus(existing.st).detail}</span>
            </div>
          ) : (
            <div style={S('margin-top:16px')}>
              <Button variant="primary" size="lg" full onClick={request}>
                {open || !cap ? 'Request a spot' : 'Join the waitlist'}
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
