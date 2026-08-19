import { renderReviewsMarkdown } from "../src/markdown.js";
import {
  EXTRACT_BODY_LIMIT_BYTES,
  requestBodyTooLarge,
  requestHasUnsupportedJsonType
} from "../src/request-limits.js";
import { retrieveReviews } from "../src/retrieve.js";

export const config = {
  maxDuration: 30
};

export default async function handler(request, response) {
  response.setHeader("cache-control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (requestBodyTooLarge(request, EXTRACT_BODY_LIMIT_BYTES)) {
    return response.status(413).json({ error: "Request body is too large." });
  }

  if (requestHasUnsupportedJsonType(request)) {
    return response.status(415).json({ error: "Content-Type must be application/json." });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const inputUrl = String(body.url || "").trim();
    if (!inputUrl) return response.status(400).json({ error: "App Store or Google Play URL is required." });
    if (inputUrl.length > 2048) return response.status(400).json({ error: "App URL is too long." });

    const limit = body.limit === undefined ? 500 : Number(body.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return response.status(400).json({ error: "Review limit must be an integer from 1 to 500." });
    }

    const market = String(body.market || body.country || "en-US").trim();
    if (market.length < 2 || market.length > 128) {
      return response.status(400).json({ error: "Market is invalid." });
    }

    const { target, payload, dataset } = await retrieveReviews({
      url: inputUrl,
      platform: body.platform || "auto",
      market,
      pages: 10,
      limit,
      sort: body.sort || "mostRecent"
    });
    const markdown = renderReviewsMarkdown({ dataset, reviews: payload.reviews });

    return response.status(200).json({
      filename: `${safeSlug(target.appSlug, dataset.platform, dataset.market || dataset.country)}-reviews.md`,
      dataset,
      markdown
    });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

function safeSlug(...parts) {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "reviews";
}
