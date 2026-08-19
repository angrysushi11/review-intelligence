const GOOGLE_PLAY_SOURCE = "Google Play public reviews";

export function parseGooglePlayUrl(input) {
  if (!input) throw new Error("Missing Google Play URL or package id.");

  const value = String(input).trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(value)) {
    return { appId: value, appSlug: value.split(".").at(-1) || value };
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Could not parse Google Play URL. Expected a URL with ?id=com.example.app.");
  }

  const appId = url.searchParams.get("id");
  if (!appId) {
    throw new Error("Could not find a Google Play package id. Expected a URL containing ?id=com.example.app.");
  }

  return {
    appId,
    appSlug: appId.split(".").filter(Boolean).at(-1) || appId
  };
}

export function looksLikeGooglePlayUrl(input) {
  const value = String(input || "").trim();
  return /play\.google\.com\/store\/apps/i.test(value)
    || /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(value);
}

export async function fetchGooglePlayReviews({ appId, lang = "en", country = "us", limit = 500, sortBy = "newest" }) {
  return fetchGooglePlayReviewSet({
    appId,
    markets: [{ country, language: lang, languageLabel: lang, key: `${lang}-${String(country || "us").toUpperCase()}` }],
    limit,
    sortBy
  });
}

export async function fetchGooglePlayReviewSet({ appId, markets = [], limit = 500, sortBy = "newest" }) {
  const gplay = await loadGooglePlayScraper();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 500));
  const languageTargets = normalizeLanguageTargets(markets);
  const normalizedCountry = languageTargets[0]?.country || "us";
  const primaryLanguage = languageTargets[0]?.language || "en";
  const perLanguageLimit = reviewLimitPerLanguage(safeLimit, languageTargets.length);
  const sort = googlePlaySort(gplay, sortBy);

  const [metadata, languageResults] = await Promise.all([
    fetchGooglePlayMetadata(gplay, { appId, lang: primaryLanguage, country: normalizedCountry }),
    Promise.allSettled(languageTargets.map(async (target) => {
      const rawReviews = await gplay.reviews({
        appId,
        lang: target.language,
        country: target.country,
        sort,
        num: perLanguageLimit
      });
      const reviews = (rawReviews?.data || rawReviews || [])
        .map((review) => normalizeGooglePlayReview(review, { appId, lang: target.language, country: target.country }))
        .filter((review) => review.content || review.title);
      return { ...target, reviews };
    }))
  ]);

  const reviewGroups = languageResults.map((result, index) => {
    const target = languageTargets[index];
    if (result.status !== "fulfilled") {
      return { ...target, reviews: [], error: result.reason?.message || "Google Play request failed" };
    }
    return result.value;
  });

  if (reviewGroups.every((group) => group.error)) {
    throw new Error(`Google Play review fetch failed for ${normalizedCountry.toUpperCase()}: ${reviewGroups.map((group) => `${group.languageLabel || group.language}: ${group.error}`).join("; ")}`);
  }

  const reviews = sortReviewsByDate(dedupeReviews(reviewGroups.flatMap((group) => group.reviews))).slice(0, safeLimit);
  const languageLabels = languageTargets.map((target) => target.languageLabel || target.language);

  return {
    platform: "google_play",
    appName: metadata.appName || `Google Play app ${appId}`,
    appId,
    country: normalizedCountry,
    language: languageTargets.map((target) => target.language).join(","),
    languages: languageTargets.map((target) => target.language),
    languageLabels,
    marketKeys: languageTargets.map((target) => target.key).filter(Boolean),
    sortBy,
    reviewLimit: safeLimit,
    fetchedAt: new Date().toISOString(),
    metadata,
    source: `${GOOGLE_PLAY_SOURCE} (${reviews.length} merged across ${languageLabels.join(", ")})`,
    sources: reviewGroups.map((group) => ({
      name: `${GOOGLE_PLAY_SOURCE} - ${group.languageLabel || group.language}`,
      language: group.language,
      country: group.country,
      count: group.reviews.length,
      requested: perLanguageLimit,
      error: group.error || ""
    })),
    pagesFetched: 0,
    reviews
  };
}

function normalizeLanguageTargets(markets) {
  const fallback = [{ country: "us", language: "en", languageLabel: "English", key: "en-US" }];
  const source = Array.isArray(markets) && markets.length ? markets : fallback;
  const unique = new Map();

  for (const market of source) {
    const country = String(market?.country || "us").toLowerCase();
    const language = String(market?.language || "en").toLowerCase();
    const key = market?.key || `${language}-${country.toUpperCase()}`;
    if (unique.has(`${country}:${language}`)) continue;
    unique.set(`${country}:${language}`, {
      country,
      language,
      key,
      languageLabel: market?.languageLabel || language
    });
  }

  return [...unique.values()];
}

function reviewLimitPerLanguage(totalLimit, languageCount) {
  if (languageCount <= 1) return totalLimit;
  return Math.min(totalLimit, Math.max(100, Math.ceil(totalLimit / languageCount) + 50));
}

async function loadGooglePlayScraper() {
  try {
    const module = await import("google-play-scraper");
    return module.default || module;
  } catch {
    throw new Error("Google Play support requires the google-play-scraper package. Run npm install in review-retriever.");
  }
}

async function fetchGooglePlayMetadata(gplay, { appId, lang, country }) {
  try {
    const app = await gplay.app({ appId, lang, country });
    return {
      appName: normalizeText(app?.title || ""),
      primaryGenreName: normalizeText(app?.genre || ""),
      genres: [app?.genre, app?.genreId].map(normalizeText).filter(Boolean),
      score: app?.score ?? null,
      ratings: app?.ratings ?? null,
      reviews: app?.reviews ?? null,
      installs: normalizeText(app?.installs || "")
    };
  } catch {
    return {
      appName: "",
      primaryGenreName: "",
      genres: [],
      score: null,
      ratings: null,
      reviews: null,
      installs: ""
    };
  }
}

function googlePlaySort(gplay, sortBy) {
  const normalized = String(sortBy || "newest").toLowerCase();
  if (normalized.includes("rating")) return gplay.sort?.RATING || 3;
  if (normalized.includes("help") || normalized.includes("relev")) return gplay.sort?.HELPFULNESS || 1;
  return gplay.sort?.NEWEST || 2;
}

function normalizeGooglePlayReview(review, { appId, lang, country }) {
  const updated = normalizeDate(review.date || review.updated);
  const content = normalizeText(review.text || review.content || "");
  const title = normalizeText(review.title || "");
  return {
    platform: "google_play",
    id: normalizeText(review.id || `${appId}:${lang}:${country}:${updated}:${content}`.slice(0, 180)),
    appId,
    country,
    language: lang,
    rating: Number(review.score || review.rating) || null,
    version: normalizeText(review.version || review.appVersion || ""),
    title,
    content,
    author: normalizeText(review.userName || review.author || ""),
    updated,
    voteSum: Number(review.thumbsUp || review.voteSum) || 0,
    voteCount: Number(review.thumbsUp || review.voteCount) || 0,
    developerReply: normalizeText(review.replyText || ""),
    developerReplyDate: normalizeDate(review.replyDate || ""),
    source: GOOGLE_PLAY_SOURCE
  };
}

function normalizeDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? normalizeText(value) : date.toISOString();
}

function dedupeReviews(reviews) {
  const seen = new Set();
  const output = [];
  for (const review of reviews) {
    const key = [
      review.platform || "",
      review.country || "",
      review.rating || "",
      normalizeText(review.author || "").toLowerCase(),
      normalizeText(review.content || review.title || "").toLowerCase()
    ].join("|").replace(/\s+/g, " ").slice(0, 500);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(review);
  }
  return output;
}

function sortReviewsByDate(reviews) {
  return [...reviews].sort((a, b) => {
    const aDate = Date.parse(a.updated || "");
    const bDate = Date.parse(b.updated || "");
    if (Number.isNaN(aDate) && Number.isNaN(bDate)) return 0;
    if (Number.isNaN(aDate)) return 1;
    if (Number.isNaN(bDate)) return -1;
    return bDate - aDate;
  });
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").trim();
}
