import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real route handlers run against an in-memory PostgreSQL; only the cookie session is faked.
const h = vi.hoisted(() => ({
  db: undefined as unknown as PGlite,
  session: null as null | { userId: string; spaceId: string; email: string; displayName: string; role: "owner" | "partner" },
  sendMail: vi.fn(async (mail: { to: string; subject: string; text: string; html: string }) => { void mail; }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => {
  const run = async (text: string, params?: unknown[]) => {
    const result = await h.db.query(text, params);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  return { getPool: () => ({ query: run, connect: async () => ({ query: run, release: () => undefined }) }) };
});
vi.mock("@/lib/mailer", () => ({ sendMail: h.sendMail }));
vi.mock("@/lib/session", () => ({
  getCurrentSession: async () => h.session,
  createSession: async () => undefined,
}));

import { POST as runAction } from "@/app/api/actions/route";
import { GET as getPhoto } from "@/app/api/photos/[id]/route";
import { POST as savePlace } from "@/app/api/places/route";
import { POST as uploadPhoto } from "@/app/api/visits/[id]/photos/route";
import { GET as aboutPlace } from "@/app/api/places/about/route";
import { GET as searchPlaces } from "@/app/api/places/search/route";
import { GET as findRoute } from "@/app/api/route/route";
import { POST as signIn } from "@/app/api/auth/login/route";
import { POST as signUp } from "@/app/api/auth/signup/route";
import { POST as createInvite } from "@/app/api/invites/route";
import { POST as submitReview } from "@/app/api/visits/[id]/review/route";
import { POST as publishVisit } from "@/app/api/visits/route";
import { hashPassword } from "@/lib/password";
import { sendPlanReminders } from "@/lib/plan-reminders";
import { sendReviewReminders } from "@/lib/review-reminders";
import { reminderTime } from "@/lib/plans";
import { loadServerState } from "@/lib/state-server";
import { todayInManila } from "@/lib/visit-form";

const owner = "00000000-0000-4000-8000-000000000001";
const partner = "00000000-0000-4000-8000-000000000002";
const outsider = "00000000-0000-4000-8000-000000000003";
const space = "10000000-0000-4000-8000-000000000001";
const otherSpace = "10000000-0000-4000-8000-000000000002";
const ORIGIN = "http://localhost";

const as = (userId: string, spaceId = space) => {
  h.session = { userId, spaceId, email: `${userId}@example.test`, displayName: "Member", role: userId === owner ? "owner" : "partner" };
};

const request = (path: string, body: unknown, origin = ORIGIN) => new NextRequest(`${ORIGIN}${path}`, {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify(body),
});

const visitBody = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: "30000000-0000-4000-8000-000000000001",
  placeId: "place-1",
  visitedOn: "2026-09-20",
  title: "Rain at the café",
  exhibition: "",
  story: "We stayed past dessert while the rain softened outside.",
  photoAlt: "",
  rating: 4,
  reflection: "Warm and worth returning.",
  revisit: "yes",
  privateToMembers: true,
  ...overrides,
});

async function publishAsOwner() {
  as(owner);
  const response = await publishVisit(request("/api/visits", visitBody()));
  const { id } = await response.json() as { id: string };
  return { response, id };
}

beforeEach(async () => {
  h.db = await PGlite.create();
  await h.db.exec(await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8"));
  const passwordHash = await hashPassword("correct horse battery");
  for (const [id, email] of [[owner, "owner@example.test"], [partner, "partner@example.test"], [outsider, "outsider@example.test"]]) {
    await h.db.query("insert into app_users (id,email,password_hash,display_name) values ($1,$2,$3,$4)", [id, email, passwordHash, email.split("@")[0]]);
  }
  await h.db.query("insert into spaces (id,name) values ($1,'Our Places'),($2,'Other Space')", [space, otherSpace]);
  await h.db.query("insert into space_members (space_id,user_id,role) values ($1,$2,'owner'),($1,$3,'partner'),($4,$5,'owner')", [space, owner, partner, otherSpace, outsider]);
  await h.db.query(
    "insert into places (id,space_id,slug,name,category,latitude,longitude,status,planned_for) values ('place-1',$1,'luna-cafe','Luna Café','Cafe',14.55,121.02,'planned','2026-10-01')",
    [space],
  );
});

afterEach(async () => {
  h.session = null;
  await h.db?.close();
});

describe("blind reviews through the real server code", () => {
  it("hides the owner's review from the partner until both have submitted", async () => {
    const { response, id } = await publishAsOwner();
    expect(response.status).toBe(201);

    const partnerView = await loadServerState(space, partner);
    expect(partnerView.posts[0].reviews).toEqual([]);
    expect(partnerView.places[0]).toMatchObject({ reviewProgress: "your-review-needed", combinedScore: null });

    const ownerView = await loadServerState(space, owner);
    expect(ownerView.posts[0].reviews.map((review) => review.author.id)).toEqual([owner]);
    expect(ownerView.places[0]).toMatchObject({ status: "visited", reviewProgress: "partner-review-needed", combinedScore: null });

    as(partner);
    const reviewed = await submitReview(request(`/api/visits/${id}/review`, { rating: 5, reflection: "Lovely and quiet.", revisit: "yes" }), { params: Promise.resolve({ id }) });
    expect(reviewed.status).toBe(201);

    const revealed = await loadServerState(space, partner);
    expect(revealed.posts[0].reviews).toHaveLength(2);
    expect(revealed.places[0]).toMatchObject({ reviewProgress: "ready", combinedScore: 4.5 });
  });

  it("rejects a second review from the same member", async () => {
    const { id } = await publishAsOwner();
    const again = await submitReview(request(`/api/visits/${id}/review`, { rating: 5, reflection: "Trying twice.", revisit: "yes" }), { params: Promise.resolve({ id }) });
    expect(again.status).toBe(409);
  });

  it("refuses to load a space for someone who is not a member", async () => {
    await expect(loadServerState(space, outsider)).rejects.toThrow("membership");
  });
});

describe("publishing experiences", () => {
  it("is safe to retry and refuses to reuse a draft key for different content", async () => {
    const first = await publishAsOwner();
    const retry = await publishVisit(request("/api/visits", visitBody()));
    expect(retry.status).toBe(200);
    expect((await retry.json() as { id: string }).id).toBe(first.id);

    const changed = await publishVisit(request("/api/visits", visitBody({ story: "A different memory for the same draft key." })));
    expect(changed.status).toBe(409);
  });

  it("rejects a place from outside the shared space", async () => {
    as(owner);
    const response = await publishVisit(request("/api/visits", visitBody({ placeId: "place-elsewhere" })));
    expect(response.status).toBe(404);
  });
});

describe("shared actions", () => {
  it("rejects cross-site and signed-out writes", async () => {
    as(owner);
    expect((await runAction(request("/api/actions", { action: "toggleFavorite", placeId: "place-1" }, "https://evil.example"))).status).toBe(403);
    h.session = null;
    expect((await runAction(request("/api/actions", { action: "toggleFavorite", placeId: "place-1" }))).status).toBe(401);
  });

  it("keeps favorites separate for each member", async () => {
    as(owner);
    expect((await runAction(request("/api/actions", { action: "toggleFavorite", placeId: "place-1" }))).status).toBe(200);
    expect((await loadServerState(space, owner)).places[0].favorite).toBe(true);
    expect((await loadServerState(space, partner)).places[0].favorite).toBe(false);
  });

  it("clears the plan when a place stops being planned", async () => {
    as(owner);
    expect((await loadServerState(space, owner)).places[0].plan).toEqual({ date: "2026-10-01", reminder: "none", reminderSent: false });
    await runAction(request("/api/actions", { action: "setPlaceStatus", placeId: "place-1", status: "want-to-visit" }));
    expect((await loadServerState(space, owner)).places[0]).toMatchObject({ status: "want-to-visit", plan: undefined });
  });

  it("lets only the author delete a post, then resets the place once its last visit is gone", async () => {
    const { id } = await publishAsOwner();
    as(partner);
    expect((await runAction(request("/api/actions", { action: "deletePost", postId: id }))).status).toBe(404);

    as(owner);
    expect((await runAction(request("/api/actions", { action: "deletePost", postId: id }))).status).toBe(200);
    const state = await loadServerState(space, owner);
    expect(state.posts).toHaveLength(0);
    expect(state.places[0]).toMatchObject({ status: "want-to-visit", visitCount: 0 });
  });

  it("cannot comment on an experience in another space", async () => {
    const { id } = await publishAsOwner();
    as(outsider, otherSpace);
    expect((await runAction(request("/api/actions", { action: "addComment", postId: id, body: "Hello" }))).status).toBe(404);
  });
});

describe("sign-in", () => {
  const attempt = (password: string, email = "owner@example.test") => signIn(request("/api/auth/login", { email, password }));

  // The route refuses to run without a configured database, so point it at the in-memory one.
  beforeEach(() => { vi.stubEnv("DATABASE_URL", "postgres://in-memory/test"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("stays closed when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await attempt("correct horse battery")).status).toBe(503);
  });

  it("signs in with the right password", async () => {
    expect((await attempt("correct horse battery")).status).toBe(200);
  });

  it("signs in through the HTTPS proxy, where the server only knows its internal address", async () => {
    const proxied = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://places.example.com",
        "x-forwarded-host": "places.example.com",
        "x-forwarded-proto": "https",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "owner@example.test", password: "correct horse battery" }),
    });
    expect((await signIn(proxied)).status).toBe(200);
  });

  it("gives an unknown email the same answer as a wrong password", async () => {
    const unknown = await attempt("whatever password", "nobody@example.test");
    const wrong = await attempt("wrong password!!");
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("locks the account for 15 minutes after five failed attempts", async () => {
    for (let index = 0; index < 5; index += 1) expect((await attempt("wrong password!!")).status).toBe(401);
    expect((await attempt("correct horse battery")).status).toBe(429);
  });
});

describe("saving places", () => {
  const tokyo = { name: "teamLab Planets", category: "Museum", address: "Toyosu", city: "Tokyo", country: "Japan", latitude: 35.6491, longitude: 139.7898 };

  it("saves a place from search for the shared space, abroad included", async () => {
    as(partner);
    const response = await savePlace(request("/api/places", tokyo));
    expect(response.status).toBe(201);
    const { slug } = await response.json() as { slug: string };
    expect(slug).toBe("teamlab-planets");
    const saved = (await loadServerState(space, owner)).places.find((place) => place.slug === slug);
    expect(saved).toMatchObject({ name: "teamLab Planets", country: "Japan", status: "want-to-visit", initials: "TP" });
  });

  it("returns the existing place instead of saving it twice, and keeps slugs unique", async () => {
    as(owner);
    const first = await (await savePlace(request("/api/places", tokyo))).json() as { slug: string };
    const again = await savePlace(request("/api/places", { ...tokyo, name: "TEAMLAB PLANETS" }));
    expect(again.status).toBe(409);
    expect((await again.json() as { slug: string }).slug).toBe(first.slug);
    const elsewhere = await (await savePlace(request("/api/places", { ...tokyo, latitude: 34.69, longitude: 135.5 }))).json() as { slug: string };
    expect(elsewhere.slug).toBe("teamlab-planets-2");
  });

  it("rejects bad input, other sites, and signed-out requests", async () => {
    as(owner);
    expect((await savePlace(request("/api/places", { ...tokyo, latitude: 200 }))).status).toBe(400);
    expect((await savePlace(request("/api/places", tokyo, "https://evil.example"))).status).toBe(403);
    h.session = null;
    expect((await savePlace(request("/api/places", tokyo))).status).toBe(401);
  });

  it("stores the country, defaulting old places to the Philippines", async () => {
    expect((await loadServerState(space, owner)).places.find((place) => place.id === "place-1")?.country).toBe("Philippines");
  });
});

describe("searching OpenStreetMap", () => {
  const search = (q: string) => searchPlaces(new NextRequest(`${ORIGIN}/api/places/search?q=${encodeURIComponent(q)}`));

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("asks members only, identifies the app, and maps the results", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://in-memory/test");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{
      place_id: 7, lat: "15.0286", lon: "120.6898", name: "San Fernando",
      display_name: "San Fernando, Pampanga, Philippines", category: "boundary", type: "administrative",
      address: { city: "San Fernando", country: "Philippines" },
    }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    h.session = null;
    expect((await search("san fernando pampanga")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    as(owner);
    const response = await search("san fernando pampanga");
    expect(response.status).toBe(200);
    expect((await response.json() as { results: { city: string }[] }).results[0].city).toBe("San Fernando");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain("nominatim.openstreetmap.org/search");
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("OurPlaces");

    expect((await search("San Fernando  Pampanga")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("biases a search toward a pinned location without sending the exact pin", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://in-memory/test");
    as(owner);
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await searchPlaces(new NextRequest(`${ORIGIN}/api/places/search?q=sm%20city&lat=15.0286&lng=120.6898`));
    const url = new URL(String((fetchMock.mock.calls[0] as unknown as [URL])[0]));
    expect(url.searchParams.get("viewbox")).toBe("120.2,15.5,121.2,14.5");
    expect(url.searchParams.get("bounded")).toBe("0");
    expect(url.toString()).not.toContain("15.0286");
  });

  it("rejects very short searches and reports an unavailable service", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://in-memory/test");
    as(owner);
    expect((await search("a")).status).toBe(400);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    expect((await search("somewhere new entirely")).status).toBe(502);
  });
});

describe("private photos", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
  let photoDir = "";

  const upload = (visitId: string, bytes: Uint8Array = jpeg, origin = ORIGIN, fields: Record<string, string> = {}) => {
    const form = new FormData();
    form.set("photo", new Blob([bytes as BlobPart], { type: "image/jpeg" }), "photo.jpg");
    for (const [name, value] of Object.entries({ alt: "A rainy café window", width: "1200", height: "800", ...fields })) form.set(name, value);
    return uploadPhoto(new NextRequest(`${ORIGIN}/api/visits/${visitId}/photos`, { method: "POST", headers: { origin }, body: form }), { params: Promise.resolve({ id: visitId }) });
  };
  const fetchPhoto = (photoId: string) => getPhoto(new NextRequest(`${ORIGIN}/api/photos/${photoId}`), { params: Promise.resolve({ id: photoId }) });

  beforeEach(async () => {
    photoDir = await mkdtemp(join(tmpdir(), "our-places-photos-"));
    vi.stubEnv("PHOTO_DIR", photoDir);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(photoDir, { recursive: true, force: true });
  });

  it("stores the author's photo privately and serves it only inside the space", async () => {
    const { id } = await publishAsOwner();
    const response = await upload(id);
    expect(response.status).toBe(201);
    const { id: photoId } = await response.json() as { id: string };
    expect(await readdir(photoDir)).toHaveLength(1);

    const state = await loadServerState(space, partner);
    expect(state.posts[0].photos).toEqual([{ url: `/api/photos/${photoId}`, alt: "A rainy café window" }]);

    as(partner);
    const served = await fetchPhoto(photoId);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(jpeg);

    as(outsider, otherSpace);
    expect((await fetchPhoto(photoId)).status).toBe(404);
    h.session = null;
    expect((await fetchPhoto(photoId)).status).toBe(401);
  });

  it("keeps several photos in the order they were added, each with its own description", async () => {
    const { id } = await publishAsOwner();
    const ids: string[] = [];
    for (const [position, alt] of ["The doorway", "Our table", "The view after dinner"].entries()) {
      const response = await upload(id, jpeg, ORIGIN, { alt, position: String(position) });
      expect(response.status).toBe(201);
      ids.push((await response.json() as { id: string }).id);
    }
    expect(await readdir(photoDir)).toHaveLength(3);
    const state = await loadServerState(space, partner);
    expect(state.posts[0].photos).toEqual([
      { url: `/api/photos/${ids[0]}`, alt: "The doorway" },
      { url: `/api/photos/${ids[1]}`, alt: "Our table" },
      { url: `/api/photos/${ids[2]}`, alt: "The view after dinner" },
    ]);
  });

  it("answers a retried upload with the photo already saved, never a copy", async () => {
    const { id } = await publishAsOwner();
    const first = await upload(id, jpeg, ORIGIN, { position: "0" });
    const { id: photoId } = await first.json() as { id: string };
    const retry = await upload(id, jpeg, ORIGIN, { position: "0" });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ id: photoId });
    expect(await readdir(photoDir)).toHaveLength(1);
    // A photo cannot skip ahead of one that has not arrived yet.
    expect((await upload(id, jpeg, ORIGIN, { position: "2" })).status).toBe(409);
    expect(await readdir(photoDir)).toHaveLength(1);
  });

  it("stops at six photos per experience", async () => {
    const { id } = await publishAsOwner();
    for (let position = 0; position < 6; position += 1) {
      expect((await upload(id, jpeg, ORIGIN, { position: String(position) })).status).toBe(201);
    }
    expect((await upload(id, jpeg, ORIGIN, { position: "6" })).status).toBe(400);
    expect(await readdir(photoDir)).toHaveLength(6);
  });

  it("refuses files that are not really images, other people's posts, and other sites", async () => {
    const { id } = await publishAsOwner();
    expect((await upload(id, new TextEncoder().encode("<script>not an image</script>"))).status).toBe(400);
    expect((await upload(id, jpeg, ORIGIN, { width: "0" }))).toHaveProperty("status", 400);
    expect((await upload(id, jpeg, "https://evil.example")).status).toBe(403);
    as(partner);
    expect((await upload(id)).status).toBe(404);
    expect(await readdir(photoDir)).toHaveLength(0);
  });

  it("deletes every photo file together with the post", async () => {
    const { id } = await publishAsOwner();
    await upload(id, jpeg, ORIGIN, { position: "0" });
    await upload(id, jpeg, ORIGIN, { position: "1" });
    expect(await readdir(photoDir)).toHaveLength(2);
    expect((await runAction(request("/api/actions", { action: "deletePost", postId: id }))).status).toBe(200);
    expect(await readdir(photoDir)).toHaveLength(0);
  });
});

describe("place details", () => {
  const about = (query: string) => aboutPlace(new NextRequest(`${ORIGIN}/api/places/about?${query}`));

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("gathers website, hours, and a Wikipedia summary for a saved place", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://in-memory/test");
    as(owner);
    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = String(input);
      if (url.includes("nominatim")) {
        return new Response(JSON.stringify([{
          lat: "14.5906", lon: "120.9752", display_name: "Intramuros, Manila", osm_type: "relation", osm_id: 9,
          extratags: { website: "https://intramuros.gov.ph", opening_hours: "Mo-Su 08:00-20:00", wikipedia: "en:Intramuros" },
        }]), { status: 200 });
      }
      return new Response(JSON.stringify({ title: "Intramuros", extract: "The historic walled area of Manila.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Intramuros" } } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await about("name=Intramuros&lat=14.5904&lng=120.9750");
    expect(response.status).toBe(200);
    expect((await response.json() as { about: object }).about).toEqual({
      website: "https://intramuros.gov.ph/",
      openingHours: "Mo-Su 08:00-20:00",
      osmUrl: "https://www.openstreetmap.org/relation/9",
      wikipedia: { title: "Intramuros", extract: "The historic walled area of Manila.", url: "https://en.wikipedia.org/wiki/Intramuros" },
    });
    const searchUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(searchUrl.searchParams.get("bounded")).toBe("1");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://en.wikipedia.org/api/rest_v1/page/summary/Intramuros");
  });

  it("returns no details when nothing matches near the pin, and requires a session and coordinates", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://in-memory/test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ lat: "15.5", lon: "121.5", display_name: "Far away" }]), { status: 200 })));
    as(owner);
    expect(await (await about("name=Hidden%20Garden&lat=14.6&lng=121.0")).json()).toEqual({ about: {} });
    expect((await about("name=Hidden%20Garden")).status).toBe(400);
    h.session = null;
    expect((await about("name=Hidden%20Garden&lat=14.6&lng=121.0")).status).toBe(401);
  });
});

describe("shortest road route", () => {
  const roads = {
    elements: [
      { type: "node", id: 1, lat: 14.001, lon: 121.0 }, { type: "node", id: 2, lat: 14.001, lon: 121.001 },
      { type: "node", id: 3, lat: 14.001, lon: 121.002 }, { type: "node", id: 4, lat: 14.0, lon: 121.002 },
      { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "residential" } },
      { type: "way", id: 20, nodes: [3, 4], tags: { highway: "residential" } },
    ],
  };
  const route = (query: string) => findRoute(new NextRequest(`${ORIGIN}/api/route?${query}`));
  let roadDir = "";

  beforeEach(async () => {
    roadDir = await mkdtemp(join(tmpdir(), "our-places-roads-"));
    vi.stubEnv("ROAD_CACHE_DIR", roadDir);
    vi.stubEnv("DATABASE_URL", "postgres://in-memory/test");
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(roadDir, { recursive: true, force: true });
  });

  it("finds the road route with Dijkstra, reports both distances, and keeps the roads for next time", async () => {
    as(owner);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(roads), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await route("fromLat=14.001&fromLng=121.0&toLat=14.0&toLng=121.002");
    expect(response.status).toBe(200);
    const body = await response.json() as { distanceKm: number; straightKm: number; path: [number, number][]; network: string };
    expect(body.path).toEqual([[14.001, 121.0], [14.001, 121.0], [14.001, 121.001], [14.001, 121.002], [14.0, 121.002], [14.0, 121.002]]);
    expect(body.distanceKm).toBeGreaterThan(body.straightKm);
    expect(body.network).toBe("all");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(String(init.body)).toContain("residential");
    expect((await readdir(roadDir)).filter((file) => file.endsWith(".json")).length).toBeGreaterThan(0);

    // Another trip in the same area reuses the saved roads instead of downloading them again.
    const again = await route("fromLat=14.0009&fromLng=121.0001&toLat=14.0001&toLng=121.0019");
    expect(again.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses main roads between the two ends of a longer trip", async () => {
    as(owner);
    // Main roads: one primary road north to south. Every road: short streets from each end onto it.
    const main = { elements: [
      { type: "node", id: 201, lat: 14.2, lon: 121.301 }, { type: "node", id: 202, lat: 14.25, lon: 121.301 },
      { type: "node", id: 203, lat: 14.3, lon: 121.301 },
      { type: "way", id: 300, nodes: [201, 202, 203], tags: { highway: "primary" } },
    ] };
    const streets = { elements: [
      { type: "node", id: 201, lat: 14.2, lon: 121.301 }, { type: "node", id: 211, lat: 14.2, lon: 121.3 },
      { type: "node", id: 203, lat: 14.3, lon: 121.301 }, { type: "node", id: 213, lat: 14.3, lon: 121.3 },
      { type: "way", id: 310, nodes: [211, 201], tags: { highway: "residential" } },
      { type: "way", id: 311, nodes: [203, 213], tags: { highway: "residential" } },
    ] };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify(String(init?.body).includes("residential") ? streets : main), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await route("fromLat=14.2&fromLng=121.3&toLat=14.3&toLng=121.3");
    expect(response.status).toBe(200);
    const body = await response.json() as { distanceKm: number; straightKm: number; network: string };
    expect(body.network).toBe("main");
    expect(body.straightKm).toBeGreaterThan(10);
    expect(body.distanceKm).toBeCloseTo(body.straightKm + 0.2, 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("explains when road data cannot be downloaded", async () => {
    as(owner);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    const response = await route("fromLat=13.501&fromLng=122.0&toLat=13.5&toLng=122.002");
    expect(response.status).toBe(502);
    expect((await response.json() as { error: string }).error).toMatch(/Road data/);
  });

  it("refuses long trips, missing coordinates, and signed-out requests", async () => {
    as(owner);
    const far = await route("fromLat=14.2&fromLng=121.0&toLat=15.03&toLng=120.69");
    expect(far.status).toBe(422);
    expect((await route("fromLat=14.6&fromLng=121.0")).status).toBe(400);
    h.session = null;
    expect((await route("fromLat=14.001&fromLng=121.0&toLat=14.0&toLng=121.002")).status).toBe(401);
  });
});

describe("plan reminders by email", () => {
  const daysAhead = (days: number) => {
    const date = new Date(`${todayInManila()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const planDate = daysAhead(10);
  const savePlan = (plan: Record<string, string>) =>
    runAction(request("/api/actions", { action: "savePlan", placeId: "place-1", plan: { date: planDate, time: "15:00", note: "Window table", reminder: "day-before", ...plan } }));
  const dueAt = (date = planDate) => new Date(reminderTime(date, "15:00", "day-before")!.getTime() + 60_000);

  beforeEach(() => { h.sendMail.mockReset(); h.sendMail.mockResolvedValue(undefined); });

  it("saves a plan for both members with its reminder time", async () => {
    as(owner);
    expect((await savePlan({})).status).toBe(200);
    const partnerView = await loadServerState(space, partner);
    expect(partnerView.places[0]).toMatchObject({
      status: "planned",
      plan: { date: planDate, time: "15:00", note: "Window table", reminder: "day-before", reminderSent: false },
    });
    const { rows } = await h.db.query<{ remind_at: Date }>("select remind_at from places where id = 'place-1'");
    expect(new Date(rows[0].remind_at).toISOString()).toBe(reminderTime(planDate, "15:00", "day-before")!.toISOString());
  });

  it("refuses a plan in the past or from outside the space", async () => {
    as(owner);
    expect((await savePlan({ date: daysAhead(-1) })).status).toBe(400);
    as(outsider, otherSpace);
    expect((await savePlan({})).status).toBe(404);
  });

  it("emails both members once, only when the reminder is due", async () => {
    as(owner);
    await savePlan({});
    expect(await sendPlanReminders(new Date(dueAt().getTime() - 120_000))).toMatchObject({ plans: 0, sent: 0 });
    expect(h.sendMail).not.toHaveBeenCalled();

    expect(await sendPlanReminders(dueAt())).toEqual({ plans: 1, sent: 2, failed: 0 });
    expect(h.sendMail.mock.calls.map(([mail]) => mail.to).sort()).toEqual(["owner@example.test", "partner@example.test"]);
    const [mail] = h.sendMail.mock.calls[0];
    expect(mail.subject).toBe("Reminder: Luna Café tomorrow at 3:00 PM");
    expect(mail.text).toContain("Note: Window table");

    expect(await sendPlanReminders(new Date(dueAt().getTime() + 600_000))).toMatchObject({ plans: 0, sent: 0 });
    expect(h.sendMail).toHaveBeenCalledTimes(2);
    expect((await loadServerState(space, owner)).places[0].plan?.reminderSent).toBe(true);
  });

  it("skips a member who turned plan reminders off, and tries again when sending fails", async () => {
    as(partner);
    expect((await runAction(request("/api/actions", { action: "updateSettings", settings: { planReminders: false } }))).status).toBe(200);
    expect((await loadServerState(space, partner)).settings.planReminders).toBe(false);
    as(owner);
    await savePlan({});
    h.sendMail.mockRejectedValueOnce(new Error("SMTP is down"));
    expect(await sendPlanReminders(dueAt())).toEqual({ plans: 1, sent: 0, failed: 1 });
    expect(await sendPlanReminders(new Date(dueAt().getTime() + 120_000))).toEqual({ plans: 1, sent: 1, failed: 0 });
    expect(h.sendMail.mock.calls.map(([sent]) => sent.to)).toEqual(["owner@example.test", "owner@example.test"]);
  });

  it("does not resend after saving the same plan again, but does after moving the date", async () => {
    as(owner);
    await savePlan({});
    await sendPlanReminders(dueAt());
    await savePlan({ note: "Window table, 2 people" });
    expect((await loadServerState(space, owner)).places[0].plan?.reminderSent).toBe(true);
    expect(await sendPlanReminders(new Date(dueAt().getTime() + 120_000))).toMatchObject({ plans: 0 });

    const moved = daysAhead(12);
    await savePlan({ date: moved });
    expect((await loadServerState(space, owner)).places[0].plan).toMatchObject({ date: moved, reminderSent: false });
    expect(await sendPlanReminders(dueAt(moved))).toMatchObject({ plans: 1, sent: 2 });
  });

  it("drops the plan and its reminder once the visit is logged, and never reminds without one", async () => {
    as(owner);
    await savePlan({});
    await publishAsOwner();
    expect((await loadServerState(space, owner)).places[0]).toMatchObject({ status: "visited", plan: undefined });
    await savePlan({ reminder: "none" });
    expect(await sendPlanReminders(dueAt())).toMatchObject({ plans: 0, sent: 0 });
    expect(h.sendMail).not.toHaveBeenCalled();
  });
});

describe("review reminders by email", () => {
  const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

  beforeEach(() => { h.sendMail.mockReset(); h.sendMail.mockResolvedValue(undefined); });

  it("emails the partner once, after a short wait, without revealing the hidden review", async () => {
    await publishAsOwner();
    expect(await sendReviewReminders(minutesFromNow(5))).toMatchObject({ visits: 0, sent: 0 });

    expect(await sendReviewReminders(minutesFromNow(16))).toEqual({ visits: 1, sent: 1, failed: 0 });
    const [mail] = h.sendMail.mock.calls[0];
    expect(mail.to).toBe("partner@example.test");
    expect(mail.subject).toBe("owner logged Luna Café: your review is waiting");
    expect(mail.text).toContain("on Sun, Sep 20");
    for (const hidden of ["Warm and worth returning.", "rating", "score:"]) expect(mail.text.toLowerCase()).not.toContain(hidden.toLowerCase());

    expect(await sendReviewReminders(minutesFromNow(30))).toMatchObject({ visits: 0 });
    expect(h.sendMail).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the partner already reviewed or turned review reminders off", async () => {
    const { id } = await publishAsOwner();
    as(partner);
    await submitReview(request(`/api/visits/${id}/review`, { rating: 5, reflection: "Lovely and quiet.", revisit: "yes" }), { params: Promise.resolve({ id }) });
    expect(await sendReviewReminders(minutesFromNow(16))).toMatchObject({ visits: 0, sent: 0 });

    await h.db.query("delete from reviews where author_id = $1", [partner]);
    expect((await runAction(request("/api/actions", { action: "updateSettings", settings: { reviewReminders: false } }))).status).toBe(200);
    expect(await sendReviewReminders(minutesFromNow(16))).toMatchObject({ visits: 1, sent: 0 });
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it("tries again on the next run when the email could not be sent", async () => {
    await publishAsOwner();
    h.sendMail.mockRejectedValueOnce(new Error("SMTP is down"));
    expect(await sendReviewReminders(minutesFromNow(16))).toEqual({ visits: 1, sent: 0, failed: 1 });
    expect(await sendReviewReminders(minutesFromNow(18))).toEqual({ visits: 1, sent: 1, failed: 0 });
  });
});

describe("sign-up and partner invites", () => {
  const signup = (body: Record<string, unknown>, origin = ORIGIN) => signUp(request("/api/auth/signup", body, origin));
  const riley = { name: "Riley", email: "riley@example.test", password: "a long enough password" };
  const memberOf = async (email: string) => (await h.db.query<{ id: string; space_id: string; role: string }>(
    "select u.id, m.space_id, m.role from app_users u join space_members m on m.user_id = u.id where u.email = $1", [email],
  )).rows[0];
  const spaceCount = async () => (await h.db.query<{ count: number }>("select count(*)::int as count from spaces")).rows[0].count;

  beforeEach(() => { vi.stubEnv("DATABASE_URL", "postgres://in-memory/test"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("creates an account in its own empty space when the sign-up code is right", async () => {
    vi.stubEnv("SIGNUP_CODE", "class-2026");
    const response = await signup({ ...riley, code: "class-2026" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, role: "owner" });
    const member = await memberOf("riley@example.test");
    expect(member.role).toBe("owner");
    expect(member.space_id).not.toBe(space);
    const state = await loadServerState(member.space_id, member.id);
    expect(state.places).toEqual([]);
    expect(state.members.map((m) => m.displayName)).toEqual(["Riley"]);
  });

  it("refuses sign-up when closed, with a wrong or missing code, from other sites, and for an email in use", async () => {
    expect((await signup({ ...riley, code: "class-2026" })).status).toBe(403);
    vi.stubEnv("SIGNUP_CODE", "class-2026");
    expect((await signup({ ...riley, code: "wrong" })).status).toBe(403);
    expect((await signup(riley)).status).toBe(403);
    expect((await signup({ ...riley, code: "class-2026" }, "https://evil.example")).status).toBe(403);
    expect((await signup({ ...riley, password: "too short", code: "class-2026" })).status).toBe(400);
    expect((await signup({ ...riley, email: "owner@example.test", code: "class-2026" })).status).toBe(409);
    // The refused sign-up left no empty space behind.
    expect(await spaceCount()).toBe(2);
  });

  it("lets the owner invite one partner with a link that works once", async () => {
    vi.stubEnv("SIGNUP_CODE", "class-2026");
    await signup({ ...riley, code: "class-2026" });
    const owner = await memberOf("riley@example.test");
    h.session = { userId: owner.id, spaceId: owner.space_id, email: "riley@example.test", displayName: "Riley", role: "owner" };
    const invited = await createInvite(request("/api/invites", {}));
    expect(invited.status).toBe(201);
    const { token } = await invited.json() as { token: string };

    // Joining needs no sign-up code, even once sign-up is closed again.
    vi.stubEnv("SIGNUP_CODE", "");
    const joined = await signup({ name: "Jordan", email: "jordan@example.test", password: "another long password", invite: token });
    expect(await joined.json()).toEqual({ ok: true, role: "partner" });
    expect((await memberOf("jordan@example.test")).space_id).toBe(owner.space_id);
    expect((await loadServerState(owner.space_id, owner.id)).members.map((m) => m.displayName).sort()).toEqual(["Jordan", "Riley"]);

    expect((await signup({ name: "Casey", email: "casey@example.test", password: "yet another long one", invite: token })).status).toBe(410);
    expect((await createInvite(request("/api/invites", {}))).status).toBe(409);
  });

  it("refuses invites from a partner, for a full space, and through an expired link", async () => {
    as(partner);
    expect((await createInvite(request("/api/invites", {}))).status).toBe(403);
    as(owner);
    expect((await createInvite(request("/api/invites", {}))).status).toBe(409);

    const token = "expired-invite-token-0000000000";
    const { rows: [lone] } = await h.db.query<{ id: string }>("insert into spaces (name) values ('Lone') returning id");
    const { rows: [solo] } = await h.db.query<{ id: string }>(
      "insert into app_users (email, password_hash, display_name) values ('solo@example.test', $1, 'Solo') returning id",
      [await hashPassword("solo password 1234")],
    );
    await h.db.query("insert into space_members (space_id, user_id, role) values ($1, $2, 'owner')", [lone.id, solo.id]);
    await h.db.query(
      `insert into space_invites (space_id, token_hash, created_by, created_at, expires_at)
       values ($1, $2, $3, now() - interval '8 days', now() - interval '1 day')`,
      [lone.id, createHash("sha256").update(token).digest("hex"), solo.id],
    );
    expect((await signup({ name: "Late", email: "late@example.test", password: "arrived too late!", invite: token })).status).toBe(410);
  });
});
