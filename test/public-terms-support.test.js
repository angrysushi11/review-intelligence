import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

  assert.match(terms, /<base href="\/review-intel\/">/);
  assert.match(terms, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel\/terms\/">/);
  assert.match(terms, /do not establish demand, revenue, retention, causality/);
  assert.match(terms, /Review Intel is a DoubleDash tool/);
  assert.match(terms, /no review database or persistence layer in its application source/i);
  assert.match(terms, /href="privacy\/">Review Intel privacy policy/);
  assert.match(terms, /href="extension\/privacy\/">extension-specific privacy policy/);
  assert.match(terms, /tools@doubledash\.me/);
  assert.doesNotMatch(terms, /googletagmanager|gtag\(/i);
});

test("support page links the public MCP route, setup guide, and safe troubleshooting details", async () => {
  const support = await readFile(new URL("web/support.html", root), "utf8");

  assert.match(support, /<base href="\/review-intel\/">/);
  assert.match(support, /https:\/\/www\.willthiseverwork\.com\/review-intel\/mcp/);
  assert.match(support, /href="setup\/">MCP setup guide/);
  assert.match(support, /tools@doubledash\.me/);
  assert.match(support, /Do not send passwords, store credentials, private exports, or sensitive personal data/);
  assert.match(support, /source, country, sort order, review count, and coverage/);
  assert.doesNotMatch(support, /googletagmanager|gtag\(/i);
});
