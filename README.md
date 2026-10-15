# Review Intelligence

Review Intelligence is the plugin and skill that analyze public App Store and Google Play reviews as evidence-backed product, pricing, growth and ASO insight. It runs in Codex and ChatGPT and connects to the hosted Review Intel service.

## What is here

- [`plugins/review-intelligence`](./plugins/review-intelligence): the plugin, the `app-review-growth-analyzer` skill and the connection to the hosted service.
- [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json): the marketplace file that lists the plugin.
- [`extension`](./extension): a small Chrome extension that opens the current store listing in the hosted Review Intel web tool.

The Review Intel service itself (the review retrieval and the MCP server) is hosted and is not part of this repository.

## Install the Codex plugin

```bash
codex plugin marketplace add angrysushi11/review-intelligence --ref main
codex plugin add review-intelligence@doubledash
```

Start a new task after installation so the skill and its connection load. The first time the plugin calls the service you are asked to sign in with an email code.

## Use it

- Review Intel (free web tool, up to 500 reviews, no account): <https://appreviewintel.com/?utm_source=github&utm_medium=referral>
- Setup for Claude, ChatGPT, Codex and other MCP clients: <https://appreviewintel.com/setup/?utm_source=github&utm_medium=referral>
- Privacy: <https://appreviewintel.com/privacy/?utm_source=github&utm_medium=referral>

## License

The plugin, skill and extension in this repository are under the Apache License 2.0. See [`LICENSE`](./LICENSE). The hosted service is not covered by this license.

Security reports: see [`SECURITY.md`](./SECURITY.md).
