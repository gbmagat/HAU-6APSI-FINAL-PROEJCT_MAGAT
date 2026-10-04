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

### 2026-09-28 - A real map instead of the placeholder

- **Tool:** Claude Code
- **What I asked for:** Replace the drawn placeholder map with a working map of our places.
- **What it gave back:** A Leaflet map with OpenStreetMap tiles, pins coloured by visit status, keyboard support, and a "your location" marker.
- **What I kept, what I changed, and why:** I kept Leaflet and OpenStreetMap because they are free and need no API key. The first tile provider it used did need a key and was replaced (section 2).
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/c0b4df1

### 2026-10-02 - Place search and photo uploads

- **Tool:** Claude Code
- **What I asked for:** Search that finds real places, saving a found place, photo uploads, and a local/international label for places.
- **What it gave back:** Search through OpenStreetMap's Nominatim, run on the server; one-step saving; private photo storage outside the public folder; a local/international filter.
- **What I kept, what I changed, and why:** I kept the search on the server so only our app calls Nominatim, within its usage policy. Photos are served only to signed-in members, because the memories are private.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/8b4b6cc

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

### 2026-10-03 - Several photos per experience

- **Tool:** Claude Code
- **What I asked for:** Uploading two or more photos to one experience.
- **What it gave back:** Choosing several photos at once, a description per photo, uploads that are safe to retry, and a gallery with a full-size viewer.
- **What I kept, what I changed, and why:** I kept its limit of six per experience, which keeps the private photo storage a sensible size.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/9282aa4

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

### 2026-10-04 - Deploying beside an existing app on my server

- **Tool:** Claude Code
- **What I asked for:** A deployment on my own Ubuntu server, which already runs another site, without affecting that site.
- **What it gave back:** A systemd service, an nginx site and a deployment guide, after a read-only check of the server.
- **What I kept, what I changed, and why:** I kept the separate account, folders, database and port, so Our Places cannot affect the other site. The server only accepts SSH from outside, so I chose to have the provider open the web ports.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/a5cf5a0

## 2. Where the AI got it wrong

### Case 1 - The "shortest route" only showed a straight line

- **What it gave me:** A Dijkstra route behind a "Shortest route" button, with a dashed straight line on the map until it was pressed, and a 10 km limit.
- **What was wrong with it:** When I tested my own trip in Pampanga, I only saw the straight line. Each route also took about 12 seconds, because the public road-data server is slow and sometimes refuses requests.
- **What I did instead:** I reported it with a screenshot and had it changed. The route now draws automatically, downloaded roads are saved per map tile so later routes take about 0.1 seconds, and longer trips use main roads.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/31ac81d

### Case 2 - Sign-in failed behind a proxy

- **What it gave me:** A check that writes come from our own site, comparing the browser's `Origin` header with the server's own address.
- **What was wrong with it:** Behind a reverse proxy, Next.js reports its internal `localhost` address, so every sign-in and save was rejected with 403. The unit tests passed; it only showed up when we ran the production build end to end.
- **What I did instead:** The check now compares against the host the browser actually used (`X-Forwarded-Host`, then `Host`), with tests for the proxy case.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/7032556

### Case 3 - A map tile provider that needed an API key

- **What it gave me:** A basemap from CARTO's tile servers.
- **What was wrong with it:** The tiles came back as "API KEY REQUIRED" images, so the map was unusable.
- **What I did instead:** The map now uses OpenStreetMap tiles with a soft colour filter to match the design, plus a notice if tiles fail to load.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/c0b4df1

### Case 4 - A note promising something the app cannot do

- **What it gave me:** A line under the review comparison: "The shared score recalculates if either member edits a revealed review."
- **What was wrong with it:** Reviews cannot be edited; each member's review is final, by design.
- **What I did instead:** The note now says both reviews are final, so the score stays as it is.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/2ec414f

## 3. Who wrote what

### Written by me

- **File:**
- **Commit:**
- **What it does and why it is built this way:**

### The AI-written part I understand best

- **File:**
- **Commit:**
- **What it does and why we kept it:**
