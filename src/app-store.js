import { normalizeCountry } from "./storefronts.js";

const APPLE_REVIEW_PAGE_SIZE = 50;
const APPLE_WEB_REVIEW_PAGE_SIZE = 10;
const APPLE_RSS_PAGE_RETRIES = 3;
const APPLE_RSS_RETRY_DELAY_MS = 350;
const APPLE_RSS_PASS_DELAYS_MS = [0, 1200];
const APPLE_RSS_BUDGET_MS = 16000;
const APPLE_RSS_REQUEST_TIMEOUT_MS = 1800;
const APPLE_WEB_PAGE_RETRIES = 3;
const APPLE_WEB_RETRY_DELAY_MS = 600;
const APPLE_WEB_REQUEST_TIMEOUT_MS = 2500;
const APPLE_VISIBLE_PAGE_RETRIES = 3;
const APPLE_VISIBLE_RETRY_DELAY_MS = 800;
const APPLE_VISIBLE_BUDGET_MS = 9000;
const APPLE_VISIBLE_REQUEST_TIMEOUT_MS = 2500;
const APPLE_BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export function parseAppStoreUrl(input) {
  if (!input) throw new Error("Missing App Store URL or app id.");

  const value = String(input).trim();
  if (/^\d{5,}$/.test(value)) {
    return { appId: value, appSlug: `app-${value}`, countryFromUrl: null };
  }

  const idMatch = value.match(/\/id(\d{5,})(?:[/?#]|$)/) ?? value.match(/[?&]id=(\d{5,})(?:[&#]|$)/);
  if (!idMatch) {
    throw new Error("Could not find an App Store app id. Expected a URL containing /id123456789.");
  }

  let appSlug = `app-${idMatch[1]}`;
  let countryFromUrl = null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    countryFromUrl = parts[0]?.length === 2 ? parts[0].toLowerCase() : null;
    const appIndex = parts.indexOf("app");
    if (appIndex >= 0 && parts[appIndex + 1]) appSlug = parts[appIndex + 1];
  } catch {
    // The regex already found the app id.
  }

  return { appId: idMatch[1], appSlug, countryFromUrl };
}

export async function fetchAppleReviews({ appId, country = "us", pages = 10, sortBy = "mostrecent" }) {
  const normalizedCountry = normalizeCountry(country);
  const normalizedSort = String(sortBy || "mostrecent").toLowerCase();
  const safePages = Math.max(1, Math.min(Number(pages) || 1, 10));
  const [rssReviews, webReviewGroups] = await Promise.all([
    fetchPrimaryRssReviews({
      appId,
      country: normalizedCountry,
      pages: safePages,
      sortBy: normalizedSort
    }),
    fetchAppleWebReviews({
      appId,
      country: normalizedCountry,
      pages: safePages
    })
  ]);
  const collection = rssReviews.length
    ? [{ name: "Apple public review feed", reviews: rssReviews.map((review) => ({ ...review, source: "Apple public review feed" })) }]
    : webReviewGroups.some((group) => group.reviews.length)
      ? webReviewGroups
    : [
        ...await fetchAppStorePageReviews({
          appId,
          country: normalizedCountry
        })
      ];

  const metadata = await fetchAppMetadata(appId, normalizedCountry);
  const reviews = sortReviewsByDate(dedupeReviews(collection.flatMap(({ reviews: sourceReviews }) => sourceReviews)));
  const sources = summarizeSources(reviews);
  const sourcePageSize = pageSizeForSources(sources);
  const source = sources.length
    ? sources.map(({ name, count }) => `${name} (${count})`).join(", ")
    : "Apple public review sources returned 0";
  return {
    appName: metadata.appName || `App ${appId}`,
    appId,
    country: normalizedCountry,
    sortBy: normalizedSort,
    fetchedAt: new Date().toISOString(),
    metadata,
    source,
    sources,
    pagesFetched: reviews.length && sourcePageSize ? Math.ceil(reviews.length / sourcePageSize) : 0,
    reviews
  };
}

async function fetchPrimaryRssReviews({ appId, country, pages, sortBy }) {
  let bestResult = { reviews: [], complete: false };
  const deadline = Date.now() + APPLE_RSS_BUDGET_MS;

  for (let attempt = 0; attempt < APPLE_RSS_PASS_DELAYS_MS.length; attempt += 1) {
    const delayMs = APPLE_RSS_PASS_DELAYS_MS[attempt];
    if (delayMs) {
      if (Date.now() + delayMs >= deadline) break;
      await delay(delayMs);
    }

    const result = await fetchPrimaryRssReviewsOnce({ appId, country, pages, sortBy, deadline });
    if (result.reviews.length > bestResult.reviews.length) bestResult = result;
    if (result.complete || result.reviews.length >= pages * APPLE_REVIEW_PAGE_SIZE) break;
    if (Date.now() >= deadline) break;
  }

  return bestResult.reviews;
}

async function fetchPrimaryRssReviewsOnce({ appId, country, pages, sortBy, deadline }) {
  const sortCandidates = [sortBy, "mostrecent", "mostRecent", ""].filter((value, index, list) => list.indexOf(value) === index);
  let bestReviews = [];
  let bestComplete = false;

  for (const sortCandidate of sortCandidates) {
    if (Date.now() >= deadline) break;
    const reviews = [];
    let nextUrl = "";
    let consecutiveEmptyPages = 0;
    let complete = false;

    for (let page = 1; page <= pages; page += 1) {
      if (Date.now() >= deadline) break;
      const result = await fetchPrimaryRssPageWithRetry({
        appId,
        country,
        page,
        sortBy: sortCandidate,
        preferredUrl: nextUrl && rssUrlMatchesPage(nextUrl, page) ? nextUrl : "",
        deadline
      });

      const pageReviews = result.reviews;
      if (!pageReviews.length) {
        consecutiveEmptyPages += 1;
        nextUrl = "";
        if (consecutiveEmptyPages >= 2) {
          complete = false;
          break;
        }
        continue;
      }

      consecutiveEmptyPages = 0;
      reviews.push(...pageReviews);
      nextUrl = result.nextUrl && result.nextUrl !== result.url ? result.nextUrl : "";

      if (pageReviews.length < APPLE_REVIEW_PAGE_SIZE) {
        complete = true;
        break;
      }
      if (page === pages) complete = true;
    }

    const uniqueReviews = sortReviewsByDate(dedupeReviews(reviews));
    if (uniqueReviews.length > bestReviews.length) {
      bestReviews = uniqueReviews;
      bestComplete = complete;
    }
    if (bestComplete || bestReviews.length >= pages * APPLE_REVIEW_PAGE_SIZE) break;
  }

  return { reviews: bestReviews, complete: bestComplete };
}

async function fetchPrimaryRssPageWithRetry(args) {
  let latestResult = { reviews: [], nextUrl: "", url: "" };

  for (let attempt = 1; attempt <= APPLE_RSS_PAGE_RETRIES; attempt += 1) {
    if (Date.now() >= args.deadline) break;
    latestResult = await fetchPrimaryRssPage(args);
    if (latestResult.reviews.length) return latestResult;
    if (attempt < APPLE_RSS_PAGE_RETRIES) {
      if (Date.now() + APPLE_RSS_RETRY_DELAY_MS * attempt >= args.deadline) break;
      await delay(APPLE_RSS_RETRY_DELAY_MS * attempt);
    }
  }

  return latestResult;
}

async function fetchPrimaryRssPage({ appId, country, page, sortBy, preferredUrl = "", deadline }) {
  const sortSegment = sortBy
    ? (sortBy === "mostRecent" ? "sortBy=mostRecent" : `sortby=${sortBy}`)
    : "";
  const urls = uniqueList(["json", "xml"].flatMap((format) => [
    preferredUrl,
    rssUrl({ country, appId, page, sortSegment, format, pattern: "page-id-sort" }),
    rssUrl({ country, appId, page, sortSegment, format, pattern: "id-page-sort" }),
    rssUrl({ country, appId, page, sortSegment, format, pattern: "id-sort-page" }),
    rssUrl({ country: "", appId, page, sortSegment, format, pattern: "page-id-sort", cc: country }),
    rssUrl({ country: "", appId, page, sortSegment, format, pattern: "id-page-sort", cc: country })
  ]));

  for (const url of urls) {
    const result = await fetchRssResult(url, country, appId, deadline);
    if (result.reviews.length) return result;
    if (Date.now() >= deadline) break;
  }

  return { reviews: [], nextUrl: "", url: "" };
}

async function fetchAppleRssReviews({ appId, country, pages, sortBy }) {
  const sourceGroups = [];
  const locale = localeForCountry(country);
  const patterns = [
    {
      name: "Apple RSS country path",
      url: (page) => `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=${sortBy}/json`
    },
    {
      name: "Apple RSS country path + locale",
      url: (page) => `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=${sortBy}/json?l=${encodeURIComponent(locale)}`
    },
    {
      name: "Apple RSS cc parameter",
      url: (page) => `https://itunes.apple.com/rss/customerreviews/page=${page}/id=${appId}/sortby=${sortBy}/json?cc=${country}`
    },
    {
      name: "Apple RSS legacy sort casing",
      url: (page) => `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortBy=mostRecent/json`
    }
  ];

  for (const pattern of patterns) {
    const reviews = [];
    for (let page = 1; page <= pages; page += 1) {
      const pageReviews = await fetchRssPage(pattern.url(page), country, appId);
      if (!pageReviews.length) break;
      reviews.push(...pageReviews.map((review) => ({ ...review, source: pattern.name })));
      if (pageReviews.length < APPLE_REVIEW_PAGE_SIZE) break;
    }
    sourceGroups.push({ name: pattern.name, reviews });
  }

  return sourceGroups;
}

async function fetchRssPage(url, country, appId) {
  return (await fetchRssResult(url, country, appId)).reviews;
}

async function fetchRssResult(url, country, appId, deadline = Date.now() + APPLE_RSS_REQUEST_TIMEOUT_MS) {
  try {
    const remainingMs = Math.max(250, Math.min(APPLE_RSS_REQUEST_TIMEOUT_MS, deadline - Date.now()));
    const response = await fetch(url, {
      signal: AbortSignal.timeout(remainingMs),
      headers: {
        accept: url.endsWith("/xml") || url.includes("/xml?")
          ? "application/xml,text/xml,*/*"
          : "application/json,application/xml,text/xml,*/*",
        "accept-language": `${localeForCountry(country)},en;q=0.8`,
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": APPLE_BROWSER_USER_AGENT
      }
    });

    if (!response.ok) return { reviews: [], nextUrl: "", url };

    const text = await response.text();
    if (!text.trim()) return { reviews: [], nextUrl: "", url };

    const result = text.trim().startsWith("<")
      ? parseXmlRssResult(text, country, appId)
      : parseJsonRssResult(text, country, appId);
    return { ...result, url };
  } catch {
    return { reviews: [], nextUrl: "", url };
  }
}

function parseJsonRssResult(text, country, appId) {
  try {
    const payload = JSON.parse(text);
    const entries = asArray(payload?.feed?.entry);
    const reviews = entries
      .filter((entry) => entry?.["im:rating"])
      .map((entry) => normalizeReview(entry, country, appId))
      .filter((review) => review.content || review.title);
    return {
      reviews,
      nextUrl: extractNextRssUrl(payload)
    };
  } catch {
    return { reviews: [], nextUrl: "" };
  }
}

function parseXmlRssResult(xml, country, appId) {
  const reviews = [...String(xml || "").matchAll(/<entry\b[\s\S]*?<\/entry>/gi)]
    .map(([entry]) => normalizeXmlReview(entry, country, appId))
    .filter((review) => (review.content || review.title) && review.rating);

  return {
    reviews,
    nextUrl: extractNextXmlRssUrl(xml)
  };
}

async function fetchAppleWebReviews({ appId, country, pages }) {
  const reviewsByHost = [];
  const locale = localeForCountry(country);
  const hosts = ["amp-api.apps.apple.com", "amp-api-edge.apps.apple.com"];

  for (const host of hosts) {
    const reviews = [];
    for (let page = 0; page < pages; page += 1) {
      const offset = page * APPLE_WEB_REVIEW_PAGE_SIZE;
      const params = new URLSearchParams({
        l: locale,
        offset: String(offset),
        limit: String(APPLE_WEB_REVIEW_PAGE_SIZE),
        platform: "web",
        additionalPlatforms: "appletv,ipad,iphone,mac"
      });
      const url = `https://${host}/v1/catalog/${country}/apps/${appId}/reviews?${params}`;
      const result = await fetchAppleWebReviewPageWithRetry({
        url,
        country,
        appId,
        retryEmpty: page === 0
      });

      if (!result.ok) break;
      if (!result.reviews.length) break;
      reviews.push(...result.reviews.map((review) => ({ ...review, source: `Apple web reviews (${host})` })));
      if (result.reviews.length < APPLE_WEB_REVIEW_PAGE_SIZE) break;
    }
    const group = { name: `Apple web reviews (${host})`, reviews };
    if (reviews.length) return [group];
    reviewsByHost.push(group);
  }

  return reviewsByHost;
}

async function fetchAppleWebReviewPageWithRetry({ url, country, appId, retryEmpty }) {
  let latestResult = { ok: false, reviews: [] };

  for (let attempt = 1; attempt <= APPLE_WEB_PAGE_RETRIES; attempt += 1) {
    latestResult = await fetchAppleWebReviewPage(url, country, appId);
    if (latestResult.reviews.length) return latestResult;
    if (latestResult.ok && !retryEmpty) return latestResult;

    if (attempt < APPLE_WEB_PAGE_RETRIES) {
      await delay(APPLE_WEB_RETRY_DELAY_MS * attempt);
    }
  }

  return latestResult;
}

async function fetchAppleWebReviewPage(url, country, appId) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(APPLE_WEB_REQUEST_TIMEOUT_MS),
      headers: {
        ...appleRequestHeaders(country, appId, "application/json"),
        origin: "https://apps.apple.com"
      }
    });

    if (!response.ok) return { ok: false, reviews: [] };
    const payload = await response.json();
    const reviews = asArray(payload?.data)
      .map((entry) => normalizeWebReview(entry, country, appId))
      .filter((review) => review.content || review.title);
    return { ok: true, reviews };
  } catch {
    return { ok: false, reviews: [] };
  }
}

async function fetchAppStorePageReviews({ appId, country }) {
  const urls = appStoreReviewPageUrls(appId, country);
  const deadline = Date.now() + APPLE_VISIBLE_BUDGET_MS;
  let bestReviews = [];

  for (let attempt = 1; attempt <= APPLE_VISIBLE_PAGE_RETRIES; attempt += 1) {
    for (const url of urls) {
      if (Date.now() >= deadline) break;
      const reviews = await fetchVisibleAppStorePageReviews(url, country, appId, deadline);
      if (reviews.length > bestReviews.length) bestReviews = reviews;
      if (reviews.length) {
        return [{
          name: "Visible App Store review cards",
          reviews: reviews.map((review) => ({ ...review, source: "Visible App Store review cards" }))
        }];
      }
    }

    if (attempt < APPLE_VISIBLE_PAGE_RETRIES) {
      if (Date.now() + APPLE_VISIBLE_RETRY_DELAY_MS * attempt >= deadline) break;
      await delay(APPLE_VISIBLE_RETRY_DELAY_MS * attempt);
    }
  }

  return [{
    name: "Visible App Store review cards",
    reviews: bestReviews.map((review) => ({ ...review, source: "Visible App Store review cards" }))
  }];
}

async function fetchVisibleAppStorePageReviews(url, country, appId, deadline) {
  try {
    const remainingMs = Math.max(250, Math.min(APPLE_VISIBLE_REQUEST_TIMEOUT_MS, deadline - Date.now()));
    const response = await fetch(url, {
      signal: AbortSignal.timeout(remainingMs),
      headers: appleRequestHeaders(country, appId, "text/html")
    });
    if (!response.ok) return [];

    const html = await response.text();
    return parseReviewsFromAppStoreHtml(html, country, appId);
  } catch {
    return [];
  }
}

function appStoreReviewPageUrls(appId, country) {
  return uniqueList([
    `https://apps.apple.com/${country}/app/id${appId}?see-all=reviews`,
    `https://apps.apple.com/${country}/app/id${appId}?platform=iphone&see-all=reviews`,
    `https://apps.apple.com/${country}/app/id${appId}`,
    `https://apps.apple.com/app/id${appId}?cc=${country}&see-all=reviews`
  ]);
}

function appleRequestHeaders(country, appId, accept) {
  const locale = localeForCountry(country);
  const language = locale.split("-")[0];
  return {
    accept,
    "accept-language": `${locale},${language};q=0.9,en;q=0.8`,
    "cache-control": "no-cache",
    pragma: "no-cache",
    referer: `https://apps.apple.com/${country}/app/id${appId}?see-all=reviews`,
    "user-agent": APPLE_BROWSER_USER_AGENT
  };
}

export function buildDataset({
  appName,
  appId,
  country,
  language = "",
  languages = [],
  marketKey = "",
  marketLabel = "",
  countryLabel = "",
  languageLabel = "",
  languageLabels = [],
  platform = "app_store",
  reviewLimit = 500,
  reviews,
  metadata = {},
  source = "",
  sources = [],
  pagesFetched = 0
}) {
  const dates = reviews
    .map((review) => review.updated)
    .filter(Boolean)
    .map((date) => new Date(date))
    .filter((date) => !Number.isNaN(date.valueOf()))
    .sort((a, b) => a - b);

  return {
    app_name: appName || `App ${appId}`,
    app_id: appId,
    platform,
    country,
    language,
    languages,
    country_name: countryLabel || country?.toUpperCase() || "",
    language_name: languageLabel,
    language_names: languageLabels,
    country_language: marketLabel || [countryLabel || country?.toUpperCase(), languageLabel || language].filter(Boolean).join(" / "),
    market: marketKey,
    source,
    sources,
    pages_fetched: pagesFetched,
    review_limit: reviewLimit,
    app_icon_url: metadata.iconUrl || "",
    app_store_category: metadata.primaryGenreName || "",
    app_store_genres: metadata.genres || [],
    google_play_score: metadata.score ?? null,
    google_play_ratings: metadata.ratings ?? null,
    google_play_written_reviews: metadata.reviews ?? null,
    google_play_installs: metadata.installs || "",
    reviews_exported: reviews.length,
    rating_distribution: ratingDistribution(reviews),
    date_range: dates.length ? `${isoDate(dates[0])} to ${isoDate(dates.at(-1))}` : "Unknown"
  };
}

async function fetchAppMetadata(appId, country) {
  const url = `https://itunes.apple.com/lookup?id=${appId}&country=${country}`;
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-language": `${localeForCountry(country)},en;q=0.8`,
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": APPLE_BROWSER_USER_AGENT
      }
    });
    if (!response.ok) return emptyMetadata();
    const payload = await response.json();
    const result = payload?.results?.[0] || {};
    return {
      appName: normalizeText(result.trackName || ""),
      iconUrl: normalizeText(result.artworkUrl512 || result.artworkUrl100 || result.artworkUrl60 || ""),
      primaryGenreName: normalizeText(result.primaryGenreName || ""),
      genres: Array.isArray(result.genres) ? result.genres.map(normalizeText).filter(Boolean) : []
    };
  } catch {
    return emptyMetadata();
  }
}

function normalizeReview(entry, country, appId) {
  const id = extractLabel(entry?.id);
  const title = normalizeText(extractLabel(entry?.title));
  const content = normalizeText(extractLabel(entry?.content));
  const updated = extractLabel(entry?.updated);
  return {
    id: id || `${appId}:${country}:${updated}:${title}`.slice(0, 180),
    appId,
    country,
    rating: Number(extractLabel(entry?.["im:rating"])) || null,
    version: normalizeText(extractLabel(entry?.["im:version"])),
    title,
    content,
    author: normalizeText(extractLabel(entry?.author?.name)),
    updated,
    voteSum: Number(extractLabel(entry?.["im:voteSum"])) || 0,
    voteCount: Number(extractLabel(entry?.["im:voteCount"])) || 0
  };
}

function normalizeWebReview(entry, country, appId) {
  const attrs = entry?.attributes || {};
  const id = entry?.id || attrs.id;
  const title = normalizeText(attrs.title || attrs.name || "");
  const content = normalizeText(attrs.review || attrs.body || attrs.content || "");
  const updated = attrs.date || attrs.updated || attrs.createdDate || "";
  return {
    id: id || `${appId}:${country}:${updated}:${title}`.slice(0, 180),
    appId,
    country,
    rating: Number(attrs.rating) || null,
    version: normalizeText(attrs.version || ""),
    title,
    content,
    author: normalizeText(attrs.userName || attrs.nickname || attrs.author || ""),
    updated,
    voteSum: Number(attrs.voteSum) || 0,
    voteCount: Number(attrs.voteCount) || 0
  };
}

function normalizeXmlReview(entry, country, appId) {
  const id = decodeHtml(stripTags(extractXmlTag(entry, "id")));
  const title = normalizeText(decodeHtml(stripTags(extractXmlTag(entry, "title"))));
  const content = normalizeText(decodeHtml(stripTags(extractXmlTag(entry, "content"))));
  const updated = decodeHtml(stripTags(extractXmlTag(entry, "updated")));
  return {
    id: id || `${appId}:${country}:${updated}:${title}`.slice(0, 180),
    appId,
    country,
    rating: Number(decodeHtml(stripTags(extractXmlTag(entry, "im:rating")))) || null,
    version: normalizeText(decodeHtml(stripTags(extractXmlTag(entry, "im:version")))),
    title,
    content,
    author: normalizeText(decodeHtml(stripTags(extractXmlTag(extractXmlTag(entry, "author"), "name")))),
    updated,
    voteSum: Number(decodeHtml(stripTags(extractXmlTag(entry, "im:voteSum")))) || 0,
    voteCount: Number(decodeHtml(stripTags(extractXmlTag(entry, "im:voteCount")))) || 0
  };
}

function parseReviewsFromAppStoreHtml(html, country, appId) {
  const text = decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(h[1-6]|p|div|li|span|time|blockquote|figcaption|br)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const reviews = [];
  for (let index = 0; index < text.length - 3; index += 1) {
    const title = text[index];
    const dateAndStars = text[index + 1];
    const author = text[index + 2];
    const content = text[index + 3];

    if (!looksLikeReviewTitle(title)) continue;
    if (!looksLikeDateOrRatingLine(dateAndStars)) continue;
    if (!author || author.length > 80) continue;
    if (!content || content.length < 18) continue;
    if (/developer|desenvolvedor|développeur|entwickler|desarrollador/i.test(author)) continue;

    const rating = ratingFromText(`${title} ${dateAndStars} ${content}`);
    reviews.push({
      id: `${appId}:${country}:page:${reviews.length}:${title}`.slice(0, 180),
      appId,
      country,
      rating,
      version: "",
      title: normalizeText(title),
      content: normalizeText(content.replace(/\s*(mais|more)$/i, "")),
      author: normalizeText(author),
      updated: extractDate(dateAndStars),
      voteSum: 0,
      voteCount: 0
    });

    if (reviews.length >= 50) break;
  }

  return dedupeReviews(reviews);
}

function ratingDistribution(reviews) {
  const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const review of reviews) {
    const rating = String(review.rating || "");
    if (distribution[rating] !== undefined) distribution[rating] += 1;
  }
  return distribution;
}

function dedupeReviews(reviews) {
  const seen = new Set();
  const output = [];
  for (const review of reviews) {
    const key = reviewKey(review);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(review);
  }
  return output;
}

function reviewKey(review) {
  const contentKey = [
    review.country,
    review.rating || "",
    review.updated || "",
    normalizeText(review.author || "").toLowerCase(),
    normalizeText(review.title || "").toLowerCase(),
    normalizeText(review.content || "").toLowerCase()
  ].join("|");
  return contentKey.replace(/\s+/g, " ").slice(0, 400) || review.id;
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

function summarizeSources(reviews) {
  const counts = new Map();
  for (const review of reviews) {
    const source = review.source || "Apple public review feed";
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

function pageSizeForSources(sources) {
  const names = sources.map((source) => source.name).join(" ");
  if (/Apple public review feed/i.test(names)) return APPLE_REVIEW_PAGE_SIZE;
  if (/Apple web reviews/i.test(names)) return APPLE_WEB_REVIEW_PAGE_SIZE;
  if (/Visible App Store review cards/i.test(names)) return 10;
  return 0;
}

function extractLabel(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value.label === "string") return value.label;
  return "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function rssUrl({ country, appId, page, sortSegment, format, pattern, cc = "" }) {
  const prefix = country
    ? `https://itunes.apple.com/${country}/rss/customerreviews`
    : "https://itunes.apple.com/rss/customerreviews";
  const tail = {
    "page-id-sort": [`page=${page}`, `id=${appId}`, sortSegment, format],
    "id-page-sort": [`id=${appId}`, `page=${page}`, sortSegment, format],
    "id-sort-page": [`id=${appId}`, sortSegment, `page=${page}`, format]
  }[pattern].filter(Boolean).join("/");
  const suffix = cc ? `?cc=${cc}` : "";
  return `${prefix}/${tail}${suffix}`;
}

function extractNextRssUrl(payload) {
  const links = asArray(payload?.feed?.link);
  const next = links.find((link) => {
    const rel = extractAttribute(link, "rel").toLowerCase();
    return rel === "next";
  });
  const href = extractAttribute(next, "href");
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href.replace(/^http:/i, "https:");
  if (href.startsWith("/")) return `https://itunes.apple.com${href}`;
  return href;
}

function extractNextXmlRssUrl(xml) {
  const nextLink = String(xml || "").match(/<link\b[^>]*rel=["']next["'][^>]*>/i)?.[0] || "";
  const href = nextLink.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
  if (!href) return "";
  const decodedHref = decodeHtml(href);
  if (/^https?:\/\//i.test(decodedHref)) return decodedHref.replace(/^http:/i, "https:");
  if (decodedHref.startsWith("/")) return `https://itunes.apple.com${decodedHref}`;
  return decodedHref;
}

function rssUrlMatchesPage(url, page) {
  return new RegExp(`(?:/|[?&])page=${page}(?:/|&|$)`).test(url);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAttribute(value, name) {
  return value?.attributes?.[name] || value?.[name] || "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function extractXmlTag(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(xml || "").match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1] || "";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeReviewTitle(value) {
  return value.length >= 2
    && value.length <= 80
    && !/^(ratings|classifica|reviews|avalia|novidades|what.s new|developer response|resposta do desenvolvedor)$/i.test(value);
}

function looksLikeDateOrRatingLine(value) {
  return /\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|\d{4}-\d{2}-\d{2}|★|star|estrela|1\.\s*2\.\s*3\.\s*4\.\s*5\./i.test(value);
}

function ratingFromText(value) {
  const stars = String(value || "").match(/★/g)?.length;
  if (stars) return Math.min(stars, 5);
  const rating = String(value || "").match(/([1-5])\s*(?:out of 5|de 5|stars?|estrelas?)/i);
  return rating ? Number(rating[1]) : null;
}

function extractDate(value) {
  const raw = String(value || "").match(/\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|\d{4}-\d{2}-\d{2}/)?.[0] || "";
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parts = raw.split(/[/.]/).map(Number);
  if (parts.length !== 3) return raw;

  const [first, second, third] = parts;
  const year = third < 100 ? 2000 + third : third;
  const dayFirst = first > 12 || second <= 12;
  const day = dayFirst ? first : second;
  const month = dayFirst ? second : first;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localeForCountry(country) {
  const locales = {
    br: "pt-BR",
    cn: "zh-CN",
    de: "de-DE",
    es: "es-ES",
    fr: "fr-FR",
    it: "it-IT",
    jp: "ja-JP",
    kr: "ko-KR",
    pt: "pt-PT",
    ru: "ru-RU",
    tr: "tr-TR",
    tw: "zh-TW",
    us: "en-US"
  };
  return locales[country] || "en-US";
}

function emptyMetadata() {
  return { appName: "", iconUrl: "", primaryGenreName: "", genres: [] };
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC");
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}
