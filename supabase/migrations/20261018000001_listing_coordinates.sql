-- ============================================================================
-- 0003: coordinates for a listing's address
--
-- Discover's map and the listing page's map put a pin at a listing's real
-- spot. lib/listings.js publishListing geocodes the address (app/api/geocode,
-- OpenStreetMap Nominatim with the US Census geocoder as a fallback) and
-- writes lat/lng with the row. Both stay null when the address can't be
-- found or the listing is online; the map then geocodes it in the browser or
-- leaves it off and says so.
--
-- Rows: the existing listings policies (0001) already cover every row, so no
-- policy changes. Columns: 0001 grants insert and update column by column, so
-- the two new columns are granted to authenticated here. Select is granted on
-- the whole table, which includes new columns.
--
-- Forward-only and safe to run twice.
-- ============================================================================

alter table public.listings add column if not exists lat double precision;
alter table public.listings add column if not exists lng double precision;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_lat_range' and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_lat_range check (lat is null or (lat between -90 and 90));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_lng_range' and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_lng_range check (lng is null or (lng between -180 and 180));
  end if;
end;
$$;

grant insert (lat, lng) on public.listings to authenticated;
grant update (lat, lng) on public.listings to authenticated;
