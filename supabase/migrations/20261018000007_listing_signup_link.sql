-- ============================================================================
-- 0007: a listing's own sign-up form and nonprofit record
--
-- Many organizations already run a sign-up form of their own (Google Forms,
-- VolunteerHub, SignUpGenius). The join page keeps VolunteerU's Apply as the
-- main action, so shifts and hours are tracked here, and links to that form
-- next to it.
--
--   signup_url     the organization's sign-up form, http or https only.
--   signup_only    true when the organization holds spots only through that
--                  form, so the join page tells volunteers to fill it out.
--   nonprofit_ein  the IRS EIN of the nonprofit that posted the listing, or
--                  of the nonprofit a student project runs with. The join
--                  page links to /nonprofits/<ein>. Nine digits, no dash.
--
-- lib/listings.js publishListing writes all three. A database without this
-- migration rejects the columns; the app then saves the listing without them
-- and remembers not to send them again that page load.
--
-- Rows: the existing listings policies (0001) cover every row, so no policy
-- changes. Columns: 0001 grants insert and update column by column, so the
-- new columns are granted to authenticated here. Select is granted on the
-- whole table, which includes new columns.
--
-- Forward-only and safe to run twice.
-- ============================================================================

alter table public.listings add column if not exists signup_url text;
alter table public.listings add column if not exists signup_only boolean not null default false;
alter table public.listings add column if not exists nonprofit_ein text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_signup_url_http' and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_signup_url_http check (
        signup_url is null
        or (char_length(signup_url) <= 500 and signup_url ~* '^https?://[^[:space:]]+$')
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_nonprofit_ein_digits' and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_nonprofit_ein_digits check (
        nonprofit_ein is null or nonprofit_ein ~ '^[0-9]{9}$'
      );
  end if;
end;
$$;

grant insert (signup_url, signup_only, nonprofit_ein) on public.listings to authenticated;
grant update (signup_url, signup_only, nonprofit_ein) on public.listings to authenticated;

notify pgrst, 'reload schema';
