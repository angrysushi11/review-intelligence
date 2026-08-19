import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webUrl = new URL("../web/", import.meta.url);

test("the homepage uses the approved paper-and-ink retriever flow", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const styles = await readFile(new URL("styles.css", webUrl), "utf8");
  const tokens = await readFile(new URL("tokens.css", webUrl), "utf8");
  const appJs = await readFile(new URL("app.js", webUrl), "utf8");

  assert.match(html, /id="state-idle"/);
  assert.match(html, /id="state-done" hidden/);
  assert.match(html, /<div class="pencil">app review export<\/div>/);
  assert.match(html, /Paste an App Store or Google Play link\. Get up to 500 public written reviews, ready to analyze\./);
  assert.match(html, /Export the reviews\./);
  assert.match(html, /Open them in the GPT or Claude workflow\./);
  assert.match(html, /Decide something with what people actually said\./);
  assert.ok(html.indexOf('<form class="tool-frame" id="extract-form"') < html.indexOf('<ol class="steps">'));
  assert.match(html, /id="app-url"[^>]*autofocus/);
  assert.match(html, /class="field-wrap"/);
  assert.match(html, /class="baseline"[^>]*preserveAspectRatio="none"/);
  assert.match(html, /class="baseline"[\s\S]*?vector-effect="non-scaling-stroke"/);
  assert.match(html, /id="form-error"[^>]*hidden>that doesn't look like a store link/);
  assert.match(html, /the reviews are the easy part —/);
  assert.match(html, /<header class="result-masthead">[\s\S]*?<h1 class="title">Review Retriever<\/h1>/);
  assert.match(html, /review packet ready/);
  assert.match(html, /id="packet-title"/);
  assert.match(html, /id="packet-ledger"/);
  assert.match(html, /id="download-btn"[^>]*>Download\.md<\/button>/);
  assert.match(html, /id="evidence-title">evidence preview<\/h2>/);
  assert.doesNotMatch(html, /Actual review text pulled/);
  assert.doesNotMatch(html, /not analysis yet/);
  assert.match(html, /class="card card--primary" id="gpt-analysis-link"/);
  assert.match(html, />Analyze with ChatGPT<\/span>/);
  assert.match(html, />Analyze in Claude<\/span>/);
  assert.match(html, /id="claude-steps" hidden/);
  assert.match(html, /public reviews only · nothing stored/);
  assert.equal((html.match(/href="\/setup">Claude \/ Codex setup<\/a>/g) ?? []).length, 2);
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
  assert.match(styles, /\.fld\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--well\) 88%, var\(--paper\)\)[^}]*font-size:\s*18px/s);
  assert.match(styles, /\.field-wrap:focus-within \.baseline path\s*\{[^}]*stroke:\s*var\(--pen\)[^}]*stroke-width:\s*2\.8/s);
  assert.match(styles, /\.drawn svg path\s*\{[^}]*fill:\s*var\(--ink\)[^}]*stroke:\s*var\(--ink\)/s);
  assert.match(styles, /\.packet-ledger\s*\{/);
  assert.match(styles, /\.packet::before\s*\{/);
  assert.match(styles, /\.packet-title\s*\{[^}]*font-size:\s*clamp\(31px, 4\.8vw, 38px\)/s);
  assert.match(styles, /\.packet-ledger dd\s*\{[^}]*font-size:\s*16\.5px/s);
  assert.match(styles, /\.review-card__text\s*\{[^}]*font-size:\s*16\.5px/s);
  assert.match(styles, /\.card--primary svg path\s*\{[^}]*fill:\s*var\(--ink\)[^}]*stroke:\s*var\(--ink\)/s);
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
  assert.doesNotMatch(appJs, /The Markdown packet is ready for GPT, Claude, Codex, or your own analysis/);
  assert.match(appJs, /Visible App Store review cards/i);
  assert.match(appJs, /function ratingMix/);
  assert.match(appJs, /1600/);
  assert.match(appJs, /claudeSteps\.hidden = !willOpen/);
  assert.doesNotMatch(appJs, /extractButton\.disabled/);
});

test("the instruction-heavy version is preserved at the setup page", async () => {
  const html = await readFile(new URL("setup.html", webUrl), "utf8");
  const styles = await readFile(new URL("setup.css", webUrl), "utf8");
  const appJs = await readFile(new URL("setup.js", webUrl), "utf8");

  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/reviews\.doubledash\.me\/setup">/);
  assert.match(html, /href="\/setup\.css"/);
  assert.match(html, /src="\/setup\.js"/);
  assert.match(html, /<h2 id="route-title" class="section-title">Three ways to use it<\/h2>/);
  assert.match(html, /<p class="route-label">Custom GPT<\/p>/);
  assert.match(html, /<p class="route-label">Claude<\/p>/);
  assert.match(html, /Add → Upload a skill/);
  assert.match(html, /Leave the optional OAuth client fields empty/);
  assert.match(html, /<p class="route-label">Codex \/ Work<\/p>/);
  assert.match(html, /codex plugin marketplace add angrysushi11\/review-intelligence --ref main/);
  assert.match(html, /github\.com\/angrysushi11\/review-intelligence\/tree\/main\/plugins\/review-intelligence/);
  assert.match(html, /codex plugin add review-intelligence@doubledash/);
  assert.match(styles, /\.route-card\s*\{/);
  assert.match(appJs, /tool: "codex_plugin"/);
});

test("the setup route and archived assets are published explicitly", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = new Map(config.routes.map(({ src, dest }) => [src, dest]));

  assert.equal(routes.get("/setup/?"), "/web/setup.html");
  assert.equal(routes.get("/setup.css"), "/web/setup.css");
  assert.equal(routes.get("/setup.js"), "/web/setup.js");
  assert.equal(routes.get("/tokens.css"), "/web/tokens.css");
  assert.equal(routes.get("/"), "/web/index.html");
});
