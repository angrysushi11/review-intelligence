const MAX_ANALYTICS_LABEL_LENGTH = 80;

export function isProductionHost(hostname) {
  return ["reviews.doubledash.me", "willthiseverwork.com", "www.willthiseverwork.com"].includes(hostname);
}

// Every redesigned page and the app share the same production gate.
// Callers provide fixed control IDs and coarse outcomes, never user input.
export function trackReviewEvent(eventName, parameters = {}) {
  if (typeof window === "undefined" || !isProductionHost(window.location.hostname || new URL(window.location.href).hostname)) return;
  if (!/^review_[a-z_]+$/.test(eventName) && eventName !== "ai_referral_landing") return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("event", eventName, {
    page_path: window.location.pathname,
    ...parameters,
  });
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
