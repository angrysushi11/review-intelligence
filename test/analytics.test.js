import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAnalyticsLabel, sanitizeAnalyticsSource, isProductionHost, trackReviewEvent } from "../web/analytics.js";

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

test("shared interaction tracking is silent on local and preview hosts", () => {
  const previous = globalThis.window;
  try {
    for (const hostname of ["localhost", "127.0.0.1", "review-retriever.vercel.app", "preview.vercel.app"]) {
      globalThis.window = { location: { hostname, pathname: "/review-intel/" } };
      assert.equal(isProductionHost(hostname), false);
      trackReviewEvent("review_control_click", { control_id: "header-source" });
      assert.equal(window.dataLayer, undefined);
    }
    globalThis.window = { location: { hostname: "www.willthiseverwork.com", pathname: "/review-intel/setup/" } };
    trackReviewEvent("review_setup_copy", { control_id: "setup-endpoint-copy", outcome: "success" });
    assert.equal(window.dataLayer.length, 1);
    assert.equal(window.dataLayer[0][1], "review_setup_copy");
    assert.deepEqual(window.dataLayer[0][2], { page_path: "/review-intel/setup/", control_id: "setup-endpoint-copy", outcome: "success" });
  } finally { globalThis.window = previous; }
});
