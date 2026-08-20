'use client';

/* ==========================================================================
   Logo.jsx — the VolunteerU mark.
   An abstract three-petal bloom set in a rounded badge: three forms converging
   on a bright center — people turning out and coming together, the idea the
   product is built on. Warm earth gradient with a soft top-left sheen. One
   reusable component so the mark is identical everywhere (header, sidebar,
   auth, onboarding, share pages).
   ========================================================================== */

import { useId } from 'react';

export function Logo({ size = 26, title = 'VolunteerU' }) {
  const uid = useId();
  const g = `${uid}g`;
  const h = `${uid}h`;
  const p = `${uid}p`;
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
        <linearGradient id={g} x1="3" y1="1" x2="29" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E28A65" />
          <stop offset="0.55" stopColor="#C2603C" />
          <stop offset="1" stopColor="#A8482A" />
        </linearGradient>
        <radialGradient id={h} cx="0.28" cy="0.22" r="0.9">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* soft vertical shade on each petal so the bloom reads three-dimensional */}
        <linearGradient id={p} x1="16" y1="1.5" x2="16" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.82" />
        </linearGradient>
      </defs>

      {/* rounded badge */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="10.5" fill={`url(#${g})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="10.5" fill={`url(#${h})`} />
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="10.25" fill="none" stroke="rgba(60,20,8,0.14)" strokeWidth="1" />

      {/* three-petal bloom converging on the center */}
      <g>
        <ellipse cx="16" cy="10" rx="5.5" ry="6.6" fill={`url(#${p})`} transform="rotate(0 16 16)" />
        <ellipse cx="16" cy="10" rx="5.5" ry="6.6" fill={`url(#${p})`} transform="rotate(120 16 16)" />
        <ellipse cx="16" cy="10" rx="5.5" ry="6.6" fill={`url(#${p})`} transform="rotate(240 16 16)" />
      </g>
      {/* warm center — an aperture the petals bloom from */}
      <circle cx="16" cy="16" r="3.4" fill={`url(#${g})`} />
      <circle cx="16" cy="16" r="1.7" fill="#fff" fillOpacity="0.96" />
    </svg>
  );
}
