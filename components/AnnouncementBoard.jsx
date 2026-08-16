'use client';

/* ==========================================================================
   AnnouncementBoard.jsx — a nonprofit's message board
   The founder posts updates that every member (and anyone with the join link)
   sees. Backed by listings.announcements, so it's cross-user and saved. Pass
   canPost for the leader view; leave it off for the read-only member/public view.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { Pressable } from './ui.jsx';
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
    if (ok) { setItems(announcements); setDraft(''); toast({ title: 'Posted to the board', message: 'Everyone on your team can see it.', tone: 'ok' }); }
    else toast({ title: 'Could not post', tone: 'danger' });
  }

  async function remove(an) {
    const ok = await confirmDialog({ title: 'Delete this post?', body: an.body, confirmLabel: 'Delete' });
    if (!ok) return;
    const res = await deleteAnnouncement(listingId, an.id);
    if (res.ok) setItems(res.announcements);
  }

  // Read-only view with nothing to show stays silent.
  if (!canPost && (items === null || items.length === 0)) return null;

  return (
    <div style={S(`padding:${compact ? '18px' : '22px'};border-radius:16px;border:1px solid #E8E1D9;background:#fff`)}>
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>{title}</div>

      {canPost ? (
        !listingId ? (
          <div style={S('margin-top:12px;padding:12px 14px;border-radius:11px;background:#FAF6F3;border:1px solid #EFE3DC;font:450 12px/1.5 Geist;color:#8A5A20')}>
            Your board turns on once the project finishes publishing.
          </div>
        ) : (
          <div style={S('margin-top:12px')}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Post an update for your team — a reminder, a thank-you, what's next."
              className={H.input}
              maxLength={1000}
              style={S('display:block;width:100%;padding:12px 14px;border-radius:12px;border:1px solid #E8E1D9;background:#FCFAF8;min-height:64px;font:450 14px/1.55 Geist;color:#332D28;resize:vertical')}
            />
            <div style={S('margin-top:10px;display:flex;justify-content:flex-end')}>
              <Pressable
                label="Post to the board"
                disabled={busy || !draft.trim()}
                onClick={post}
                className={cx(H.primary, H.press)}
                style={s('display:inline-flex;align-items:center;gap:8px;padding:0 16px;height:38px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer', !draft.trim() ? 'opacity:.55' : '')}
              >
                {busy ? 'Posting…' : 'Post'}
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
                  <Pressable label="Delete post" onClick={() => remove(an)} className={cx(H.toInk, H.press)} style={S('flex:none;font:500 13px/1 Geist;color:#A9A097;cursor:pointer;padding:0 2px')}>✕</Pressable>
                ) : null}
              </div>
              <div style={S(`margin-top:8px;font:500 10px/1 ${MONO};color:#A9A097`)}>{whenLabel(an.at)}</div>
            </div>
          ))
        ) : canPost ? (
          <div style={S('font:450 13px/1.5 Geist;color:#8A8179')}>No posts yet. Your first update shows here and on every member's home screen.</div>
        ) : null}
      </div>
    </div>
  );
}
