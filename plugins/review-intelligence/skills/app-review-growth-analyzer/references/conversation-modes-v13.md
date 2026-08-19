# Conversation Modes v13

Use the smallest mode that answers the request. The conversation can move between modes, but never escalate from analysis to finished execution without an explicit request.

## Mode 1: First useful read

Use when reviews arrive without an explicit request for a full report.

Start with:

> Here's the first useful read.

Then provide:

1. Two or three distinct, high-signal findings. Use fewer if evidence is thin.
2. For each finding: the reframe, what reviewers actually describe, short Review-ID evidence, one compact status/strength line, and the strategic implication.
3. The most actionable distinction, when the evidence supports prioritization.
4. A concise coverage note. Put a mismatch warning near the beginning; otherwise the note may sit after the findings.
5. A short branch-hub return: one or two genuinely distinct paths still supported by the evidence. Mention the full boring version only when useful.

Do not start with app metadata, methodology, a generic sentiment summary, or a complete capability menu.

Suggested shape, not a rigid template:

```markdown
Here's the first useful read.

**1. [Reframing headline]**
[Pattern, evidence, implication.]
> **Evidence:** [count/recurrence and IDs]. **Status:** [...]. **Strength:** [...].

**2. [Reframing headline]**
[Pattern, evidence, implication.]
> **Evidence:** [...]. **Status:** [...]. **Strength:** [...].

[One crystallized prioritization line.]

Coverage: [analyzed denominator and compact limitation].

[Optional one-door return to a different supported branch.]
```

## Mode 2: Branch deep-dive

Use when the user selects product, monetization, customer language, creative/ASO, support/trust, competitor, segment, or another evidence-backed branch.

1. Answer the selected branch directly.
2. Go one useful layer deeper than the first read, not five.
3. Distinguish subpatterns when their cause, audience, severity, or response differs.
4. Include two to four review-backed hypotheses or directions when useful.
5. Close the branch cleanly and, when useful, return to one distinct unexplored branch from the hub.

Example branch return:

> That closes the payment-timing branch. The corpus still supports a separate recovery branch: 7 sync-loss reviews mention unanswered support, so the product failure and the recovery failure should not be treated as one issue.

## Mode 3: Strategic direction

Use for requests such as:

- “show me ASO angles”;
- “what could this become for ads?”;
- “map the paywall opportunity”;
- “give me screenshot directions”;
- “what should product investigate?”

Provide evidence-backed territories, tensions, messages, opportunities, test hypotheses, and claim boundaries. Apply the core's direction-versus-execution boundary.

Useful table fields:

| Direction | Review-backed tension/value | Evidence | Message or test territory | What not to claim |
|---|---|---|---|---|

If a branch has several possible destinations, show that choice inside the branch, then return to the broader review hub after the chosen direction is explored.

## Mode 4: Explicit execution

Use only when the request meets the core's explicit-execution rule, such as:

- “write the screenshot copy”;
- “make three finished paywall variants”;
- “write the UGC script”;
- “turn this into a PRD.”

Keep the asset traceable to Review IDs or a compact evidence note. Once it is complete, stop; return to the hub only if that adds genuine value.

## Mode 5: Evidence or comparison audit

Use when the user asks to verify a claim, compare countries/apps/versions, inspect counts, or see the evidence table.

- Show inclusion rules and denominators.
- Use exact IDs and computed counts where reliable.
- Separate within-source patterns before cross-source synthesis.
- Explain contradictory evidence and weak signals.
- Do not manufacture a single winner when tradeoffs differ by segment or market.

## Handling follow-up language

- “Why?” or “show the evidence” → stay in the current branch and expose the ledger.
- “What could we do with this?” → give strategic directions, not finished assets.
- “Yes,” “do it,” “the first one,” or “show me” → fulfill the previously offered level exactly.
- “Write/make/create the actual…” → execution is explicit.
- “What else is in the reviews?” → return to the hub and reveal the strongest unexplored branch, rather than extending the last branch.
- “Everything,” “complete report,” or “full boring version” → load and use the full-report reference.
