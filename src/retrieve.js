import { buildDataset, fetchAppleReviews, parseAppStoreUrl } from "./app-store.js";
import { fetchGooglePlayReviewSet, looksLikeGooglePlayUrl, parseGooglePlayUrl } from "./google-play.js";
import { normalizeMarket, normalizeMarkets } from "./storefronts.js";

export function detectPlatform(input, requestedPlatform = "auto") {
  const requested = String(requestedPlatform || "auto").toLowerCase();
  if (["app_store", "app-store", "apple", "ios"].includes(requested)) return "app_store";
  if (["google_play", "google-play", "google", "android"].includes(requested)) return "google_play";
  return looksLikeGooglePlayUrl(input) ? "google_play" : "app_store";
}

export function parseTarget(input, platform = "auto") {
  const detectedPlatform = detectPlatform(input, platform);
  if (detectedPlatform === "google_play") {
    return { platform: detectedPlatform, ...parseGooglePlayUrl(input) };
  }
  return { platform: detectedPlatform, ...parseAppStoreUrl(input) };
}

export async function retrieveReviews({ url, platform = "auto", market = "en-US", pages = 10, limit = 500, sort = "mostRecent" }) {
  const target = parseTarget(url, platform);
  const selectedMarket = normalizeMarket(market);
  const isGooglePlay = target.platform === "google_play";
  const selectedMarkets = isGooglePlay ? normalizeMarkets(market) : [selectedMarket];

  const payload = isGooglePlay
    ? await fetchGooglePlayReviewSet({
        appId: target.appId,
        markets: selectedMarkets,
        limit,
        sortBy: googleSort(sort)
      })
    : await fetchAppleReviews({
        appId: target.appId,
        country: selectedMarket.country,
        pages,
        sortBy: appleSort(sort)
      });

  const dataset = buildDataset({
    ...payload,
    platform: target.platform,
    language: isGooglePlay ? selectedMarkets.map((item) => item.language).join(",") : "",
    languages: isGooglePlay ? selectedMarkets.map((item) => item.language) : [],
    marketKey: isGooglePlay
      ? (selectedMarkets.length > 1 ? selectedMarket.country : selectedMarkets[0].key)
      : selectedMarket.country,
    marketLabel: isGooglePlay
      ? `${selectedMarket.countryLabel} / ${selectedMarkets.map((item) => item.languageLabel).join(", ")}`
      : selectedMarket.countryLabel,
    countryLabel: selectedMarket.countryLabel,
    languageLabel: isGooglePlay ? selectedMarkets.map((item) => item.languageLabel).join(", ") : "",
    languageLabels: isGooglePlay ? selectedMarkets.map((item) => item.languageLabel) : [],
    reviewLimit: Number(limit) || 500
  });

  return { target, market: selectedMarket, markets: selectedMarkets, payload, dataset };
}

function appleSort(value) {
  const normalized = String(value || "mostRecent").toLowerCase();
  if (normalized.includes("help") || normalized.includes("relev")) return "mostHelpful";
  return "mostRecent";
}

function googleSort(value) {
  const normalized = String(value || "newest").toLowerCase();
  if (normalized.includes("help") || normalized.includes("relev")) return "helpfulness";
  if (normalized.includes("rating")) return "rating";
  return "newest";
}
