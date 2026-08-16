# VolunteerU

Students find real, age-eligible volunteering near them — or run their own project under a
verified sponsor. Either way the hours verify themselves and land on a record a college can check.

Built 1:1 from `VolunteerU Design.dc.html` (Claude Design project `Volunteer Hub Design System`).

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. On the sign-in screen, **Continue as Eli Fisch (demo account)**
loads the seeded record — 86 verified hours, four applications and one live project — so every
screen has real data in it.

```bash
npm run build && npm start   # production
```

## Stack

- **Next.js 15 (App Router)** with React 19, plain JavaScript + JSX.
- **No CSS framework.** The design expresses every rule as an inline CSS string, so `lib/style.js`
  parses those strings into React style objects (`S('padding:20px;border-radius:14px')`). Keeping
  the original strings verbatim is what makes the port provably 1:1. Interaction states
  (`style-hover` / `style-active` in the design) live as real classes in `app/globals.css`.
- **State** is a small external store (`lib/store.js`) read through `useSyncExternalStore`,
  persisted to `localStorage`, synced across tabs, and exportable/restorable from
  Settings → Your data.
- **Screens render client-side** (`components/AppFrame.jsx`). Everything they read — the store and
  URL search params — only exists in the browser, so gating on mount gives one render path with no
  hydration divergence.

## Layout

```
app/                     routes (server components that resolve params, then hand off to the client)
components/
  screens/               one file per design screen
  lead/Tabs.jsx          the six heavier Lead tabs
  ui.jsx                 the design system: buttons, fields, chips, toggles, states
  AppShell.jsx           signed-in chrome (design's `inApp` grid)
  ScreenNav.jsx          the design's fixed screen switcher
  OverlayHost.jsx        toasts, modals, confirms, anchored menus
lib/
  seed.js                every string, colour and number from the design
  db.js                  domain logic — selectors and actions
  store.js               persistence and React bindings
  style.js               CSS-string → style object, design tokens
.design/                 the source design file, kept for reference
```

## Screens

Design screens, all reachable from the switcher at bottom-left:

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Onboarding | `/onboarding` |
| Home | `/app` |
| Discover | `/discover` |
| Opportunity | `/opportunity/[id]` |
| Apply | `/apply/[id]` |
| Lead workspace (10 tabs) | `/lead/[projectId]/[tab]` |
| New project | `/create` |
| Profile | `/profile` |

Supporting routes the design links to but never drew: `/signin`, `/signup`, `/forgot`,
`/settings/[section]`, `/notifications`, `/saved`, `/friends`, `/projects/[id]`, `/schools`,
`/safety`, `/privacy`, and a 404.

## Notes on the data

The seeded dataset is anchored to **Wednesday, July 29 2026** (`lib/format.js`) so every relative
label — "2 hours ago", "Sat, Aug 9", "Wednesday, July 29" — stays mutually consistent instead of
drifting against the real clock.

Headline record totals (86 verified hours, 14 events, 6 organizations) are stored rather than summed
from the visible history, which is a sample. Posting hours updates both.
