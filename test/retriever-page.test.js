import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDataset } from "../src/app-store.js";

const webUrl = new URL("../web/", import.meta.url);

test("the homepage uses the approved paper-and-ink retriever flow", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const styles = await readFile(new URL("styles.css", webUrl), "utf8");
  const tokens = await readFile(new URL("tokens.css", webUrl), "utf8");
  const appJs = await readFile(new URL("app.js", webUrl), "utf8");

  assert.match(html, /id="state-idle"/);
  assert.match(html, /id="state-done" hidden/);
  assert.doesNotMatch(html, /<div class="pencil">app review export<\/div>/);
  assert.doesNotMatch(html, /class="lede"/);
  assert.match(html, /Export the reviews\./);
  assert.match(html, /Open them in the GPT or Claude workflow\./);
  assert.match(html, /Decide something with what people actually said\./);
  assert.ok(html.indexOf('<form class="tool-frame" id="extract-form"') < html.indexOf('<ol class="steps">'));
  assert.match(html, /id="app-url"[^>]*autofocus/);
  assert.match(html, /class="field-wrap"/);
  assert.match(html, /class="form-nudge form-nudge--url"[^>]*>[\s\S]*?paste the app URL here/);
  assert.match(html, /class="form-nudge form-nudge--country"[^>]*>[\s\S]*?choose the country here/);
  assert.match(html, /press here to extract<br>the reviews/);
  assert.match(html, /class="baseline"[^>]*preserveAspectRatio="none"/);
  assert.match(html, /class="baseline"[\s\S]*?vector-effect="non-scaling-stroke"/);
  assert.match(html, /id="form-error"[^>]*hidden>that doesn't look like a store link/);
  assert.match(html, /the reviews are the easy part —/);
  assert.match(html, /<header class="result-masthead">[\s\S]*?<h1 class="title">Review Retriever<\/h1>/);
  assert.match(html, /review packet ready/);
  assert.match(html, /id="app-icon"[^>]*referrerpolicy="no-referrer"[^>]*hidden/);
  assert.match(html, /id="packet-title"/);
  assert.match(html, /copy or download the<br>extracted reviews here/);
  assert.match(html, /id="packet-ledger"/);
  assert.match(html, /id="download-btn"[^>]*>Download\.md<\/button>/);
  assert.match(html, /id="evidence-title">evidence preview<\/h2>/);
  assert.match(html, /id="packet-ledger"><\/dl>\s*<section class="evidence"/);
  assert.doesNotMatch(html, /Actual review text pulled/);
  assert.doesNotMatch(html, /not analysis yet/);
  assert.match(html, /class="card card--primary" id="gpt-analysis-link"/);
  assert.match(html, />Analyze with ChatGPT<\/span>/);
  assert.match(html, />Analyze in Claude<\/span>/);
  assert.match(html, /id="claude-steps" hidden/);
  assert.match(html, /Open Claude Skills, click <strong>Add<\/strong>, choose <strong>Upload a skill<\/strong>/);
  assert.match(html, /class="card claude-action" id="claude-skill-download"/);
  assert.match(html, /class="card claude-action" id="claude-skills-link"/);
  assert.match(html, /public reviews only · nothing stored/);
  assert.equal((html.match(/href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/mcp\/">Use it in Claude Cowork or Codex<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/<span class="hand">for power users<\/span>/g) ?? []).length, 2);
  assert.match(html, /family=Caveat:wght@400\.\.700/);
  assert.doesNotMatch(html, /class="action-dock"/);
  assert.doesNotMatch(html, /id="claude-skill-modal"/);
  assert.doesNotMatch(html, /Three ways to use it/);
  assert.doesNotMatch(html, /Codex \/ Work/);

  assert.match(styles, /@import url\("\/tokens\.css"\)/);
  assert.match(tokens, /--paper:\s*#f7f4ec/);
  assert.match(tokens, /--well:\s*#efe9da/);
  assert.match(tokens, /--well-focus:\s*#fbf9f3/);
  assert.match(tokens, /--pen:\s*#3a6b5c/);
  assert.match(styles, /font-family:\s*var\(--font-display\)/);
  assert.match(styles, /\.tool-frame::before\s*\{/);
  assert.match(styles, /\.tool-frame\s*\{[^}]*padding:\s*22px 16px 18px/s);
  assert.match(styles, /\.form-nudge\s*\{[^}]*flex-direction:\s*column[^}]*font-size:\s*35px/s);
  assert.match(styles, /\.form-nudge span\s*\{[^}]*background:\s*var\(--paper\)/s);
  assert.match(styles, /label\.field-label\s*\{[^}]*font-family:\s*var\(--font-ui\)[^}]*font-style:\s*normal/s);
  assert.match(styles, /\.fld\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--well\) 88%, var\(--paper\)\)[^}]*font-size:\s*18px/s);
  assert.match(styles, /\.field-wrap:focus-within \.baseline path\s*\{[^}]*stroke:\s*var\(--pen\)[^}]*stroke-width:\s*2\.8/s);
  assert.match(styles, /\.drawn svg path\s*\{[^}]*fill:\s*var\(--ink\)[^}]*stroke:\s*var\(--ink\)/s);
  assert.match(styles, /\.packet-ledger\s*\{/);
  assert.match(styles, /\.packet::before\s*\{/);
  assert.match(tokens, /--font-ui:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif/);
  assert.doesNotMatch(tokens, /--font-mono/);
  assert.match(styles, /\.app-icon\s*\{[^}]*object-fit:\s*cover/s);
  assert.match(styles, /\.export-nudge\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(styles, /\.packet-title\s*\{[^}]*font-family:\s*var\(--font-ui\)[^}]*font-size:\s*clamp\(23px, 4\.2vw, 29px\)/s);
  assert.match(styles, /\.packet-ledger dd\s*\{[^}]*font-family:\s*var\(--font-ui\)[^}]*font-size:\s*15\.5px/s);
  assert.match(styles, /\.evidence\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*border-top:\s*1px solid var\(--rule\)/s);
  assert.match(styles, /\.review-card__text\s*\{[^}]*font-size:\s*16\.5px/s);
  assert.match(styles, /\.card--primary svg path\s*\{[^}]*fill:\s*var\(--ink\)[^}]*stroke:\s*var\(--ink\)/s);
  assert.match(styles, /\.claude-action\s*\{[^}]*min-height:\s*58px/s);
  assert.match(styles, /\.packet-ledger\s*\{\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.review-card\s*\{/);
  assert.match(styles, /\.busy\s*\{[^}]*opacity:\s*0\.58[^}]*pointer-events:\s*none/s);
  assert.match(styles, /@media \(min-width:\s*40rem\)/);

  assert.ok(appJs.includes("const STORE_LINK_PATTERN = /apps\\.apple\\.com|itunes\\.apple\\.com|play\\.google\\.com/i;"));
  assert.match(appJs, /fetch\("\/api\/extract"/);
  assert.match(appJs, /limit:\s*500/);
  assert.match(appJs, /Extracting…/);
  assert.match(appJs, /couldn't reach the store — try again in a minute/);
  assert.match(appJs, /link\.download = currentFilename/);
  assert.match(appJs, /function renderPacket/);
  assert.match(appJs, /iconUrl:\s*safeImageUrl\(dataset\.app_icon_url\)/);
  assert.match(appJs, /function renderAppIcon/);
  assert.match(appJs, /url\.protocol === "https:"/);
  assert.doesNotMatch(appJs, /The Markdown packet is ready for GPT, Claude, Codex, or your own analysis/);
  assert.match(appJs, /Visible App Store review cards/i);
  assert.match(appJs, /function ratingMix/);
  assert.match(appJs, /1600/);
  assert.match(appJs, /claudeSteps\.hidden = !willOpen/);
  assert.doesNotMatch(appJs, /extractButton\.disabled/);
});

test("the normalized review dataset exposes store artwork for the result packet", () => {
  const dataset = buildDataset({
    appName: "Example App",
    appId: "123456789",
    country: "us",
    reviews: [],
    metadata: { iconUrl: "https://example.com/icon.png" }
  });

  assert.equal(dataset.app_icon_url, "https://example.com/icon.png");
});

test("the retired local setup page forwards to the canonical MCP guide", async () => {
  const html = await readFile(new URL("setup.html", webUrl), "utf8");

  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /http-equiv="refresh" content="0; url=https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/mcp\/"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/mcp\/">/);
  assert.match(html, /Review Retriever MCP setup guide/);
  assert.doesNotMatch(html, /setup\.css|setup\.js|manual-export/);
});

test("the setup bridge and retriever assets are published explicitly", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = new Map(config.routes.map(({ src, dest }) => [src, dest]));

  assert.equal(routes.get("/setup/?"), "/web/setup.html");
  assert.equal(routes.has("/setup.css"), false);
  assert.equal(routes.has("/setup.js"), false);
  assert.equal(routes.get("/tokens.css"), "/web/tokens.css");
  assert.equal(routes.get("/"), "/web/index.html");
});
