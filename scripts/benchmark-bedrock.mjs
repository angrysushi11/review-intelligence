// This script never calls Bedrock unless --run is present.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createBedrockProvider, modelOutputTokenLimit, validateReport } from "../src/hosted/workspace.js";
import { findQuestion } from "../web/analysis-prompt.js";

const args = process.argv.slice(2);
if (args[0] !== "--run") {
  throw new Error("No model calls made. Use: node scripts/benchmark-bedrock.mjs --run <fixture.json> [--output <result.json>]");
}
const inputPath = args[1];
if (!inputPath || inputPath.startsWith("--")) throw new Error("Pass a prepared Review Intel structured export fixture after --run.");
const outputFlag = args.indexOf("--output");
const outputPath = resolve(outputFlag >= 0 && args[outputFlag + 1]
  ? args[outputFlag + 1]
  : `benchmark-results/bedrock-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

const exported = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const configuredModels = parseBenchmarkModels(process.env.REVIEW_INTEL_MODELS);
const diagnosticFlag = args.indexOf("--diagnose-model");
const diagnosticModelId = diagnosticFlag >= 0 ? String(args[diagnosticFlag + 1] || "") : "";
if (diagnosticFlag >= 0 && !diagnosticModelId) throw new Error("Pass one allowlisted model ID after --diagnose-model.");
const models = diagnosticModelId ? configuredModels.filter((model) => model.id === diagnosticModelId) : configuredModels;
if (diagnosticModelId && models.length !== 1) throw new Error("--diagnose-model must name exactly one model in REVIEW_INTEL_MODELS.");
if (!diagnosticModelId && (models.length < 2 || models.length > 3)) throw new Error("REVIEW_INTEL_MODELS must contain 2–3 approved models for a comparison.");
const region = String(process.env.REVIEW_INTEL_AWS_REGION || "").trim();
const apiKey = String(process.env.REVIEW_INTEL_BEDROCK_API_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK || "").trim();
const roleArn = String(process.env.AWS_ROLE_ARN || "").trim();
if (!region || (!apiKey && !roleArn)) throw new Error("Set REVIEW_INTEL_AWS_REGION plus AWS_ROLE_ARN/OIDC or a temporary Bedrock bearer API key.");

const reviews = Array.isArray(exported.reviews) ? exported.reviews.slice(0, 50) : [];
if (!reviews.length) throw new Error("The fixture must contain reviews.");
const snapshot = benchmarkSnapshot(exported, reviews);
const question = findQuestion("first-read");
const budgetUsd = 1;
const conservativeInputTokens = Buffer.byteLength(JSON.stringify(snapshot), "utf8") + 200_000;
const modelCeilings = new Map(models.map((model) => [model.id, cost(model, conservativeInputTokens, modelOutputTokenLimit(model))]));
const plannedCeiling = models.reduce((sum, model) => sum + modelCeilings.get(model.id), 0);
if (plannedCeiling > budgetUsd) throw new Error(`No model calls made. Conservative planned ceiling $${plannedCeiling.toFixed(4)} exceeds the $${budgetUsd.toFixed(2)} cap.`);

const provider = createBedrockProvider({ authMode: roleArn ? "oidc" : "bearer", region, apiKey, roleArn });
const results = [];
let measuredCostUsd = 0;
let committedBudgetUsd = 0;
for (const model of models) {
  const conservativeCeilingUsd = modelCeilings.get(model.id);
  if (committedBudgetUsd + conservativeCeilingUsd > budgetUsd) {
    results.push({ model: { id: model.id, label: model.label }, ok: false, stage: "budget", error: "Model was not called because its conservative ceiling would exceed the $1 cap.", conservativeCeilingUsd });
    break;
  }
  const started = Date.now();
  let raw;
  try {
    raw = await provider({ model, snapshot, question });
    const costUsd = cost(model, raw.usage.inputTokens, raw.usage.outputTokens);
    measuredCostUsd += costUsd;
    committedBudgetUsd += costUsd;
  } catch (error) {
    committedBudgetUsd += conservativeCeilingUsd;
    results.push({
      model: { id: model.id, label: model.label }, ok: false, stage: "provider", elapsedMs: Date.now() - started,
      usage: null, costUsd: null, conservativeCeilingUsd, budgetCommittedUsd: conservativeCeilingUsd,
      error: safeMessage(error), privateDiagnostic: privateErrorDetails(error)
    });
    if (committedBudgetUsd >= budgetUsd) break;
    continue;
  }

  const costUsd = cost(model, raw.usage.inputTokens, raw.usage.outputTokens);
  if (raw.incompleteReason) {
    results.push({
      model: { id: model.id, label: model.label }, ok: false, stage: "incomplete", elapsedMs: Date.now() - started,
      usage: raw.usage, costUsd, conservativeCeilingUsd, providerOutput: raw,
      error: `${raw.incompleteReason}${raw.stopReason ? ` Stop reason: ${raw.stopReason}.` : ""}`
    });
    if (committedBudgetUsd >= budgetUsd) break;
    continue;
  }
  try {
    const report = validateReport(raw, snapshot, model, { now: Date.now(), question, requestId: `benchmark-${Date.now()}`, fingerprint: null });
    results.push({
      model: { id: model.id, label: model.label }, ok: true, stage: "validated", elapsedMs: Date.now() - started,
      usage: raw.usage, costUsd, conservativeCeilingUsd, providerOutput: raw, report
    });
  } catch (error) {
    results.push({
      model: { id: model.id, label: model.label }, ok: false, stage: "validation", elapsedMs: Date.now() - started,
      usage: raw.usage, costUsd, conservativeCeilingUsd, providerOutput: raw,
      error: safeMessage(error), privateDiagnostic: privateErrorDetails(error)
    });
  }
  if (committedBudgetUsd >= budgetUsd) break;
}

const artifact = {
  createdAt: new Date().toISOString(),
  mode: diagnosticModelId ? "single-model-diagnostic" : "comparison",
  input: resolve(inputPath),
  reviewCount: reviews.length,
  originalCoverage: exported.coverage || null,
  benchmarkCoverage: snapshot.coverage,
  budgetUsd,
  conservativePlannedCeilingUsd: plannedCeiling,
  measuredCostUsd,
  committedBudgetUsd,
  pricing: models.map((model) => ({ id: model.id, inputUsdPerMillion: model.inputUsdPerMillion, outputUsdPerMillion: model.outputUsdPerMillion, pricingVerifiedAt: model.pricingVerifiedAt, maxOutputTokens: modelOutputTokenLimit(model) })),
  results
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output: outputPath, modelsAttempted: results.filter((item) => item.stage !== "budget").length, measuredCostUsd, committedBudgetUsd, allSucceeded: results.length === models.length && results.every((item) => item.ok) }, null, 2));
if (results.length !== models.length || results.some((item) => !item.ok)) process.exitCode = 1;

function parseBenchmarkModels(raw) {
  let values;
  try { values = JSON.parse(raw || "[]"); }
  catch { throw new Error("REVIEW_INTEL_MODELS is not valid JSON."); }
  if (!Array.isArray(values)) throw new Error("REVIEW_INTEL_MODELS must be an array.");
  return values.map((value) => {
    const model = {
      id: String(value?.id || ""),
      label: String(value?.label || ""),
      inputUsdPerMillion: Number(value?.inputUsdPerMillion),
      outputUsdPerMillion: Number(value?.outputUsdPerMillion),
      pricingVerifiedAt: String(value?.pricingVerifiedAt || ""),
      maxOutputTokens: value?.maxOutputTokens === undefined ? null : Number(value.maxOutputTokens)
    };
    if (!model.id || !model.label || !(model.inputUsdPerMillion > 0) || !(model.outputUsdPerMillion > 0)) throw new Error("Every benchmark model needs id, label, and positive per-million input/output USD rates.");
    const verified = Date.parse(`${model.pricingVerifiedAt}T00:00:00Z`);
    if (!Number.isFinite(verified) || verified > Date.now() + 86_400_000 || Date.now() - verified > 31 * 86_400_000) throw new Error(`Pricing for ${model.id} must have a pricingVerifiedAt date from the last 31 days.`);
    return model;
  });
}
function cost(model, inputTokens, outputTokens) { return (inputTokens * model.inputUsdPerMillion + outputTokens * model.outputUsdPerMillion) / 1_000_000; }
function safeMessage(error) { return error?.statusCode ? `HTTP ${error.statusCode}: ${error.message}` : String(error?.message || "Benchmark model failed.").slice(0, 300); }
function privateErrorDetails(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current) && chain.length < 8) {
    seen.add(current);
    const detail = {
      name: bounded(current.name, 120),
      message: sanitizedMessage(current.message),
      code: bounded(current.code || current.Code, 120),
      statusCode: finiteNumber(current.statusCode ?? current.$metadata?.httpStatusCode),
      requestId: bounded(current.$metadata?.requestId || current.requestId, 200),
      fault: bounded(current.$fault, 30),
      retryable: Boolean(current.$retryable)
    };
    chain.push(Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== null && value !== "" && value !== false)));
    current = current.cause;
  }
  return { privateLocalArtifactOnly: true, chain };
}
function sanitizedMessage(value) {
  return bounded(value, 800)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]");
}
function bounded(value, max) { return value === null || value === undefined ? "" : String(value).slice(0, max); }
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }

function benchmarkSnapshot(original, reviews) {
  const originalCount = Array.isArray(original.reviews) ? original.reviews.length : reviews.length;
  const ratings = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let rated = 0;
  const dates = [];
  const sourceCounts = new Map();
  for (const review of reviews) {
    const rating = Number(review.rating);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) { ratings[String(rating)] += 1; rated += 1; }
    const timestamp = Date.parse(review.date || "");
    if (Number.isFinite(timestamp)) dates.push(new Date(timestamp).toISOString());
    const source = String(review.source || "").trim();
    if (source) sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  }
  dates.sort();
  return {
    ...original,
    reviews,
    coverage: {
      requested: reviews.length,
      declared: original.coverage?.declared ?? null,
      retrieved: reviews.length,
      analyzed_ready: reviews.length,
      source_records_before_limit: original.coverage?.source_records_before_limit ?? originalCount,
      excluded_without_text: 0,
      truncated_to_limit: originalCount > reviews.length,
      warning: originalCount > reviews.length ? `Benchmark uses the first ${reviews.length} of ${originalCount} reviews from the prepared export.` : null,
      denominator_note: `All benchmark review-derived counts use the selected ${reviews.length} reviews. Original export coverage is stored separately in the benchmark artifact.`
    },
    ratings: { denominator: reviews.length, rated_reviews: rated, unrated_reviews: reviews.length - rated, distribution: ratings },
    dates: { denominator: reviews.length, dated_reviews: dates.length, undated_reviews: reviews.length - dates.length, oldest: dates[0] || null, newest: dates.at(-1) || null },
    sources: [...sourceCounts].map(([name, count]) => ({ name, count, requested: null, country_code: null }))
  };
}
