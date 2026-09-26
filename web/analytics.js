const MAX_ANALYTICS_LABEL_LENGTH = 80;

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
