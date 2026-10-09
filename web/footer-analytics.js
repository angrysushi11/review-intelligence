import { initializeReviewAnalytics } from "./analytics.js";

export const FOOTER_CONTROL_IDS = Object.freeze(["site_terms", "site_privacy", "site_refunds"]);
export function isFooterAnalyticsHost(hostname) { return ["willthiseverwork.com", "www.willthiseverwork.com"].includes(String(hostname || "").toLowerCase()); }
export function normalizeFooterControl(value) { const control = String(value || "").trim(); return FOOTER_CONTROL_IDS.includes(control) ? control : ""; }
export function trackFooterControl(gtag, value) { const control = normalizeFooterControl(value); if (!control || typeof gtag !== "function") return false; gtag("event", "footer_click", { control }); return true; }
export function installFooterAnalytics(windowObject = window, documentObject = document) {
  if (!isFooterAnalyticsHost(windowObject.location?.hostname)) return false;
  const gtag = initializeReviewAnalytics(windowObject, documentObject);
  if (!gtag) return false;
  documentObject.addEventListener("click", (event) => { const link = event.target.closest?.("[data-footer-control]"); if (link) trackFooterControl(gtag, link.dataset.footerControl); });
  return true;
}
if (typeof window !== "undefined" && typeof document !== "undefined") installFooterAnalytics(window, document);
