/* ==========================================================================
   listings.js — the cross-user layer
   Founders publish their project as a listing every other volunteer can find;
   volunteers apply, and the application lands in the founder's own workspace.
   This is the shared, multi-account half of the product (everything else is a
   private per-user workspace).
   ========================================================================== */

'use client';

import { supabase } from './supabase.js';

async function uid() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? data.user.id : null;
}

function listingRow(project, ownerId) {
  return {
    owner_id: ownerId,
    name: project.name,
    cause: project.cause || null,
    site: project.site || null,
    mission: project.mission || null,
    bio: project.bio || null,
    cover: project.cover || null,
    website: project.website || null,
    is_student_led: true,
    events_hosted: Number(project.eventsHosted) || 0,
    approx_volunteers: Number(project.approxVolunteers) || 0,
    positions: (project.positions || []).map((p) => ({ id: p.id, t: p.t, m: p.m })),
    next_session: project.nextSession ? project.nextSession.label : null,
    status: project.archived ? 'paused' : 'live',
  };
}

/** Publish or update a project so volunteers can discover it. Returns the id. */
export async function publishListing(project) {
  if (!supabase) return null;
  const owner = await uid();
  if (!owner) return null;
  const row = listingRow(project, owner);
  if (project.listingId) {
    const { data } = await supabase
      .from('listings')
      .update(row)
      .eq('id', project.listingId)
      .eq('owner_id', owner)
      .select('id')
      .maybeSingle();
    return data ? data.id : project.listingId;
  }
  const { data, error } = await supabase.from('listings').insert(row).select('id').single();
  if (error) return null;
  return data.id;
}

/** Live listings from OTHER founders, for the discovery feed. */
export async function loadDiscoverListings() {
  if (!supabase) return [];
  const me = await uid();
  const { data } = await supabase
    .from('listings')
    .select('*')
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(60);
  return (data || []).filter((l) => l.owner_id !== me);
}

export async function getListing(id) {
  if (!supabase) return null;
  const { data } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
  return data || null;
}

/** Apply to a listing. Throws with a human message on failure. */
export async function applyToListing(listing, { position, note, answers } = {}) {
  if (!supabase) throw new Error('The backend is not configured.');
  const me = await uid();
  if (!me) throw new Error('Sign in to apply.');
  const { data: prof } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', me)
    .maybeSingle();
  const name = `${(prof && prof.first_name) || ''} ${(prof && prof.last_name) || ''}`.trim() || 'A volunteer';
  const { error } = await supabase.from('applications').insert({
    listing_id: listing.id,
    owner_id: listing.owner_id,
    applicant_id: me,
    applicant_name: name,
    position: position || null,
    note: note || null,
    answers: answers || [],
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') throw new Error('You have already applied to this project.');
    throw new Error(error.message || 'We could not send your application.');
  }
}

/** Applications the signed-in volunteer has sent. */
export async function loadMyApplications() {
  if (!supabase) return [];
  const me = await uid();
  if (!me) return [];
  const { data } = await supabase
    .from('applications')
    .select('*, listings(name, cause, site)')
    .eq('applicant_id', me)
    .order('created_at', { ascending: false });
  return data || [];
}

/** Applications sent to the signed-in founder's listings. */
export async function loadOwnerApplications() {
  if (!supabase) return [];
  const me = await uid();
  if (!me) return [];
  const { data } = await supabase
    .from('applications')
    .select('*, listings(name)')
    .eq('owner_id', me)
    .order('created_at', { ascending: false });
  return data || [];
}

/** Accept or decline an application (founder), or withdraw (applicant). */
export async function setApplicationStatus(appId, status) {
  if (!supabase) return { ok: false };
  const { error } = await supabase
    .from('applications')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', appId);
  return { ok: !error, error };
}
