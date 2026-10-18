-- ============================================================================
-- 0002: count posted attendance hours in volunteer_directory.verified_hours
--
-- Found in the live end-to-end test. When a lead posts attendance, the hours
-- land in applications.assignment.attendanceHours (owner-written half).
-- listings.js loadMyServiceHours counts those as confirmed, so the volunteer's
-- Home, Profile and hour card showed 3.5 h while the directory card that
-- founders search showed 2.5 h. The guard from 0001 only summed confirmed
-- hoursLog entries. This version sums both, with the same rules the app uses:
--   * accepted applications only
--   * hoursLog entries whose id is true in assignment.confirmedHours
--   * assignment.attendanceHours entries with an id and numeric hrs > 0
--   * rounded to 0.1
-- No privileges or policies change. The function still runs as the caller
-- (security invoker) under the caller's RLS.
-- ============================================================================

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
    select coalesce(sum((h.value ->> 'hrs')::numeric), 0)
      into logged
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

    select coalesce(sum((h.value ->> 'hrs')::numeric), 0)
      into attended
      from public.applications a
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(a.assignment -> 'attendanceHours') = 'array'
             then a.assignment -> 'attendanceHours' else '[]'::jsonb end
      ) h
     where a.applicant_id = new.user_id
       and a.status = 'accepted'
       and coalesce(h.value ->> 'id', '') <> ''
       and jsonb_typeof(h.value -> 'hrs') = 'number'
       and (h.value ->> 'hrs')::numeric > 0;

    new.verified_hours := round(logged + attended, 1);
    if tg_op = 'INSERT' then
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.volunteer_directory_guard() from public, anon, authenticated;
