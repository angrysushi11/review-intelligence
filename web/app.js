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

const STORE_LINK_PATTERN = /apps\.apple\.com|itunes\.apple\.com|play\.google\.com/i;
const appBasePath = window.location.pathname === "/review-intel" || window.location.pathname.startsWith("/review-intel/") ? "/review-intel" : "";
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
const demoChips = document.querySelectorAll(".demo-chip");
const appIcon = document.querySelector("#app-icon");
const packetTitle = document.querySelector("#packet-title");
const packetMeta = document.querySelector("#packet-meta");
const packetCount = document.querySelector("#packet-count");
const packetDate = document.querySelector("#packet-date");
const packetDateShort = document.querySelector("#packet-date-short");
const ratingChart = document.querySelector("#rating-chart");
const receiptMeta = document.querySelector("#receipt-meta");
const evidenceSection = document.querySelector(".evidence");
const peek = document.querySelector("#peek");
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
const reopenAnalysis = document.querySelector("#reopen-analysis");
const copyAgainButton = document.querySelector("#copy-again");
const switchAnalysis = document.querySelector("#switch-analysis");
const analysisErrorCopy = document.querySelector("#analysis-error-copy");
const resultsUpgradeKicker = document.querySelector("#results-upgrade-kicker");
const copyButton = document.querySelector("#copy-btn");
const downloadButton = document.querySelector("#download-btn");
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
let activeQuestionGroup = "";
let lastAnalysisTool = "claude";
let lastAnalysisPayload = null;
let questionGroupButtons = [];
let questionOptionButtons = [];

renderCountryOptions();
renderQuestionOptions();
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
questionGroupChips.addEventListener("click", handleQuestionGroupClick);
questionOptions.addEventListener("click", handleQuestionPick);
questionReset.addEventListener("click", () => resetQuestionPicker(true));
analyzeClaude.addEventListener("click", () => handleAnalyze("claude"));
analyzeChatGpt.addEventListener("click", () => handleAnalyze("chatgpt"));
switchAnalysis.addEventListener("click", () => handleAnalyze(lastAnalysisTool === "claude" ? "chatgpt" : "claude"));
reopenAnalysis.addEventListener("click", trackAnalysisReopen);
copyAgainButton.addEventListener("click", retryAnalysisCopy);
analysisErrorCopy.addEventListener("click", retryAnalysisCopy);
copyButton.addEventListener("click", copyMarkdown);
downloadButton.addEventListener("click", downloadMarkdown);
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
    const response = await fetch(`${appBasePath}/api/search?${new URLSearchParams({ term, country: country.value })}`, {
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
      button.className = "question-group-chip";
      button.dataset.questionGroup = group.label;
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
    closeQuestionGroup();
    return;
  }

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
    const label = document.createElement("span");
    const isSelected = question.id === questionSelect.value;

    button.type = "button";
    button.className = "question-option";
    button.dataset.questionId = question.id;
    button.setAttribute("aria-pressed", String(isSelected));
    radio.className = `question-radio${isSelected ? " question-radio--selected" : ""}`;
    radio.setAttribute("aria-hidden", "true");
    label.textContent = question.label;
    button.append(radio, label);
    return button;
  });
  questionOptions.replaceChildren(...questionOptionButtons);
}

function handleQuestionPick(event) {
  const button = event.target.closest("[data-question-id]");
  if (!button || !questionOptions.contains(button)) return;
  selectQuestion(button.dataset.questionId, true);
}

function selectQuestion(questionId, shouldTrack = false) {
  const previousQuestionId = questionSelect.value;
  const question = findQuestion(questionId);
  questionSelect.value = question.id;
  renderSelectedQuestion();

  const group = groupForQuestion(question.id);
  if (group && activeQuestionGroup === group.label) renderQuestionChoices(group);
  syncQuestionChipStates();

  if (lastAnalysisPayload && question.id !== previousQuestionId) resetAnalysisState();

  if (shouldTrack) track("review_question_pick", { question_id: question.id });
}

function resetQuestionPicker(shouldTrack = true) {
  selectQuestion(DEFAULT_QUESTION_ID, shouldTrack);
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
    card.className = "review-card";

    const meta = document.createElement("div");
    meta.className = "review-card__meta";

    const rating = document.createElement("span");
    rating.className = "review-card__rating";
    rating.textContent = stars(sample.rating);
    meta.append(rating);

    const date = document.createElement("span");
    date.textContent = sample.date || "date unavailable";
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
  evidenceSection.hidden = samples.length === 0;
}

function renderPacket(result) {
  packetTitle.textContent = result.appName;
  renderAppIcon(result);
  packetMeta.textContent = [result.store, result.countryName, result.languages].filter(Boolean).join(" · ");
  packetCount.textContent = String(result.count);
  packetDate.textContent = compactDateRange(result.dateRange);
  packetDateShort.textContent = compactDateRange(result.dateRange, false);
  renderRatingChart(result.ratingDistribution);

  const note = packetNote(result);
  receiptMeta.textContent = note;
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

    row.className = `rating-row${rating === 1 ? " rating-row--low" : ""}`;
    row.setAttribute("aria-hidden", "true");
    label.className = "rating-label";
    label.textContent = `${rating}★`;
    track.className = "rating-track";
    bar.className = "rating-bar";
    bar.style.width = `${Math.round((count / maxCount) * 100)}%`;
    value.className = "rating-value";
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
  switchAnalysis.href = alternateUrl;
  switchAnalysis.textContent = `Use ${alternate} instead`;
  resultsUpgradeKicker.textContent = `while ${destination} reads…`;
}

function showAnalysisError(destination) {
  analysisActions.hidden = true;
  analysisStatus.hidden = false;
  analysisStatusSuccess.hidden = true;
  analysisStatusError.hidden = false;
  analysisStatus.classList.add("analysis-status--error");
  analysisErrorDestination.textContent = destination;
  resultsUpgradeKicker.textContent = "skip the copy-paste";
}

function resetAnalysisState() {
  lastAnalysisTool = "claude";
  lastAnalysisPayload = null;
  analysisActions.hidden = false;
  analysisStatus.hidden = true;
  analysisStatusSuccess.hidden = false;
  analysisStatusError.hidden = true;
  analysisStatus.classList.remove("analysis-status--error");
  resultsUpgradeKicker.textContent = "skip the copy-paste";
  renderPasteInstructions();
}

function retryAnalysisCopy() {
  if (!lastAnalysisPayload) return;
  const destination = lastAnalysisTool === "chatgpt" ? "ChatGPT" : "Claude";
  copyText(lastAnalysisPayload.text)
    .then(() => showAnalysisSuccess(destination))
    .catch(() => showAnalysisError(destination));
}

function trackAnalysisReopen() {
  if (!lastAnalysisPayload) return;
  track("review_analysis_open", {
    tool: `${lastAnalysisTool}_reopen`,
    cta_id: `review_retriever_${lastAnalysisTool}_reopen`,
    question_id: lastAnalysisPayload.question.id,
    review_count_bucket: reviewCountBucket(lastAnalysisPayload.included),
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
  resetQuestionPicker(false);
  resetAnalysisState();
  appUrl.value = "";
  markdown = "";
  currentFilename = "reviews.md";
  packetTitle.textContent = "Reviews exported";
  packetMeta.textContent = "Store · Country · Language";
  packetCount.textContent = "0";
  packetDate.textContent = "Date unavailable";
  ratingChart.replaceChildren();
  ratingChart.setAttribute("aria-label", "Rating distribution");
  hideAppIcon();
  receiptMeta.textContent = "";
  receiptMeta.hidden = true;
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
