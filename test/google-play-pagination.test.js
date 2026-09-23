import assert from "node:assert/strict";
import test from "node:test";

import { fetchGooglePlayReviewSet } from "../src/google-play.js";
import { retrieveReviews } from "../src/retrieve.js";

const MARKET = [{
  country: "us",
  language: "en",
  languageLabel: "English",
  key: "en-US"
}];

test("Google Play retrieval continues beyond the first batch with an opaque cursor", async () => {
  const reviewCalls = [];
  const gplayClient = {
    sort: { NEWEST: 2, HELPFULNESS: 1, RATING: 3 },
    async app() {
      return { title: "Example App", reviews: 1200 };
    },
    async reviews(options) {
      reviewCalls.push(options);
      if (!options.nextPaginationToken) {
        return {
          data: [rawReview("review-1", "First batch")],
          nextPaginationToken: "upstream-page-2"
        };
      }
      assert.equal(options.nextPaginationToken, "upstream-page-2");
      return {
        data: [rawReview("review-2", "Second batch")],
        nextPaginationToken: null
      };
    }
  };

  const first = await fetchGooglePlayReviewSet({
    appId: "com.example.app",
    markets: MARKET,
    limit: 150,
    sortBy: "newest",
    gplayClient
  });

  assert.equal(first.reviews.length, 1);
  assert.equal(first.reviews[0].id, "review-1");
  assert.equal(first.cursorSupplied, false);
  assert.equal(typeof first.nextCursor, "string");
  assert.notEqual(first.nextCursor, "upstream-page-2");

  const second = await fetchGooglePlayReviewSet({
    appId: "com.example.app",
    markets: MARKET,
    limit: 150,
    sortBy: "newest",
    cursor: first.nextCursor,
    gplayClient
  });

  assert.equal(second.reviews.length, 1);
  assert.equal(second.reviews[0].id, "review-2");
  assert.equal(second.cursorSupplied, true);
  assert.equal(second.nextCursor, null);
  assert.equal(reviewCalls.length, 2);
  assert.equal(reviewCalls[0].nextPaginationToken, null);
  assert.equal(reviewCalls[1].nextPaginationToken, "upstream-page-2");
});

test("Google Play continuation cursors are bound to the app, market, and sort order", async () => {
  const gplayClient = {
    sort: { NEWEST: 2 },
    async app() {
      return {};
    },
    async reviews() {
      return {
        data: [rawReview("review-1", "First batch")],
        nextPaginationToken: "upstream-page-2"
      };
    }
  };
  const first = await fetchGooglePlayReviewSet({
    appId: "com.example.app",
    markets: MARKET,
    limit: 150,
    gplayClient
  });

  await assert.rejects(
    fetchGooglePlayReviewSet({
      appId: "com.other.app",
      markets: MARKET,
      limit: 150,
      cursor: first.nextCursor,
      gplayClient
    }),
    /does not match this app, market, or sort order/
  );
  await assert.rejects(
    fetchGooglePlayReviewSet({
      appId: "com.example.app",
      markets: [{ country: "gb", language: "en", languageLabel: "English", key: "en-GB" }],
      limit: 150,
      cursor: first.nextCursor,
      gplayClient
    }),
    /does not match this app, market, or sort order/
  );
  await assert.rejects(
    fetchGooglePlayReviewSet({
      appId: "com.example.app",
      markets: MARKET,
      limit: 150,
      sortBy: "rating",
      cursor: first.nextCursor,
      gplayClient
    }),
    /does not match this app, market, or sort order/
  );
});

test("multi-language continuation rotates across language targets without starving later targets", async () => {
  const calls = [];
  const markets = [
    { country: "in", language: "en", languageLabel: "English", key: "en-IN" },
    { country: "in", language: "hi", languageLabel: "Hindi", key: "hi-IN" },
    { country: "in", language: "ta", languageLabel: "Tamil", key: "ta-IN" }
  ];
  const gplayClient = {
    sort: { NEWEST: 2 },
    async app() {
      return { title: "Example App" };
    },
    async reviews(options) {
      calls.push(options.lang);
      return {
        data: [rawReview(`${options.lang}-${calls.length}`, `${options.lang} batch`)],
        nextPaginationToken: `${options.lang}-next-${calls.length}`
      };
    }
  };

  const first = await fetchGooglePlayReviewSet({
    appId: "com.example.app",
    markets,
    limit: 300,
    gplayClient
  });
  const second = await fetchGooglePlayReviewSet({
    appId: "com.example.app",
    markets,
    limit: 300,
    cursor: first.nextCursor,
    gplayClient
  });

  assert.deepEqual(calls, ["en", "hi", "ta", "en"]);
  assert.equal(first.reviews.length, 2);
  assert.equal(second.reviews.length, 2);
  assert.equal(typeof second.nextCursor, "string");
});

test("Apple retrieval rejects Google Play continuation cursors before fetching", async () => {
  await assert.rejects(
    retrieveReviews({
      url: "https://apps.apple.com/us/app/example/id123456789",
      market: "en-US",
      cursor: "opaque-cursor"
    }),
    /only for Google Play/
  );
});

function rawReview(id, text) {
  return {
    id,
    userName: "Reviewer",
    date: new Date("2026-09-01T00:00:00.000Z"),
    score: 5,
    text,
    thumbsUp: 0
  };
}
