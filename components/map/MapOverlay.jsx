'use client';

/* ==========================================================================
   MapOverlay, the map popped out to fill the screen.

   A modal dialog over everything: a title bar with Close, and whatever map
   the caller puts inside. Escape closes it, after first closing any open
   popup (`onEscape` says whether it did, wherever focus is), Tab stays inside, the page behind doesn't scroll,
   and focus goes back to whatever opened it. Following a link inside closes
   it, except links that open a new tab.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { S } from '../../lib/style.js';
import { C, F, R } from '../../lib/tokens.js';
import { Icon } from '../ui.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {{ title: string, onClose: () => void, onEscape?: () => boolean, children: React.ReactNode }} props
 *   onEscape runs first on Escape; returning true (it closed a popup) keeps the map open
 */
export default function MapOverlay({ title, onClose, onEscape, children }) {
  const boxRef = useRef(null);
  const closeRef = useRef(null);
  const closeFn = useRef(onClose);
  closeFn.current = onClose;
  const escFn = useRef(onEscape);
  escFn.current = onEscape;

  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    if (closeRef.current) closeRef.current.focus({ preventScroll: true });
    return () => {
      body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (escFn.current && escFn.current()) return;
      closeFn.current();
      return;
    }
    if (e.key !== 'Tab' || !boxRef.current) return;
    const items = [...boxRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="vu-mapfull"
      onKeyDown={onKeyDown}
      onClickCapture={(e) => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (a && a.getAttribute('target') !== '_blank') closeFn.current();
      }}
      style={S(`position:fixed;inset:0;z-index:var(--vu-z-overlay);background:#fff;display:flex;flex-direction:column`)}
    >
      <div style={S(`flex:none;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 12px 8px 16px;border-bottom:1px solid ${C.line}`)}>
        <h2 className="vu-trunc" style={S(`flex:1;min-width:0;margin:0;font:600 17px/1.25 ${F.body};color:${C.ink}`)}>{title}</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={() => closeFn.current()}
          aria-label="Close map"
          className="vu-btn"
          style={S(`flex:none;display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;color:${C.ink};font:600 14px/1 ${F.body};cursor:pointer`)}
        >
          <Icon name="x" size={16} />
          Close
        </button>
      </div>
      <div style={S('position:relative;flex:1;min-height:0')}>{children}</div>
    </div>,
    document.body
  );
}
