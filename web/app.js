import { COUNTRY_OPTIONS } from "./markets.js";
import {
  CHATGPT_NEW_CHAT_URL,
  CHATGPT_REVIEW_CAP,
  CLAUDE_NEW_CHAT_URL,
  DEFAULT_QUESTION_ID,
  QUESTION_GROUPS,
  buildAnalysisPayload,
  findQuestion
} from "./analysis-prompt.js?v=20260925-results-redesign";
import { sanitizeAnalyticsLabel, sanitizeAnalyticsSource, trackReviewEvent } from "./analytics.js";

const STORE_LINK_PATTERN = /apps\.apple\.com|itunes\.apple\.com|play\.google\.com/i;
const appBasePath = window.location.pathname === "/review-intel" || window.location.pathname.startsWith("/review-intel/") ? "/review-intel" : "";
const VALIDATION_MESSAGE = "that doesn't look like a store link";
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
const errorHelp = document.querySelector("#form-error-help");
const retrievalStatus = document.querySelector("#retrieval-status");
const extractButton = document.querySelector("#extract-btn");
const extractLabel = document.querySelector("#extract-label");
const extractSpinner = document.querySelector("#extract-spinner");
const connectorLinks = document.querySelectorAll("[data-connect-placement]");
const demoChips = document.querySelectorAll(".demo-chip");
const appIcon = document.querySelector("#app-icon");
const packetTitle = document.querySelector("#packet-title");
const packetAppId = document.querySelector("#packet-app-id");
const packetMeta = document.querySelector("#packet-meta");
const packetCount = document.querySelector("#packet-count");
const packetDate = document.querySelector("#packet-date");
const packetDateShort = document.querySelector("#packet-date-short");
const ratingChart = document.querySelector("#rating-chart");
const receiptMeta = document.querySelector("#receipt-meta");
const receiptNoteText = document.querySelector("#receipt-note-text");
const receiptRetry = document.querySelector("#receipt-retry");
const evidenceSection = document.querySelector(".evidence");
const peek = document.querySelector("#peek");
const peekCount = document.querySelector("#peek-count");
const startOver = document.querySelector("#start-over");
const analyzeSection = document.querySelector("#analyze");
const questionSelect = document.querySelector("#question-select");
const questionGroupChips = document.querySelector("#question-group-chips");
const questionOptionsPanel = document.querySelector("#question-options-panel");
const questionOptions = document.querySelector("#question-options");
const questionReset = document.querySelector("#question-reset");
const selectedQuestionTitle = document.querySelector("#selected-question-title");
const selectedQuestionDescription = document.querySelector("#selected-question-description");
const selectedQuestionTag = document.querySelector("#selected-question-tag");
const questionReviewCount = document.querySelector("#question-review-count");
const analyzeClaude = document.querySelector("#analyze-claude");
const analyzeChatGpt = document.querySelector("#analyze-chatgpt");
const handoffScope = document.querySelector("#handoff-scope");
const pasteStepText = document.querySelector("#paste-step-text");
const analysisActions = document.querySelector("#analysis-actions");
const analysisStatus = document.querySelector("#analysis-status");
const analysisStatusSuccess = document.querySelector("#analysis-status-success");
const analysisStatusError = document.querySelector("#analysis-status-error");
const analysisStatusTitle = document.querySelector("#analysis-status-title");
const analysisOpenedLabel = document.querySelector("#analysis-opened-label");
const analysisStatusStep = document.querySelector("#analysis-status-step");
const analysisOpenQuestion = document.querySelector("#analysis-open-question");
const analysisErrorDestination = document.querySelector("#analysis-error-destination");
const analysisErrorOpen = document.querySelector("#analysis-error-open");
const reopenAnalysis = document.querySelector("#reopen-analysis");
const copyAgainButton = document.querySelector("#copy-again");
const switchAnalysis = document.querySelector("#switch-analysis");
const analysisErrorCopy = document.querySelector("#analysis-error-copy");
const resultsUpgradeKicker = document.querySelector("#results-upgrade-kicker");
const resultsConnectClaude = document.querySelector("#results-connect-claude");
const copyButton = document.querySelector("#copy-btn");
const downloadButton = document.querySelector("#download-btn");
const claudeSkillDownload = document.querySelector("#claude-skill-download");
const claudeSkillsLink = document.querySelector("#claude-skills-link");
const formErrorTitle = document.querySelector("#form-error-title");
const formErrorText = document.querySelector("#form-error-text");
const formErrorActions = document.querySelector("#form-error-actions");
const formRetry = document.querySelector("#form-retry");
const formChangeCountry = document.querySelector("#form-change-country");
const landingQuestionMap = document.querySelector("#landing-question-map");

const query = new URLSearchParams(window.location.search);
const fragment = new URLSearchParams(window.location.hash.slice(1));
const querySource = sanitizeAnalyticsSource(query.get("source_path") || query.get("source"), window.location.origin);
const queryRoute = sanitizeAnalyticsLabel(query.get("route"));
const queryCluster = sanitizeAnalyticsLabel(query.get("content_cluster"));
const queryAppUrl = fragment.get("app_url") || query.get("app_url") || "";

if (querySource) safeSessionSet("dd_review_source", querySource);
if (queryRoute) safeSessionSet("dd_review_route", queryRoute);
if (queryCluster) safeSessionSet("dd_review_cluster", queryCluster);

const originalSource = querySource
  || sanitizeAnalyticsSource(safeSessionGet("dd_review_source"), window.location.origin)
  || sanitizeAnalyticsSource(document.referrer, window.location.origin)
  || "/review-retriever/";
const originalRoute = queryRoute || sanitizeAnalyticsLabel(safeSessionGet("dd_review_route")) || "review-intelligence";
const originalCluster = queryCluster || sanitizeAnalyticsLabel(safeSessionGet("dd_review_cluster")) || "review-aso";

let markdown = "";
let currentFilename = "reviews.md";
let isLoading = false;
let searchTimer = null;
let searchController = null;
let searchSequence = 0;
let searchResults = [];
let activeSearchResult = -1;
let activeQuestionGroup = "";
let lastAnalysisTool = "claude";
let lastAnalysisPayload = null;
let questionGroupButtons = [];
let questionOptionButtons = [];

renderCountryOptions();
renderQuestionOptions();
renderLandingQuestionMap();
renderPasteInstructions();
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
appUrl.addEventListener("change", () => {
  const value = appUrl.value.trim();
  track("review_app_input", {
    control_id: "app-url",
    input_kind: !value ? "empty" : looksLikeStoreLink(value) ? "store_link" : "search_term",
  });
});
appUrl.addEventListener("keydown", handleSearchKeydown);
country.addEventListener("change", () => track("review_country_change", { control_id: "country" }));
searchResultsElement.addEventListener("click", handleSearchPick);
form.addEventListener("submit", handleExtract);
for (const chip of demoChips) {
  chip.addEventListener("click", () => startDemo(chip));
}
for (const link of connectorLinks) {
  link.addEventListener("click", () => {
    track("review_connect_click", {
      control_id: link.dataset.controlId || "connect-link",
      placement: link.dataset.connectPlacement,
    });
    if (["results_connector", "results_guide"].includes(link.dataset.connectPlacement)) {
      trackKeepItClick(link.dataset.controlId || "results-keep-link");
    }
  });
}
startOver.addEventListener("click", () => {
  track("review_results_control", { control_id: "start-over", action: "reset" });
  resetRetriever();
});
questionGroupChips.addEventListener("click", handleQuestionGroupClick);
questionOptions.addEventListener("click", handleQuestionPick);
questionReset.addEventListener("click", () => {
  track("review_question_reset", { control_id: "question-reset" });
  resetQuestionPicker(true);
});
analyzeClaude.addEventListener("click", () => handleAnalyze("claude"));
analyzeChatGpt.addEventListener("click", () => handleAnalyze("chatgpt"));
switchAnalysis.addEventListener("click", () => {
  track("review_analysis_recovery", { control_id: "switch-analysis", action: "switch_tool", tool: lastAnalysisTool });
  handleAnalyze(lastAnalysisTool === "claude" ? "chatgpt" : "claude");
});
reopenAnalysis.addEventListener("click", trackAnalysisReopen);
copyAgainButton.addEventListener("click", () => retryAnalysisCopy("copy-again"));
analysisErrorCopy.addEventListener("click", () => retryAnalysisCopy("analysis-error-copy"));
analysisErrorOpen?.addEventListener("click", () => {
  track("review_analysis_recovery", {
    control_id: "analysis-error-open",
    action: "open_again",
    tool: lastAnalysisTool,
  });
});
copyButton.addEventListener("click", copyMarkdown);
downloadButton.addEventListener("click", downloadMarkdown);
appIcon.addEventListener("error", hideAppIcon);
receiptRetry?.addEventListener("click", () => {
  track("review_results_control", { control_id: "receipt-retry", action: "retry" });
  resetRetriever({ preserveInput: true });
  startExtraction();
});
formRetry?.addEventListener("click", () => {
  track("review_form_recovery", { control_id: "form-retry", action: "retry" });
  startExtraction();
});
formChangeCountry?.addEventListener("click", () => {
  track("review_form_recovery", { control_id: "form-change-country", action: "change_country" });
  country.focus();
});

claudeSkillDownload.addEventListener("click", () => {
  track("review_analysis_open", { control_id: "claude-skill-download", tool: "claude_skill_download", cta_id: "review_retriever_claude_download" });
  trackKeepItClick("claude-skill-download");
});
claudeSkillsLink.addEventListener("click", () => {
  track("review_analysis_open", { control_id: "claude-skills-link", tool: "claude_skills", cta_id: "review_retriever_claude_open" });
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
    const response = await fetch(`${appBasePath}/api/search?${new URLSearchParams({ term, country: country.value })}`, {
      signal: searchController.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "search failed");
    if (sequence !== searchSequence || appUrl.value.trim() !== term) return;
    searchResults = Array.isArray(payload.results) ? payload.results : [];
    activeSearchResult = -1;
    renderSearchResults();
    track("review_search", { control_id: "app-url", result_count: searchResults.length });
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
    button.className = `ri-result${index === activeSearchResult ? " is-selected" : ""}`;
    button.dataset.index = String(index);
    button.dataset.controlId = "search-result";
    button.dataset.tracking = "app";
    button.id = `search-result-${index}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === activeSearchResult));

    const icon = document.createElement("span");
    icon.className = "ri-app-tile";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);

    const copy = document.createElement("span");
    copy.className = "ri-result__text";
    const name = document.createElement("span");
    name.className = "ri-result__name";
    name.textContent = result.name;
    const developer = document.createElement("span");
    developer.className = "ri-result__id";
    developer.textContent = result.developer || "Developer unavailable";
    copy.append(name, developer);
    const store = document.createElement("span");
    store.className = "ri-badge ri-badge--outline";
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
  track("review_search_pick", { control_id: "search-result", store: result.store });
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
  track("review_demo_pick", {
    control_id: chip.dataset.controlId || "demo-app",
    demo_app: chip.dataset.demoName || "unknown",
  });
  startExtraction();
}

async function startExtraction() {
  if (isLoading) return;

  const link = appUrl.value.trim();
  if (!looksLikeStoreLink(link)) {
    showError(link ? "pick_app" : "invalid_link");
    appUrl.focus();
    return;
  }

  clearError();
  setLoading(true);
  track("review_extract_start", {
    control_id: "extract-btn",
    platform: platformFromUrl(link),
    route: originalRoute,
  });

  try {
    const result = await fetchReviews(link, country.value);
    markdown = result.markdown;
    currentFilename = result.filename;
    renderPacket(result);
    renderSamples(result.samples);
    prepareAnalyze(result);

    track(result.count > 0 ? "review_extract_success" : "review_extract_empty", {
      control_id: "extract-btn",
      platform: platformFromUrl(link),
      ...(result.count > 0 ? { review_count_bucket: reviewCountBucket(result.count) } : {}),
      content_cluster: originalCluster,
    });

    if (result.count === 0) {
      showError(result.store === "App Store" ? "empty_app_store" : "empty_google_play");
      retrievalStatus.textContent = result.store === "App Store"
        ? "Apple returned no written reviews."
        : "No written reviews were returned for this app in this country.";
      return;
    }

    idle.hidden = true;
    done.hidden = false;
    retrievalStatus.textContent = `${result.appName} review packet ready with ${result.count} ${pluralize("written review", result.count)}.`;
    window.scrollTo(0, 0);
    packetTitle.focus();
  } catch {
    track("review_extract_error", {
      control_id: "extract-btn",
      platform: platformFromUrl(link),
      error_type: "extract_failed",
    });
    showError("network");
    retrievalStatus.textContent = NETWORK_MESSAGE;
  } finally {
    setLoading(false);
  }
}

async function fetchReviews(link, selectedCountry) {
  const response = await fetch(`${appBasePath}/api/extract`, {
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

function renderLandingQuestionMap() {
  if (!landingQuestionMap) return;
  const groups = QUESTION_GROUPS.filter((group) => group.label !== "Start here");
  const cells = groups.map((group) => {
    const cell = document.createElement("section");
    const heading = document.createElement("h3");
    const list = document.createElement("ul");
    cell.className = "ri-qmap__cell";
    heading.className = "ri-qmap__title";
    heading.textContent = group.label;
    list.className = "ri-qmap__list";
    for (const question of group.questions) {
      const item = document.createElement("li");
      item.textContent = question.label;
      list.append(item);
    }
    cell.append(heading, list);
    return cell;
  });
  landingQuestionMap.replaceChildren(...cells);
}

function defaultCountryFromNavigator() {
  const region = String(navigator.language || "").match(/-([a-z]{2})\b/i)?.[1]?.toLowerCase();
  return COUNTRY_OPTIONS.some((option) => option.value === region) ? region : "us";
}

function renderQuestionOptions() {
  const selectFragment = document.createDocumentFragment();
  for (const group of QUESTION_GROUPS) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    for (const question of group.questions) {
      const option = document.createElement("option");
      option.value = question.id;
      option.textContent = question.label;
      optgroup.append(option);
    }
    selectFragment.append(optgroup);
  }
  questionSelect.replaceChildren(selectFragment);
  questionSelect.value = DEFAULT_QUESTION_ID;

  questionGroupButtons = QUESTION_GROUPS
    .filter((group) => !group.questions.some((question) => question.id === DEFAULT_QUESTION_ID))
    .map((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ri-chip";
      button.dataset.questionGroup = group.label;
      button.dataset.controlId = `question-group-${sanitizeAnalyticsLabel(group.label)}`;
      button.dataset.tracking = "app";
      button.textContent = group.label;
      button.setAttribute("aria-controls", "question-options-panel");
      button.setAttribute("aria-expanded", "false");
      return button;
    });
  questionGroupChips.replaceChildren(...questionGroupButtons);
  renderSelectedQuestion();
}

function handleQuestionGroupClick(event) {
  const button = event.target.closest("[data-question-group]");
  if (!button || !questionGroupChips.contains(button)) return;

  const label = button.dataset.questionGroup;
  if (activeQuestionGroup === label && !questionOptionsPanel.hidden) {
    track("review_question_group_toggle", {
      control_id: button.dataset.controlId || "question-group-chip",
      group_id: sanitizeAnalyticsLabel(label),
      action: "close",
    });
    closeQuestionGroup();
    return;
  }

  track("review_question_group_toggle", {
    control_id: button.dataset.controlId || "question-group-chip",
    group_id: sanitizeAnalyticsLabel(label),
    action: "open",
  });
  openQuestionGroup(label);
}

function openQuestionGroup(label) {
  const group = QUESTION_GROUPS.find((candidate) => candidate.label === label);
  if (!group) return;

  activeQuestionGroup = group.label;
  questionOptionsPanel.hidden = false;
  questionOptions.setAttribute("aria-label", `${group.label} questions`);
  renderQuestionChoices(group);
  syncQuestionChipStates();
}

function closeQuestionGroup() {
  activeQuestionGroup = "";
  questionOptionsPanel.hidden = true;
  questionOptions.replaceChildren();
  questionOptionButtons = [];
  syncQuestionChipStates();
}

function renderQuestionChoices(group) {
  questionOptionButtons = group.questions.map((question) => {
    const button = document.createElement("button");
    const radio = document.createElement("span");
    const copy = document.createElement("span");
    const label = document.createElement("span");
    const description = document.createElement("span");
    const isSelected = question.id === questionSelect.value;

    button.type = "button";
    button.className = `ri-qcard${isSelected ? " is-selected" : ""}`;
    button.dataset.questionId = question.id;
    button.dataset.controlId = `question-option-${question.id}`;
    button.dataset.tracking = "app";
    button.setAttribute("aria-pressed", String(isSelected));
    radio.className = "ri-qcard__dot";
    radio.setAttribute("aria-hidden", "true");
    copy.style.display = "contents";
    label.className = "ri-qcard__title";
    label.textContent = question.label;
    description.className = "ri-qcard__desc";
    description.textContent = question.description || question.prompt;
    copy.append(label, description);
    button.append(radio, copy);
    return button;
  });
  questionOptions.replaceChildren(...questionOptionButtons);
}

function handleQuestionPick(event) {
  const button = event.target.closest("[data-question-id]");
  if (!button || !questionOptions.contains(button)) return;
  selectQuestion(button.dataset.questionId, true, button.dataset.controlId);
}

function selectQuestion(questionId, shouldTrack = false, controlId = "question-option") {
  const previousQuestionId = questionSelect.value;
  const question = findQuestion(questionId);
  questionSelect.value = question.id;
  renderSelectedQuestion();

  const group = groupForQuestion(question.id);
  if (group && activeQuestionGroup === group.label) renderQuestionChoices(group);
  syncQuestionChipStates();

  if (lastAnalysisPayload && question.id !== previousQuestionId) resetAnalysisState();

  if (shouldTrack) track("review_question_pick", { control_id: controlId, question_id: question.id });
}

function resetQuestionPicker(shouldTrack = true) {
  selectQuestion(DEFAULT_QUESTION_ID, shouldTrack, "question-reset");
  closeQuestionGroup();
}

function renderSelectedQuestion() {
  const question = findQuestion(questionSelect.value);
  selectedQuestionTitle.textContent = question.label.replace(/\s*\(best start\)$/i, "");
  selectedQuestionDescription.textContent = question.description || question.prompt;
  selectedQuestionTag.hidden = question.id !== DEFAULT_QUESTION_ID;
  syncQuestionChipStates();
}

function syncQuestionChipStates() {
  const selectedGroup = groupForQuestion(questionSelect.value)?.label || "";
  for (const button of questionGroupButtons) {
    const isOpen = activeQuestionGroup === button.dataset.questionGroup && !questionOptionsPanel.hidden;
    const hasSelectedQuestion = selectedGroup === button.dataset.questionGroup;
    button.setAttribute("aria-expanded", String(isOpen));
    button.classList.toggle("is-open", isOpen);
    button.classList.toggle("is-selected", hasSelectedQuestion);
  }
}

function groupForQuestion(questionId) {
  return QUESTION_GROUPS.find((group) => group.questions.some((question) => question.id === questionId));
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
    card.className = "ri-review-card";

    const meta = document.createElement("div");
    meta.className = "ri-review-card__top";

    const rating = document.createElement("span");
    rating.className = "ri-stars";
    rating.textContent = stars(sample.rating);
    meta.append(rating);

    const date = document.createElement("span");
    date.textContent = sample.date || "date unavailable";
    meta.append(date);

    card.append(meta);

    if (sample.title) {
      const title = document.createElement("p");
      title.className = "ri-review-card__cluster";
      title.textContent = sample.title;
      card.append(title);
    }

    const text = document.createElement("p");
    text.className = "ri-review-card__text";
    text.textContent = sample.text;
    card.append(text);

    fragment.append(card);
  }
  peek.replaceChildren(fragment);
  peek.hidden = samples.length === 0;
  evidenceSection.hidden = samples.length === 0;
}

function renderPacket(result) {
  packetTitle.textContent = result.appName;
  if (packetAppId) packetAppId.textContent = result.appId || "App ID unavailable";
  renderAppIcon(result);
  packetMeta.textContent = [result.store, result.countryName, result.languages].filter(Boolean).join(", ");
  packetCount.textContent = String(result.count);
  packetDate.textContent = compactDateRange(result.dateRange);
  packetDateShort.textContent = compactDateRange(result.dateRange, false);
  if (questionReviewCount) questionReviewCount.textContent = String(result.count);
  if (peekCount) peekCount.textContent = String(result.count);
  renderRatingChart(result.ratingDistribution);

  const note = packetNote(result);
  if (receiptNoteText) receiptNoteText.textContent = note;
  else receiptMeta.textContent = note;
  receiptMeta.hidden = !note;
}

function renderRatingChart(distribution = {}) {
  const rows = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: Number(distribution[String(rating)] || 0),
  }));
  const denominator = rows.reduce((sum, row) => sum + row.count, 0);
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  const elements = rows.map(({ rating, count }) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const track = document.createElement("span");
    const bar = document.createElement("span");
    const value = document.createElement("span");
    const countText = document.createElement("span");
    const percentage = document.createElement("span");
    const share = denominator ? Math.round((count / denominator) * 100) : 0;

    row.className = `ri-bars__row${rating === 1 ? " ri-bars__row--1star" : ""}`;
    row.setAttribute("aria-hidden", "true");
    label.className = "ri-bars__label";
    label.textContent = `${rating}★`;
    track.className = "ri-bars__track";
    bar.className = "ri-bars__fill";
    bar.style.width = `${Math.round((count / maxCount) * 100)}%`;
    value.className = "ri-bars__count";
    countText.textContent = String(count);
    percentage.className = "rating-percentage";
    percentage.textContent = ` · ${share}%`;
    value.append(countText, percentage);
    track.append(bar);
    row.append(label, track, value);
    return row;
  });

  const accessibleSummary = rows.map(({ rating, count }) => `${rating} star: ${count}`).join(", ");
  ratingChart.setAttribute("aria-label", `Rating distribution. ${accessibleSummary}.`);
  ratingChart.replaceChildren(...elements);
}

function compactDateRange(value, includeSameYear = true) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})\s+to\s+(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "Date unavailable";

  const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = match;
  const start = new Date(Date.UTC(Number(startYear), Number(startMonth) - 1, Number(startDay)));
  const end = new Date(Date.UTC(Number(endYear), Number(endMonth) - 1, Number(endDay)));
  const monthDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
  if (startYear === endYear) {
    const range = `${monthDay.format(start)} – ${monthDay.format(end)}`;
    return includeSameYear ? `${range}, ${endYear}` : range;
  }
  return `${monthDay.format(start)}, ${startYear} – ${monthDay.format(end)}, ${endYear}`;
}

function prepareAnalyze(result) {
  analyzeSection.hidden = result.count === 0;
  questionSelect.value = DEFAULT_QUESTION_ID;
  renderSelectedQuestion();
  closeQuestionGroup();
  resetAnalysisState();
  handoffScope.textContent = result.count > CHATGPT_REVIEW_CAP
    ? `Claude reads all ${result.count} reviews. ChatGPT gets the newest ${CHATGPT_REVIEW_CAP}, so it has room to answer.`
    : `Claude and ChatGPT both read all ${result.count} ${pluralize("review", result.count)}.`;
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
  lastAnalysisTool = tool;
  lastAnalysisPayload = payload;

  copyText(payload.text)
    .then(() => showAnalysisSuccess(destination))
    .catch(() => showAnalysisError(destination));

  track("review_analysis_open", {
    control_id: isChatGpt ? "analyze-chatgpt" : "analyze-claude",
    tool: isChatGpt ? "chatgpt_oneclick" : "claude_oneclick",
    cta_id: isChatGpt ? "review_retriever_chatgpt_oneclick" : "review_retriever_claude_oneclick",
    question_id: payload.question.id,
    review_count_bucket: reviewCountBucket(payload.included),
  });
}

function renderPasteInstructions() {
  pasteStepText.textContent = initialPasteInstruction();
  analysisStatusStep.textContent = currentPasteInstruction();
}

function initialPasteInstruction() {
  if (window.matchMedia?.("(pointer: coarse)")?.matches) return "Long-press, tap Paste, then send";
  return `You paste (${pasteShortcut()}) and send`;
}

function currentPasteInstruction() {
  if (window.matchMedia?.("(pointer: coarse)")?.matches) return "Long-press, tap Paste, then send";
  return `Paste (${pasteShortcut()}), then send`;
}

function pasteShortcut() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad/i.test(platform) ? "⌘V" : "Ctrl+V";
}

function showAnalysisSuccess(destination) {
  const alternate = destination === "Claude" ? "ChatGPT" : "Claude";
  const alternateUrl = destination === "Claude" ? CHATGPT_NEW_CHAT_URL : CLAUDE_NEW_CHAT_URL;
  const reopenUrl = destination === "Claude" ? CLAUDE_NEW_CHAT_URL : CHATGPT_NEW_CHAT_URL;

  analysisActions.hidden = true;
  analysisStatus.hidden = false;
  analysisStatusSuccess.hidden = false;
  analysisStatusError.hidden = true;
  analysisStatus.classList.remove("analysis-status--error");
  analysisStatusTitle.textContent = `Copied. One step left, in the ${destination} tab.`;
  analysisOpenedLabel.textContent = `${destination} opened`;
  analysisOpenQuestion.textContent = `${destination} didn’t open?`;
  analysisStatusStep.textContent = currentPasteInstruction();
  reopenAnalysis.href = reopenUrl;
  reopenAnalysis.textContent = `Open ${destination} again`;
  switchAnalysis.href = alternateUrl;
  switchAnalysis.textContent = `Use ${alternate} instead`;
  resultsUpgradeKicker.textContent = `While ${destination} reads…`;
  resultsConnectClaude?.classList.remove("ri-btn--outline", "ri-btn--sm");
  resultsConnectClaude?.classList.add("ri-btn--primary", "ri-btn--md");
}

function showAnalysisError(destination) {
  analysisActions.hidden = true;
  analysisStatus.hidden = false;
  analysisStatusSuccess.hidden = true;
  analysisStatusError.hidden = false;
  analysisStatus.classList.add("analysis-status--error");
  analysisErrorDestination.textContent = destination;
  if (analysisErrorOpen) {
    analysisErrorOpen.href = destination === "Claude" ? CLAUDE_NEW_CHAT_URL : CHATGPT_NEW_CHAT_URL;
    analysisErrorOpen.textContent = `Open ${destination}`;
  }
  resultsUpgradeKicker.textContent = "Next time, skip the copy-paste.";
  resetKeepItButton();
}

function resetAnalysisState() {
  lastAnalysisTool = "claude";
  lastAnalysisPayload = null;
  analysisActions.hidden = false;
  analysisStatus.hidden = true;
  analysisStatusSuccess.hidden = false;
  analysisStatusError.hidden = true;
  analysisStatus.classList.remove("analysis-status--error");
  resultsUpgradeKicker.textContent = "Next time, skip the copy-paste.";
  resetKeepItButton();
  renderPasteInstructions();
}

function retryAnalysisCopy(controlId = "copy-again") {
  if (!lastAnalysisPayload) return;
  track("review_analysis_recovery", {
    control_id: controlId,
    action: "copy",
    tool: lastAnalysisTool,
  });
  const destination = lastAnalysisTool === "chatgpt" ? "ChatGPT" : "Claude";
  copyText(lastAnalysisPayload.text)
    .then(() => showAnalysisSuccess(destination))
    .catch(() => showAnalysisError(destination));
}

function trackAnalysisReopen() {
  if (!lastAnalysisPayload) return;
  track("review_analysis_recovery", {
    control_id: "reopen-analysis",
    action: "open_again",
    tool: lastAnalysisTool,
  });
  track("review_analysis_open", {
    control_id: "reopen-analysis",
    tool: `${lastAnalysisTool}_reopen`,
    cta_id: `review_retriever_${lastAnalysisTool}_reopen`,
    question_id: lastAnalysisPayload.question.id,
    review_count_bucket: reviewCountBucket(lastAnalysisPayload.included),
  });
}

function resetKeepItButton() {
  resultsConnectClaude?.classList.remove("ri-btn--primary", "ri-btn--md");
  resultsConnectClaude?.classList.add("ri-btn--outline", "ri-btn--sm");
}

function trackKeepItClick(controlId) {
  if (!lastAnalysisPayload || analysisStatusSuccess.hidden) return;
  track("review_keep_it_click", {
    control_id: controlId,
    handoff_tool: lastAnalysisTool,
  });
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
  // The public result surface uses a neutral tile; remote store artwork is not loaded.
  hideAppIcon();
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
    return "Apple’s full review feed was unavailable, so this file has only the reviews the store page shows. Try again in a minute for more.";
  }
  if (isAppStore && result.count <= 10) {
    return `Only ${result.count} ${pluralize("review", result.count)} came back. Apple’s public feed is often flaky: try again in a minute, or pick another country.`;
  }
  return "";
}

function showError(kind) {
  const states = {
    invalid_link: {
      title: "That doesn’t look like a store link.",
      text: "Paste a link from apps.apple.com or play.google.com, or type the app’s name.",
      actions: [],
    },
    pick_app: {
      title: "Pick an app from the list.",
      text: "Choose one of the App Store or Google Play results, then try again.",
      actions: [],
    },
    network: {
      title: "Couldn’t reach the store.",
      text: "Try again in a minute.",
      actions: ["retry"],
    },
    empty_app_store: {
      title: "Apple returned no written reviews.",
      text: "Its public feed is often flaky. Try again in a minute, or pick another country.",
      actions: ["retry", "country"],
    },
    empty_google_play: {
      title: "No written reviews for this app in this country.",
      text: "Try another country.",
      actions: ["country"],
    },
  };
  const state = states[kind] || { title: String(kind || VALIDATION_MESSAGE), text: "", actions: [] };
  if (formErrorTitle && formErrorText) {
    formErrorTitle.textContent = state.title;
    formErrorText.textContent = state.text;
  } else {
    error.textContent = [state.title, state.text].filter(Boolean).join(" ");
  }
  if (formErrorActions) formErrorActions.hidden = state.actions.length === 0;
  if (formRetry) formRetry.hidden = !state.actions.includes("retry");
  if (formChangeCountry) formChangeCountry.hidden = !state.actions.includes("country");
  error.hidden = false;
  errorHelp.hidden = true;
  if (["invalid_link", "pick_app"].includes(kind)) appUrl.setAttribute("aria-invalid", "true");
  else appUrl.removeAttribute("aria-invalid");
}

function clearError() {
  if (formErrorTitle && formErrorText) {
    formErrorTitle.textContent = "That doesn’t look like a store link.";
    formErrorText.textContent = "Paste a link from apps.apple.com or play.google.com, or type the app’s name.";
  } else {
    error.textContent = VALIDATION_MESSAGE;
  }
  error.hidden = true;
  errorHelp.hidden = true;
  if (formErrorActions) formErrorActions.hidden = true;
  if (formRetry) formRetry.hidden = true;
  if (formChangeCountry) formChangeCountry.hidden = true;
  appUrl.removeAttribute("aria-invalid");
}

function setLoading(loading) {
  isLoading = loading;
  extractButton.classList.toggle("busy", loading);
  extractButton.classList.toggle("is-loading", loading);
  extractButton.setAttribute("aria-busy", String(loading));
  if (extractSpinner) extractSpinner.hidden = !loading;
  extractLabel.textContent = loading ? LOADING_LABEL : EXTRACT_LABEL;
  if (loading) retrievalStatus.textContent = "Collecting up to 500 public reviews…";
}

function resetRetriever({ preserveInput = false } = {}) {
  done.hidden = true;
  idle.hidden = false;
  resetQuestionPicker(false);
  resetAnalysisState();
  if (!preserveInput) appUrl.value = "";
  markdown = "";
  currentFilename = "reviews.md";
  packetTitle.textContent = "Reviews exported";
  if (packetAppId) packetAppId.textContent = "App ID";
  packetMeta.textContent = "Store, country, language";
  packetCount.textContent = "0";
  packetDate.textContent = "Date unavailable";
  ratingChart.replaceChildren();
  ratingChart.setAttribute("aria-label", "Rating distribution");
  hideAppIcon();
  if (receiptNoteText) receiptNoteText.textContent = "";
  else receiptMeta.textContent = "";
  receiptMeta.hidden = true;
  peek.replaceChildren();
  peek.hidden = false;
  clearError();
  retrievalStatus.textContent = "";
  window.scrollTo(0, 0);
  if (!preserveInput) appUrl.focus();
}

async function copyMarkdown() {
  try {
    await copyText(markdown);
    copyButton.textContent = "Copied";
  } catch {
    copyButton.textContent = "Couldn't copy";
  }
  track("review_export_action", { control_id: "copy-btn", action: "copy" });
  window.setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1600);
}

function downloadMarkdown() {
  track("review_export_action", { control_id: "download-btn", action: "download" });
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
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

function pluralize(word, count) {
  return Number(count) === 1 ? word : `${word}s`;
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
  trackReviewEvent(eventName, {
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
