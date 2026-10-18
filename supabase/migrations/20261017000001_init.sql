-- ============================================================================
-- VolunteerU, production schema, migration 0001
--
-- Rebuilt from the app's call sites (lib/listings.js, lib/sync.js, lib/auth.js,
-- lib/db.js, components/screens/Settings.jsx, components/lead/Tabs.jsx) and the
-- local mock backend the app runs end to end against. Apply to a brand-new
-- Supabase project with the SQL editor or `supabase db push`.
--
-- Tables
--   profiles             one row per auth user, written by the signup trigger
--   listings             a founder's published project (Discover, join links)
--   applications         a volunteer's application; also the membership row
--                        that carries hours, check-ins, tasks and ratings
--   messages             one thread per application, between its two parties
--   user_state           each user's private workspace blob (sync.js)
--   volunteer_directory  opt-in public card that founders search
--
-- Security model
--   * RLS is enabled on every table and every policy names its role.
--   * Table privileges are revoked from anon/authenticated first (Supabase
--     grants ALL by default), then granted back per column where the app
--     writes.
--   * BEFORE triggers enforce the rules a row policy cannot express:
--       - listings.verified changes only through a reviewer (service role)
--       - an applicant cannot accept their own application, cannot write the
--         owner half (`assignment`, which holds confirmedHours, ratings and
--         attendanceHours), and cannot edit an hour entry after it was confirmed
--       - an owner cannot write the applicant half (`member_state`)
--       - owner_id on an application always comes from the listing
--       - volunteer_directory.verified_hours is recomputed from confirmed hours
--   * The service role and the postgres/dashboard roles bypass the triggers'
--     user rules, which is how manual verification is done.
--
-- "Call site" comments below name the function in the app that each policy
-- serves. NOTES.md has the full query-to-policy checklist.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- authenticated never calls private functions directly; trigger functions do
-- not need EXECUTE at fire time. Nothing here is exposed through PostgREST.

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null default '',
  last_name   text not null default '',
  email       text not null default '',
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- listings
-- ----------------------------------------------------------------------------
create table public.listings (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   uuid not null references auth.users (id) on delete cascade,
  name                       text not null check (char_length(btrim(name)) between 1 and 300),
  cause                      text,
  site                       text,
  location                   text,
  mission                    text,
  bio                        text,
  cover                      text,
  website                    text,
  is_student_led             boolean not null default true,
  org_class                  text not null default 'student'
                               check (org_class in ('student', 'official')),
  events_hosted              integer not null default 0 check (events_hosted >= 0),
  approx_volunteers          integer not null default 0 check (approx_volunteers >= 0),
  positions                  jsonb not null default '[]'::jsonb check (jsonb_typeof(positions) = 'array'),
  next_session               text,
  shifts                     jsonb not null default '[]'::jsonb check (jsonb_typeof(shifts) = 'array'),
  -- 'unlisted' = off Discover, join link still opens.
  -- 'paused'   = archived; hidden from everyone but the owner.
  -- 'draft' and 'closed' are not written by the current app; kept so seeded
  -- or older rows load.
  status                     text not null default 'live'
                               check (status in ('draft', 'live', 'unlisted', 'paused', 'closed')),
  org_type                   text not null default 'volunteering'
                               check (org_type in ('volunteering', 'team')),
  delivery                   text not null default 'in_person'
                               check (delivery in ('in_person', 'remote', 'hybrid')),
  pipeline                   jsonb not null default '[]'::jsonb check (jsonb_typeof(pipeline) = 'array'),
  task_roles                 jsonb not null default '[]'::jsonb check (jsonb_typeof(task_roles) = 'array'),
  announcements              jsonb not null default '[]'::jsonb check (jsonb_typeof(announcements) = 'array'),
  -- Set only by manual review (service role). See private.listings_guard.
  verified                   boolean not null default false,
  verification_requested_at  timestamptz,
  verification_note          text check (verification_note is null or char_length(verification_note) <= 400),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- Discover / matchListings: status = 'live', order by created_at or events_hosted, then id.
create index listings_live_recent_idx      on public.listings (status, created_at desc, id);
create index listings_live_established_idx on public.listings (status, events_hosted desc, id);
-- loadMyListingVerification, owner-side updates, RLS owner check.
create index listings_owner_idx            on public.listings (owner_id);
-- Cause and org-class facets.
create index listings_cause_idx            on public.listings (cause);
create index listings_org_class_idx        on public.listings (status, org_class);
-- Free-text ilike '%term%' across name/mission/bio/site/location.
create index listings_name_trgm_idx     on public.listings using gin (name extensions.gin_trgm_ops);
create index listings_mission_trgm_idx  on public.listings using gin (mission extensions.gin_trgm_ops);
create index listings_bio_trgm_idx      on public.listings using gin (bio extensions.gin_trgm_ops);
create index listings_site_trgm_idx     on public.listings using gin (site extensions.gin_trgm_ops);
create index listings_location_trgm_idx on public.listings using gin (location extensions.gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- applications
-- ----------------------------------------------------------------------------
create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  -- Copied from the listing by private.applications_before_insert.
  owner_id        uuid not null references auth.users (id) on delete cascade,
  applicant_id    uuid not null references auth.users (id) on delete cascade,
  applicant_name  text not null default 'A volunteer',
  position        text,
  note            text,
  answers         jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'waitlisted', 'declined', 'withdrawn')),
  decided_at      timestamptz,
  -- Owner-written half: role, roleId, tasks, confirmedHours, rating,
  -- attendanceHours, closedAt.
  assignment      jsonb not null default '{}'::jsonb check (jsonb_typeof(assignment) = 'object'),
  -- Applicant-written half: hoursLog, checkins, shifts, tasks, pipeline,
  -- briefingAck, listing (snapshot).
  member_state    jsonb not null default '{}'::jsonb check (jsonb_typeof(member_state) = 'object'),
  created_at      timestamptz not null default now(),
  -- applyToListing maps 23505 on this constraint to "You already applied".
  constraint applications_listing_applicant_key unique (listing_id, applicant_id),
  -- Nobody applies to their own listing, so nobody can accept themselves.
  constraint applications_not_self check (applicant_id <> owner_id)
);

-- loadMyApplications: applicant_id = me order by created_at desc.
create index applications_applicant_idx     on public.applications (applicant_id, created_at desc);
-- loadOwnerApplications: owner_id = me order by created_at desc.
create index applications_owner_idx         on public.applications (owner_id, created_at desc);
-- loadProjectMembers / loadListingThreads: owner_id, listing_id, status.
create index applications_owner_listing_idx on public.applications (owner_id, listing_id, status);
-- (listing_id, applicant_id) unique index covers the listing_id foreign key.

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  sender_id       uuid not null references auth.users (id) on delete cascade,
  recipient_id    uuid not null references auth.users (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint messages_not_self check (sender_id <> recipient_id)
);

-- loadMessages / loadListingThreads: application_id order by created_at.
create index messages_application_idx on public.messages (application_id, created_at);
-- loadUnreadMessagesByThread: recipient_id = me and read_at is null.
create index messages_unread_idx      on public.messages (recipient_id, created_at desc) where read_at is null;
create index messages_recipient_idx   on public.messages (recipient_id);
create index messages_sender_idx      on public.messages (sender_id);

-- ----------------------------------------------------------------------------
-- user_state
-- ----------------------------------------------------------------------------
create table public.user_state (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- volunteer_directory
-- ----------------------------------------------------------------------------
create table public.volunteer_directory (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  name            text not null default '',
  city            text,
  causes          text[] not null default '{}',
  bio             text,
  skills          text,
  grade           text,
  -- Recomputed server-side from organization-confirmed hours on every write.
  verified_hours  numeric(7, 1) not null default 0 check (verified_hours >= 0),
  listed          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- searchVolunteersPage: listed = true order by verified_hours desc, user_id.
create index volunteer_directory_listed_idx on public.volunteer_directory (listed, verified_hours desc, user_id);
create index volunteer_directory_causes_idx on public.volunteer_directory using gin (causes);
create index volunteer_directory_name_trgm_idx   on public.volunteer_directory using gin (name extensions.gin_trgm_ops);
create index volunteer_directory_bio_trgm_idx    on public.volunteer_directory using gin (bio extensions.gin_trgm_ops);
create index volunteer_directory_skills_trgm_idx on public.volunteer_directory using gin (skills extensions.gin_trgm_ops);
create index volunteer_directory_city_trgm_idx   on public.volunteer_directory using gin (city extensions.gin_trgm_ops);

-- ============================================================================
-- Triggers
-- Every user-rule check starts with `current_user in ('anon','authenticated')`.
-- These functions are SECURITY INVOKER, so current_user is the PostgREST role
-- of the request. The service role, postgres and the dashboard skip the user
-- rules, which is how a reviewer sets listings.verified.
-- ============================================================================

-- ---- signup: create the profiles row from the signup metadata ---------------
-- Call site: db.js signUp passes options.data.first_name / last_name; auth.js
-- loadIdentity and listings.js applyToListing read it back.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 100),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 100),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profiles.email in step when a user changes their email.
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ---- listings: owners never set `verified` ---------------------------------
create or replace function private.listings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.verified then
        raise exception 'Only a reviewer can verify a listing.' using errcode = '42501';
      end if;
      new.verified := false;
      new.created_at := now();
    else
      if new.verified is distinct from old.verified then
        raise exception 'Only a reviewer can verify a listing.' using errcode = '42501';
      end if;
      if new.id <> old.id or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
        raise exception 'A listing''s id, owner and creation time cannot change.' using errcode = '42501';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger listings_guard
  before insert or update on public.listings
  for each row execute function private.listings_guard();

-- ---- applications: insert ---------------------------------------------------
-- The owner always comes from the listing, so an applicant cannot name
-- themselves as owner and then accept their own application. New rows start
-- pending with an empty owner half. The applicant's name comes from profiles.
create or replace function private.applications_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  l_owner  uuid;
  l_status text;
  p_name   text;
begin
  if current_user in ('anon', 'authenticated') then
    -- Read under the caller's RLS: only live/unlisted listings (or their own) are visible.
    select l.owner_id, l.status into l_owner, l_status
      from public.listings l
     where l.id = new.listing_id;
    if l_owner is null or l_status not in ('live', 'unlisted') then
      raise exception 'This opportunity is not taking applications.' using errcode = '42501';
    end if;
    new.owner_id     := l_owner;
    new.status       := 'pending';
    new.decided_at   := null;
    new.assignment   := '{}'::jsonb;
    new.member_state := '{}'::jsonb;
    new.created_at   := now();
    select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      into p_name
      from public.profiles p
     where p.id = new.applicant_id;
    new.applicant_name := coalesce(nullif(p_name, ''), nullif(btrim(new.applicant_name), ''), 'A volunteer');
  end if;
  return new;
end;
$$;

create trigger applications_before_insert
  before insert on public.applications
  for each row execute function private.applications_before_insert();

-- ---- applications: update ---------------------------------------------------
-- Owner may change: status (pending/accepted/waitlisted/declined), decided_at,
--   assignment. Owner may not override a volunteer's withdrawal.
-- Applicant may change: member_state, decided_at, and status only to
--   'withdrawn' or from 'withdrawn' back to 'pending' (apply again).
--   Applicant may never touch assignment (confirmedHours, rating,
--   attendanceHours), and may not alter or re-add an hour entry after the
--   organization confirmed it. New hour entries must be > 0 and <= 24.
create or replace function private.applications_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me         uuid;
  confirmed  jsonb;
  old_log    jsonb;
  new_log    jsonb;
  e          jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  me := auth.uid();

  if new.id <> old.id
     or new.listing_id <> old.listing_id
     or new.owner_id <> old.owner_id
     or new.applicant_id <> old.applicant_id
     or new.created_at <> old.created_at
     or new.applicant_name is distinct from old.applicant_name
     or new.position is distinct from old.position
     or new.note is distinct from old.note
     or new.answers is distinct from old.answers then
    raise exception 'Those application fields cannot be changed.' using errcode = '42501';
  end if;

  if me is not null and me = old.owner_id then
    if new.member_state is distinct from old.member_state then
      raise exception 'Only the volunteer can update their own progress.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if old.status = 'withdrawn' then
        raise exception 'The volunteer withdrew this application.' using errcode = '42501';
      end if;
      if new.status not in ('pending', 'accepted', 'waitlisted', 'declined') then
        raise exception 'Organizations cannot set status %.', new.status using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if me is not null and me = old.applicant_id then
    if new.assignment is distinct from old.assignment then
      raise exception 'Only the organization can confirm hours or change assignments.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and not (new.status = 'withdrawn' or (new.status = 'pending' and old.status = 'withdrawn')) then
      raise exception 'Only the organization can accept or decline an application.' using errcode = '42501';
    end if;

    confirmed := coalesce(old.assignment -> 'confirmedHours', '{}'::jsonb);
    old_log := case when jsonb_typeof(old.member_state -> 'hoursLog') = 'array'
                    then old.member_state -> 'hoursLog' else '[]'::jsonb end;
    new_log := new.member_state -> 'hoursLog';
    if new_log is not null and jsonb_typeof(new_log) <> 'array' then
      raise exception 'hoursLog must be a list.' using errcode = '22023';
    end if;
    for e in select value from jsonb_array_elements(coalesce(new_log, '[]'::jsonb)) loop
      -- Unchanged entries are always fine (including confirmed ones).
      continue when exists (select 1 from jsonb_array_elements(old_log) o where o.value = e);
      if jsonb_typeof(confirmed) = 'object' and (confirmed -> (e ->> 'id')) = 'true'::jsonb then
        raise exception 'Confirmed hours cannot be edited.' using errcode = '42501';
      end if;
      if jsonb_typeof(e -> 'hrs') <> 'number'
         or (e ->> 'hrs')::numeric <= 0
         or (e ->> 'hrs')::numeric > 24 then
        raise exception 'Enter more than 0 hours, up to 24.' using errcode = '23514';
      end if;
    end loop;
    return new;
  end if;

  raise exception 'Not your application.' using errcode = '42501';
end;
$$;

create trigger applications_before_update
  before update on public.applications
  for each row execute function private.applications_before_update();

-- ---- messages: server clock, unread on arrival ------------------------------
create or replace function private.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.read_at := null;
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.messages_before_insert();

-- ---- volunteer_directory: verified_hours from confirmed hours ---------------
-- Mirrors listings.js loadMyServiceHours: accepted applications, hoursLog
-- entries whose id is true in assignment.confirmedHours, rounded to 0.1.
-- Runs under the caller's RLS, which already limits the read to their own
-- applications (user_id = auth.uid() is required by the policy anyway).
create or replace function private.volunteer_directory_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    select coalesce(round(sum((h.value ->> 'hrs')::numeric), 1), 0)
      into new.verified_hours
      from public.applications a
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(a.member_state -> 'hoursLog') = 'array'
             then a.member_state -> 'hoursLog' else '[]'::jsonb end
      ) h
     where a.applicant_id = new.user_id
       and a.status = 'accepted'
       and jsonb_typeof(a.assignment -> 'confirmedHours') = 'object'
       and (a.assignment -> 'confirmedHours' -> (h.value ->> 'id')) = 'true'::jsonb
       and jsonb_typeof(h.value -> 'hrs') = 'number'
       and (h.value ->> 'hrs')::numeric > 0;
    if tg_op = 'INSERT' then
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger volunteer_directory_guard
  before insert or update on public.volunteer_directory
  for each row execute function private.volunteer_directory_guard();

revoke all on all functions in schema private from public, anon, authenticated;

-- ============================================================================
-- Row level security
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per
-- statement instead of once per row.
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.listings            enable row level security;
alter table public.applications        enable row level security;
alter table public.messages            enable row level security;
alter table public.user_state          enable row level security;
alter table public.volunteer_directory enable row level security;

-- ---- profiles ---------------------------------------------------------------
-- Call sites: auth.js loadIdentity, listings.js applyToListing (own row only).
-- Rows are written by the signup trigger; the app never writes profiles.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- ---- listings ---------------------------------------------------------------
-- Call sites: searchListingsPage, matchListings, getListing, loadListingsByIds,
-- loadAnnouncements (anyone, signed in or not), loadMyListingVerification,
-- postAnnouncement/deleteAnnouncement reads (owner), embedded listings(...) on
-- applications. Paused/closed/draft rows are visible to their owner only.
-- (Outer-row columns inside EXISTS subqueries below are table-qualified on
-- purpose: an unqualified name would bind to the subquery's own table.)
create policy listings_select_public on public.listings
  for select to anon, authenticated
  using (status in ('live', 'unlisted'));

create policy listings_select_own on public.listings
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Call site: publishListing insert.
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Call sites: publishListing update, requestListingVerification,
-- postAnnouncement, deleteAnnouncement (all filter .eq('owner_id', me)).
create policy listings_update_own on public.listings
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
-- No delete policy: the app never deletes a listing (archiving pauses it).

-- ---- applications -----------------------------------------------------------
-- Call sites (applicant): loadMyApplications (+ loadMyMemberships,
-- loadMyRatings, loadMyServiceHours, loadMyNotifications), readSignUpRow,
-- loadVolunteerReplyNotifications, and the read half of every member_state
-- read-merge-write (updateMemberState, logMemberHours, checkInMember,
-- removeMemberHours, setMyTaskStatus, signUpForShift, cancelShiftSignUp).
create policy applications_select_applicant on public.applications
  for select to authenticated
  using (applicant_id = (select auth.uid()));

-- Call sites (owner): loadOwnerApplications, loadProjectMembers,
-- loadListingThreads, Tabs.jsx volunteer threads, loadOwnerMessageNotifications,
-- and the read half of setMemberAssignment, confirmMemberHour,
-- creditAttendanceHours (Tabs.jsx), lead/Tabs.jsx assignment writes.
create policy applications_select_owner on public.applications
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Call site: applyToListing. The applicant is the caller, the listing must be
-- open (live or unlisted) and owned by someone else. owner_id is overwritten
-- from the listing by the trigger before this check runs.
create policy applications_insert_applicant on public.applications
  for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.listings l
       where l.id = applications.listing_id
         and l.owner_id = applications.owner_id
         and l.owner_id <> (select auth.uid())
         and l.status in ('live', 'unlisted')
    )
  );

-- Call sites (applicant): member_state writes listed above, and
-- setApplicationStatus 'withdrawn' / 'pending' from JoinListing.
-- Column rules live in private.applications_before_update.
create policy applications_update_applicant on public.applications
  for update to authenticated
  using (applicant_id = (select auth.uid()))
  with check (applicant_id = (select auth.uid()));

-- Call sites (owner): setApplicationStatus accept/decline/undo from
-- CrossApplications, setMemberAssignment, markProjectClosed,
-- confirmMemberHour, creditAttendanceHours and the assignment write in
-- lead/Tabs.jsx.
create policy applications_update_owner on public.applications
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
-- No delete policy: withdrawals are a status, not a delete.

-- ---- messages ---------------------------------------------------------------
-- Call sites: loadMessages, loadUnreadMessagesByThread, loadListingThreads,
-- Tabs.jsx volunteer threads. Only the two parties of a message see it.
create policy messages_select_participant on public.messages
  for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

-- Call site: sendMessage. The sender is the caller and the pair must be the
-- application's owner and applicant, in either direction.
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.applications a
       where a.id = messages.application_id
         and (
           (a.owner_id = messages.sender_id and a.applicant_id = messages.recipient_id)
           or (a.applicant_id = messages.sender_id and a.owner_id = messages.recipient_id)
         )
    )
  );

-- Call site: loadMessages marks read_at on messages sent to the caller. The
-- column grant below limits UPDATE to read_at.
create policy messages_update_recipient on public.messages
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- ---- user_state -------------------------------------------------------------
-- Call sites: sync.js loadUserState (select), sync.js flush, db.js
-- eraseMyData, Settings.jsx deleteData (upsert on_conflict user_id, which
-- needs select + insert + update on the caller's own row).
create policy user_state_select_own on public.user_state
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_state_insert_own on public.user_state
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_state_update_own on public.user_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---- volunteer_directory ----------------------------------------------------
-- Call site: searchVolunteersPage (signed in only, listed = true).
create policy volunteer_directory_select_listed on public.volunteer_directory
  for select to authenticated
  using (listed = true);

-- Call sites: publishVolunteerProfile upsert and unlistVolunteerProfile. An
-- upsert's conflict path must be able to see the caller's own row even after
-- they unlisted it.
create policy volunteer_directory_select_own on public.volunteer_directory
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy volunteer_directory_insert_own on public.volunteer_directory
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy volunteer_directory_update_own on public.volunteer_directory
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================================
-- Grants
-- Supabase's default privileges give anon and authenticated ALL on new public
-- tables. Take that back, then grant only what the app uses. service_role
-- keeps full access (it bypasses RLS and is never shipped to the browser).
-- ============================================================================

revoke all on table
  public.profiles, public.listings, public.applications,
  public.messages, public.user_state, public.volunteer_directory
from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- anon: public listings only (Discover, opportunity and join pages).
grant select on public.listings to anon;

-- authenticated
grant select on public.profiles to authenticated;

grant select on public.listings to authenticated;
grant insert (
  owner_id, name, cause, site, location, mission, bio, cover, website,
  is_student_led, org_class, events_hosted, approx_volunteers, positions,
  next_session, shifts, status, org_type, delivery, pipeline, task_roles,
  announcements, verification_requested_at, verification_note
) on public.listings to authenticated;
grant update (
  owner_id, name, cause, site, location, mission, bio, cover, website,
  is_student_led, org_class, events_hosted, approx_volunteers, positions,
  next_session, shifts, status, org_type, delivery, pipeline, task_roles,
  announcements, verification_requested_at, verification_note
) on public.listings to authenticated;

grant select on public.applications to authenticated;
grant insert (
  listing_id, owner_id, applicant_id, applicant_name, position, note, answers, status
) on public.applications to authenticated;
grant update (status, decided_at, assignment, member_state) on public.applications to authenticated;

grant select on public.messages to authenticated;
grant insert (application_id, sender_id, recipient_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

grant select on public.user_state to authenticated;
grant insert (user_id, data, updated_at) on public.user_state to authenticated;
grant update (user_id, data, updated_at) on public.user_state to authenticated;

grant select on public.volunteer_directory to authenticated;
grant insert (
  user_id, name, city, causes, bio, skills, grade, verified_hours, listed, updated_at
) on public.volunteer_directory to authenticated;
grant update (
  user_id, name, city, causes, bio, skills, grade, verified_hours, listed, updated_at
) on public.volunteer_directory to authenticated;

grant all on table
  public.profiles, public.listings, public.applications,
  public.messages, public.user_state, public.volunteer_directory
to service_role;

-- Tell PostgREST to pick up the new tables and grants without a restart.
notify pgrst, 'reload schema';
