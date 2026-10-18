'use client';

/* ==========================================================================
   Logo.jsx, the VolunteerU "VU" mark: two figures reaching to form the
   letters. Ember on light surfaces (public/logo.png), white on photos and
   dark panels (public/logo-white.png). One component so the mark matches
   everywhere, including the browser tab icon.
   ========================================================================== */

/**
 * @param {object} props
 * @param {number} [props.size]  height in px; width follows the ~1.16:1 mark
 * @param {string} [props.title] alt text; pass "" when a visible wordmark sits beside it
 * @param {'ember'|'white'} [props.tone]
 */
export function Logo({ size = 26, title = 'VolunteerU', tone = 'ember' }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={tone === 'white' ? '/logo-white.png' : '/logo.png'}
      height={size}
      width={Math.round(size * 1.1575)}
      alt={title}
      style={{ display: 'block', flex: 'none', height: size, width: 'auto' }}
    />
  );
}

/** The mark with the wordmark beside it, as in the sidebar and top bars. */
export function Wordmark({ size = 26, tone = 'ember', fs }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.36), color: tone === 'white' ? '#fff' : '#1E2421', font: `700 ${fs || Math.round(size * 0.72)}px/1 var(--font-display), var(--font-body), sans-serif`, letterSpacing: '-0.02em' }}>
      <Logo size={size} title="" tone={tone} />
      VolunteerU
    </span>
  );
}
