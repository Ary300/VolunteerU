'use client';

/* ==========================================================================
   OverlayHost.jsx, renders toasts, modals, confirmations and anchored menus
   ========================================================================== */

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { S, s, cx, GRAD, H } from '../lib/style.js';
import {
  useOverlays, dismissToast, holdToast, releaseToast, closeModal, closeMenu, closeTopOverlay,
} from '../lib/overlays.js';
import { PrimaryButton, SecondaryButton, Field } from './ui.jsx';

export default function OverlayHost() {
  const { toasts, modals, menu } = useOverlays();

  // Escape closes the top-most overlay only.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (closeTopOverlay()) e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      <button type="button" className="vu-toast-x" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}>
        ✕
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
            <div>
              <div id={titleId} style={S('font:600 19px/1.25 Geist;letter-spacing:-0.03em')}>
                {entry.title}
              </div>
              {entry.subtitle ? (
                <div style={S('margin-top:7px;font:450 13px/1.5 Geist;color:#8A8179;text-wrap:pretty')}>{entry.subtitle}</div>
              ) : null}
            </div>
            {entry.dismissable !== false ? (
              <button
                type="button"
                data-modal-close
                aria-label="Close"
                className={cx(H.icon, H.press)}
                onClick={() => close('button')}
                style={S('flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#A9A097;font-size:14px;cursor:pointer;transition:background .16s ease, color .16s ease')}
              >
                ✕
              </button>
            ) : null}
          </div>
        ) : null}

        <div style={S(`padding:${entry.title ? '18px' : '24px'} 24px ${footer || entry.kind === 'confirm' ? '18px' : '24px'}`)}>
          {entry.kind === 'confirm' ? <ConfirmBody entry={entry} /> : Body ? <Body api={api} /> : entry.body}
        </div>

        {entry.kind === 'confirm' ? (
          <ConfirmFooter entry={entry} />
        ) : footer ? (
          <div style={S('padding:16px 24px;border-top:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:flex-end;gap:10px;border-radius:0 0 18px 18px')}>
            {typeof footer === 'function' ? footer(api) : footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---- confirmation -------------------------------------------------------- */

function ConfirmBody({ entry }) {
  return (
    <>
      <div style={S('font:450 14px/1.6 Geist;color:#57504A;text-wrap:pretty')}>{entry.body}</div>
      {entry.requireText ? (
        <div style={S('margin-top:16px')} id={`${entry.id}-require`}>
          <Field
            id={`${entry.id}-text`}
            label={`Type “${entry.requireText}” to confirm`}
            placeholder={entry.requireText}
            value={entry.__text || ''}
            onChange={(v) => {
              entry.__text = v;
              // Local echo only: re-render via the input's own value.
              const el = document.getElementById(`${entry.id}-text`);
              if (el) el.value = v;
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function ConfirmFooter({ entry }) {
  const [shake, setShake] = useState(false);
  const finish = (v) => {
    entry.onResolve && entry.onResolve(v);
    closeModal(entry.id, v ? 'confirm' : 'cancel');
  };
  return (
    <div style={S('padding:16px 24px;border-top:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;justify-content:flex-end;gap:10px;border-radius:0 0 18px 18px')}>
      <SecondaryButton h={40} px={16} r={11} fs={14} onClick={() => finish(false)}>
        {entry.cancelLabel}
      </SecondaryButton>
      <button
        type="button"
        data-autofocus
        className={cx(H.press, shake && 'vu-shake')}
        onClick={() => {
          if (entry.requireText) {
            const el = document.getElementById(`${entry.id}-text`);
            const val = el ? el.value.trim() : '';
            if (val !== entry.requireText) {
              if (el) el.setAttribute('data-invalid', 'true');
              setShake(true);
              setTimeout(() => setShake(false), 420);
              return;
            }
          }
          finish(true);
        }}
        style={s(
          'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none',
          'padding:0 18px;height:40px;border-radius:11px',
          'border:1px solid #A8482A',
          `background:${entry.tone === 'danger' ? '#C2603C' : GRAD}`,
          'color:#fff;font:600 14px/1 Geist;cursor:pointer',
          'transition:background .16s ease, transform .16s ease'
        )}
      >
        {entry.confirmLabel}
      </button>
    </div>
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
    const timer = setTimeout(() => {
      const first = ref.current && ref.current.querySelector('[data-menu-item]:not([disabled])');
      first && first.focus();
    }, 10);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
      clearTimeout(timer);
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
            {it.icon ? (
              <span aria-hidden="true" style={S('font-size:12px;opacity:.6;width:14px')}>
                {it.icon}
              </span>
            ) : null}
            <span style={S('flex:1')}>{it.label}</span>
            {it.checked ? (
              <span aria-hidden="true" style={S('color:#C2603C;font-size:11px')}>
                ✓
              </span>
            ) : null}
          </button>
        )
      )}
    </div>
  );
}
