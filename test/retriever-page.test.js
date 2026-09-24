import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildDataset } from "../src/app-store.js";

const webUrl = new URL("../web/", import.meta.url);

test("the homepage leads with the job, a real example, and one-tap analysis", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const styles = await readFile(new URL("styles.css", webUrl), "utf8");
  const tokens = await readFile(new URL("tokens.css", webUrl), "utf8");
  const appJs = await readFile(new URL("app.js", webUrl), "utf8");
  const idleState = html.match(/<section id="state-idle">([\s\S]*?)<section id="state-done" hidden>/)?.[1] ?? "";
  const doneState = html.match(/<section id="state-done" hidden>([\s\S]*?)<\/main>/)?.[1] ?? "";
  assert.ok(idleState && doneState, "both page states should exist");

  // Search metadata stays stable while the page copy changes.
  assert.match(html, /<title>Export &amp; Analyze App Reviews \| Review Retriever<\/title>/);
  assert.match(html, /name="description" content="Export public App Store and Google Play reviews, discover what users love and hate, and capture the exact language they use\."/);
  assert.match(html, /family=Caveat:wght@400\.\.700/);
  assert.match(html, /id="retrieval-status" role="status" aria-live="polite"/);

  // Hero: the job first, no connector jargon.
  assert.match(idleState, /<span class="wordmark">Review Retriever<\/span>/);
  assert.match(idleState, /<p class="hand hero-kicker">for indie devs &amp; app makers<\/p>/);
  assert.match(idleState, /<h1 class="title title--hero">Your competitors’ users already told you what to build\.<\/h1>/);
  assert.match(idleState, /Paste an App Store or Google Play link\. Get up to 500 public reviews, then ask Claude or ChatGPT what people love, hate and wish existed, with quotes you can check\./);
  const hero = html.match(/<header class="hero">([\s\S]*?)<\/header>/)?.[1] ?? "";
  assert.doesNotMatch(hero, /\b(?:MCP|Codex|batches|continuation cursor|power users)\b/i);

  // Extractor: one field, one button, one hand-drawn note, demo apps, no warning under the button.
  assert.match(idleState, /id="app-url"[^>]*autofocus/);
  assert.match(idleState, /<label class="field-label" for="app-url">App Store or Google Play link<\/label>/);
  assert.match(idleState, /id="extract-label">Get the reviews<\/span>/);
  assert.match(idleState, /id="form-error"[^>]*hidden>that doesn't look like a store link/);
  assert.equal((idleState.match(/class="hand demo-nudge"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /form-nudge|submit-nudge|power-user-jump|export-nudge|class="notice"/);
  const demoUrls = [...idleState.matchAll(/class="demo-chip" type="button" data-demo-name="([a-z]+)" data-demo-url="([^"]+)"/g)];
  assert.deepEqual(demoUrls.map(([, name]) => name), ["calm", "duolingo", "strava"]);
  for (const [, , url] of demoUrls) assert.match(url, /^https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+$/);

  // Section order: form → real example → questions → how it works → connect → FAQ.
  const order = ['id="extract-form"', 'class="sample"', 'class="questions"', 'class="how"', 'class="connect"', 'class="faq"'];
  const positions = order.map((marker) => idleState.indexOf(marker));
  assert.ok(positions.every((position) => position > -1), "every idle section should exist");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);

  // The example is real, dated, and quotes reviews verbatim.
  assert.match(idleState, /What 40 recent Calm reviews said/);
  assert.match(idleState, /Google Play US · the 40 newest reviews, Sep 16–23, 2026/);
  assert.match(idleState, /10 of 17 one-star reviews/);
  assert.match(idleState, /“Charged for a free trial \$85, refused refund\.”/);
  assert.match(idleState, /“Not at all what was described in the ad\.”/);
  assert.match(idleState, /“A mini spa date in your pocket\.”/);

  // The question map shows how much reviews can answer.
  const questionMap = idleState.match(/<div class="question-groups">([\s\S]*?)<p class="questions-more">/)?.[1] ?? "";
  assert.equal((questionMap.match(/<h3>/g) ?? []).length, 4);
  assert.equal((questionMap.match(/<li>/g) ?? []).length, 12);
  assert.match(idleState, /Is it the price, or when the price appears\?/);

  // Connect: direct connector link, setup guide, Claude Code one-liner.
  assert.match(idleState, /href="https:\/\/claude\.ai\/customize\/connectors\?modal=add-custom-connector&amp;connectorName=Review%20Retriever&amp;connectorUrl=https%3A%2F%2Freviews\.doubledash\.me%2Fmcp"/);
  assert.match(idleState, /works on the free plan/);
  assert.match(idleState, /claude mcp add --transport http review-retriever https:\/\/reviews\.doubledash\.me\/mcp/);

  // "500" is stated where it matters, not everywhere.
  assert.ok((idleState.match(/500/g) ?? []).length <= 3);

  // FAQ keeps the Apple caveat and the search-relevant questions.
  assert.equal((idleState.match(/<details>/g) ?? []).length, 6);
  assert.match(idleState, /Apple’s public review feed can be flaky/);
  assert.match(idleState, /Can I get more than 500 reviews\?/);
  assert.match(idleState, /Is this an app review scraper\?/);
  assert.match(idleState, /There’s no CSV, Excel or JSON export on this page/);

  // Footers link the guide, source, extension privacy and support.
  assert.equal((html.match(/href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/mcp\/">Use it in Claude or Codex<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/href="https:\/\/github\.com\/angrysushi11\/review-intelligence#run-review-retriever-locally"[^>]*>Source<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/href="\/extension\/privacy\/">Extension privacy<\/a>/g) ?? []).length, 2);
  assert.match(html, /public reviews only · nothing stored/);

  // Results: packet, then the analysis step, then the evidence preview.
  assert.match(doneState, /<header class="result-masthead">[\s\S]*?<h1 class="title">Review Retriever<\/h1>/);
  assert.match(doneState, /review packet ready/);
  assert.match(doneState, /id="app-icon"[^>]*referrerpolicy="no-referrer"[^>]*hidden/);
  assert.match(doneState, /id="packet-title" tabindex="-1"/);
  assert.match(doneState, /id="packet-ledger"><\/dl>/);
  assert.ok(doneState.indexOf('id="packet-ledger"') < doneState.indexOf('id="analyze"'));
  assert.ok(doneState.indexOf('id="analyze"') < doneState.indexOf('id="evidence-title"'));
  assert.match(doneState, /<label class="field-label" for="question-select">What do you want to know\?<\/label>/);
  assert.match(doneState, /id="analyze-claude" href="https:\/\/claude\.ai\/new\?q=Analyze%20the%20app%20reviews%20I%27m%20pasting%20below\.[^"]*" target="_blank" rel="noopener"/);
  assert.match(doneState, /id="analyze-chatgpt" href="https:\/\/chatgpt\.com\/" target="_blank" rel="noopener"/);
  assert.match(doneState, />Analyze in Claude<\/span>/);
  assert.match(doneState, />Analyze in ChatGPT<\/span>/);
  assert.match(doneState, /id="analyze-toast" role="status" aria-live="polite" hidden/);
  assert.match(doneState, /id="copy-btn"[^>]*>Copy<\/button>/);
  assert.match(doneState, /id="download-btn"[^>]*>Download \.md<\/button>/);
  assert.match(doneState, /id="claude-btn"[^>]*aria-controls="claude-steps"/);
  assert.match(doneState, /id="claude-steps" hidden/);
  assert.match(doneState, /Open Claude Skills, click <strong>Add<\/strong>, choose <strong>Upload a skill<\/strong>/);
  assert.match(doneState, /class="card claude-action" id="claude-skill-download"/);
  assert.match(doneState, /id="evidence-title">evidence preview<\/h2>/);

  // Design system tokens and the new components.
  assert.match(styles, /@import url\("\/tokens\.css"\)/);
  assert.match(tokens, /--paper:\s*#f7f4ec/);
  assert.match(tokens, /--well:\s*#efe9da/);
  assert.match(tokens, /--pen:\s*#3a6b5c/);
  assert.match(tokens, /--font-ui:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif/);
  assert.match(styles, /font-family:\s*var\(--font-display\)/);
  assert.match(styles, /\.tool-frame::before\s*\{/);
  assert.match(styles, /\.demo-chip\s*\{[^}]*min-height:\s*44px[^}]*border:\s*1\.5px dashed var\(--pen\)/s);
  assert.match(styles, /\.sample-card\s*\{/);
  assert.match(styles, /\.mix-row--low \.mix-bar\s*\{[^}]*background:\s*var\(--error\)/s);
  assert.match(styles, /\.question-groups\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.connect\s*\{[^}]*background:\s*var\(--ink\)/s);
  assert.match(styles, /\.analyze-toast\s*\{/);
  assert.match(styles, /\.card \.s\s*\{[\s\S]*?\.card--primary \.s\s*\{[^}]*color:\s*var\(--rule\)/);
  assert.match(styles, /\.busy\s*\{[^}]*opacity:\s*0\.58[^}]*pointer-events:\s*none/s);
  assert.match(styles, /@media \(min-width:\s*40rem\)\s*\{[\s\S]*?\.question-groups,\s*\.connect-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.sr-only\s*\{/);
  assert.doesNotMatch(styles, /\.form-nudge|\.power-user-jump|\.guide-power|\.export-nudge/);

  // Behaviour kept from the previous flow.
  assert.ok(appJs.includes("const STORE_LINK_PATTERN = /apps\\.apple\\.com|itunes\\.apple\\.com|play\\.google\\.com/i;"));
  assert.match(appJs, /const fragment = new URLSearchParams\(window\.location\.hash\.slice\(1\)\)/);
  assert.match(appJs, /const queryAppUrl = fragment\.get\("app_url"\) \|\| query\.get\("app_url"\) \|\| ""/);
  assert.match(appJs, /appUrl\.value = queryAppUrl/);
  assert.match(appJs, /window\.history\.replaceState\(null, "", cleanLocation\)/);
  assert.match(appJs, /fetch\("\/api\/extract"/);
  assert.match(appJs, /limit:\s*500/);
  assert.match(appJs, /Getting the reviews…/);
  assert.match(appJs, /couldn't reach the store — try again in a minute/);
  assert.match(appJs, /link\.download = currentFilename/);
  assert.match(appJs, /review packet ready with \$\{result\.count\}/);
  assert.match(appJs, /packetTitle\.focus\(\)/);
  assert.match(appJs, /iconUrl:\s*safeImageUrl\(dataset\.app_icon_url\)/);
  assert.match(appJs, /url\.protocol === "https:"/);
  assert.match(appJs, /Visible App Store review cards/i);
  assert.match(appJs, /claudeSteps\.hidden = !willOpen/);

  // New behaviour: demo apps, question picker, one-tap analysis.
  assert.match(appJs, /from "\.\/analysis-prompt\.js"/);
  assert.match(appJs, /track\("review_demo_pick"/);
  assert.match(appJs, /track\("review_question_pick"/);
  assert.match(appJs, /tool: isChatGpt \? "chatgpt_oneclick" : "claude_oneclick"/);
  assert.match(appJs, /maxReviews: isChatGpt \? CHATGPT_REVIEW_CAP : Infinity/);
  assert.match(appJs, /navigator\.clipboard\?\.writeText/);
  assert.match(appJs, /function countryFromStoreUrl/);
  assert.doesNotMatch(appJs, /event\.preventDefault\(\);\s*\n\s*const payload/);
});

test("the extension handoff prefills locally, clears the fragment, and waits for user action", async () => {
  const appJs = await readFile(new URL("app.js", webUrl), "utf8");
  const executableAppJs = appJs
    .replace(
      'import { COUNTRY_OPTIONS } from "./markets.js";',
      'const COUNTRY_OPTIONS = [{ value: "us", label: "United States" }];'
    )
    .replace('from "./analysis-prompt.js";', `from "${new URL("analysis-prompt.js", webUrl).href}";`);
  assert.notEqual(executableAppJs, appJs, "the browser-only markets import should be replaced in the test harness");
  assert.ok(executableAppJs.includes(new URL("analysis-prompt.js", webUrl).href), "the analysis module should resolve by absolute URL");

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
      querySelectorAll: () => [],
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
    assert.match(elementFor("#analyze-claude").href, /^https:\/\/claude\.ai\/new\?q=/);
    assert.match(elementFor("#analyze-chatgpt").href, /^https:\/\/chatgpt\.com\/$/);
    assert.equal(elementFor("#question-select").value, "first-read");
    assert.equal(listeners.get("#extract-form").has("submit"), true);
    assert.ok(cleanLocation instanceof URL);
    assert.equal(cleanLocation.href, "https://reviews.doubledash.me/");
    assert.equal(cleanLocation.hash, "");

    // Both paths carry the complete method on the first click, without another fetch.
    const copies = [];
    const method = await readFile(new URL("review-intelligence-method.md", webUrl), "utf8");
    const reviewMarkdown = "# App Reviews\n\n### Review 1\n\n- Rating: 5\n\n```text\nHelpful app\n```";
    globalThis.navigator.clipboard.writeText = (text) => {
      copies.push(text);
      return Promise.resolve();
    };
    globalThis.fetch = async (url) => {
      assert.equal(url, "/api/extract");
      return { ok: true, text: async () => JSON.stringify({
        dataset: { reviews_exported: 1, app_name: "Example", platform: "google_play", country: "us" },
        markdown: reviewMarkdown,
      }) };
    };
    const submit = listeners.get("#extract-form").get("submit");
    const analyze = (target) => listeners.get(`#analyze-${target}`).get("click")();
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    submit({ preventDefault() {} });
    await settle();
    assert.equal(elementFor("#state-done").hidden, false);
    analyze("claude");
    assert.equal(copies.length, 1, "clipboard write starts within the click, without an await");
    assert.ok(copies[0].startsWith(method.trim()));
    analyze("chatgpt");
    assert.ok(copies[1].startsWith(method.trim()));
    assert.equal(copies[0], copies[1], "the same sample and question receive identical instructions");
    submit({ preventDefault() {} });
    await settle();
    analyze("claude");
    assert.equal(copies[2], copies[0]);

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
  assert.equal(routes.get("/review-intelligence-method.js"), "/web/review-intelligence-method.js");
  assert.equal(routes.get("/review-intelligence-method.md"), "/web/review-intelligence-method.md");
  assert.equal(routes.get("/analysis-prompt.js"), "/web/analysis-prompt.js");
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
