'use client';

/* ==========================================================================
   DiscoverListings.jsx, live opportunities posted on VolunteerU
   Organizations and student projects publish listings; volunteers apply from
   here and the application lands with whoever posted it. Search and filters
   run server-side (lib/listings.js). Shows a count from the query, an empty
   state that offers a way out, and an error state with a retry.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, cx, H } from '../lib/style.js';
import { searchListingsPage, matchListings, applyToListing, loadMyApplications } from '../lib/listings.js';
import { toggleSaved } from '../lib/db.js';
import { useSnapshot } from '../lib/store.js';
import { safeUrl } from './MemberProjects.jsx';
import { toast, openModal } from '../lib/overlays.js';
import { SkeletonRows, Icon } from './ui.jsx';
import MessageThread from './MessageThread.jsx';

const MONO = "'Geist Mono',monospace";

/* One status vocabulary everywhere on Discover ("Apply" becomes "Applied"). */
export const STATUS = { pending: 'Applied', accepted: 'Accepted', declined: 'Not accepted', withdrawn: 'Withdrawn' };

// Organizations report their own counts; a student project's counts come from its lead.
function isOfficial(listing) {
  return (listing.org_class || 'student') === 'official';
}

function reportedBy(listing) {
  return isOfficial(listing) ? 'per the organization' : 'per the lead';
}

function applyErrorMessage(e) {
  console.error('[discover] apply failed', e);
  // lib/listings.js throws plain-language messages for these cases.
  if (e && ['DUPLICATE', 'SIGNED_OUT', 'NO_BACKEND', 'APPLY_FAILED'].includes(e.code)) return e.message;
  return "Your application didn't send. Check your connection and try again.";
}

function statusColors(st) {
  if (st === 'accepted') return 'background:#EAF3EC;color:#3F6B4E';
  if (st === 'declined' || st === 'withdrawn') return 'background:#F6F2EE;color:#6B635C';
  return 'background:#FDF3E7;color:#8A5A20';
}

export default function DiscoverListings({
  mode = 'search', interest = '', q = '', causes = [], kind = 'all', place = 'all', near = '', sort = 'recent',
  savedOnly = false, showEmpty = true, heading = '', onClearFilters, onCount, initial = 5,
}) {
  const router = useRouter();
  const { state } = useSnapshot();
  const saved = state.saved || [];
  const [listings, setListings] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [applied, setApplied] = useState(new Map()); // listing_id -> application
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Paging for search mode: `total` is the database's match count (null when
  // it didn't send one), `hasMore` says another page exists.
  const [page, setPage] = useState({ total: null, hasMore: false });
  const [moreState, setMoreState] = useState('idle'); // idle | loading | failed
  const searchKey = useRef('');

  async function refreshMine() {
    try {
      const mine = await loadMyApplications();
      setApplied(new Map(mine.map((a) => [a.listing_id, a])));
    } catch (err) {
      console.error('[discover] could not load your applications', err);
    }
  }

  const causeKey = (causes || []).join('|');
  // Debounced server-side search: filtering runs in Postgres, not the browser.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setExpanded(false);
    setMoreState('idle');
    searchKey.current = `${mode}#${interest}#${q}#${causeKey}#${kind}#${place}#${near}#${sort}#${nonce}`;
    const run = async () => {
      try {
        let ls;
        let meta = { total: null, hasMore: false };
        if (mode === 'match') {
          ls = await matchListings({ interest, causes, near });
        } else {
          const res = await searchListingsPage({ q, causes, kind, place, near, sort });
          ls = res.rows;
          meta = { total: res.total, hasMore: res.hasMore };
        }
        if (!alive) return;
        setFailed(false);
        setListings(ls || []);
        setPage(meta);
        setLoading(false);
        refreshMine();
      } catch (err) {
        console.error('[discover] listings search failed', err);
        if (alive) {
          setFailed(true);
          setListings([]);
          setLoading(false);
        }
      }
    };
    const t = setTimeout(run, (mode !== 'match' && (q || near)) ? 280 : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, interest, q, causeKey, kind, place, near, sort, nonce]);

  const shown = listings === null ? null : savedOnly ? listings.filter((l) => saved.includes(l.id)) : listings;
  /* The number of matches to print. Search mode uses the database's total, so
     the count isn't capped at one page. Saved-only can only check the pages
     loaded so far, so it gives no number while more pages exist. */
  const count = shown === null || failed
    ? null
    : savedOnly
      ? (page.hasMore ? null : shown.length)
      : (page.total ?? shown.length);

  useEffect(() => {
    if (onCount) onCount(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  /* Loads the next page of search results and appends it. A result for an
     older search (the filters changed while it loaded) is dropped. */
  async function loadMore() {
    if (mode === 'match' || moreState === 'loading' || !listings) return;
    const key = searchKey.current;
    setMoreState('loading');
    try {
      const res = await searchListingsPage({ q, causes, kind, place, near, sort, offset: listings.length });
      if (key !== searchKey.current) return;
      setListings((prev) => {
        const seen = new Set((prev || []).map((l) => l.id));
        return [...(prev || []), ...res.rows.filter((l) => !seen.has(l.id))];
      });
      setPage({ total: res.total, hasMore: res.hasMore && res.rows.length > 0 });
      setExpanded(true);
      setMoreState('idle');
      refreshMine();
    } catch (err) {
      console.error('[discover] loading more opportunities failed', err);
      if (key === searchKey.current) setMoreState('failed');
    }
  }

  const active = Boolean(q || (causes || []).length || kind !== 'all' || place !== 'all' || near || savedOnly);
  const title = heading || (mode === 'match' ? 'Based on your causes' : near ? `Opportunities near ${near}` : 'Opportunities anywhere');

  /* Sends the application with its role, like /join does. A listing with one
     role fills it in; with several, the row opens the details dialog so the
     volunteer picks one there. Returns true once the application is sent. */
  async function apply(listing, api, position = '') {
    const positions = listing.positions || [];
    const role = position || (positions.length === 1 ? positions[0].t : '');
    if (positions.length > 1 && !role) {
      details(listing);
      return false;
    }
    if (busy) return false;
    setBusy(listing.id);
    let sent = false;
    try {
      await applyToListing(listing, { position: role || undefined, note: '' });
      sent = true;
      await refreshMine();
      if (api) api.close();
      toast({ title: 'Applied', message: role ? `${listing.name} will see you applied as ${role}.` : `${listing.name} will see your application.`, tone: 'ok' });
    } catch (e) {
      toast({ title: "Couldn't apply", message: applyErrorMessage(e), tone: 'danger' });
    }
    setBusy(null);
    return sent;
  }

  function save(listing) {
    const now = toggleSaved(listing.id);
    toast(now
      ? { title: 'Saved', message: listing.name, tone: 'ok', actionLabel: 'Undo', onAction: () => toggleSaved(listing.id) }
      : { title: 'Removed from saved', message: listing.name, tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(listing.id) });
  }

  function message(listing, app) {
    openModal({
      title: `Message ${listing.name}`,
      subtitle: STATUS[app.status] || 'Applied',
      Body: () => <MessageThread applicationId={app.id} recipientId={listing.owner_id} recipientName={listing.name} />,
    });
  }

  function details(listing) {
    const app = applied.get(listing.id);
    const claims = [
      listing.events_hosted ? `${listing.events_hosted} ${listing.events_hosted === 1 ? 'event' : 'events'} hosted` : '',
      listing.approx_volunteers ? `about ${listing.approx_volunteers} volunteers so far` : '',
    ].filter(Boolean);
    const facts = claims.length ? `${claims.join(' and ')}, ${reportedBy(listing)}` : '';
    const positions = listing.positions || [];
    const pickRole = !app && positions.length > 1;
    openModal({
      title: listing.name,
      subtitle: [listing.cause, listing.site].filter(Boolean).join(', ') || (isOfficial(listing) ? 'Organization' : 'Student project'),
      Body: function ListingDetails({ api }) {
        const [role, setRole] = useState('');
        const [roleError, setRoleError] = useState('');
        const [sending, setSending] = useState(false);
        const send = async () => {
          if (sending) return;
          if (pickRole && !role) {
            setRoleError('Choose a role.');
            return;
          }
          setSending(true);
          const sent = await apply(listing, api, role);
          if (!sent) setSending(false);
        };
        return (
        <div style={S('display:flex;flex-direction:column;gap:16px;min-width:0;overflow-wrap:anywhere')}>
          {listing.verified ? (
            <div style={S('display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:#EAF3EC;font:500 13px/1.4 Geist;color:#3F6B4E')}>
              <Icon name="check" size={14} /> Verified. A VolunteerU reviewer checked this organization by hand.
            </div>
          ) : null}
          {listing.mission ? <div style={S('font:400 15px/1.6 Geist;color:#332D28')}>{listing.mission}</div> : null}
          {listing.bio ? <div style={S('font:400 14px/1.6 Geist;color:#57504A')}>{listing.bio}</div> : null}
          {facts ? <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>{facts.charAt(0).toUpperCase() + facts.slice(1)}</div> : null}
          {pickRole ? (
            <div role="radiogroup" aria-labelledby={`vu-roles-${listing.id}`}>
              <div id={`vu-roles-${listing.id}`} style={S('font:600 14px/1.2 Geist;color:#1A1714')}>Which role?</div>
              <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:8px')}>
                {positions.map((pos) => {
                  const on = role === pos.t;
                  return (
                    <button
                      key={pos.id || pos.t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => { setRole(pos.t); setRoleError(''); }}
                      className={cx(on ? '' : H.chip, H.press)}
                      style={S(`padding:12px 14px;border-radius:11px;text-align:left;cursor:pointer;border:1px solid ${on ? '#C2603C' : '#F1EBE4'};background:${on ? '#fff' : '#FCFAF8'}`)}
                    >
                      <span style={S(`display:block;font:600 14px/1.2 Geist;color:${on ? '#A8482A' : '#1A1714'}`)}>{pos.t}</span>
                      {pos.m ? <span style={S('display:block;margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{String(pos.m).replace(/\s*·\s*/g, ', ')}</span> : null}
                    </button>
                  );
                })}
              </div>
              {roleError ? <div className="vu-err" role="alert">{roleError}</div> : null}
            </div>
          ) : positions.length ? (
            <div>
              <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>Roles they need</div>
              <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:8px')}>
                {listing.positions.map((pos) => (
                  <div key={pos.id || pos.t} style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                    <div style={S('font:600 14px/1.2 Geist')}>{pos.t}</div>
                    {pos.m ? <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{String(pos.m).replace(/\s*·\s*/g, ', ')}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {safeUrl(listing.website) ? (
            <a href={safeUrl(listing.website)} target="_blank" rel="noreferrer noopener" className={H.link} style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#C2603C;text-decoration:none')}>
              Visit their website <Icon name="external" size={13} />
            </a>
          ) : null}
          <div style={S('display:flex;gap:10px;flex-wrap:wrap;margin-top:2px')}>
            {app ? (
              <button type="button" onClick={() => message(listing, app)} className={cx(H.secondary, H.press)} style={S('padding:0 16px;height:44px;border-radius:12px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer')}>
                Message {listing.name}
              </button>
            ) : (
              <button type="button" onClick={send} disabled={sending} className={cx(H.primary, H.press)} style={S('padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer')}>
                {sending ? 'Applying' : 'Apply'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { api.close(); router.push(`/join/${listing.id}`); }}
              className={cx(H.secondary, H.press)}
              style={S('padding:0 16px;height:44px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#332D28;cursor:pointer')}
            >
              Open full page
            </button>
          </div>
        </div>
        );
      },
    });
  }

  const header = (
    <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px')}>
      <h2 style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.02em;color:#1A1714')}>{title}</h2>
      {!onCount && count ? (
        <div style={S(`font:500 12px/1 ${MONO};color:#8A8179`)}>{count} {count === 1 ? 'opportunity' : 'opportunities'}</div>
      ) : null}
    </div>
  );

  if (shown === null) {
    if (mode === 'match') return null;
    return (
      <section aria-label={title} aria-busy="true" style={S('margin-bottom:22px')}>
        {header}
        <SkeletonRows n={2} h={96} />
      </section>
    );
  }

  if (failed) {
    if (mode === 'match') return null;
    return (
      <section aria-label={title} aria-busy={loading ? 'true' : undefined} style={S('margin-bottom:22px')}>
        {header}
        <div role="alert" style={S('padding:26px 22px;border-radius:14px;border:1px solid #EFE3DC;background:#FCFAF8;text-align:center')}>
          <div style={S('font:600 15px/1.3 Geist;color:#1A1714')}>Couldn&apos;t load opportunities</div>
          <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#8A8179')}>Check your connection and try again.</div>
          <button type="button" onClick={() => setNonce((n) => n + 1)} className={cx(H.secondary, H.press)} style={S('margin-top:14px;padding:0 16px;height:38px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (shown.length === 0) {
    // The match feed stays silent; its mount point carries its own way forward.
    if (mode === 'match' || !showEmpty) return null;
    const emptyTitle = savedOnly ? 'Nothing saved matches' : active ? (q ? `Nothing for “${q}” yet` : 'Nothing matches these filters') : 'No opportunities posted yet';
    // Saved-only checks the loaded pages; when more exist, offer to look there.
    const searchMore = savedOnly && page.hasMore && mode !== 'match';
    const emptyBody = searchMore
      ? moreState === 'failed'
        ? "Couldn't load more opportunities. Check your connection and try again."
        : `None of the first ${listings.length} opportunities are saved. More are posted.`
      : savedOnly
      ? 'Save an opportunity from its row and it shows up here.'
      : active
        ? near ? 'Try a broader word or clear the location.' : 'Try a broader word or clear a filter.'
        : 'No student projects yet. Start one and it shows up here.';
    const cta = searchMore ? (moreState === 'loading' ? 'Checking more opportunities' : 'Check more opportunities') : active && onClearFilters ? 'Clear filters' : !active ? 'Start a student project' : '';
    const onCta = searchMore ? loadMore : active ? onClearFilters : () => router.push('/create');
    return (
      <section aria-label={title} aria-busy={loading ? 'true' : undefined} style={S('margin-bottom:22px')}>
        {header}
        <div style={S('padding:26px 22px;border-radius:14px;border:1px dashed #E0D8CF;background:#FCFAF8;text-align:center')}>
          <div style={S('font:600 15px/1.3 Geist;color:#1A1714')}>{emptyTitle}</div>
          <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#8A8179')}>{emptyBody}</div>
          {cta ? (
            <button type="button" onClick={onCta} disabled={searchMore && moreState === 'loading'} className={cx(H.secondary, H.press)} style={S('margin-top:14px;padding:0 16px;height:38px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
              {cta}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section aria-label={title} aria-busy={loading ? 'true' : undefined} style={S('margin-bottom:22px')}>
      {header}
      <div style={S(`display:flex;flex-direction:column;gap:12px;transition:opacity .16s ease;opacity:${loading ? 0.55 : 1}`)}>
        {(expanded ? shown : shown.slice(0, initial)).map((l) => {
          const app = applied.get(l.id);
          const isSaved = saved.includes(l.id);
          const official = isOfficial(l);
          const meta = [l.cause, l.site, l.events_hosted ? `${l.events_hosted} ${l.events_hosted === 1 ? 'event' : 'events'} hosted, ${reportedBy(l)}` : ''].filter(Boolean).join(', ');
          return (
            <div
              key={l.id}
              className="vu-stack vu-stack-gap"
              style={S('padding:18px 20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;display:flex;gap:14px;align-items:flex-start')}
            >
              <button
                type="button"
                onClick={() => details(l)}
                aria-label={`See details for ${l.name}`}
                style={S('flex:1;min-width:0;text-align:left;background:none;border:0;padding:0;cursor:pointer')}
              >
                <span style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                  <span style={S('min-width:0;font:600 16px/1.25 Geist;letter-spacing:-0.02em;color:#1A1714;overflow-wrap:anywhere')}>{l.name}</span>
                  <span style={S(`padding:4px 8px;border-radius:6px;font:500 10px/1 ${MONO};${official ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FDF3E7;color:#8A5A20'}`)}>
                    {official ? 'Nonprofit' : 'Student project'}
                  </span>
                  {l.verified ? (
                    <span style={S(`display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 6px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>
                      <Icon name="check" size={11} stroke={2.4} /> Verified
                    </span>
                  ) : null}
                  {app ? (
                    <span style={S(`padding:4px 8px;border-radius:6px;font:500 10px/1 ${MONO};${statusColors(app.status)}`)}>
                      {STATUS[app.status] || 'Applied'}
                    </span>
                  ) : null}
                </span>
                {meta ? <span style={S('display:block;margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179;overflow-wrap:anywhere')}>{meta}</span> : null}
                {l.mission ? (
                  <span style={S('display:block;margin-top:8px;font:450 13px/1.5 Geist;color:#57504A;max-width:560px;overflow-wrap:anywhere')}>{l.mission}</span>
                ) : null}
              </button>
              <div style={S('flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                <button
                  type="button"
                  onClick={() => save(l)}
                  aria-pressed={isSaved ? 'true' : 'false'}
                  aria-label={isSaved ? `Remove ${l.name} from saved` : `Save ${l.name}`}
                  className={cx(H.secondary, H.press)}
                  style={S(`display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:${isSaved ? '#A8482A' : '#57504A'};cursor:pointer`)}
                >
                  <Icon name="bookmark" size={13} filled={isSaved} color={isSaved ? '#C2603C' : undefined} />
                  {isSaved ? 'Saved' : 'Save'}
                </button>
                {app ? (
                  <button
                    type="button"
                    onClick={() => message(l, app)}
                    className={cx(H.secondary, H.press)}
                    style={S('padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}
                  >
                    Message
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => apply(l)}
                    disabled={busy === l.id}
                    aria-label={`Apply to ${l.name}`}
                    className={cx(H.primary, H.press)}
                    style={S('padding:0 16px;height:36px;border-radius:10px;font:600 13px/1 Geist;cursor:pointer;border:1px solid #A8482A;background:#C2603C;color:#fff')}
                  >
                    {busy === l.id ? 'Applying' : 'Apply'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!expanded && shown.length > initial ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cx(H.secondary, H.press)}
          style={S('margin-top:12px;width:100%;padding:0 16px;height:42px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#332D28;cursor:pointer')}
        >
          {page.hasMore ? 'Show more opportunities' : `Show all ${shown.length} opportunities`}
        </button>
      ) : (expanded || shown.length <= initial) && page.hasMore && mode !== 'match' ? (
        <div style={S('margin-top:12px')}>
          <button
            type="button"
            onClick={loadMore}
            disabled={moreState === 'loading'}
            aria-busy={moreState === 'loading' ? 'true' : undefined}
            className={cx(H.secondary, H.press)}
            style={S('width:100%;padding:0 16px;height:42px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#332D28;cursor:pointer')}
          >
            {moreState === 'loading' ? 'Loading more opportunities' : 'Show more opportunities'}
          </button>
          <div aria-live="polite" style={S('margin-top:8px;text-align:center;font:450 12px/1.4 Geist;color:#8A8179')}>
            {moreState === 'failed'
              ? "Couldn't load more opportunities. Check your connection and try again."
              : !savedOnly && page.total
                ? `Showing ${listings.length} of ${page.total}`
                : ''}
          </div>
        </div>
      ) : null}
    </section>
  );
}
