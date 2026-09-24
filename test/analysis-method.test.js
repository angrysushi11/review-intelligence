import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAnalysisMethod, METHOD_SOURCES, renderMethodModule } from "../scripts/build-analysis-method.mjs";

test("the committed full method matches its v13 sources without legacy instructions", async () => {
  const generated = await buildAnalysisMethod();
  assert.equal(await readFile(new URL("../web/review-intelligence-method.md", import.meta.url), "utf8"), generated,
    "Run npm run build:method after updating the method sources");
  assert.equal(await readFile(new URL("../web/review-intelligence-method.js", import.meta.url), "utf8"), renderMethodModule(generated));
  assert.ok(generated.length < 60000);
  for (const marker of ["The branch hub", "Review Evidence Protocol v13", "Conversation Modes v13"]) {
    assert.ok(generated.includes(marker), marker);
  }
  assert.doesNotMatch(generated, /review-growth-strategist-prompt-v12\.md|references\/example-first-read\.md|## Load the right instructions|^name: app-review-growth-analyzer/m);
  let previous = -1;
  for (const source of METHOD_SOURCES) {
    const index = generated.indexOf(`Source: ${source}`);
    assert.ok(index > previous);
    previous = index;
  }
});
