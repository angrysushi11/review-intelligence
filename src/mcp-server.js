import { createHash } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

import { renderReviewsMarkdown } from "./markdown.js";
import {
  MCP_BODY_LIMIT_BYTES,
  requestBodyTooLarge,
  requestHasUnsupportedJsonType
} from "./request-limits.js";
import { retrieveReviews } from "./retrieve.js";

const SERVER_NAME = "review-retriever";
const SERVER_VERSION = "1.0.0";
const TOOL_NAME = "retrieve_app_reviews";
const SCHEMA_VERSION = "review-retriever.v1";

const platformSchema = z.enum(["auto", "app_store", "google_play"]);
const resolvedPlatformSchema = z.enum(["app_store", "google_play"]);
const sortSchema = z.enum(["most_recent", "most_helpful", "rating"]);

export const retrieveReviewsInputSchema = {
  url: z.string()
    .trim()
    .min(1)
    .max(2048)
    .describe("App Store or Google Play app URL. A numeric Apple app ID or Google Play package ID is also accepted."),
  platform: platformSchema
    .default("auto")
    .describe("Store platform. Use auto unless the target cannot be detected from the URL or app ID."),
  market: z.string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/, "Use a two-letter country code or language-country value such as us or en-US.")
    .default("en-US")
    .describe("Storefront country or language-country market, such as us, en-US, or de-DE."),
  limit: z.number()
    .int()
    .min(1)
    .max(500)
    .default(500)
    .describe("Maximum unique review records to return. The connector caps this at 500."),
  sort: sortSchema
    .default("most_recent")
    .describe("Review ordering requested from the public store source."),
  include_markdown: z.boolean()
    .default(false)
    .describe("Also render the returned records as the legacy Markdown review export. This duplicates the structured reviews, so leave false for direct analysis.")
};

const nullableString = z.string().nullable();
const nonnegativeInteger = z.number().int().nonnegative();

const normalizedReviewSchema = z.object({
  review_id: z.string().describe("Stable connector-generated evidence ID for this review."),
  source_review_id: nullableString.describe("Review ID supplied by the store source, when available."),
  platform: resolvedPlatformSchema,
  country_code: z.string(),
  language_code: nullableString,
  rating: z.number().int().min(1).max(5).nullable(),
  date: nullableString.describe("Review date as an ISO timestamp when the source provides a valid date."),
  app_version: nullableString,
  author: nullableString,
  title: nullableString,
  text: z.string().describe("Review body, or the title when the source only supplies a title."),
  helpful_votes: nonnegativeInteger,
  developer_reply: nullableString,
  developer_reply_date: nullableString,
  source: nullableString,
  analysis_ready: z.boolean().describe("True when the record contains review text that can support analysis.")
}).strict();

export const retrieveReviewsOutputSchema = {
  schema_version: z.literal(SCHEMA_VERSION),
  retrieved_at: z.string().describe("Timestamp reported by the retrieval source, normalized as ISO when possible."),
  request: z.object({
    target: z.string(),
    requested_platform: platformSchema,
    market: z.string(),
    limit: z.number().int().min(1).max(500),
    sort: sortSchema,
    include_markdown: z.boolean()
  }).strict(),
  app: z.object({
    name: z.string(),
    id: z.string(),
    platform: resolvedPlatformSchema
  }).strict(),
  storefront: z.object({
    market_key: z.string(),
    label: z.string(),
    country_code: z.string(),
    country_name: z.string(),
    languages: z.array(z.object({
      code: z.string(),
      name: z.string()
    }).strict())
  }).strict(),
  coverage: z.object({
    requested: nonnegativeInteger.describe("Maximum review records requested by the caller."),
    declared: nonnegativeInteger.nullable().describe("Total written-review count declared by store metadata, when available. This is not the analysis denominator."),
    retrieved: nonnegativeInteger.describe("Unique review records returned after applying the requested limit."),
    analyzed_ready: nonnegativeInteger.describe("Returned records with usable review text. Use this as the default denominator for review-derived percentages."),
    source_records_before_limit: nonnegativeInteger,
    excluded_without_text: nonnegativeInteger,
    truncated_to_limit: z.boolean(),
    warning: nullableString.describe("Concise coverage warning when requested, retrieved, and analysis-ready counts differ."),
    denominator_note: z.string()
  }).strict(),
  ratings: z.object({
    denominator: nonnegativeInteger,
    rated_reviews: nonnegativeInteger,
    unrated_reviews: nonnegativeInteger,
    distribution: z.object({
      "1": nonnegativeInteger,
      "2": nonnegativeInteger,
      "3": nonnegativeInteger,
      "4": nonnegativeInteger,
      "5": nonnegativeInteger
    }).strict()
  }).strict(),
  dates: z.object({
    denominator: nonnegativeInteger,
    dated_reviews: nonnegativeInteger,
    undated_reviews: nonnegativeInteger,
    oldest: nullableString,
    newest: nullableString
  }).strict(),
  sources: z.array(z.object({
    name: z.string(),
    count: nonnegativeInteger,
    requested: nonnegativeInteger.nullable(),
    country_code: nullableString,
    language_code: nullableString,
    error: nullableString
  }).strict()),
  reviews: z.array(normalizedReviewSchema).max(500),
  markdown: nullableString.describe("Legacy Markdown export when include_markdown is true; otherwise null.")
};

export function createReviewRetrieverMcpServer({ retrieveReviewsFn = retrieveReviews } = {}) {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(TOOL_NAME, {
    title: "Retrieve public app reviews",
    description: "Retrieve public written reviews for one App Store or Google Play app and return analysis-ready records with stable evidence IDs and explicit coverage denominators. This tool retrieves data only; it does not analyze reviews or modify any external system.",
    inputSchema: retrieveReviewsInputSchema,
    outputSchema: retrieveReviewsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  }, async (input) => {
    try {
      const structuredContent = await buildReviewExport(input, { retrieveReviewsFn });
      return {
        content: [{
          type: "text",
          // Conversational MCP clients may expose only `content` to the model.
          // Keep it equivalent to `structuredContent` so every client receives
          // the evidence records rather than only a retrieval status line.
          text: JSON.stringify(structuredContent)
        }],
        structuredContent
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Review retrieval failed: ${safeErrorMessage(error)}`
        }]
      };
    }
  });

  return server;
}

export function createMcpHttpHandler(options = {}) {
  return async function mcpHttpHandler(request, response) {
    if (request.method === "GET" && acceptsHtml(request)) {
      response.statusCode = 302;
      response.setHeader("cache-control", "no-store");
      response.setHeader("location", "/setup#codex-connector");
      response.setHeader("vary", "accept");
      return response.end();
    }

    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.setHeader("vary", "accept");
      return response.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null
      });
    }

    if (requestBodyTooLarge(request, MCP_BODY_LIMIT_BYTES)) {
      return sendJsonRpcError(response, 413, -32000, "Request body is too large.");
    }

    if (requestHasUnsupportedJsonType(request)) {
      return sendJsonRpcError(response, 415, -32000, "Content-Type must be application/json.");
    }

    let body;
    try {
      body = typeof request.body === "string"
        ? JSON.parse(request.body || "{}")
        : request.body;
    } catch {
      return sendJsonRpcError(response, 400, -32700, "Invalid JSON request body.");
    }

    const server = createReviewRetrieverMcpServer(options);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    const close = () => {
      Promise.allSettled([transport.close(), server.close()]);
    };
    response.once?.("close", close);

    try {
      await server.connect(transport);
      return await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) {
        return response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null
        });
      }
      return undefined;
    }
  };
}

function sendJsonRpcError(response, status, code, message) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json");
  response.setHeader("vary", "accept");
  return response.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  });
}

function acceptsHtml(request) {
  const rawAccept = request.headers?.accept;
  const accept = Array.isArray(rawAccept) ? rawAccept.join(",") : rawAccept;
  if (typeof accept !== "string") return false;

  return accept
    .split(",")
    .map((value) => value.split(";", 1)[0].trim().toLowerCase())
    .includes("text/html");
}

export async function buildReviewExport(input, { retrieveReviewsFn = retrieveReviews } = {}) {
  const request = normalizeRequest(input);
  // Apple can fall back from a 50-review feed to a 10-review public page.
  // Size the request for the smaller source so a fallback does not silently
  // under-fetch while still respecting the retriever's ten-page ceiling.
  const pages = Math.max(1, Math.min(10, Math.ceil(request.limit / 10)));
  const result = await retrieveReviewsFn({
    url: request.target,
    platform: request.requested_platform,
    market: request.market,
    pages,
    limit: request.limit,
    sort: request.sort
  });

  const payload = result?.payload || {};
  const dataset = result?.dataset || {};
  const platform = resolvedPlatform(result, dataset);
  const countryCode = normalizedString(dataset.country || payload.country || result?.market?.country || "").toLowerCase();
  const rawReviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  const entries = uniqueReviewEntries(rawReviews, {
    platform,
    appId: dataset.app_id || payload.appId || result?.target?.appId || "",
    countryCode
  });
  const limitedEntries = entries.slice(0, request.limit);
  const reviews = limitedEntries.map(({ normalized }) => normalized);
  const analysisReady = reviews.filter((review) => review.analysis_ready);
  const coverage = buildCoverage({
    requested: request.limit,
    declared: declaredReviewCount(dataset, payload),
    retrieved: reviews.length,
    analyzedReady: analysisReady.length,
    sourceRecordsBeforeLimit: entries.length
  });
  const ratings = buildRatingCoverage(analysisReady);
  const dates = buildDateCoverage(analysisReady);
  const sources = normalizeSources(dataset.sources || payload.sources, dataset.source || payload.source, reviews.length);
  const languages = normalizeLanguages(dataset, payload, result);
  const app = {
    name: normalizedString(dataset.app_name || payload.appName || `App ${dataset.app_id || payload.appId || result?.target?.appId || ""}`).trim(),
    id: normalizedString(dataset.app_id || payload.appId || result?.target?.appId || ""),
    platform
  };
  const storefront = {
    market_key: normalizedString(dataset.market || request.market),
    label: normalizedString(dataset.country_language || dataset.country_name || request.market),
    country_code: countryCode,
    country_name: normalizedString(dataset.country_name || result?.market?.countryLabel || countryCode.toUpperCase()),
    languages
  };

  const markdown = request.include_markdown
    ? renderConnectorMarkdown({
        dataset: markdownDataset(dataset, app, storefront, ratings, dates, reviews.length, request.limit),
        reviews: limitedEntries.map(({ raw }) => raw),
        coverage
      })
    : null;

  return {
    schema_version: SCHEMA_VERSION,
    retrieved_at: normalizedIsoTimestamp(payload.fetchedAt || new Date().toISOString()),
    request,
    app,
    storefront,
    coverage,
    ratings,
    dates,
    sources,
    reviews,
    markdown
  };
}

function normalizeRequest(input = {}) {
  return {
    target: normalizedString(input.url),
    requested_platform: input.platform || "auto",
    market: input.market || "en-US",
    limit: Number(input.limit) || 500,
    sort: input.sort || "most_recent",
    include_markdown: Boolean(input.include_markdown)
  };
}

function resolvedPlatform(result, dataset) {
  const value = dataset.platform || result?.target?.platform;
  if (value === "app_store" || value === "google_play") return value;
  throw new Error("The review source did not resolve an App Store or Google Play platform.");
}

function uniqueReviewEntries(rawReviews, context) {
  const seen = new Set();
  const entries = [];
  for (const raw of rawReviews) {
    const normalized = normalizeReview(raw, context);
    if (seen.has(normalized.review_id)) continue;
    seen.add(normalized.review_id);
    entries.push({ raw, normalized });
  }
  return entries;
}

function normalizeReview(review = {}, context) {
  const sourceReviewId = nullableNormalizedString(review.id);
  const countryCode = normalizedString(review.country || context.countryCode).toLowerCase();
  const languageCode = nullableNormalizedString(review.language)?.toLowerCase() || null;
  const title = nullableNormalizedString(review.title);
  const content = normalizedString(review.content || review.text || "");
  const text = content || title || "";
  const date = normalizedNullableIsoTimestamp(review.updated || review.date);
  const rating = normalizedRating(review.rating || review.score);
  const identity = sourceReviewId
    ? ["source", context.platform, context.appId, countryCode, languageCode || "", sourceReviewId]
    : ["content", context.platform, context.appId, countryCode, languageCode || "", date || "", rating || "", title || "", text, normalizedString(review.author).toLowerCase()];

  return {
    review_id: `rr_${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32)}`,
    source_review_id: sourceReviewId,
    platform: context.platform,
    country_code: countryCode,
    language_code: languageCode,
    rating,
    date,
    app_version: nullableNormalizedString(review.version || review.appVersion),
    author: nullableNormalizedString(review.author || review.userName),
    title,
    text,
    helpful_votes: normalizedNonnegativeInteger(review.voteSum || review.voteCount || review.thumbsUp),
    developer_reply: nullableNormalizedString(review.developerReply || review.replyText),
    developer_reply_date: normalizedNullableIsoTimestamp(review.developerReplyDate || review.replyDate),
    source: nullableNormalizedString(review.source),
    analysis_ready: Boolean(text)
  };
}

function buildCoverage({ requested, declared, retrieved, analyzedReady, sourceRecordsBeforeLimit }) {
  const excludedWithoutText = Math.max(0, retrieved - analyzedReady);
  return {
    requested,
    declared,
    retrieved,
    analyzed_ready: analyzedReady,
    source_records_before_limit: sourceRecordsBeforeLimit,
    excluded_without_text: excludedWithoutText,
    truncated_to_limit: sourceRecordsBeforeLimit > retrieved,
    warning: coverageWarning({ requested, retrieved, analyzedReady }),
    denominator_note: analyzedReady
      ? `Use analyzed_ready (${analyzedReady}) as the default denominator for all review-derived percentages unless a metric explicitly names a different denominator.`
      : "No analysis-ready review text was returned. Do not calculate review-derived percentages."
  };
}

function coverageWarning({ requested, retrieved, analyzedReady }) {
  if (!analyzedReady) {
    return `Requested ${requested} reviews, retrieved ${retrieved}, and found no analysis-ready review text.`;
  }
  if (analyzedReady !== retrieved) {
    return `Requested ${requested} reviews; ${retrieved} records were retrieved and ${analyzedReady} contain usable text. Base review-derived percentages on ${analyzedReady}.`;
  }
  if (retrieved < requested) {
    return `Requested ${requested} reviews; the public source returned ${retrieved}. Base review-derived percentages on ${analyzedReady}.`;
  }
  return null;
}

function buildRatingCoverage(reviews) {
  const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const review of reviews) {
    if (review.rating) distribution[String(review.rating)] += 1;
  }
  const ratedReviews = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  return {
    denominator: reviews.length,
    rated_reviews: ratedReviews,
    unrated_reviews: reviews.length - ratedReviews,
    distribution
  };
}

function buildDateCoverage(reviews) {
  const values = reviews
    .map((review) => review.date)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    denominator: reviews.length,
    dated_reviews: values.length,
    undated_reviews: reviews.length - values.length,
    oldest: values[0] || null,
    newest: values.at(-1) || null
  };
}

function normalizeSources(rawSources, fallbackSource, retrievedCount) {
  const sources = Array.isArray(rawSources) ? rawSources : [];
  if (!sources.length && fallbackSource) {
    return [{
      name: normalizedString(fallbackSource),
      count: retrievedCount,
      requested: null,
      country_code: null,
      language_code: null,
      error: null
    }];
  }
  return sources.map((source) => ({
    name: normalizedString(source?.name || fallbackSource || "Public store reviews"),
    count: normalizedNonnegativeInteger(source?.count),
    requested: nullableNonnegativeInteger(source?.requested),
    country_code: nullableNormalizedString(source?.country)?.toLowerCase() || null,
    language_code: nullableNormalizedString(source?.language)?.toLowerCase() || null,
    error: nullableNormalizedString(source?.error)
  }));
}

function normalizeLanguages(dataset, payload, result) {
  const codes = arrayOfStrings(dataset.languages).length
    ? arrayOfStrings(dataset.languages)
    : arrayOfStrings(payload.languages).length
      ? arrayOfStrings(payload.languages)
      : splitList(dataset.language || payload.language || result?.market?.language);
  const names = arrayOfStrings(dataset.language_names).length
    ? arrayOfStrings(dataset.language_names)
    : arrayOfStrings(payload.languageLabels).length
      ? arrayOfStrings(payload.languageLabels)
      : splitList(dataset.language_name || result?.market?.languageLabel);
  return [...new Set(codes.map((code) => code.toLowerCase()))].map((code, index) => ({
    code,
    name: names[index] || code
  }));
}

function declaredReviewCount(dataset, payload) {
  const values = [dataset.google_play_written_reviews, payload?.metadata?.reviews, payload.declaredReviews];
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isInteger(number) && number >= 0) return number;
  }
  return null;
}

function markdownDataset(dataset, app, storefront, ratings, dates, reviewCount, reviewLimit) {
  return {
    ...dataset,
    app_name: app.name,
    app_id: app.id,
    platform: app.platform,
    country: storefront.country_code,
    country_name: storefront.country_name,
    country_language: storefront.label,
    market: storefront.market_key,
    language: storefront.languages.map(({ code }) => code).join(","),
    languages: storefront.languages.map(({ code }) => code),
    language_name: storefront.languages.map(({ name }) => name).join(", "),
    language_names: storefront.languages.map(({ name }) => name),
    review_limit: reviewLimit,
    reviews_exported: reviewCount,
    rating_distribution: ratings.distribution,
    date_range: dates.oldest && dates.newest
      ? `${dates.oldest.slice(0, 10)} to ${dates.newest.slice(0, 10)}`
      : "Unknown"
  };
}

function renderConnectorMarkdown({ dataset, reviews, coverage }) {
  const markdown = renderReviewsMarkdown({ dataset, reviews });
  const marker = `- Unique reviews exported: ${reviews.length}`;
  const coverageLines = [
    `- Analysis-ready reviews: ${coverage.analyzed_ready}`,
    `- Default analysis denominator: ${coverage.analyzed_ready}`,
    ...(coverage.warning ? [`- Coverage warning: ${coverage.warning}`] : [])
  ];
  return markdown.replace(marker, [marker, ...coverageLines].join("\n"));
}

function normalizedRating(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function normalizedNonnegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function nullableNonnegativeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function normalizedIsoTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

function normalizedNullableIsoTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizedString(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function nullableNormalizedString(value) {
  const normalized = normalizedString(value);
  return normalized || null;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(normalizedString).filter(Boolean) : [];
}

function splitList(value) {
  return normalizedString(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function safeErrorMessage(error) {
  const message = normalizedString(error instanceof Error ? error.message : error);
  return message || "The public review source returned an unknown error.";
}
