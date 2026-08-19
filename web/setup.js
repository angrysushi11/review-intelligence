// Archived setup-route version · 2026-08-10
import { COUNTRY_OPTIONS } from "./markets.js";

const form = document.querySelector("#extract-form");
const appUrl = document.querySelector("#app-url");
const market = document.querySelector("#market");
const countryButton = document.querySelector("#country-button");
const countryList = document.querySelector("#country-list");
const statusEl = document.querySelector("#status");
const datasetEl = document.querySelector("#dataset");
const markdownPanel = document.querySelector(".markdown-panel");
const markdownOutput = document.querySelector("#markdown-output");
const extractButton = document.querySelector("#extract-button");
const copyButton = document.querySelector("#copy-button");
const downloadButton = document.querySelector("#download-button");
const gptAnalysisLink = document.querySelector("#gpt-analysis-link");
const claudeSkillDownload = document.querySelector("#claude-skill-download");
const claudeSkillsLink = document.querySelector("#claude-skills-link");
const claudeConnectorLink = document.querySelector("#claude-connector-link");
const codexPluginGuide = document.querySelector("#codex-plugin-guide");

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

let currentFilename = "reviews.md";
let countryOptions = [];

renderCountryOptions();
countryButton.addEventListener("click", toggleCountryList);
countryList.addEventListener("click", handleCountryChoice);
countryButton.addEventListener("keydown", handleCountryKeydown);
countryList.addEventListener("keydown", handleCountryKeydown);
document.addEventListener("click", closeCountryListFromOutside);
gptAnalysisLink.addEventListener("click", () => track("review_analysis_open", { tool: "gpt", cta_id: "review_retriever_gpt" }));
claudeSkillDownload.addEventListener("click", () => track("review_analysis_open", { tool: "claude_skill_download", cta_id: "review_retriever_claude_download" }));
claudeSkillsLink.addEventListener("click", () => track("review_analysis_open", { tool: "claude_skills", cta_id: "review_retriever_claude_open" }));
claudeConnectorLink.addEventListener("click", () => track("review_analysis_open", { tool: "claude_connector", cta_id: "review_retriever_claude_connector" }));
codexPluginGuide.addEventListener("click", () => track("review_analysis_open", { tool: "codex_plugin", cta_id: "review_retriever_codex_install" }));

track("review_tool_open", {
  route: originalRoute,
  content_cluster: originalCluster,
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  track("review_extract_start", {
    platform: platformFromUrl(appUrl.value),
    route: originalRoute,
  });
  setLoading(true);
  setStatus("Fetching up to 500 public written reviews. This can take a few seconds.");

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: appUrl.value,
        market: market.value,
        platform: "auto",
        limit: 500
      })
    });
    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(raw.trim().slice(0, 180) || "The server returned a non-JSON response. Please try again.");
    }
    if (!response.ok) throw new Error(payload.error || "Could not extract reviews.");

    currentFilename = payload.filename || "reviews.md";
    markdownOutput.value = payload.markdown;
    renderDataset(payload.dataset);
    copyButton.disabled = false;
    downloadButton.disabled = false;
    if (payload.dataset.reviews_exported > 0) {
      track("review_extract_success", {
        platform: payload.dataset.platform,
        review_count_bucket: reviewCountBucket(payload.dataset.reviews_exported),
        content_cluster: originalCluster,
      });
      if ((payload.dataset.source || "").includes("Visible App Store review cards")) {
        setStatus(`Apple's full public review feed was unavailable. Extracted ${payload.dataset.reviews_exported} visible App Store review cards only. Copy or download this Markdown, then upload it to the Custom GPT.`);
      } else {
        setStatus(`Extracted ${payload.dataset.reviews_exported} unique ${platformLabel(payload.dataset.platform)} reviews. Copy or download this Markdown, then upload it to the Custom GPT.`);
      }
    } else {
      track("review_extract_empty", {
        platform: payload.dataset.platform,
        content_cluster: originalCluster,
      });
      if (payload.dataset.platform === "app_store") {
        setStatus("Apple returned 0 written reviews from public sources this time. Try again; Apple's public review endpoints can be flaky.");
      } else {
        setStatus(`${platformLabel(payload.dataset.platform)} returned 0 written reviews for this country.`);
      }
    }
    scrollToMarkdownOnMobile();
  } catch (error) {
    track("review_extract_error", {
      platform: platformFromUrl(appUrl.value),
      error_type: "extract_failed",
    });
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(markdownOutput.value);
  track("review_export_action", { action: "copy" });
  setStatus("Markdown copied. Paste it into the Custom GPT to analyze it.");
});

downloadButton.addEventListener("click", () => {
  track("review_export_action", { action: "download" });
  const blob = new Blob([markdownOutput.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = currentFilename;
  link.click();
  URL.revokeObjectURL(url);
});

function renderDataset(dataset) {
  const rows = [
    ["App name", dataset.app_name],
    ["App ID", dataset.app_id],
    ["Platform", platformLabel(dataset.platform)],
    ["Country", dataset.country_name || dataset.country?.toUpperCase()],
    ...(dataset.platform === "google_play" && dataset.language_name
      ? [[`Google Play ${dataset.language_names?.length > 1 ? "languages" : "language"} used`, dataset.language_name]]
      : []),
    ["Source", dataset.source || "Public review source"],
    ["Pages fetched", dataset.pages_fetched || "Unknown"],
    ["Requested limit", dataset.review_limit || "Unknown"],
    ["Reviews", dataset.reviews_exported],
    ["Date range", dataset.date_range],
    ["Category", dataset.app_store_category || "Unknown"],
    ["Genres", dataset.app_store_genres?.join(", ") || "Unknown"],
    ...(dataset.google_play_installs ? [["Google Play installs", dataset.google_play_installs]] : []),
    ...(dataset.google_play_score ? [["Google Play score", dataset.google_play_score]] : [])
  ];

  datasetEl.innerHTML = rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(String(value ?? ""))}</dd>
    </div>
  `).join("");
}

function renderCountryOptions() {
  countryOptions = COUNTRY_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

  countryList.innerHTML = countryOptions.map(({ value, label }) => `
    <button class="country-option" type="button" role="option" data-value="${escapeHtml(value)}" aria-selected="${value === market.value}">
      ${escapeHtml(label)}
    </button>
  `).join("");
  setCountry(market.value || "us");
}

function toggleCountryList() {
  const willOpen = countryList.hidden;
  countryList.hidden = !willOpen;
  countryButton.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    const selectedOption = countryList.querySelector('[aria-selected="true"]');
    selectedOption?.scrollIntoView({ block: "nearest" });
  }
}

function handleCountryChoice(event) {
  const option = event.target.closest(".country-option");
  if (!option) return;
  setCountry(option.dataset.value);
  closeCountryList();
  countryButton.focus();
}

function handleCountryKeydown(event) {
  const isOpen = !countryList.hidden;
  if (event.key === "Escape") {
    closeCountryList();
    countryButton.focus();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    if (event.target === countryButton) {
      event.preventDefault();
      toggleCountryList();
    }
    return;
  }
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;

  event.preventDefault();
  if (!isOpen) {
    toggleCountryList();
    focusCountryOption(market.value);
    return;
  }

  const options = [...countryList.querySelectorAll(".country-option")];
  const activeIndex = Math.max(0, options.indexOf(document.activeElement));
  const nextIndex = event.key === "ArrowDown"
    ? Math.min(options.length - 1, activeIndex + 1)
    : Math.max(0, activeIndex - 1);
  options[nextIndex]?.focus();
}

function setCountry(value) {
  const option = countryOptions.find((item) => item.value === value) || countryOptions[0];
  market.value = option.value;
  countryButton.textContent = option.label;
  for (const optionEl of countryList.querySelectorAll(".country-option")) {
    optionEl.setAttribute("aria-selected", String(optionEl.dataset.value === option.value));
  }
}

function focusCountryOption(value) {
  countryList.querySelector(`[data-value="${CSS.escape(value)}"]`)?.focus();
}

function closeCountryListFromOutside(event) {
  if (event.target.closest(".country-picker")) return;
  closeCountryList();
}

function closeCountryList() {
  countryList.hidden = true;
  countryButton.setAttribute("aria-expanded", "false");
}

function setLoading(isLoading) {
  extractButton.disabled = isLoading;
  extractButton.textContent = isLoading ? "Extracting..." : "Extract Reviews";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function scrollToMarkdownOnMobile() {
  if (!window.matchMedia("(max-width: 820px)").matches) return;
  requestAnimationFrame(() => {
    markdownPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function platformLabel(platform) {
  if (platform === "google_play") return "Google Play";
  if (platform === "app_store") return "App Store";
  return "review";
}

function platformFromUrl(value) {
  if (value.includes("play.google.com")) return "google_play";
  if (value.includes("apps.apple.com")) return "app_store";
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
