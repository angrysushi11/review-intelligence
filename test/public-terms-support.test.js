import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("Review Intel terms and support resolve on the canonical base path", async () => {
  const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
  const routes = new Map(config.routes.map(({ src, dest }) => [src, dest]));
  const sitemap = await readFile(new URL("web/sitemap.xml", root), "utf8");

  assert.equal(routes.get("/review-intel/terms/"), "/web/terms.html");
  assert.equal(routes.get("/review-intel/support/"), "/web/support.html");
  assert.equal(routes.get("/review-intel/styles.css"), "/web/styles.css");
  assert.match(sitemap, /https:\/\/www\.willthiseverwork\.com\/review-intel\/terms\//);
  assert.match(sitemap, /https:\/\/www\.willthiseverwork\.com\/review-intel\/support\//);
});

test("terms page states evidence limits and links both privacy policies", async () => {
  const terms = await readFile(new URL("web/terms.html", root), "utf8");
  const privacy = await readFile(new URL("web/privacy.html", root), "utf8");

  assert.match(terms, /<base href="\/review-intel\/">/);
  assert.match(terms, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel\/terms\/">/);
  assert.match(terms, /don’t establish demand, revenue, retention, causality/);
  assert.match(terms, /Review Intel retrieves and organizes publicly available App Store and Google Play reviews/);
  assert.match(terms, /Review Retriever processes a request to produce a response or download and has no review database or persistence layer in its application source\./);
  assert.match(privacy, /This covers Review Retriever on the free website and the public MCP server\. It does not cover the hosted prototype\./);
  assert.match(privacy, /For Review Retriever on the website and MCP server covered here, the application source contains no review database or persistence layer: a request is processed to produce its response\./);
  assert.doesNotMatch(privacy, /The app’s code has no review database or persistence layer/);
  assert.doesNotMatch(privacy, /No review database in the app\./);
  assert.match(terms, /href="privacy\/"[^>]*>privacy policy/);
  assert.match(terms, /href="extension\/privacy\/"[^>]*>extension privacy policy/);
  assert.match(terms, /support@willthiseverwork\.com/);
  assert.match(terms, /<script type="module" src="site\.js"><\/script>/);
  assert.doesNotMatch(terms, /googletagmanager|gtag\(/i);
});

test("support page links the public MCP route, setup guide, and safe troubleshooting details", async () => {
  const support = await readFile(new URL("web/support.html", root), "utf8");

  assert.match(support, /<base href="\/review-intel\/">/);
  assert.match(support, /https:\/\/www\.willthiseverwork\.com\/review-intel\/mcp/);
  assert.match(support, /href="setup\/"[^>]*>Setup guide/);
  assert.match(support, /support@willthiseverwork\.com/);
  assert.match(support, /Leave out passwords, store credentials, private exports and sensitive personal data/);
  assert.match(support, /source, country, sort order, review count and coverage/);
  assert.match(support, /data-copy-target="support-mcp-endpoint"/);
  assert.match(support, /<script type="module" src="site\.js"><\/script>/);
  assert.doesNotMatch(support, /googletagmanager|gtag\(/i);
});

test("every public HTML footer carries the legal identity, site policies, and privacy-safe tracker", async () => {
  const webDirectory = new URL("web/", root);
  const htmlFiles = (await readdir(webDirectory)).filter((name) => name.endsWith(".html"));
  const sources = await Promise.all(htmlFiles.map(async (name) => [name, await readFile(new URL(name, webDirectory), "utf8")]));

  assert.equal(htmlFiles.length, 11);
  for (const [name, html] of sources) {
    assert.match(html, /© 2026 IE Startup Factory/, `${name} should carry the exact legal identity`);
    assert.match(html, /src="footer-analytics\.js"/, `${name} should load the shared footer tracker`);
    assert.match(html, /href="\/terms\/" data-footer-control="site_terms"/, `${name} should link site terms`);
    assert.match(html, /href="\/privacy\/" data-footer-control="site_privacy"/, `${name} should link site privacy`);
    assert.match(html, /href="\/refunds\/" data-footer-control="site_refunds"/, `${name} should link refunds`);
    assert.doesNotMatch(
      html.replaceAll("Terms of Service", ""),
      /dasha|doubledash|dash@|tools@|ko-fi|consult|advis|audit|book a call|hire|done-for-you|service|willthiseverscale/i,
      `${name} should exclude personal, legacy-brand, and human-help promotion`,
    );
  }

  const visibleAppScript = await readFile(new URL("web/app.js", root), "utf8");
  assert.doesNotMatch(visibleAppScript, /doubledash|dash@|tools@|ko-fi|consult|advis|audit|book a call|hire|done-for-you|service|willthiseverscale/i);
});
