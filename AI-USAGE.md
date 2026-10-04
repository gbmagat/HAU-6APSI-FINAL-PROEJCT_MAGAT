# AI usage

This project was built with AI assistance. This file is the record of it.

The main tool was **Claude Code** (Anthropic), used in a terminal with access to this repository. I described what I wanted, often with a screenshot of what was wrong; it read the code, made changes, ran the tests, and I reviewed the result in the browser before keeping it. The entries below were drafted from our session history with Claude Code's help.

## 1. How I used AI

### 2026-09-28 - Check the whole app for logic bugs and add tests

- **Tool:** Claude Code
- **What I asked for:** Scan the whole website, fix all the logic, and create test cases.
- **What it gave back:** A list of bugs across the pages (review visibility, place status, feed filters, form validation) with fixes, and a Vitest suite for the rating, place, feed and form rules.
- **What I kept, what I changed, and why:** I kept the fixes and the tests, because the tests let me change the app later without breaking the blind-review rule, which is the core of the app.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/172858a

### 2026-09-28 - Replace the placeholder map with a real one

- **Tool:** Claude Code
- **What I asked for:** "Let's fix this map", with a screenshot of the drawn placeholder map.
- **What it gave back:** A Leaflet map with OpenStreetMap tiles, pins coloured by visit status, keyboard support, and a "your location" marker.
- **What I kept, what I changed, and why:** I kept Leaflet and OpenStreetMap because they are free and need no API key. The first tile provider it chose needed a key, so we switched (see section 2).
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/c0b4df1

### 2026-10-02 - Real place search and photo uploads

- **Tool:** Claude Code
- **What I asked for:** "There's still many broken and bugs, I can't search", and to be able to upload photos and mark places as local or international.
- **What it gave back:** A server-side search through OpenStreetMap's Nominatim, saving a found place in one step, private photo storage outside the public folder, and a local/international filter.
- **What I kept, what I changed, and why:** I kept the server-side search so our two accounts are the only ones calling Nominatim, within its usage policy. Photos are served only to signed-in members, because the memories are private.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/8b4b6cc

### 2026-10-02 - Nearest place first, using a pinned location

- **Tool:** Claude Code
- **What I asked for:** When I pin my location and search, suggest results and find the nearest one.
- **What it gave back:** Distance ranking with the Haversine formula, a "Nearest" tag, and results sorted by distance from the pin. It also put the map toolbar on one line and removed nested cards when I said the profile looked AI-made.
- **What I kept, what I changed, and why:** I kept the distance ranking. I pushed back on the design twice ("put this in one line", "too many cards, it looks like an AI") until the screens looked simpler.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/0d6fd0e

### 2026-10-02 - Shortest road route with Dijkstra's algorithm

- **Tool:** Claude Code
- **What I asked for:** Find the shortest path between my pinned location and the place, using Dijkstra's algorithm.
- **What it gave back:** A Dijkstra implementation with a binary-heap priority queue, a road graph built from OpenStreetMap data (one-way streets respected), and an API route that draws the path on the map.
- **What I kept, what I changed, and why:** I kept the algorithm, but the first version did not work the way I expected on my own trip, so it was reworked the next day (see section 2).
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/4728b68

### 2026-10-03 - Up to six photos per experience

- **Tool:** Claude Code
- **What I asked for:** "I should be able to upload two or more photos."
- **What it gave back:** Choosing several photos at once, a description per photo, uploads that are safe to retry, and a gallery with a full-size viewer.
- **What I kept, what I changed, and why:** I kept the limit of six per experience, which keeps the private photo folder a sensible size.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/9282aa4

### 2026-10-03 - Plan reminders by email

- **Tool:** Claude Code
- **What I asked for:** A plan reminder that is sent to our email.
- **What it gave back:** A plan form (date, time, note, reminder choice), a background check every two minutes that emails both members once, and a Profile switch to turn the emails off. It then made the existing "Review reminders" switch send real emails too.
- **What I kept, what I changed, and why:** I kept the design where each reminder is marked as sent before the email goes out, so it is never sent twice. Without mail settings, emails are saved as files so they can be tested.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/7f504e7

### 2026-10-04 - Security checklist review

- **Tool:** Claude Code
- **What I asked for:** Go through the course's security instructions and checklist against this repository.
- **What it gave back:** An audit showing no secrets in the code or history, but that my private coursework folder and my personal email were in the public repository, and that the database account had more rights than it needed.
- **What I kept, what I changed, and why:** I removed the private folder, switched to GitHub's no-reply address and rewrote the history, and the app now uses a database role that can only read and change rows.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/afb1773 and https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/2031341

### 2026-10-04 - Deploying beside another app on my server

- **Tool:** Claude Code
- **What I asked for:** Deploy to the same server as my other website, without touching the other projects.
- **What it gave back:** A systemd service, an nginx site, and a deployment guide. It also checked the server read-only and found that only SSH is reachable from the internet.
- **What I kept, what I changed, and why:** I kept the separate account, folders, database and port, so Our Places cannot affect my other site. I chose to ask my VPS provider to open the web ports.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/a5cf5a0

## 2. Where the AI got it wrong

### Case 1 - The "shortest route" only showed a straight line

- **What it gave me:** A Dijkstra route behind a "Shortest route" button, with a dashed straight line drawn on the map until you pressed it, and a 10 km limit.
- **What was wrong with it:** When I tried my own trip, I only saw the straight line and thought the algorithm did not work. Each route also took about 12 seconds because the public road-data server was slow and sometimes refused requests.
- **What I did instead:** I reported it with a screenshot. The route now draws automatically, the straight line is gone, downloaded roads are saved per map tile so later routes take about 0.1 seconds, and longer trips use main roads.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/31ac81d

### Case 2 - Sign-in failed behind a proxy

- **What it gave me:** A check that writes come from our own site, comparing the browser's `Origin` with the server's own address.
- **What was wrong with it:** Behind a reverse proxy, Next.js reports its internal `localhost` address, so every sign-in and save from the real site was rejected with 403. The unit tests passed; it only showed up when we ran the production build end to end.
- **What I did instead:** The check now compares against the host the browser actually used (`X-Forwarded-Host`, then `Host`), with tests for the proxy case.
- **Commit:** https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT/commit/7032556

### Case 3 - A map tile provider that needed an API key

- **What it gave me:** A basemap from CARTO's tile servers.
- **What was wrong with it:** The tiles came back as "API KEY REQUIRED" images, so the map was unusable.
- **What I did instead:** We switched to OpenStreetMap's tiles with a soft colour filter to match the design, plus a notice if tiles fail to load.
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
