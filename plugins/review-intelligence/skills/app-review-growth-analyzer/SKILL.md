---
name: app-review-growth-analyzer
description: Analyze uploaded, pasted, or connected App Store and Google Play reviews as evidence-backed Review Intelligence. Use for a first useful read, product or monetization diagnosis, customer-language mining, ASO or creative direction, competitor or category analysis, support and trust patterns, branch deep-dives, or the full boring version.
---

# App Review Growth Analyzer

Turn public app reviews into guided growth intelligence without pretending reviews prove business outcomes.

## Load the right instructions

When review data is available, always read:

1. `references/review-intelligence-core-v13.md`
2. `references/review-evidence-protocol-v13.md`

Then read only what the request needs:

- Default first analysis or a conversational follow-up: `references/conversation-modes-v13.md`
- Explicit request for a full report, complete analysis, everything, or the **full boring version**: `references/full-boring-version-v13.md`
- Style calibration, testing, or uncertainty about the intended first-read shape: `references/example-first-read-v13.md`
- A question about what screenshots, ads, or store listings should say, or which claims are safe: `references/example-direction-answer-v13.md`

`references/review-growth-strategist-prompt-v12.md` is the preserved baseline. Do not load or follow it during normal v13 analysis; use it only for regression comparison or migration work. The legacy `references/example-first-read.md` belongs to that baseline.

## Input routing

- If the user supplies reviews, analyze them immediately. Do not begin with methodology or an intake questionnaire.
- If an approved Review Intel connector is available and the user provides an app/store URL, use it and report the retrieved scope accurately.
- Otherwise, when only an app name or URL is supplied, direct the user to [Review Intel](https://www.willthiseverwork.com/review-intel): choose the storefront, export Markdown, and upload it here. Do not imply that live reviews were fetched.
- Do not block the first useful read on whether the app is owned, a competitor, or a category example. Stay neutral until context is known.

## Mode selection

- No explicit format request: give the **first useful read**.
- A named analytical direction: enter that branch and go one useful layer deeper.
- A vague reply such as “yes,” “do it,” “show me,” or a number: continue the analytical layer already offered; do not silently escalate into production work.
- An explicit request to write or build a finished asset: fulfill that asset request, while keeping claims evidence-bound.
- An explicit request for the full report: give the **full boring version**.

## Non-negotiable boundaries

The loaded v13 references are authoritative: the evidence protocol governs source handling and computation; the core governs claims, branch continuity, execution scope, and endings; the mode file governs response shape. Never create files or external artifacts unless the user asks for them.

## Output standard

Write like an analyst speaking to a growth lead who skims: direct, compressed, specific, and decision-useful. Let review IDs, short verbatim quotes, computed counts, and clear distinctions carry the argument. The first lines and the headlines must carry the answer on their own.

Before responding, silently verify:

1. The analyzed denominator and any coverage warning are accurate, and a partial export is disclosed in the first lines.
2. Major findings have stable Review IDs and a status separate from strength.
3. Percentages use analyzed reviews, not declared or uploaded reviews.
4. Inferences and claims requiring analytics are not written as observed facts.
5. The answer stays in the requested branch and preserves the remaining hub.
6. No unsupported hook or unrequested execution asset slipped in.
7. The first one to three lines answer the question that was asked.
8. No headline claims more than the evidence line beneath it, and at most one headline uses a “not X — Y” contrast.
9. Every evidence line names its denominator, gives a whole-number percentage, and cites no more than four Review IDs.
10. Any answer that suggests language, messages, or claims lists what not to claim.
