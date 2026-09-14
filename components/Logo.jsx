'use client';

/* ==========================================================================
   Logo.jsx, the VolunteerU mark.
   Two figures reaching to form the "VU" — people helping people, the core of
   the product. One reusable component so the mark is identical everywhere
   (header, sidebar, auth, onboarding, share pages) and matches the browser
   tab / app icon exactly. Transparent PNG so it sits cleanly on the light
   surfaces and the dark auth panel alike.
   ========================================================================== */

export function Logo({ size = 26, title = 'VolunteerU' }) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt={title}
      style={{ display: 'block', flex: 'none', objectFit: 'contain' }}
    />
  );
}
