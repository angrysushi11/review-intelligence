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
  assert.match(html, /<title>Export &amp; Analyze App Reviews \| Review Intel<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.willthiseverwork\.com\/review-intel">/);
  assert.match(html, /<base href="\/review-intel\/">/);
  assert.match(html, /name="description" content="Export public App Store and Google Play reviews, discover what users love and hate, and capture the exact language they use\."/);
  assert.match(html, /family=Caveat:wght@400\.\.700/);
  assert.match(html, /id="retrieval-status" role="status" aria-live="polite"/);

  // Hero: the job first, no connector jargon.
  assert.match(idleState, /<span class="wordmark">Review Intel<\/span>/);
  assert.match(idleState, /<p class="hand hero-kicker">for indie devs &amp; app makers<\/p>/);
  assert.match(idleState, /<h1 class="title title--hero">Your competitors’ users already told you what to build\.<\/h1>/);
  assert.match(idleState, /Paste an App Store or Google Play link\. Get up to 500 public reviews, then ask Claude or ChatGPT what people love, hate and wish existed, with quotes you can check\./);
  const hero = html.match(/<header class="hero">([\s\S]*?)<\/header>/)?.[1] ?? "";
  assert.doesNotMatch(hero, /\b(?:MCP|Codex|batches|continuation cursor|power users)\b/i);

  // Extractor: one field, one button, one hand-drawn note, demo apps, no warning under the button.
  assert.match(idleState, /id="app-url"[^>]*autofocus/);
  assert.match(idleState, /<label class="field-label" for="app-url">App link or name<\/label>/);
  assert.match(idleState, /placeholder="Paste a store link or type an app name"/);
  assert.match(idleState, /role="combobox"[^>]*aria-autocomplete="list"[^>]*aria-controls="search-results"/);
  assert.match(idleState, /id="search-results" role="listbox"/);
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

  assert.match(idleState, /Want it inside your chat\?/);
  assert.match(idleState, /pull more than 500 Google Play reviews, and compare apps and countries in one conversation/);
  for (const placement of ["landing_connector", "landing_guide", "results_connector", "results_guide", "footer"]) {
    assert.ok(html.includes(`data-connect-placement="${placement}"`));
  }
  assert.match(html, /Next time, just ask Claude/);
  assert.match(html, /Claude fetches the reviews itself, for any app/);
  assert.match(html, /Every Claude chat gets the full method/);
  assert.match(appJs, /track\("review_connect_click", \{ placement: link\.dataset\.connectPlacement \}\)/);
  assert.match(appJs, /const appBasePath = window\.location\.pathname === "\/review-intel"/);
  assert.match(appJs, /fetch\(`\$\{appBasePath\}\/api\/search\?/);
  assert.match(appJs, /fetch\(`\$\{appBasePath\}\/api\/extract`/);

  // Connect: direct connector link, setup guide, Claude Code one-liner.
  assert.match(idleState, /href="https:\/\/claude\.ai\/customize\/connectors\?modal=add-custom-connector&amp;connectorName=Review%20Intel&amp;connectorUrl=https%3A%2F%2Freviews\.doubledash\.me%2Fmcp"/);
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
  assert.equal((html.match(/href="https:\/\/www\.doubledash\.me\/tools\/review-intelligence\/mcp\/"[^>]*>Use it in Claude or Codex<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/href="https:\/\/github\.com\/angrysushi11\/review-intelligence#run-review-retriever-locally"[^>]*>Source<\/a>/g) ?? []).length, 2);
  assert.equal((html.match(/href="extension\/privacy\/">Extension privacy<\/a>/g) ?? []).length, 2);
  assert.match(html, /public reviews only · nothing stored/);

  // Results: compact receipt, visible question, one primary action, setup block, then proof.
  assert.match(doneState, /<header class="result-masthead">[\s\S]*?<span class="result-wordmark">Review Intel<\/span>/);
  assert.match(doneState, /id="start-over"[^>]*>Try another app<\/button>/);
  assert.match(doneState, /id="app-icon"[^>]*referrerpolicy="no-referrer"[^>]*hidden/);
  assert.match(doneState, /id="packet-title" tabindex="-1"/);
  assert.match(doneState, /id="packet-meta">Store · Country · Language<\/p>/);
  assert.match(doneState, /id="packet-count">0<\/strong>/);
  assert.match(doneState, /id="packet-date">Date unavailable<\/span>/);
  assert.match(doneState, /id="packet-date-short">Date unavailable<\/span>/);
  assert.match(doneState, /id="rating-chart" role="img"/);
  assert.ok(doneState.indexOf('id="rating-chart"') < doneState.indexOf('id="analyze"'));
  assert.ok(doneState.indexOf('id="analyze"') < doneState.indexOf('id="evidence-title"'));
  assert.match(doneState, /id="selected-question-title">First useful read<\/h3>/);
  assert.match(doneState, /id="selected-question-description">The two or three things in these reviews you’d most likely miss, and why they matter\.<\/p>/);
  assert.match(doneState, /id="question-group-chips" role="group"/);
  assert.match(doneState, /id="question-options" role="group"/);
  assert.match(doneState, /id="question-reset"[^>]*>Back to First useful read<\/button>/);
  assert.match(doneState, /id="analyze-claude" href="https:\/\/claude\.ai\/new\?q=Analyze%20the%20app%20reviews%20I%27m%20pasting%20below\.[^"]*" target="_blank" rel="noopener"/);
  assert.match(doneState, /id="analyze-chatgpt" href="https:\/\/chatgpt\.com\/" target="_blank" rel="noopener"/);
  assert.equal((doneState.match(/class="card card--primary"/g) ?? []).length, 1);
  assert.match(idleState, /Pick a question, then choose Claude or ChatGPT\. Paste and send in the new chat\./);
  assert.match(doneState, />Copy &amp; open Claude<\/span>/);
  assert.match(doneState, />Copy &amp; open ChatGPT<\/span>/);
  assert.match(doneState, /Claude reads all reviews\. ChatGPT gets the newest 150, so it has room to answer\./);
  assert.match(doneState, /id="paste-steps" aria-label="What happens next"/);
  assert.match(doneState, /id="paste-step-text">You paste and send<\/span>/);
  assert.match(doneState, /id="analysis-status" role="status" aria-live="polite" hidden/);
  assert.match(doneState, /Copied\. One step left, in the Claude tab\./);
  assert.match(doneState, /id="copy-again"[^>]*>Copy again<\/button>/);
  assert.match(doneState, /id="switch-analysis"[^>]*>Use ChatGPT instead<\/a>/);
  assert.match(doneState, /Couldn’t copy automatically\. Copy it here, then paste it into/);
  assert.match(doneState, /id="analysis-error-copy"[^>]*>Copy<\/button>/);
  assert.match(doneState, /id="copy-btn"[^>]*>Copy<\/button>/);
  assert.match(doneState, /id="download-btn"[^>]*>Download \.md<\/button>/);
  assert.ok(doneState.indexOf('id="results-upgrade"') < doneState.indexOf('id="evidence-title"'));
  assert.match(doneState, /id="results-upgrade-kicker">skip the copy-paste<\/p>/);
  assert.match(doneState, /id="claude-skill-download" href="app-review-growth-analyzer-skill\.zip" download/);
  assert.match(doneState, /id="evidence-title">Newest in the packet<\/h2>/);

  // Design system tokens and the new components.
  assert.match(styles, /@import url\("tokens\.css"\)/);
  assert.match(tokens, /--paper:\s*#f7f4ec/);
  assert.match(tokens, /--well:\s*#efe9da/);
  assert.match(tokens, /--pen:\s*#3a6b5c/);
  assert.match(styles, /#state-done\s*\{[^}]*--pen:\s*#3f7568[^}]*--error:\s*#a33e2f/s);
  assert.match(tokens, /--font-ui:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif/);
  assert.match(styles, /font-family:\s*var\(--font-display\)/);
  assert.match(styles, /\.tool-frame::before\s*\{/);
  assert.match(styles, /\.demo-chip\s*\{[^}]*min-height:\s*44px[^}]*border:\s*1\.5px dashed var\(--pen\)/s);
  assert.match(styles, /\.sample-card\s*\{/);
  assert.match(styles, /\.mix-row--low \.mix-bar\s*\{[^}]*background:\s*var\(--error\)/s);
  assert.match(styles, /\.question-groups\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.connect\s*\{[^}]*background:\s*var\(--ink\)/s);
  assert.match(styles, /\.packet-body\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.rating-row--low \.rating-bar\s*\{[^}]*background:\s*var\(--error\)/s);
  assert.match(styles, /\.question-group-chips\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /\.question-card\s*\{[^}]*border:\s*2px solid var\(--pen\)/s);
  assert.match(styles, /\.analysis-status--error\s*\{[^}]*border-color:\s*var\(--error\)/s);
  assert.match(doneState, /Copy failed <span>\(browser blocked the clipboard\)<\/span>/);
  assert.match(styles, /\.results-upgrade\s*\{[^}]*background:\s*var\(--ink\)/s);
  assert.doesNotMatch(styles, /\.review-card::after/);
  assert.match(styles, /\.busy\s*\{[^}]*opacity:\s*0\.58[^}]*pointer-events:\s*none/s);
  assert.match(styles, /@media \(max-width:\s*39\.999rem\)\s*\{[\s\S]*?\.paste-steps\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(min-width:\s*40rem\)\s*\{[\s\S]*?\.upgrade-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.sr-only\s*\{/);
  assert.doesNotMatch(styles, /\.form-nudge|\.power-user-jump|\.guide-power|\.export-nudge/);

  // Behaviour kept from the previous flow.
  assert.ok(appJs.includes("const STORE_LINK_PATTERN = /apps\\.apple\\.com|itunes\\.apple\\.com|play\\.google\\.com/i;"));
  assert.match(appJs, /const fragment = new URLSearchParams\(window\.location\.hash\.slice\(1\)\)/);
  assert.match(appJs, /const queryAppUrl = fragment\.get\("app_url"\) \|\| query\.get\("app_url"\) \|\| ""/);
  assert.match(appJs, /appUrl\.value = queryAppUrl/);
  assert.match(appJs, /window\.history\.replaceState\(null, "", cleanLocation\)/);
  assert.match(appJs, /fetch\(`\$\{appBasePath\}\/api\/extract`/);
  assert.match(appJs, /\/api\/search\?/);
  assert.match(appJs, /review_search", \{ result_count: searchResults\.length \}/);
  assert.match(appJs, /review_search_pick", \{ store: result\.store \}/);
  assert.match(appJs, /AbortController/);
  assert.match(appJs, /event\.key === "ArrowDown"/);
  assert.match(appJs, /limit:\s*500/);
  assert.match(appJs, /Getting the reviews…/);
  assert.match(appJs, /couldn't reach the store — try again in a minute/);
  assert.match(appJs, /link\.download = currentFilename/);
  assert.match(appJs, /review packet ready with \$\{result\.count\}/);
  assert.match(appJs, /packetTitle\.focus\(\)/);
  assert.match(appJs, /iconUrl:\s*safeImageUrl\(dataset\.app_icon_url\)/);
  assert.match(appJs, /url\.protocol === "https:"/);
  assert.match(appJs, /Visible App Store review cards/i);
  assert.match(appJs, /function renderRatingChart/);
  assert.match(appJs, /function compactDateRange/);

  // New behaviour: demo apps, question picker, one-tap analysis.
  assert.match(appJs, /from "\.\/analysis-prompt\.js\?v=20260925-results-redesign"/);
  assert.match(appJs, /track\("review_demo_pick"/);
  assert.match(appJs, /track\("review_question_pick"/);
  assert.match(appJs, /function openQuestionGroup/);
  assert.match(appJs, /button\.setAttribute\("aria-pressed", String\(isSelected\)\)/);
  assert.match(appJs, /function showAnalysisSuccess/);
  assert.match(appJs, /function showAnalysisError/);
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
    .replace('from "./analysis-prompt.js?v=20260925-results-redesign";', `from "${new URL("analysis-prompt.js", webUrl).href}";`);
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
        dataset: {},
        hidden: false,
        textContent: "",
        className: "",
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(type, handler) {
          elementListeners.set(type, handler);
        },
        append() {},
        replaceChildren() {},
        setAttribute(name, value) {
          this[name] = String(value);
        },
        removeAttribute() {},
        contains() { return true; },
        focus() {},
        select() {},
        remove() {},
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
      body: { append() {} },
      execCommand: () => false,
      querySelector: elementFor,
      querySelectorAll: (selector) => selector === "[data-connect-placement]"
        ? ["landing_connector", "landing_guide", "results_connector", "results_guide", "footer"].map((placement) => {
          const node = elementFor(`connector-${placement}`);
          node.dataset = { connectPlacement: placement };
          return node;
        }) : [],
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
    assert.match(elementFor("#analyze-chatgpt").href, /^https:\/\/chatgpt\.com\/\?q=/);
    assert.equal(elementFor("#question-select").value, "first-read");
    assert.equal(listeners.get("#extract-form").has("submit"), true);
    assert.ok(cleanLocation instanceof URL);
    assert.equal(cleanLocation.href, "https://reviews.doubledash.me/");
    assert.equal(cleanLocation.hash, "");
    for (const placement of ["landing_connector", "landing_guide", "results_connector", "results_guide", "footer"]) {
      listeners.get(`connector-${placement}`).get("click")();
      const event = window.dataLayer.at(-1);
      assert.equal(event[1], "review_connect_click");
      assert.equal(event[2].placement, placement);
    }

    // The visible group picker updates the selected question and reports the choice.
    const moneyButton = [...elements.values()].find((element) => element.dataset.questionGroup === "Money");
    assert.ok(moneyButton, "the Money group chip should be rendered");
    listeners.get("#question-group-chips").get("click")({ target: { closest: () => moneyButton } });
    const priceButton = [...elements.values()].find((element) => element.dataset.questionId === "price");
    assert.ok(priceButton, "opening Money should render its questions");
    listeners.get("#question-options").get("click")({ target: { closest: () => priceButton } });
    assert.equal(elementFor("#question-select").value, "price");
    assert.equal(elementFor("#selected-question-title").textContent, "Is it the price, or when the price appears?");
    assert.equal(window.dataLayer.at(-1)[1], "review_question_pick");
    assert.equal(window.dataLayer.at(-1)[2].question_id, "price");

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
        dataset: {
          reviews_exported: 1,
          app_name: "Example",
          platform: "google_play",
          country: "us",
          country_name: "United States",
          language_name: "English",
          date_range: "2026-09-23 to 2026-09-24",
          rating_distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
        },
        markdown: reviewMarkdown,
      }) };
    };
    const submit = listeners.get("#extract-form").get("submit");
    const analyze = (target) => listeners.get(`#analyze-${target}`).get("click")();
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    submit({ preventDefault() {} });
    await settle();
    assert.equal(elementFor("#state-done").hidden, false);
    assert.equal(elementFor("#question-select").value, "first-read", "a new packet resets to the best-start question");
    assert.equal(elementFor("#packet-title").textContent, "Example");
    assert.equal(elementFor("#packet-meta").textContent, "Google Play · United States · English");
    assert.equal(elementFor("#packet-count").textContent, "1");
    assert.equal(elementFor("#packet-date").textContent, "Sep 23 – Sep 24, 2026");
    assert.equal(elementFor("#packet-date-short").textContent, "Sep 23 – Sep 24");
    assert.equal(elementFor("#handoff-scope").textContent, "Claude and ChatGPT both read all 1 review.");
    assert.equal(elementFor("#paste-step-text").textContent, "Long-press, tap Paste, then send");
    analyze("claude");
    assert.equal(copies.length, 1, "clipboard write starts within the click, without an await");
    assert.ok(copies[0].startsWith(method.trim()));
    await settle();
    assert.equal(elementFor("#analysis-actions").hidden, true);
    assert.equal(elementFor("#analysis-status").hidden, false);
    assert.equal(elementFor("#analysis-status-title").textContent, "Copied. One step left, in the Claude tab.");
    assert.equal(elementFor("#analysis-status-step").textContent, "Long-press, tap Paste, then send");
    assert.equal(elementFor("#results-upgrade-kicker").textContent, "while Claude reads…");
    analyze("chatgpt");
    assert.ok(copies[1].startsWith(method.trim()));
    assert.equal(copies[0], copies[1], "the same sample and question receive identical instructions");
    submit({ preventDefault() {} });
    await settle();
    analyze("claude");
    assert.equal(copies[2], copies[0]);
    globalThis.sessionStorage.getItem = () => { throw new Error("blocked storage"); };
    globalThis.sessionStorage.setItem = () => { throw new Error("blocked storage"); };
    submit({ preventDefault() {} });
    await settle();
    assert.equal(elementFor("#state-done").hidden, false);

    // A blocked clipboard exposes the dedicated red recovery state.
    globalThis.navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));
    analyze("claude");
    await settle();
    assert.equal(elementFor("#analysis-status-error").hidden, false);
    assert.equal(elementFor("#analysis-error-destination").textContent, "Claude");

    // Name search waits for a pause, supports keyboard selection, and ignores an older response.
    const waitForSearch = () => new Promise((resolve) => setTimeout(resolve, 430));
    let firstSearchResponse;
    elementFor("#country").value = "us";
    globalThis.fetch = (url) => {
      if (String(url).startsWith("/api/search?term=Slow")) {
        return new Promise((resolve) => { firstSearchResponse = resolve; });
      }
      if (String(url).startsWith("/api/search?term=Fresh")) {
        return Promise.resolve({ ok: true, json: async () => ({ results: [{
          store: "google_play", id: "com.fresh", name: "Fresh", developer: "Example", iconUrl: "", url: "https://play.google.com/store/apps/details?id=com.fresh&gl=us"
        }] }) });
      }
      if (String(url) === "/api/extract") {
        return Promise.resolve({ ok: true, text: async () => JSON.stringify({
          dataset: { reviews_exported: 1, app_name: "Fresh", platform: "google_play", country: "us" }, markdown: reviewMarkdown
        }) });
      }
      throw new Error(`Unexpected fetch ${url}`);
    };
    const input = listeners.get("#app-url").get("input");
    const keydown = listeners.get("#app-url").get("keydown");
    elementFor("#app-url").value = "Slow";
    input();
    await waitForSearch();
    elementFor("#app-url").value = "Fresh";
    input();
    await waitForSearch();
    assert.equal(elementFor("#search-results").hidden, false);
    assert.equal(elementFor("#app-url").value, "Fresh");
    firstSearchResponse({ ok: true, json: async () => ({ results: [{
      store: "app_store", id: "1", name: "Stale", developer: "Example", iconUrl: "", url: "https://apps.apple.com/us/app/id1"
    }] }) });
    await settle();
    assert.equal(elementFor("#app-url").value, "Fresh", "a late search response must not replace the current query");
    keydown({ key: "ArrowDown", preventDefault() {} });
    assert.equal(elementFor("#app-url").value, "Fresh");
    keydown({ key: "Enter", preventDefault() {} });
    await settle();
    assert.equal(elementFor("#app-url").value, "https://play.google.com/store/apps/details?id=com.fresh&gl=us");

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
  assert.match(html, /Review Intel MCP setup guide/);
  assert.doesNotMatch(html, /setup\.css|setup\.js|manual-export/);
});

test("the extension privacy page publishes the exact handoff and data boundary", async () => {
  const html = await readFile(new URL("extension-privacy.html", webUrl), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel\/extension\/privacy\/">/);
  assert.match(html, /uses Chrome's <code>activeTab<\/code> permission/);
  assert.match(html, /read the current tab URL only after you click the toolbar action/);
  assert.match(html, /does not retain the listing URL or browsing history/);
  assert.match(html, /no account system, advertising, content scripts, host permissions, background retrieval, or remotely hosted extension code/);
  assert.match(html, /Analytics receives a sanitized page location without the app URL, query parameters, or fragment/);
  assert.match(html, /coarse source label such as ChatGPT, Claude, Perplexity, Gemini, or Copilot/);
  assert.match(html, /tools@doubledash\.me/);
  assert.doesNotMatch(html, /dash@doubledash\.me/);
  assert.match(html, /class="drawn privacy-return" href="\/review-intel">[\s\S]*?<span>Open Review Intel<\/span>/);
});

test("the setup bridge and retriever assets are published explicitly", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = new Map(config.routes.map(({ src, dest }) => [src, dest]));

  assert.equal(routes.get("/setup/?"), "/web/setup.html");
  assert.equal(routes.get("/api/search"), "/api/search.js");
  assert.equal(routes.get("/review-intel/?"), "/web/index.html");
  assert.equal(routes.get("/review-intel/api/search"), "/api/search.js");
  assert.equal(routes.get("/review-intel/api/extract"), "/api/extract.js");
  assert.equal(routes.get("/review-intel/app.js"), "/web/app.js");
  assert.equal(routes.get("/review-intel/styles.css"), "/web/styles.css");
  assert.equal(routes.get("/review-intel/review-intelligence-method.js"), "/web/review-intelligence-method.js");
  assert.equal(routes.get("/review-intel/robots.txt"), "/web/robots.txt");
  assert.equal(routes.get("/review-intel/sitemap.xml"), "/web/sitemap.xml");
  assert.equal(routes.get("/review-intel/llms.txt"), "/web/llms.txt");
  assert.equal(routes.get("/review-intel/extension/privacy/?"), "/web/extension-privacy.html");
  assert.equal(routes.get("/extension/privacy/?"), "/web/extension-privacy.html");
  assert.equal(routes.has("/setup.css"), false);
  assert.equal(routes.has("/setup.js"), false);
  assert.equal(routes.get("/tokens.css"), "/web/tokens.css");
  assert.equal(routes.get("/review-intelligence-method.js"), "/web/review-intelligence-method.js");
  assert.equal(routes.get("/review-intelligence-method.md"), "/web/review-intelligence-method.md");
  assert.equal(routes.get("/analysis-prompt.js"), "/web/analysis-prompt.js");
  assert.equal(routes.get("/llms.txt"), "/web/llms.txt");
  assert.equal(routes.get("/"), "/web/index.html");
  assert.equal(routes.has("/review/?"), false);
  assert.equal(routes.get("/mcp"), "/api/mcp.js");
});

test("the crawler files publish an accurate sitemap and optional llms content map", async () => {
  const robots = await readFile(new URL("robots.txt", webUrl), "utf8");
  const sitemap = await readFile(new URL("sitemap.xml", webUrl), "utf8");
  const llms = await readFile(new URL("llms.txt", webUrl), "utf8");

  assert.match(robots, /Sitemap: https:\/\/www\.willthiseverwork\.com\/review-intel\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/www\.willthiseverwork\.com\/review-intel<\/loc>/);
  assert.match(sitemap, /<lastmod>2026-09-25<\/lastmod>/);
  assert.match(llms, /optional content map/);
  assert.match(llms, /not a crawler permission policy/);
  assert.match(llms, /https:\/\/www\.willthiseverwork\.com\/review-intel\/robots\.txt/);
  assert.match(llms, /MCP returns up to 500 reviews per response/);
  assert.match(llms, /cannot by itself prove revenue, retention, causality, or the views of every user/);
});

test("production analytics records an AI source without leaking the query string", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const inlineScript = [...html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/g)].map(([, script]) => script).find((script) => script.includes('gtag("config"'));
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
