import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewsMarkdown } from "./markdown.js";
import { retrieveReviews } from "./retrieve.js";
import { COUNTRY_LANGUAGE_OPTIONS, COUNTRY_OPTIONS } from "./storefronts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "web");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const powerUserSetupUrl = "https://www.doubledash.me/tools/review-intelligence/mcp/";

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/") {
      return serveFile(response, path.join(webDir, "index.html"));
    }

    if (request.method === "GET" && (url.pathname === "/setup" || url.pathname === "/setup/")) {
      response.writeHead(302, { location: powerUserSetupUrl });
      return response.end();
    }

    if (request.method === "GET" && url.pathname === "/api/countries") {
      return sendJson(response, { countries: COUNTRY_OPTIONS, markets: COUNTRY_LANGUAGE_OPTIONS });
    }

    if (request.method === "POST" && url.pathname === "/api/extract") {
      const body = await readJsonBody(request);
      const inputUrl = String(body.url || "").trim();
      if (!inputUrl) return sendJson(response, { error: "App Store or Google Play URL is required." }, 400);

      const { target, payload, dataset } = await retrieveReviews({
        url: inputUrl,
        platform: body.platform || "auto",
        market: body.market || body.country || "en-US",
        pages: 10,
        limit: body.limit || 500,
        sort: body.sort || "mostRecent"
      });
      const markdown = renderReviewsMarkdown({ dataset, reviews: payload.reviews });
      const filename = `${safeSlug(target.appSlug, dataset.platform, dataset.market || dataset.country)}-reviews.md`;
      return sendJson(response, { filename, dataset, markdown });
    }

    if (request.method === "GET" && url.pathname.startsWith("/")) {
      const filePath = path.join(webDir, path.normalize(url.pathname));
      if (!filePath.startsWith(webDir)) return sendText(response, "Not found", 404);
      return serveFile(response, filePath);
    }

    return sendText(response, "Not found", 404);
  } catch (error) {
    return sendJson(response, { error: error.message }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`Review Retriever web UI: http://${host}:${port}`);
});

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveFile(response, filePath) {
  try {
    const data = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(data);
  } catch {
    sendText(response, "Not found", 404);
  }
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function sendText(response, text, status = 200) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  return "application/octet-stream";
}

function safeSlug(...parts) {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "reviews";
}
