import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildDataset } from "../src/app-store.js";

const webUrl = new URL("../web/", import.meta.url);

test("the share card leads with the review insight and serves its image", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const setup = await readFile(new URL("setup.html", webUrl), "utf8");
  const svg = await readFile(new URL("review-retriever-og.svg", webUrl), "utf8");
  const image = await readFile(new URL("review-intel-og-20260926.png", webUrl));
  const routes = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8")).routes;
  const imagePath = "/review-intel/review-intel-og-20260926.png";

  assert.match(html, /property="og:title" content="See What People Love, Hate &amp; Want Changed \| Review Intel"/);
  assert.match(html, /property="og:description" content="[^"]*love, hate, and wish worked differently[^"]*public app reviews behind each finding/);
  assert.match(html, /name="twitter:title" content="See What People Love, Hate &amp; Want Changed \| Review Intel"/);
  assert.ok(html.includes(`content="https://www.willthiseverwork.com${imagePath}"`));
  assert.ok(setup.includes(`content="https://www.willthiseverwork.com${imagePath}"`));
  assert.ok(routes.some((route) => route.src === imagePath && route.dest === "/web/review-intel-og-20260926.png"));
  assert.match(svg, /See what people love,/);
  assert.match(svg, /hate, and wish worked/);
  assert.match(svg, /In products they already use/);
  assert.doesNotMatch(svg, /APP REVIEW EXPORT|into Markdown/i);
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test("direction D preserves the source example, accessible controls and free handoff", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const styles = await readFile(new URL("styles.css", webUrl), "utf8");
  const tokens = await readFile(new URL("tokens.css", webUrl), "utf8");
  const appJs = await readFile(new URL("app.js", webUrl), "utf8");
  for (const id of ["state-idle", "state-done", "extract-form", "app-url", "country", "extract-btn", "extract-label", "search-results", "form-error", "form-error-help", "retrieval-status", "packet-title", "rating-chart", "question-group-chips", "question-options", "question-reset", "analyze-claude", "analyze-chatgpt", "analysis-status-success", "analysis-status-error", "analysis-error-copy", "paste-step-text", "results-upgrade-kicker", "copy-btn", "download-btn", "start-over", "peek"]) {
    assert.equal((html.match(new RegExp(`\\sid="${id}"`, "g")) || []).length, 1, `${id} appears exactly once`);
  }
  assert.match(html, /Your competitors’ users already told you what to build\./);
  assert.match(html, /Paste an App Store or Google Play link\. Get up to 500 public reviews free, with a guided read in Claude or ChatGPT\./);
  assert.match(html, /450 Google Play reviews/);
  assert.match(html, /86 of 450 reviews/);
  assert.match(html, /51 of 450 reviews/);
  assert.match(html, /rr_00cfd8e9/);
  assert.match(html, /Jun 23 – Oct 1, 2026/);
  assert.match(html, /<base href="\/review-intel\/">/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-controls="search-results"/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-live="assertive"/);
  assert.equal((html.match(/data-demo-url=/g) || []).length, 3);
  assert.equal((html.match(/<details\b/g) || []).length, 6);
  assert.match(html, /Copy &amp; open Claude/);
  assert.match(html, /Copy &amp; open ChatGPT/);
  assert.match(html, /class="ri-footer/);
  assert.doesNotMatch(html, /fonts\.googleapis|Caveat|x-import|dc-import|\{\{/);
  assert.match(tokens, /#FFE27A/i);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /focus-visible/);
  assert.match(appJs, /CHATGPT_REVIEW_CAP/);
  assert.match(appJs, /QUESTION_GROUPS/);
});

test("the extension handoff prefills locally, clears the fragment, and waits for user action", async () => {
  const appJs = await readFile(new URL("app.js", webUrl), "utf8");
  const executableAppJs = appJs
    .replace(
      'import { COUNTRY_OPTIONS } from "./markets.js";',
      'const COUNTRY_OPTIONS = [{ value: "us", label: "United States" }];'
    )
    .replace('from "./analysis-prompt.js?v=20260925-results-redesign";', `from "${new URL("analysis-prompt.js", webUrl).href}";`)
    .replace('from "./analytics.js";', `from "${new URL("analytics.js", webUrl).href}";`);
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
          const controlIds = {
            landing_connector: "page-add-to-claude",
            landing_guide: "page-setup-guide",
            results_connector: "results-connect-claude",
            results_guide: "page-setup-guide-2",
            footer: "footer-setup",
          };
          node.dataset = { connectPlacement: placement, controlId: controlIds[placement] };
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
    assert.equal(window.dataLayer.at(-1)[1], "review_question_group_toggle");
    assert.deepEqual(
      { control_id: window.dataLayer.at(-1)[2].control_id, group_id: window.dataLayer.at(-1)[2].group_id, action: window.dataLayer.at(-1)[2].action },
      { control_id: "question-group-money", group_id: "money", action: "open" }
    );
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
    assert.equal(elementFor("#extract-spinner").hidden, false);
    await settle();
    assert.equal(elementFor("#extract-spinner").hidden, true);
    assert.equal(elementFor("#state-done").hidden, false);
    assert.equal(elementFor("#question-select").value, "first-read", "a new packet resets to the best-start question");
    assert.equal(elementFor("#packet-title").textContent, "Example");
    assert.equal(elementFor("#packet-meta").textContent, "Google Play, United States, English");
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
    assert.equal(elementFor("#results-upgrade-kicker").textContent, "While Claude reads…");
    listeners.get("connector-results_connector").get("click")();
    assert.equal(window.dataLayer.at(-1)[1], "review_keep_it_click");
    assert.deepEqual(
      { control_id: window.dataLayer.at(-1)[2].control_id, handoff_tool: window.dataLayer.at(-1)[2].handoff_tool },
      { control_id: "results-connect-claude", handoff_tool: "claude" }
    );
    analyze("chatgpt");
    assert.ok(copies[1].startsWith(method.trim()));
    assert.equal(copies[0], copies[1], "the same sample and question receive identical instructions");
    await settle();
    assert.equal(elementFor("#reopen-analysis").textContent, "Open ChatGPT again");
    submit({ preventDefault() {} });
    await settle();
    analyze("claude");
    assert.equal(copies[2], copies[0]);
    globalThis.sessionStorage.getItem = () => { throw new Error("blocked storage"); };
    globalThis.sessionStorage.setItem = () => { throw new Error("blocked storage"); };
    submit({ preventDefault() {} });
    await settle();
    assert.equal(elementFor("#state-done").hidden, false);

    // The same handoff uses platform-appropriate paste instructions.
    globalThis.window.matchMedia = () => ({ matches: false });
    globalThis.navigator.platform = "MacIntel";
    analyze("claude");
    await settle();
    assert.equal(elementFor("#analysis-status-step").textContent, "Paste (⌘V), then send");
    globalThis.navigator.platform = "Win32";
    analyze("claude");
    await settle();
    assert.equal(elementFor("#analysis-status-step").textContent, "Paste (Ctrl+V), then send");

    // A blocked clipboard exposes the dedicated monochrome recovery state.
    globalThis.navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));
    analyze("claude");
    await settle();
    assert.equal(elementFor("#analysis-status-error").hidden, false);
    assert.equal(elementFor("#analysis-error-destination").textContent, "Claude");
    assert.equal(elementFor("#analysis-error-open").textContent, "Open Claude");

    // Empty and partial store responses render the distinct approved recovery states.
    listeners.get("#start-over").get("click")();
    elementFor("#app-url").value = "https://apps.apple.com/us/app/example/id123456789";
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({
      dataset: { reviews_exported: 0, app_name: "Example", platform: "app_store", country: "us" },
      markdown: "# App Reviews",
    }) });
    submit({ preventDefault() {} });
    await settle();
    assert.equal(elementFor("#state-done").hidden, true);
    assert.equal(elementFor("#form-error-title").textContent, "Apple returned no written reviews.");
    assert.match(elementFor("#form-error-text").textContent, /public feed is often flaky/);
    assert.equal(elementFor("#form-retry").hidden, false);
    assert.equal(elementFor("#form-change-country").hidden, false);

    elementFor("#app-url").value = "https://play.google.com/store/apps/details?id=com.example";
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({
      dataset: { reviews_exported: 0, app_name: "Example", platform: "google_play", country: "us" },
      markdown: "# App Reviews",
    }) });
    submit({ preventDefault() {} });
    await settle();
    assert.equal(elementFor("#form-error-title").textContent, "No written reviews for this app in this country.");
    assert.equal(elementFor("#form-retry").hidden, true);
    assert.equal(elementFor("#form-change-country").hidden, false);

    elementFor("#app-url").value = "https://apps.apple.com/us/app/example/id123456789";
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({
      dataset: {
        reviews_exported: 3,
        app_name: "Example",
        platform: "app_store",
        country: "us",
        source: "Visible App Store review cards",
        rating_distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 3 },
      },
      markdown: reviewMarkdown,
    }) });
    submit({ preventDefault() {} });
    await settle();
    assert.equal(elementFor("#state-done").hidden, false);
    assert.equal(elementFor("#receipt-meta").hidden, false);
    assert.equal(elementFor("#receipt-note-text").textContent, "Apple’s full review feed was unavailable, so this file has only the reviews the store page shows. Try again in a minute for more.");
    assert.equal(elementFor("#app-icon").src, undefined, "redesigned results must not request remote store artwork");

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

test("the canonical setup guide covers every supported route and evidence boundary", async () => {
  const html = await readFile(new URL("setup.html", webUrl), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel\/setup\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.willthiseverwork\.com\/review-intel\/setup\/">/);
  assert.match(html, /Ask Claude or Codex about any app’s reviews/);
  assert.match(html, /href="setup\/#claude"[^>]*>Claude<\/a>/);
  assert.match(html, /href="setup\/#codex"[^>]*>Codex<\/a>/);
  assert.match(html, /app-review-growth-analyzer-skill\.zip/);
  assert.match(html, /claude\.ai\/customize\/connectors/);
  assert.match(html, /codex plugin marketplace add angrysushi11\/review-intelligence --ref main/);
  assert.match(html, /codex plugin add review-intelligence@doubledash/);
  assert.match(html, /From the web tool/);
  assert.match(html, /Copy &amp; open ChatGPT/);
  assert.match(html, /With the plugin/);
  assert.match(html, /Up to 500 reviews per response/);
  assert.match(html, /Google Play continues batch by batch/);
  assert.match(html, /Apple’s public feed stops earlier/);
  assert.match(html, /No review database/);
  assert.match(html, /data-copy-target="setup-codex-commands"/);
  assert.match(html, /<script type="module" src="site\.js"><\/script>/);
  assert.doesNotMatch(html, /reviews\.doubledash\.me\/mcp|doubledash\.me\/tools\/review-intelligence/);
});

test("the product privacy page covers website and MCP processing and links the extension policy", async () => {
  const html = await readFile(new URL("privacy.html", webUrl), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel\/privacy\/">/);
  assert.match(html, /What the website processes/);
  assert.match(html, /What the MCP server processes/);
  assert.match(html, /no review database or persistence layer/i);
  assert.match(html, /ordinary request or operational logs/);
  assert.match(html, /Google Analytics/);
  assert.match(html, /without the app link, query parameters or fragment/);
  assert.match(html, /cuts a referrer down to its origin/);
  assert.match(html, /supported UTM fields.*validated campaign ID and the source, medium, campaign, content or term labels/);
  assert.match(html, /href="extension\/privacy\/"[^>]*>own policy<\/a>/);
  assert.match(html, /<script type="module" src="site\.js"><\/script>/);
  assert.doesNotMatch(html, /reviews\.doubledash\.me\/mcp|doubledash\.me\/tools\/review-intelligence/);
});

test("the extension privacy page publishes the exact handoff and data boundary", async () => {
  const html = await readFile(new URL("extension-privacy.html", webUrl), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.willthiseverwork\.com\/review-intel\/extension\/privacy\/">/);
  assert.match(html, /uses Chrome’s <code>activeTab<\/code> permission/);
  assert.match(html, /read the current tab’s URL only after you click its toolbar button/);
  assert.match(html, /keeps neither the URL nor your browsing history/);
  assert.match(html, /no account system, advertising, content scripts, host permissions, background collection or remotely hosted code/);
  assert.match(html, /Analytics gets a cleaned page location and referrer, without the app link, query parameters or fragment/);
  assert.match(html, /referrer is cut down to its origin/);
  assert.match(html, /supported UTM fields.*validated campaign ID and the source, medium, campaign, content or term labels/);
  assert.match(html, /coarse label such as ChatGPT, Claude, Perplexity, Gemini or Copilot/);
  assert.match(html, /press <strong>Get the reviews<\/strong>/);
  assert.match(html, /Chrome Web Store User Data Policy/);
  assert.match(html, /tools@doubledash\.me/);
  assert.doesNotMatch(html, /dash@doubledash\.me/);
  assert.match(html, /href="\.\/"[^>]*>Review Intel<\/a>/);
});

test("the setup bridge and retriever assets are published explicitly", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = new Map(config.routes.map(({ src, dest }) => [src, dest]));
  const legacyRedirects = new Map(
    config.routes
      .filter((route) => route.status === 308 && route.has)
      .map((redirect) => [redirect.src, redirect]),
  );
  const legacyHostCondition = [{ type: "host", value: "^reviews\\.doubledash\\.me$" }];

  assert.deepEqual(config.routes[0], {
    src: "/",
    status: 308,
    headers: { Location: "https://www.willthiseverwork.com/review-intel/" },
  });
  const unslashedApp = config.routes.find(({ src }) => src === "/review-intel");
  assert.equal(unslashedApp.status, 308);
  assert.equal(unslashedApp.headers.Location, "https://www.willthiseverwork.com/review-intel/");
  assert.equal(routes.get("/review-intel/"), "/web/index.html");
  assert.equal(routes.get("/review-intel/mcp"), "/api/mcp.js");
  const unslashedSetup = config.routes.find(({ src }) => src === "/review-intel/setup");
  assert.equal(unslashedSetup.status, 308);
  assert.equal(unslashedSetup.headers.Location, "https://www.willthiseverwork.com/review-intel/setup/");
  assert.equal(routes.get("/review-intel/setup/"), "/web/setup.html");
  const unslashedPrivacy = config.routes.find(({ src }) => src === "/review-intel/privacy");
  assert.equal(unslashedPrivacy.status, 308);
  assert.equal(unslashedPrivacy.headers.Location, "https://www.willthiseverwork.com/review-intel/privacy/");
  assert.equal(routes.get("/review-intel/privacy/"), "/web/privacy.html");
  const unslashedExtensionPrivacy = config.routes.find(({ src }) => src === "/review-intel/extension/privacy");
  assert.equal(unslashedExtensionPrivacy.status, 308);
  assert.equal(unslashedExtensionPrivacy.headers.Location, "https://www.willthiseverwork.com/review-intel/extension/privacy/");
  assert.equal(routes.get("/review-intel/extension/privacy/"), "/web/extension-privacy.html");
  const legacySetup = config.routes.find(({ src }) => src === "/setup/?");
  assert.equal(legacySetup.status, 308);
  assert.equal(legacySetup.headers.Location, "https://www.willthiseverwork.com/review-intel/setup/");
  assert.equal(routes.get("/api/search"), "/api/search.js");
  assert.equal(routes.get("/review-intel/api/search"), "/api/search.js");
  assert.equal(routes.get("/review-intel/api/extract"), "/api/extract.js");
  assert.equal(routes.get("/review-intel/app.js"), "/web/app.js");
  assert.equal(routes.get("/review-intel/analytics.js"), "/web/analytics.js");
  assert.equal(routes.get("/review-intel/styles.css"), "/web/styles.css");
  assert.equal(routes.get("/review-intel/review-intelligence-method.js"), "/web/review-intelligence-method.js");
  assert.equal(routes.get("/review-intel/robots.txt"), "/web/robots.txt");
  assert.equal(routes.get("/review-intel/sitemap.xml"), "/web/sitemap.xml");
  assert.equal(routes.get("/review-intel/llms.txt"), "/web/llms.txt");
  assert.equal(routes.get("/extension/privacy/?"), "/web/extension-privacy.html");
  assert.equal(routes.has("/setup.css"), false);
  assert.equal(routes.has("/setup.js"), false);
  assert.equal(routes.get("/tokens.css"), "/web/tokens.css");
  assert.equal(routes.get("/review-intelligence-method.js"), "/web/review-intelligence-method.js");
  assert.equal(routes.get("/review-intelligence-method.md"), "/web/review-intelligence-method.md");
  assert.equal(routes.get("/analysis-prompt.js"), "/web/analysis-prompt.js");
  assert.equal(routes.get("/analytics.js"), "/web/analytics.js");
  assert.equal(routes.get("/llms.txt"), "/web/llms.txt");
  assert.equal(routes.get("/"), "/web/index.html");
  assert.equal(routes.has("/review/?"), false);
  assert.equal(routes.get("/mcp"), "/api/mcp.js");

  for (const [source, destination] of [
    ["/review-intel/", "https://www.willthiseverwork.com/review-intel/"],
    ["/review-intel/setup/", "https://www.willthiseverwork.com/review-intel/setup/"],
    ["/review-intel/privacy/", "https://www.willthiseverwork.com/review-intel/privacy/"],
    ["/review-intel/extension/privacy/", "https://www.willthiseverwork.com/review-intel/extension/privacy/"],
    ["/extension/privacy", "https://www.willthiseverwork.com/review-intel/extension/privacy/"],
    ["/extension/privacy/", "https://www.willthiseverwork.com/review-intel/extension/privacy/"],
    ["/review-intel/review-intelligence-method.md", "https://www.willthiseverwork.com/review-intel/review-intelligence-method.md"],
    ["/review-intelligence-method.md", "https://www.willthiseverwork.com/review-intel/review-intelligence-method.md"],
    ["/review-intel/app-review-growth-analyzer-skill.zip", "https://www.willthiseverwork.com/review-intel/app-review-growth-analyzer-skill.zip"],
    ["/app-review-growth-analyzer-skill.zip", "https://www.willthiseverwork.com/review-intel/app-review-growth-analyzer-skill.zip"],
    ["/review-intel/llms.txt", "https://www.willthiseverwork.com/review-intel/llms.txt"],
    ["/llms.txt", "https://www.willthiseverwork.com/review-intel/llms.txt"],
    ["/review-intel/robots.txt", "https://www.willthiseverwork.com/review-intel/robots.txt"],
    ["/robots.txt", "https://www.willthiseverwork.com/review-intel/robots.txt"],
    ["/review-intel/sitemap.xml", "https://www.willthiseverwork.com/review-intel/sitemap.xml"],
    ["/sitemap.xml", "https://www.willthiseverwork.com/review-intel/sitemap.xml"],
  ]) {
    const redirect = legacyRedirects.get(source);
    assert.equal(redirect.headers.Location, destination);
    assert.equal(redirect.status, 308);
    assert.deepEqual(redirect.has, legacyHostCondition);
  }
  assert.equal(legacyRedirects.has("/mcp"), false);
  assert.equal(legacyRedirects.has("/review-intel/mcp"), false);
  assert.equal(legacyRedirects.has("/api/search"), false);
  assert.equal(legacyRedirects.has("/api/extract"), false);
});

test("the crawler files publish an accurate sitemap and optional llms content map", async () => {
  const robots = await readFile(new URL("robots.txt", webUrl), "utf8");
  const sitemap = await readFile(new URL("sitemap.xml", webUrl), "utf8");
  const llms = await readFile(new URL("llms.txt", webUrl), "utf8");

  assert.match(robots, /Sitemap: https:\/\/www\.willthiseverwork\.com\/review-intel\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/www\.willthiseverwork\.com\/review-intel\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/www\.willthiseverwork\.com\/review-intel\/setup\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/www\.willthiseverwork\.com\/review-intel\/privacy\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/www\.willthiseverwork\.com\/review-intel\/extension\/privacy\/<\/loc>/);
  assert.doesNotMatch(sitemap, /review-intel\/mcp|review-intel\/api/);
  assert.match(sitemap, /<lastmod>2026-09-26<\/lastmod>/);
  assert.match(llms, /optional content map/);
  assert.match(llms, /not a crawler permission policy/);
  assert.match(llms, /https:\/\/www\.willthiseverwork\.com\/review-intel\/robots\.txt/);
  assert.match(llms, /MCP returns up to 500 reviews per response/);
  assert.match(llms, /cannot by itself prove revenue, retention, causality, or the views of every user/);
  assert.doesNotMatch(llms, /reviews\.doubledash\.me\/mcp|doubledash\.me\/tools\/review-intelligence/);
});

test("public product docs keep setup and MCP links on the canonical Review Intel surface", async () => {
  const publicDocs = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../plugins/review-intelligence/README.md", import.meta.url), "utf8"),
    readFile(new URL("llms.txt", webUrl), "utf8"),
    readFile(new URL("index.html", webUrl), "utf8"),
    readFile(new URL("setup.html", webUrl), "utf8"),
    readFile(new URL("privacy.html", webUrl), "utf8"),
  ]);

  for (const source of publicDocs) {
    assert.doesNotMatch(source, /reviews\.doubledash\.me\/mcp|(?:www\.)?doubledash\.me\/tools\/review-intelligence/);
  }
});

test("production analytics keeps page URLs private while passing only validated UTM campaign fields", async () => {
  const html = await readFile(new URL("index.html", webUrl), "utf8");
  const setupHtml = await readFile(new URL("setup.html", webUrl), "utf8");
  const source = await readFile(new URL("site.js", webUrl), "utf8");
  const shared = await readFile(new URL("analytics.js", webUrl), "utf8");
  const inlineScript = shared.replaceAll("export ", "") + "\n" + source.replace(/^import[^;]+;/, "");
  const setupScript = inlineScript;
  assert.match(html, /src="site\.js"/);
  assert.match(setupHtml, /src="site\.js"/);
  assert.match(source, /G-R8F1QX6HKC/);
  assert.doesNotMatch(`${html}\n${setupHtml}\n${source}`, /G-5W48W3ZCBF/);

  function execute(script, href, referrer = "") {
    const url = new URL(href);
    const context = {
      Date,
      URL,
      URLSearchParams,
      document: {
        referrer,
        createElement: () => ({}),
        head: { append: () => {} },
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener: () => {}
      },
      window: {
        dataLayer: [],
        location: {
          hostname: url.hostname,
          origin: url.origin,
          pathname: url.pathname,
          search: url.search,
          href: url.href
        }
      }
    };
    runInNewContext(script, context);
    return context.window.dataLayer.map((entry) => Array.from(entry));
  }

  const analyticsCalls = execute(
    inlineScript,
    "https://www.willthiseverwork.com/review-intel/?utm_id=RI2026&utm_source=Threads&utm_medium=social&utm_campaign=review_intel&utm_content=post&utm_term=app-reviews&app_url=private#fragment",
    "https://www.willthiseverwork.com/review-intel/?app_url=private&utm_source=threads#fragment"
  );
  const pageConfig = analyticsCalls.find(([command]) => command === "config");
  const aiEvent = analyticsCalls.find(([command, name]) => command === "event" && name === "ai_referral_landing");

  assert.deepEqual(JSON.parse(JSON.stringify(pageConfig[2])), {
    page_location: "https://www.willthiseverwork.com/review-intel/",
    page_referrer: "https://www.willthiseverwork.com/",
    campaign_id: "RI2026",
    campaign_source: "Threads",
    campaign_medium: "social",
    campaign_name: "review_intel",
    campaign_content: "post",
    campaign_term: "app-reviews"
  });
  assert.equal(aiEvent, undefined);

  const unsafeCampaignCalls = execute(
    setupScript,
    "https://www.willthiseverwork.com/review-intel/setup/?utm_source=threads&utm_medium=social&utm_campaign=private%40example.com&utm_content=post%2Fwith%2Fpath&utm_term=x%3Femail%3Dprivate",
    "https://search.example.com/results?q=private"
  );
  const unsafePageConfig = unsafeCampaignCalls.find(([command]) => command === "config");
  assert.deepEqual(JSON.parse(JSON.stringify(unsafePageConfig[2])), {
    page_location: "https://www.willthiseverwork.com/review-intel/setup/",
    page_referrer: "https://search.example.com/",
    campaign_source: "threads",
    campaign_medium: "social"
  });
});
