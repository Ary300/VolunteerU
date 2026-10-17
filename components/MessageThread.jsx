'use client';

/* ==========================================================================
   MessageThread.jsx, a conversation tied to an application
   Opened from either side (organizer or volunteer). Loads the thread, polls for
   replies every few seconds, and sends. Messages stay inside the app.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { toast } from '../lib/overlays.js';
import { loadMessages, sendMessage, myId as getMyId } from '../lib/listings.js';

const POLL_MS = 5000;

/** "Oct 17, 3:04 PM" for a message's created_at, or '' when it can't be read. */
function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MessageThread({ applicationId, recipientId, recipientName = 'them' }) {
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
    <div style={S('display:flex;flex-direction:column;height:min(58vh,440px)')}>
      <div ref={listRef} role="log" aria-live="polite" aria-label={`Messages with ${recipientName}`} style={S('flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:2px')}>
        {status === 'error' && msgs.length === 0 ? (
          <div role="alert" style={S('margin:auto;max-width:300px;text-align:center;font:450 13px/1.5 Geist;color:#57504A')}>
            Couldn't load these messages. Check your connection and try again.
            <div style={S('margin-top:10px')}>
              <button
                type="button"
                onClick={() => { setStatus('loading'); load(); }}
                className={cx(H.secondary, H.press)}
                style={S('padding:0 14px;height:34px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#1A1714;cursor:pointer')}
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}
        {status === 'loading' && msgs.length === 0 ? (
          <div role="status" style={S('margin:auto;text-align:center;font:450 13px/1.5 Geist;color:#8A8179')}>
            Loading messages
          </div>
        ) : null}
        {status === 'ok' && msgs.length === 0 ? (
          <div style={S('margin:auto;max-width:280px;text-align:center;font:450 13px/1.5 Geist;color:#8A8179')}>
            No messages yet. Say hello to {recipientName}.
          </div>
        ) : null}
        {msgs.map((m) => {
          const mine = me != null && m.sender_id === me;
          const when = stamp(m.created_at);
          return (
            <div
              key={m.id}
              style={s(
                'max-width:80%;display:flex;flex-direction:column;gap:3px',
                mine ? 'align-self:flex-end;align-items:flex-end' : 'align-self:flex-start;align-items:flex-start',
              )}
            >
              <div
                className="vu-break"
                style={s(
                  'padding:10px 13px;border-radius:14px;font:450 14px/1.45 Geist;white-space:pre-wrap',
                  mine ? 'background:#C2603C;color:#fff' : 'background:#F6F2EE;color:#332D28',
                )}
              >
                {m.body}
              </div>
              {when ? <div style={S('padding:0 4px;font:450 11px/1.2 Geist;color:#A9A097')}>{mine ? `You, ${when}` : when}</div> : null}
            </div>
          );
        })}
      </div>
      <div style={S('margin-top:12px;display:flex;gap:8px;align-items:flex-end')}>
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
          placeholder={`Message ${recipientName}`}
          maxLength={2000}
          rows={1}
          style={S('flex:1;min-width:0;resize:none;padding:11px 14px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;font:450 14px/1.4 Geist;color:#1A1714;max-height:120px')}
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className={cx(H.primary, H.press)}
          style={s(
            'flex:none;padding:0 16px;height:44px;border-radius:12px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist',
            canSend ? 'cursor:pointer' : 'cursor:default;opacity:.55',
          )}
        >
          {busy ? 'Sending' : 'Send'}
        </button>
      </div>
    </div>
  );
}
