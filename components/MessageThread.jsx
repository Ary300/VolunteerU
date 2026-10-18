'use client';

/* ==========================================================================
   MessageThread.jsx, a conversation tied to an application
   Opened from either side (organizer or volunteer). Loads the thread, polls for
   replies every few seconds, and sends. Messages stay inside the app.
   Your own messages sit on the right in ink, theirs on the left in mist.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { S, s } from '../lib/style.js';
import { C, F, R } from '../lib/tokens.js';
import { toast } from '../lib/overlays.js';
import { TemplatesButton } from './AnnouncementBoard.jsx';
import { loadMessages, sendMessage, myId as getMyId } from '../lib/listings.js';
import { Button, Icon } from './ui.jsx';

const POLL_MS = 5000;
// Two messages from the same person this close together read as one group,
// so only the last of them carries a timestamp.
const GROUP_MS = 5 * 60 * 1000;

/** "Oct 17, 3:04 PM" for a message's created_at, or '' when it can't be read. */
function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** True when `next` continues `m`'s group (same sender, a few minutes apart). */
function sameGroup(m, next) {
  if (!m || !next || m.sender_id !== next.sender_id) return false;
  const a = new Date(m.created_at).getTime();
  const b = new Date(next.created_at).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && b - a < GROUP_MS;
}

const NOTE = `margin:auto;max-width:300px;text-align:center;font:400 14px/1.5 ${F.body};color:${C.ink2}`;

/* `templates` ([{ key, label, text }]) adds a Templates menu that fills the composer. */
export default function MessageThread({ applicationId, recipientId, recipientName = 'them', templates = null }) {
  const [msgs, setMsgs] = useState([]);
  const [me, setMe] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // 'loading' until the first load returns, 'error' if it failed and nothing is shown yet.
  const [status, setStatus] = useState('loading');
  const listRef = useRef(null);

  async function load() {
    try {
      const rows = await loadMessages(applicationId);
      setMsgs(rows || []);
      setStatus('ok');
    } catch (err) {
      // Keep whatever is already on screen; only show the error when there is nothing.
      console.error('[messages] could not load thread', err);
      setStatus((cur) => (cur === 'ok' ? 'ok' : 'error'));
    }
  }

  useEffect(() => {
    let alive = true;
    getMyId().then((id) => { if (alive) setMe(id); }).catch(() => {});
    load();
    const timer = setInterval(() => { if (alive) load(); }, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  // Keep the newest message in view by scrolling the thread box only.
  // scrollIntoView would also scroll the page and hide the screen header.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [msgs.length]);

  async function send() {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await sendMessage(applicationId, recipientId, clean);
      setText('');
      await load();
    } catch (err) {
      // Keep the text in the box and say it didn't go through.
      console.error('[messages] send failed', err);
      const signedOut = err && err.code === 'SIGNED_OUT';
      toast({
        title: 'Message not sent',
        message: signedOut ? 'Sign in again, then send it.' : 'Check your connection and try again.',
        tone: 'danger',
      });
    }
    setBusy(false);
  }

  const canSend = !busy && Boolean(text.trim());

  return (
    <div style={S('display:flex;flex-direction:column;height:min(60vh,460px)')}>
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label={`Messages with ${recipientName}`}
        style={S('flex:1;overflow-y:auto;display:flex;flex-direction:column;padding:4px 2px 8px')}
      >
        {status === 'error' && msgs.length === 0 ? (
          <div role="alert" style={S(NOTE)}>
            Couldn&apos;t load these messages. Check your connection and try again.
            <div style={S('margin-top:12px')}>
              <Button size="sm" icon="refresh" onClick={() => { setStatus('loading'); load(); }}>Try again</Button>
            </div>
          </div>
        ) : null}
        {status === 'loading' && msgs.length === 0 ? (
          <div role="status" style={S(NOTE)}>Loading messages</div>
        ) : null}
        {status === 'ok' && msgs.length === 0 ? (
          <div style={S(NOTE)}>
            <span aria-hidden="true" style={S(`display:grid;place-items:center;margin:0 auto 12px;width:44px;height:44px;border-radius:50%;background:${C.mist};color:${C.ink2}`)}>
              <Icon name="message" size={20} />
            </span>
            No messages yet. Say hello to {recipientName}.
          </div>
        ) : null}
        {msgs.map((m, i) => {
          const mine = me != null && m.sender_id === me;
          const prev = msgs[i - 1];
          const next = msgs[i + 1];
          const joinsPrev = sameGroup(prev, m);
          const joinsNext = sameGroup(m, next);
          const when = joinsNext ? '' : stamp(m.created_at);
          // The corner nearest the sender's side tightens inside a group, so
          // a run of messages reads as one block. Both values are on the
          // radius scale (photo 16, control 10).
          const corners = mine
            ? `16px ${joinsPrev ? 10 : 16}px ${joinsNext ? 10 : 16}px 16px`
            : `${joinsPrev ? 10 : 16}px 16px 16px ${joinsNext ? 10 : 16}px`;
          return (
            <div
              key={m.id}
              style={s(
                'max-width:min(80%,440px);display:flex;flex-direction:column;gap:4px',
                joinsPrev ? 'margin-top:3px' : 'margin-top:12px',
                mine ? 'align-self:flex-end;align-items:flex-end' : 'align-self:flex-start;align-items:flex-start',
              )}
            >
              <div
                className="vu-break"
                style={s(
                  `padding:10px 14px;border-radius:${corners};font:400 15px/1.45 ${F.body};white-space:pre-wrap`,
                  mine ? `background:${C.ink};color:#fff` : `background:${C.mist};color:${C.ink}`,
                )}
              >
                {m.body}
              </div>
              {when ? (
                <div style={S(`padding:0 4px;font:400 13px/1.2 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>
                  {mine ? `You, ${when}` : when}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {templates && templates.length ? (
        <div style={S('padding-top:10px;display:flex;justify-content:flex-end')}>
          <TemplatesButton templates={templates} onPick={setText} />
        </div>
      ) : null}
      <div style={S(`padding-top:12px;border-top:1px solid ${C.line};display:flex;gap:8px;align-items:flex-end`)}>
        <textarea
          value={text}
          aria-label={`Message ${recipientName}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Write a message"
          maxLength={2000}
          rows={1}
          className="vu-input"
          style={S(`flex:1;min-width:0;resize:none;padding:12px 14px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:400 15px/1.35 ${F.body};color:${C.ink};max-height:120px`)}
        />
        <Button variant="primary" icon="send" onClick={send} disabled={!canSend} busy={busy}>
          {busy ? 'Sending' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
