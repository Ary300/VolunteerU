-- ============================================================================
-- 0005: shift capacity
--
-- A published shift carries a cap (listings.shifts[].cap, a whole number or
-- null for no limit). Sign-ups live in applications.member_state.shifts,
-- which the volunteer writes, so the limit has to hold in the database:
-- a client that skips the app's check still cannot overfill a shift.
--
--   1. public.shift_spots(listing) returns { shift_id, cap, taken } for every
--      published shift of a listing anyone can open (live or unlisted) or the
--      caller owns. taken counts sign-ups on pending and accepted
--      applications. It runs as definer because RLS hides other volunteers'
--      applications from the caller; only counts leave the function.
--   2. private.applications_shift_capacity(), a BEFORE INSERT OR UPDATE
--      trigger on applications. When a pending or accepted application gains
--      a shift id it didn't hold before (a new sign-up, or Apply again after
--      a withdrawal), it locks the listing row so two sign-ups for the last
--      spot run one after the other, then refuses the write with SQLSTATE
--      VUFUL when that shift's taken count is already at or over its cap.
--
-- Forward-only. Earlier triggers and policies are unchanged.
-- ============================================================================

create or replace function public.shift_spots(listing uuid)
returns table (shift_id text, cap integer, taken integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s ->> 'id' as shift_id,
    case when (s ->> 'cap') ~ '^[0-9]+$' and (s ->> 'cap')::integer > 0
         then (s ->> 'cap')::integer end as cap,
    (
      select count(*)::integer
        from public.applications a
       where a.listing_id = l.id
         and a.status in ('pending', 'accepted')
         and jsonb_typeof(a.member_state -> 'shifts') = 'array'
         and exists (
           select 1 from jsonb_array_elements(a.member_state -> 'shifts') v
            where v ->> 'id' = s ->> 'id'
         )
    ) as taken
  from public.listings l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.shifts) = 'array' then l.shifts else '[]'::jsonb end
  ) s
  where l.id = listing
    and coalesce(s ->> 'id', '') <> ''
    and (l.status in ('live', 'unlisted') or l.owner_id = auth.uid());
$$;

revoke all on function public.shift_spots(uuid) from public;
grant execute on function public.shift_spots(uuid) to anon, authenticated;

create or replace function private.applications_shift_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_ids text[];
  old_ids text[] := '{}';
  offered jsonb;
  sid     text;
  cap     integer;
  taken   integer;
begin
  if new.status not in ('pending', 'accepted') then
    return new;
  end if;

  select coalesce(array_agg(distinct v ->> 'id'), '{}')
    into new_ids
    from jsonb_array_elements(
      case when jsonb_typeof(new.member_state -> 'shifts') = 'array'
           then new.member_state -> 'shifts' else '[]'::jsonb end
    ) v
   where jsonb_typeof(v) = 'object' and coalesce(v ->> 'id', '') <> '';

  if tg_op = 'UPDATE' and old.status in ('pending', 'accepted') then
    select coalesce(array_agg(distinct v ->> 'id'), '{}')
      into old_ids
      from jsonb_array_elements(
        case when jsonb_typeof(old.member_state -> 'shifts') = 'array'
             then old.member_state -> 'shifts' else '[]'::jsonb end
      ) v
     where jsonb_typeof(v) = 'object' and coalesce(v ->> 'id', '') <> '';
  end if;

  -- Nothing newly held: owner edits, cancellations and hours logs pass.
  if not exists (select 1 from unnest(new_ids) x where not (x = any (old_ids))) then
    return new;
  end if;

  select l.shifts into offered
    from public.listings l
   where l.id = new.listing_id
     for update;

  foreach sid in array new_ids loop
    continue when sid = any (old_ids);
    cap := null;
    select case when (s ->> 'cap') ~ '^[0-9]+$' then (s ->> 'cap')::integer end
      into cap
      from jsonb_array_elements(
        case when jsonb_typeof(offered) = 'array' then offered else '[]'::jsonb end
      ) s
     where s ->> 'id' = sid
     limit 1;
    continue when cap is null or cap <= 0;

    select count(*)::integer into taken
      from public.applications a
     where a.listing_id = new.listing_id
       and a.id <> new.id
       and a.status in ('pending', 'accepted')
       and jsonb_typeof(a.member_state -> 'shifts') = 'array'
       and exists (
         select 1 from jsonb_array_elements(a.member_state -> 'shifts') v
          where v ->> 'id' = sid
       );

    if taken >= cap then
      raise exception 'That shift is full.' using errcode = 'VUFUL';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.applications_shift_capacity() from public, anon, authenticated;

drop trigger if exists applications_shift_capacity on public.applications;
create trigger applications_shift_capacity
  before insert or update of member_state, status on public.applications
  for each row execute function private.applications_shift_capacity();
