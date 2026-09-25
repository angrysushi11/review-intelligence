import assert from "node:assert/strict";
import test from "node:test";

import { createReviewLinkHandler } from "../src/review-link.js";

const pathname = "/r/google_play/com.example.app.md";

function fakeResult() {
  return {
    payload: { reviews: [{ rating: 5, updated: "2026-09-24", content: "Useful app" }] },
    dataset: {
      app_name: "Example",
      app_id: "com.example.app",
      platform: "google_play",
      country: "us",
      country_name: "United States",
      date_range: "2026-09-24 to 2026-09-24",
      rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 }
    }
  };
}

test("review-link prototype is unavailable unless its flag is enabled", async () => {
  const handler = createReviewLinkHandler({ enabled: false });
  const response = await handler({ pathname, searchParams: new URLSearchParams() });
  assert.equal(response.status, 404);
});

test("enabled review-link returns the complete method, question, and fresh public reviews", async () => {
  let received;
  const handler = createReviewLinkHandler({
    enabled: true,
    retrieveReviewsFn: async (input) => {
      received = input;
      return fakeResult();
    },
    rateStore: new Map()
  });
  const response = await handler({
    pathname,
    searchParams: new URLSearchParams("country=us&limit=1&q=price"),
    headers: { "x-forwarded-for": "203.0.113.9" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(response.headers["x-robots-tag"], "noindex");
  assert.equal(response.headers["cache-control"], "public, s-maxage=600");
  assert.match(response.body, /# App Review Growth Analyzer/);
  assert.match(response.body, /# Requested question/);
  assert.match(response.body, /Is the complaint about the price itself/);
  assert.match(response.body, /# Example Reviews/);
  assert.deepEqual(received, {
    url: "https://play.google.com/store/apps/details?id=com.example.app&gl=us",
    platform: "google_play",
    market: "us",
    pages: 10,
    limit: 1,
    sort: "mostRecent"
  });
});

test("review-link rejects malformed platform IDs, countries, limits, and questions before retrieval", async () => {
  let calls = 0;
  const handler = createReviewLinkHandler({ enabled: true, retrieveReviewsFn: async () => { calls += 1; return fakeResult(); }, rateStore: new Map() });
  for (const [badPath, query, message] of [
    ["/r/app_store/not-an-id.md", "", "App Store app ID is invalid."],
    [pathname, "country=xx", "Country must be a supported two-letter code."],
    [pathname, "limit=201", "Review limit must be an integer from 1 to 200."],
    [pathname, "q=made-up", "Question is invalid."]
  ]) {
    const response = await handler({ pathname: badPath, searchParams: new URLSearchParams(query) });
    assert.equal(response.status, 400);
    assert.equal(response.body, message);
  }
  assert.equal(calls, 0);
});

test("review-link limits requests per IP within a process window", async () => {
  const handler = createReviewLinkHandler({
    enabled: true,
    retrieveReviewsFn: async () => fakeResult(),
    rateLimit: 2,
    rateWindowMs: 60_000,
    rateStore: new Map(),
    now: () => 1_000
  });
  const request = { pathname, searchParams: new URLSearchParams(), headers: { "x-forwarded-for": "203.0.113.2, 10.0.0.1" } };
  assert.equal((await handler(request)).status, 200);
  assert.equal((await handler(request)).status, 200);
  const limited = await handler(request);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["retry-after"], "60");
});
