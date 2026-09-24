import { renderReviewsMarkdown } from "./markdown.js";
import { retrieveReviews } from "./retrieve.js";
import { COUNTRY_OPTIONS } from "./storefronts.js";
import { ANALYSIS_METHOD } from "../web/review-intelligence-method.js";
import { findQuestion, isQuestionId } from "../web/analysis-prompt.js";

export const REVIEW_LINK_FLAG = "REVIEW_LINK_PROTOTYPE_ENABLED";
export const REVIEW_LINK_RATE_LIMIT = 30;
export const REVIEW_LINK_RATE_WINDOW_MS = 60_000;

// This is deliberately process-local. Vercel functions can run in more than one
// instance, so it only slows a single noisy client; it is not a distributed limit.
const requestsByIp = new Map();

export function isReviewLinkPrototypeEnabled(environment = process.env) {
  return String(environment[REVIEW_LINK_FLAG] || "").toLowerCase() === "true";
}

export function createReviewLinkHandler({
  enabled = isReviewLinkPrototypeEnabled(),
  retrieveReviewsFn = retrieveReviews,
  now = () => Date.now(),
  rateLimit = REVIEW_LINK_RATE_LIMIT,
  rateWindowMs = REVIEW_LINK_RATE_WINDOW_MS,
  rateStore = requestsByIp
} = {}) {
  return async function handleReviewLink({ method = "GET", pathname, searchParams, headers = {} }) {
    if (!enabled) return textResponse(404, "Not found");
    if (method !== "GET") return textResponse(405, "Method not allowed", { allow: "GET" });

    const target = parseReviewLinkPath(pathname);
    if (!target) return textResponse(404, "Not found");

    const input = validateReviewLinkInput(target, searchParams);
    if (input.error) return textResponse(400, input.error);

    const ip = clientIp(headers);
    if (!allowRequest(ip, now(), { rateLimit, rateWindowMs, rateStore })) {
      return textResponse(429, "Too many requests. Try again in a minute.", { "retry-after": "60" });
    }

    try {
      const { payload, dataset } = await retrieveReviewsFn({
        url: canonicalStoreUrl(input.platform, input.appId, input.country),
        platform: input.platform,
        market: input.country,
        pages: 10,
        limit: input.limit,
        sort: "mostRecent"
      });
      const question = findQuestion(input.questionId);
      const reviews = renderReviewsMarkdown({ dataset, reviews: payload.reviews });
      return markdownResponse(200, [
        ANALYSIS_METHOD.trim(),
        `# Requested question`,
        question.prompt,
        reviews
      ].join("\n\n"));
    } catch (error) {
      return textResponse(502, error?.message || "Could not retrieve public reviews.");
    }
  };
}

export function parseReviewLinkPath(pathname) {
  const match = String(pathname || "").match(/^\/r\/(app_store|google_play)\/([^/]+)\.md$/);
  if (!match) return null;
  return { platform: match[1], appId: decodeURIComponent(match[2]) };
}

export function validateReviewLinkInput({ platform, appId }, searchParams) {
  if (platform === "app_store" && !/^\d{5,}$/.test(appId)) return { error: "App Store app ID is invalid." };
  if (platform === "google_play" && !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(appId)) {
    return { error: "Google Play app ID is invalid." };
  }

  const country = String(searchParams?.get("country") || "us").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(country) || !COUNTRY_OPTIONS.some((option) => option.country === country)) {
    return { error: "Country must be a supported two-letter code." };
  }

  const rawLimit = searchParams?.get("limit") || "200";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return { error: "Review limit must be an integer from 1 to 200." };

  const questionId = String(searchParams?.get("q") || "first-read").trim();
  if (!isQuestionId(questionId)) return { error: "Question is invalid." };
  return { platform, appId, country, limit, questionId };
}

export function canonicalStoreUrl(platform, appId, country) {
  if (platform === "app_store") return `https://apps.apple.com/${country}/app/id${appId}`;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&gl=${country}`;
}

export function allowRequest(ip, time, { rateLimit, rateWindowMs, rateStore }) {
  const history = (rateStore.get(ip) || []).filter((timestamp) => timestamp > time - rateWindowMs);
  if (history.length >= rateLimit) {
    rateStore.set(ip, history);
    return false;
  }
  history.push(time);
  rateStore.set(ip, history);
  return true;
}

function clientIp(headers) {
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || "unknown").split(",")[0].trim() || "unknown";
}

function markdownResponse(status, body, extraHeaders = {}) {
  return {
    status,
    body,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "public, s-maxage=600",
      ...extraHeaders
    }
  };
}

function textResponse(status, body, extraHeaders = {}) {
  return { status, body, headers: { "content-type": "text/plain; charset=utf-8", ...extraHeaders } };
}
