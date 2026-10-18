-- ============================================================================
-- 0004: roster invites
--
-- A lead adds a student to a project's roster (People > Add a student, or
-- Import from a list). Until now that row lived only in the lead's private
-- workspace, so the student had no account tied to it: they couldn't see the
-- project, get messages, sign up for shifts or have hours counted.
--
-- Now each added student gets a roster_invites row with a private token. The
-- lead shares the link /invite/<token> from their own email or phone
-- (VolunteerU sends nothing itself). When the student opens it signed in,
-- public.claim_roster_invite turns the invite into an accepted application
-- for that listing, the same row an accepted join-link applicant has, so the
-- rest of the app (Home, My crew, messages, shift sign-ups, hours) treats them
-- as a member.
--
-- Table public.roster_invites
--   * RLS on. The listing's owner can select, insert, update and delete the
--     invites on their own listings. Nobody else can read a row, so tokens
--     never reach anon or other users.
--   * The token comes from the column default (two random UUIDs, 64 hex
--     characters, about 244 random bits). The client cannot choose it: the
--     insert grant leaves the column out.
--   * The owner may move an invite between 'invited' and 'revoked'. Only
--     claim_roster_invite (security definer) sets 'claimed', claimed_by and
--     claimed_at. A claimed invite cannot be changed by the owner.
--
-- Function public.claim_roster_invite(p_token) returns the listing id
--   * authenticated only. Validates the token is 'invited', the listing is
--     open (live or unlisted) and the caller isn't the listing owner.
--   * Creates the caller's application for the listing as 'accepted' with
--     decided_at = now(), or moves their existing application there. The
--     invite's position goes in applications.position (where an applicant's
--     chosen position lives) and the invite's roster facts go in the owner
--     half, assignment.invite = {id, school, grade, consent}, plus
--     assignment.inviteId. The lead's roster (Lead.jsx applyMemberLinks)
--     matches inviteId to the Invited row and links it to this account.
--   * member_state starts empty and assignment carries no hours, so the
--     hours-integrity rules from 20261018000002 hold for the new row.
--   * Runs as the function owner, so the BEFORE triggers from 0001 skip their
--     user rules (they check current_user in ('anon','authenticated')). This
--     function is the only path to an accepted row that the applicant starts.
--   * Calling it again with the same token by the same user returns the
--     listing id again (a reload after claiming is harmless).
--
-- Function public.invite_preview(p_token)
--   * anon and authenticated. For an 'invited' token on an open listing it
--     returns the listing name, an organization name (null for a student
--     project), the inviter's first name and the invited name. Anything else
--     returns no rows. No ids, emails or tokens come back.
--
-- Forward-only. Touches no existing table, policy, trigger or function.
-- ============================================================================

create table if not exists public.roster_invites (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  created_by  uuid not null references auth.users (id) on delete cascade,
  token       text not null unique
                default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  email       text check (
                email is null
                or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
              ),
  school      text check (school is null or char_length(school) <= 120),
  grade       text check (grade is null or char_length(grade) <= 8),
  position    text check (position is null or char_length(position) <= 120),
  consent     boolean not null default false,
  status      text not null default 'invited'
                check (status in ('invited', 'claimed', 'revoked')),
  claimed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  constraint roster_invites_claimed_fields check (
    (status = 'claimed') = (claimed_at is not null)
  )
);

-- Owner's list for one listing; covers the listing_id foreign key.
create index if not exists roster_invites_listing_idx on public.roster_invites (listing_id, created_at desc);
create index if not exists roster_invites_created_by_idx on public.roster_invites (created_by);
create index if not exists roster_invites_claimed_by_idx on public.roster_invites (claimed_by) where claimed_by is not null;

alter table public.roster_invites enable row level security;

-- ---- policies: the listing owner only ---------------------------------------
-- Call sites: lib/invites.js loadListingInvites, createInvites, revokeInvite,
-- deleteInvite (Lead.jsx People tab).
create policy roster_invites_select_owner on public.roster_invites
  for select to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = roster_invites.listing_id
         and l.owner_id = (select auth.uid())
    )
  );

create policy roster_invites_insert_owner on public.roster_invites
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'invited'
    and claimed_by is null
    and claimed_at is null
    and exists (
      select 1 from public.listings l
       where l.id = roster_invites.listing_id
         and l.owner_id = (select auth.uid())
    )
  );

-- Revoke or restore. A claimed row fails the check (claimed_by is set), so
-- the owner can't edit it.
create policy roster_invites_update_owner on public.roster_invites
  for update to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = roster_invites.listing_id
         and l.owner_id = (select auth.uid())
    )
  )
  with check (
    status in ('invited', 'revoked')
    and claimed_by is null
    and claimed_at is null
    and exists (
      select 1 from public.listings l
       where l.id = roster_invites.listing_id
         and l.owner_id = (select auth.uid())
    )
  );

create policy roster_invites_delete_owner on public.roster_invites
  for delete to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = roster_invites.listing_id
         and l.owner_id = (select auth.uid())
    )
  );

-- ---- grants -----------------------------------------------------------------
revoke all on table public.roster_invites from anon, authenticated;
grant select on public.roster_invites to authenticated;
grant insert (listing_id, created_by, name, email, school, grade, position, consent)
  on public.roster_invites to authenticated;
grant update (status, name, email, school, grade, position, consent)
  on public.roster_invites to authenticated;
grant delete on public.roster_invites to authenticated;
grant all on table public.roster_invites to service_role;

-- ---- claim_roster_invite ----------------------------------------------------
-- Errors carry a hint the client maps to plain words:
--   invite_signed_out, invite_invalid, invite_revoked, invite_used,
--   invite_closed, invite_own_project
create or replace function public.claim_roster_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me       uuid := auth.uid();
  inv      public.roster_invites%rowtype;
  l_owner  uuid;
  l_status text;
  p_name   text;
begin
  if me is null then
    raise exception 'Sign in to accept this invite.' using errcode = '28000', hint = 'invite_signed_out';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'This invite link isn''t valid.' using errcode = 'P0001', hint = 'invite_invalid';
  end if;

  select * into inv from public.roster_invites where token = p_token for update;
  if not found then
    raise exception 'This invite link isn''t valid.' using errcode = 'P0001', hint = 'invite_invalid';
  end if;
  if inv.status = 'revoked' then
    raise exception 'This invite was canceled.' using errcode = 'P0001', hint = 'invite_revoked';
  end if;
  if inv.status = 'claimed' then
    if inv.claimed_by = me then
      return inv.listing_id;
    end if;
    raise exception 'This invite was already used.' using errcode = 'P0001', hint = 'invite_used';
  end if;

  select l.owner_id, l.status into l_owner, l_status
    from public.listings l
   where l.id = inv.listing_id;
  if l_owner is null or l_status not in ('live', 'unlisted') then
    raise exception 'This project isn''t taking new members right now.' using errcode = 'P0001', hint = 'invite_closed';
  end if;
  if l_owner = me then
    raise exception 'This invite is for your own project.' using errcode = 'P0001', hint = 'invite_own_project';
  end if;

  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into p_name
    from public.profiles p
   where p.id = me;

  insert into public.applications as a (
    listing_id, owner_id, applicant_id, applicant_name, position, note, answers,
    status, decided_at, assignment, member_state
  )
  values (
    inv.listing_id, l_owner, me,
    left(coalesce(nullif(p_name, ''), btrim(inv.name), 'A volunteer'), 200),
    inv.position, null, '[]'::jsonb,
    'accepted', now(),
    jsonb_build_object(
      'inviteId', inv.id,
      'invite', jsonb_build_object('id', inv.id, 'school', inv.school, 'grade', inv.grade, 'consent', inv.consent)
    ),
    '{}'::jsonb
  )
  on conflict (listing_id, applicant_id) do update
    set status     = 'accepted',
        decided_at = now(),
        position   = coalesce(excluded.position, a.position),
        assignment = a.assignment || jsonb_build_object(
          'inviteId', inv.id,
          'invite', jsonb_build_object('id', inv.id, 'school', inv.school, 'grade', inv.grade, 'consent', inv.consent)
        );

  update public.roster_invites
     set status = 'claimed', claimed_by = me, claimed_at = now()
   where id = inv.id;

  return inv.listing_id;
end;
$$;

revoke all on function public.claim_roster_invite(text) from public, anon, authenticated;
grant execute on function public.claim_roster_invite(text) to authenticated;

-- ---- invite_preview ---------------------------------------------------------
create or replace function public.invite_preview(p_token text)
returns table (listing_name text, org_name text, inviter_first_name text, invited_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.name,
         case when l.org_class = 'official'
              then nullif(btrim(split_part(coalesce(l.site, l.location, ''), ',', 1)), '')
         end,
         nullif(btrim(p.first_name), ''),
         i.name
    from public.roster_invites i
    join public.listings l on l.id = i.listing_id
    left join public.profiles p on p.id = i.created_by
   where p_token ~ '^[0-9a-f]{64}$'
     and i.token = p_token
     and i.status = 'invited'
     and l.status in ('live', 'unlisted')
   limit 1;
$$;

revoke all on function public.invite_preview(text) from public, anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;

notify pgrst, 'reload schema';
