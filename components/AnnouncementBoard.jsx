'use client';

/* ==========================================================================
   AnnouncementBoard.jsx, a nonprofit's message board
   The organizer posts updates that every member (and anyone with the join
   link) sees. Backed by listings.announcements, so it's cross-user and saved. Pass
   canPost for the leader view; leave it off for the read-only member/public view.
   Plain section: heading, composer, then the posts as divided rows. A rule
   under it separates it from whatever follows.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { Button, IconButton, TextArea } from './ui.jsx';
import { toast, confirmDialog } from '../lib/overlays.js';
import { loadAnnouncements, postAnnouncement, deleteAnnouncement } from '../lib/listings.js';

const MAX_LEN = 1000;

/** "just now", "5 min ago", "3h ago", "2d ago", then "Oct 12". Shared with the
    read-only notes on /join so every board dates posts the same way. */
export function whenLabel(at) {
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
    const ok = await confirmDialog({ title: 'Delete this update?', body: an.body, confirmLabel: 'Delete update', cancelLabel: 'Cancel', tone: 'danger' });
    if (!ok) return;
    const res = await deleteAnnouncement(listingId, an.id);
    if (res.ok) { setItems(res.announcements); toast({ title: 'Update deleted', tone: 'ok' }); }
    else toast({ title: 'Couldn\'t delete', message: 'Check your connection and try again.', tone: 'danger' });
  }

  // Read-only view with nothing to show stays silent.
  if (!canPost && (items === null || items.length === 0)) return null;

  return (
    <section style={S(`padding-bottom:${compact ? 20 : 28}px;border-bottom:1px solid ${C.line}`)}>
      <h2 style={S(`margin:0;font:600 ${compact ? 17 : 20}px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>{title}</h2>

      {canPost ? (
        !listingId ? (
          <p style={S(`margin:10px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
            You can post updates once your project is published.
          </p>
        ) : (
          <div style={S('margin-top:14px;max-width:760px')}>
            <TextArea
              value={draft}
              onChange={(v) => setDraft(v)}
              ariaLabel="Write an update"
              placeholder="e.g. Bring gloves Saturday. We meet at the side door."
              maxLength={MAX_LEN}
              minHeight={72}
            />
            <div style={S('margin-top:10px;display:flex;justify-content:flex-end')}>
              <Button variant="dark" size="sm" busy={busy} disabled={!draft.trim()} aria-disabled={!draft.trim() || busy ? 'true' : undefined} onClick={post}>
                {busy ? 'Posting' : 'Post update'}
              </Button>
            </div>
          </div>
        )
      ) : null}

      {items && items.length ? (
        <div style={S(`margin-top:${canPost ? 18 : 10}px;max-width:760px;display:flex;flex-direction:column`)}>
          {items.map((an, i) => (
            <div key={an.id} style={S(`padding:14px 0;${i ? `border-top:1px solid ${C.line}` : ''}`)}>
              <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px')}>
                <div style={S(`font:400 15px/1.55 ${F.body};color:${C.ink};white-space:pre-wrap;overflow-wrap:anywhere;min-width:0`)}>{an.body}</div>
                {canPost ? (
                  <IconButton
                    icon="trash"
                    label="Delete update"
                    onClick={() => remove(an)}
                    style={{ width: 36, height: 36, flex: 'none', margin: '-8px -8px 0 0' }}
                  />
                ) : null}
              </div>
              <div style={S(`margin-top:6px;font:400 13px/1.3 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>{whenLabel(an.at)}</div>
            </div>
          ))}
        </div>
      ) : canPost ? (
        <p style={S(`margin:14px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>No updates yet. Posts show on your join page and on members' home.</p>
      ) : null}
    </section>
  );
}
