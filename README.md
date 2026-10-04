# Our Places

A private web app for two people to discover places, plan visits, keep a shared record of what they did together, and review each visit independently. Each person's review stays hidden from the other until both have submitted; then the combined score is revealed.

It covers restaurants, cafés, museums, parks, and any other place worth remembering.

![The feed, with story filters and the next planned place](docs/screenshots/feed.png)

## Features

- **Two invited accounts per shared space.** There is no public sign-up; accounts are created with a provisioning script.
- **Map and search.** Places sit at their real coordinates on an OpenStreetMap map. Typing filters your saved places; pressing Enter searches OpenStreetMap for any real place, which you can save in one step. Filter by status, use Near me, or pin your location.
- **Nearest first.** After you pin your location (or use Near me), search prefers nearby results, lists saved places and results with their distance, and jumps to the nearest match. Distances use the Haversine formula.
- **Shortest route.** Once your location is pinned, picking a place draws the shortest road route to it. The server builds a graph from OpenStreetMap roads (road points as nodes, segments weighted by length, one-way streets in one direction) and runs Dijkstra's algorithm with a binary-heap priority queue. Trips up to 10 km use every road; trips up to 40 km use main roads between the two ends. Roads are downloaded once per map tile and saved, so later routes in the same area take a fraction of a second. Longer trips link to directions instead.
- **Place details.** A place page adds its website, opening hours, phone, and a Wikipedia summary when OpenStreetMap has them, plus a link to its reviews on Google Maps.
- **Local or international.** The wishlist filters saved places by whether they are in the Philippines or abroad.
- **Plan reminders by email.** Plan a visit on a date, with an optional time and note, and choose a reminder: the day before at 6 PM, on the day at 8 AM, or a week before at 9 AM (Philippine time). The server checks every two minutes and emails both members once; each member can turn these emails off in Profile. Upcoming plans lead the wishlist.
- **Log an experience** in four steps: place and date, story, up to six photos (each with its own description), and a private rating with a short reflection. Photos are stored privately on the server and shown only to the two members, as a gallery that opens into a full-size viewer.
- **Blind reviews.** Your partner's review is withheld by the server query until both reviews exist, then the shared score appears. If one of you logs a visit and the other has not reviewed it 15 minutes later, the other gets an email that their review is waiting; it never mentions the hidden rating or reflection. Each member can turn these emails off in Profile.
- **Feed** with filters for photos and pending reviews, plus reactions and private comments.
- **Place pages, wishlist, archive, and profile** with display names and preferences.

## Tech stack

Next.js 16 (App Router), React, TypeScript · PostgreSQL through `pg` · Leaflet with OpenStreetMap tiles · Zod validation · custom email/password sign-in with scrypt hashes and database-backed sessions · Vitest with PGlite for tests.

### Client, API, and database

| Piece | Where it lives |
|---|---|
| **React client** | The pages and components in `src/app` and `src/components`, written in React 19 and rendered by Next.js. |
| **API** | Node.js route handlers in `src/app/api`, one folder per endpoint (see [API routes](#api-routes)). They take and return JSON, check the session, and validate every request with Zod, the same job an Express router does. |
| **Database** | PostgreSQL, reached only from the server through the `pg` connection pool in `src/lib/db.ts`, with every query parameterised. |

**Why Next.js instead of a separate Express server.** The app is private to two people, so nothing in it may reach the browser before the server has checked who is asking. With Next.js, the pages and the API run in the same Node.js process on the same origin: the server checks the session before rendering a page, the sign-in cookie never has to cross between two sites, and there is no CORS to configure, which leaves one fewer thing to get wrong. It also means one service to deploy and keep running instead of two. The API is still a separate layer: the route handlers are thin, and the rules they call (blind reviews, distances, routes, reminders) live in plain TypeScript modules in `src/lib`, which have their own tests and would move to an Express server unchanged.

## Getting started

### Requirements

- Node.js 20.9 or newer and npm
- PostgreSQL 13 or newer, only for the signed-in version with saved data

### Install

```bash
git clone https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT.git
cd HAU-6APSI-FINAL-PROEJCT_MAGAT
npm ci
```

On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm`.

### Configure

Copy `.env.example` to `.env.local`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Server-only PostgreSQL connection string. Leave empty to use the frontend preview. Never commit a real value. |
| `PHOTO_DIR` | Server-only folder for uploaded photos, outside `public/`. Defaults to `./storage/photos`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Mail server for plan and review reminders, for example Gmail (`smtp.gmail.com`, port 587, with an app password). Port 465 uses TLS from the start; set `SMTP_SECURE` to override. Without `SMTP_HOST`, emails are saved as `.eml` files in `./storage/outbox` instead of being sent. |
| `MAIL_FROM` | Sender shown on reminder emails. Defaults to `Our Places <SMTP_USER>`. |
| `APP_URL` | The site's public address, used for the link in reminder emails, for example `https://ourplaces.example.com`. |
| `PLAN_REMINDERS` | Set to `off` to stop this server from sending any reminder emails. |
| `ROAD_CACHE_DIR` | Server-only folder for saved OpenStreetMap road tiles used by routes. Defaults to `./storage/roads`; safe to delete. |

The app runs in one of three modes:

- **Development without `DATABASE_URL`:** a frontend preview with sample data, saved only in the browser. The Profile page can switch between the two sample members, which is the easiest way to try the blind reviews.
- **With `DATABASE_URL`:** sign-in is required, and all data is loaded from and saved to PostgreSQL through the API routes.
- **Production without a database:** private pages redirect to sign-in and the preview is disabled.

### Database setup

1. Create a new, empty PostgreSQL database and a dedicated login role for this app only.
2. Apply the schema once:
   ```bash
   psql -h 127.0.0.1 -U our_places_app -d our_places -v ON_ERROR_STOP=1 -f db/schema.sql
   ```
3. Create the two accounts in an interactive terminal. The script checks the database is empty, asks for a typed confirmation, and reads passwords without echoing them.
   ```bash
   node scripts/provision-space.mjs --database our_places --owner-email YOU@example.com --owner-name "Your name" --partner-email PARTNER@example.com --partner-name "Partner name"
   ```

4. Optionally load sample places. You can add real places from the map search; [db/sample-places.sql](db/sample-places.sql) loads nine sample places, two of them abroad.
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/sample-places.sql
   ```

5. A database created from an older `db/schema.sql` needs the files in [db/migrations](db/migrations) applied in order. They are safe to run more than once.
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001-plan-reminders.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002-review-reminders.sql
   ```

See [deploy/DEPLOY.md](deploy/DEPLOY.md) to deploy on an Ubuntu server alongside other apps, and [db/README.md](db/README.md) for database setup. The `supabase/` folder is an earlier design kept for history; do not apply it.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server at http://localhost:3000 |
| `npm run check` | Lint, type-check, and run all tests |
| `npm run build` | Create the production build |
| `npm start` | Run the production build |
| `npm run test` | Run the tests only |

## Usage

Sign in, find a place on the map, and log an experience with your own review. Your partner sees the post in the feed and adds their review from the place page. Once both reviews exist, the shared score and both reflections appear together.

### API routes

| Route | Purpose |
|---|---|
| `POST /api/auth/login` | Sign in; an account locks for 15 minutes after five failed attempts |
| `POST /api/auth/logout` | End the current session |
| `GET /api/state` | Load the shared space, including only the reviews the signed-in member may see |
| `POST /api/visits` | Publish an experience and its first review; safe to retry with the same draft key |
| `POST /api/visits/{id}/review` | Submit the second member's review |
| `POST /api/actions` | Favorites, place status, visit plans with email reminders, comments, reactions, display name, preferences, and deleting your own post |
| `GET /api/places/search?q=&lat=&lng=` | Search OpenStreetMap through the server (members only, one request per second, cached); a location biases results toward it, sending only a rounded area |
| `GET /api/places/about?name=&lat=&lng=` | Public details for a place: website, hours, phone, and a Wikipedia summary |
| `GET /api/route?fromLat=&fromLng=&toLat=&toLng=` | Shortest road route up to 40 km, found with Dijkstra's algorithm over OpenStreetMap roads |
| `POST /api/places` | Save a place found in search; the same name within about 50 metres returns the existing place |
| `POST /api/visits/{id}/photos` | Upload one of the author's photos for an experience (up to six, in order): JPEG, PNG, or WebP up to 8 MB, checked by its bytes. A retried upload returns the photo already saved |
| `GET /api/photos/{id}` | Serve a photo only to members of the space that owns it |

All write routes reject requests from other origins and require a session. Personal responses are sent with `Cache-Control: private, no-store`.

## Project structure

```
src/app/          Pages, layouts, and API route handlers
src/components/   Screens, forms, and reusable UI
src/lib/          Database access, sessions, passwords, validation, app rules, and tests
db/               PostgreSQL schema, migrations, and database setup notes
deploy/           systemd unit, nginx site, and server deployment steps
scripts/          Account provisioning and dev tooling
public/           SVG images and icons
docs/             README screenshots
supabase/         Earlier Supabase design, not used
```

## Testing

`npm run check` runs 127 tests. They cover the rating and review-visibility rules, place and feed logic, form validation, password hashing, and the database schema. They also run the real API route handlers against an in-memory PostgreSQL (PGlite), checking plan and review reminder timing and one-time email delivery, Dijkstra's shortest paths, saved road tiles, distance ranking, blind reviews, retry safety, cross-site and signed-out rejection, proxy sign-in, per-member favorites, saving places, OpenStreetMap search, private photo upload, ordering, retries, and delivery, post deletion, and sign-in lockout.

## Screenshots

| Place page after both reviews | Map |
|---|---|
| ![Luna Café with both reviews revealed](docs/screenshots/place.png) | ![Map with status filters and a selected place](docs/screenshots/map.png) |

<img src="docs/screenshots/feed-mobile.png" alt="The feed on a phone" width="320">

## Credits

- Built with AI assistance from [Claude Code](https://claude.com/claude-code) (Anthropic). [AI-USAGE.md](AI-USAGE.md) records what it did, where it was wrong, and which code I wrote myself.
- Map data and tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL); place search through Nominatim and road data through the Overpass API.
- Place summaries from [Wikipedia](https://www.wikipedia.org/) (CC BY-SA), linked back to each article.
- [Poppins](https://fonts.google.com/specimen/Poppins) by Indian Type Foundry, SIL Open Font License 1.1 (the licence is embedded in each font file).
- Icons from [Lucide](https://lucide.dev/) (ISC); maps drawn with [Leaflet](https://leafletjs.com/) (BSD 2-Clause).
- The interface design, the SVG assets in `public/assets`, and the screenshots are this project's own work. Sample places are real public venues; every person in the sample data is invented.

## Known issues and next steps

- End-to-end testing ran the production build against PostgreSQL 18 through PGlite's network server with both accounts; the VPS's own PostgreSQL is still to be used.
- Map tiles and place search use OpenStreetMap's public services, which suit light personal use. Searches pass through your server, but tiles are loaded by the browser and reveal which area you are viewing.
- Each experience keeps up to six photos, and photos cannot yet be removed or reordered after publishing. Photos live on disk, so back up `PHOTO_DIR` together with the database.
- Plan and review reminders are sent by email from inside the app server, so they go out only while it is running (a missed reminder is sent when it starts again, until the planned day passes).
- Next: deploy to the VPS behind HTTPS with backups and a tested restore.
