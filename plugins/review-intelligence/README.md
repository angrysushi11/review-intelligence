# Review Intelligence plugin

Review Intelligence is a plugin for ChatGPT and Codex that turns public App Store and Google Play reviews into evidence-backed product, pricing, growth, and ASO insight.

It combines:

- the `app-review-growth-analyzer` skill for first reads, focused deep-dives, competitor analysis, and full reports;
- the public, read-only Review Intel MCP service at `https://www.willthiseverwork.com/review-intel/mcp`;
- an upload route for review exports when a live connection is unavailable or unnecessary.

The analysis keeps review evidence, inference, and business outcomes separate. It does not modify app-store data or any other external system.

## Install from GitHub

Add the DoubleDash marketplace and install the plugin:

```bash
codex plugin marketplace add angrysushi11/review-intelligence --ref main
codex plugin add review-intelligence@doubledash
```

Start a new task after installation so the plugin's skill and MCP connection are loaded.

This GitHub marketplace is a direct installation route for supported Codex environments. A listing in the universal public Plugins Directory is a separate OpenAI submission and review process; migrating a Custom GPT does not publish the replacement plugin or carry over the GPT's existing users.

## Try it

```text
Analyze reviews for [App Store or Google Play URL] in the US market. Start with the first useful read.
```

You can also upload a Markdown review export and ask for product, pricing, growth, ASO, support, trust, or competitor analysis.

## Package structure

- `plugin.json` — portable Agent Plugins manifest
- `mcp.json` — portable read-only Review Intel connection
- `.codex-plugin/plugin.json` — OpenAI compatibility metadata and presentation
- `.mcp.json` — compatibility connection for existing Codex plugin installs
- `skills/app-review-growth-analyzer/` — the Review Intelligence workflow and evidence protocol

Product: https://www.willthiseverwork.com/review-intel/

Setup guide: https://www.willthiseverwork.com/review-intel/setup/

Privacy: https://www.willthiseverwork.com/review-intel/privacy/
