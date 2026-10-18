'use client';

/* StatusPill and StatusText live in components/ui.jsx (so ui.jsx never
   imports from vu/). This file re-exports them and maps the app's status
   words onto tones. Rows use StatusText (dot + word); StatusPill (tinted)
   is for one headline status per region. */

export { StatusPill as default, StatusPill, StatusText } from '../ui.jsx';

const TONE_BY_WORD = {
  confirmed: 'ok',
  accepted: 'ok',
  verified: 'ok',
  present: 'ok',
  staffed: 'ok',
  complete: 'ok',
  "you're in": 'ok',
  waiting: 'wait',
  applied: 'wait',
  pending: 'wait',
  'in review': 'wait',
  late: 'wait',
  onboarding: 'wait',
  'not accepted': 'bad',
  declined: 'bad',
  cancelled: 'bad',
  absent: 'bad',
  removed: 'bad',
  'sent back': 'bad',
  withdrawn: 'mute',
  'logged on your own': 'mute',
};

/**
 * Tone for a status word: statusTone('Applied') -> 'wait'. Unknown -> 'mute'
 * (Logged on your own, New, Withdrawn, Waitlisted, Draft...).
 * @param {string} word
 * @returns {'ok'|'wait'|'bad'|'mute'}
 */
export function statusTone(word) {
  return TONE_BY_WORD[String(word || '').trim().toLowerCase()] || 'mute';
}
