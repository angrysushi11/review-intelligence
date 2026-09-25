import { COUNTRY_OPTIONS } from "./markets.js";
import {
  CHATGPT_NEW_CHAT_URL,
  CHATGPT_REVIEW_CAP,
  CLAUDE_NEW_CHAT_URL,
  DEFAULT_QUESTION_ID,
  QUESTION_GROUPS,
  buildAnalysisPayload
} from "./analysis-prompt.js?v=20260925-output";

const STORE_LINK_PATTERN = /apps\.apple\.com|itunes\.apple\.com|play\.google\.com/i;
const VALIDATION_MESSAGE = "that doesn't look like a store link";
const PICK_APP_MESSAGE = "pick an app from the list";
const NETWORK_MESSAGE = "couldn't reach the store — try again in a minute";
const EXTRACT_LABEL = "Get the reviews";
const LOADING_LABEL = "Getting the reviews…";

const idle = document.querySelector("#state-idle");
const done = document.querySelector("#state-done");
const form = document.querySelector("#extract-form");
const appUrl = document.querySelector("#app-url");
const searchResultsElement = document.querySelector("#search-results");
const country = document.querySelector("#country");
const error = document.querySelector("#form-error");
const retrievalStatus = document.querySelector("#retrieval-status");
const extractButton = document.querySelector("#extract-btn");
const extractLabel = document.querySelector("#extract-label");
const connectorLinks = document.querySelectorAll("[data-connect-placement]");
const repeatNudge = document.querySelector("#repeat-nudge");
const demoChips = document.querySelectorAll(".demo-chip");
const appIcon = document.querySelector("#app-icon");
const packetTitle = document.querySelector("#packet-title");
const receiptMeta = document.querySelector("#receipt-meta");
const packetLedger = document.querySelector("#packet-ledger");
const peek = document.querySelector("#peek");
const startOver = document.querySelector("#start-over");
const analyzeSection = document.querySelector("#analyze");
const questionSelect = document.querySelector("#question-select");
const analyzeClaude = document.querySelector("#analyze-claude");
const analyzeClaudeNote = document.querySelector("#analyze-claude-note");
const analyzeChatGpt = document.querySelector("#analyze-chatgpt");
const analyzeChatGptNote = document.querySelector("#analyze-chatgpt-note");
const analyzeToast = document.querySelector("#analyze-toast");
const copyButton = document.querySelector("#copy-btn");
const downloadButton = document.querySelector("#download-btn");
const claudeButton = document.querySelector("#claude-btn");
const claudeSteps = document.querySelector("#claude-steps");
const claudeSkillDownload = document.querySelector("#claude-skill-download");
const claudeSkillsLink = document.querySelector("#claude-skills-link");

const query = new URLSearchParams(window.location.search);
const fragment = new URLSearchParams(window.location.hash.slice(1));
const querySource = query.get("source_path") || query.get("source") || "";
const queryRoute = query.get("route") || "";
const queryCluster = query.get("content_cluster") || "";
const queryAppUrl = fragment.get("app_url") || query.get("app_url") || "";

if (querySource) safeSessionSet("dd_review_source", querySource);
if (queryRoute) safeSessionSet("dd_review_route", queryRoute);
if (queryCluster) safeSessionSet("dd_review_cluster", queryCluster);

const originalSource = querySource || safeSessionGet("dd_review_source") || document.referrer || "/review-retriever/";
const originalRoute = queryRoute || safeSessionGet("dd_review_route") || "review-intelligence";
const originalCluster = queryCluster || safeSessionGet("dd_review_cluster") || "review-aso";

let markdown = "";
let currentFilename = "reviews.md";
let isLoading = false;
let searchTimer = null;
let searchController = null;
let searchSequence = 0;
let searchResults = [];
let activeSearchResult = -1;
let successfulExtractions = Math.max(0, Number(safeSessionGet("rr_successful_extractions")) || 0);

renderCountryOptions();
renderQuestionOptions();
analyzeClaude.href = CLAUDE_NEW_CHAT_URL;
analyzeChatGpt.href = CHATGPT_NEW_CHAT_URL;

if (looksLikeStoreLink(queryAppUrl)) {
  appUrl.value = queryAppUrl;
  syncCountryFromLink();
  if (window.location.hash) {
    const cleanLocation = new URL(window.location.href);
    cleanLocation.hash = "";
    window.history.replaceState(null, "", cleanLocation);
  }
}

track("review_tool_open", {
  route: originalRoute,
  content_cluster: originalCluster,
});

appUrl.addEventListener("input", handleUrlInput);
appUrl.addEventListener("keydown", handleSearchKeydown);
searchResultsElement.addEventListener("click", handleSearchPick);
form.addEventListener("submit", handleExtract);
for (const chip of demoChips) {
  chip.addEventListener("click", () => startDemo(chip));
}
for (const link of connectorLinks) {
  link.addEventListener("click", () => track("review_connect_click", { placement: link.dataset.connectPlacement }));
}
startOver.addEventListener("click", resetRetriever);
questionSelect.addEventListener("change", () => {
  track("review_question_pick", { question_id: questionSelect.value });
});
analyzeClaude.addEventListener("click", () => handleAnalyze("claude"));
analyzeChatGpt.addEventListener("click", () => handleAnalyze("chatgpt"));
copyButton.addEventListener("click", copyMarkdown);
downloadButton.addEventListener("click", downloadMarkdown);
claudeButton.addEventListener("click", toggleClaudeSteps);
appIcon.addEventListener("error", hideAppIcon);

claudeSkillDownload.addEventListener("click", () => {
  track("review_analysis_open", { tool: "claude_skill_download", cta_id: "review_retriever_claude_download" });
});
claudeSkillsLink.addEventListener("click", () => {
  track("review_analysis_open", { tool: "claude_skills", cta_id: "review_retriever_claude_open" });
});

function handleUrlInput() {
  clearError();
  syncCountryFromLink();
  const value = appUrl.value.trim();
  cancelSearch();
  closeSearchResults();
  if (looksLikeStoreLink(value) || value.length < 2) return;

  const sequence = ++searchSequence;
  searchTimer = window.setTimeout(() => {
    searchTimer = null;
    void searchForApps(value, sequence);
  }, 400);
}

async function searchForApps(term, sequence) {
  searchController = new AbortController();
  try {
    const response = await fetch(`/api/search?${new URLSearchParams({ term, country: country.value })}`, {
      signal: searchController.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "search failed");
    if (sequence !== searchSequence || appUrl.value.trim() !== term) return;
    searchResults = Array.isArray(payload.results) ? payload.results : [];
    activeSearchResult = -1;
    renderSearchResults();
    track("review_search", { result_count: searchResults.length });
  } catch (searchError) {
    if (searchError?.name !== "AbortError" && sequence === searchSequence) closeSearchResults();
  } finally {
    if (sequence === searchSequence) searchController = null;
  }
}

function cancelSearch() {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = null;
  searchSequence += 1;
  searchController?.abort();
  searchController = null;
}

function renderSearchResults() {
  const fragment = document.createDocumentFragment();
  searchResults.forEach((result, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.dataset.index = String(index);
    button.id = `search-result-${index}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === activeSearchResult));

    if (result.iconUrl) {
      const icon = document.createElement("img");
      icon.className = "search-result__icon";
      icon.src = result.iconUrl;
      icon.alt = "";
      button.append(icon);
    }

    const copy = document.createElement("span");
    copy.className = "search-result__copy";
    const name = document.createElement("span");
    name.className = "search-result__name";
    name.textContent = result.name;
    const developer = document.createElement("span");
    developer.className = "search-result__developer";
    developer.textContent = result.developer || "Developer unavailable";
    copy.append(name, developer);
    const store = document.createElement("span");
    store.className = "search-result__store";
    store.textContent = result.store === "app_store" ? "App Store" : "Google Play";
    button.append(copy, store);
    item.append(button);
    fragment.append(item);
  });
  searchResultsElement.replaceChildren(fragment);
  const expanded = searchResults.length > 0;
  searchResultsElement.hidden = !expanded;
  appUrl.setAttribute("aria-expanded", String(expanded));
  if (activeSearchResult >= 0) appUrl.setAttribute("aria-activedescendant", `search-result-${activeSearchResult}`);
  else appUrl.removeAttribute("aria-activedescendant");
}

function closeSearchResults() {
  searchResults = [];
  activeSearchResult = -1;
  searchResultsElement.replaceChildren();
  searchResultsElement.hidden = true;
  appUrl.setAttribute("aria-expanded", "false");
  appUrl.removeAttribute("aria-activedescendant");
}

function handleSearchKeydown(event) {
  if (!searchResults.length) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSearchResults();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    activeSearchResult = (activeSearchResult + direction + searchResults.length) % searchResults.length;
    renderSearchResults();
    return;
  }
  if (event.key === "Enter" && activeSearchResult >= 0) {
    event.preventDefault();
    pickSearchResult(activeSearchResult);
  }
}

function handleSearchPick(event) {
  const button = event.target.closest?.("button[data-index]");
  if (!button) return;
  pickSearchResult(Number(button.dataset.index));
}

function pickSearchResult(index) {
  const result = searchResults[index];
  if (!result || isLoading) return;
  cancelSearch();
  appUrl.value = result.url;
  syncCountryFromLink();
  closeSearchResults();
  track("review_search_pick", { store: result.store });
  startExtraction();
}

function handleExtract(event) {
  event.preventDefault();
  startExtraction();
}

function startDemo(chip) {
  if (isLoading) return;
  appUrl.value = chip.dataset.demoUrl || "";
  setCountry("us");
  track("review_demo_pick", { demo_app: chip.dataset.demoName || "unknown" });
  startExtraction();
}

async function startExtraction() {
  if (isLoading) return;

  const link = appUrl.value.trim();
  if (!looksLikeStoreLink(link)) {
    showError(link ? PICK_APP_MESSAGE : VALIDATION_MESSAGE);
    appUrl.focus();
    return;
  }

  clearError();
  setLoading(true);
  track("review_extract_start", {
    platform: platformFromUrl(link),
    route: originalRoute,
  });

  try {
    const result = await fetchReviews(link, country.value);
    markdown = result.markdown;
    currentFilename = result.filename;
    renderPacket(result);
    renderSamples(result.samples);
    if (result.count > 0) {
      successfulExtractions += 1;
      safeSessionSet("rr_successful_extractions", String(successfulExtractions));
    }
    repeatNudge.hidden = result.count === 0 || successfulExtractions < 2;
    prepareAnalyze(result);

    track(result.count > 0 ? "review_extract_success" : "review_extract_empty", {
      platform: platformFromUrl(link),
      ...(result.count > 0 ? { review_count_bucket: reviewCountBucket(result.count) } : {}),
      content_cluster: originalCluster,
    });

    idle.hidden = true;
    done.hidden = false;
    retrievalStatus.textContent = `${result.appName} review packet ready with ${result.count} ${pluralize("written review", result.count)}.`;
    window.scrollTo(0, 0);
    packetTitle.focus();
  } catch {
    track("review_extract_error", {
      platform: platformFromUrl(link),
      error_type: "extract_failed",
    });
    showError(NETWORK_MESSAGE);
    retrievalStatus.textContent = NETWORK_MESSAGE;
  } finally {
    setLoading(false);
  }
}

async function fetchReviews(link, selectedCountry) {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: link,
      market: selectedCountry,
      platform: "auto",
      limit: 500,
    }),
  });

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("invalid response");
  }

  if (!response.ok) throw new Error(payload.error || "extract failed");

  const dataset = payload.dataset || {};
  return {
    dataset,
    filename: payload.filename || "reviews.md",
    count: Number(dataset.reviews_exported || 0),
    appName: dataset.app_name || "App",
    iconUrl: safeImageUrl(dataset.app_icon_url),
    appId: dataset.app_id || "",
    store: platformLabel(dataset.platform),
    country: dataset.country || selectedCountry,
    countryName: dataset.country_name || (dataset.country || selectedCountry).toUpperCase(),
    dateRange: dataset.date_range || "Date unavailable",
    source: dataset.source || "Public review source",
    ratingDistribution: dataset.rating_distribution || {},
    languages: dataset.language_name || "",
    markdown: payload.markdown || "",
    samples: samplesFromMarkdown(payload.markdown || ""),
  };
}

function looksLikeStoreLink(value) {
  return STORE_LINK_PATTERN.test(value);
}

// Apple links carry the storefront in the path (/gb/app/…); Play links may carry ?gl=gb.
function countryFromStoreUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (/(^|\.)apple\.com$/i.test(url.hostname)) {
      return url.pathname.match(/^\/([a-z]{2})\/app\//i)?.[1]?.toLowerCase() || "";
    }
    if (url.hostname === "play.google.com") {
      return (url.searchParams.get("gl") || "").toLowerCase();
    }
  } catch {
    return "";
  }
  return "";
}

function syncCountryFromLink() {
  const code = countryFromStoreUrl(appUrl.value);
  if (code) setCountry(code);
}

function setCountry(code) {
  const available = Array.from(country.options || []).some((option) => option.value === code);
  if (available) country.value = code;
}

function renderCountryOptions() {
  const fragment = document.createDocumentFragment();
  for (const option of COUNTRY_OPTIONS) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    optionElement.selected = option.value === defaultCountryFromNavigator();
    fragment.append(optionElement);
  }
  country.replaceChildren(fragment);
}

function defaultCountryFromNavigator() {
  const region = String(navigator.language || "").match(/-([a-z]{2})\b/i)?.[1]?.toLowerCase();
  return COUNTRY_OPTIONS.some((option) => option.value === region) ? region : "us";
}

function renderQuestionOptions() {
  const fragment = document.createDocumentFragment();
  for (const group of QUESTION_GROUPS) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    for (const question of group.questions) {
      const option = document.createElement("option");
      option.value = question.id;
      option.textContent = question.label;
      optgroup.append(option);
    }
    fragment.append(optgroup);
  }
  questionSelect.replaceChildren(fragment);
  questionSelect.value = DEFAULT_QUESTION_ID;
}

function samplesFromMarkdown(value) {
  const samples = [];
  const reviewPattern = /### Review \d+\n([\s\S]*?)```text\n([\s\S]*?)\n```/g;
  let match;

  while (samples.length < 3 && (match = reviewPattern.exec(value))) {
    const metadata = match[1];
    const review = normalizeInlineText(match[2]);
    if (!review) continue;
    samples.push({
      rating: Number(fieldFromReviewBlock(metadata, "Rating")) || 0,
      date: shortDate(fieldFromReviewBlock(metadata, "Date")),
      title: fieldFromReviewBlock(metadata, "Title"),
      language: fieldFromReviewBlock(metadata, "Language"),
      text: review
    });
  }

  return samples;
}

function renderSamples(samples) {
  const fragment = document.createDocumentFragment();
  for (const sample of samples.slice(0, 3)) {
    const card = document.createElement("article");
    card.className = "review-card";

    const meta = document.createElement("div");
    meta.className = "review-card__meta";

    const rating = document.createElement("span");
    rating.className = "review-card__rating";
    rating.textContent = stars(sample.rating);
    meta.append(rating);

    const date = document.createElement("span");
    date.textContent = [sample.date, sample.language].filter(Boolean).join(" · ") || "date unavailable";
    meta.append(date);

    card.append(meta);

    if (sample.title) {
      const title = document.createElement("p");
      title.className = "review-card__title";
      title.textContent = sample.title;
      card.append(title);
    }

    const text = document.createElement("p");
    text.className = "review-card__text";
    text.textContent = sample.text;
    card.append(text);

    fragment.append(card);
  }
  peek.replaceChildren(fragment);
  peek.hidden = samples.length === 0;
}

function renderPacket(result) {
  packetTitle.textContent = result.appName;
  renderAppIcon(result);
  const note = packetNote(result);
  receiptMeta.textContent = note;
  receiptMeta.hidden = !note;

  const ledgerRows = [
    ["Reviews", `${result.count} unique written ${pluralize("review", result.count)}`],
    ["Storefront", `${result.store} · ${result.countryName}`],
    ["Date range", result.dateRange],
    ["Rating mix", ratingMix(result.ratingDistribution)],
    ["Source", result.source],
    ...(result.languages ? [["Languages", result.languages]] : [])
  ];

  packetLedger.replaceChildren(...ledgerRows.map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    return row;
  }));
}

function prepareAnalyze(result) {
  analyzeSection.hidden = result.count === 0;
  hideAnalyzeToast();
  questionSelect.value = DEFAULT_QUESTION_ID;
  analyzeClaudeNote.textContent = `All ${result.count} ${pluralize("review", result.count)}.`;
  analyzeChatGptNote.textContent = result.count > CHATGPT_REVIEW_CAP
    ? `Newest ${CHATGPT_REVIEW_CAP} of ${result.count} reviews.`
    : `All ${result.count} ${pluralize("review", result.count)}.`;
}

// The link opens the chat in a new tab; the click copies the reviews and the prompt first.
function handleAnalyze(tool) {
  const isChatGpt = tool === "chatgpt";
  const destination = isChatGpt ? "ChatGPT" : "Claude";
  const payload = buildAnalysisPayload({
    markdown,
    questionId: questionSelect.value,
    maxReviews: isChatGpt ? CHATGPT_REVIEW_CAP : Infinity,
  });
  const copied = payload.included < payload.total
    ? `the newest ${payload.included} of ${payload.total} reviews`
    : `${payload.included} ${pluralize("review", payload.included)}`;

  copyText(payload.text)
    .then(() => showAnalyzeToast(`Copied. In ${destination}, ${pasteInstruction()} and send.`))
    .catch(() => showAnalyzeToast(`Couldn't copy automatically. Use Copy below, then paste it into ${destination}.`, true));

  track("review_analysis_open", {
    tool: isChatGpt ? "chatgpt_oneclick" : "claude_oneclick",
    cta_id: isChatGpt ? "review_retriever_chatgpt_oneclick" : "review_retriever_claude_oneclick",
    question_id: payload.question.id,
    review_count_bucket: reviewCountBucket(payload.included),
  });
}

function pasteInstruction() {
  if (window.matchMedia?.("(pointer: coarse)")?.matches) return "long-press the message box, tap Paste";
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad/i.test(platform) ? "press ⌘V" : "press Ctrl+V";
}

function showAnalyzeToast(message, isError = false) {
  analyzeToast.textContent = message;
  analyzeToast.classList.toggle("analyze-toast--error", isError);
  analyzeToast.hidden = false;
}

function hideAnalyzeToast() {
  analyzeToast.hidden = true;
  analyzeToast.textContent = "";
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    if (copied) resolve();
    else reject(new Error("copy failed"));
  });
}

function renderAppIcon(result) {
  if (!result.iconUrl) {
    hideAppIcon();
    return;
  }

  appIcon.alt = `${result.appName} app icon`;
  appIcon.src = result.iconUrl;
  appIcon.hidden = false;
}

function hideAppIcon() {
  appIcon.hidden = true;
  appIcon.alt = "";
  appIcon.removeAttribute("src");
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function packetNote(result) {
  const isAppStore = result.store === "App Store";
  if (!result.count) {
    return isAppStore
      ? "Apple's public review feed returned no written reviews. It can be flaky, so try again in a minute or pick another country."
      : "The public source returned no written reviews for this request.";
  }
  if (isAppStore && /Visible App Store review cards/i.test(result.source)) {
    return "Apple's full public review feed was unavailable, so this packet uses the visible review cards Apple exposed. Try again in a minute for more.";
  }
  if (isAppStore && result.count <= 10) {
    return "Only a few reviews came back. Apple's public feed can be flaky, so try again in a minute or pick another country.";
  }
  return "";
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
  appUrl.setAttribute("aria-invalid", "true");
}

function clearError() {
  error.textContent = VALIDATION_MESSAGE;
  error.hidden = true;
  appUrl.removeAttribute("aria-invalid");
}

function setLoading(loading) {
  isLoading = loading;
  extractButton.classList.toggle("busy", loading);
  extractButton.setAttribute("aria-busy", String(loading));
  extractLabel.textContent = loading ? LOADING_LABEL : EXTRACT_LABEL;
  if (loading) retrievalStatus.textContent = "Retrieving public app reviews…";
}

function resetRetriever() {
  done.hidden = true;
  idle.hidden = false;
  claudeSteps.hidden = true;
  claudeButton.setAttribute("aria-expanded", "false");
  hideAnalyzeToast();
  appUrl.value = "";
  markdown = "";
  currentFilename = "reviews.md";
  packetTitle.textContent = "Reviews exported";
  hideAppIcon();
  receiptMeta.textContent = "";
  receiptMeta.hidden = true;
  packetLedger.replaceChildren();
  peek.replaceChildren();
  peek.hidden = false;
  clearError();
  retrievalStatus.textContent = "";
  window.scrollTo(0, 0);
  appUrl.focus();
}

async function copyMarkdown() {
  try {
    await copyText(markdown);
    copyButton.textContent = "Copied";
  } catch {
    copyButton.textContent = "Couldn't copy";
  }
  track("review_export_action", { action: "copy" });
  window.setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1600);
}

function downloadMarkdown() {
  track("review_export_action", { action: "download" });
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = currentFilename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fieldFromReviewBlock(block, fieldName) {
  const pattern = new RegExp(`- ${fieldName}:\\s*(.+)`);
  return normalizeInlineText(block.match(pattern)?.[1] || "");
}

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stars(rating) {
  const safeRating = Math.max(0, Math.min(Number(rating) || 0, 5));
  if (!safeRating) return "rating unavailable";
  return `${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)}`;
}

function shortDate(value) {
  if (!value || value === "Unknown") return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString().slice(0, 10);
}

function ratingMix(distribution = {}) {
  return [1, 2, 3, 4, 5]
    .map((rating) => `${rating}★ ${Number(distribution[String(rating)] || 0)}`)
    .join(" · ");
}

function pluralize(word, count) {
  return Number(count) === 1 ? word : `${word}s`;
}

function toggleClaudeSteps() {
  const willOpen = claudeSteps.hidden;
  claudeSteps.hidden = !willOpen;
  claudeButton.setAttribute("aria-expanded", String(willOpen));
  track("review_analysis_open", { tool: "claude_skill_steps", cta_id: "review_retriever_claude_steps" });

  if (willOpen) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    claudeSteps.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  }
}

function platformLabel(platform) {
  if (platform === "google_play") return "Google Play";
  if (platform === "app_store") return "App Store";
  return "Store";
}

function platformFromUrl(value) {
  if (/play\.google\.com/i.test(value)) return "google_play";
  if (/apps\.apple\.com|itunes\.apple\.com/i.test(value)) return "app_store";
  return "unknown";
}

function reviewCountBucket(count) {
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 100) return "51-100";
  if (count <= 250) return "101-250";
  return "251-500";
}

function track(eventName, parameters = {}) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("event", eventName, {
    source_path: originalSource,
    page_path: window.location.pathname,
    content_cluster: originalCluster,
    ...parameters,
  });
}


function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function safeSessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* Continue without persistence. */ }
}
