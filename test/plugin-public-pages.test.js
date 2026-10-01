import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const pages = {
  plugin: "web/plugin.html",
  privacy: "web/plugin-privacy.html",
  terms: "web/plugin-terms.html",
  support: "web/plugin-support.html",
};

test("the skills-only plugin pages have exact canonical routes and sitemap entries", async () => {
  const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
  const routes = new Map(config.routes.map(({ src, dest }) => [src, dest]));
  const sitemap = await readFile(new URL("web/sitemap.xml", root), "utf8");

  for (const [route, destination] of [
    ["/review-intel/plugin/", "/web/plugin.html"],
    ["/review-intel/plugin-privacy/", "/web/plugin-privacy.html"],
    ["/review-intel/plugin-terms/", "/web/plugin-terms.html"],
    ["/review-intel/plugin-support/", "/web/plugin-support.html"],
  ]) {
    assert.equal(routes.get(route), destination);
    assert.match(sitemap, new RegExp(`https://www\\.willthiseverwork\\.com${route}`));

    const slashless = config.routes.find((candidate) => candidate.src === route.slice(0, -1) && candidate.status === 308 && !candidate.has);
    assert.equal(slashless?.headers?.Location, `https://www.willthiseverwork.com${route}`);
  }
});

test("plugin landing page describes the supplied-export flow without a publication claim", async () => {
  const html = await readFile(new URL(pages.plugin, root), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel\/plugin\/">/);
  assert.match(html, /app-review exports you paste or upload in ChatGPT or Codex/i);
  assert.match(html, /what is worth investigating or testing next/i);
  assert.match(html, /product friction and unmet needs/i);
  assert.match(html, /pricing, subscriptions, paywalls, billing, and cancellation/i);
  assert.match(html, /positioning, ASO, and creative directions/i);
  assert.match(html, /support failures, recovery, and trust concerns/i);
  assert.match(html, /supplied, parsed, excluded, and analyzed/i);
  assert.match(html, /Percentages use the analyzed denominator/i);
  assert.match(html, /stable review IDs/i);
  assert.match(html, /performs no live retrieval or DoubleDash server connection/i);
  assert.match(html, /href="plugin-privacy\/"/);
  assert.match(html, /href="plugin-terms\/"/);
  assert.match(html, /href="plugin-support\/"/);
  assert.doesNotMatch(html, /install now|available in the plugin directory|published/i);
});

test("plugin privacy covers categories, purpose, recipients, retention, controls, and contact", async () => {
  const html = await readFile(new URL(pages.privacy, root), "utf8");

  assert.match(html, /review text, ratings, dates, app versions, developer replies/i);
  assert.match(html, /used to parse and organize reviews, identify evidence-backed patterns/i);
  assert.match(html, /selected OpenAI host processes the content/i);
  assert.match(html, /according to the product, account, and workspace settings/i);
  assert.match(html, /plugin makes no outbound request to DoubleDash/i);
  assert.match(html, /plugin creates no DoubleDash-held copy of its inputs or results/i);
  assert.match(html, /applicable period depends on the product, account or workspace, settings, and actions/i);
  assert.match(html, /help\.openai\.com\/en\/articles\/8983778-chat-and-file-retention-policies-in-chatgpt/);
  assert.match(html, /help\.openai\.com\/en\/articles\/7730893-data-controls-in-chatgpt/);
  assert.match(html, /tools@doubledash\.me/);
  assert.match(html, /voluntarily include in that email are received by DoubleDash through a separate support channel/i);
  assert.match(html, /Do not attach a review export or include personal, confidential, or sensitive review data/i);
  assert.doesNotMatch(html, /googletagmanager|gtag\(/i);
});

test("plugin terms and support stay within the skills-only boundary", async () => {
  const [terms, support] = await Promise.all([
    readFile(new URL(pages.terms, root), "utf8"),
    readFile(new URL(pages.support, root), "utf8"),
  ]);

  assert.match(terms, /skills-only plugin/i);
  assert.match(terms, /performs no live retrieval or DoubleDash server connection/i);
  assert.match(terms, /do not by themselves establish demand, revenue, retention, conversion, causality/i);
  assert.match(support, /Paste review text or upload a review export/i);
  assert.match(support, /performs no live retrieval or DoubleDash server connection/i);
  assert.match(support, /Do not attach the review export/i);
  assert.match(support, /href="plugin-privacy\/"/);
  const privacy = await readFile(new URL(pages.privacy, root), "utf8");
  assert.doesNotMatch(`${await readFile(new URL(pages.plugin, root), "utf8")}\n${privacy}\n${terms}\n${support}`, /<a[^>]+href="(?:\/review-intel\/|privacy\/|terms\/|support\/)"/i);
  assert.doesNotMatch(`${terms}\n${support}`, /googletagmanager|gtag\(/i);
});
