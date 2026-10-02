import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { buildReviewExport } from "../mcp-server.js";
import { ANALYSIS_METHOD } from "../../web/review-intelligence-method.js";
import { QUESTION_GROUPS } from "../../web/analysis-prompt.js";

export const TRIAL_LIMIT = 3;
export const ATTEMPT_LIMIT = 6;
export const DEFAULT_MAX_REVIEWS = 50;
export const MAX_REVIEWS = 150;
export const MAX_REQUEST_BYTES = 1_800_000;
export const QUESTION_SET_VERSION = "review-intel.questions.v1";
const SNAPSHOT_TTL_MS = 15 * 60_000;
const PROVIDER_TIMEOUT_MS = 110_000;
const LEASE_TTL_MS = 150_000;
const MAX_EVIDENCE_TEXT_BYTES = 220_000;
const oidcProviderCache = new Map();

export function hostedConfig(env = process.env) {
  const models = parseModels(env.REVIEW_INTEL_MODELS);
  const region = String(env.REVIEW_INTEL_AWS_REGION || "").trim();
  const apiKey = String(env.REVIEW_INTEL_BEDROCK_API_KEY || env.AWS_BEARER_TOKEN_BEDROCK || "").trim();
  const roleArn = String(env.AWS_ROLE_ARN || "").trim();
  const missing = [];
  if (!env.REVIEW_INTEL_ACCESS_CODE) missing.push("access is not configured");
  if (!env.REVIEW_INTEL_SNAPSHOT_SECRET) missing.push("snapshot signing is not configured");
  if (!region) missing.push("AWS region is not configured");
  if (!apiKey && !roleArn) missing.push("Bedrock authentication is not configured");
  if (!models.length) missing.push("no approved models are configured");
  if (!env.REVIEW_INTEL_DYNAMODB_TABLE) missing.push("durable usage storage is not configured");
  if (!env.REVIEW_INTEL_ALLOWED_ORIGINS) missing.push("allowed browser origin is not configured");
  return {
    configured: !missing.length,
    reason: missing[0] || null,
    accessCode: String(env.REVIEW_INTEL_ACCESS_CODE || ""),
    snapshotSecret: String(env.REVIEW_INTEL_SNAPSHOT_SECRET || ""),
    apiKey,
    roleArn,
    authMode: roleArn ? "oidc" : apiKey ? "bearer" : "unconfigured",
    models,
    tableName: String(env.REVIEW_INTEL_DYNAMODB_TABLE || ""),
    region,
    origins: [
      ...String(env.REVIEW_INTEL_ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean),
      ...(/^[a-z0-9.-]+\.vercel\.app$/.test(env.VERCEL_URL || "") ? [`https://${env.VERCEL_URL}`] : [])
    ]
  };
}

export function createWorkspaceHandler({ env = process.env, retrieveReviewsFn, ledger, provider, now = () => Date.now() } = {}) {
  return async function workspaceHandler(request, response) {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "application/json");
    const config = hostedConfig(env);
    if (request.method === "GET") return response.status(200).json(publicConfig(config));
    if (request.method !== "POST") {
      response.setHeader("allow", "GET, POST");
      return response.status(405).json({ error: "Method not allowed." });
    }
    if (!config.configured) return response.status(503).json({ error: "Hosted analysis is unavailable.", configured: false });
    if (!validOrigin(request, config.origins)) return response.status(403).json({ error: "This request is not from an approved origin." });
    if (!constantTimeEqual(header(request, "x-review-access"), config.accessCode)) return response.status(401).json({ error: "A valid invitation code is required." });
    if (bodyTooLarge(request)) return response.status(413).json({ error: "Request body is too large." });
    let body;
    try { body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {}; }
    catch { return response.status(400).json({ error: "Invalid JSON request body." }); }
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_REQUEST_BYTES) return response.status(413).json({ error: "Request body is too large." });

    try {
      if (body.action === "sample") {
        const exported = await buildReviewExport(sampleInput(body), { retrieveReviewsFn });
        return response.status(200).json({ snapshot: signSnapshot(exported, config.snapshotSecret, now()) });
      }
      if (body.action !== "analyze") return response.status(400).json({ error: "action must be sample or analyze." });

      const clock = now();
      const input = analyzeInput(body, config, clock);
      const activeLedger = ledger || await createDynamoLedger(config);
      const codeKey = hmac(config.snapshotSecret, config.accessCode);
      if (input.expired) {
        const existing = await activeLedger.lookup({ codeKey, requestId: input.requestId, fingerprint: input.fingerprint, limit: TRIAL_LIMIT });
        if (existing.report) return response.status(200).json({ report: existing.report, remaining: existing.remaining });
        throw invalid("This sample has expired. Retrieve it again.");
      }

      const reservation = await activeLedger.reserve({ codeKey, requestId: input.requestId, fingerprint: input.fingerprint, limit: TRIAL_LIMIT, attemptLimit: ATTEMPT_LIMIT, leaseMs: LEASE_TTL_MS, now: clock });
      if (reservation.report) return response.status(200).json({ report: reservation.report, remaining: reservation.remaining });
      if (!reservation.accepted) return response.status(reservation.statusCode || 429).json({ error: reservation.reason, remaining: reservation.remaining });

      const model = config.models.find((item) => item.id === input.modelId);
      const question = questionFor(input.questionId);
      let raw;
      try {
        const runProvider = provider || createBedrockProvider(config);
        raw = await runProvider({ model, snapshot: input.snapshot.export, question });
      } catch (error) {
        await releaseFailedReservation(activeLedger, { codeKey, requestId: input.requestId, token: reservation.token, now: now() });
        throw providerError(error);
      }

      let report;
      try {
        report = validateReport(raw, input.snapshot.export, model, { now: now(), question, requestId: input.requestId, fingerprint: input.fingerprint });
      } catch (error) {
        await releaseFailedReservation(activeLedger, { codeKey, requestId: input.requestId, token: reservation.token, now: now() });
        throw providerError(error);
      }
      const complete = await activeLedger.complete({ codeKey, requestId: input.requestId, fingerprint: input.fingerprint, token: reservation.token, report, limit: TRIAL_LIMIT, now: now() });
      return response.status(200).json({ report, remaining: complete.remaining });
    } catch (error) {
      return response.status(error.statusCode || 502).json({ error: safeError(error) });
    }
  };
}

async function releaseFailedReservation(ledger, input) {
  try { await ledger.fail(input); }
  catch (error) { throw storageError(error); }
}

function publicConfig(config) {
  return { configured: config.configured, requiresAccess: true, ...(config.configured ? {
    models: config.models.map(({ id, label }) => ({ id, label })), maxReviews: MAX_REVIEWS, trialLimit: TRIAL_LIMIT, attemptLimit: ATTEMPT_LIMIT, provider: "Amazon Bedrock"
  } : { reason: config.reason }) };
}

function sampleInput(body) {
  const url = String(body.url || "").trim();
  if (!isStoreUrl(url)) throw invalid("Use an App Store or Google Play app URL.");
  const market = String(body.market || "en-US").trim();
  if (!/^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/.test(market)) throw invalid("Market is invalid.");
  if (!questionFor(body.questionId)) throw invalid("Question is invalid.");
  const limit = body.limit === undefined ? DEFAULT_MAX_REVIEWS : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REVIEWS) throw invalid(`Review limit must be 1 to ${MAX_REVIEWS}.`);
  return { url, market, limit, platform: "auto", sort: "most_recent", include_markdown: false };
}

function analyzeInput(body, config, now) {
  const requestId = String(body.requestId || "");
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw invalid("requestId is invalid.");
  const modelId = String(body.modelId || "");
  if (!config.models.some((model) => model.id === modelId)) throw invalid("That model is not available.");
  const question = questionFor(body.questionId);
  if (!question) throw invalid("Question is invalid.");
  const snapshot = verifySnapshot(body.snapshot, config.snapshotSecret, now, { allowExpired: true });
  const fingerprint = sha256(stableJson({ snapshotSignature: snapshot.signature, modelId, questionId: question.id, questionVersion: questionVersion(question) }));
  return { requestId, modelId, questionId: question.id, snapshot, fingerprint, expired: snapshot.expiresAt < now };
}

export function signSnapshot(exported, secret, issuedAt = Date.now()) {
  const clean = normalizeExport(exported);
  const expiresAt = issuedAt + SNAPSHOT_TTL_MS;
  return { export: clean, expiresAt, signature: hmac(secret, stableJson({ export: clean, expiresAt })) };
}

export function verifySnapshot(snapshot, secret, now = Date.now(), { allowExpired = false } = {}) {
  if (!snapshot || typeof snapshot !== "object") throw invalid("A signed sample is required.");
  const expiresAt = Number(snapshot.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt > now + SNAPSHOT_TTL_MS) throw invalid("This sample cannot be verified.");
  if (!allowExpired && expiresAt < now) throw invalid("This sample has expired. Retrieve it again.");
  const clean = normalizeExport(snapshot.export);
  const expected = hmac(secret, stableJson({ export: clean, expiresAt }));
  if (!constantTimeEqual(snapshot.signature, expected)) throw invalid("The sample cannot be verified.");
  return { export: clean, expiresAt, signature: expected };
}

function normalizeExport(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.reviews)) throw invalid("Sample has no review evidence.");
  if (value.reviews.length < 1 || value.reviews.length > MAX_REVIEWS) throw invalid("Sample review count is invalid.");
  const reviews = value.reviews.map((review) => ({
    review_id: String(review.review_id || ""), text: boundedNullable(review.text, 4_000) || "", title: boundedNullable(review.title, 1_000),
    rating: normalizeRating(review.rating), date: boundedNullable(review.date, 100), app_version: boundedNullable(review.app_version ?? review.version, 200),
    platform: boundedNullable(review.platform, 50), country_code: boundedNullable(review.country_code, 20), language_code: boundedNullable(review.language_code, 30)
  }));
  if (reviews.some((review) => !/^rr_[a-f0-9]{32}$/.test(review.review_id) || !review.text)) throw invalid("Sample review evidence is invalid.");
  if (new Set(reviews.map((review) => review.review_id)).size !== reviews.length) throw invalid("Sample contains duplicate evidence IDs.");
  if (Buffer.byteLength(JSON.stringify(reviews), "utf8") > MAX_EVIDENCE_TEXT_BYTES) throw invalid("Sample is too large.");
  const coverage = safeObject(value.coverage);
  const analyzedReady = Number(coverage.analyzed_ready);
  if (!Number.isInteger(analyzedReady) || analyzedReady !== reviews.length) throw invalid("Sample coverage does not match its analysis-ready reviews.");
  const clean = {
    schema_version: String(value.schema_version || ""), retrieved_at: boundedNullable(value.retrieved_at, 100), app: safeObject(value.app), storefront: safeObject(value.storefront),
    coverage, ratings: safeObject(value.ratings), dates: safeObject(value.dates), sources: Array.isArray(value.sources) ? value.sources.slice(0, 20).map(safeObject) : [], reviews
  };
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > 280_000) throw invalid("Sample is too large.");
  return clean;
}

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function boundedNullable(value, max) { if (value === null || value === undefined || value === "") return null; const out = String(value); if (out.length > max) throw invalid("Sample review evidence is invalid."); return out; }
function normalizeRating(value) { if (value === null || value === undefined || value === "") return null; const rating = Number(value); if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw invalid("Sample review rating is invalid."); return rating; }

export function validateReport(raw, snapshot, model, options = {}) {
  const legacyNow = typeof options === "number" ? options : null;
  const now = legacyNow ?? options.now ?? Date.now();
  const question = legacyNow ? questionFor("first-read") : options.question || questionFor("first-read");
  const providerResult = normalizeProviderResult(raw);
  let value;
  try { value = JSON.parse(providerResult.text); }
  catch { throw invalid("Model returned invalid JSON."); }
  if (!value || typeof value !== "object" || typeof value.answer !== "string" || value.answer.length > 12_000 || !Array.isArray(value.findings)) throw invalid("Model returned an invalid structured report.");
  if (value.findings.length < 1 || value.findings.length > 6) throw invalid("Model returned an invalid number of findings.");
  const answer = text(value.answer, 12_000);
  if (/^(?:here(?:'s| is) (?:the )?first useful read|overall sentiment)\b/i.test(answer)) throw invalid("Model answer must start with the substantive conclusion.");
  rejectUnverifiedCounts(answer);
  const evidence = new Map(snapshot.reviews.map((review) => [review.review_id, review.text]));
  const denominator = snapshot.reviews.length;
  const findings = value.findings.map((finding) => {
    if (!finding || typeof finding !== "object" || !["OBSERVED", "COMPUTED", "INFERENCE", "NEEDS ANALYTICS"].includes(finding.status) || !["strong", "moderate", "weak", "single signal"].includes(finding.strength)) throw invalid("Model report has invalid finding metadata.");
    const headline = text(finding.headline, 280); const explanation = text(finding.explanation, 2_000); const implication = text(finding.implication, 1_000); const requirements = text(finding.requirements, 1_000);
    if (!/^(?:Inference|Needs analytics):\s+/.test(implication)) throw invalid("Model implication must distinguish inference from observed review evidence.");
    rejectUnverifiedCounts(`${headline}\n${explanation}\n${implication}\n${requirements}`);
    const reviewIds = uniqueIds(finding.reviewIds);
    const quoteReviewIds = uniqueIds(finding.quoteReviewIds);
    if (Object.hasOwn(finding, "quotes")) throw invalid("Model report must not supply quote text.");
    if (!reviewIds.length || reviewIds.length > 4 || !quoteReviewIds.length || quoteReviewIds.length > 4 || reviewIds.some((id) => !evidence.has(id))) throw invalid("Model report has unverified evidence IDs.");
    if (quoteReviewIds.some((id) => !reviewIds.includes(id) || !evidence.has(id))) throw invalid("Model report has an unknown source quote ID.");
    const quotes = quoteReviewIds.map((reviewId) => ({ reviewId, text: evidence.get(reviewId), source: "original_review" }));
    const membershipReviewIds = uniqueIds(finding.membershipReviewIds);
    if (membershipReviewIds.some((id) => !evidence.has(id))) throw invalid("Model report has unknown theme membership IDs.");
    if (finding.status === "COMPUTED" && !membershipReviewIds.length) throw invalid("Computed findings require source IDs for theme membership.");
    const evidenceSummary = membershipReviewIds.length ? { count: membershipReviewIds.length, denominator, percent: Math.round((membershipReviewIds.length / denominator) * 1000) / 10, basis: "model_coded_membership" } : null;
    return { headline, explanation, implication, requirements, status: finding.status, strength: finding.strength, reviewIds, quoteReviewIds, quotes, membershipReviewIds, evidence: evidenceSummary };
  });
  const sourceSnapshot = normalizeExport(snapshot);
  return {
    id: `ri_${hmac(String(now), stableJson({ value, requestId: options.requestId || "" })).slice(0, 20)}`, answer, coverage: sourceSnapshot.coverage,
    findings, nextQuestion: typeof value.nextQuestion === "string" ? value.nextQuestion.slice(0, 120) : null, question: { id: question.id, version: questionVersion(question) },
    model: { id: model.id, label: model.label }, usage: providerResult.usage, sourceSnapshot,
    provenance: { requestId: options.requestId || null, fingerprint: options.fingerprint || null }, createdAt: new Date(now).toISOString()
  };
}

function normalizeProviderResult(raw) {
  if (raw && typeof raw === "object" && Object.hasOwn(raw, "text")) {
    if (typeof raw.text !== "string" || !raw.text.trim()) throw invalid(`Model returned no final text${raw.stopReason ? ` (stop reason: ${raw.stopReason})` : ""}.`);
    return { text: raw.text, usage: requiredUsage(raw.usage) };
  }
  if (raw && typeof raw === "object") return { text: JSON.stringify(raw), usage: null };
  return { text: String(raw || ""), usage: null };
}
function requiredUsage(value) {
  const inputTokens = nonnegative(value?.inputTokens); const outputTokens = nonnegative(value?.outputTokens); const totalTokens = nonnegative(value?.totalTokens);
  if (inputTokens === null || outputTokens === null || totalTokens === null || totalTokens < inputTokens + outputTokens) throw providerError();
  return { inputTokens, outputTokens, totalTokens };
}
function text(value, max) { const out = String(value || "").trim(); if (!out || out.length > max) throw invalid("Model report text is invalid."); return out; }
function nonnegative(value) { const n = Number(value); return Number.isInteger(n) && n >= 0 ? n : null; }
function uniqueIds(value) { return Array.isArray(value) ? [...new Set(value.map(String))] : []; }
function rejectUnverifiedCounts(value) { if (/(?:\b\d+\s+(?:of|out of)\s+\d+\b|\b\d+(?:\.\d+)?\s*%)/i.test(value)) throw invalid("Model report includes an unverified numeric claim."); }

export function createBedrockProvider(config, fetchImpl = fetch, dependencies = {}) {
  return config.authMode === "bearer" ? createBearerBedrockProvider(config, fetchImpl) : createSdkBedrockProvider(config, dependencies);
}
function createBearerBedrockProvider(config, fetchImpl) {
  return async ({ model, snapshot, question }) => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    const endpoint = `https://bedrock-runtime.${config.region}.amazonaws.com/model/${encodeURIComponent(model.id)}/converse`;
    try {
      const response = await fetchImpl(endpoint, { method: "POST", signal: controller.signal, headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(converseRequest(snapshot, question, model)) });
      if (!response.ok) throw providerError();
      return parseConverseResponse(await response.json());
    } catch (error) { throw providerError(error); }
    finally { clearTimeout(timeout); }
  };
}
function createSdkBedrockProvider(config, dependencies) {
  let clientPromise;
  return async ({ model, snapshot, question }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      if (!clientPromise) clientPromise = bedrockSdkClient(config, dependencies);
      const { client, ConverseCommand } = await clientPromise;
      return parseConverseResponse(await client.send(new ConverseCommand({ modelId: model.id, ...converseRequest(snapshot, question, model) }), { abortSignal: controller.signal }));
    } catch (error) { throw providerError(error); }
    finally { clearTimeout(timeout); }
  };
}
async function bedrockSdkClient(config, dependencies) {
  const runtime = dependencies.runtime || await import("@aws-sdk/client-bedrock-runtime");
  const credentials = dependencies.credentials || await oidcCredentials(config);
  return { client: dependencies.client || new runtime.BedrockRuntimeClient({ region: config.region, credentials, maxAttempts: 1 }), ConverseCommand: runtime.ConverseCommand };
}
function converseRequest(snapshot, question, model) {
  return { system: [{ text: `${ANALYSIS_METHOD}\n\n${transportContract()}` }], messages: [{ role: "user", content: [{ text: analysisPrompt(snapshot, question) }] }], inferenceConfig: { maxTokens: modelOutputTokenLimit(model), temperature: 0 } };
}
export function modelOutputTokenLimit(model) {
  const configured = Number(model?.maxOutputTokens);
  if (Number.isInteger(configured) && configured >= 1_000 && configured <= 8_000) return configured;
  return 4_000;
}
function parseConverseResponse(data) {
  const usage = requiredUsage(data?.usage);
  const stopReason = String(data?.stopReason || "");
  const blocks = data?.output?.message?.content;
  const text = Array.isArray(blocks) ? blocks.filter((block) => typeof block?.text === "string").map((block) => block.text).join("").trim() : "";
  if (!text) return {
    text: null,
    usage,
    stopReason,
    incompleteReason: stopReason === "max_tokens" ? "No final text was produced before the output-token limit." : "Bedrock returned no final text content block."
  };
  return { text, usage, stopReason };
}
function transportContract() {
  return `# Hosted JSON transport contract (highest priority)\nFor this hosted call, the final response must be exactly one JSON object. Do not use Markdown, tables, evidence-line prose, headings, or code fences in the final response even when the analysis method shows those presentation formats. The user message supplies the exact required object fields. Every finding requires string fields headline, explanation, implication, and requirements; implication must start with \"Inference: \" or \"Needs analytics: \" so it cannot be mistaken for observed review evidence. status must be exactly one of OBSERVED, COMPUTED, INFERENCE, NEEDS ANALYTICS; strength must be exactly one of strong, moderate, weak, single signal. Never write or return quote text. Supply quoteReviewIds only; each must be one of the representative reviewIds. The server renderer attaches the complete literal original review text from the signed source snapshot. No model-authored substitute is accepted. reviewIds are at most four representative IDs. When membershipReviewIds is present, it must include every supplied review that meets the finding's stated inclusion criterion, not only the representative reviewIds. Membership is model-coded classification, not independently verified truth. Apply the method's strength criteria conservatively: sparse findings stay provisional, and a few examples do not become strong or recurring merely because they are vivid. Start answer with the substantive conclusion. Never start with \"Here is the first useful read\" or a generic overall-sentiment summary.`;
}
function analysisPrompt(snapshot, question) {
  return `Selected question: ${question.prompt}\nQuestion version: ${questionVersion(question)}\n\nBad answer opening: \"Here is the first useful read.\" Bad generic answer: \"Overall sentiment is positive.\" Good answer shape: \"[Specific review-backed tension] is clearest; [specific second tension] changes what to investigate next.\" Start with the substantive conclusion and no preamble.\n\nReturn exactly one JSON object and no Markdown fences or prose outside it. Use this exact structure:\n{\n  \"answer\": \"string\",\n  \"findings\": [{\n    \"headline\": \"string\",\n    \"explanation\": \"string\",\n    \"implication\": \"Inference: string or Needs analytics: string\",\n    \"requirements\": \"string describing the evidence, analytics, or action needed next\",\n    \"status\": \"OBSERVED\",\n    \"strength\": \"strong\",\n    \"reviewIds\": [\"supplied review_id; 1 to 4 representative IDs\"],\n    \"quoteReviewIds\": [\"one to four IDs selected from reviewIds; the server attaches original review text\"],\n    \"membershipReviewIds\": [\"complete supplied review_id list for this theme; required for COMPUTED, otherwise optional\"]\n  }],\n  \"nextQuestion\": \"string or null\"\n}\nAllowed status enum: [\"OBSERVED\", \"COMPUTED\", \"INFERENCE\", \"NEEDS ANALYTICS\"]. Allowed strength enum: [\"strong\", \"moderate\", \"weak\", \"single signal\"]. Use only these exact case-sensitive values. Return 1 to 6 findings and at least one quoteReviewId per finding. Never return a quotes field or any quote text. COMPUTED requires a non-empty complete membershipReviewIds list. Do not write percentages or \"n of N\" counts in model-authored text; the server computes those only from validated membership IDs. Do not invent evidence, browse, call tools, or claim outcomes reviews cannot establish.\n\nEvidence JSON:\n${JSON.stringify(snapshot)}`;
}
function questionVersion(question) { return `${QUESTION_SET_VERSION}.${sha256(question.prompt).slice(0, 12)}`; }

export async function createDynamoLedger(config, dependencies = {}) {
  let lib;
  let clientLib;
  try {
    lib = dependencies.lib || await import("@aws-sdk/lib-dynamodb");
    clientLib = dependencies.clientLib || await import("@aws-sdk/client-dynamodb");
  } catch (error) { throw storageError(error); }
  const credentials = dependencies.credentials || await oidcCredentials(config);
  const rawClient = dependencies.client ? null : dependencies.rawClient || new clientLib.DynamoDBClient({ region: config.region, credentials });
  const client = dependencies.client || lib.DynamoDBDocumentClient.from(rawClient);
  const key = (codeKey, suffix) => ({ pk: `trial#${codeKey}`, sk: suffix });
  const get = async (Key) => {
    try { return (await client.send(new lib.GetCommand({ TableName: config.tableName, Key, ConsistentRead: true }))).Item; }
    catch (error) { throw storageError(error); }
  };
  const currentRemaining = async (codeKey, limit, at = Date.now()) => {
    const counter = await get(key(codeKey, "counter"));
    const active = counter?.activeToken && Number(counter.leaseExpiresAt) > at ? 1 : 0;
    return Math.max(0, limit - Number(counter?.successes || 0) - active);
  };

  return {
    async lookup({ codeKey, requestId, fingerprint, limit }) {
      let item;
      try { item = await get(key(codeKey, `request#${requestId}`)); }
      catch (error) { throw storageError(error); }
      if (!item) return {};
      if (item.fingerprint !== fingerprint) return { accepted: false, statusCode: 409, reason: "requestId was already used for different analysis inputs." };
      if (item.state === "done" && item.report) return { report: item.report, remaining: await currentRemaining(codeKey, limit) };
      return { accepted: false, statusCode: 409, reason: "A matching analysis is already in progress or did not complete." };
    },

    async reserve({ codeKey, requestId, fingerprint, limit, attemptLimit, leaseMs, now }) {
      const requestKey = key(codeKey, `request#${requestId}`);
      const counterKey = key(codeKey, "counter");
      let existing;
      try { existing = await get(requestKey); }
      catch (error) { throw storageError(error); }
      if (existing?.fingerprint !== undefined && existing.fingerprint !== fingerprint) return { accepted: false, statusCode: 409, reason: "requestId was already used for different analysis inputs." };
      if (existing?.state === "done" && existing.report) return { report: existing.report, remaining: await currentRemaining(codeKey, limit) };
      if (existing?.state === "running" && Number(existing.leaseExpiresAt) > now) return { accepted: false, statusCode: 409, reason: "A matching analysis is already in progress." };

      const token = randomUUID();
      const leaseExpiresAt = now + leaseMs;
      const requestCondition = existing
        ? "fingerprint = :fingerprint AND (#state = :failed OR (#state = :running AND leaseExpiresAt <= :now))"
        : "attribute_not_exists(pk)";
      const requestWrite = existing ? {
        Update: {
          TableName: config.tableName, Key: requestKey,
          UpdateExpression: "SET #state = :running, fingerprint = :fingerprint, leaseToken = :token, leaseExpiresAt = :lease, updatedAt = :now REMOVE report, completedAt, failedAt",
          ConditionExpression: requestCondition,
          ExpressionAttributeNames: { "#state": "state" },
          ExpressionAttributeValues: { ":running": "running", ":failed": "failed", ":fingerprint": fingerprint, ":token": token, ":lease": leaseExpiresAt, ":now": now }
        }
      } : {
        Put: { TableName: config.tableName, Item: { ...requestKey, state: "running", fingerprint, leaseToken: token, leaseExpiresAt, createdAt: now, expiresAt: Math.floor(now / 1000) + 30 * 86400 }, ConditionExpression: requestCondition }
      };
      try {
        await client.send(new lib.TransactWriteCommand({ TransactItems: [
          requestWrite,
          { Update: {
            TableName: config.tableName, Key: counterKey,
            UpdateExpression: "SET successes = if_not_exists(successes, :zero), attempts = if_not_exists(attempts, :zero) + :one, activeToken = :token, activeRequestId = :requestId, activeFingerprint = :fingerprint, leaseExpiresAt = :lease, updatedAt = :now",
            ConditionExpression: "(attribute_not_exists(activeToken) OR leaseExpiresAt <= :now) AND (attribute_not_exists(successes) OR successes < :limit) AND (attribute_not_exists(attempts) OR attempts < :attemptLimit)",
            ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":token": token, ":requestId": requestId, ":fingerprint": fingerprint, ":lease": leaseExpiresAt, ":now": now, ":limit": limit, ":attemptLimit": attemptLimit }
          } }
        ] }));
        const counter = await get(counterKey);
        return { accepted: true, token, remaining: Math.max(0, limit - Number(counter?.successes || 0) - 1) };
      } catch (error) {
        if (!isConditionalFailure(error)) throw storageError(error);
        let counter;
        let requestItem;
        try { [counter, requestItem] = await Promise.all([get(counterKey), get(requestKey)]); }
        catch (readError) { throw storageError(readError); }
        if (requestItem?.fingerprint && requestItem.fingerprint !== fingerprint) return { accepted: false, statusCode: 409, reason: "requestId was already used for different analysis inputs." };
        if (requestItem?.state === "done" && requestItem.report) return { report: requestItem.report, remaining: Math.max(0, limit - Number(counter?.successes || 0)) };
        if (Number(counter?.attempts || 0) >= attemptLimit) return { accepted: false, statusCode: 429, reason: "This invitation has reached its analysis attempt limit.", remaining: Math.max(0, limit - Number(counter?.successes || 0)) };
        if (Number(counter?.successes || 0) >= limit) return { accepted: false, statusCode: 429, reason: "Trial limit reached.", remaining: 0 };
        return { accepted: false, statusCode: 409, reason: "Another analysis is already in progress.", remaining: Math.max(0, limit - Number(counter?.successes || 0) - (counter?.activeToken ? 1 : 0)) };
      }
    },

    async complete({ codeKey, requestId, fingerprint, token, report, limit, now }) {
      const requestKey = key(codeKey, `request#${requestId}`);
      const counterKey = key(codeKey, "counter");
      try {
        await client.send(new lib.TransactWriteCommand({ TransactItems: [
          { Update: {
            TableName: config.tableName, Key: requestKey,
            UpdateExpression: "SET #state = :done, report = :report, completedAt = :now REMOVE leaseToken, leaseExpiresAt",
            ConditionExpression: "#state = :running AND fingerprint = :fingerprint AND leaseToken = :token",
            ExpressionAttributeNames: { "#state": "state" },
            ExpressionAttributeValues: { ":done": "done", ":running": "running", ":report": report, ":now": now, ":fingerprint": fingerprint, ":token": token }
          } },
          { Update: {
            TableName: config.tableName, Key: counterKey,
            UpdateExpression: "SET successes = if_not_exists(successes, :zero) + :one, updatedAt = :now REMOVE activeToken, activeRequestId, activeFingerprint, leaseExpiresAt",
            ConditionExpression: "activeToken = :token AND activeRequestId = :requestId AND activeFingerprint = :fingerprint AND (attribute_not_exists(successes) OR successes < :limit)",
            ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":now": now, ":token": token, ":requestId": requestId, ":fingerprint": fingerprint, ":limit": limit }
          } }
        ] }));
      } catch (error) { throw storageError(error); }
      return { remaining: await currentRemaining(codeKey, limit) };
    },

    async fail({ codeKey, requestId, token, now }) {
      const requestKey = key(codeKey, `request#${requestId}`);
      const counterKey = key(codeKey, "counter");
      try {
        await client.send(new lib.TransactWriteCommand({ TransactItems: [
          { Update: {
            TableName: config.tableName, Key: requestKey,
            UpdateExpression: "SET #state = :failed, failedAt = :now REMOVE leaseToken, leaseExpiresAt",
            ConditionExpression: "#state = :running AND leaseToken = :token",
            ExpressionAttributeNames: { "#state": "state" },
            ExpressionAttributeValues: { ":failed": "failed", ":running": "running", ":now": now, ":token": token }
          } },
          { Update: {
            TableName: config.tableName, Key: counterKey,
            UpdateExpression: "SET updatedAt = :now REMOVE activeToken, activeRequestId, activeFingerprint, leaseExpiresAt",
            ConditionExpression: "activeToken = :token AND activeRequestId = :requestId",
            ExpressionAttributeValues: { ":now": now, ":token": token, ":requestId": requestId }
          } }
        ] }));
      } catch (error) { throw storageError(error); }
    }
  };
}

async function oidcCredentials(config) {
  if (!config.roleArn) return undefined;
  if (oidcProviderCache.has(config.roleArn)) return oidcProviderCache.get(config.roleArn);
  const pending = import("@vercel/oidc-aws-credentials-provider")
    .then(({ awsCredentialsProvider }) => awsCredentialsProvider({ roleArn: config.roleArn }))
    .catch((error) => { oidcProviderCache.delete(config.roleArn); throw storageError(error); });
  oidcProviderCache.set(config.roleArn, pending);
  try {
    return await pending;
  } catch (error) { throw storageError(error); }
}

function parseModels(raw) {
  try {
    const values = JSON.parse(raw || "[]");
    return Array.isArray(values) ? values.filter((v) => v && typeof v.id === "string" && typeof v.label === "string" && v.id.length <= 200).map((v) => ({
      id: v.id, label: v.label.slice(0, 120), inputUsdPerMillion: positiveNumber(v.inputUsdPerMillion), outputUsdPerMillion: positiveNumber(v.outputUsdPerMillion), pricingVerifiedAt: typeof v.pricingVerifiedAt === "string" ? v.pricingVerifiedAt : null, maxOutputTokens: boundedOutputTokens(v.maxOutputTokens)
    })) : [];
  } catch { return []; }
}
function positiveNumber(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function boundedOutputTokens(value) { const n = Number(value); return Number.isInteger(n) && n >= 1_000 && n <= 8_000 ? n : null; }
function questionFor(id) { const wanted = String(id || ""); return QUESTION_GROUPS.flatMap((group) => group.questions).find((question) => question.id === wanted) || null; }
function validOrigin(request, origins) { const origin = header(request, "origin"); return !origin || origins.includes(origin); }
function bodyTooLarge(request) { const length = Number(header(request, "content-length")); return Number.isFinite(length) && length > MAX_REQUEST_BYTES; }
function header(request, name) { const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
function isStoreUrl(value) { try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "apps.apple.com" || url.hostname === "play.google.com"); } catch { return false; } }
function hmac(secret, value) { return createHmac("sha256", secret).update(value).digest("hex"); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function constantTimeEqual(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; return timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function stableJson(value) { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function invalid(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
function providerError(cause) { return Object.assign(new Error("The approved model could not complete this analysis.", { cause }), { statusCode: 502 }); }
function storageError(cause) { return Object.assign(new Error("Durable usage storage is unavailable.", { cause }), { statusCode: 503 }); }
function safeError(error) { return error?.statusCode && error.statusCode < 500 ? error.message : error?.statusCode === 503 ? "Hosted analysis storage is temporarily unavailable." : "The analysis could not be completed."; }
function isConditionalFailure(error) { return error?.name === "TransactionCanceledException" && (error.CancellationReasons || []).some((reason) => reason?.Code === "ConditionalCheckFailed"); }
