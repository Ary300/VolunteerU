'use client';

/* ==========================================================================
   DiscoverListings.jsx — real student projects from other founders
   The cross-user half of discovery: projects other people published, that this
   volunteer can apply to in one tap. The application lands in the founder's
   workspace. Renders nothing until there is something real to show.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { loadDiscoverListings, applyToListing, loadMyApplications } from '../lib/listings.js';
import { toast, openModal } from '../lib/overlays.js';
import MessageThread from './MessageThread.jsx';

const MONO = "'Geist Mono',monospace";

export default function DiscoverListings() {
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

  useEffect(() => {
    (async () => {
      try {
        const ls = await loadDiscoverListings();
        setListings(ls);
        await refreshMine();
      } catch {
        setListings([]);
      }
    })();
  }, []);

  if (listings === null || listings.length === 0) return null;

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
          {listing.website ? (
            <a href={listing.website} target="_blank" rel="noreferrer noopener" style={S('font:500 13px/1 Geist;color:#C2603C;text-decoration:none')}>
              Visit their page ↗
            </a>
          ) : null}
          <div style={S('display:flex;gap:10px;margin-top:2px')}>
            {app ? (
              <button type="button" onClick={() => message(listing, app)} style={S('padding:0 16px;height:44px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer')}>Message the founder</button>
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
        Student projects looking for volunteers
      </div>
      <div style={S('display:flex;flex-direction:column;gap:12px')}>
        {listings.map((l) => {
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
                  <span style={S(`padding:4px 8px;border-radius:6px;background:#FDF3E7;font:500 10px/1 ${MONO};color:#8A5A20`)}>Student-led</span>
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
                    style={S('padding:0 14px;height:34px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#57504A;cursor:pointer')}
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
