import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

import { buildReviewExport, createMcpHttpHandler } from "../src/mcp-server.js";

const TARGET = "https://play.google.com/store/apps/details?id=com.example.app";

test("buildReviewExport produces stable evidence IDs and explicit coverage", async () => {
  const first = await buildReviewExport({
    url: TARGET,
    platform: "google_play",
    market: "en-US",
    limit: 3,
    sort: "most_recent",
    include_markdown: true
  }, { retrieveReviewsFn: fakeRetrieveReviews });
  const second = await buildReviewExport({
    url: TARGET,
    platform: "google_play",
    market: "en-US",
    limit: 3,
    sort: "most_recent",
    include_markdown: true
  }, { retrieveReviewsFn: fakeRetrieveReviews });

  assert.equal(first.schema_version, "review-retriever.v1");
  assert.deepEqual(first.reviews.map(({ review_id }) => review_id), second.reviews.map(({ review_id }) => review_id));
  assert.match(first.reviews[0].review_id, /^rr_[a-f0-9]{32}$/);
  assert.deepEqual(first.coverage, {
    requested: 3,
    declared: 1200,
    retrieved: 3,
    analyzed_ready: 2,
    source_records_before_limit: 4,
    excluded_without_text: 1,
    truncated_to_limit: true,
    warning: "Requested 3 reviews; 3 records were retrieved and 2 contain usable text. Base review-derived percentages on 2.",
    denominator_note: "Use analyzed_ready (2) as the default denominator for all review-derived percentages unless a metric explicitly names a different denominator."
  });
  assert.equal(first.ratings.denominator, 2);
  assert.deepEqual(first.ratings.distribution, { "1": 1, "2": 0, "3": 0, "4": 0, "5": 1 });
  assert.equal(first.dates.dated_reviews, 2);
  assert.match(first.markdown, /Unique reviews exported: 3/);
  assert.match(first.markdown, /Analysis-ready reviews: 2/);
  assert.match(first.markdown, /Default analysis denominator: 2/);
  assert.match(first.markdown, /Coverage warning: Requested 3 reviews/);
  assert.match(first.markdown, /Requested review limit: 3/);
});

test("buildReviewExport leaves the store-declared count unknown when Apple does not report one", async () => {
  const result = await buildReviewExport({
    url: "https://apps.apple.com/us/app/example/id123456789",
    platform: "app_store",
    market: "en-US",
    limit: 1,
    sort: "most_recent",
    include_markdown: false
  }, {
    retrieveReviewsFn: async () => ({
      target: { platform: "app_store", appId: "123456789" },
      market: { country: "us", language: "en", countryLabel: "United States", languageLabel: "English" },
      payload: {
        appName: "Example",
        appId: "123456789",
        country: "us",
        fetchedAt: "2026-08-10T00:00:00.000Z",
        metadata: {},
        reviews: [{ id: "apple-1", country: "us", rating: 4, content: "Useful." }]
      },
      dataset: {
        app_name: "Example",
        app_id: "123456789",
        platform: "app_store",
        country: "us",
        country_name: "United States",
        language: "",
        languages: [],
        language_name: "",
        language_names: [],
        country_language: "United States",
        market: "us",
        google_play_written_reviews: null,
        reviews_exported: 1
      }
    })
  });

  assert.equal(result.coverage.declared, null);
  assert.equal(result.coverage.analyzed_ready, 1);
});

test("Streamable HTTP serializes review records for content-only clients and preserves structured output", async (t) => {
  const app = createMcpExpressApp();
  const handler = createMcpHttpHandler({ retrieveReviewsFn: fakeRetrieveReviews });
  app.all("/mcp", handler);

  const httpServer = app.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  t.after(() => new Promise((resolve) => httpServer.close(resolve)));

  const address = httpServer.address();
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: "review-retriever-test", version: "1.0.0" });
  t.after(() => client.close());

  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, "review-retriever");

  const tools = await client.listTools();
  assert.equal(tools.tools.length, 1);
  assert.equal(tools.tools[0].name, "retrieve_app_reviews");
  assert.equal(tools.tools[0].annotations.readOnlyHint, true);
  assert.equal(tools.tools[0].annotations.destructiveHint, false);
  assert.ok(tools.tools[0].outputSchema.properties.coverage);

  const result = await client.callTool({
    name: "retrieve_app_reviews",
    arguments: {
      url: TARGET,
      platform: "google_play",
      market: "en-US",
      limit: 2,
      sort: "most_recent"
    }
  });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.coverage.retrieved, 2);
  assert.equal(result.structuredContent.coverage.analyzed_ready, 1);
  assert.equal(result.structuredContent.markdown, null);
  const textContent = JSON.parse(result.content[0].text);
  assert.deepEqual(textContent, result.structuredContent);
  assert.equal(textContent.reviews.length, 2);
  assert.match(textContent.reviews[0].review_id, /^rr_[a-f0-9]{32}$/);
  assert.equal(textContent.reviews[0].source_review_id, "source-1");
  assert.equal(textContent.reviews[0].rating, 5);
  assert.equal(textContent.reviews[0].date, "2026-08-08T00:00:00.000Z");
  assert.equal(textContent.reviews[0].text, "The reminders finally work.");

  const markdownResult = await client.callTool({
    name: "retrieve_app_reviews",
    arguments: {
      url: TARGET,
      platform: "google_play",
      market: "en-US",
      limit: 500,
      sort: "most_recent",
      include_markdown: true
    }
  });
  assert.notEqual(markdownResult.isError, true);
  const markdownTextContent = JSON.parse(markdownResult.content[0].text);
  assert.deepEqual(markdownTextContent, markdownResult.structuredContent);
  assert.equal(markdownTextContent.coverage.requested, 500);
  assert.equal(markdownTextContent.reviews.length, 4);
  assert.match(markdownTextContent.markdown, /The reminders finally work\./);
  assert.match(markdownTextContent.markdown, /Login fails after the update\./);

  const invalid = await client.callTool({
    name: "retrieve_app_reviews",
    arguments: {
      url: TARGET,
      limit: 501
    }
  });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /Invalid arguments/i);

  const browserGetResponse = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    redirect: "manual"
  });
  assert.equal(browserGetResponse.status, 302);
  assert.equal(browserGetResponse.headers.get("location"), "https://www.doubledash.me/tools/review-intelligence/mcp/");
  assert.equal(browserGetResponse.headers.get("cache-control"), "no-store");
  assert.equal(browserGetResponse.headers.get("vary"), "accept");

  const mcpGetResponse = await fetch(url, {
    headers: { accept: "application/json" }
  });
  assert.equal(mcpGetResponse.status, 405);
  assert.equal(mcpGetResponse.headers.get("allow"), "POST");
  assert.equal(mcpGetResponse.headers.get("cache-control"), "no-store");
  assert.equal(mcpGetResponse.headers.get("vary"), "accept");
  assert.match(mcpGetResponse.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await mcpGetResponse.json(), {
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null
  });

  const genericProgrammaticGetResponse = await fetch(url);
  assert.equal(genericProgrammaticGetResponse.status, 405);
  assert.equal(genericProgrammaticGetResponse.headers.get("allow"), "POST");
});

async function fakeRetrieveReviews({ url, platform, market, limit, sort }) {
  assert.equal(url, TARGET);
  assert.equal(platform, "google_play");
  assert.equal(market, "en-US");
  assert.ok(limit >= 1 && limit <= 500);
  assert.equal(sort, "most_recent");

  return {
    target: { platform: "google_play", appId: "com.example.app", appSlug: "app" },
    market: {
      key: "en-US",
      country: "us",
      language: "en",
      countryLabel: "United States",
      languageLabel: "English"
    },
    payload: {
      appName: "Example App",
      appId: "com.example.app",
      country: "us",
      fetchedAt: "2026-08-10T00:00:00.000Z",
      metadata: { reviews: 1200 },
      source: "Google Play public reviews",
      sources: [{
        name: "Google Play public reviews - English",
        count: 4,
        requested: limit,
        country: "us",
        language: "en",
        error: ""
      }],
      reviews: [
        {
          id: "source-1",
          country: "us",
          language: "en",
          rating: 5,
          updated: "2026-08-08T00:00:00.000Z",
          version: "2.0",
          author: "A",
          title: "Useful",
          content: "The reminders finally work.",
          voteSum: 4,
          source: "Google Play public reviews"
        },
        {
          id: "source-2",
          country: "us",
          language: "en",
          rating: 3,
          updated: "not-a-date",
          author: "B",
          title: "",
          content: "",
          source: "Google Play public reviews"
        },
        {
          id: "source-3",
          country: "us",
          language: "en",
          rating: 1,
          updated: "2026-08-01T00:00:00.000Z",
          author: "C",
          title: "Locked out",
          content: "Login fails after the update.",
          developerReply: "Please contact support.",
          developerReplyDate: "2026-08-02T00:00:00.000Z",
          source: "Google Play public reviews"
        },
        {
          id: "source-4",
          country: "us",
          language: "en",
          rating: 4,
          updated: "2026-07-30T00:00:00.000Z",
          author: "D",
          title: "Solid",
          content: "Works well.",
          source: "Google Play public reviews"
        }
      ]
    },
    dataset: {
      app_name: "Example App",
      app_id: "com.example.app",
      platform: "google_play",
      country: "us",
      country_name: "United States",
      language: "en",
      languages: ["en"],
      language_name: "English",
      language_names: ["English"],
      country_language: "United States / English",
      market: "en-US",
      source: "Google Play public reviews",
      sources: [{
        name: "Google Play public reviews - English",
        count: 4,
        requested: limit,
        country: "us",
        language: "en",
        error: ""
      }],
      review_limit: limit,
      google_play_written_reviews: 1200,
      reviews_exported: 4,
      rating_distribution: { "1": 1, "2": 0, "3": 1, "4": 1, "5": 1 },
      date_range: "2026-07-30 to 2026-08-08"
    }
  };
}
