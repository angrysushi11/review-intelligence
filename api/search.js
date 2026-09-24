import { searchApps, validateSearchInput } from "../src/app-search.js";
import { loadGooglePlayScraper } from "../src/google-play.js";

export function createSearchHandler({ fetchImpl = fetch, loadGooglePlayScraperImpl = loadGooglePlayScraper } = {}) {
  return async function handler(request, response) {
    response.setHeader("cache-control", "public, s-maxage=3600");
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      return response.status(405).json({ error: "Method not allowed." });
    }

    let input;
    try {
      input = validateSearchInput(request.query || {});
    } catch (error) {
      return response.status(400).json({ error: error.message });
    }

    try {
      const gplayClient = await loadGooglePlayScraperImpl();
      const payload = await searchApps({ ...input, fetchImpl, gplayClient });
      return response.status(200).json(payload);
    } catch (error) {
      return response.status(502).json({ error: error.message });
    }
  };
}

export default createSearchHandler();
