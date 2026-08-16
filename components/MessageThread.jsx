'use client';

/* ==========================================================================
   MessageThread.jsx — a conversation tied to an application
   Opened from either side (founder or volunteer). Loads the thread, polls for
   replies, and sends. Kept simple and human so neither party leaves the app to
   talk.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { S } from '../lib/style.js';
import { loadMessages, sendMessage, myId as getMyId } from '../lib/listings.js';

export default function MessageThread({ applicationId, recipientId, recipientName = 'them' }) {
  const [msgs, setMsgs] = useState([]);
  const [me, setMe] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  async function load() {
    try {
      setMsgs(await loadMessages(applicationId));
    } catch {
      /* keep what we have */
    }
  }

  useEffect(() => {
    getMyId().then(setMe);
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [msgs.length]);

  async function send() {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await sendMessage(applicationId, recipientId, clean);
      setText('');
      await load();
    } catch {
      /* the compose box keeps the text so nothing is lost */
    }
    setBusy(false);
  }

  return (
    <div style={S('display:flex;flex-direction:column;height:min(58vh,440px)')}>
      <div style={S('flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:2px')}>
        {msgs.length === 0 ? (
          <div style={S('margin:auto;max-width:280px;text-align:center;font:450 13px/1.5 Geist;color:#A9A097')}>
            No messages yet. Say hello to {recipientName}.
          </div>
        ) : null}
        {msgs.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div
              key={m.id}
              style={S(
                'max-width:80%;padding:10px 13px;border-radius:14px;font:450 14px/1.45 Geist;' +
                  (mine
                    ? 'align-self:flex-end;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff'
                    : 'align-self:flex-start;background:#F6F2EE;color:#332D28'),
              )}
            >
              {m.body}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={S('margin-top:12px;display:flex;gap:8px;align-items:flex-end')}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Message ${recipientName}…`}
          rows={1}
          style={S('flex:1;resize:none;padding:11px 14px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;font:450 14px/1.4 Geist;color:#1A1714;max-height:120px')}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !text.trim()}
          style={S('flex:none;padding:0 16px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Send
        </button>
      </div>
    </div>
  );
}
