-- ============================================================================
-- 0003: hours integrity
--
-- Closes three findings from the security review of 0001 and 0002.
--
--   1. Hour inflation. 0001 let a volunteer copy an already confirmed hoursLog
--      entry (same id, same value) because "equal to an old entry" counted as
--      unchanged, and the directory sum then counted the copy again.
--   2. Confirmation was matched on id alone and ids were not required to be
--      unique inside a log.
--   3. assignment.attendanceHours, written by the listing owner, had no
--      per-entry bound and no id uniqueness.
--
-- Rules after this migration
--   hoursLog (volunteer writes, only when the list changes):
--     * a list, every entry an object with a non-empty string id
--     * ids unique inside the list
--     * every entry has numeric hrs with 0 < hrs <= 24
--     * an entry whose id is confirmed in assignment.confirmedHours must equal
--       an entry of the old log (same id and same value). A confirmed entry
--       can be removed, as the app allows, and never edited or added.
--   attendanceHours (owner writes, only when the list changes):
--     * a list, every entry an object with a non-empty string id
--     * ids unique, numeric hrs with 0 < hrs <= 24
--   Sums (volunteer_directory.verified_hours):
--     * each confirmed id counts once per application
--     * each attendanceHours id counts once per application
--     * a confirmation holds either a bare true (older rows, hours read from the
--       log) or a snapshot object with hrs (what listings.js confirmMemberHour
--       writes). 0002 only recognised true, so snapshot confirmations were
--       missing from the directory. Both forms count now, matching the app's
--       memberHourEntries.
--     * every counted entry has 0 < hrs <= 24
--
-- Replaces the two trigger functions only. Triggers, grants and policies from
-- 0001 and 0002 stay as they are (CREATE OR REPLACE keeps the trigger bindings).
-- All checks are inline: the callers (anon, authenticated) have no access to the
-- private schema, so a trigger body cannot call helper functions there.
-- ============================================================================

-- ---- applications: update ---------------------------------------------------
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
  att        jsonb;
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

    -- Posted attendance: validated whenever the list is written.
    att := new.assignment -> 'attendanceHours';
    if att is not null and att <> 'null'::jsonb
       and att is distinct from (old.assignment -> 'attendanceHours') then
      if jsonb_typeof(att) <> 'array' then
        raise exception 'Posted hours must be a list.' using errcode = '22023';
      end if;
      if exists (
        select 1 from jsonb_array_elements(att) v
         where jsonb_typeof(v) is distinct from 'object'
            or jsonb_typeof(v -> 'id') is distinct from 'string'
            or (v ->> 'id') = ''
      ) then
        raise exception 'Every posted hours entry needs an id.' using errcode = '23514';
      end if;
      if (select count(distinct v ->> 'id') from jsonb_array_elements(att) v)
         <> jsonb_array_length(att) then
        raise exception 'Posted hours entries need unique ids.' using errcode = '23514';
      end if;
      if exists (
        select 1 from jsonb_array_elements(att) v
         where case when jsonb_typeof(v -> 'hrs') = 'number'
                    then (v ->> 'hrs')::numeric <= 0 or (v ->> 'hrs')::numeric > 24
                    else true end
      ) then
        raise exception 'Posted hours must be more than 0, up to 24.' using errcode = '23514';
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

    -- A log that is byte-for-byte what was already stored needs no checks, so
    -- other member_state updates are not blocked by older rows.
    if new_log is not null and new_log is distinct from (old.member_state -> 'hoursLog') then
      if exists (
        select 1 from jsonb_array_elements(new_log) v
         where jsonb_typeof(v) is distinct from 'object'
            or jsonb_typeof(v -> 'id') is distinct from 'string'
            or (v ->> 'id') = ''
      ) then
        raise exception 'Every hours entry needs an id.' using errcode = '23514';
      end if;
      if (select count(distinct v ->> 'id') from jsonb_array_elements(new_log) v)
         <> jsonb_array_length(new_log) then
        raise exception 'Hours entries need unique ids.' using errcode = '23514';
      end if;
      if exists (
        select 1 from jsonb_array_elements(new_log) v
         where case when jsonb_typeof(v -> 'hrs') = 'number'
                    then (v ->> 'hrs')::numeric <= 0 or (v ->> 'hrs')::numeric > 24
                    else true end
      ) then
        raise exception 'Enter more than 0 hours, up to 24.' using errcode = '23514';
      end if;
      -- Confirmed entries: same id and same value as before, or gone.
      if exists (
        select 1 from jsonb_array_elements(new_log) v
         where jsonb_typeof(confirmed) = 'object'
           and ((confirmed -> (v ->> 'id')) = 'true'::jsonb
                or jsonb_typeof(confirmed -> (v ->> 'id')) = 'object')
           and not exists (select 1 from jsonb_array_elements(old_log) o where o.value = v)
      ) then
        raise exception 'Confirmed hours cannot be edited.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  raise exception 'Not your application.' using errcode = '42501';
end;
$$;

-- ---- volunteer_directory: verified_hours ------------------------------------
create or replace function private.volunteer_directory_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  logged   numeric;
  attended numeric;
begin
  if current_user in ('anon', 'authenticated') then
    -- One row per (application, confirmed id). A snapshot object carries its own
    -- hrs; a bare true reads the first log entry with that id.
    select coalesce(sum(x.hrs), 0)
      into logged
      from (
        select case
                 when jsonb_typeof(c.value) = 'object' then c.value -> 'hrs'
                 else l.value -> 'hrs'
               end as hrs_json
          from public.applications a
          cross join lateral jsonb_each(
            case when jsonb_typeof(a.assignment -> 'confirmedHours') = 'object'
                 then a.assignment -> 'confirmedHours' else '{}'::jsonb end
          ) c
          left join lateral (
            select h.value
              from jsonb_array_elements(
                     case when jsonb_typeof(a.member_state -> 'hoursLog') = 'array'
                          then a.member_state -> 'hoursLog' else '[]'::jsonb end
                   ) with ordinality as h(value, ord)
             where h.value ->> 'id' = c.key
             order by h.ord
             limit 1
          ) l on c.value = 'true'::jsonb
         where a.applicant_id = new.user_id
           and a.status = 'accepted'
           and (c.value = 'true'::jsonb or jsonb_typeof(c.value) = 'object')
      ) y
      cross join lateral (
        select case when jsonb_typeof(y.hrs_json) = 'number'
                    then (y.hrs_json #>> '{}')::numeric end as hrs
      ) x
     where x.hrs > 0 and x.hrs <= 24;

    -- One row per (application, attendance id), first valid entry wins.
    select coalesce(sum(z.hrs), 0)
      into attended
      from (
        select distinct on (a.id, h.value ->> 'id')
               (h.value ->> 'hrs')::numeric as hrs
          from public.applications a
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(a.assignment -> 'attendanceHours') = 'array'
                 then a.assignment -> 'attendanceHours' else '[]'::jsonb end
          ) with ordinality as h(value, ord)
         where a.applicant_id = new.user_id
           and a.status = 'accepted'
           and jsonb_typeof(h.value) = 'object'
           and coalesce(h.value ->> 'id', '') <> ''
           and jsonb_typeof(h.value -> 'hrs') = 'number'
           and case when jsonb_typeof(h.value -> 'hrs') = 'number'
                    then (h.value ->> 'hrs')::numeric > 0 and (h.value ->> 'hrs')::numeric <= 24
                    else false end
         order by a.id, h.value ->> 'id', h.ord
      ) z;

    new.verified_hours := round(logged + attended, 1);
    if tg_op = 'INSERT' then
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.volunteer_directory_guard() from public, anon, authenticated;
revoke all on function private.applications_before_update() from public, anon, authenticated;
