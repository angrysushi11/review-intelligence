import assert from "node:assert/strict";
import test from "node:test";
import { initializeReviewAnalytics, resolveInternalTraffic, sanitizeAnalyticsLabel, sanitizeAnalyticsSource, isProductionHost, trackReviewEvent } from "../web/analytics.js";
import { FOOTER_CONTROL_IDS, isFooterAnalyticsHost, normalizeFooterControl, trackFooterControl } from "../web/footer-analytics.js";

const origin = "https://www.willthiseverwork.com";

function analyticsWindow(href, { stored, cookie = "", storageError = false } = {}) {
  const url = new URL(href);
  const calls = [];
  const storage = new Map(stored === "1" ? [["wtew_internal", "1"]] : []);
  const document = {
    cookie,
    referrer: "https://search.example/path?private=1",
    createElement: () => ({}),
    head: { append() {} },
    addEventListener() {},
  };
  const windowObject = {
    location: { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash, hostname: url.hostname, protocol: url.protocol },
    document,
    localStorage: {
      getItem(key) { if (storageError) throw new Error("blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (storageError) throw new Error("blocked"); storage.set(key, value); },
      removeItem(key) { if (storageError) throw new Error("blocked"); storage.delete(key); },
    },
    history: { state: { kept: true }, replaceState(state, unused, value) { this.state = state; this.replaced = value; } },
    dataLayer: calls,
  };
  return { windowObject, calls, storage, document };
}

test("internal traffic override persists safely, strips itself, and sends the first hit as internal", () => {
  const { windowObject, calls, storage, document } = analyticsWindow("https://www.willthiseverwork.com/review-intel/?utm_source=threads&wtew_internal=1#report");
  initializeReviewAnalytics(windowObject, document);
  assert.equal(storage.get("wtew_internal"), "1");
  assert.match(document.cookie, /wtew_internal=1; Path=\/; Max-Age=63072000; SameSite=Lax; Secure/);
  assert.equal(windowObject.history.replaced, "/review-intel/?utm_source=threads#report");
  assert.deepEqual(calls.map((call) => Array.from(call).slice(0, 2)), [["js", calls[0][1]], ["set", { traffic_type: "internal" }], ["config", "G-R8F1QX6HKC"], ["event", "page_view"]]);
  assert.deepEqual(calls[2][2], { page_location: "https://www.willthiseverwork.com/review-intel/", page_referrer: "https://search.example/", campaign_source: "threads", send_page_view: false, traffic_type: "internal" });
  assert.deepEqual(calls[3][2], { page_location: "https://www.willthiseverwork.com/review-intel/", page_referrer: "https://search.example/", campaign_source: "threads" });
  initializeReviewAnalytics(windowObject, document);
  assert.equal(calls.length, 4, "site and footer imports share one loader, config, and page view");
});

test("internal state reads either store and query zero immediately disables it even when storage is unavailable", () => {
  const fromCookie = analyticsWindow("https://www.willthiseverwork.com/review-intel/", { cookie: "x=1; wtew_internal=1" });
  assert.equal(resolveInternalTraffic(fromCookie.windowObject), true);
  const disabled = analyticsWindow("https://www.willthiseverwork.com/review-intel/?wtew_internal=0&utm_medium=social#x", { stored: "1", storageError: true });
  assert.equal(resolveInternalTraffic(disabled.windowObject), false);
  assert.equal(disabled.windowObject.history.replaced, "/review-intel/?utm_medium=social#x");
  assert.match(disabled.document.cookie, /wtew_internal=; Path=\/; Max-Age=0; SameSite=Lax; Secure/);
});

test("analytics has no preview hit and leaves ordinary unflagged visits unmarked", () => {
  const preview = analyticsWindow("https://review-intel-preview.vercel.app/review-intel/?wtew_internal=1");
  assert.equal(initializeReviewAnalytics(preview.windowObject, preview.document), null);
  assert.equal(preview.calls.length, 0);
  const clean = analyticsWindow("https://www.willthiseverwork.com/review-intel/?ga_debug=1");
  initializeReviewAnalytics(clean.windowObject, clean.document);
  assert.equal(clean.calls.some((call) => call[0] === "set"), false);
  assert.deepEqual(clean.calls[1][2], { page_location: "https://www.willthiseverwork.com/review-intel/", page_referrer: "https://search.example/", debug_mode: true, send_page_view: false });
  assert.deepEqual(clean.calls[2][2], { page_location: "https://www.willthiseverwork.com/review-intel/", page_referrer: "https://search.example/", debug_mode: true });
});

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
  const previousDocument = globalThis.document;
  try {
    for (const hostname of ["localhost", "127.0.0.1", "review-retriever.vercel.app", "preview.vercel.app"]) {
      globalThis.window = { location: { hostname, pathname: "/review-intel/" } };
      assert.equal(isProductionHost(hostname), false);
      trackReviewEvent("review_control_click", { control_id: "header-source" });
      assert.equal(window.dataLayer, undefined);
    }
    globalThis.document = { cookie: "", referrer: "", createElement: () => ({}), head: { append() {} }, addEventListener() {} };
    globalThis.window = { location: { hostname: "www.willthiseverwork.com", pathname: "/review-intel/setup/", origin: "https://www.willthiseverwork.com", href: "https://www.willthiseverwork.com/review-intel/setup/" }, history: { state: null, replaceState() {} } };
    trackReviewEvent("review_setup_copy", { control_id: "setup-endpoint-copy", outcome: "success" });
    assert.equal(window.dataLayer.at(-1)[1], "review_setup_copy");
    assert.deepEqual(window.dataLayer.at(-1)[2], { page_path: "/review-intel/setup/", control_id: "setup-endpoint-copy", outcome: "success" });
  } finally { globalThis.window = previous; globalThis.document = previousDocument; }
});

test("footer policy tracking uses a fixed production-only control allowlist", () => {
  assert.deepEqual(FOOTER_CONTROL_IDS, ["site_terms", "site_privacy", "site_refunds"]);
  assert.equal(isFooterAnalyticsHost("www.willthiseverwork.com"), true);
  assert.equal(isFooterAnalyticsHost("willthiseverwork.com"), true);
  assert.equal(isFooterAnalyticsHost("review-retriever-preview.vercel.app"), false);
  assert.equal(isFooterAnalyticsHost("localhost"), false);
  assert.equal(normalizeFooterControl("site_terms"), "site_terms");
  assert.equal(normalizeFooterControl("site_terms?email=private@example.com"), "");

  const calls = [];
  const gtag = (...args) => calls.push(args);
  assert.equal(trackFooterControl(gtag, "site_privacy"), true);
  assert.equal(trackFooterControl(gtag, "unknown"), false);
  assert.deepEqual(calls, [["event", "footer_click", { control: "site_privacy" }]]);
});
