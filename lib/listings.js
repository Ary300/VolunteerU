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
    location: project.location || project.site || null,
    mission: project.mission || null,
    bio: project.bio || null,
    cover: project.cover || null,
    website: project.website || null,
    is_student_led: project.orgClass !== 'official',
    org_class: project.orgClass === 'official' ? 'official' : 'student',
    events_hosted: Number(project.eventsHosted) || 0,
    approx_volunteers: Number(project.approxVolunteers) || 0,
    positions: (project.positions || []).map((p) => ({ id: p.id, t: p.t, m: p.m })),
    next_session: project.nextSession ? project.nextSession.label : null,
    status: project.archived ? 'paused' : 'live',
    org_type: project.orgType === 'team' ? 'team' : 'volunteering',
    pipeline: (project.pipeline || []).map((s) => ({ id: s.id, label: s.label, kind: s.kind || 'check', required: s.required !== false, note: s.note || '' })),
    task_roles: ((project.taskBoard && project.taskBoard.roles) || []).map((r) => ({ id: r.id, name: r.name, briefing: r.briefing || '', color: r.color || '#C2603C' })),
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
  return searchListings();
}

/**
 * Real, server-side search over live listings. Filtering happens in Postgres via
 * the Supabase (PostgREST) API — text across name/mission/bio/site/cause, plus
 * cause, org-class and place facets — so it scales past what one page holds.
 * The free-text term is sanitised so a user's punctuation can't break the
 * PostgREST filter grammar.
 */
export async function searchListings({ q = '', causes = [], kind = 'all', place = 'all', near = '', sort = 'recent' } = {}) {
  if (!supabase) return [];
  const me = await uid();

  let query = supabase.from('listings').select('*').eq('status', 'live');

  if (kind === 'student' || kind === 'official') query = query.eq('org_class', kind);
  if (Array.isArray(causes) && causes.length) query = query.in('cause', causes);

  // Location: match the city/region against the listing's site. So a volunteer
  // in "San Diego" finds projects whose site reads San Diego.
  const loc = String(near || '').replace(/[,()%*\\]/g, ' ').trim();
  if (loc) query = query.or(`site.ilike.%${loc}%,location.ilike.%${loc}%`);

  // Online vs in-person: team/remote projects vs sited ones. We approximate
  // "online" as a site that reads remote/online/virtual (listings carry no
  // dedicated flag yet), and never exclude a listing that has no site.
  if (place === 'online') query = query.or('site.ilike.%remote%,site.ilike.%online%,site.ilike.%virtual%,org_type.eq.team');
  else if (place === 'person') query = query.not('org_type', 'eq', 'team');

  const term = String(q || '').replace(/[,()%*\\]/g, ' ').trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},mission.ilike.${like},bio.ilike.${like},site.ilike.${like},cause.ilike.${like}`);
  }

  if (sort === 'established') query = query.order('events_hosted', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const { data, error } = await query.limit(80);
  if (error) return [];
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
    .select('*, listings(name, cause, site, org_type, pipeline, task_roles, next_session, mission, announcements)')
    .eq('applicant_id', me)
    .order('created_at', { ascending: false });
  return data || [];
}

/** Post an announcement to a nonprofit's board (owner only). Newest first. */
export async function postAnnouncement(listingId, body) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const clean = (body || '').trim();
  if (!clean) return { ok: false };
  const { data: cur } = await supabase.from('listings').select('announcements').eq('id', listingId).maybeSingle();
  const next = [{ id: `an-${Date.now().toString(36)}`, body: clean.slice(0, 1000), at: new Date().toISOString() }, ...((cur && cur.announcements) || [])].slice(0, 50);
  const { error } = await supabase.from('listings').update({ announcements: next }).eq('id', listingId).eq('owner_id', me);
  return { ok: !error, announcements: next, error };
}

/** Remove an announcement by id (owner only). */
export async function deleteAnnouncement(listingId, annId) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur } = await supabase.from('listings').select('announcements').eq('id', listingId).maybeSingle();
  const next = ((cur && cur.announcements) || []).filter((a) => a.id !== annId);
  const { error } = await supabase.from('listings').update({ announcements: next }).eq('id', listingId).eq('owner_id', me);
  return { ok: !error, announcements: next, error };
}

/** Read a listing's announcements (anyone, for members + the public join page). */
export async function loadAnnouncements(listingId) {
  if (!supabase || !listingId) return [];
  const { data } = await supabase.from('listings').select('announcements').eq('id', listingId).maybeSingle();
  return (data && data.announcements) || [];
}

/** The signed-in volunteer's accepted memberships — what they should do next. */
export async function loadMyMemberships() {
  const apps = await loadMyApplications();
  return apps.filter((a) => a.status === 'accepted' && a.listings);
}

/** Accepted members who joined a founder's listing through the app (owner side). */
export async function loadProjectMembers(listingId) {
  if (!supabase || !listingId) return [];
  const me = await uid();
  if (!me) return [];
  const { data } = await supabase
    .from('applications')
    .select('*')
    .eq('owner_id', me)
    .eq('listing_id', listingId)
    .eq('status', 'accepted')
    .order('decided_at', { ascending: false });
  return data || [];
}

/** Owner writes the assignment (role + tasks) for one member. Merges keys. */
export async function setMemberAssignment(applicationId, patch) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur } = await supabase.from('applications').select('assignment').eq('id', applicationId).maybeSingle();
  const next = { ...((cur && cur.assignment) || {}), ...patch };
  const { error } = await supabase.from('applications').update({ assignment: next }).eq('id', applicationId).eq('owner_id', me);
  return { ok: !error, assignment: next, error };
}

/** Ratings organizers have given the signed-in volunteer, newest first.
    Each rating lives in the owner-written assignment on an application row, so it
    is tied to a real project and a real account. */
export async function loadMyRatings() {
  const apps = await loadMyApplications();
  return apps
    .filter((a) => a.assignment && a.assignment.rating && a.assignment.rating.stars)
    .map((a) => ({
      ...a.assignment.rating,
      org: (a.listings && a.listings.name) || 'A project',
      cause: a.listings && a.listings.cause,
    }))
    .sort((x, y) => String(y.ratedAt || '').localeCompare(String(x.ratedAt || '')));
}

/** Member marks one of their assigned tasks (writes member_state.tasks). */
export async function setMyTaskStatus(applicationId, taskId, status) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { data: cur } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  const ms = (cur && cur.member_state) || {};
  const next = { ...ms, tasks: { ...(ms.tasks || {}), [taskId]: status } };
  const { error } = await supabase.from('applications').update({ member_state: next }).eq('id', applicationId).eq('applicant_id', me);
  return { ok: !error, member_state: next, error };
}

/** Save the member's own progress (pipeline ticks, briefing ack, task checklist). */
export async function updateMemberState(applicationId, patch) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  // Read-merge-write so concurrent keys don't clobber each other.
  const { data: cur } = await supabase.from('applications').select('member_state').eq('id', applicationId).maybeSingle();
  const next = { ...((cur && cur.member_state) || {}), ...patch };
  const { error } = await supabase
    .from('applications')
    .update({ member_state: next })
    .eq('id', applicationId)
    .eq('applicant_id', me);
  return { ok: !error, member_state: next, error };
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

/* ---- messaging (tied to an application thread) -------------------------- */

export async function loadMessages(applicationId) {
  if (!supabase) return [];
  const me = await uid();
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  // Mark the ones sent to me as read.
  const unread = (data || []).filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
  if (unread.length) {
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread);
  }
  return data || [];
}

export async function sendMessage(applicationId, recipientId, body) {
  if (!supabase) throw new Error('The backend is not configured.');
  const me = await uid();
  if (!me) throw new Error('Sign in to send a message.');
  const clean = (body || '').trim();
  if (!clean) return;
  const { error } = await supabase.from('messages').insert({
    application_id: applicationId,
    sender_id: me,
    recipient_id: recipientId,
    body: clean.slice(0, 2000),
  });
  if (error) throw new Error(error.message || 'We could not send that.');
}

/** The signed-in user's id (for deciding which side of a thread they are). */
export async function myId() {
  return uid();
}

/* ---- volunteer directory ------------------------------------------------- */

/** Publish/refresh the signed-in volunteer's public directory card. */
export async function publishVolunteerProfile(profile = {}) {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const row = {
    user_id: me,
    name: (profile.name || '').trim(),
    city: profile.city || null,
    causes: Array.isArray(profile.causes) ? profile.causes : [],
    bio: profile.bio || null,
    skills: profile.skills || null,
    grade: profile.grade != null && profile.grade !== '' ? String(profile.grade) : null,
    verified_hours: Number(profile.verified_hours) || 0,
    listed: profile.listed !== false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('volunteer_directory').upsert(row, { onConflict: 'user_id' });
  return { ok: !error, error };
}

/** Remove the signed-in volunteer from the directory (privacy opt-out). */
export async function unlistVolunteerProfile() {
  if (!supabase) return { ok: false };
  const me = await uid();
  if (!me) return { ok: false };
  const { error } = await supabase.from('volunteer_directory').update({ listed: false, updated_at: new Date().toISOString() }).eq('user_id', me);
  return { ok: !error };
}

/**
 * Search the volunteer directory server-side: free text over name/bio/skills,
 * plus cause (array overlap) and city facets. Returns everyone listed except the
 * searcher, most-experienced first.
 */
export async function searchVolunteers({ q = '', causes = [], near = '' } = {}) {
  if (!supabase) return [];
  const me = await uid();
  let query = supabase.from('volunteer_directory').select('*').eq('listed', true);

  if (Array.isArray(causes) && causes.length) query = query.overlaps('causes', causes);

  const loc = String(near || '').replace(/[,()%*\\]/g, ' ').trim();
  if (loc) query = query.ilike('city', `%${loc}%`);

  const term = String(q || '').replace(/[,()%*\\]/g, ' ').trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(`name.ilike.${like},bio.ilike.${like},skills.ilike.${like}`);
  }

  const { data, error } = await query.order('verified_hours', { ascending: false }).limit(80);
  if (error) return [];
  return (data || []).filter((v) => v.user_id !== me);
}
