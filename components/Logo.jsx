'use client';

/* ==========================================================================
   Logo.jsx — the VolunteerU mark.
   A custom glyph, not a font letter: an upward "V" whose right arm rises past
   the left, reading at once as the V of VolunteerU and as a check — the
   verified hour the product is built around. One reusable component so the mark
   is identical everywhere (header, sidebar, auth, onboarding, share pages).
   ========================================================================== */

import { useId } from 'react';

export function Logo({ size = 26, title = 'VolunteerU' }) {
  const gid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      style={{ display: 'block', flex: 'none' }}
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D8805F" />
          <stop offset="1" stopColor="#A8482A" />
        </linearGradient>
      </defs>
      {/* badge */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill={`url(#${gid})`} />
      {/* soft top highlight for depth */}
      <path d="M9 2.4 H23" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="none" stroke="rgba(60,20,8,0.12)" strokeWidth="1" />
      {/* the mark: an upward, verified V */}
      <path
        d="M8 10.5 L15 22 L24 7.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
