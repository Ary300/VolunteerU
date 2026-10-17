'use client';

/* ==========================================================================
   AnnouncementBoard.jsx, a nonprofit's message board
   The organizer posts updates that every member (and anyone with the join
   link) sees. Backed by listings.announcements, so it's cross-user and saved. Pass
   canPost for the leader view; leave it off for the read-only member/public view.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { Icon, Pressable } from './ui.jsx';
import { toast, confirmDialog } from '../lib/overlays.js';
import { loadAnnouncements, postAnnouncement, deleteAnnouncement } from '../lib/listings.js';

const MONO = "'Geist Mono',monospace";

function whenLabel(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AnnouncementBoard({ listingId, canPost = false, compact = false, title = 'Announcements' }) {
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!listingId) { setItems([]); return; }
    loadAnnouncements(listingId).then(setItems).catch(() => setItems([]));
  }, [listingId]);

  async function post() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const { ok, announcements } = await postAnnouncement(listingId, body);
    setBusy(false);
    if (ok) { setItems(announcements); setDraft(''); toast({ title: 'Update posted', message: 'It shows on your join page and on members\' home.', tone: 'ok' }); }
    else toast({ title: 'Couldn\'t post', message: 'Check your connection and try again.', tone: 'danger' });
  }

  async function remove(an) {
    const ok = await confirmDialog({ title: 'Delete this update?', body: an.body, confirmLabel: 'Delete update', cancelLabel: 'Keep it' });
    if (!ok) return;
    const res = await deleteAnnouncement(listingId, an.id);
    if (res.ok) { setItems(res.announcements); toast({ title: 'Update deleted', tone: 'ok' }); }
    else toast({ title: 'Couldn\'t delete', message: 'Check your connection and try again.', tone: 'danger' });
  }

  // Read-only view with nothing to show stays silent.
  if (!canPost && (items === null || items.length === 0)) return null;

  return (
    <div style={S(`padding:${compact ? '18px' : '22px'};border-radius:16px;border:1px solid #E8E1D9;background:#fff`)}>
      <h2 style={S('margin:0;font:600 15px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>{title}</h2>

      {canPost ? (
        !listingId ? (
          <div style={S('margin-top:12px;padding:12px 14px;border-radius:11px;background:#FAF6F3;border:1px solid #EFE3DC;font:450 12px/1.5 Geist;color:#8A5A20')}>
            You can post updates once your project is published.
          </div>
        ) : (
          <div style={S('margin-top:12px')}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Write an update"
              placeholder="e.g. Bring gloves Saturday. We meet at the side door."
              className={H.input}
              maxLength={1000}
              style={S('display:block;width:100%;padding:12px 14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:64px;font:450 14px/1.55 Geist;color:#332D28;resize:vertical')}
            />
            <div style={S('margin-top:10px;display:flex;justify-content:flex-end')}>
              <Pressable
                label="Post update"
                disabled={busy || !draft.trim()}
                onClick={post}
                className={cx(H.primary, H.press)}
                style={s('display:inline-flex;align-items:center;gap:8px;padding:0 16px;height:38px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer', !draft.trim() ? 'opacity:.55' : '')}
              >
                {busy ? 'Posting' : 'Post update'}
              </Pressable>
            </div>
          </div>
        )
      ) : null}

      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
        {items && items.length ? (
          items.map((an) => (
            <div key={an.id} style={S('padding:14px 16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
              <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:10px')}>
                <div style={S('font:450 14px/1.6 Geist;color:#332D28;white-space:pre-wrap;min-width:0')}>{an.body}</div>
                {canPost ? (
                  <Pressable label="Delete update" onClick={() => remove(an)} className={cx(H.toInk, H.press)} style={S('flex:none;display:grid;place-items:center;width:28px;height:28px;margin:-4px -6px 0 0;border-radius:8px;color:#8A8179;cursor:pointer')}>
                    <Icon name="x" size={14} />
                  </Pressable>
                ) : null}
              </div>
              <div style={S(`margin-top:8px;font:500 10px/1 ${MONO};color:#8A8179`)}>{whenLabel(an.at)}</div>
            </div>
          ))
        ) : canPost ? (
          <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>No updates yet. Posts show on your join page and on members' home.</div>
        ) : null}
      </div>
    </div>
  );
}
