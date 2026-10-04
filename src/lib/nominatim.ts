import "server-only";

import type { NominatimResult } from "@/lib/place-search";

// OpenStreetMap's Nominatim policy: identify the app, at most one request per second, cache results.
// https://operations.osmfoundation.org/policies/nominatim/
export const USER_AGENT = "OurPlaces/0.1 (private two-person app; https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT)";
const MIN_INTERVAL_MS = 1100;
let nextSlot = 0;

/** One shared queue for every Nominatim call this server makes. */
async function waitForSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

export async function nominatimSearch(params: Record<string, string>): Promise<NominatimResult[]> {
  await waitForSlot();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ format: "jsonv2", addressdetails: "1", ...params }).toString();
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`OpenStreetMap search answered ${response.status}`);
  return await response.json() as NominatimResult[];
}

export async function wikipediaSummary(lang: string, title: string): Promise<{ title: string; extract: string; url: string } | null> {
  const response = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const data = await response.json() as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  if (!data.extract || !data.content_urls?.desktop?.page) return null;
  return { title: data.title ?? title, extract: data.extract, url: data.content_urls.desktop.page };
}
