const MEASUREMENT_ID = "G-R8F1QX6HKC";
const PRODUCTION_HOSTS = new Set(["willthiseverwork.com", "www.willthiseverwork.com"]);

export const FOOTER_CONTROL_IDS = Object.freeze([
  "site_terms",
  "site_privacy",
  "site_refunds",
]);

export function isFooterAnalyticsHost(hostname) {
  return PRODUCTION_HOSTS.has(String(hostname || "").toLowerCase());
}

export function normalizeFooterControl(value) {
  const control = String(value || "").trim();
  return FOOTER_CONTROL_IDS.includes(control) ? control : "";
}

export function trackFooterControl(gtag, value) {
  const control = normalizeFooterControl(value);
  if (!control || typeof gtag !== "function") return false;
  gtag("event", "footer_click", { control });
  return true;
}

function safePageReferrer(documentObject) {
  try {
    const referrer = documentObject.referrer ? new URL(documentObject.referrer) : null;
    return referrer && /^https?:$/.test(referrer.protocol) ? `${referrer.origin}/` : "";
  } catch {
    return "";
  }
}

function ensureGtag(windowObject, documentObject) {
  if (typeof windowObject.gtag === "function") return windowObject.gtag;

  windowObject.dataLayer = windowObject.dataLayer || [];
  windowObject.gtag = function gtag() {
    windowObject.dataLayer.push(arguments);
  };

  const analyticsScript = documentObject.createElement("script");
  analyticsScript.async = true;
  analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  documentObject.head.appendChild(analyticsScript);

  windowObject.gtag("js", new Date());
  windowObject.gtag("config", MEASUREMENT_ID, {
    page_location: `${windowObject.location.origin}${windowObject.location.pathname}`,
    page_referrer: safePageReferrer(documentObject),
  });
  return windowObject.gtag;
}

export function installFooterAnalytics(windowObject = window, documentObject = document) {
  if (!isFooterAnalyticsHost(windowObject.location?.hostname)) return false;

  const gtag = ensureGtag(windowObject, documentObject);
  documentObject.addEventListener("click", (event) => {
    const link = event.target.closest?.("[data-footer-control]");
    if (!link) return;
    trackFooterControl(gtag, link.dataset.footerControl);
  });
  return true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installFooterAnalytics(window, document);
}
