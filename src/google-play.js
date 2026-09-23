const GOOGLE_PLAY_SOURCE = "Google Play public reviews";
const GOOGLE_PLAY_CURSOR_VERSION = 1;
const MAX_UPSTREAM_TOKEN_LENGTH = 4_096;

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

export async function fetchGooglePlayReviews({ appId, lang = "en", country = "us", limit = 500, sortBy = "newest", cursor = "" }) {
  return fetchGooglePlayReviewSet({
    appId,
    markets: [{ country, language: lang, languageLabel: lang, key: `${lang}-${String(country || "us").toUpperCase()}` }],
    limit,
    sortBy,
    cursor
  });
}

export async function fetchGooglePlayReviewSet({ appId, markets = [], limit = 500, sortBy = "newest", cursor = "", gplayClient } = {}) {
  const gplay = gplayClient || await loadGooglePlayScraper();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 500));
  const languageTargets = normalizeLanguageTargets(markets);
  const normalizedCountry = languageTargets[0]?.country || "us";
  const primaryLanguage = languageTargets[0]?.language || "en";
  const perLanguageLimit = reviewLimitPerLanguage(safeLimit, languageTargets.length);
  const sort = googlePlaySort(gplay, sortBy);
  const cursorState = decodeGooglePlayCursor(cursor, { appId, languageTargets, sortBy });
  const paginationEnabled = safeLimit >= 150;
  if (cursorState.supplied && !paginationEnabled) {
    throw new Error("Google Play continuation requires a review limit of at least 150 so an upstream page is not split or skipped.");
  }

  const metadataPromise = fetchGooglePlayMetadata(gplay, {
    appId,
    lang: primaryLanguage,
    country: normalizedCountry
  });
  const batch = paginationEnabled
    ? await fetchPaginatedGooglePlayBatch({
        gplay,
        appId,
        languageTargets,
        sort,
        safeLimit,
        cursorState
      })
    : await fetchBoundedGooglePlayBatch({
        gplay,
        appId,
        languageTargets,
        sort,
        perLanguageLimit
      });
  const metadata = await metadataPromise;
  const reviewGroups = batch.reviewGroups;

  if (reviewGroups.every((group) => group.error)) {
    throw new Error(`Google Play review fetch failed for ${normalizedCountry.toUpperCase()}: ${reviewGroups.map((group) => `${group.languageLabel || group.language}: ${group.error}`).join("; ")}`);
  }

  const reviews = sortReviewsByDate(dedupeReviews(reviewGroups.flatMap((group) => group.reviews))).slice(0, safeLimit);
  const languageLabels = languageTargets.map((target) => target.languageLabel || target.language);
  const nextCursor = encodeGooglePlayCursor({
    appId,
    sortBy,
    reviewGroups,
    nextTarget: batch.nextTarget
  });

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
    cursorSupplied: cursorState.supplied,
    nextCursor,
    sources: reviewGroups.map((group) => ({
      name: `${GOOGLE_PLAY_SOURCE} - ${group.languageLabel || group.language}`,
      language: group.language,
      country: group.country,
      count: group.reviews.length,
      requested: group.requested,
      error: group.error || ""
    })),
    pagesFetched: batch.pagesFetched,
    reviews
  };
}

async function fetchPaginatedGooglePlayBatch({ gplay, appId, languageTargets, sort, safeLimit, cursorState }) {
  const reviewGroups = languageTargets.map((target) => ({
    ...target,
    reviews: [],
    requested: 0,
    nextPaginationToken: cursorState.supplied
      ? cursorState.tokens.get(targetKey(target))
      : "",
    error: ""
  }));
  const blockedTargets = new Set();
  const pageBudget = Math.max(1, Math.floor(safeLimit / 150));
  let nextTarget = cursorState.nextTarget || 0;
  let pagesFetched = 0;
  let attemptedPages = 0;

  for (let page = 0; page < pageBudget; page += 1) {
    const index = nextActiveTarget(reviewGroups, nextTarget, blockedTargets);
    if (index < 0) break;
    const group = reviewGroups[index];
    const currentToken = group.nextPaginationToken;
    attemptedPages += 1;
    try {
      const rawReviews = await gplay.reviews({
        appId,
        lang: group.language,
        country: group.country,
        sort,
        paginate: true,
        nextPaginationToken: currentToken || null
      });
      group.reviews.push(...normalizeGooglePlayReviews(rawReviews, {
        appId,
        lang: group.language,
        country: group.country
      }));
      group.requested += 150;
      group.nextPaginationToken = normalizePaginationToken(rawReviews?.nextPaginationToken);
      pagesFetched += 1;
    } catch (error) {
      group.error = error?.message || "Google Play request failed";
      blockedTargets.add(index);
    }
    nextTarget = (index + 1) % reviewGroups.length;
  }

  if (attemptedPages && !pagesFetched) {
    throw new Error(`Google Play review fetch failed: ${reviewGroups.filter((group) => group.error).map((group) => `${group.languageLabel || group.language}: ${group.error}`).join("; ")}`);
  }

  return { reviewGroups, nextTarget, pagesFetched };
}

async function fetchBoundedGooglePlayBatch({ gplay, appId, languageTargets, sort, perLanguageLimit }) {
  const languageResults = await Promise.allSettled(languageTargets.map(async (target) => {
    const rawReviews = await gplay.reviews({
      appId,
      lang: target.language,
      country: target.country,
      sort,
      num: perLanguageLimit
    });
    return {
      ...target,
      reviews: normalizeGooglePlayReviews(rawReviews, {
        appId,
        lang: target.language,
        country: target.country
      }),
      requested: perLanguageLimit,
      nextPaginationToken: null,
      error: ""
    };
  }));
  const reviewGroups = languageResults.map((result, index) => result.status === "fulfilled"
    ? result.value
    : {
        ...languageTargets[index],
        reviews: [],
        requested: perLanguageLimit,
        nextPaginationToken: null,
        error: result.reason?.message || "Google Play request failed"
      });
  return { reviewGroups, nextTarget: 0, pagesFetched: 0 };
}

function normalizeGooglePlayReviews(rawReviews, context) {
  return (rawReviews?.data || rawReviews || [])
    .map((review) => normalizeGooglePlayReview(review, context))
    .filter((review) => review.content || review.title);
}

function nextActiveTarget(reviewGroups, startIndex, blockedTargets) {
  for (let offset = 0; offset < reviewGroups.length; offset += 1) {
    const index = (startIndex + offset) % reviewGroups.length;
    if (blockedTargets.has(index)) continue;
    if (reviewGroups[index].nextPaginationToken !== null) return index;
  }
  return -1;
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
  return Math.ceil(totalLimit / languageCount);
}

function encodeGooglePlayCursor({ appId, sortBy, reviewGroups, nextTarget = 0 }) {
  const targets = reviewGroups.map((group) => ({
    country: group.country,
    language: group.language,
    token: group.nextPaginationToken ?? null
  }));
  if (targets.every(({ token }) => token === null)) return null;
  return Buffer.from(JSON.stringify({
    v: GOOGLE_PLAY_CURSOR_VERSION,
    app: appId,
    sort: normalizedSortKey(sortBy),
    next: nextTarget,
    targets
  }), "utf8").toString("base64url");
}

function decodeGooglePlayCursor(cursor, { appId, languageTargets, sortBy }) {
  const value = String(cursor || "").trim();
  if (!value) return { supplied: false, tokens: new Map() };
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Google Play continuation cursor is invalid.");

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Google Play continuation cursor is invalid.");
  }

  const expectedTargets = new Set(languageTargets.map(targetKey));
  const suppliedTargets = Array.isArray(parsed?.targets) ? parsed.targets : [];
  if (
    parsed?.v !== GOOGLE_PLAY_CURSOR_VERSION
    || parsed?.app !== appId
    || parsed?.sort !== normalizedSortKey(sortBy)
    || !Number.isInteger(parsed?.next)
    || parsed.next < 0
    || parsed.next >= languageTargets.length
    || suppliedTargets.length !== expectedTargets.size
  ) {
    throw new Error("Google Play continuation cursor does not match this app, market, or sort order.");
  }

  const tokens = new Map();
  for (const target of suppliedTargets) {
    const key = targetKey(target);
    const token = target?.token;
    if (!expectedTargets.has(key)) {
      throw new Error("Google Play continuation cursor does not match this app, market, or sort order.");
    }
    if (
      tokens.has(key)
      || (token !== null && typeof token !== "string")
      || (typeof token === "string" && token.length > MAX_UPSTREAM_TOKEN_LENGTH)
    ) {
      throw new Error("Google Play continuation cursor is invalid.");
    }
    tokens.set(key, token);
  }
  if (tokens.size !== expectedTargets.size) {
    throw new Error("Google Play continuation cursor does not match this app, market, or sort order.");
  }

  return { supplied: true, tokens, nextTarget: parsed.next };
}

function normalizePaginationToken(value) {
  if (value === null || value === undefined || value === "") return null;
  const token = String(value);
  if (token.length > MAX_UPSTREAM_TOKEN_LENGTH) {
    throw new Error("Google Play returned an oversized continuation cursor.");
  }
  return token;
}

function targetKey(target) {
  return `${String(target?.country || "").toLowerCase()}:${String(target?.language || "").toLowerCase()}`;
}

function normalizedSortKey(value) {
  const normalized = String(value || "newest").toLowerCase();
  if (normalized.includes("rating")) return "rating";
  if (normalized.includes("help") || normalized.includes("relev")) return "helpfulness";
  return "newest";
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
      iconUrl: normalizeText(app?.icon || ""),
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
      iconUrl: "",
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
