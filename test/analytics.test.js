import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAnalyticsLabel, sanitizeAnalyticsSource } from "../web/analytics.js";

const origin = "https://www.willthiseverwork.com";

test("analytics sources never retain query strings, fragments, or external paths", () => {
  assert.equal(sanitizeAnalyticsSource("", origin), "");
  assert.equal(
    sanitizeAnalyticsSource("/work/review-intel/?email=private@example.com#result", origin),
    "/work/review-intel/"
  );
  assert.equal(
    sanitizeAnalyticsSource("https://www.willthiseverwork.com/review-intel/?app_url=private#result", origin),
    "/review-intel/"
  );
  assert.equal(
    sanitizeAnalyticsSource("https://partner.example/path/to/user?email=private@example.com#profile", origin),
    "partner.example"
  );
  assert.equal(sanitizeAnalyticsSource("newsletter?email=private@example.com#profile", origin), "newsletter");
});

test("analytics route and cluster labels are bounded slugs", () => {
  assert.equal(sanitizeAnalyticsLabel("Review Intelligence?email=private@example.com"), "review-intelligence");
  assert.equal(sanitizeAnalyticsLabel("review/aso#private"), "review/aso");
  assert.equal(sanitizeAnalyticsLabel(""), "");
  assert.equal(sanitizeAnalyticsLabel("x".repeat(200)).length, 80);
});
