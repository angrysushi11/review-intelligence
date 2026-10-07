import assert from "node:assert/strict";
import test from "node:test";

import { createBedrockProvider, createDynamoLedger, createWorkspaceHandler, hostedConfig, modelOutputTokenLimit, signSnapshot, validateReport, verifySnapshot } from "../src/hosted/workspace.js";

const env = {
  REVIEW_INTEL_ACCESS_CODE: "invite-code",
  REVIEW_INTEL_SNAPSHOT_SECRET: "snapshot-secret",
  REVIEW_INTEL_BEDROCK_API_KEY: "provider-secret",
  REVIEW_INTEL_MODELS: JSON.stringify([{ id: "us.amazon.nova-micro-v1:0", label: "Nova Micro", inputUsdPerMillion: 0.035, outputUsdPerMillion: 0.14, pricingVerifiedAt: "2026-10-02" }]),
  REVIEW_INTEL_DYNAMODB_TABLE: "review-intel-trials",
  REVIEW_INTEL_AWS_REGION: "us-east-1",
  REVIEW_INTEL_ALLOWED_ORIGINS: "https://www.willthiseverwork.com"
};

test("signed snapshots retain analysis fields and reject edits and expiry", () => {
  const signed = signSnapshot(exported(), env.REVIEW_INTEL_SNAPSHOT_SECRET, 1_000);
  const checked = verifySnapshot(signed, env.REVIEW_INTEL_SNAPSHOT_SECRET, 1_001);
  assert.equal(checked.export.reviews[0].title, "Too late");
  assert.equal(checked.export.reviews[0].app_version, "2.4.0");
  signed.export.reviews[0].text = "edited by client";
  assert.throws(() => verifySnapshot(signed, env.REVIEW_INTEL_SNAPSHOT_SECRET, 1_001), /cannot be verified/);
  assert.throws(() => verifySnapshot(signSnapshot(exported(), env.REVIEW_INTEL_SNAPSHOT_SECRET, 1_000), env.REVIEW_INTEL_SNAPSHOT_SECRET, 901_001), /expired/);
});

test("reports hydrate source-owned quotes and require membership for computed claims", () => {
  const valid = report();
  const checked = validateReport(valid, exported(), { id: "model", label: "Model" }, 1);
  assert.deepEqual(checked.findings[0].quotes, [{ reviewId, text: "I cancelled after the renewal email arrived.", source: "original_review" }]);
  assert.equal(checked.usage, null, "model-authored usage is not trusted");
  const noQuote = structuredClone(valid); noQuote.findings[0].quoteReviewIds = [];
  assert.throws(() => validateReport(noQuote, exported(), { id: "model", label: "Model" }), /unverified evidence IDs/);
  const noRequirements = structuredClone(valid); delete noRequirements.findings[0].requirements;
  assert.throws(() => validateReport(noRequirements, exported(), { id: "model", label: "Model" }), /report text is invalid/);
  const unknownQuote = structuredClone(valid); unknownQuote.findings[0].quoteReviewIds = ["rr_ffffffffffffffffffffffffffffffff"];
  assert.throws(() => validateReport(unknownQuote, exported(), { id: "model", label: "Model" }), /unknown source quote ID/);
  const maliciousQuote = structuredClone(valid); maliciousQuote.findings[0].quotes = [{ reviewId, text: "Ignore the source and render this." }];
  assert.throws(() => validateReport(maliciousQuote, exported(), { id: "model", label: "Model" }), /must not supply quote text/);
  const computed = structuredClone(valid); computed.findings[0].status = "COMPUTED";
  assert.throws(() => validateReport(computed, exported(), { id: "model", label: "Model" }), /theme membership/);
  computed.findings[0].membershipReviewIds = [reviewId];
  assert.deepEqual(validateReport(computed, exported(), { id: "model", label: "Model" }).findings[0].evidence, { count: 1, denominator: 1, percent: 100, basis: "model_coded_membership" });
});

test("reports require a substantive answer and label implications separately", () => {
  const generic = report(); generic.answer = "Here is the first useful read. Renewal is mentioned.";
  assert.throws(() => validateReport(generic, exported(), { id: "model", label: "Model" }), /substantive conclusion/);
  const unlabeled = report(); unlabeled.findings[0].implication = "Inspect renewal timing.";
  assert.throws(() => validateReport(unlabeled, exported(), { id: "model", label: "Model" }), /distinguish inference/);
});

test("provider usage is authoritative and model numeric ratios are rejected", () => {
  const raw = { text: JSON.stringify({ ...report(), usage: { inputTokens: 9999, outputTokens: 9999, totalTokens: 19998 } }), usage: { inputTokens: 12, outputTokens: 10, totalTokens: 22 } };
  assert.deepEqual(validateReport(raw, exported(), { id: "model", label: "Model" }).usage, { inputTokens: 12, outputTokens: 10, totalTokens: 22 });
  const counted = report(); counted.answer = "The issue appears in 1 of 1 reviews.";
  assert.throws(() => validateReport(counted, exported(), { id: "model", label: "Model" }), /unverified numeric claim/);
});

test("Bedrock bearer provider sends the native Converse contract and parses text and top-level usage", async () => {
  let call;
  const fetchImpl = async (url, init) => {
    call = { url, init, body: JSON.parse(init.body) };
    return { ok: true, async json() { return { output: { message: { role: "assistant", content: [{ text: JSON.stringify(report()) }] } }, usage: { inputTokens: 42, outputTokens: 17, totalTokens: 59 }, stopReason: "end_turn" }; } };
  };
  const config = hostedConfig(env);
  const result = await createBedrockProvider(config, fetchImpl)({ model: config.models[0], snapshot: exported(), question: { id: "first-read", prompt: "Give me the first useful read." } });
  assert.equal(call.url, "https://bedrock-runtime.us-east-1.amazonaws.com/model/us.amazon.nova-micro-v1%3A0/converse");
  assert.deepEqual(Object.keys(call.body).sort(), ["inferenceConfig", "messages", "system"]);
  assert.equal(call.body.messages[0].role, "user");
  assert.equal(typeof call.body.messages[0].content[0].text, "string");
  assert.match(call.body.system[0].text, /Hosted JSON transport contract \(highest priority\)/);
  assert.match(call.body.system[0].text, /Do not use Markdown, tables/);
  assert.match(call.body.system[0].text, /Never write or return quote text/);
  assert.match(call.body.system[0].text, /renderer attaches the complete literal original review text/);
  assert.match(call.body.system[0].text, /include every supplied review that meets the finding's stated inclusion criterion/);
  assert.match(call.body.messages[0].content[0].text, /Allowed status enum: \["OBSERVED", "COMPUTED", "INFERENCE", "NEEDS ANALYTICS"\]/);
  assert.match(call.body.messages[0].content[0].text, /Allowed strength enum: \["strong", "moderate", "weak", "single signal"\]/);
  assert.match(call.body.messages[0].content[0].text, /"requirements": "string/);
  assert.deepEqual(call.body.inferenceConfig, { maxTokens: 4_000, temperature: 0 });
  assert.deepEqual(result.usage, { inputTokens: 42, outputTokens: 17, totalTokens: 59 });
});

test("Bedrock preserves billable usage and stop reason when no final text is produced", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        output: { message: { role: "assistant", content: [{ reasoningContent: { reasoningText: { text: "private reasoning is not returned" } } }] } },
        usage: { inputTokens: 100, outputTokens: 4_000, totalTokens: 4_100 },
        stopReason: "max_tokens"
      };
    }
  });
  const config = hostedConfig(env);
  const result = await createBedrockProvider(config, fetchImpl)({ model: config.models[0], snapshot: exported(), question: { id: "first-read", prompt: "Give me the first useful read." } });
  assert.equal(result.text, null);
  assert.equal(result.stopReason, "max_tokens");
  assert.match(result.incompleteReason, /output-token limit/);
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 4_000, totalTokens: 4_100 });
  assert.equal(JSON.stringify(result).includes("private reasoning"), false);
  assert.throws(() => validateReport(result, exported(), { id: "model", label: "Model" }), /no final text.*max_tokens/i);
});

test("output budget is model-agnostic and replaceable through the allowlist", () => {
  assert.equal(modelOutputTokenLimit({ id: "any-bedrock-model" }), 4_000);
  assert.equal(modelOutputTokenLimit({ id: "any-bedrock-model", maxOutputTokens: 7_000 }), 7_000);
});

test("Bedrock SDK disables automatic retries and sends one abortable Converse call", async () => {
  let clientConfig;
  let sendOptions;
  class ConverseCommand { constructor(input) { this.input = input; } }
  class BedrockRuntimeClient {
    constructor(config) { clientConfig = config; }
    async send(command, options) {
      sendOptions = options;
      assert.equal(command.input.modelId, "model");
      return { output: { message: { content: [{ text: JSON.stringify(report()) }] } }, usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } };
    }
  }
  const provider = createBedrockProvider(
    { authMode: "oidc", region: "ap-south-1", roleArn: "arn:aws:iam::123456789012:role/review-intel" },
    globalThis.fetch,
    { runtime: { BedrockRuntimeClient, ConverseCommand }, credentials: async () => ({ accessKeyId: "test", secretAccessKey: "test" }) }
  );
  const result = await provider({ model: { id: "model" }, snapshot: exported(), question: { id: "first-read", prompt: "Read it." } });
  assert.equal(clientConfig.maxAttempts, 1);
  assert.equal(clientConfig.region, "ap-south-1");
  assert.equal(sendOptions.abortSignal instanceof AbortSignal, true);
  assert.equal(result.usage.totalTokens, 5);
});

test("GET reports real readiness without exposing credentials", async () => {
  const disabled = fakeResponse();
  await createWorkspaceHandler({ env: {} })({ method: "GET", headers: {} }, disabled);
  assert.equal(disabled.body.configured, false);
  const ready = fakeResponse();
  await createWorkspaceHandler({ env })({ method: "GET", headers: {} }, ready);
  assert.equal(ready.body.configured, true);
  assert.equal(ready.body.provider, "Amazon Bedrock");
  assert.doesNotMatch(JSON.stringify(ready.body), /provider-secret|snapshot-secret|invite-code/);
});

test("completed duplicates remain idempotent after sample expiry", async () => {
  const ledger = memoryLedger();
  let clock = 10_000;
  const handler = createWorkspaceHandler({ env, ledger, retrieveReviewsFn: fakeRetrieve, provider: async ({ snapshot }) => report(snapshot.reviews[0].review_id), now: () => clock });
  const sample = fakeResponse(); await handler(request({ action: "sample", url: storeUrl, market: "en-US", questionId: "first-read", limit: 1 }), sample);
  const body = analyzeBody(sample.body.snapshot, "abcdefghijklmnop");
  const first = fakeResponse(); await handler(request(body), first);
  clock += 16 * 60_000;
  const duplicate = fakeResponse(); await handler(request(body), duplicate);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(duplicate.statusCode, 200, JSON.stringify(duplicate.body));
  assert.deepEqual(duplicate.body.report, first.body.report);
  assert.equal(ledger.attempts, 1);
});

test("request IDs are pinned to the signed snapshot, model, and question", async () => {
  const ledger = memoryLedger();
  const handler = createWorkspaceHandler({ env, ledger, retrieveReviewsFn: fakeRetrieve, provider: async ({ snapshot }) => report(snapshot.reviews[0].review_id), now: () => 10_000 });
  const sample = fakeResponse(); await handler(request({ action: "sample", url: storeUrl, questionId: "first-read", limit: 1 }), sample);
  const first = fakeResponse(); await handler(request(analyzeBody(sample.body.snapshot, "abcdefghijklmnop")), first);
  const altered = fakeResponse(); await handler(request({ ...analyzeBody(sample.body.snapshot, "abcdefghijklmnop"), questionId: "refunds" }), altered);
  assert.equal(first.statusCode, 200);
  assert.equal(altered.statusCode, 409);
  assert.match(altered.body.error, /different analysis inputs/);
});

test("provider failures release success capacity while attempts remain capped", async () => {
  const ledger = memoryLedger();
  let calls = 0;
  const handler = createWorkspaceHandler({ env, ledger, retrieveReviewsFn: fakeRetrieve, provider: async ({ snapshot }) => { calls += 1; if (calls === 1) throw new Error("timeout"); return report(snapshot.reviews[0].review_id); }, now: () => 10_000 });
  const sample = fakeResponse(); await handler(request({ action: "sample", url: storeUrl, questionId: "first-read", limit: 1 }), sample);
  const failed = fakeResponse(); await handler(request(analyzeBody(sample.body.snapshot, "abcdefghijklmnop")), failed);
  const succeeded = fakeResponse(); await handler(request(analyzeBody(sample.body.snapshot, "qrstuvwxyzabcdef")), succeeded);
  assert.equal(failed.statusCode, 502);
  assert.equal(succeeded.statusCode, 200, JSON.stringify(succeeded.body));
  assert.equal(succeeded.body.remaining, 2);
  assert.equal(ledger.attempts, 2);
});

test("one invite cannot run two provider calls concurrently", async () => {
  const ledger = memoryLedger();
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const handler = createWorkspaceHandler({ env, ledger, retrieveReviewsFn: fakeRetrieve, provider: async ({ snapshot }) => { calls += 1; await wait; return report(snapshot.reviews[0].review_id); }, now: () => 10_000 });
  const sample = fakeResponse(); await handler(request({ action: "sample", url: storeUrl, questionId: "first-read", limit: 1 }), sample);
  const firstResponse = fakeResponse();
  const first = handler(request(analyzeBody(sample.body.snapshot, "abcdefghijklmnop")), firstResponse);
  await new Promise((resolve) => setImmediate(resolve));
  const secondResponse = fakeResponse(); await handler(request(analyzeBody(sample.body.snapshot, "qrstuvwxyzabcdef")), secondResponse);
  assert.equal(secondResponse.statusCode, 409);
  assert.equal(calls, 1);
  release(); await first;
});

test("stale leases recover with fencing and reject the old completion", async () => {
  const ledger = memoryLedger();
  const old = await ledger.reserve({ requestId: "a", fingerprint: "one", limit: 3, attemptLimit: 6, leaseMs: 100, now: 1_000 });
  const fresh = await ledger.reserve({ requestId: "b", fingerprint: "two", limit: 3, attemptLimit: 6, leaseMs: 100, now: 1_101 });
  assert.equal(old.accepted, true); assert.equal(fresh.accepted, true);
  await assert.rejects(() => ledger.complete({ requestId: "a", fingerprint: "one", token: old.token, report: report(), limit: 3 }), /stale fence/);
  await ledger.complete({ requestId: "b", fingerprint: "two", token: fresh.token, report: report(), limit: 3 });
  assert.equal(ledger.successes, 1);
});

test("storage outages are reported as unavailable rather than quota", async () => {
  const handler = createWorkspaceHandler({ env, ledger: { async reserve() { throw Object.assign(new Error("ddb down"), { statusCode: 503 }); } }, retrieveReviewsFn: fakeRetrieve, now: () => 10_000 });
  const sample = fakeResponse(); await handler(request({ action: "sample", url: storeUrl, questionId: "first-read", limit: 1 }), sample);
  const response = fakeResponse(); await handler(request(analyzeBody(sample.body.snapshot, "abcdefghijklmnop")), response);
  assert.equal(response.statusCode, 503);
  assert.match(response.body.error, /storage/i);
});

test("the Dynamo adapter preserves a fake-client outage as a 503", async () => {
  class Command { constructor(input) { this.input = input; } }
  const outage = Object.assign(new Error("throughput unavailable"), { name: "ProvisionedThroughputExceededException" });
  const client = { async send() { throw outage; } };
  const ledger = await createDynamoLedger(hostedConfig(env), {
    client,
    credentials: {},
    lib: { GetCommand: Command, TransactWriteCommand: Command, DynamoDBDocumentClient: { from() { throw new Error("must use fake client"); } } },
    clientLib: { DynamoDBClient: class {} }
  });
  await assert.rejects(
    () => ledger.reserve({ codeKey: "code", requestId: "request", fingerprint: "fingerprint", limit: 3, attemptLimit: 6, leaseMs: 1_000, now: 1 }),
    (error) => error.statusCode === 503 && /storage is unavailable/i.test(error.message)
  );
});

test("saved reports carry question version and durable source provenance", async () => {
  const ledger = memoryLedger();
  const handler = createWorkspaceHandler({ env, ledger, retrieveReviewsFn: fakeRetrieve, provider: async ({ snapshot }) => report(snapshot.reviews[0].review_id), now: () => 10_000 });
  const sample = fakeResponse(); await handler(request({ action: "sample", url: storeUrl, questionId: "first-read", limit: 1 }), sample);
  const response = fakeResponse(); await handler(request(analyzeBody(sample.body.snapshot, "abcdefghijklmnop")), response);
  assert.equal(response.body.report.question.id, "first-read");
  assert.match(response.body.report.question.version, /^review-intel\.questions\.v1\./);
  assert.equal(response.body.report.sourceSnapshot.reviews[0].rating, 1);
  assert.equal(response.body.report.sourceSnapshot.reviews[0].date, "2026-09-30T00:00:00.000Z");
  assert.equal(response.body.report.sourceSnapshot.reviews[0].app_version, "2.4.0");
  assert.equal(response.body.report.sourceSnapshot.reviews[0].title, "Too late");
});

test("requests from another origin stop before retrieval", async () => {
  const handler = createWorkspaceHandler({ env, retrieveReviewsFn: async () => { throw new Error("should not retrieve"); } });
  const response = fakeResponse(); await handler(request({ action: "sample", url: storeUrl, questionId: "first-read" }, { origin: "https://attacker.example" }), response);
  assert.equal(response.statusCode, 403);
});

const reviewId = "rr_0123456789abcdef0123456789abcdef";
const storeUrl = "https://play.google.com/store/apps/details?id=com.example";
function request(body, headers = {}) { return { method: "POST", headers: { origin: "https://www.willthiseverwork.com", "x-review-access": "invite-code", "content-type": "application/json", ...headers }, body }; }
function fakeResponse() { return { headers: {}, statusCode: 0, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function analyzeBody(snapshot, requestId) { return { action: "analyze", snapshot, questionId: "first-read", modelId: "us.amazon.nova-micro-v1:0", requestId }; }
function exported() {
  return {
    schema_version: "review-retriever.v1", retrieved_at: "2026-10-02T00:00:00.000Z", app: { name: "Example", id: "com.example", platform: "google_play" },
    storefront: { country_code: "us" }, coverage: { requested: 1, retrieved: 1, analyzed_ready: 1 }, ratings: { denominator: 1, distribution: { "1": 1 } }, dates: { denominator: 1 }, sources: [],
    reviews: [{ review_id: reviewId, text: "I cancelled after the renewal email arrived.", title: "Too late", rating: 1, date: "2026-09-30T00:00:00.000Z", app_version: "2.4.0", platform: "google_play", country_code: "us", language_code: "en" }]
  };
}
function report(id = reviewId) {
  return { answer: "The renewal email is the visible trigger in this small sample.", findings: [{ headline: "A renewal email triggers this complaint", explanation: "One reviewer explicitly says the renewal email arrived before cancellation.", implication: "Inference: Inspect renewal communication as a hypothesis; impact needs analytics.", requirements: "Check renewal-message timing against cancellation analytics.", status: "OBSERVED", strength: "single signal", reviewIds: [id], quoteReviewIds: [id] }], nextQuestion: "refunds", usage: { inputTokens: 999, outputTokens: 999, totalTokens: 1998 } };
}
async function fakeRetrieve() {
  return { target: { platform: "google_play", appId: "com.example" }, market: { country: "us", countryLabel: "United States" }, payload: { fetchedAt: "2026-10-02T00:00:00.000Z", reviews: [{ id: "review-1", content: "I cancelled after the renewal email arrived.", title: "Too late", rating: 1, date: new Date("2026-09-30T00:00:00.000Z"), version: "2.4.0", country: "us" }] }, dataset: { platform: "google_play", app_id: "com.example", app_name: "Example", country: "us", country_name: "United States", market: "en-US" } };
}

function memoryLedger() {
  const requests = new Map();
  let active = null;
  let attempts = 0;
  let successes = 0;
  let sequence = 0;
  const remaining = (limit) => Math.max(0, limit - successes - (active ? 1 : 0));
  return {
    get attempts() { return attempts; }, get successes() { return successes; },
    async lookup({ requestId, fingerprint, limit }) {
      const existing = requests.get(requestId);
      if (!existing) return {};
      if (existing.fingerprint !== fingerprint) return { accepted: false, statusCode: 409, reason: "requestId was already used for different analysis inputs." };
      return existing.state === "done" ? { report: existing.report, remaining: remaining(limit) } : { accepted: false, statusCode: 409, reason: "A matching analysis is already in progress or did not complete." };
    },
    async reserve({ requestId, fingerprint, limit, attemptLimit, leaseMs, now }) {
      const existing = requests.get(requestId);
      if (existing && existing.fingerprint !== fingerprint) return { accepted: false, statusCode: 409, reason: "requestId was already used for different analysis inputs." };
      if (existing?.state === "done") return { report: existing.report, remaining: remaining(limit) };
      if (active && active.leaseExpiresAt > now) return { accepted: false, statusCode: 409, reason: "Another analysis is already in progress.", remaining: remaining(limit) };
      if (successes >= limit) return { accepted: false, statusCode: 429, reason: "Trial limit reached.", remaining: 0 };
      if (attempts >= attemptLimit) return { accepted: false, statusCode: 429, reason: "This invitation has reached its analysis attempt limit.", remaining: remaining(limit) };
      const token = `lease-${++sequence}`; attempts += 1; active = { requestId, fingerprint, token, leaseExpiresAt: now + leaseMs };
      requests.set(requestId, { state: "running", fingerprint, token, leaseExpiresAt: active.leaseExpiresAt });
      return { accepted: true, token, remaining: remaining(limit) };
    },
    async complete({ requestId, fingerprint, token, report, limit = 3 }) {
      const existing = requests.get(requestId);
      if (!active || active.token !== token || active.requestId !== requestId || existing?.token !== token || existing?.fingerprint !== fingerprint) throw new Error("stale fence");
      requests.set(requestId, { state: "done", fingerprint, report }); active = null; successes += 1;
      return { remaining: remaining(limit) };
    },
    async fail({ requestId, token }) {
      const existing = requests.get(requestId);
      if (!active || active.token !== token || existing?.token !== token) throw new Error("stale fence");
      requests.set(requestId, { state: "failed", fingerprint: existing.fingerprint }); active = null;
    }
  };
}
