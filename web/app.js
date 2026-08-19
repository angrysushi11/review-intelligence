import { COUNTRY_OPTIONS } from "./markets.js";

const STORE_LINK_PATTERN = /apps\.apple\.com|itunes\.apple\.com|play\.google\.com/i;
const VALIDATION_MESSAGE = "that doesn't look like a store link";
const NETWORK_MESSAGE = "couldn't reach the store — try again in a minute";

const idle = document.querySelector("#state-idle");
const done = document.querySelector("#state-done");
const form = document.querySelector("#extract-form");
const appUrl = document.querySelector("#app-url");
const country = document.querySelector("#country");
const error = document.querySelector("#form-error");
const extractButton = document.querySelector("#extract-btn");
const extractLabel = document.querySelector("#extract-label");
const appIcon = document.querySelector("#app-icon");
const packetTitle = document.querySelector("#packet-title");
const receiptMeta = document.querySelector("#receipt-meta");
const packetLedger = document.querySelector("#packet-ledger");
const peek = document.querySelector("#peek");
const startOver = document.querySelector("#start-over");
const copyButton = document.querySelector("#copy-btn");
const downloadButton = document.querySelector("#download-btn");
const gptAnalysisLink = document.querySelector("#gpt-analysis-link");
const claudeButton = document.querySelector("#claude-btn");
const claudeSteps = document.querySelector("#claude-steps");
const claudeSkillDownload = document.querySelector("#claude-skill-download");
const claudeSkillsLink = document.querySelector("#claude-skills-link");

const query = new URLSearchParams(window.location.search);
const querySource = query.get("source_path") || query.get("source") || "";
const queryRoute = query.get("route") || "";
const queryCluster = query.get("content_cluster") || "";

if (querySource) sessionStorage.setItem("dd_review_source", querySource);
if (queryRoute) sessionStorage.setItem("dd_review_route", queryRoute);
if (queryCluster) sessionStorage.setItem("dd_review_cluster", queryCluster);

const originalSource = querySource || sessionStorage.getItem("dd_review_source") || document.referrer || "/review-retriever/";
const originalRoute = queryRoute || sessionStorage.getItem("dd_review_route") || "review-intelligence";
const originalCluster = queryCluster || sessionStorage.getItem("dd_review_cluster") || "review-aso";

let markdown = "";
let currentFilename = "reviews.md";
let isLoading = false;

renderCountryOptions();

track("review_tool_open", {
  route: originalRoute,
  content_cluster: originalCluster,
});

appUrl.addEventListener("input", clearError);
form.addEventListener("submit", handleExtract);
startOver.addEventListener("click", resetRetriever);
copyButton.addEventListener("click", copyMarkdown);
downloadButton.addEventListener("click", downloadMarkdown);
claudeButton.addEventListener("click", toggleClaudeSteps);
appIcon.addEventListener("error", hideAppIcon);

gptAnalysisLink.addEventListener("click", () => {
  track("review_analysis_open", { tool: "gpt", cta_id: "review_retriever_gpt" });
});
claudeSkillDownload.addEventListener("click", () => {
  track("review_analysis_open", { tool: "claude_skill_download", cta_id: "review_retriever_claude_download" });
});
claudeSkillsLink.addEventListener("click", () => {
  track("review_analysis_open", { tool: "claude_skills", cta_id: "review_retriever_claude_open" });
});

async function handleExtract(event) {
  event.preventDefault();
  if (isLoading) return;

  const link = appUrl.value.trim();
  if (!looksLikeStoreLink(link)) {
    showError(VALIDATION_MESSAGE);
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

    track(result.count > 0 ? "review_extract_success" : "review_extract_empty", {
      platform: platformFromUrl(link),
      ...(result.count > 0 ? { review_count_bucket: reviewCountBucket(result.count) } : {}),
      content_cluster: originalCluster,
    });

    idle.hidden = true;
    done.hidden = false;
    window.scrollTo(0, 0);
  } catch {
    track("review_extract_error", {
      platform: platformFromUrl(link),
      error_type: "extract_failed",
    });
    showError(NETWORK_MESSAGE);
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

function renderCountryOptions() {
  const fragment = document.createDocumentFragment();
  for (const option of COUNTRY_OPTIONS) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    optionElement.selected = option.value === "us";
    fragment.append(optionElement);
  }
  country.replaceChildren(fragment);
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
  if (!result.count) return "The public source returned no written reviews for this request.";
  if (result.store === "App Store" && /Visible App Store review cards/i.test(result.source)) {
    return "Apple's full public review feed was unavailable, so this packet uses the visible review cards Apple exposed.";
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
  extractLabel.textContent = loading ? "Extracting…" : "Extract reviews";
}

function resetRetriever() {
  done.hidden = true;
  idle.hidden = false;
  claudeSteps.hidden = true;
  claudeButton.setAttribute("aria-expanded", "false");
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
  window.scrollTo(0, 0);
  appUrl.focus();
}

async function copyMarkdown() {
  await navigator.clipboard.writeText(markdown);
  track("review_export_action", { action: "copy" });
  copyButton.textContent = "Copied";
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
