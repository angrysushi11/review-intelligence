import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
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
  assert.match(html, /Retrieve the reviews\./);
  assert.match(html, /Ask what users love, hate, or expected\./);
  assert.match(html, /Turn the evidence into a product or growth decision\./);
  assert.ok(html.indexOf('<form class="tool-frame" id="extract-form"') < html.indexOf('<ol class="steps">'));
  assert.match(html, /<title>Export &amp; Analyze App Reviews \| Review Retriever<\/title>/);
  assert.match(html, /name="description" content="Export public App Store and Google Play reviews, discover what users love and hate, and capture the exact language they use\."/);
  assert.match(html, /<article class="retrieval-guide" aria-labelledby="retrieval-guide-title">/);
  assert.match(html, /<p class="pencil hero-kicker">Review Retriever<\/p>/);
  assert.match(html, /<h1 class="title title--hero">Export app reviews\. Find what users really think\.<\/h1>/);
  assert.match(html, /Paste an App Store or Google Play link\. Get up to 500 public reviews—no store login needed—then uncover what people love, what frustrates them, and what they expected instead\./);
  const hero = html.match(/<header class="hero">([\s\S]*?)<\/header>/)?.[1] ?? "";
  assert.doesNotMatch(hero, /\b(?:MCP|Claude|Codex|batches|continuation cursor)\b/i);
  assert.match(html, /id="retrieval-status" role="status" aria-live="polite"/);
  assert.ok(html.indexOf('<ol class="steps">') < html.indexOf('<article class="retrieval-guide"'));
  assert.match(html, /<a class="power-user-jump" href="#power-users">[\s\S]*?for power users[\s\S]*?Use it in Claude Cowork or Codex[\s\S]*?↓/);
  assert.match(html, /<section class="guide-power" id="power-users" aria-labelledby="guide-power-title">/);
  assert.ok(html.indexOf('class="power-user-jump"') < html.indexOf('<article class="retrieval-guide"'));
  assert.ok(html.indexOf('<article class="retrieval-guide"') < html.indexOf('<hr class="rule">'));
  assert.match(html, /Turn app reviews into answers you can use/);
  assert.match(html, /Review Retriever collects the public evidence\. Review Intelligence helps you question it/);
  assert.match(html, /Ask questions that reviews can answer/);
  assert.match(html, /What do users hate most\?/);
  assert.match(html, /<section class="guide-proof" aria-labelledby="guide-proof-title">/);
  assert.match(html, /What a finished theme looks like/);
  assert.match(html, /Cancellation trust gap/);
  assert.match(html, /Twenty-three reviews, four different phrasings, one problem/);
  assert.match(html, /Every theme cites the reviews it came from/);
  assert.match(html, /See the full worked example/);
  assert.match(html, /Connect Review Intelligence to Claude Cowork or Codex/);
  assert.match(html, /The MCP returns up to 500 per response and provides a continuation cursor for Google Play/);
  assert.match(html, /No public-source route can promise every review ever posted/);
  assert.match(html, /Reviews are not a live user interview/);
  assert.match(html, /It does not currently export CSV, Excel, or JSON from this page/);
  assert.match(html, /href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/mcp\/">Connect Review Intelligence<\/a>/);
  assert.match(html, /href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/#example">See a worked example<\/a>/);
  assert.match(html, /Can I retrieve more than 500 reviews\?/);
  assert.match(html, /Is this an app review scraper\?/);
  assert.match(html, /The MCP lets Claude Cowork or Codex retrieve structured review records inside the conversation, continue through additional Google Play batches/);
  assert.match(html, /What can I ask Review Intelligence\?/);
  assert.match(html, /It cannot prove revenue, retention, conversion impact, or the views of every user/);
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
  assert.match(html, /id="packet-title" tabindex="-1"/);
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
  assert.match(html, /See a worked example — no model required/);
  assert.match(html, /href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/#example"/);
  assert.match(html, /id="claude-steps" hidden/);
  assert.match(html, /Open Claude Skills, click <strong>Add<\/strong>, choose <strong>Upload a skill<\/strong>/);
  assert.match(html, /class="card claude-action" id="claude-skill-download"/);
  assert.match(html, /class="card claude-action" id="claude-skills-link"/);
  assert.match(html, /public reviews only · nothing stored/);
  assert.equal((html.match(/href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/mcp\/">Use it in Claude Cowork or Codex<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/href="https:\/\/github\.com\/angrysushi11\/review-intelligence#run-review-retriever-locally"[^>]*>Source<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/href="\/extension\/privacy\/">Extension privacy<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/<span class="hand">for power users<\/span>/g) ?? []).length, 3);
  assert.match(html, /family=Caveat:wght@400\.\.700/);
  assert.doesNotMatch(html, /class="action-dock"/);
  assert.doesNotMatch(html, /id="claude-skill-modal"/);
  assert.doesNotMatch(html, /Three ways to use it/);
  assert.doesNotMatch(html, /Codex \/ Work/);

  const extensionPrivacy = await readFile(new URL("extension-privacy.html", webUrl), "utf8");
  assert.match(extensionPrivacy, /mailto:tools@doubledash\.me/);
  assert.doesNotMatch(extensionPrivacy, /mailto:dash@doubledash\.me/);

  assert.match(appJs, /const fragment = new URLSearchParams\(window\.location\.hash\.slice\(1\)\)/);
  assert.match(appJs, /const queryAppUrl = fragment\.get\("app_url"\) \|\| query\.get\("app_url"\) \|\| ""/);
  assert.match(appJs, /appUrl\.value = queryAppUrl/);
  assert.match(appJs, /window\.history\.replaceState\(null, "", cleanLocation\)/);
  assert.match(html, /page_location: `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`/);
  assert.match(html, /gtag\("event", "ai_referral_landing"/);
  assert.match(html, /ai_source: aiSource/);
  assert.match(html, /landing_path: window\.location\.pathname/);

  assert.match(styles, /@import url\("\/tokens\.css"\)/);
  assert.match(tokens, /--paper:\s*#f7f4ec/);
  assert.match(tokens, /--well:\s*#efe9da/);
  assert.match(tokens, /--well-focus:\s*#fbf9f3/);
  assert.match(tokens, /--pen:\s*#3a6b5c/);
  assert.match(styles, /font-family:\s*var\(--font-display\)/);
  assert.match(styles, /\.tool-frame::before\s*\{/);
  assert.match(styles, /\.tool-frame\s*\{[^}]*padding:\s*22px 16px 18px/s);
  assert.match(styles, /\.tool-frame\s*\{[^}]*margin-top:\s*68px/s);
  assert.match(styles, /\.title--hero\s*\{[^}]*max-width:\s*none[^}]*overflow-wrap:\s*normal[^}]*font-size:\s*clamp\(36px, 5\.2vw, 50px\)[^}]*text-wrap:\s*balance/s);
  assert.match(styles, /\.hero-lede\s*\{[^}]*margin:\s*14px 0 0[^}]*font-size:\s*18px[^}]*line-height:\s*1\.5/s);
  assert.match(styles, /\.power-user-jump\s*\{[^}]*border-top:\s*1px solid var\(--rule\)[^}]*border-bottom:\s*1px solid var\(--outline-soft\)/s);
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
  assert.match(styles, /@media \(min-width:\s*40rem\)\s*\{[\s\S]*?\.wrap\s*\{[^}]*padding:\s*30px/s);
  assert.match(styles, /\.retrieval-guide\s*\{[^}]*margin-top:\s*88px[^}]*border-top:\s*1px solid var\(--rule\)/s);
  assert.match(styles, /\.guide-columns\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.guide-question-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.guide-proof\s*\{/);
  assert.match(styles, /\.guide-proof-list\s*\{/);
  assert.match(styles, /\.sr-only\s*\{/);
  assert.match(styles, /\.guide-power\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*border:\s*2px solid/s);
  assert.match(styles, /\.guide-button--primary\s*\{[^}]*background:\s*var\(--ink\)[^}]*color:\s*var\(--paper\)/s);
  assert.match(styles, /@media \(max-width:\s*39\.999rem\)\s*\{[\s\S]*?\.retrieval-guide\s*\{[^}]*margin-top:\s*72px/s);
  assert.match(styles, /@media \(min-width:\s*40rem\)\s*\{[\s\S]*?\.guide-columns\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /@media \(min-width:\s*40rem\)\s*\{[\s\S]*?\.guide-question-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /@media \(min-width:\s*40rem\)\s*\{[\s\S]*?\.guide-power\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 218px/s);

  assert.ok(appJs.includes("const STORE_LINK_PATTERN = /apps\\.apple\\.com|itunes\\.apple\\.com|play\\.google\\.com/i;"));
  assert.match(appJs, /fetch\("\/api\/extract"/);
  assert.match(appJs, /limit:\s*500/);
  assert.match(appJs, /Extracting…/);
  assert.match(appJs, /couldn't reach the store — try again in a minute/);
  assert.match(appJs, /link\.download = currentFilename/);
  assert.match(appJs, /function renderPacket/);
  assert.match(appJs, /review packet ready with \$\{result\.count\}/);
  assert.match(appJs, /packetTitle\.focus\(\)/);
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

test("the extension handoff prefills locally, clears the fragment, and waits for user action", async () => {
  const appJs = await readFile(new URL("app.js", webUrl), "utf8");
  const executableAppJs = appJs.replace(
    'import { COUNTRY_OPTIONS } from "./markets.js";',
    'const COUNTRY_OPTIONS = [{ value: "us", label: "United States" }];'
  );
  assert.notEqual(executableAppJs, appJs, "the browser-only markets import should be replaced in the test harness");

  const storeUrl = "https://apps.apple.com/us/app/example/id123456789";
  const location = {
    href: `https://reviews.doubledash.me/#app_url=${encodeURIComponent(storeUrl)}`,
    origin: "https://reviews.doubledash.me",
    pathname: "/",
    search: "",
    hash: `#app_url=${encodeURIComponent(storeUrl)}`,
  };
  const listeners = new Map();
  const elements = new Map();
  const elementFor = (selector = "created") => {
    if (!elements.has(selector)) {
      const elementListeners = new Map();
      listeners.set(selector, elementListeners);
      elements.set(selector, {
        value: "",
        hidden: false,
        textContent: "",
        className: "",
        classList: { toggle() {} },
        addEventListener(type, handler) {
          elementListeners.set(type, handler);
        },
        append() {},
        replaceChildren() {},
        setAttribute() {},
        removeAttribute() {},
        focus() {},
        scrollIntoView() {},
      });
    }
    return elements.get(selector);
  };

  let cleanLocation;
  let fetchCalls = 0;
  const globals = {
    document: {
      referrer: "",
      querySelector: elementFor,
      createDocumentFragment: () => ({ append() {} }),
      createElement: () => elementFor(`created-${elements.size}`),
    },
    window: {
      location,
      history: {
        replaceState(_state, _title, nextLocation) {
          cleanLocation = nextLocation;
        },
      },
      dataLayer: [],
      scrollTo() {},
      setTimeout,
      matchMedia: () => ({ matches: true }),
    },
    sessionStorage: {
      getItem: () => null,
      setItem() {},
    },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("retrieval must wait for form submission");
    },
  };
  const previousDescriptors = new Map();

  try {
    for (const [name, value] of Object.entries(globals)) {
      previousDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }

    const sourceUrl = `data:text/javascript;base64,${Buffer.from(executableAppJs).toString("base64")}`;
    await import(sourceUrl);

    assert.equal(elementFor("#app-url").value, storeUrl);
    assert.equal(fetchCalls, 0, "loading a handed-off URL must not start retrieval");
    assert.equal(listeners.get("#extract-form").has("submit"), true);
    assert.ok(cleanLocation instanceof URL);
    assert.equal(cleanLocation.href, "https://reviews.doubledash.me/");
    assert.equal(cleanLocation.hash, "");
  } finally {
    for (const [name, descriptor] of previousDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
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

test("the extension privacy page publishes the exact handoff and data boundary", async () => {
  const html = await readFile(new URL("extension-privacy.html", webUrl), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/reviews\.doubledash\.me\/extension\/privacy\/">/);
  assert.match(html, /uses Chrome's <code>activeTab<\/code> permission/);
  assert.match(html, /read the current tab URL only after you click the toolbar action/);
  assert.match(html, /does not retain the listing URL or browsing history/);
  assert.match(html, /no account system, advertising, content scripts, host permissions, background retrieval, or remotely hosted extension code/);
  assert.match(html, /Analytics receives a sanitized page location without the app URL, query parameters, or fragment/);
  assert.match(html, /coarse source label such as ChatGPT, Claude, Perplexity, Gemini, or Copilot/);
  assert.match(html, /tools@doubledash\.me/);
  assert.doesNotMatch(html, /dash@doubledash\.me/);
  assert.match(html, /class="drawn privacy-return" href="\/">[\s\S]*?<span>Open Review Retriever<\/span>/);
});

test("the setup bridge and retriever assets are published explicitly", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = new Map(config.routes.map(({ src, dest }) => [src, dest]));

  assert.equal(routes.get("/setup/?"), "/web/setup.html");
  assert.equal(routes.get("/extension/privacy/?"), "/web/extension-privacy.html");
  assert.equal(routes.has("/setup.css"), false);
  assert.equal(routes.has("/setup.js"), false);
  assert.equal(routes.get("/tokens.css"), "/web/tokens.css");
  assert.equal(routes.get("/llms.txt"), "/web/llms.txt");
  assert.equal(routes.get("/"), "/web/index.html");
});

test("the crawler files publish an accurate sitemap and optional llms content map", async () => {
  const robots = await readFile(new URL("robots.txt", webUrl), "utf8");
  const sitemap = await readFile(new URL("sitemap.xml", webUrl), "utf8");
  const llms = await readFile(new URL("llms.txt", webUrl), "utf8");

  assert.match(robots, /Sitemap: https:\/\/reviews\.doubledash\.me\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/reviews\.doubledash\.me\/<\/loc>/);
  assert.match(sitemap, /<lastmod>2026-09-23<\/lastmod>/);
  assert.match(llms, /optional content map/);
  assert.match(llms, /not a crawler permission policy/);
  assert.match(llms, /https:\/\/reviews\.doubledash\.me\/robots\.txt/);
  assert.match(llms, /MCP returns up to 500 reviews per response/);
  assert.match(llms, /cannot by itself prove revenue, retention, causality, or the views of every user/);
});

test("production analytics records an AI source without leaking the query string", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const inlineScript = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(inlineScript, "the inline analytics script should exist");

  const context = {
    Date,
    URL,
    document: {
      referrer: "",
      createElement: () => ({}),
      head: { appendChild: () => {} }
    },
    window: {
      dataLayer: [],
      location: {
        hostname: "reviews.doubledash.me",
        origin: "https://reviews.doubledash.me",
        pathname: "/",
        href: "https://reviews.doubledash.me/?utm_source=claude&app_url=private"
      }
    }
  };

  runInNewContext(inlineScript, context);
  const analyticsCalls = context.window.dataLayer.map((entry) => Array.from(entry));
  const pageConfig = analyticsCalls.find(([command]) => command === "config");
  const aiEvent = analyticsCalls.find(([command, name]) => command === "event" && name === "ai_referral_landing");

  assert.equal(pageConfig[2].page_location, "https://reviews.doubledash.me/");
  assert.equal(aiEvent[2].ai_source, "claude");
  assert.equal(aiEvent[2].landing_path, "/");
});
