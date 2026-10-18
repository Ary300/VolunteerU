/* ==========================================================================
   invites.js, roster invites
   A lead adds a student to a published project's roster. Each added student
   gets a roster_invites row (supabase/migrations/20261018000004) with a
   private token, and the lead sends the link /invite/<token> from their own
   email or phone. VolunteerU sends nothing itself.

   Opening the link signed in calls claim_roster_invite, which makes the
   student an accepted member of the listing. The lead's roster then links the
   Invited row to their account (Lead.jsx applyMemberLinks, by inviteId).
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';
import { invalidateMyApplications } from './listings.js';

/** Tokens are 64 lowercase hex characters (the column default). */
export const TOKEN_RX = /^[0-9a-f]{64}$/;
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const EMAIL_MAX = 254;

/** '' when `v` is empty or a usable email address, else what to fix. */
export function inviteEmailError(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  if (t.length > EMAIL_MAX || !EMAIL_RX.test(t)) return 'Enter an email like name@school.org, or leave it blank.';
  return '';
}

/** The link a lead shares, on this site's own origin. */
export function inviteLink(token) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/invite/${token}`;
}

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/** The words the lead sends, as plain text, for email and texts alike. */
export function inviteMessage({ name, projectName, leadName, link }) {
  const hi = firstName(name) ? `Hi ${firstName(name)},` : 'Hi,';
  const from = firstName(leadName);
  return [
    hi,
    '',
    `I added you to ${projectName} on VolunteerU. Open this link to make your account and join the team:`,
    link,
    '',
    "You'll see our shifts and my messages there, and your hours get tracked on your profile.",
    ...(from ? ['', from] : []),
  ].join('\n');
}

/** A mailto: link that opens the lead's own email app with the invite filled in. */
export function inviteMailto({ email, name, projectName, leadName, link }) {
  const to = inviteEmailError(email) ? '' : String(email || '').trim();
  const subject = `Join ${projectName} on VolunteerU`;
  const body = inviteMessage({ name, projectName, leadName, link });
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** An sms: link with the invite as the message body (works on iOS and Android). */
export function inviteSms({ name, projectName, leadName, link }) {
  const body = `${firstName(name) ? `Hi ${firstName(name)}, ` : ''}I added you to ${projectName} on VolunteerU. Open this link to join: ${link}${firstName(leadName) ? ` - ${firstName(leadName)}` : ''}`;
  return `sms:?&body=${encodeURIComponent(body)}`;
}

/** "Name: link" per line, for "Copy all links". */
export function invitesAsText(rows) {
  return rows.filter((r) => r && r.token).map((r) => `${r.name}: ${inviteLink(r.token)}`).join('\n');
}

const clip = (v, max) => {
  const t = String(v == null ? '' : v).trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Create one invite per student on a listing the signed-in lead owns.
 * `students`: [{ name, email, school, grade, position, consent }]
 * Returns { ok, invites: [{ id, token, name }] } in the same order, or
 * { ok: false, error } with nothing created.
 */
export async function createInvites(listingId, students) {
  if (!supabase || !listingId || !students.length) return { ok: false, error: new Error('Not published') };
  let me = null;
  try {
    const { data } = await supabase.auth.getSession();
    me = data && data.session && data.session.user ? data.session.user.id : null;
  } catch { me = null; }
  if (!me) return { ok: false, error: new Error('Signed out') };
  const rows = students.map((s) => ({
    listing_id: listingId,
    created_by: me,
    name: String(s.name || '').trim().slice(0, 120),
    email: inviteEmailError(s.email) ? null : clip(s.email, EMAIL_MAX),
    school: clip(s.school, 120),
    grade: clip(s.grade, 8),
    position: clip(s.position, 120),
    consent: s.consent === true,
  }));
  try {
    const { data, error } = await supabase.from('roster_invites').insert(rows).select('id, token, name');
    if (error || !Array.isArray(data) || data.length !== rows.length) {
      console.warn('[invites] create failed', error && (error.message || error));
      return { ok: false, error: error || new Error('Short insert') };
    }
    return { ok: true, invites: data.map((r) => ({ id: r.id, token: r.token, name: r.name })) };
  } catch (error) {
    console.warn('[invites] create failed', error);
    return { ok: false, error };
  }
}

/** Revoke an invite (the student was removed). Best effort; returns { ok }. */
export async function revokeInvite(inviteId) {
  if (!supabase || !inviteId) return { ok: false };
  try {
    const { error } = await supabase.from('roster_invites').update({ status: 'revoked' }).eq('id', inviteId).eq('status', 'invited');
    if (error) console.warn('[invites] revoke failed', error.message || error);
    return { ok: !error, error };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Who sent an invite and for what, for the /invite page greeting. Null when
    the token isn't an open invite (used, canceled, unknown) or the read failed
    (`failed: true` then). */
export async function previewInvite(token) {
  if (!supabase || !TOKEN_RX.test(String(token || ''))) return { preview: null, failed: false };
  try {
    const { data, error } = await supabase.rpc('invite_preview', { p_token: token });
    if (error) return { preview: null, failed: true, error };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.listing_name) return { preview: null, failed: false };
    return {
      preview: {
        listingName: String(row.listing_name),
        orgName: row.org_name ? String(row.org_name) : '',
        inviterFirstName: row.inviter_first_name ? String(row.inviter_first_name) : '',
        invitedName: row.invited_name ? String(row.invited_name) : '',
      },
      failed: false,
    };
  } catch (error) {
    return { preview: null, failed: true, error };
  }
}

/* What each server hint means for the student, in plain words. */
const CLAIM_REASONS = {
  invite_signed_out: 'signed_out',
  invite_invalid: 'invalid',
  invite_revoked: 'revoked',
  invite_used: 'used',
  invite_closed: 'closed',
  invite_own_project: 'own',
};

/**
 * Join the project an invite is for, as the signed-in user.
 * Returns { ok: true, listingId } or { ok: false, reason } where reason is
 * one of signed_out, invalid, revoked, used, closed, own, failed.
 */
export async function claimInvite(token) {
  if (!supabase) return { ok: false, reason: 'failed' };
  if (!TOKEN_RX.test(String(token || ''))) return { ok: false, reason: 'invalid' };
  try {
    const { data, error } = await supabase.rpc('claim_roster_invite', { p_token: token });
    invalidateMyApplications();
    if (error) {
      const reason = CLAIM_REASONS[error.hint] || 'failed';
      if (reason === 'failed') console.warn('[invites] claim failed', error.message || error);
      return { ok: false, reason, error };
    }
    const listingId = typeof data === 'string' ? data : Array.isArray(data) ? data[0] : null;
    if (!listingId) return { ok: false, reason: 'failed' };
    return { ok: true, listingId: String(listingId) };
  } catch (error) {
    console.warn('[invites] claim failed', error);
    return { ok: false, reason: 'failed', error };
  }
}
