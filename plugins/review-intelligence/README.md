# Review Intelligence plugin

Review Intelligence is a plugin for Codex and ChatGPT Work that turns public App Store and Google Play reviews into evidence-backed product, pricing, growth, and ASO insight.

It combines:

- the `app-review-growth-analyzer` skill for first reads, focused deep-dives, competitor analysis, and full reports;
- the public, read-only Review Retriever MCP server at `https://reviews.doubledash.me/mcp`;
- an upload route for review exports when a live connection is unavailable or unnecessary.

The analysis keeps review evidence, inference, and business outcomes separate. It does not modify app-store data or any other external system.

## Install from GitHub

Add the DoubleDash marketplace and install the plugin:

```bash
codex plugin marketplace add angrysushi11/review-intelligence --ref main
codex plugin add review-intelligence@doubledash
```

Start a new task after installation so the plugin's skill and MCP connection are loaded.

## Try it

```text
Analyze reviews for [App Store or Google Play URL] in the US market. Start with the first useful read.
```

You can also upload a Markdown review export and ask for product, pricing, growth, ASO, support, trust, or competitor analysis.

## Package structure

- `.codex-plugin/plugin.json` — plugin metadata and component paths
- `.mcp.json` — read-only Review Retriever connection
- `skills/app-review-growth-analyzer/` — the Review Intelligence workflow and evidence protocol

Product guide: https://www.doubledash.me/tools/review-intelligence/
