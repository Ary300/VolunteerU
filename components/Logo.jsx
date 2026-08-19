'use client';

/* ==========================================================================
   Logo.jsx — the VolunteerU mark.
   A rounded "squircle" badge in the brand gradient with a soft top-left sheen,
   carrying a confident white check — the verified hour the whole product is
   built around. One reusable component so the mark is identical everywhere
   (header, sidebar, auth, onboarding, share pages).
   ========================================================================== */

import { useId } from 'react';

export function Logo({ size = 26, title = 'VolunteerU' }) {
  const uid = useId();
  const g = `${uid}g`;
  const h = `${uid}h`;
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
      </defs>
      {/* squircle badge */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="10.5" fill={`url(#${g})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="10.5" fill={`url(#${h})`} />
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="10.25" fill="none" stroke="rgba(60,20,8,0.14)" strokeWidth="1" />
      {/* the check */}
      <path
        d="M8.6 16.4 L13.7 21.6 L23.6 9.8"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
