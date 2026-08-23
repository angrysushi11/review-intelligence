import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRetrieverUrl, isSupportedStoreUrl, normalizeStoreUrl } from "../extension/retriever-url.js";

test("the Chrome extension opens supported store pages in Review Retriever", () => {
  const appStoreUrl = "https://apps.apple.com/us/app/example/id123456789?platform=iphone";
  const playUrl = "https://play.google.com/store/apps/details?id=com.example.app&hl=en_US";

  assert.equal(isSupportedStoreUrl(appStoreUrl), true);
  assert.equal(isSupportedStoreUrl(playUrl), true);

  for (const storeUrl of [appStoreUrl, playUrl]) {
    const target = new URL(buildRetrieverUrl(storeUrl));
    assert.equal(target.origin, "https://reviews.doubledash.me");
    assert.equal(target.pathname, "/");
    assert.equal(target.searchParams.has("app_url"), false);
    assert.equal(new URLSearchParams(target.hash.slice(1)).get("app_url"), normalizeStoreUrl(storeUrl));
    assert.equal(target.searchParams.get("source"), "chrome-extension");
    assert.equal(target.searchParams.get("route"), "chrome-extension");
    assert.equal(target.searchParams.get("content_cluster"), "review-aso");
  }
});

test("the bridge strips fragments and tracking parameters from supported store URLs", () => {
  assert.equal(
    normalizeStoreUrl("https://apps.apple.com/us/app/example/id123456789?platform=iphone&ct=private-campaign#reviews"),
    "https://apps.apple.com/us/app/example/id123456789"
  );
  assert.equal(
    normalizeStoreUrl("https://play.google.com/store/apps/details?id=com.example.app&hl=en_US&referrer=private-campaign#reviews"),
    "https://play.google.com/store/apps/details?id=com.example.app"
  );
});

test("unsupported and privileged pages open a blank Retriever without leaking their URL", () => {
  for (const tabUrl of [
    "https://example.com/private",
    "https://apps.apple.com/us/iphone",
    "https://apps.apple.com.evil.example/us/app/example/id123456789",
    "https://play.google.com/store/games",
    "https://play.google.com/store/apps/details",
    "chrome://settings/",
    "not a url",
    undefined
  ]) {
    assert.equal(isSupportedStoreUrl(tabUrl), false);
    const target = new URL(buildRetrieverUrl(tabUrl));
    assert.equal(target.searchParams.has("app_url"), false);
    assert.equal(new URLSearchParams(target.hash.slice(1)).has("app_url"), false);
  }
});

test("the MVP requests only activeTab and has no page-level access", async () => {
  const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["activeTab"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.action.default_title, "Open this public app URL in Review Retriever");
  assert.match(background, /chrome\.action\.onClicked\.addListener/);
  assert.match(background, /chrome\.tabs\.create/);
  assert.doesNotMatch(background, /fetch\(|chrome\.storage|chrome\.scripting/);
});

test("the service worker opens exactly one sanitized Retriever tab per deliberate click", async () => {
  const createdTabs = [];
  let clickHandler;
  const previousChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: {
      action: {
        onClicked: {
          addListener(handler) {
            clickHandler = handler;
          }
        }
      },
      tabs: {
        create(options) {
          createdTabs.push(options);
        }
      }
    }
  });

  try {
    const backgroundUrl = new URL("../extension/background.js", import.meta.url);
    backgroundUrl.searchParams.set("test", String(Date.now()));
    await import(backgroundUrl.href);

    assert.equal(typeof clickHandler, "function");

    clickHandler({
      url: "https://play.google.com/store/apps/details?id=com.example.app&hl=en_US&referrer=private-campaign#reviews"
    });
    clickHandler({ url: "chrome://settings/" });

    assert.equal(createdTabs.length, 2);

    const supportedTarget = new URL(createdTabs[0].url);
    assert.equal(supportedTarget.origin, "https://reviews.doubledash.me");
    assert.equal(
      new URLSearchParams(supportedTarget.hash.slice(1)).get("app_url"),
      "https://play.google.com/store/apps/details?id=com.example.app"
    );
    assert.equal(supportedTarget.searchParams.get("source"), "chrome-extension");

    const unsupportedTarget = new URL(createdTabs[1].url);
    assert.equal(unsupportedTarget.origin, "https://reviews.doubledash.me");
    assert.equal(new URLSearchParams(unsupportedTarget.hash.slice(1)).has("app_url"), false);
  } finally {
    if (previousChrome) Object.defineProperty(globalThis, "chrome", previousChrome);
    else delete globalThis.chrome;
  }
});

test("the privacy disclosure matches the extension's narrow data boundary", async () => {
  const privacy = await readFile(new URL("../extension/PRIVACY.md", import.meta.url), "utf8");

  assert.match(privacy, /does one thing/i);
  assert.match(privacy, /activeTab/);
  assert.match(privacy, /does not handle unrelated pages/i);
  assert.match(privacy, /does not retrieve reviews itself/i);
  assert.match(privacy, /no storage permission/i);
  assert.match(privacy, /web browsing activity/i);
  assert.match(privacy, /Chrome Web Store User Data Policy/i);
  assert.match(privacy, /Google Analytics/);
  assert.match(privacy, /Vercel/);
  assert.match(privacy, /dash@doubledash\.me/);
});

test("all executable extension code is packaged and contains no remote-code loader", async () => {
  const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
  const retrieverUrl = await readFile(new URL("../extension/retriever-url.js", import.meta.url), "utf8");

  assert.equal(manifest.background.service_worker, "background.js");
  for (const source of [background, retrieverUrl]) {
    assert.doesNotMatch(source, /eval\s*\(|new Function\s*\(|import\s*\(\s*["']https?:|<script/i);
  }
});
