'use client';

/* ==========================================================================
   ui.jsx — the design system, expressed once
   Each primitive takes the design's literal numbers (height, padding, radius,
   font size) so call sites stay 1:1 with `VolunteerU Design.dc.html` while
   sharing a single implementation.
   ========================================================================== */

import { useEffect, useId, useState, useRef } from 'react';
import { S, s, cx, T, GRAD, SH, H } from '../lib/style.js';

/* ---- image slot (reimplements <image-slot>) ----------------------------- */

export function ImageSlot({ src, shape = 'rounded', radius = 12, placeholder = 'photo', alt = '' }) {
  const [status, setStatus] = useState('loading');
  const ref = useRef(null);

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  // A cached image can finish before React attaches onLoad.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete) setStatus(img.naturalWidth ? 'ready' : 'failed');
  }, [src]);

  const br =
    shape === 'circle' ? 'border-radius:50%' : shape === 'pill' ? 'border-radius:999px' : shape === 'rounded' ? `border-radius:${radius}px` : '';

  const hasSrc = Boolean(src);
  return (
    <div className="vu-slot" data-state={hasSrc ? status : 'failed'} style={S(br)}>
      {hasSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('failed')}
        />
      ) : null}
      <span className="vu-slot-ph" aria-hidden="true">
        <span style={S('font-size:13px')}>▨</span>
        {placeholder}
      </span>
    </div>
  );
}

/* ---- buttons ------------------------------------------------------------ */

const flexBase = (o) =>
  [
    o.full ? 'display:flex;width:100%' : 'display:inline-flex',
    'align-items:center',
    o.center ? 'justify-content:center' : '',
    'gap:9px;white-space:nowrap',
    o.full ? '' : 'flex:none',
  ]
    .filter(Boolean)
    .join(';');

export function PrimaryButton({
  children,
  h = 40,
  px = 18,
  r = 11,
  fs = 14,
  sh = SH.flat,
  icon = '▷',
  iconSize = 11,
  ls,
  lift = false,
  onClick,
  disabled,
  busy,
  type = 'button',
  center,
  full,
  extra = '',
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx(lift ? H.primaryLift : H.primary, H.press)}
      onClick={onClick}
      disabled={disabled || busy}
      data-disabled={disabled ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      style={s(
        flexBase({ center, full }),
        `padding:0 ${px}px`,
        `height:${h}px`,
        `border-radius:${r}px`,
        'border:1px solid #A8482A',
        `background:${GRAD}`,
        'color:#fff',
        `font:600 ${fs}px/1 Geist`,
        ls ? `letter-spacing:${ls}` : '',
        'cursor:pointer',
        `box-shadow:${sh}`,
        'transition:transform .16s ease, box-shadow .16s ease, background .16s ease',
        extra
      )}
      {...rest}
    >
      {busy ? <span className="vu-spin" /> : icon ? <span aria-hidden="true" style={S(`font-size:${iconSize}px;opacity:.9`)}>{icon}</span> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  h = 40,
  px = 16,
  r = 11,
  fs = 14,
  color = '#1A1714',
  borderColor = '#E4DDD4',
  bg = '#fff',
  icon,
  iconSize = 10,
  lift = false,
  onClick,
  disabled,
  busy,
  type = 'button',
  center,
  full,
  extra = '',
  shadow = true,
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx(lift ? H.secondaryLift : H.secondary, H.press)}
      onClick={onClick}
      disabled={disabled || busy}
      data-disabled={disabled ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      style={s(
        flexBase({ center, full }),
        `padding:0 ${px}px`,
        `height:${h}px`,
        `border-radius:${r}px`,
        `border:1px solid ${borderColor}`,
        `background:${bg}`,
        `color:${color}`,
        `font:600 ${fs}px/1 Geist`,
        'cursor:pointer',
        shadow ? `box-shadow:${SH.hairline}` : '',
        'transition:background .16s ease, border-color .16s ease, transform .16s ease',
        extra
      )}
      {...rest}
    >
      {busy ? <span className="vu-spin" /> : icon ? <span aria-hidden="true" style={S(`font-size:${iconSize}px;color:#C2603C`)}>{icon}</span> : null}
      {children}
    </button>
  );
}

/** Small pill used inside table rows and cards. */
export function GhostButton({ children, py = 6, px = 9, r = 7, fs = 11, color = '#57504A', tone, onClick, disabled, ...rest }) {
  return (
    <button
      type="button"
      className={cx(tone === 'danger' ? H.danger : H.secondary, H.press)}
      onClick={onClick}
      disabled={disabled}
      data-disabled={disabled ? 'true' : undefined}
      style={s(
        `padding:${py}px ${px}px`,
        `border-radius:${r}px`,
        `border:1px solid ${tone === 'danger' ? '#EBD3C8' : '#E8E1D9'}`,
        'background:#fff',
        `font:500 ${fs}px/1 Geist`,
        `color:${color}`,
        'cursor:pointer',
        'transition:background .16s ease, border-color .16s ease'
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Text-only action ("See all 12", "Manage people"). */
export function LinkButton({ children, fs = 13, color = '#C2603C', onClick, extra = '', ...rest }) {
  return (
    <button
      type="button"
      className={cx(H.link, H.press)}
      onClick={onClick}
      style={s(`font:500 ${fs}px/1 Geist`, `color:${color}`, 'cursor:pointer;background:none;border:none;padding:0', 'transition:opacity .16s ease', extra)}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A div that behaves like a button. The design draws most of its controls as
 * plain divs; this keeps that markup while restoring keyboard operability.
 */
export function Pressable({ as: Tag = 'div', children, onClick, label, pressed, expanded, current, disabled, className, style, role = 'button', ...rest }) {
  const activate = (e) => {
    if (disabled) return;
    onClick && onClick(e);
  };
  return (
    <Tag
      role={role}
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed ? 'true' : 'false'}
      aria-expanded={expanded === undefined ? undefined : expanded ? 'true' : 'false'}
      aria-current={current}
      aria-disabled={disabled ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      className={cx(H.press, className)}
      style={style}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(e);
        }
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ---- fields -------------------------------------------------------------- */

export function Field({
  label,
  value = '',
  onChange,
  onEnter,
  placeholder = '',
  type = 'text',
  bg = '#fff',
  fs = 15,
  error,
  hint,
  required,
  inputMode,
  autoComplete,
  maxLength,
  readOnly,
  disabled,
  id,
  name,
  ariaLabel,
}) {
  const auto = useId();
  const fid = id || auto;
  const eid = `${fid}-err`;
  return (
    <div>
      {label ? (
        <label htmlFor={fid} style={S('display:block;font:500 12px/1 Geist;color:#57504A')}>
          {label}
          {required ? (
            <span aria-hidden="true" style={S('color:#C2603C')}>
              {' *'}
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        id={fid}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        readOnly={readOnly}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={error ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
        aria-describedby={error ? eid : undefined}
        onChange={(e) => onChange && onChange(e.target.value, e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter(e.currentTarget.value);
          }
        }}
        className={H.input}
        style={s(
          `margin-top:${label ? 8 : 0}px`,
          'width:100%;padding:12px 14px;border-radius:10px',
          'border:1px solid #E8E1D9',
          `background:${bg}`,
          `font:450 ${fs}px/1.15 Geist`,
          'color:#1A1714',
          readOnly ? 'color:#6B635C' : '',
          'transition:border-color .16s ease'
        )}
      />
      {error ? (
        <div className="vu-err" id={eid}>
          {error}
        </div>
      ) : hint ? (
        <div className="vu-hint">{hint}</div>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  value = '',
  onChange,
  placeholder = '',
  minHeight = 80,
  maxLength,
  counter,
  error,
  hint,
  bg = '#fff',
  fs = 15,
  required,
  id,
  name,
  ariaLabel,
}) {
  const auto = useId();
  const fid = id || auto;
  const eid = `${fid}-err`;
  const len = String(value || '').length;
  return (
    <div>
      {label ? (
        <div style={S('display:flex;align-items:baseline;justify-content:space-between')}>
          <label htmlFor={fid} style={S('font:500 12px/1 Geist;color:#57504A')}>
            {label}
            {required ? (
              <span aria-hidden="true" style={S('color:#C2603C')}>
                {' *'}
              </span>
            ) : null}
          </label>
          {counter && maxLength ? (
            <div className="vu-count" data-over={len > maxLength ? 'true' : 'false'}>
              {len} / {maxLength}
            </div>
          ) : null}
        </div>
      ) : null}
      <textarea
        id={fid}
        name={name}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={error ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
        aria-describedby={error ? eid : undefined}
        onChange={(e) => onChange && onChange(e.target.value, e)}
        className={H.input}
        style={s(
          `margin-top:${label ? 8 : 0}px`,
          'display:block;width:100%;padding:14px;border-radius:12px',
          'border:1px solid #E8E1D9',
          `background:${bg}`,
          `min-height:${minHeight}px`,
          `font:450 ${fs}px/1.55 Geist`,
          'color:#332D28',
          'transition:border-color .16s ease'
        )}
      />
      {error ? (
        <div className="vu-err" id={eid}>
          {error}
        </div>
      ) : hint ? (
        <div className="vu-hint">{hint}</div>
      ) : null}
    </div>
  );
}

/** Select styled to match the design's "Value ▾" boxes. */
export function Select({ label, value, onChange, options = [], bg = '#fff', fs = 15, error, hint, id, name, ariaLabel }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div>
      {label ? (
        <label htmlFor={fid} style={S('display:block;font:500 12px/1 Geist;color:#57504A')}>
          {label}
        </label>
      ) : null}
      <div style={s('position:relative', `margin-top:${label ? 8 : 0}px`)}>
        <select
          id={fid}
          name={name}
          value={value}
          aria-label={ariaLabel}
          aria-invalid={error ? 'true' : undefined}
          data-invalid={error ? 'true' : undefined}
          onChange={(e) => onChange && onChange(e.target.value, e)}
          className={H.input}
          style={s(
            'width:100%;padding:12px 34px 12px 14px;border-radius:10px',
            'border:1px solid #E8E1D9',
            `background:${bg}`,
            `font:450 ${fs}px/1.15 Geist`,
            'color:#1A1714;cursor:pointer',
            'transition:border-color .16s ease'
          )}
        >
          {options.map((op) => {
            const v = op && op.v !== undefined ? op.v : op;
            const l = op && op.l !== undefined ? op.l : op;
            return (
              <option key={String(v)} value={v}>
                {l}
              </option>
            );
          })}
        </select>
        <span aria-hidden="true" style={S('position:absolute;right:13px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:#8A8179')}>
          ▾
        </span>
      </div>
      {error ? <div className="vu-err">{error}</div> : hint ? <div className="vu-hint">{hint}</div> : null}
    </div>
  );
}

/** Checkbox drawn exactly like the design's 17px rounded tick box. */
export function Checkbox({ checked, onChange, label, size = 17, id, describedBy }) {
  const auto = useId();
  const cid = id || auto;
  return (
    <label htmlFor={cid} className={H.link} style={S('display:flex;gap:11px;align-items:flex-start;cursor:pointer')}>
      <input
        id={cid}
        type="checkbox"
        className="vu-sr"
        checked={!!checked}
        aria-describedby={describedBy}
        onChange={(e) => onChange && onChange(e.target.checked, e)}
      />
      <span
        aria-hidden="true"
        style={s(
          `width:${size}px;height:${size}px;border-radius:5px`,
          `border:1px solid ${checked ? '#C2603C' : '#E0D8CF'}`,
          `background:${checked ? '#FAF6F3' : '#FCFAF8'}`,
          'flex:none;margin-top:2px;display:grid;place-items:center',
          'font:600 9px/1 Geist;color:#C2603C',
          'transition:border-color .16s ease, background .16s ease'
        )}
      >
        {checked ? '✓' : ''}
      </span>
      <span style={S('font:450 14px/1.45 Geist;color:#332D28')}>{label}</span>
    </label>
  );
}

export function RadioDot({ checked }) {
  return (
    <span
      aria-hidden="true"
      style={s(
        'width:18px;height:18px;border-radius:50%',
        `border:1px solid ${checked ? '#C2603C' : '#D8CEC3'}`,
        'background:#fff;flex:none;display:grid;place-items:center',
        'transition:border-color .16s ease'
      )}
    >
      {checked ? <span className="vu-pop" style={S('width:9px;height:9px;border-radius:50%;background:#C2603C')} /> : null}
    </span>
  );
}

/**
 * Settings toggle. The design draws a single static state; a real switch has
 * to show both, so ON moves the knob and fills the track.
 */
export function Toggle({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on ? 'true' : 'false'}
      aria-label={label}
      disabled={disabled}
      data-disabled={disabled ? 'true' : undefined}
      className={H.press}
      onClick={() => onChange && onChange(!on)}
      style={s(
        'width:38px;height:22px;border-radius:12px',
        `background:${on ? '#C2603C' : '#EFE7DF'}`,
        `border:1px solid ${on ? '#A8482A' : '#E4DAD0'}`,
        'position:relative;cursor:pointer;flex:none',
        'transition:background .16s ease, border-color .16s ease'
      )}
    >
      <span
        aria-hidden="true"
        style={s(
          'position:absolute;top:2px',
          `left:${on ? 18 : 2}px`,
          'width:16px;height:16px;border-radius:50%',
          `background:${on ? '#fff' : '#C2603C'}`,
          'transition:left .16s cubic-bezier(.22,.61,.36,1), background .16s ease'
        )}
      />
    </button>
  );
}

/** Selectable chip — the design's pill in both selected and idle states. */
export function Chip({ label, on, onClick, py = 10, px = 14, r = 10, fs = 14, role = 'button', ariaLabel, count }) {
  const isCheckbox = role === 'checkbox';
  return (
    <button
      type="button"
      role={isCheckbox ? 'checkbox' : undefined}
      aria-checked={isCheckbox ? (on ? 'true' : 'false') : undefined}
      aria-pressed={isCheckbox ? undefined : on ? 'true' : 'false'}
      aria-label={ariaLabel}
      className={cx(on ? H.link : H.chip, H.press)}
      onClick={onClick}
      style={s(
        `padding:${py}px ${px}px`,
        `border-radius:${r}px`,
        `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`,
        `background:${on ? '#1F1B18' : '#fff'}`,
        `font:500 ${fs}px/1 Geist`,
        `color:${on ? '#fff' : '#332D28'}`,
        'cursor:pointer',
        'transition:background .16s ease, border-color .16s ease, color .16s ease'
      )}
    >
      {label}
      {count !== undefined && count !== null ? (
        <span style={S(`margin-left:7px;font:500 11px/1 ${T.mono};opacity:.7`)}>{count}</span>
      ) : null}
    </button>
  );
}

export function Badge({ label, bg = '#F6F2EE', color = '#57504A', py = 5, px = 9, r = 7, fs = 11, mono = true }) {
  return (
    <span
      style={s(
        `display:inline-block;padding:${py}px ${px}px`,
        `border-radius:${r}px`,
        `background:${bg}`,
        `font:500 ${fs}px/1 ${mono ? T.mono : 'Geist'}`,
        `color:${color}`,
        'white-space:nowrap'
      )}
    >
      {label}
    </span>
  );
}

export function ProgressBar({ pct, h = 6, bg = '#F1EBE4', fill = '#C2603C', r = 4, label }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={s(`height:${h}px`, `border-radius:${r}px`, `background:${bg}`, 'overflow:hidden')}
    >
      <div style={s(`width:${clamped}%`, 'height:100%', `border-radius:${r}px`, `background:${fill}`, 'transition:width .36s cubic-bezier(.16,1,.3,1)')} />
    </div>
  );
}

/* ---- states -------------------------------------------------------------- */

export function EmptyState({ title, body, cta, onCta, icon = '◇', compact }) {
  return (
    <div className="vu-screen" style={s(`padding:${compact ? '28px 20px' : '52px 32px'}`, 'text-align:center;display:flex;flex-direction:column;align-items:center')}>
      <div
        aria-hidden="true"
        style={S('width:44px;height:44px;border-radius:14px;background:#F6F2EE;border:1px solid #EFE9E2;display:grid;place-items:center;font-size:17px;color:#C2603C')}
      >
        {icon}
      </div>
      <div style={S(`margin-top:16px;font:600 ${compact ? 16 : 19}px/1.25 Geist;letter-spacing:-0.025em`)}>{title}</div>
      <div style={S(`margin-top:8px;max-width:380px;font:450 ${compact ? 13 : 14}px/1.55 Geist;color:#8A8179;text-wrap:pretty`)}>{body}</div>
      {cta ? (
        <div style={S('margin-top:18px')}>
          <PrimaryButton onClick={onCta} h={40} px={18} r={11} fs={14}>
            {cta}
          </PrimaryButton>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', body, retry = 'Try again', onRetry }) {
  return (
    <div role="alert" style={S('padding:40px 32px;text-align:center;display:flex;flex-direction:column;align-items:center')}>
      <div
        aria-hidden="true"
        style={S('width:44px;height:44px;border-radius:14px;background:#F5E7E0;border:1px solid #EFE3DC;display:grid;place-items:center;font:600 17px/1 Geist;color:#A8482A')}
      >
        !
      </div>
      <div style={S('margin-top:16px;font:600 19px/1.25 Geist;letter-spacing:-0.025em')}>{title}</div>
      <div style={S('margin-top:8px;max-width:400px;font:450 14px/1.55 Geist;color:#8A8179;text-wrap:pretty')}>{body}</div>
      {onRetry ? (
        <div style={S('margin-top:18px')}>
          <SecondaryButton onClick={onRetry} h={40} px={16} r={11} fs={14}>
            {retry}
          </SecondaryButton>
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ n = 3, h = 64 }) {
  return (
    <div style={S('display:flex;flex-direction:column;gap:10px')} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="vu-skel" style={S(`height:${h}px;border-radius:12px`)} />
      ))}
    </div>
  );
}

export function SectionLabel({ children, color = '#A9A097' }) {
  return <div style={S(`font:500 10px/1 ${T.mono};letter-spacing:.1em;text-transform:uppercase;color:${color}`)}>{children}</div>;
}
