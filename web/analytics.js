const MEASUREMENT_ID = "G-R8F1QX6HKC";
const INTERNAL_KEY = "wtew_internal";
const MAX_ANALYTICS_LABEL_LENGTH = 80;
const CAMPAIGN_FIELDS = Object.freeze({
  utm_id: "campaign_id", utm_source: "campaign_source", utm_medium: "campaign_medium",
  utm_campaign: "campaign_name", utm_content: "campaign_content", utm_term: "campaign_term",
});

export function isProductionHost(hostname) {
  return ["reviews.doubledash.me", "willthiseverwork.com", "www.willthiseverwork.com"].includes(String(hostname || "").toLowerCase());
}

function hostnameFor(locationObject) {
  return String(locationObject?.hostname || safeUrl(locationObject)?.hostname || "").toLowerCase();
}

function safeUrl(locationObject) {
  try { return new URL(locationObject.href); } catch {
    try { return new URL(`${locationObject.origin || ""}${locationObject.pathname || "/"}${locationObject.search || ""}${locationObject.hash || ""}`); } catch { return null; }
  }
}

function readInternalFlag(windowObject) {
  let stored = false;
  let cookie = false;
  try { stored = windowObject.localStorage?.getItem(INTERNAL_KEY) === "1"; } catch { /* Private storage must not disable analytics. */ }
  try { cookie = String(windowObject.document?.cookie || "").split(";").some((item) => item.trim() === `${INTERNAL_KEY}=1`); } catch { /* Cookies can be blocked independently. */ }
  return stored || cookie;
}

function writeInternalFlag(windowObject, enabled, secure) {
  try {
    if (enabled) windowObject.localStorage?.setItem(INTERNAL_KEY, "1");
    else windowObject.localStorage?.removeItem(INTERNAL_KEY);
  } catch { /* The other first-party store may still work. */ }
  try {
    windowObject.document.cookie = enabled
      ? `${INTERNAL_KEY}=1; Path=/; Max-Age=63072000; SameSite=Lax${secure ? "; Secure" : ""}`
      : `${INTERNAL_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`;
  } catch { /* Storage failures must not interrupt page analytics. */ }
}

// Remove the override before analytics sees the URL, retaining unrelated params and hash.
export function resolveInternalTraffic(windowObject = window) {
  const locationObject = windowObject?.location;
  const url = locationObject && safeUrl(locationObject);
  if (!url) return false;
  const values = url.searchParams.getAll(INTERNAL_KEY);
  if (values.length) {
    const override = values[0];
    const requested = override === "1" ? true : override === "0" ? false : readInternalFlag(windowObject);
    if (override === "1" || override === "0") writeInternalFlag(windowObject, requested, url.protocol === "https:");
    url.searchParams.delete(INTERNAL_KEY);
    try { windowObject.history?.replaceState(windowObject.history.state, "", `${url.pathname}${url.search}${url.hash}`); } catch { /* History failures must not interrupt analytics. */ }
    return requested;
  }
  return readInternalFlag(windowObject);
}

function safePageReferrer(documentObject) {
  try { const referrer = documentObject.referrer ? new URL(documentObject.referrer) : null; return referrer && /^https?:$/.test(referrer.protocol) ? `${referrer.origin}/` : ""; } catch { return ""; }
}

function campaignConfig(url) {
  const config = {};
  for (const [key, field] of Object.entries(CAMPAIGN_FIELDS)) {
    const value = url.searchParams.get(key)?.trim() || "";
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) config[field] = value;
  }
  return config;
}

function ensureGtag(windowObject, documentObject) {
  windowObject.dataLayer = windowObject.dataLayer || [];
  windowObject.gtag = windowObject.gtag || function gtag() { windowObject.dataLayer.push(arguments); };
  if (!windowObject.__reviewIntelAnalyticsLoader) {
    windowObject.__reviewIntelAnalyticsLoader = true;
    const loader = documentObject?.createElement?.("script");
    if (loader) { loader.async = true; loader.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`; documentObject.head?.append?.(loader); }
  }
  return windowObject.gtag;
}

// A single initialization prevents site, footer, and workspace modules from racing.
export function initializeReviewAnalytics(windowObject = window, documentObject = document) {
  if (!windowObject || !documentObject) return null;
  // Flag persistence and URL cleanup apply on every surface, but preview hosts never hit GA.
  const internal = resolveInternalTraffic(windowObject);
  if (!isProductionHost(hostnameFor(windowObject.location))) return null;
  if (windowObject.__reviewIntelAnalyticsInitialized) return windowObject.gtag || null;
  const url = safeUrl(windowObject.location);
  if (!url) return null;
  const cleanUrl = safeUrl(windowObject.location) || url;
  const gtag = ensureGtag(windowObject, documentObject);
  windowObject.__reviewIntelAnalyticsInitialized = true;
  windowObject.gtag("js", new Date());
  if (internal) windowObject.gtag("set", { traffic_type: "internal" });
  const page = {
    page_location: `${cleanUrl.origin}${cleanUrl.pathname}`,
    page_referrer: safePageReferrer(documentObject),
    ...campaignConfig(cleanUrl),
    ...(cleanUrl.searchParams.get("ga_debug") === "1" ? { debug_mode: true } : {}),
  };
  windowObject.gtag("config", MEASUREMENT_ID, { ...page, send_page_view: false, ...(internal ? { traffic_type: "internal" } : {}) });
  windowObject.gtag("event", "page_view", page);
  return gtag;
}

// Events can arrive while modules load out of order; initialization always precedes them.
export function trackReviewEvent(eventName, parameters = {}) {
  if (typeof window === "undefined" || !isProductionHost(hostnameFor(window.location))) return;
  if (!/^review_[a-z_]+$/.test(eventName) && eventName !== "ai_referral_landing") return;
  const gtag = initializeReviewAnalytics(window, document);
  if (!gtag) return;
  gtag("event", eventName, { page_path: window.location.pathname, ...parameters });
}

export function sanitizeAnalyticsLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  return raw
    .split(/[?#]/, 1)[0]
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ANALYTICS_LABEL_LENGTH);
}

export function sanitizeAnalyticsSource(value, currentOrigin) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return parsed.origin === currentOrigin
        ? parsed.pathname || "/"
        : parsed.hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  if (raw.startsWith("/")) {
    try {
      return new URL(raw, currentOrigin).pathname || "/";
    } catch {
      return "";
    }
  }

  return sanitizeAnalyticsLabel(raw);
}
