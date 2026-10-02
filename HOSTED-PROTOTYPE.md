# Hosted Review Intel prototype

This invitation-only prototype accepts one shared invitation code. It allows at most three completed analyses and six total provider attempts. Only one analysis may be in flight for an invitation at a time.

## Runtime configuration

Production uses Vercel OIDC and a scoped AWS role. Required variables:

- `REVIEW_INTEL_ACCESS_CODE`
- `REVIEW_INTEL_SNAPSHOT_SECRET`
- `REVIEW_INTEL_MODELS`: JSON allowlist of `{id,label,inputUsdPerMillion,outputUsdPerMillion,pricingVerifiedAt}`
- `REVIEW_INTEL_DYNAMODB_TABLE`
- `REVIEW_INTEL_AWS_REGION`: the Bedrock and DynamoDB region; do not use Vercel's `AWS_REGION` runtime variable
- `REVIEW_INTEL_ALLOWED_ORIGINS`: exact comma-separated browser origins
- `AWS_ROLE_ARN`: role trusted by the Vercel OIDC provider

Install `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, and `@vercel/oidc-aws-credentials-provider`. The same OIDC credential provider is passed to Bedrock and DynamoDB. A bearer key from `REVIEW_INTEL_BEDROCK_API_KEY` or `AWS_BEARER_TOKEN_BEDROCK` is also supported for a bounded local benchmark.

The DynamoDB table needs string partition and sort keys named `pk` and `sk`, plus TTL on `expiresAt`. The role needs only the model invocation and DynamoDB `GetItem`, `PutItem`, `UpdateItem`, and `TransactWriteItems` actions on the selected resources.

## Request and evidence contract

`GET /api/workspace` reports readiness, public model labels, and trial limits. It never returns credentials or internal errors. The browser builds its model picker from this response, so operators can swap or relabel allowlisted Bedrock models and their output caps through `REVIEW_INTEL_MODELS` without rebuilding the UI.

`POST /api/workspace` requires `X-Review-Access`, an exact approved `Origin`, and one of these actions:

- `sample` retrieves 1–150 recent reviews and returns a 15-minute HMAC-signed snapshot.
- `analyze` accepts the signed snapshot, `questionId`, allowlisted `modelId`, and a 16–100 character `requestId`.

The request ID is permanently pinned to a fingerprint of the signed snapshot, model, question ID, and question version. Reuse with different inputs returns `409`. A completed duplicate remains retrievable after the snapshot expires; an expired snapshot cannot start a new provider call.

The normalized source snapshot preserves rating, date, app version, title, storefront, coverage, rating/date summaries, and source metadata. It is saved with the report as durable provenance. Every finding must cite supplied representative review IDs and at least one `quoteReviewId`. Models never supply displayable quote text. The server verifies that each source quote ID belongs to the representative IDs, then hydrates the complete literal original review text from the signed snapshot and tags it `source: original_review`. Unknown IDs and any model-authored `quotes` field are rejected. `COMPUTED` findings also require a complete `membershipReviewIds` list. The server verifies those IDs and derives the model-coded count, denominator, and percentage; this verifies source identity, not the model's semantic classification. Model-authored percentages and “n of N” claims are rejected.

Reservations and completions use DynamoDB conditional transactions. Provider or validation failure releases success capacity, while the failed attempt stays counted toward the six-attempt ceiling. Two-minute leases allow crash recovery. A random fencing token prevents an old timed-out invocation from completing after its lease was replaced. Storage outages return `503`; they are not presented as exhausted quota.

## Bedrock Converse

The bearer path calls the native Converse endpoint:

`POST https://bedrock-runtime.<region>.amazonaws.com/model/<urlencoded-model-id>/converse`

The request uses `system`, `messages: [{role:"user",content:[{text}]}]`, and `inferenceConfig`. The response parser reads text from `output.message.content` and token counts only from top-level `usage`. Generated JSON cannot supply or override usage. See the official [Converse API reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html), [Converse guide](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html), and [Bedrock API-key guide](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html).

## Bounded local comparison

Prepare one local structured-export fixture and configure 2–3 allowlisted models with recently verified per-million token rates. The script can use either the Vercel OIDC token plus `AWS_ROLE_ARN`, or a temporary bearer key. It does nothing unless `--run` is present:

```sh
node scripts/benchmark-bedrock.mjs --run prepared-export.json --output benchmark-results/comparison.json
```

To diagnose one allowlisted model before repeating the comparison, add `--diagnose-model <model-id>`. This mode still requires `--run`, applies the same cost ceiling, saves the private error chain, and makes only that one model call.

Before any call, it calculates a conservative maximum cost for all selected models using each model's configured output-token cap and refuses to run if that ceiling exceeds $1. Output caps are optional allowlist fields and default to 4,000. It limits the fixture to 50 reviews and recomputes ratings, dates, sources, and denominator notes for that subset while preserving the original export coverage separately. It makes no retries. The artifact saves raw provider text, authoritative usage, stop reason, calculated cost, and each validated report. A response with usage but no final text is recorded and billed as incomplete without exposing reasoning content. A response that fails report validation still records its raw text and known cost; an ambiguous provider failure reserves that model's conservative ceiling before another call can start. Private benchmark artifacts also retain a bounded, redacted error-cause chain for diagnosis. That diagnostic must never be returned by the public workspace API.
