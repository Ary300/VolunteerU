'use client';

/* ==========================================================================
   OverlayHost.jsx, renders toasts, modals, confirmations and anchored menus
   ========================================================================== */

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { S, s, cx, GRAD, H } from '../lib/style.js';
import {
  useOverlays, dismissToast, holdToast, releaseToast, closeModal, closeMenu, closeTopOverlay,
} from '../lib/overlays.js';
import { SecondaryButton, Field, Icon, renderIcon } from './ui.jsx';

export default function OverlayHost() {
  const { toasts, modals, menu } = useOverlays();

  // Escape closes the top-most overlay only. It listens in the capture phase
  // and stops the event there, so a drawer or page behind the overlay never
  // sees the same key press and closes too.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && closeTopOverlay()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Lock background scroll while a modal is open.
  useEffect(() => {
    if (!modals.length) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modals.length]);

  return (
    <>
      {modals.map((m) => (
        <Modal key={m.id} entry={m} />
      ))}
      {menu ? <Menu menu={menu} /> : null}
      <div className="vu-toasts" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
}

/* ---- toast --------------------------------------------------------------- */

function Toast({ toast }) {
  return (
    <div
      className="vu-toast"
      data-tone={toast.tone}
      data-out={toast.out ? 'true' : 'false'}
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => holdToast(toast.id)}
      onMouseLeave={() => releaseToast(toast.id)}
    >
      <span className="vu-toast-dot" aria-hidden="true" />
      <div style={S('flex:1;min-width:0')}>
        <div className="vu-toast-title">{toast.title}</div>
        {toast.message ? <div className="vu-toast-msg">{toast.message}</div> : null}
        {toast.actionLabel ? (
          <button
            type="button"
            className="vu-toast-act"
            onClick={() => {
              try {
                toast.onAction && toast.onAction();
              } finally {
                dismissToast(toast.id);
              }
            }}
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
      <button type="button" className="vu-toast-x" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

/* ---- modal --------------------------------------------------------------- */

function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const root = ref.current;
    const prev = document.activeElement;

    const focusables = () =>
      Array.from(
        root.querySelectorAll(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const timer = setTimeout(() => {
      const list = focusables();
      const target = root.querySelector('[data-autofocus]') || list.find((el) => !el.hasAttribute('data-modal-close')) || root;
      if (target === root) root.setAttribute('tabindex', '-1');
      target.focus();
    }, 20);

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      root.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [ref, active]);
}

function Modal({ entry }) {
  const ref = useRef(null);
  useFocusTrap(ref, true);
  const titleId = `${entry.id}-title`;
  const { Body, footer, api } = entry;

  const close = (reason) => closeModal(entry.id, reason);

  return (
    <div
      className="vu-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && entry.dismissable !== false) close('scrim');
      }}
    >
      <div
        ref={ref}
        className={cx('vu-dialog', entry.size === 'wide' && 'vu-dialog--wide', entry.size === 'slim' && 'vu-dialog--slim')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={entry.title ? titleId : undefined}
      >
        {entry.title ? (
          <div style={S('padding:22px 24px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
            <div style={S('min-width:0;overflow-wrap:anywhere')}>
              <div id={titleId} style={S('font:600 19px/1.25 Geist;letter-spacing:-0.03em')}>
                {entry.title}
              </div>
              {entry.subtitle ? (
                <div style={S('margin-top:7px;font:450 13px/1.5 Geist;color:#6B635C;text-wrap:pretty')}>{entry.subtitle}</div>
              ) : null}
            </div>
            {entry.dismissable !== false ? (
              <button
                type="button"
                data-modal-close
                aria-label="Close"
                className={cx(H.icon, H.press)}
                onClick={() => close('button')}
                style={S('flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#8A8179;cursor:pointer;transition:background .16s ease, color .16s ease')}
              >
                <Icon name="x" size={15} />
              </button>
            ) : null}
          </div>
        ) : null}

        {entry.kind === 'confirm' ? (
          <Confirm entry={entry} padTop={entry.title ? '18px' : '24px'} />
        ) : (
          <div style={S(`padding:${entry.title ? '18px' : '24px'} 24px ${footer ? '18px' : '24px'}`)}>
            {Body ? <Body api={api} /> : entry.body}
          </div>
        )}

        {entry.kind === 'confirm' ? null : footer ? (
          <div style={S('padding:16px 24px;border-top:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:flex-end;gap:10px;border-radius:0 0 18px 18px')}>
            {typeof footer === 'function' ? footer(api) : footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---- confirmation --------------------------------------------------------
   Body and footer share one piece of state, so a type-to-confirm field is a
   normal controlled input and the confirm button reads what was typed.
   ------------------------------------------------------------------------- */

function Confirm({ entry, padTop }) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [shake, setShake] = useState(false);
  const need = entry.requireText || '';
  const matches = !need || text.trim() === need;

  const finish = (v) => {
    entry.onResolve && entry.onResolve(v);
    closeModal(entry.id, v ? 'confirm' : 'cancel');
  };
  const tryConfirm = () => {
    if (!matches) {
      setInvalid(true);
      setShake(true);
      setTimeout(() => setShake(false), 420);
      return;
    }
    finish(true);
  };

  return (
    <>
      <div style={S(`padding:${padTop} 24px 18px`)}>
        {entry.body ? <div style={S('font:450 14px/1.6 Geist;color:#57504A;text-wrap:pretty')}>{entry.body}</div> : null}
        {need ? (
          <div style={S(entry.body ? 'margin-top:16px' : '')} id={`${entry.id}-require`}>
            <Field
              id={`${entry.id}-text`}
              label={`Type ${need} to confirm`}
              placeholder={need}
              value={text}
              autoComplete="off"
              error={invalid && !matches ? `Type ${need} exactly to continue.` : undefined}
              onChange={(v) => {
                setText(v);
                if (invalid) setInvalid(false);
              }}
              onEnter={tryConfirm}
            />
          </div>
        ) : null}
      </div>
      <div className="vu-dialog-foot" style={S('padding:16px 24px;border-top:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;border-radius:0 0 18px 18px')}>
        <SecondaryButton h={40} px={16} r={11} fs={14} onClick={() => finish(false)}>
          {entry.cancelLabel}
        </SecondaryButton>
        <button
          type="button"
          data-autofocus={need ? undefined : true}
          aria-describedby={need && !matches ? `${entry.id}-require` : undefined}
          className={cx(H.press, entry.tone === 'danger' ? 'h-danger-solid' : H.primary, shake && 'vu-shake')}
          onClick={tryConfirm}
          style={s(
            'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none',
            'padding:0 18px;height:40px;border-radius:11px',
            'border:1px solid #A8482A',
            `background:${entry.tone === 'danger' ? '#A8482A' : GRAD}`,
            'color:#fff;font:600 14px/1 Geist;cursor:pointer',
            matches ? '' : 'opacity:.55',
            'transition:background .16s ease, transform .16s ease, opacity .16s ease'
          )}
        >
          {entry.confirmLabel}
        </button>
      </div>
    </>
  );
}

/* ---- anchored menu ------------------------------------------------------- */

function Menu({ menu }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = menu.rect.left;
    let top = menu.rect.bottom + 6;
    if (left + w > window.innerWidth - 10) left = Math.max(10, menu.rect.right - w);
    if (top + h > window.innerHeight - 10) top = Math.max(10, menu.rect.top - h - 6);
    setPos({ left, top });
    // Focus the first item right away so arrow keys work on the first press.
    const first = el.querySelector('[data-menu-item]:not([disabled])');
    if (first) first.focus({ preventScroll: true });
    // On close, hand focus back to the control that opened the menu. Runs in
    // the layout phase, so a dialog opened by the picked item records that
    // control as the place to return to, instead of an unmounted menu item.
    const back = menu.returnFocus;
    return () => {
      if (!back || !back.isConnected || typeof back.focus !== 'function') return;
      const a = document.activeElement;
      if (!a || a === document.body || el.contains(a)) back.focus({ preventScroll: true });
    };
  }, [menu]);

  useEffect(() => {
    const outside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) closeMenu();
    };
    const onKey = (e) => {
      const items = ref.current ? Array.from(ref.current.querySelectorAll('[data-menu-item]:not([disabled])')) : [];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(i + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i - 1 + items.length) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  return (
    <div ref={ref} className="vu-menu" role="menu" style={s(`left:${pos.left}px`, `top:${pos.top}px`)}>
      {menu.items.map((it, i) =>
        it.sep ? (
          <div key={`sep-${i}`} className="vu-menu-sep" role="separator" />
        ) : (
          <button
            key={it.key || i}
            type="button"
            role="menuitem"
            data-menu-item
            data-tone={it.tone || undefined}
            className="vu-menu-item"
            disabled={it.disabled}
            onClick={() => {
              closeMenu();
              menu.onPick && menu.onPick(it.key, it);
            }}
          >
            {renderIcon(it.icon, 15) ? (
              <span aria-hidden="true" style={S('display:grid;place-items:center;width:16px;opacity:.7')}>
                {renderIcon(it.icon, 15)}
              </span>
            ) : null}
            <span style={S('flex:1')}>{it.label}</span>
            {it.checked ? (
              <span style={S('color:#C2603C')}>
                <Icon name="check" size={14} label="Selected" />
              </span>
            ) : null}
          </button>
        )
      )}
    </div>
  );
}
