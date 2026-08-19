import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import extractHandler from "../api/extract.js";
import { createMcpHttpHandler } from "../src/mcp-server.js";

test("the export API rejects oversized request bodies before retrieval", async () => {
  const response = mockResponse();
  await extractHandler({
    method: "POST",
    headers: { "content-length": String(16 * 1024 + 1), "content-type": "application/json" },
    body: {}
  }, response);

  assert.equal(response.statusCode, 413);
  assert.deepEqual(response.payload, { error: "Request body is too large." });
});

test("the export API rejects unsupported content types", async () => {
  const response = mockResponse();
  await extractHandler({
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}"
  }, response);

  assert.equal(response.statusCode, 415);
});

test("the export API enforces the public 500-review cap", async () => {
  const response = mockResponse();
  await extractHandler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { url: "https://play.google.com/store/apps/details?id=com.example.app", limit: 501 }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, { error: "Review limit must be an integer from 1 to 500." });
});

test("the MCP endpoint rejects oversized request bodies before creating a server", async () => {
  const response = mockResponse();
  const handler = createMcpHttpHandler();
  await handler({
    method: "POST",
    headers: { "content-length": String(64 * 1024 + 1), "content-type": "application/json" }
  }, response);

  assert.equal(response.statusCode, 413);
  assert.deepEqual(response.payload, {
    jsonrpc: "2.0",
    error: { code: -32000, message: "Request body is too large." },
    id: null
  });
  assert.equal(response.headers["cache-control"], "no-store");
});

function mockResponse() {
  const response = new EventEmitter();
  response.headers = {};
  response.statusCode = 200;
  response.payload = undefined;
  response.setHeader = (name, value) => {
    response.headers[String(name).toLowerCase()] = value;
    return response;
  };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (payload) => {
    response.payload = payload;
    return response;
  };
  response.end = () => response;
  return response;
}
