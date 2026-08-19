'use client';

/* ==========================================================================
   VolunteerApplications.jsx — a volunteer's own applications
   Everything they applied to, where each one stands, and a way to message the
   founder — so they never have to leave the app to follow up. Renders nothing
   until they have applied to something real.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { loadMyApplications } from '../lib/listings.js';
import { openModal } from '../lib/overlays.js';
import MessageThread from './MessageThread.jsx';

const MONO = "'Geist Mono',monospace";
const STATUS = {
  pending: { label: 'Under review', bg: '#FDF3E7', color: '#8A5A20' },
  accepted: { label: 'Accepted', bg: '#EAF3EC', color: '#3F6B4E' },
  declined: { label: 'Not this time', bg: '#F5E7E0', color: '#A8482A' },
  withdrawn: { label: 'Withdrawn', bg: '#F6F2EE', color: '#8A8179' },
};

export default function VolunteerApplications({ showEmpty = false }) {
  const [apps, setApps] = useState(null);

  useEffect(() => {
    loadMyApplications()
      .then(setApps)
      .catch(() => setApps([]));
  }, []);

  if (apps === null) return null;
  if (apps.length === 0) {
    if (!showEmpty) return null;
    return (
      <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your applications</div>
        <div style={S('margin-top:12px;padding:14px;border-radius:11px;border:1px dashed #E4DDD4;background:#FCFAF8;font:450 13px/1.55 Geist;color:#8A8179')}>
          No applications yet. Apply to a project and it tracks here — under review, accepted, or not this time.
        </div>
      </div>
    );
  }

  function openThread(app) {
    const name = (app.listings && app.listings.name) || 'the founder';
    openModal({
      title: name,
      subtitle: (STATUS[app.status] || {}).label || 'Application',
      Body: () => <MessageThread applicationId={app.id} recipientId={app.owner_id} recipientName={name} />,
    });
  }

  return (
    <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your applications</div>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
        {apps.map((app) => {
          const st = STATUS[app.status] || STATUS.pending;
          const name = (app.listings && app.listings.name) || 'A project';
          return (
            <div
              key={app.id}
              style={S('padding:14px 16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}
            >
              <div style={S('min-width:0;flex:1')}>
                <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{name}</div>
                <div style={S('margin-top:3px;font:450 12px/1.4 Geist;color:#8A8179')}>
                  {[app.listings && app.listings.cause, app.listings && app.listings.site].filter(Boolean).join(' · ') || 'Student-led project'}
                </div>
              </div>
              <span style={S(`padding:5px 10px;border-radius:8px;font:500 11px/1 ${MONO};background:${st.bg};color:${st.color};flex:none`)}>{st.label}</span>
              <button
                type="button"
                onClick={() => openThread(app)}
                style={S('flex:none;padding:0 14px;height:34px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#57504A;cursor:pointer')}
              >
                Message
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
