-- ============================================================================
-- 0006: renaming yourself reaches organizers
--
-- Settings > Account lets a volunteer change their first and last name. The
-- app never writes profiles directly (0001 grants select only), and
-- applications.applicant_name is frozen by the update trigger, so a rename
-- only changed the browser copy and the directory row. Organizers kept
-- seeing the old name.
--
-- public.set_my_name(first_name, last_name) updates the caller's own profiles
-- row and the applicant_name on the caller's own applications, in one call.
-- It runs as definer so the frozen-field check in applications_before_update
-- (which only applies to anon and authenticated) lets this one change
-- through. Names are trimmed, the first name is required and each part is at
-- most 60 characters. Returns the stored full name.
--
-- Forward-only. Policies and grants on the tables are unchanged.
-- ============================================================================

create or replace function public.set_my_name(first_name text, last_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  f     text := btrim(coalesce(first_name, ''));
  l     text := btrim(coalesce(last_name, ''));
  full_name text;
begin
  if me is null then
    raise exception 'Sign in to change your name.' using errcode = '42501';
  end if;
  if f = '' then
    raise exception 'Enter your first name.' using errcode = '22023';
  end if;
  if char_length(f) > 60 or char_length(l) > 60 then
    raise exception 'Names can be up to 60 characters.' using errcode = '22023';
  end if;
  full_name := btrim(f || ' ' || l);

  update public.profiles p
     set first_name = f, last_name = l
   where p.id = me;

  update public.applications a
     set applicant_name = full_name
   where a.applicant_id = me
     and a.applicant_name is distinct from full_name;

  return full_name;
end;
$$;

revoke all on function public.set_my_name(text, text) from public, anon;
grant execute on function public.set_my_name(text, text) to authenticated;
