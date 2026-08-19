import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the DoubleDash marketplace resolves the public Review Intelligence plugin", async () => {
  const marketplace = JSON.parse(await readFile(new URL(".agents/plugins/marketplace.json", root), "utf8"));
  const plugin = JSON.parse(await readFile(new URL("plugins/review-intelligence/.codex-plugin/plugin.json", root), "utf8"));
  const mcp = JSON.parse(await readFile(new URL("plugins/review-intelligence/.mcp.json", root), "utf8"));
  const readme = await readFile(new URL("plugins/review-intelligence/README.md", root), "utf8");

  assert.equal(marketplace.name, "doubledash");
  assert.deepEqual(marketplace.plugins.map(({ name }) => name), ["review-intelligence"]);
  assert.equal(marketplace.plugins[0].source.path, "./plugins/review-intelligence");
  assert.equal(plugin.name, "review-intelligence");
  assert.equal(plugin.version, "0.1.0");
  assert.equal(plugin.repository, "https://github.com/angrysushi11/review-intelligence");
  assert.equal(mcp.mcpServers["review-intelligence"].url, "https://reviews.doubledash.me/mcp");
  assert.match(readme, /codex plugin marketplace add angrysushi11\/review-intelligence --ref main/);
  assert.doesNotMatch(readme, /angrysushi11\/doubledash-me/);
});
