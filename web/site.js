import { isProductionHost, trackReviewEvent } from "./analytics.js";

// Keep page locations, referrers and campaign attribution separate from inputs.
if (isProductionHost(window.location.hostname)) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  const campaignFields = {
    utm_id: "campaign_id", utm_source: "campaign_source", utm_medium: "campaign_medium",
    utm_campaign: "campaign_name", utm_content: "campaign_content", utm_term: "campaign_term",
  };
  const params = new URLSearchParams(window.location.search);
  const campaignConfig = {};
  for (const [key, field] of Object.entries(campaignFields)) {
    const value = params.get(key)?.trim() || "";
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) campaignConfig[field] = value;
  }
  let referrer;
  try { referrer = new URL(document.referrer); } catch { /* No valid referrer. */ }
  const loader = document.createElement("script");
  loader.async = true;
  loader.src = "https://www.googletagmanager.com/gtag/js?id=G-R8F1QX6HKC";
  document.head.append(loader);
  window.gtag("js", new Date());
  window.gtag("config", "G-R8F1QX6HKC", {
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_referrer: referrer && /^https?:$/.test(referrer.protocol) ? `${referrer.origin}/` : "",
    ...campaignConfig,
  });
  const host = referrer?.hostname || "";
  const source = params.get("utm_source")?.toLowerCase() || "";
  const domain = (value) => host === value || host.endsWith(`.${value}`);
  const aiSource = domain("chatgpt.com") || domain("chat.openai.com") || ["chatgpt", "chatgpt.com"].includes(source) ? "chatgpt"
    : domain("perplexity.ai") || ["perplexity", "perplexity.ai"].includes(source) ? "perplexity"
    : domain("copilot.microsoft.com") || (domain("bing.com") && referrer?.pathname.includes("copilot")) || source === "copilot" ? "copilot"
    : domain("gemini.google.com") || source === "gemini" ? "gemini"
    : domain("claude.ai") || ["claude", "claude.ai"].includes(source) ? "claude" : null;
  if (aiSource) trackReviewEvent("ai_referral_landing", { ai_source: aiSource, landing_path: window.location.pathname });
}

const fixedId = (value) => /^[a-z][a-z0-9_-]{0,79}$/.test(value || "") ? value : "";

document.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-control-id]");
  if (!control || control.dataset.tracking === "app" || control.tagName === "SUMMARY") return;
  const controlId = fixedId(control.dataset.controlId);
  if (!controlId) return;
  if (control.dataset.copyTarget) {
    const content = document.getElementById(control.dataset.copyTarget)?.textContent || "";
    let copied = false;
    try { await navigator.clipboard.writeText(content); copied = true; } catch { /* Offer selectable source text below. */ }
    const status = document.getElementById("site-copy-status");
    if (status) status.textContent = copied ? "Copied." : "Couldn’t copy automatically. Select the text and copy it.";
    trackReviewEvent("review_setup_copy", { control_id: controlId, outcome: copied ? "success" : "error" });
    return;
  }
  const eventName = control.dataset.event || (control.dataset.connectPlacement ? "review_connect_click" : "review_control_click");
  const parameters = { control_id: controlId };
  if (control.dataset.connectPlacement) parameters.placement = fixedId(control.dataset.connectPlacement);
  trackReviewEvent(eventName, parameters);
});

for (const details of document.querySelectorAll("details[data-control-id]")) {
  // A board's initially-open FAQ is presentation, not a user interaction.
  let wasOpen = details.open;
  details.addEventListener("toggle", () => {
    if (details.open && !wasOpen) trackReviewEvent("review_faq_open", { control_id: fixedId(details.dataset.controlId) });
    wasOpen = details.open;
  });
}

for (const field of document.querySelectorAll("input[data-control-id], select[data-control-id]")) {
  if (field.dataset.tracking === "app") continue;
  field.addEventListener("change", () => trackReviewEvent("review_field_change", { control_id: fixedId(field.dataset.controlId) }));
}
const form = document.getElementById("extract-form");
if (form) {
  form.addEventListener("focusin", () => trackReviewEvent("review_form_start", { control_id: "extract-form" }), { once: true });
  form.addEventListener("submit", () => trackReviewEvent("review_form_submit", { control_id: "extract-form" }));
}
