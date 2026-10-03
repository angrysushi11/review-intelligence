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
  assert.match(html, /<p class="ri-lede">Paste or upload the reviews\.<\/p>/);
  assert.match(html, /Saved example, 450 Google Play reviews/i);
  assert.match(html, /86 of 450 reviews \(19%\).*65 are 1★/i);
  assert.match(html, /This is an activation and trust hypothesis, not proof of conversion or churn impact/i);
  assert.match(html, /Every read also counts the reviews supplied, parsed, excluded and analyzed\./);
  assert.match(html, /Supplied reviews only\./);
  assert.match(html, /No live requests, no server\./);
  assert.match(html, /This describes the skills-only OpenAI package\./);
  assert.match(html, /separate GitHub package for Codex also includes Review Intel’s public read-only MCP connection/i);
  assert.match(html, /Review Intel collects up to 500, free\./);
  assert.match(html, /class="ri-statement"/);
  assert.match(html, /class="ri-quietlinks"/);
  assert.doesNotMatch(html, /ri-evidence-list|ri-boundary/);
  assert.match(html, /href="plugin-privacy\/"/);
  assert.match(html, /href="plugin-terms\/"/);
  assert.match(html, /href="plugin-support\/"/);
  assert.doesNotMatch(html, /install now|available in the plugin directory|published/i);
});

test("plugin privacy covers categories, purpose, recipients, retention, controls, and contact", async () => {
  const html = await readFile(new URL(pages.privacy, root), "utf8");

  assert.match(html, /review text, ratings, dates, app versions, developer replies/i);
  assert.match(html, /To parse and organize the reviews, find evidence-backed patterns/i);
  assert.match(html, /OpenAI host processes what it needs to run the chat/i);
  assert.match(html, /under the product, account and workspace settings/i);
  assert.match(html, /skills-only package makes no outbound request to DoubleDash/i);
  assert.match(html, /skills-only package creates no DoubleDash-held copy of its inputs or results/i);
  assert.match(html, /This policy covers the skills-only OpenAI package/i);
  assert.match(html, /separate GitHub package for Codex includes Review Intel’s public read-only MCP connection/i);
  assert.match(html, /period depends on the product, your account or workspace, your settings and actions/i);
  assert.match(html, /help\.openai\.com\/en\/articles\/8983778-chat-and-file-retention-policies-in-chatgpt/);
  assert.match(html, /help\.openai\.com\/en\/articles\/7730893-data-controls-in-chatgpt/);
  assert.match(html, /tools@doubledash\.me/);
  assert.match(html, /Anything you put in that email reaches DoubleDash through a separate support channel/i);
  assert.match(html, /don’t attach a review export or include personal, confidential or sensitive review data/i);
  assert.match(html, /<script type="module" src="site\.js"><\/script>/);
  assert.doesNotMatch(html, /googletagmanager|gtag\(/i);
});

test("plugin terms and support distinguish the skills-only package from the Codex MCP package", async () => {
  const [terms, support] = await Promise.all([
    readFile(new URL(pages.terms, root), "utf8"),
    readFile(new URL(pages.support, root), "utf8"),
  ]);

  assert.match(terms, /skills-only Review Intelligence package/i);
  assert.match(terms, /makes no live requests and connects to no DoubleDash server/i);
  assert.match(terms, /separate GitHub package for Codex also includes Review Intel’s public read-only MCP connection/i);
  assert.match(terms, /don’t by themselves establish demand, revenue, retention, conversion, causality/i);
  assert.match(support, /Paste review text or upload an export/i);
  assert.match(support, /skills-only package makes no live requests and connects to no DoubleDash server/i);
  assert.match(support, /separate GitHub package for Codex includes Review Intel’s public read-only MCP connection/i);
  assert.match(support, /Don’t include review exports or sensitive data/i);
  assert.match(support, /href="plugin-privacy\/"/);
  const privacy = await readFile(new URL(pages.privacy, root), "utf8");
  const allPages = `${await readFile(new URL(pages.plugin, root), "utf8")}\n${privacy}\n${terms}\n${support}`;
  assert.match(allPages, /<header class="ri-header">/);
  assert.match(allPages, /<footer class="ri-footer ri-root"/);
  assert.match(allPages, /href="privacy\/"/);
  assert.match(allPages, /href="terms\/"/);
  assert.match(allPages, /href="support\/"/);
  assert.doesNotMatch(`${terms}\n${support}`, /googletagmanager|gtag\(/i);
});
