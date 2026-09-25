// Keep this release on the canonical Review Intel entry point. Previously
// installed Review Retriever builds keep opening reviews.doubledash.me.
const RETRIEVER_URL = "https://www.willthiseverwork.com/review-intel/";
const APPLE_STORE_HOSTS = new Set(["apps.apple.com", "itunes.apple.com"]);

export function normalizeStoreUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    if (APPLE_STORE_HOSTS.has(url.hostname)) {
      if (!/\/app\/[^/]+\/id\d+\/?$/i.test(url.pathname)) return null;
      return `${url.origin}${url.pathname}`;
    }

    if (url.hostname === "play.google.com") {
      if (url.pathname !== "/store/apps/details") return null;
      const packageId = url.searchParams.get("id")?.trim();
      if (!packageId) return null;
      const canonical = new URL("https://play.google.com/store/apps/details");
      canonical.searchParams.set("id", packageId);
      return canonical.toString();
    }

    return null;
  } catch {
    return null;
  }
}

export function isSupportedStoreUrl(value) {
  return normalizeStoreUrl(value) !== null;
}

export function buildRetrieverUrl(activeTabUrl) {
  const retriever = new URL(RETRIEVER_URL);
  const storeUrl = normalizeStoreUrl(activeTabUrl);
  if (storeUrl) retriever.hash = new URLSearchParams({ app_url: storeUrl }).toString();
  retriever.searchParams.set("source", "chrome-extension");
  retriever.searchParams.set("route", "chrome-extension");
  retriever.searchParams.set("content_cluster", "review-aso");
  return retriever.toString();
}
