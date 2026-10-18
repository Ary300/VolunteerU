'use client';

/* ==========================================================================
   ui.jsx, the shared primitives of the photo-first design system.
   Export names and props are unchanged from the earlier version, so every
   screen keeps working; the look comes from lib/tokens.js. Hover, focus and
   pressed states live in app/globals.css (inline styles can't express them).
   New here: Button (variants), Segmented, Tabs, StatusPill, CauseDot.
   ========================================================================== */

import { useEffect, useId, useState, useRef } from 'react';
import Link from 'next/link';
import { S, s, cx, H, remapColor } from '../lib/style.js';
import { C, F, R, TONES, causeOf } from '../lib/tokens.js';

/* ---- icons ---------------------------------------------------------------
   Lucide-style line icons: 24px grid, round caps and joins, currentColor.
   Stroke is 1.75 by default and 1.5 at 24px and above. Decorative unless a
   `label` is passed. Entries are [tag, attrs] pairs so circles and rects stay
   exact. Aliases map older names and legacy glyphs onto the same drawings.
   ------------------------------------------------------------------------- */

const p = (d) => ['path', { d }];
const ci = (cx, cy, r) => ['circle', { cx, cy, r }];
const re = (x, y, width, height, rx = 0) => ['rect', { x, y, width, height, rx }];

const ICONS = {
  check: [p('M20 6 9 17l-5-5')],
  x: [p('M18 6 6 18'), p('m6 6 12 12')],
  plus: [p('M5 12h14'), p('M12 5v14')],
  minus: [p('M5 12h14')],
  'arrow-right': [p('M5 12h14'), p('m12 5 7 7-7 7')],
  'arrow-left': [p('m12 19-7-7 7-7'), p('M19 12H5')],
  'arrow-up': [p('m5 12 7-7 7 7'), p('M12 19V5')],
  'arrow-down': [p('M12 5v14'), p('m19 12-7 7-7-7')],
  external: [p('M15 3h6v6'), p('M10 14 21 3'), p('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6')],
  'chevron-down': [p('m6 9 6 6 6-6')],
  'chevron-up': [p('m18 15-6-6-6 6')],
  'chevron-right': [p('m9 18 6-6-6-6')],
  'chevron-left': [p('m15 18-6-6 6-6')],
  star: [p('M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z')],
  heart: [p('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z')],
  pin: [p('M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'), ci(12, 10, 3)],
  calendar: [p('M8 2v4'), p('M16 2v4'), re(3, 4, 18, 18, 2), p('M3 10h18')],
  clock: [ci(12, 12, 10), p('M12 6v6l4 2')],
  search: [ci(11, 11, 8), p('m21 21-4.3-4.3')],
  bell: [p('M10.268 21a2 2 0 0 0 3.464 0'), p('M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326')],
  home: [p('M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'), p('M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')],
  compass: [ci(12, 12, 10), p('m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z')],
  user: [p('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'), ci(12, 7, 4)],
  users: [p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), ci(9, 7, 4), p('M22 21v-2a4 4 0 0 0-3-3.87'), p('M16 3.13a4 4 0 0 1 0 7.75')],
  flag: [p('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'), p('M4 22v-7')],
  settings: [
    p('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'),
    ci(12, 12, 3),
  ],
  help: [ci(12, 12, 10), p('M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'), p('M12 17h.01')],
  info: [ci(12, 12, 10), p('M12 16v-4'), p('M12 8h.01')],
  alert: [ci(12, 12, 10), p('M12 8v4'), p('M12 16h.01')],
  'check-circle': [ci(12, 12, 10), p('m9 12 2 2 4-4')],
  'x-circle': [ci(12, 12, 10), p('m15 9-6 6'), p('m9 9 6 6')],
  'badge-check': [p('M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z'), p('m9 12 2 2 4-4')],
  'log-out': [p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'), p('m16 17 5-5-5-5'), p('M21 12H9')],
  'log-in': [p('M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4'), p('m10 17 5-5-5-5'), p('M15 12H3')],
  bookmark: [p('m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z')],
  edit: [p('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'), p('m15 5 4 4')],
  trash: [p('M3 6h18'), p('M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'), p('M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2')],
  link: [p('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'), p('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71')],
  copy: [re(8, 8, 14, 14, 2), p('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2')],
  mail: [re(2, 4, 20, 16, 2), p('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7')],
  message: [p('M7.9 20A9 9 0 1 0 4 16.1L2 22Z')],
  send: [p('M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z'), p('m21.854 2.147-10.94 10.939')],
  filter: [p('M21 4h-7'), p('M10 4H3'), p('M21 12h-9'), p('M8 12H3'), p('M21 20h-5'), p('M12 20H3'), p('M14 2v4'), p('M8 10v4'), p('M16 18v4')],
  list: [p('M3 6h.01'), p('M3 12h.01'), p('M3 18h.01'), p('M8 6h13'), p('M8 12h13'), p('M8 18h13')],
  grid: [re(3, 3, 7, 7, 1), re(14, 3, 7, 7, 1), re(14, 14, 7, 7, 1), re(3, 14, 7, 7, 1)],
  more: [ci(12, 12, 1), ci(19, 12, 1), ci(5, 12, 1)],
  menu: [p('M4 6h16'), p('M4 12h16'), p('M4 18h16')],
  lock: [re(3, 11, 18, 11, 2), p('M7 11V7a5 5 0 0 1 10 0v4')],
  eye: [p('M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'), ci(12, 12, 3)],
  'eye-off': [p('M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'), p('M14.084 14.158a3 3 0 0 1-4.242-4.242'), p('M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'), p('m2 2 20 20')],
  download: [p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), p('m7 10 5 5 5-5'), p('M12 15V3')],
  upload: [p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), p('m17 8-5-5-5 5'), p('M12 3v12')],
  share: [p('M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'), p('m16 6-4-4-4 4'), p('M12 2v13')],
  image: [re(3, 3, 18, 18, 2), ci(9, 9, 2), p('m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21')],
  map: [p('M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z'), p('M15 5.764v15'), p('M9 3.236v15')],
  globe: [ci(12, 12, 10), p('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'), p('M2 12h20')],
  building: [re(4, 2, 16, 20, 2), p('M9 22v-4h6v4'), p('M8 6h.01'), p('M16 6h.01'), p('M12 6h.01'), p('M12 10h.01'), p('M12 14h.01'), p('M16 10h.01'), p('M16 14h.01'), p('M8 10h.01'), p('M8 14h.01')],
  clipboard: [re(8, 2, 8, 4, 1), p('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2')],
  inbox: [p('M22 12h-6l-2 3h-4l-2-3H2'), p('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z')],
  award: [p('m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526'), ci(12, 8, 6)],
  leaf: [p('M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z'), p('M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12')],
  refresh: [p('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'), p('M21 3v5h-5'), p('M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'), p('M8 16H3v5')],
  phone: [re(5, 2, 14, 20, 2), p('M12 18h.01')],
  laptop: [p('M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16')],
  monitor: [re(2, 3, 20, 14, 2), p('M8 21h8'), p('M12 17v4')],
  sun: [ci(12, 12, 4), p('M12 2v2'), p('M12 20v2'), p('m4.93 4.93 1.41 1.41'), p('m17.66 17.66 1.41 1.41'), p('M2 12h2'), p('M20 12h2'), p('m6.34 17.66-1.41 1.41'), p('m19.07 4.93-1.41 1.41')],
  contrast: [ci(12, 12, 10), p('M12 18a6 6 0 0 0 0-12v12z')],
  text: [p('M4 7V4h16v3'), p('M9 20h6'), p('M12 4v16')],
  shield: [p('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z')],
  file: [p('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'), p('M14 2v4a2 2 0 0 0 2 2h4')],
  folder: [p('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z')],
  dot: [ci(12, 12, 1)],
  navigation: [p('M3 11 22 2l-9 19-2-8-8-2z')],
  maximize: [p('M15 3h6v6'), p('M9 21H3v-6'), p('m21 3-7 7'), p('m3 21 7-7')],
  crosshair: [ci(12, 12, 10), p('M22 12h-4'), p('M6 12H2'), p('M12 6V2'), p('M12 22v-4')],
  'qr-code': [re(3, 3, 5, 5, 1), re(16, 3, 5, 5, 1), re(3, 16, 5, 5, 1), p('M21 16h-3a2 2 0 0 0-2 2v3'), p('M21 21v.01'), p('M12 7v3a2 2 0 0 1-2 2H7'), p('M3 12h.01'), p('M12 3h.01'), p('M12 16v.01'), p('M16 12h1'), p('M21 12v.01'), p('M12 21v-1')],
  // causes
  apple: [p('M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z'), p('M10 2c1 .5 2 2 2 5')],
  book: [p('M12 7v14'), p('M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z')],
  sprout: [p('M7 20h10'), p('M10 20c5.5-2.5.8-6.4 3-10'), p('M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z'), p('M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z')],
  paw: [ci(11, 4, 2), ci(18, 8, 2), ci(20, 16, 2), p('M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z')],
  bed: [p('M2 4v16'), p('M2 8h18a2 2 0 0 1 2 2v10'), p('M2 17h20'), p('M6 8v9')],
  armchair: [p('M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3'), p('M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z'), p('M5 18v2'), p('M19 18v2')],
  'heart-pulse': [p('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'), p('M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27')],
  palette: [ci(13.5, 6.5, 1), ci(17.5, 10.5, 1), ci(8.5, 7.5, 1), ci(6.5, 12.5, 1), p('M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z')],
  landmark: [p('M3 22h18'), p('M6 18v-7'), p('M10 18v-7'), p('M14 18v-7'), p('M18 18v-7'), p('M12 2 20 7H4z')],
  'life-buoy': [ci(12, 12, 10), ci(12, 12, 4), p('m4.93 4.93 4.24 4.24'), p('m14.83 9.17 4.24-4.24'), p('m14.83 14.83 4.24 4.24'), p('m9.17 14.83-4.24 4.24')],
  'hand-heart': [p('M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16'), p('m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9'), p('m2 15 6 6'), p('M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z')],
  // second and third drawings per cause, so neighbouring cause tiles differ
  'graduation-cap': [p('M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z'), p('M22 10v6'), p('M6 12.5V16a6 3 0 0 0 12 0v-3.5')],
  backpack: [p('M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'), p('M8 10h8'), p('M8 18h8'), p('M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6'), p('M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2')],
  carrot: [p('M2.27 21.7s9.87-3.5 12.73-6.36a4.5 4.5 0 0 0-6.36-6.37C5.77 11.84 2.27 21.7 2.27 21.7z'), p('M8.64 14l-2.05-2.04'), p('M15.34 15l-2.46-2.46'), p('M22 9s-1.33-2-3.5-2C16.86 7 15 9 15 9s1.33 2 3.5 2S22 9 22 9z'), p('M15 2s-2 1.33-2 3.5S15 9 15 9s2-1.84 2-3.5C17 3.33 15 2 15 2z')],
  utensils: [p('M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2'), p('M7 2v20'), p('M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7')],
  'tree-pine': [p('m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z'), p('M12 22v-3')],
  bird: [p('M16 7h.01'), p('M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20'), p('m20 7 2 .5-2 .5'), p('M10 18v3'), p('M14 17.75V21'), p('M7 18a6 6 0 0 0 3.84-10.61')],
  fish: [p('M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z'), p('M18 12v.5'), p('M16 17.93a9.77 9.77 0 0 1 0-11.86'), p('M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33'), p('M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4'), p('m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98')],
  tent: [p('M3.5 21 14 3'), p('M20.5 21 10 3'), p('M15.5 21 12 15l-3.5 6'), p('M2 21h20')],
  shirt: [p('M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z')],
  stethoscope: [p('M11 2v2'), p('M5 2v2'), p('M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1'), p('M8 15a6 6 0 0 0 12 0v-3'), ci(20, 10, 2)],
  coffee: [p('M10 2v2'), p('M14 2v2'), p('M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1'), p('M6 2v2')],
  music: [p('M9 18V5l12-2v13'), ci(6, 18, 3), ci(18, 16, 3)],
  vote: [p('m9 12 2 2 4-4'), p('M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z'), p('M22 19H2')],
  package: [p('M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z'), p('M12 22V12'), p('m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7'), p('m7.5 4.27 9 5.15')],
};

/* Other names screens may reach for, mapped onto the drawings above. */
const ALIAS = {
  'map-pin': 'pin', 'near-you': 'navigation', locate: 'navigation', cal: 'calendar', chev: 'chevron-right', chevl: 'chevron-left', chevd: 'chevron-down',
  sliders: 'filter', pen: 'edit', pencil: 'edit', msg: 'message', vcheck: 'badge-check', verified: 'badge-check',
  food: 'apple', hunger: 'apple', education: 'book', 'book-open': 'book', environment: 'sprout', animals: 'paw',
  homelessness: 'bed', seniors: 'armchair', chair: 'armchair', health: 'heart-pulse', pulse: 'heart-pulse', arts: 'palette', art: 'palette',
  civic: 'landmark', online: 'monitor', remote: 'monitor', disaster: 'life-buoy', other: 'hand-heart', close: 'x', ellipsis: 'more',
  '✓': 'check', '✔': 'check', '☑': 'check-circle', '✕': 'x', '✗': 'x', '×': 'x',
  '→': 'arrow-right', '←': 'arrow-left', '↑': 'arrow-up', '↓': 'arrow-down', '↗': 'external',
  '＋': 'plus', '+': 'plus', '−': 'minus', '★': 'star', '⭐': 'star', '☆': 'star', '♥': 'heart', '❤': 'heart',
  '📍': 'pin', '🔗': 'link', '📋': 'clipboard', '💬': 'message', '💻': 'laptop', '⚙': 'settings', '?': 'help',
  '⇥': 'log-out', '☰': 'bell', '☺': 'user', '❖': 'users', '◈': 'flag', '◎': 'compass', '◇': 'home',
  '◷': 'clock', '✎': 'edit', '▤': 'list', '⋯': 'more', '⚑': 'flag', '◐': 'contrast', '🔀': 'refresh', '▾': 'chevron-down',
};

const FILLABLE = new Set(['star', 'heart', 'bookmark', 'pin']);

export const ICON_NAMES = Object.keys(ICONS);

function resolveIcon(name) {
  if (!name) return null;
  if (ICONS[name]) return name;
  return ALIAS[name] && ICONS[ALIAS[name]] ? ALIAS[name] : null;
}

export function Icon({ name, size = 16, stroke, label, filled = false, fillColor, color, style, className }) {
  const key = resolveIcon(name);
  if (!key) return null;
  const shapes = ICONS[key];
  const sw = stroke !== undefined ? stroke : size >= 24 ? 1.5 : 1.75;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fillColor || (filled && FILLABLE.has(key) ? 'currentColor' : 'none')}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      className={className}
      style={{ display: 'block', flex: 'none', color: remapColor(color), ...(style || {}) }}
    >
      {shapes.map(([Tag, attrs], i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}

/** Accepts an icon name, a legacy glyph or a React node; returns something renderable or null. */
export function renderIcon(icon, size = 14, extra) {
  if (!icon) return null;
  if (typeof icon !== 'string') return icon;
  if (resolveIcon(icon)) return <Icon name={icon} size={size} {...(extra || {})} />;
  return null;
}

/* ---- image slot ----------------------------------------------------------- */

export function ImageSlot({ src, shape = 'rounded', radius = 16, placeholder = 'photo', alt = '', position }) {
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
    <div className="vu-slot" data-state={hasSrc ? status : 'failed'} data-placeholder={placeholder} style={S(br)}>
      {hasSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={position ? { objectPosition: position } : undefined}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('failed')}
        />
      ) : null}
      <span className="vu-slot-ph" aria-hidden="true">
        <Icon name="image" size={18} />
      </span>
    </div>
  );
}

/* An identity avatar for REAL people: their own photo if they added one,
   otherwise initials. One neutral tone for everyone (mist, ink2, Figtree):
   a rainbow of hashed tints in front of every row is a generated-list tell.
   Never a stock face. */
export function Avatar({ name = '', src = '', fs = 15 }) {
  if (src) return <ImageSlot src={src} shape="circle" placeholder="face" />;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = (parts.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
  return (
    <div aria-hidden="true" style={S(`width:100%;height:100%;display:grid;place-items:center;border-radius:50%;background:${C.mist};color:${C.ink2};font:600 ${fs}px/1 ${F.body}`)}>
      {initials}
    </div>
  );
}

/* ---- buttons ---------------------------------------------------------------
   Primary is Ember (one per view where possible). Dark ink for secondary
   emphasis. Outline for the rest. Ghost is an underlined text action.
   ------------------------------------------------------------------------- */

const flexBase = (o) =>
  [
    o.full ? 'display:flex;width:100%' : 'display:inline-flex',
    'align-items:center',
    o.center || o.full ? 'justify-content:center' : '',
    'gap:8px;white-space:nowrap;text-decoration:none',
    o.full ? '' : 'flex:none',
  ]
    .filter(Boolean)
    .join(';');

/* Brand colors from the retired palette, so a call site that still passes one
   gets the role it meant instead of a stray color. */
const OLD_BRAND = /^#(C2603C|A8482A|D2775B|B14E2C)$/i;

const VARIANT = {
  primary: { cls: 'vu-btn-primary', css: `background:${C.ember};color:#fff;border:1px solid ${C.ember}` },
  dark: { cls: 'vu-btn-dark', css: `background:${C.ink};color:#fff;border:1px solid ${C.ink}` },
  outline: { cls: 'vu-btn-outline', css: `background:#fff;color:${C.ink};border:1px solid ${C.line2}` },
  danger: { cls: 'vu-btn-danger', css: `background:#fff;color:${C.emberDeep};border:1px solid ${C.line2}` },
  ghost: { cls: 'vu-btn-ghost', css: `background:transparent;color:${C.ink};border:0;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px` },
};
const SIZE = { sm: { h: 36, px: 14, fs: 14 }, md: { h: 44, px: 18, fs: 15 }, lg: { h: 52, px: 22, fs: 16 } };

/* ---- waiting buttons --------------------------------------------------------
   A button that starts an async action is disabled the moment it is pressed
   (a second click can't fire it again), but its face changes only when the
   wait runs past BUSY_SHOW_MS: fast actions never flash a spinner or a
   "Saving" label. Past that, the label it had before the press keeps its
   space (hidden), a small spinner sits centered on top and the busy label
   the call site passed goes to screen readers, so the button never changes
   width. When the action ends, the call site's result label shows in place.
   ------------------------------------------------------------------------- */
const BUSY_SHOW_MS = 150;

function useBusyFace(busy, icon, children) {
  const [late, setLate] = useState(false);
  const idle = useRef({ icon, children });
  if (!busy) idle.current = { icon, children };
  useEffect(() => {
    if (!busy) {
      setLate(false);
      return undefined;
    }
    const t = setTimeout(() => setLate(true), BUSY_SHOW_MS);
    return () => clearTimeout(t);
  }, [busy]);
  return { late: Boolean(busy && late), idle: busy ? idle.current : { icon, children } };
}

/** Button contents for every state. `gap` matches the button's own flex gap. */
function ButtonFace({ busy, icon, iconSize, children, gap = 8 }) {
  const { late, idle } = useBusyFace(busy, icon, children);
  if (!late) {
    return (
      <>
        {renderIcon(idle.icon, iconSize)}
        {idle.children}
      </>
    );
  }
  return (
    <>
      <span aria-hidden="true" style={S(`display:inline-flex;align-items:center;gap:${gap}px;visibility:hidden`)}>
        {renderIcon(idle.icon, iconSize)}
        {idle.children}
      </span>
      <span aria-hidden="true" style={S('position:absolute;inset:0;display:grid;place-items:center;pointer-events:none')}>
        <span className="vu-spin" />
      </span>
      <span className="vu-sr">{children}</span>
    </>
  );
}

/**
 * One button for every variant. Renders an <a> when `href` is given.
 * <Button variant="primary|dark|outline|danger|ghost" size="sm|md|lg" icon="plus" full busy>Log hours</Button>
 */
export function Button({ variant = 'outline', size = 'md', icon, iconSize, href, children, full, busy, disabled, type = 'button', onClick, extra = '', className, ...rest }) {
  const v = VARIANT[variant] || VARIANT.outline;
  const z = SIZE[size] || SIZE.md;
  const style = s(
    flexBase({ full, center: true }),
    /* A ghost button reads as an underlined text link, so its text sits flush
       with the column: no side padding (and no border, see VARIANT.ghost). */
    variant === 'ghost' ? 'padding:0' : `padding:0 ${z.px}px`,
    `height:${z.h}px;border-radius:${R.control}`,
    v.css,
    `font:600 ${z.fs}px/1 ${F.body};cursor:pointer;position:relative`,
    'transition:background .16s ease, border-color .16s ease, color .16s ease, transform .08s ease',
    extra
  );
  const inner = (
    <ButtonFace busy={busy} icon={icon} iconSize={iconSize || (z.fs >= 16 ? 18 : 16)}>
      {children}
    </ButtonFace>
  );
  if (href) {
    // Same-site paths use next/link so they navigate client-side.
    const Tag = /^\/(?!\/)/.test(href) && !rest.download && !rest.target ? Link : 'a';
    return (
      <Tag href={href} className={cx('vu-btn', v.cls, H.press, className)} style={style} aria-disabled={disabled ? 'true' : undefined} onClick={onClick} {...rest}>
        {inner}
      </Tag>
    );
  }
  return (
    <button
      type={type}
      className={cx('vu-btn', v.cls, H.press, className)}
      onClick={onClick}
      disabled={disabled || busy}
      data-disabled={disabled ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      aria-busy={busy ? 'true' : undefined}
      style={style}
      {...rest}
    >
      {inner}
    </button>
  );
}

export function DarkButton(props) {
  return <Button variant="dark" {...props} />;
}

export function PrimaryButton({
  children,
  h = 44,
  px = 18,
  r = 10,
  fs = 15,
  sh, // eslint-disable-line no-unused-vars -- kept for call-site compatibility; buttons carry no shadow
  icon = null,
  iconSize = 16,
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
      className={cx('vu-btn', 'vu-btn-primary', lift ? H.primaryLift : H.primary, H.press)}
      onClick={onClick}
      disabled={disabled || busy}
      data-disabled={disabled ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      style={s(
        flexBase({ center, full }),
        `padding:0 ${px}px`,
        `height:${h}px`,
        `border-radius:${Math.min(r, 12)}px`,
        `border:1px solid ${C.ember}`,
        `background:${C.ember}`,
        'color:#fff',
        `font:600 ${fs}px/1 ${F.body}`,
        ls ? `letter-spacing:${ls}` : '',
        'cursor:pointer;position:relative',
        'transition:background .16s ease, transform .08s ease',
        extra
      )}
      aria-busy={busy ? 'true' : undefined}
      {...rest}
    >
      <ButtonFace busy={busy} icon={icon} iconSize={iconSize}>{children}</ButtonFace>
    </button>
  );
}

export function SecondaryButton({
  children,
  h = 44,
  px = 16,
  r = 10,
  fs = 15,
  color = C.ink,
  borderColor = C.line2,
  bg = '#fff',
  icon,
  iconSize = 16,
  lift = false,
  onClick,
  disabled,
  busy,
  type = 'button',
  center,
  full,
  extra = '',
  shadow = true, // eslint-disable-line no-unused-vars -- kept for call-site compatibility; outline buttons carry no shadow
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx('vu-btn', 'vu-btn-outline', lift ? H.secondaryLift : H.secondary, H.press)}
      onClick={onClick}
      disabled={disabled || busy}
      data-disabled={disabled ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      style={s(
        flexBase({ center, full }),
        `padding:0 ${px}px`,
        `height:${h}px`,
        `border-radius:${Math.min(r, 12)}px`,
        `border:1px solid ${borderColor}`,
        `background:${bg}`,
        `color:${OLD_BRAND.test(color) ? C.ink : color}`,
        `font:600 ${fs}px/1 ${F.body}`,
        'cursor:pointer;position:relative',
        'transition:background .16s ease, border-color .16s ease, transform .08s ease',
        extra
      )}
      aria-busy={busy ? 'true' : undefined}
      {...rest}
    >
      <ButtonFace busy={busy} icon={icon} iconSize={iconSize}>{children}</ButtonFace>
    </button>
  );
}

/** Small outline button used inside table rows and cards. */
export function GhostButton({ children, py = 7, px = 12, r = 10, fs = 13, color = C.ink, tone, onClick, disabled, ...rest }) {
  return (
    <button
      type="button"
      className={cx('vu-btn', tone === 'danger' ? H.danger : H.secondary, H.press)}
      onClick={onClick}
      disabled={disabled}
      data-disabled={disabled ? 'true' : undefined}
      style={s(
        'display:inline-flex;align-items:center;gap:6px;white-space:nowrap',
        `padding:${py}px ${px}px`,
        `border-radius:${r}px`,
        `border:1px solid ${C.line2}`,
        'background:#fff',
        `font:600 ${fs}px/1 ${F.body}`,
        `color:${tone === 'danger' ? C.emberDeep : OLD_BRAND.test(color) ? C.ink : color}`,
        'cursor:pointer',
        'transition:background .16s ease, border-color .16s ease'
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Text-only action ("See all 12", "Manage people"): underlined ink, never colored. */
export function LinkButton({ children, fs = 14, color = C.ink, onClick, extra = '', ...rest }) {
  return (
    <button
      type="button"
      className={cx('vu-link', H.press)}
      onClick={onClick}
      style={s(
        `font:600 ${fs}px/1.2 ${F.body}`,
        `color:${OLD_BRAND.test(color) ? C.ink : color}`,
        'cursor:pointer;background:none;border:none;padding:0',
        'text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px',
        extra
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A div that behaves like a button: keyboard operable, focusable, with ARIA
 * state. Prefer a real <button> in new code.
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

const LABEL_CSS = `display:block;font:600 13px/1.2 ${F.body};color:${C.ink}`;
const REQ = (
  <span aria-hidden="true" style={S(`color:${C.ember}`)}>
    {' *'}
  </span>
);
const inputCss = (bg, fs) =>
  [
    `background:${bg === '#FCFAF8' || bg === '#FAF8F5' ? '#fff' : bg}`,
    `border:1px solid ${C.line2}`,
    `border-radius:${R.control}`,
    `font:400 ${fs}px/1.3 ${F.body}`,
    `color:${C.ink}`,
    'transition:border-color .16s ease, box-shadow .16s ease',
  ].join(';');

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
        <label htmlFor={fid} style={S(LABEL_CSS)}>
          {label}
          {required ? REQ : null}
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
        className={cx('vu-input', H.input)}
        style={s(`margin-top:${label ? 8 : 0}px`, 'width:100%;height:46px;padding:0 14px', inputCss(bg, fs), readOnly ? `color:${C.ink2};background:${C.mist}` : '')}
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

/** Words in a string, whitespace-separated. Empty/whitespace counts as 0. */
export function countWords(str) {
  const t = String(str || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function TextArea({
  label,
  value = '',
  onChange,
  placeholder = '',
  minHeight = 96,
  maxLength,
  maxWords,
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
  const words = countWords(value);
  // A word cap keeps a generous char safety net so paste-bombs can't blow up the
  // field, but the visible counter and the over-limit flag track words.
  const charGuard = maxWords ? maxWords * 12 : maxLength;
  return (
    <div>
      {label ? (
        <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:12px')}>
          <label htmlFor={fid} style={S(LABEL_CSS)}>
            {label}
            {required ? REQ : null}
          </label>
          {counter && maxWords ? (
            <div className="vu-count" data-over={words > maxWords ? 'true' : 'false'}>
              {words} / {maxWords} words
            </div>
          ) : counter && maxLength ? (
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
        maxLength={charGuard}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={error ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
        aria-describedby={error ? eid : undefined}
        onChange={(e) => onChange && onChange(e.target.value, e)}
        className={cx('vu-input', H.input)}
        style={s(`margin-top:${label ? 8 : 0}px`, 'display:block;width:100%;padding:12px 14px', inputCss(bg, fs), `line-height:1.5;min-height:${minHeight}px`)}
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

/** Native select drawn like the text fields, with a chevron. */
export function Select({ label, value, onChange, options = [], bg = '#fff', fs = 15, error, hint, id, name, ariaLabel }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div>
      {label ? (
        <label htmlFor={fid} style={S(LABEL_CSS)}>
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
          className={cx('vu-input', H.input)}
          style={s('width:100%;height:46px;padding:0 38px 0 14px;cursor:pointer', inputCss(bg, fs))}
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
        <span aria-hidden="true" style={S(`position:absolute;right:14px;top:50%;transform:translateY(-50%);pointer-events:none;color:${C.ink3}`)}>
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
      {error ? <div className="vu-err">{error}</div> : hint ? <div className="vu-hint">{hint}</div> : null}
    </div>
  );
}

/** Checkbox: a 20px rounded box, ink when checked. */
export function Checkbox({ checked, onChange, label, size = 20, id, describedBy }) {
  const auto = useId();
  const cid = id || auto;
  return (
    <label htmlFor={cid} className="vu-check" style={S('display:flex;gap:12px;align-items:flex-start;cursor:pointer')}>
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
        className="vu-check-box"
        style={s(
          `width:${size}px;height:${size}px;border-radius:6px`,
          `border:1.5px solid ${checked ? C.ink : C.line2}`,
          `background:${checked ? C.ink : '#fff'}`,
          'flex:none;margin-top:1px;display:grid;place-items:center;color:#fff',
          'transition:border-color .16s ease, background .16s ease'
        )}
      >
        {checked ? <Icon name="check" size={13} stroke={2.5} /> : null}
      </span>
      <span style={S(`font:400 15px/1.45 ${F.body};color:${C.ink}`)}>{label}</span>
    </label>
  );
}

export function RadioDot({ checked }) {
  return (
    <span
      aria-hidden="true"
      style={s(
        'width:20px;height:20px;border-radius:50%',
        `border:1.5px solid ${checked ? C.ink : C.line2}`,
        'background:#fff;flex:none;display:grid;place-items:center',
        'transition:border-color .16s ease'
      )}
    >
      {checked ? <span className="vu-pop" style={S(`width:10px;height:10px;border-radius:50%;background:${C.ink}`)} /> : null}
    </span>
  );
}

/** Settings switch. On fills the track ink and moves the knob right. */
export function Toggle({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on ? 'true' : 'false'}
      aria-label={label}
      disabled={disabled}
      data-disabled={disabled ? 'true' : undefined}
      className={cx('vu-toggle', H.press)}
      onClick={() => onChange && onChange(!on)}
      style={s(
        'width:44px;height:26px;border-radius:13px;border:none',
        `background:${on ? C.ink : C.line2}`,
        'position:relative;cursor:pointer;flex:none',
        'transition:background .16s ease'
      )}
    >
      <span
        aria-hidden="true"
        style={s(
          'position:absolute;top:3px',
          `left:${on ? 21 : 3}px`,
          'width:20px;height:20px;border-radius:50%;background:#fff',
          'box-shadow:0 1px 2px rgba(30,36,33,.25)',
          'transition:left .16s cubic-bezier(.22,.61,.36,1)'
        )}
      />
    </button>
  );
}

/** Filter chip: a pill, ink when selected. `count` shows a number after the label. */
export function Chip({ label, on, onClick, py = 9, px = 16, r, fs = 14, role = 'button', ariaLabel, count, icon }) {
  const isCheckbox = role === 'checkbox';
  void r; // chips are always pills in this system
  return (
    <button
      type="button"
      role={isCheckbox ? 'checkbox' : undefined}
      aria-checked={isCheckbox ? (on ? 'true' : 'false') : undefined}
      aria-pressed={isCheckbox ? undefined : on ? 'true' : 'false'}
      aria-label={ariaLabel}
      className={cx('vu-chip', on ? 'is-on' : '', H.press)}
      data-on={on ? 'true' : 'false'}
      onClick={onClick}
      style={s(
        'display:inline-flex;align-items:center;gap:6px;white-space:nowrap',
        `padding:${py}px ${px}px`,
        'border-radius:999px',
        `border:1px solid ${on ? C.ink : C.line2}`,
        `background:${on ? C.ink : '#fff'}`,
        `font:500 ${fs}px/1.1 ${F.body}`,
        `color:${on ? '#fff' : C.ink}`,
        'cursor:pointer',
        'transition:background .16s ease, border-color .16s ease, color .16s ease'
      )}
    >
      {renderIcon(icon, 16)}
      {label}
      {count !== undefined && count !== null ? (
        <span style={S(`font:500 ${Math.max(12, fs - 1)}px/1 ${F.body};font-variant-numeric:tabular-nums;color:${on ? 'rgba(255,255,255,.72)' : C.ink3}`)}>{count}</span>
      ) : null}
    </button>
  );
}

/** Small tinted label. Pills only; tabular numerals so counts don't jiggle. */
export function Badge({ label, bg = C.mist, color = C.ink2, py = 5, px = 10, r, fs = 12, mono = true }) {
  void r;
  return (
    <span
      style={s(
        `display:inline-flex;align-items:center;padding:${py}px ${px}px`,
        'border-radius:999px',
        `background:${bg}`,
        `font:600 ${fs}px/1.1 ${F.body}`,
        mono ? 'font-variant-numeric:tabular-nums' : '',
        `color:${color}`,
        'white-space:nowrap'
      )}
    >
      {label}
    </span>
  );
}

export function ProgressBar({ pct, h = 6, bg = C.line, fill = C.ink, r, label }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const fillColor = OLD_BRAND.test(fill) || fill === C.ember ? C.ink : fill;
  const radius = r !== undefined ? r : h / 2;
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={s(`height:${h}px`, `border-radius:${radius}px`, `background:${bg === '#F1EBE4' ? C.line : bg}`, 'overflow:hidden')}
    >
      <div style={s(`width:${clamped}%`, 'height:100%', `border-radius:${radius}px`, `background:${fillColor}`, 'transition:width .36s cubic-bezier(.16,1,.3,1)')} />
    </div>
  );
}

/* ---- status --------------------------------------------------------------- */

const STATUS_ICON = { ok: 'check', wait: 'clock', bad: 'x', mute: null };
/**
 * Status pill: tinted background, 13px/600 text, optional icon.
 * tone: 'ok' (Confirmed, Accepted) | 'wait' (Waiting, Applied) | 'bad' (Not accepted) | 'mute' (Logged on your own, New)
 * icon: true for the tone's default icon, an icon name, or false.
 */
export function StatusPill({ tone = 'mute', children, icon = false, size = 'md', title }) {
  const t = TONES[tone] || TONES.mute;
  const ic = icon === true ? STATUS_ICON[tone] : icon || null;
  const sm = size === 'sm';
  return (
    <span
      title={title}
      style={s(
        'display:inline-flex;align-items:center;gap:6px;white-space:nowrap',
        sm ? 'padding:4px 9px' : 'padding:6px 11px',
        'border-radius:999px',
        `background:${t.bg};color:${t.fg}`,
        `font:600 ${sm ? 12 : 13}px/1 ${F.body}`
      )}
    >
      {ic ? <Icon name={ic} size={sm ? 13 : 15} stroke={2} /> : null}
      {children}
    </span>
  );
}

/**
 * Status in a row: a 7px dot and the word in the tone's color, no fill.
 * Rows always use this; a tinted StatusPill is for one headline status per region.
 * tone: 'ok' | 'wait' | 'bad' | 'mute'
 */
export function StatusText({ tone = 'mute', children, title }) {
  const t = TONES[tone] || TONES.mute;
  const fg = tone === 'mute' || !TONES[tone] ? C.ink2 : t.fg;
  return (
    <span className="vu-status-text" title={title} style={{ color: fg }}>
      <i aria-hidden="true" style={{ background: fg }} />
      {children}
    </span>
  );
}

/**
 * Icon-only button for row ends: 36x36, no border, ink3, mist fill on hover.
 * `label` is required (it becomes the accessible name). Pass `href` for a link.
 */
export function IconButton({ icon, label, onClick, href, size = 36, iconSize = 18, disabled, className, ...rest }) {
  const cls = cx('vu-iconbtn-sm', className);
  const st = { width: size, height: size };
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={cls} style={st} {...rest}>
        <Icon name={icon} size={iconSize} />
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cls} style={st} {...rest}>
      <Icon name={icon} size={iconSize} />
    </button>
  );
}

/** Small cause-colored dot, for cards, monograms and cause rows. */
export function CauseDot({ cause, size = 8, label }) {
  const c = causeOf(cause);
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      style={s(`display:inline-block;flex:none;width:${size}px;height:${size}px;border-radius:50%`, `background:${c.fg}`)}
    />
  );
}

/* ---- segmented control and tabs -------------------------------------------
   Both are ARIA tablists with roving focus (arrow keys, Home, End). Pass
   `panelId` per option when the control switches a tabpanel; otherwise they
   act as a filter (aria-selected still tells assistive tech which is on).
   ------------------------------------------------------------------------- */

function useRovingKeys(options, value, onChange) {
  return (e) => {
    const i = options.findIndex((o) => o.v === value);
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = options.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange && onChange(options[n].v);
    const list = e.currentTarget;
    requestAnimationFrame(() => {
      const btn = list.querySelectorAll('[role="tab"]')[n];
      if (btn) btn.focus();
    });
  };
}

/**
 * The picked option shows as selected on the press itself, even when the
 * parent's `value` only follows after a route change (Discover writes its
 * tab to the URL). The pick yields to `value` as soon as that changes, or
 * after PICK_HOLD_MS if the parent never takes it.
 */
const PICK_HOLD_MS = 4000;
function useOptimisticPick(value, onChange) {
  const [picked, setPicked] = useState(null);
  useEffect(() => { setPicked(null); }, [value]);
  useEffect(() => {
    if (picked === null) return undefined;
    const t = setTimeout(() => setPicked(null), PICK_HOLD_MS);
    return () => clearTimeout(t);
  }, [picked]);
  const shown = picked !== null ? picked.v : value;
  const pick = (v) => {
    if (v !== shown) setPicked({ v });
    if (onChange) onChange(v);
  };
  return [shown, pick];
}

/**
 * A value to show ahead of the one a route change will bring, for controls
 * whose state lives in the URL. `hold(v)` shows `v` at once; it yields as
 * soon as `resetKey` changes (the route landed) or after PICK_HOLD_MS.
 * Returns [held, hold]; `held` is undefined while nothing is held.
 */
export function useHeldValue(resetKey) {
  const [held, setHeld] = useState(null);
  useEffect(() => { setHeld(null); }, [resetKey]);
  useEffect(() => {
    if (held === null) return undefined;
    const t = setTimeout(() => setHeld(null), PICK_HOLD_MS);
    return () => clearTimeout(t);
  }, [held]);
  return [held === null ? undefined : held.v, (v) => setHeld({ v })];
}

/**
 * Pill segmented control with counts: "Opportunities 27 | Nonprofits 748".
 * options: [{ v, l, count?, panelId? }]
 */
export function Segmented({ options = [], value: committed, onChange: commit, label, size = 'md' }) {
  const [value, onChange] = useOptimisticPick(committed, commit);
  const onKeyDown = useRovingKeys(options, value, onChange);
  const sm = size === 'sm';
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="vu-seg" style={S(`display:inline-flex;max-width:100%;background:${C.mist};border-radius:999px;padding:4px;gap:2px`)}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="tab"
            aria-selected={on ? 'true' : 'false'}
            aria-controls={o.panelId}
            tabIndex={on ? 0 : -1}
            className={cx('vu-seg-item', on ? 'is-on' : '')}
            onClick={() => onChange && onChange(o.v)}
            style={s(
              'display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:none;cursor:pointer',
              `height:${sm ? 32 : 38}px;padding:0 ${sm ? 12 : 16}px;border-radius:999px`,
              `font:600 ${sm ? 13 : 14}px/1 ${F.body}`,
              on ? `background:#fff;color:${C.ink};box-shadow:inset 0 0 0 1px ${C.line2}` : `background:transparent;color:${C.ink2}`
            )}
          >
            {o.l}
            {o.count !== undefined && o.count !== null ? (
              <span style={S(`font-weight:500;color:${C.ink2};font-variant-numeric:tabular-nums`)}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Underline tabs (profile: Hours / Applications / Notes from organizers / About).
 * options: [{ v, l, count?, panelId? }]
 */
export function Tabs({ options = [], value: committed, onChange: commit, label }) {
  const [value, onChange] = useOptimisticPick(committed, commit);
  const onKeyDown = useRovingKeys(options, value, onChange);
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="vu-tabs vu-scroll-x" style={S(`display:flex;gap:28px;border-bottom:1px solid ${C.line}`)}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="tab"
            aria-selected={on ? 'true' : 'false'}
            aria-controls={o.panelId}
            tabIndex={on ? 0 : -1}
            className={cx('vu-tab', on ? 'is-on' : '')}
            onClick={() => onChange && onChange(o.v)}
            style={s(
              'display:inline-flex;align-items:center;gap:7px;white-space:nowrap;background:none;border:none;cursor:pointer',
              'padding:12px 0 13px;margin-bottom:-1px',
              `border-bottom:2px solid ${on ? C.ink : 'transparent'}`,
              `font:${on ? 600 : 500} 15px/1 ${F.body}`,
              `color:${on ? C.ink : C.ink2}`
            )}
          >
            {o.l}
            {o.count !== undefined && o.count !== null ? (
              <span style={S(`font-weight:500;color:${C.ink2};font-variant-numeric:tabular-nums`)}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---- states -------------------------------------------------------------- */

// The title is a real heading so screen-reader heading navigation finds it.
// Full-size empty states usually stand in for a whole screen or section (h2);
// compact ones sit under a section heading (h3). Pass `as` to override.
const EMPTY_HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4']);

/**
 * Nothing here yet. Left aligned under the page or section title, on a
 * hairline, like Profile's "No shifts yet": a heading, one line that says
 * what to do, and one action. No icon in a circle and no centered block.
 * `icon` is accepted for older callers and not drawn.
 */
// eslint-disable-next-line no-unused-vars
/**
 * Empty section: heading, one sentence, one action. `ctaVariant` keeps Ember
 * for the one screen whose next step is the primary action: 'outline' for a
 * secondary step, 'link' for an underlined text link (needs `ctaHref`), so
 * several empty pages in a row don't all end on the same Ember button.
 * @param {{ ctaVariant?: 'primary' | 'outline' | 'link' }} props
 */
export function EmptyState({ title, body, cta, onCta, icon, compact, as, ctaHref, ctaVariant = 'primary', children }) {
  const Heading = EMPTY_HEADING_TAGS.has(as) ? as : compact ? 'h3' : 'h2';
  const variant = ctaVariant === 'outline' ? 'outline' : 'primary';
  let action = null;
  if (cta && ctaVariant === 'link' && ctaHref) {
    action = (
      <Link href={ctaHref} onClick={onCta} className="vu-link-ul" style={S(`font:600 15px/1.3 ${F.body};color:${C.ink}`)}>
        {cta}
      </Link>
    );
  } else if (cta && ctaHref) {
    action = (
      <Button variant={variant} href={ctaHref} onClick={onCta}>
        {cta}
      </Button>
    );
  } else if (cta) {
    action = variant === 'outline' ? <SecondaryButton onClick={onCta}>{cta}</SecondaryButton> : <PrimaryButton onClick={onCta}>{cta}</PrimaryButton>;
  }
  return (
    <div
      className="vu-screen vu-empty"
      style={S(`margin-top:${compact ? 4 : 8}px;padding:${compact ? '18px 0 4px' : '24px 0 8px'};border-top:1px solid ${C.line};text-align:left;display:flex;flex-direction:column;align-items:flex-start`)}
    >
      <Heading style={S(`margin:0;font:600 ${compact ? 16 : 19}px/1.25 ${compact ? F.body : F.display};letter-spacing:${compact ? '0' : '-0.012em'};color:${C.ink}`)}>{title}</Heading>
      {body ? <div style={S(`margin-top:6px;max-width:520px;font:400 ${compact ? 14 : 15}px/1.5 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{body}</div> : null}
      {action ? <div style={S(`margin-top:${compact ? 14 : 18}px`)}>{action}</div> : null}
      {children ? <div style={S('margin-top:24px;align-self:stretch')}>{children}</div> : null}
    </div>
  );
}

/** Something failed to load. Same left-aligned layout as EmptyState, with a retry. */
export function ErrorState({ title = "This didn't load", body, retry = 'Try again', onRetry }) {
  return (
    <div role="alert" className="vu-empty" style={S(`margin-top:8px;padding:24px 0 8px;border-top:1px solid ${C.line};text-align:left;display:flex;flex-direction:column;align-items:flex-start`)}>
      <div style={S(`margin:0;font:600 19px/1.25 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>{title}</div>
      {body ? <div style={S(`margin-top:6px;max-width:520px;font:400 15px/1.5 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{body}</div> : null}
      {onRetry ? (
        <div style={S('margin-top:18px')}>
          <SecondaryButton onClick={onRetry} icon="refresh">
            {retry}
          </SecondaryButton>
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ n = 3, h = 64 }) {
  return (
    <div style={S('display:flex;flex-direction:column;gap:12px')} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="vu-skel" style={S(`height:${h}px;border-radius:10px`)} />
      ))}
    </div>
  );
}

/** Small section heading. Sentence case: no uppercase tracked eyebrows. */
export function SectionLabel({ children, color = C.ink2 }) {
  return <div style={S(`font:600 13px/1.2 ${F.body};color:${color}`)}>{children}</div>;
}
