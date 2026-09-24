import { COUNTRY_OPTIONS, normalizeMarket } from "./storefronts.js";

const APPLE_SEARCH_URL = "https://itunes.apple.com/search";

export function validateSearchInput({ term, country }) {
  const safeTerm = String(term || "").trim();
  const safeCountry = String(country || "").trim().toLowerCase();

  if (safeTerm.length < 2 || safeTerm.length > 60) {
    throw new Error("Search term must be 2 to 60 characters.");
  }
  if (!/^[a-z]{2}$/.test(safeCountry) || !COUNTRY_OPTIONS.some((option) => option.value === safeCountry)) {
    throw new Error("Country must be a supported two-letter code.");
  }

  return { term: safeTerm, country: safeCountry };
}

export async function searchApps({ term, country, fetchImpl = fetch, gplayClient }) {
  const input = validateSearchInput({ term, country });
  if (!gplayClient?.search) throw new Error("Google Play search is unavailable.");
  const market = normalizeMarket(input.country);
  const appleUrl = new URL(APPLE_SEARCH_URL);
  appleUrl.search = new URLSearchParams({
    term: input.term,
    entity: "software",
    country: input.country,
    limit: "5"
  }).toString();

  const [apple, google] = await Promise.allSettled([
    fetchAppleSearch(appleUrl, fetchImpl),
    gplayClient.search({ term: input.term, num: 5, country: input.country, lang: market.language })
  ]);

  const results = [
    ...(apple.status === "fulfilled" ? normalizeAppleResults(apple.value, input.country) : []),
    ...(google.status === "fulfilled" ? normalizeGooglePlayResults(google.value, input.country) : [])
  ];

  return { results, partial: apple.status === "rejected" || google.status === "rejected" };
}

async function fetchAppleSearch(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`App Store search failed (${response.status}).`);
  const payload = await response.json();
  return Array.isArray(payload?.results) ? payload.results : [];
}

export function normalizeAppleResults(items, country) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const id = String(item?.trackId || item?.collectionId || "").trim();
    const name = cleanText(item?.trackName || item?.collectionName);
    if (!id || !name) return null;
    return {
      store: "app_store",
      id,
      name,
      developer: cleanText(item?.artistName),
      iconUrl: httpsUrl(item?.artworkUrl512 || item?.artworkUrl100 || item?.artworkUrl60),
      url: `https://apps.apple.com/${country}/app/id${encodeURIComponent(id)}`
    };
  }).filter(Boolean);
}

export function normalizeGooglePlayResults(items, country) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const id = String(item?.appId || "").trim();
    const name = cleanText(item?.title || item?.name);
    if (!id || !name) return null;
    return {
      store: "google_play",
      id,
      name,
      developer: cleanText(item?.developer),
      iconUrl: httpsUrl(item?.icon),
      url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}&gl=${encodeURIComponent(country)}`
    };
  }).filter(Boolean);
}

function cleanText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 240);
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
