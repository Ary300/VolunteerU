'use client';

/* ==========================================================================
   CrossApplications.jsx — real applications from other volunteers
   Shown at the top of the Lead workspace so a founder never misses someone who
   wants to join. Reads the shared applications table; accept/decline writes
   straight back. Renders nothing when there is nothing pending.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { loadOwnerApplications, setApplicationStatus } from '../lib/listings.js';
import { toast, openModal } from '../lib/overlays.js';
import MessageThread from './MessageThread.jsx';

const MONO = "'Geist Mono',monospace";

export default function CrossApplications({ emptyState = null }) {
  const [apps, setApps] = useState(null);
  const [busy, setBusy] = useState(null);

  async function load() {
    try {
      setApps(await loadOwnerApplications());
    } catch {
      setApps([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (apps === null) return null;
  const pending = apps.filter((a) => a.status === 'pending');
  // As a banner (Overview) this stays silent when empty; as a tab's primary
  // content it can render a caller-provided empty state instead.
  if (!pending.length) return emptyState;

  async function decide(app, status) {
    if (busy) return;
    setBusy(app.id);
    const { ok } = await setApplicationStatus(app.id, status);
    if (ok) {
      toast({
        title: status === 'accepted' ? `${app.applicant_name} is on the crew` : 'Application declined',
        message: status === 'accepted' ? 'They can see they were accepted.' : undefined,
        tone: 'ok',
      });
      load();
    } else {
      toast({ title: 'We could not save that', message: 'Check your connection and try again.', tone: 'danger' });
    }
    setBusy(null);
  }

  return (
    <div style={S('padding:20px;border-radius:16px;border:1px solid #EFE3DC;background:#FAF6F3')}>
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>New applications</div>
      <div style={S('margin-top:5px;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>
        {pending.length} {pending.length === 1 ? 'volunteer wants' : 'volunteers want'} to join
      </div>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
        {pending.map((app) => (
          <div
            key={app.id}
            style={S('padding:14px 16px;border-radius:12px;background:#fff;border:1px solid #F1EBE4;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}
          >
            <div style={S('min-width:0;flex:1')}>
              <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{app.applicant_name}</div>
              <div style={S('margin-top:3px;font:450 12px/1.45 Geist;color:#8A8179')}>
                {app.listings && app.listings.name ? `For ${app.listings.name}` : 'For your project'}
                {app.position ? ` · ${app.position}` : ''}
                {app.note ? ` · “${app.note}”` : ''}
              </div>
            </div>
            <div style={S('display:flex;gap:8px;flex:none')}>
              <button
                type="button"
                onClick={() =>
                  openModal({
                    title: app.applicant_name,
                    subtitle: app.listings && app.listings.name ? `About ${app.listings.name}` : 'Application',
                    Body: () => (
                      <MessageThread applicationId={app.id} recipientId={app.applicant_id} recipientName={app.applicant_name} />
                    ),
                  })
                }
                style={S('padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}
              >
                Message
              </button>
              <button
                type="button"
                onClick={() => decide(app, 'declined')}
                disabled={busy === app.id}
                style={S('padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#8A8179;cursor:pointer')}
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => decide(app, 'accepted')}
                disabled={busy === app.id}
                style={S('padding:0 15px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
