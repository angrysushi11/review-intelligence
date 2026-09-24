import assert from "node:assert/strict";
import test from "node:test";
import { createSearchHandler } from "../api/search.js";
import { normalizeAppleResults, normalizeGooglePlayResults, searchApps, validateSearchInput } from "../src/app-search.js";

const appleResults = [{
  trackId: 571800810,
  trackName: "Calm",
  artistName: "Calm.com, Inc.",
  artworkUrl512: "https://example.com/calm.png"
}];
const googleResults = [{
  appId: "com.calm.android",
  title: "Calm",
  developer: "Calm.com, Inc.",
  icon: "https://example.com/calm-play.png"
}];

test("search input requires a supported country and a concise term", () => {
  assert.deepEqual(validateSearchInput({ term: " Calm ", country: "US" }), { term: "Calm", country: "us" });
  assert.throws(() => validateSearchInput({ term: "c", country: "us" }), /2 to 60/);
  assert.throws(() => validateSearchInput({ term: "Calm", country: "zz" }), /supported two-letter/);
});

test("search normalizes both stores to safe canonical extractor links", async () => {
  let appleRequest;
  let googleRequest;
  const result = await searchApps({
    term: "Calm",
    country: "us",
    fetchImpl: async (url) => {
      appleRequest = new URL(url);
      return { ok: true, json: async () => ({ results: appleResults }) };
    },
    gplayClient: { search: async (input) => { googleRequest = input; return googleResults; } }
  });

  assert.equal(appleRequest.hostname, "itunes.apple.com");
  assert.equal(appleRequest.searchParams.get("entity"), "software");
  assert.equal(appleRequest.searchParams.get("limit"), "5");
  assert.deepEqual(googleRequest, { term: "Calm", num: 5, country: "us", lang: "en" });
  assert.deepEqual(result, {
    results: [
      { store: "app_store", id: "571800810", name: "Calm", developer: "Calm.com, Inc.", iconUrl: "https://example.com/calm.png", url: "https://apps.apple.com/us/app/id571800810" },
      { store: "google_play", id: "com.calm.android", name: "Calm", developer: "Calm.com, Inc.", iconUrl: "https://example.com/calm-play.png", url: "https://play.google.com/store/apps/details?id=com.calm.android&gl=us" }
    ],
    partial: false
  });
});

test("a failed store leaves the other store's results available and marks the response partial", async () => {
  const result = await searchApps({
    term: "Calm",
    country: "us",
    fetchImpl: async () => { throw new Error("Apple unavailable"); },
    gplayClient: { search: async () => googleResults }
  });

  assert.deepEqual(result.results, normalizeGooglePlayResults(googleResults, "us"));
  assert.equal(result.partial, true);
});

test("normalizers discard unusable records and non-HTTPS icons", () => {
  assert.deepEqual(normalizeAppleResults([{ trackId: 1, trackName: "App", artworkUrl512: "http://bad.test/icon.png" }, {}], "us"), [
    { store: "app_store", id: "1", name: "App", developer: "", iconUrl: "", url: "https://apps.apple.com/us/app/id1" }
  ]);
  assert.deepEqual(normalizeGooglePlayResults([{ appId: "com.example", title: "Example", icon: "javascript:alert(1)" }], "us"), [
    { store: "google_play", id: "com.example", name: "Example", developer: "", iconUrl: "", url: "https://play.google.com/store/apps/details?id=com.example&gl=us" }
  ]);
});

test("the Vercel endpoint validates before calling either upstream and caches successful queries", async () => {
  const calls = [];
  const handler = createSearchHandler({
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: appleResults }) }),
    loadGooglePlayScraperImpl: async () => ({ search: async () => googleResults })
  });
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler({ method: "GET", query: { term: "Calm", country: "us" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "public, s-maxage=3600");
  assert.equal(response.body.results.length, 2);

  const invalid = { ...response, headers: {}, statusCode: undefined, body: undefined };
  await handler({ method: "GET", query: { term: "x", country: "us" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.body.error, /2 to 60/);
  assert.equal(calls.length, 0);
});
