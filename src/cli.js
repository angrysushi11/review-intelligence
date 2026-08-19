import path from "node:path";
import { readJsonFile, safeSlug, writeMarkdown } from "./files.js";
import { renderReviewsMarkdown } from "./markdown.js";
import { COUNTRY_LANGUAGE_OPTIONS, COUNTRY_OPTIONS, normalizeMarket } from "./storefronts.js";
import { retrieveReviews } from "./retrieve.js";

export async function main(argv) {
  const command = argv[0] || "help";
  const args = parseArgs(argv.slice(1));

  if (command === "help" || args.help) {
    printHelp();
    return;
  }

  if (command === "countries") {
    printCountries();
    return;
  }

  if (command === "markets") {
    printMarkets();
    return;
  }

  if (command !== "extract") {
    throw new Error(`Unknown command: ${command}. Use "extract".`);
  }

  await extract(args);
}

async function extract(args) {
  const requestedMarket = args.market || args.country || "us";
  const market = normalizeMarket(requestedMarket);
  const pages = Number(args.pages || 10);
  const limit = Number(args.limit || 500);
  const outDir = path.resolve(args.out || "./exports");

  if (!Number.isInteger(pages) || pages < 1 || pages > 10) {
    throw new Error("--pages must be an integer from 1 to 10.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit must be an integer from 1 to 500.");
  }

  let payload;
  let dataset;
  let appSlug;

  if (args.reviewsFile) {
    payload = await loadReviewPayload(args.reviewsFile, market);
    dataset = payload.dataset;
    appSlug = safeSlug(payload.appName || "reviews");
  } else {
    const result = await retrieveReviews({
      url: args.url,
      platform: args.platform || "auto",
      market: requestedMarket,
      pages,
      limit,
      sort: args.sort || "mostRecent"
    });
    payload = result.payload;
    dataset = result.dataset;
    appSlug = result.target.appSlug;
  }

  const markdown = renderReviewsMarkdown({ dataset, reviews: payload.reviews });
  const markdownPath = await writeMarkdown({
    outDir,
    slug: safeSlug(appSlug, dataset.platform, dataset.market || dataset.country),
    markdown
  });

  console.log("Review Markdown export complete.");
  console.log(`Markdown: ${markdownPath}`);
}

async function loadReviewPayload(filePath, market) {
  const payload = await readJsonFile(path.resolve(filePath));
  const reviews = Array.isArray(payload) ? payload : payload.reviews;
  if (!Array.isArray(reviews)) {
    throw new Error("--reviews-file must contain either an array of reviews or an object with a reviews array.");
  }
  const country = payload.country || payload.dataset?.country || market.country;
  const language = payload.language || payload.dataset?.language || market.language;
  const languages = payload.languages || payload.dataset?.languages || [language].filter(Boolean);
  const languageNames = payload.languageLabels || payload.dataset?.language_names || [market.languageLabel || language].filter(Boolean);

  return {
    appName: payload.appName || payload.dataset?.app_name || "Imported reviews",
    appId: payload.appId || payload.dataset?.app_id || "imported",
    country,
    language,
    dataset: payload.dataset || {
      app_name: payload.appName || payload.dataset?.app_name || "Imported reviews",
      app_id: payload.appId || payload.dataset?.app_id || "imported",
      platform: payload.platform || payload.dataset?.platform || "imported",
      country,
      language,
      languages,
      country_name: market.countryLabel || country.toUpperCase(),
      language_name: languageNames.join(", "),
      language_names: languageNames,
      country_language: market.label,
      market: market.key,
      source: payload.source || "Imported reviews",
      sources: payload.sources || [],
      pages_fetched: payload.pagesFetched || 0,
      review_limit: reviews.length,
      app_store_category: payload.metadata?.primaryGenreName || payload.dataset?.app_store_category || "",
      app_store_genres: payload.metadata?.genres || payload.dataset?.app_store_genres || [],
      reviews_exported: reviews.length,
      rating_distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      date_range: "Imported"
    },
    metadata: payload.metadata || {
      primaryGenreName: payload.dataset?.app_store_category || "",
      genres: payload.dataset?.app_store_genres || []
    },
    reviews: reviews.map((review, index) => ({
      id: review.id || `imported-${index + 1}`,
      appId: review.appId || payload.appId || "imported",
      country: review.country || country,
      language: review.language || language,
      rating: Number(review.rating) || null,
      version: review.version || "",
      title: review.title || "",
      content: review.content || review.text || "",
      author: review.author || "",
      updated: review.updated || review.date || "",
      voteSum: Number(review.voteSum) || 0,
      voteCount: Number(review.voteCount) || 0
    }))
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function printCountries() {
  for (const country of COUNTRY_OPTIONS) {
    console.log(`${country.country.padEnd(3)} ${country.marketKey.padEnd(6)} ${country.label}`);
  }
}

function printMarkets() {
  for (const market of COUNTRY_LANGUAGE_OPTIONS) {
    console.log(`${market.key.padEnd(6)} ${market.country.padEnd(3)} ${market.language.padEnd(3)} ${market.label}`);
  }
}

function printHelp() {
  console.log(`review-retriever

Usage:
  node ./bin/review-retriever.js extract --url "https://apps.apple.com/us/app/name/id123456789" [options]
  node ./bin/review-retriever.js extract --url "https://play.google.com/store/apps/details?id=com.example.app" [options]
  node ./bin/review-retriever.js extract --reviews-file ../path/to/reviews.json [options]
  node ./bin/review-retriever.js countries
  node ./bin/review-retriever.js markets

Options:
  --market us        Country code or country / language pair. Default: us
  --country us       Backward-compatible alias for --market
  --platform auto    auto, app_store, google_play
  --pages 10         Apple pages to fetch, max 10
  --limit 500        Review limit, max 500
  --sort mostRecent  Review sort
  --out ./exports    Output directory

Output:
  <app>-<platform>-<market>-reviews.md
`);
}
