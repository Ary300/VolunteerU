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
  // The mark is slightly wider than tall (~1.16:1). Scale by height and let the
  // width follow, so it fills its height next to the wordmark instead of being
  // shrunk to fit a square box.
  return (
    <img
      src="/logo.png"
      height={size}
      alt={title}
      style={{ display: 'block', flex: 'none', height: size, width: 'auto' }}
    />
  );
}
