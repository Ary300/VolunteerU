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
import { toast } from '../lib/overlays.js';

const MONO = "'Geist Mono',monospace";

export default function DiscoverListings() {
  const [listings, setListings] = useState(null);
  const [applied, setApplied] = useState(new Set());
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [ls, mine] = await Promise.all([loadDiscoverListings(), loadMyApplications()]);
        setListings(ls);
        setApplied(new Set(mine.map((a) => a.listing_id)));
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
      setApplied((prev) => new Set([...prev, listing.id]));
      toast({ title: `Application sent to ${listing.name}`, message: 'The founder sees it in their workspace.', tone: 'ok' });
    } catch (e) {
      toast({ title: 'We could not send that', message: e.message, tone: 'danger' });
    }
    setBusy(null);
  }

  return (
    <div style={S('margin-bottom:22px')}>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097;margin-bottom:12px`)}>
        Student projects looking for volunteers
      </div>
      <div style={S('display:flex;flex-direction:column;gap:12px')}>
        {listings.map((l) => {
          const has = applied.has(l.id);
          return (
            <div
              key={l.id}
              style={S('padding:18px 20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;display:flex;gap:14px;align-items:flex-start')}
            >
              <div style={S('flex:1;min-width:0')}>
                <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                  <div style={S('font:600 16px/1.25 Geist;letter-spacing:-0.02em')}>{l.name}</div>
                  <span style={S(`padding:4px 8px;border-radius:6px;background:#FDF3E7;font:500 10px/1 ${MONO};color:#8A5A20`)}>Student-led</span>
                </div>
                <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>
                  {[l.cause, l.site].filter(Boolean).join(' · ')}
                  {l.events_hosted ? ` · ${l.events_hosted} events hosted` : ''}
                </div>
                {l.mission ? (
                  <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#57504A;max-width:560px')}>{l.mission}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => apply(l)}
                disabled={has || busy === l.id}
                style={S(
                  'flex:none;padding:0 16px;height:40px;border-radius:11px;font:600 13px/1 Geist;cursor:pointer;' +
                    (has
                      ? 'border:1px solid #E4DDD4;background:#FCFAF8;color:#57504A'
                      : 'border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff'),
                )}
              >
                {has ? '✓ Applied' : busy === l.id ? 'Sending…' : 'Apply'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
