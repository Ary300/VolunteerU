'use client';

/* ==========================================================================
   DiscoverListings.jsx, real student projects from other founders
   The cross-user half of discovery: projects other people published, that this
   volunteer can apply to in one tap. The application lands in the founder's
   workspace. Renders nothing until there is something real to show.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { searchListings, matchListings, applyToListing, loadMyApplications } from '../lib/listings.js';
import { safeUrl } from './MemberProjects.jsx';
import { toast, openModal } from '../lib/overlays.js';
import { SkeletonRows } from './ui.jsx';
import MessageThread from './MessageThread.jsx';

const MONO = "'Geist Mono',monospace";

export default function DiscoverListings({ mode = 'search', interest = '', q = '', causes = [], kind = 'all', place = 'all', near = '', sort = 'recent' }) {
  const [listings, setListings] = useState(null);
  const [applied, setApplied] = useState(new Map()); // listing_id -> application
  const [busy, setBusy] = useState(null);

  async function refreshMine() {
    try {
      const mine = await loadMyApplications();
      setApplied(new Map(mine.map((a) => [a.listing_id, a])));
    } catch {
      /* keep what we have */
    }
  }

  const causeKey = (causes || []).join('|');
  // Debounced server-side search: filtering runs in Postgres, not the browser.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const ls = mode === 'match'
          ? await matchListings({ interest, causes, near })
          : await searchListings({ q, causes, kind, place, near, sort });
        if (!alive) return;
        setListings(ls);
        refreshMine();
      } catch {
        if (alive) setListings([]);
      }
    };
    const t = setTimeout(run, (mode !== 'match' && (q || near)) ? 280 : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, interest, q, causeKey, kind, place, near, sort]);

  const active = Boolean(q || (causes || []).length || kind !== 'all' || place !== 'all' || near);

  if (listings === null) {
    return mode === 'match' ? null : <div style={S('margin-bottom:22px')}><SkeletonRows n={2} h={96} /></div>;
  }
  const shown = listings;
  if (shown.length === 0) {
    // The match feed stays silent, its mount points (Home, Discover) each carry
    // their own forward CTA, so a blank match section is never a dead end.
    if (mode === 'match') return null;
    return (
      <div style={S('margin-bottom:22px;padding:28px 22px;border-radius:14px;border:1px dashed #E0D8CF;background:#FCFAF8;text-align:center')}>
        <div style={S('font:600 15px/1.3 Geist;color:#1A1714')}>
          {active ? 'No projects match that yet' : 'No open projects yet'}
        </div>
        <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#8A8179')}>
          {active
            ? 'Try a broader search, clear a filter, or check back, new projects are published all the time.'
            : 'Be the first wave, new student projects and nonprofits are posting openings now. Check back soon, or start your own.'}
        </div>
      </div>
    );
  }

  async function apply(listing) {
    if (busy) return;
    setBusy(listing.id);
    try {
      await applyToListing(listing, { note: '' });
      await refreshMine();
      toast({ title: `Application sent to ${listing.name}`, message: 'The founder sees it in their workspace.', tone: 'ok' });
    } catch (e) {
      toast({ title: 'We could not send that', message: e.message, tone: 'danger' });
    }
    setBusy(null);
  }

  const STATUS = { pending: 'Under review', accepted: 'Accepted', declined: 'Not this time', withdrawn: 'Withdrawn' };

  function message(listing, app) {
    openModal({
      title: listing.name,
      subtitle: STATUS[app.status] || 'Application',
      Body: () => <MessageThread applicationId={app.id} recipientId={listing.owner_id} recipientName={listing.name} />,
    });
  }

  function details(listing) {
    const app = applied.get(listing.id);
    openModal({
      title: listing.name,
      subtitle: [listing.cause, listing.site].filter(Boolean).join(' · ') || 'Student-led project',
      Body: () => (
        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          {listing.verified ? (
            <div style={S(`display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:#EAF3EC;font:500 12px/1.3 Geist;color:#3F6B4E`)}>
              <span aria-hidden="true">✓</span> Verified organization, a reviewer confirmed this group and a named staff contact.
            </div>
          ) : null}
          {(listing.events_hosted || listing.approx_volunteers) ? (
            <div style={S('display:flex;gap:10px')}>
              {listing.events_hosted ? (
                <div style={S('flex:1;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
                  <div style={S('font:600 22px/1 Geist;letter-spacing:-0.03em')}>{listing.events_hosted}</div>
                  <div style={S('margin-top:5px;font:450 12px/1 Geist;color:#8A8179')}>events hosted</div>
                </div>
              ) : null}
              {listing.approx_volunteers ? (
                <div style={S('flex:1;padding:14px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
                  <div style={S('font:600 22px/1 Geist;letter-spacing:-0.03em')}>{listing.approx_volunteers}</div>
                  <div style={S('margin-top:5px;font:450 12px/1 Geist;color:#8A8179')}>volunteers reached</div>
                </div>
              ) : null}
            </div>
          ) : null}
          {listing.mission ? (
            <div>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Mission</div>
              <div style={S('margin-top:8px;font:400 15px/1.6 Geist;color:#332D28')}>{listing.mission}</div>
            </div>
          ) : null}
          {listing.bio ? (
            <div style={S('font:400 14px/1.6 Geist;color:#57504A')}>{listing.bio}</div>
          ) : null}
          {(listing.positions || []).length ? (
            <div>
              <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Roles they need</div>
              <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:8px')}>
                {listing.positions.map((pos) => (
                  <div key={pos.id || pos.t} style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                    <div style={S('font:600 14px/1.2 Geist')}>{pos.t}</div>
                    {pos.m ? <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{pos.m}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {safeUrl(listing.website) ? (
            <a href={safeUrl(listing.website)} target="_blank" rel="noreferrer noopener" style={S('font:500 13px/1 Geist;color:#C2603C;text-decoration:none')}>
              Visit their page ↗
            </a>
          ) : null}
          <div style={S('display:flex;gap:10px;margin-top:2px')}>
            {app ? (
              <button type="button" onClick={() => message(listing, app)} style={S('padding:0 16px;height:44px;border-radius:12px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer')}>Message the founder</button>
            ) : (
              <button type="button" onClick={() => apply(listing)} style={S('padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}>Apply to join</button>
            )}
          </div>
        </div>
      ),
    });
  }

  return (
    <div style={S('margin-bottom:22px')}>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097;margin-bottom:12px`)}>
        {mode === 'match' ? 'Matched to what you told us' : kind === 'official' ? 'Nonprofits looking for volunteers' : kind === 'student' ? 'Student projects looking for volunteers' : 'Projects looking for volunteers'}
      </div>
      <div style={S('display:flex;flex-direction:column;gap:12px')}>
        {shown.map((l) => {
          const app = applied.get(l.id);
          return (
            <div
              key={l.id}
              style={S('padding:18px 20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;display:flex;gap:14px;align-items:flex-start')}
            >
              <button
                type="button"
                onClick={() => details(l)}
                aria-label={`Learn about ${l.name}`}
                style={S('flex:1;min-width:0;text-align:left;background:none;border:0;padding:0;cursor:pointer')}
              >
                <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                  <div style={S('font:600 16px/1.25 Geist;letter-spacing:-0.02em;color:#1A1714')}>{l.name}</div>
                  {(l.org_class || 'student') === 'official' ? (
                    <span style={S(`padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>Nonprofit</span>
                  ) : (
                    <span style={S(`padding:4px 8px;border-radius:6px;background:#FDF3E7;font:500 10px/1 ${MONO};color:#8A5A20`)}>Student-led</span>
                  )}
                  {l.verified ? (
                    <span style={S(`padding:4px 8px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>✓ Verified</span>
                  ) : null}
                </div>
                <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>
                  {[l.cause, l.site].filter(Boolean).join(' · ')}
                  {l.events_hosted ? ` · ${l.events_hosted} events hosted` : ''}
                </div>
                {l.mission ? (
                  <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#57504A;max-width:560px')}>{l.mission}</div>
                ) : null}
              </button>
              {app ? (
                <div style={S('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px')}>
                  <span style={S(`padding:5px 10px;border-radius:8px;font:500 11px/1 ${MONO};background:${app.status === 'accepted' ? '#EAF3EC' : app.status === 'declined' ? '#F5E7E0' : '#FDF3E7'};color:${app.status === 'accepted' ? '#3F6B4E' : app.status === 'declined' ? '#A8482A' : '#8A5A20'}`)}>
                    {STATUS[app.status] || 'Applied'}
                  </span>
                  <button
                    type="button"
                    onClick={() => message(l, app)}
                    style={S('padding:0 14px;height:34px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}
                  >
                    Message
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => apply(l)}
                  disabled={busy === l.id}
                  style={S('flex:none;padding:0 16px;height:40px;border-radius:11px;font:600 13px/1 Geist;cursor:pointer;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff')}
                >
                  {busy === l.id ? 'Sending…' : 'Apply'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
