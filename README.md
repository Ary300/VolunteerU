# VolunteerU

**A free platform where students launch and run their own volunteer organization, and where volunteers find work that fits them. Service hours count as verified only when the organizer confirms them.**

Student volunteering usually breaks in two places. Finding something real, nearby, and open to a teenager is hard, and proving the hours afterward is harder, because a self-reported log is easy to inflate and hard for a school to trust. Most tools solve one side: a directory of openings, or a form to log hours. VolunteerU treats the organizer and the volunteer as two halves of the same record. A founder publishes a project, volunteers apply into the founder's workspace, check in at sessions, and log hours there, and the founder confirms them. Only confirmed hours land on the volunteer's verified total.

Live app: **https://www.volunteeruapp.com**

```
founder:    new-project wizard  ->  workspace (positions, shifts, pipeline)  ->  publish listing
volunteer:  interests + causes + city  ->  keyword match over live listings
                                       +  registered nonprofits (ProPublica, IRS 990 data)
            ->  apply (position, note, screening answers)  ->  founder accepts
            ->  check in with the session code  ->  log hours  ->  founder confirms
            ->  verified hours on the volunteer's record
```

Hours count when someone else signs off.

## The core idea

1. **One record, two owners.** Each application row carries a volunteer-owned half (`member_state`: hours log, check-ins, task status) and a founder-owned half (`assignment`: role, confirmed hours). The client scopes volunteer writes to `applicant_id` and founder writes to `owner_id`, and guards in the database stop a volunteer from confirming their own hours.
2. **Verification is earned, not claimed.** A new listing shows as self-reported. A founder can request verification with an organization name and staff contact, and the verified badge is set only through manual review. A founder also cannot start a second project until every live project has at least one posted attendance session.
3. **Client-first, and it never drops an edit.** The UI runs off a local store, so screens respond instantly and survive a refresh. A durable outbox mirrors the user's workspace to Supabase, retries failures with backoff, and refuses to overwrite cloud data with a stale or empty copy.

## What it does

| Feature | Where | Detail |
|---|---|---|
| **Discover** | `/discover` | One feed of listings made on VolunteerU plus registered nonprofits, filterable by All opportunities, Made on VolunteerU, or Registered nonprofits. |
| **Matching** | `matchListings` in `lib/listings.js` | Pulls up to 8 keywords from the volunteer's own words (stop words removed), expands them with synonyms to at most 16, and searches five listing fields server side. Scores by keyword hits, **+2** for a listing in the volunteer's city, **+1** for remote or hybrid, and returns the top 9. |
| **Nonprofit search** | `/api/nonprofits` | A server proxy to ProPublica's Nonprofit Explorer (the upstream API sends no CORS headers). Broadens in up to five steps, from cause plus state down to general community groups, so results are never empty. Caches searches for 1 hour and organization detail for 24 hours. Maps NTEE codes to causes. |
| **Public join page** | `/join/[id]` | A founder's shareable link. Anyone can view it signed out. Applying routes through sign-in and lands back on the page. |
| **New project wizard** | `/create` | Four steps (basics, positions, schedule, review) for a volunteering project or a team: cause, term, repeat schedule, visibility, audience, a mission of up to 240 characters, and auto-generated sessions. |
| **Lead workspace** | `/lead/[projectId]/[tab]` | Eleven tabs for volunteering projects (overview, people, positions, shifts, attendance, applications, hours, quality, pipeline, messages, settings) and five for teams (overview, team, tasks, messages, settings). |
| **Attendance and check-in** | `lib/db.js` | Four-digit check-in codes that can be regenerated. Attendance refuses to post while any volunteer is unmarked, and refuses to post the same session twice. |
| **Crew** | `/crew` | The volunteer's view across every membership: pipeline steps with the organizer's links, briefings, check-in, logged hours, announcements, and a direct message thread. |
| **Volunteer directory** | `/volunteers` | Search volunteers who opted into the directory by name, skills, cause, and city. Lives inside the signed-in app. |
| **Service record** | `/app`, `/profile` | Verified versus pending hours, progress toward an hours goal (40 by default), a weekly streak keyed by ISO week, and badges. |
| **Calendar and backup** | `lib/calendar.js`, Settings | One-tap Google Calendar link for a claimed shift. Full JSON export and restore of the local workspace. |
| **Analytics** | `lib/analytics.js` | PostHog with autocapture and manual page views for the App Router. Off when no key is set. |

## How it works

**Stack.** Next.js 15 (App Router) with React 19 in plain JavaScript and JSX. Supabase for auth and Postgres. PostHog for product analytics. Geist and Geist Mono from Google Fonts. No CSS framework and no component library.

**Design port.** The UI was ported from a single-file HTML design (`.design/`) that expresses every rule as an inline CSS string. Rather than hand-translate each one, `lib/style.js` parses those strings into React style objects once and memoizes them (`S('padding:20px;border-radius:14px')`), splitting on top-level semicolons only so values with parentheses or colons survive. Hover and active states live as real classes in `app/globals.css`.

**State.** `lib/store.js` is an external store read through `useSyncExternalStore`. It persists to `localStorage` on a 200 ms debounce, flushes on `pagehide` and when the tab is hidden, syncs across tabs through the `storage` event, versions its schema so stale local copies are dropped, and keeps running from memory when storage is unavailable. Signed-in screens render only after mount (`components/AppFrame.jsx`), since everything they read exists only in the browser, so there is one render path and no hydration mismatch.

**Cloud sync.** `lib/sync.js` mirrors 21 per-user slices into one `user_state` row. Every mutation bumps a dirty version. A flush upserts the whole workspace after 700 ms and advances the synced version only on a confirmed write. Failures keep the dirty marker and retry with exponential backoff from 1.5 s up to 30 s plus jitter, and reconnecting flushes at once. Each edit is stamped, so on load a newer local copy wins and is pushed up instead of being overwritten.

**Auth.** Supabase email and password. Loading a user's workspace returns one of three states: loaded, empty, or error. Only a genuinely empty result seeds a blank workspace. A failed read keeps local state and retries, so a transient error during a token refresh can never be mistaken for a new account and push an empty workspace over real data. Password recovery links are routed to `/reset` from any path.

**Shared data.** Listings, applications, messages, profiles, and the volunteer directory are separate Supabase tables used by `lib/listings.js`. Read-modify-write updates on the JSON columns abort if the read fails, rather than writing over logged hours with an empty base. User-supplied website links pass through `safeUrl`, which allows only `http` and `https`.

## Run it

```bash
npm install
npm run dev                   # http://localhost:3000
npm run build && npm start    # production
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` for accounts and shared data. Without them the pages render, but sign-in reports that the backend is not configured. `NEXT_PUBLIC_POSTHOG_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) turns on analytics. `LAUNCH.md` lists the steps that live outside the code: custom SMTP for password reset, the manual verification queue, and clearing test data before launch.

## Layout

```
app/
  page.js                     landing
  signin/ signup/ forgot/ reset/   auth
  onboarding/                 first-run setup
  app/                        home dashboard
  discover/ volunteers/       find projects, find people
  join/[id]/                  public listing page and apply entry
  create/                     new project wizard
  lead/[projectId]/[tab]/     founder workspace
  crew/ profile/ saved/ friends/ notifications/ settings/   volunteer screens
  schools/ safety/ privacy/   public pages
  api/nonprofits/route.js     ProPublica proxy
components/
  screens/                    one file per screen
  lead/                       workspace tabs, pipeline, tasks, cross-project members
  ui.jsx                      design system: buttons, fields, chips, toggles, states
  AppFrame.jsx  AppShell.jsx  client boundary and signed-in chrome
  OverlayHost.jsx             toasts, modals, confirms, anchored menus
  MapPanel.jsx                OpenStreetMap tile mosaic with pins
lib/
  store.js                    local store, persistence, cross-tab sync, backup
  sync.js                     durable cloud outbox
  auth.js  supabase.js        session bridge and client
  db.js                       domain logic: selectors and actions
  listings.js                 shared multi-account layer: listings, applications, hours, messages
  seed.js                     design strings, tokens, and initial state
  style.js                    CSS string to style object
  analytics.js calendar.js createDraft.js format.js overlays.js
.design/                      the source design file, kept for reference
LAUNCH.md                     launch checklist for steps outside the code
```

## Honesty

* The database schema, row-level security policies, and the triggers the app relies on
  (auto-confirming signup, blocking self-accept, self-confirmed hours, and self-verification) live
  in the Supabase project. They are not in this repo, so a fresh Supabase project will not
  reproduce them.
* Organization verification is a manual review. There is no in-app admin screen.
* A check-in records the code the volunteer typed, but the code is not checked against the session.
  The organizer confirms attendance on their side.
* Hours a volunteer logs on their own stay self-reported until an organization confirms them. The
  app shows the two totals separately.
* Password reset depends on custom SMTP being configured in Supabase.
* There are no automated tests.

MIT licensed.
