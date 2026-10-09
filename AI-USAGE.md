# AI usage

This project was built with AI assistance. This file is the record of it.

**How I worked.** I planned the app (the proposal, the screens, and the design system) and decided every feature. I used **Claude Code** (Anthropic), a coding assistant that runs in the terminal, to implement and change the code. For each change I described what I wanted, often with a screenshot, then tried the result in the browser and either kept it or sent it back with what was wrong.

## 1. How I used AI

### 2026-09-28 - Logic review and a test suite

- **Tool:** Claude Code
- **What I asked for:** A review of the logic on every page, fixes for what was wrong, and automated tests.
- **What it gave back:** Fixes across review visibility, place status, feed filters and form validation, and a Vitest suite for those rules.
- **What I kept, what I changed, and why:** I kept the fixes and the tests. The blind-review rule is the core of the app, and the tests let me keep changing things without breaking it.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/172858a

### 2026-10-02 - Nearest place first, from a pinned location

- **Tool:** Claude Code
- **What I asked for:** After pinning my location, search results ranked by distance, with the nearest one picked.
- **What it gave back:** Distance ranking with the Haversine formula, a "Nearest" tag, and the map toolbar on one line.
- **What I kept, what I changed, and why:** I kept the ranking. I rejected the first layout twice, because the toolbar wrapped and the profile had cards inside cards, until the screens were simpler.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/0d6fd0e

### 2026-10-02 - Shortest road route with Dijkstra's algorithm

- **Tool:** Claude Code
- **What I asked for:** The shortest road path between my pinned location and a place, found with Dijkstra's algorithm.
- **What it gave back:** Dijkstra with a binary-heap priority queue, a road graph built from OpenStreetMap data with one-way streets respected, and an API route that draws the path.
- **What I kept, what I changed, and why:** I kept the algorithm. When I tested it on a real trip it did not behave as I expected, so I had it reworked (section 2).
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/4728b68

### 2026-10-03 - Plan reminders by email

- **Tool:** Claude Code
- **What I asked for:** Planning a visit on a date, with a reminder sent to our email.
- **What it gave back:** A plan form (date, time, note, reminder choice), a background check that emails both members once, and a Profile switch to turn the emails off. The existing "Review reminders" switch was then made to send real emails too.
- **What I kept, what I changed, and why:** I kept the rule that a reminder is marked as sent before the email goes out, so it can never be sent twice. Without mail settings, emails are saved as files, which let me test them.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/7f504e7

### 2026-10-04 - Security review against the course checklist

- **Tool:** Claude Code
- **What I asked for:** A check of the repository against the course's security instructions before submission.
- **What it gave back:** A row-by-row review: secrets, git history, SQL parameters, access control, error output and database permissions.
- **What I kept, what I changed, and why:** I acted on its findings. I tightened what the repository contains, and the app now connects with a database role that can only read and change rows.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/2031341

### 2026-10-09 - Create account with a sign-up code, and partner invites

- **Tool:** Claude Code
- **What I asked for:** A create-account option, so my professor can sign in and review the app without using my own login.
- **What it gave back:** A sign-up page that needs a sign-up code set on the server, a new empty private space for each new account, and one-time partner invite links from Profile that work for 7 days and are stored only as hashes.
- **What I kept, what I changed, and why:** It suggested the sign-up code instead of an open form, because open sign-up on a public link would let anyone create accounts and upload photos to a server that also runs my other site. I kept that: I set the code on the server and give it only to my professor, and removing it closes sign-up again.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/a286a34

## 2. Where the AI got it wrong

### Case 1 - The "shortest route" only showed a straight line

- **What it gave me:** A Dijkstra route behind a "Shortest route" button, with a dashed straight line on the map until it was pressed, and a 10 km limit.
- **What was wrong with it:** When I tested my own trip in Pampanga, I only saw the straight line. Each route also took about 12 seconds, because the public road-data server is slow and sometimes refuses requests.
- **What I did instead:** I reported it with a screenshot and had it changed. The route now draws automatically, downloaded roads are saved per map tile so later routes take about 0.1 seconds, and longer trips use main roads.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/31ac81d

### Case 2 - A map tile provider that needed an API key

- **What it gave me:** A basemap from CARTO's tile servers.
- **What was wrong with it:** The tiles came back as "API KEY REQUIRED" images, so the map was unusable.
- **What I did instead:** The map now uses OpenStreetMap tiles with a soft colour filter to match the design, plus a notice if tiles fail to load.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/c0b4df1

### Case 3 - A note promising something the app cannot do

- **What it gave me:** A line under the review comparison: "The shared score recalculates if either member edits a revealed review."
- **What was wrong with it:** Reviews cannot be edited; each member's review is final, by design.
- **What I did instead:** The note now says both reviews are final, so the score stays as it is.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/2ec414f

## 3. Who wrote what

### Written by me

- **File:** `src/components/status-badge.tsx`, plus the other parts of my first draft that are still as I wrote them: `src/app/page.tsx`, `src/app/(app)/museums/[slug]/page.tsx`, the SVG icons and illustrations in `public/assets/` (from my Figma design), and `DESIGN_SYSTEM.md`.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/172858a (I wrote the first draft of the website in July and August 2026, before this repository existed, so it arrived in the first commit.)
- **What it does and why it is built this way:** `status-badge.tsx` draws the small labels that say where a place stands. `VisitStatusBadge` looks up each visit status ("Want to Visit", "Planned", "Visited") in two tables, one for the label and one for the icon. Because the tables are typed as `Record<VisitStatus, …>`, TypeScript refuses to build if a status is ever added without a label. `PlaceBadges` puts the status badge together with a Favorite badge and a review badge. The review badge only shows while a review is still pending ("Your review is needed" or "Waiting for partner"): once both reviews are in, the shared score takes its place, and before anyone reviews there is nothing to wait for. The icons are hidden from screen readers because the text already says the same thing, and the colours come from `status-badge--…` classes that follow my design system. `src/app/page.tsx` sends visitors from the home address to the sign-in page, and the `museums/[slug]` page redirects old links from when the app was "Our Museum Passport" to the new `/places/` addresses, so old links keep working now that the app covers more than museums.

### The AI-written part I understand best

- **File:** `src/lib/dijkstra.ts`, with `src/lib/road-graph.ts`, which feeds it
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/4728b68
- **Written by:** Claude Code, when I asked for the shortest road route between my pinned location and a place. I tested it on real trips, and asked for the changes in section 2, case 1.
- **What it does and why we kept it:** It finds the shortest road route between my pinned location and a place. `road-graph.ts` turns OpenStreetMap roads into a graph: every road point is a node, and each stretch between two neighbouring points is an edge whose weight is its real length in kilometres (Haversine formula). A one-way street only gets an edge in its own direction. The pin and the place are each attached to the nearest point on the main connected road network. Dijkstra then keeps the shortest known distance to every point and a priority queue (a binary min-heap) of points to visit. It always takes the closest unvisited point next, and for each of its roads checks whether going through it gives a neighbour a shorter distance; if so, it records the new distance and remembers where it came from. When the place comes out of the queue, the shortest distance is final, and following the "came from" links backwards gives the route. Out-of-date queue entries are skipped instead of removed, and negative weights are refused, because they would break the rule that a point taken from the queue is final. We kept it because it is correct (tests cover the textbook six-node example and one-way streets), fast (the heap makes each step O(log n), so about 30,000 road points take well under a second), and short enough to explain line by line.
