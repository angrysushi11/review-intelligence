# Review Intelligence

This repository contains two connected parts:

- **Review Retriever** gets public written reviews from the Apple App Store or Google Play. It is available as a web tool, a command-line tool, and a read-only MCP server.
- **Review Intelligence** is the Codex plugin that analyzes those reviews while keeping evidence, inference, and business outcomes separate.

Review Retriever gets the evidence. Review Intelligence analyzes it.

## Use it

- Review Retriever: <https://reviews.doubledash.me/>
- Worked analysis example (no model required): <https://www.doubledash.me/tools/review-intelligence/#example>
- Review Intelligence guide: <https://www.doubledash.me/tools/review-intelligence/>
- MCP setup: <https://www.doubledash.me/tools/review-intelligence/mcp/>

The hosted web retriever accepts an App Store or Google Play URL and exports up to 500 public written reviews as Markdown. The MCP returns bounded batches of up to 500 records and exposes an opaque `continuation.next_cursor` for further Google Play batches. Keep calling with the same app, market, sort order, and a limit of at least 150 until `continuation.has_more` is false. Apple coverage remains limited by the public feed for each storefront. Neither route requires an App Store Connect account, Play Console account, API key, or OAuth client.

## Install the Codex plugin

Add the DoubleDash marketplace, then install Review Intelligence:

```bash
codex plugin marketplace add angrysushi11/review-intelligence --ref main
codex plugin add review-intelligence@doubledash
```

Start a new task after installation so the skill and its MCP connection load.

The plugin lives in [`plugins/review-intelligence`](./plugins/review-intelligence). It includes the analysis skill and this remote MCP connection:

```json
{
  "mcpServers": {
    "review-intelligence": {
      "type": "http",
      "url": "https://reviews.doubledash.me/mcp"
    }
  }
}
```

## Run Review Retriever locally

Review Retriever supports Node.js 20 through 24.

```bash
npm ci
npm test
npm start
```

The local web interface starts at `http://127.0.0.1:4173`.

The command-line retriever writes a Markdown export to `./exports` by default:

```bash
node ./bin/review-retriever.js extract \
  --url "https://play.google.com/store/apps/details?id=com.example.app" \
  --market en-US \
  --limit 500
```

List supported countries or country-language markets:

```bash
node ./bin/review-retriever.js countries
node ./bin/review-retriever.js markets
```

## Chrome extension MVP

The source-only Chrome extension in [`extension`](./extension) opens the current App Store or Google Play listing in the hosted Review Retriever with its URL prefilled. It uses only `activeTab`, has no host permissions or content scripts, and does not extract anything until the user presses **Extract reviews** in the web tool.

It is ready for unpacked local testing but has not been submitted to or published in the Chrome Web Store. See the [extension README](./extension/README.md) for loading steps and the full data boundary.

## Repository map

- `api/` — Vercel functions for extraction and the MCP endpoint
- `src/` — store retrieval, normalization, Markdown export, CLI, and MCP logic
- `web/` — hosted Review Retriever and setup pages
- `extension/` — source-only Chrome extension MVP for opening a store listing in Review Retriever
- `plugins/review-intelligence/` — Codex plugin and analysis skill
- `.agents/plugins/marketplace.json` — DoubleDash marketplace manifest
- `test/` — retriever, MCP, page, and request-boundary tests

Local exports, browser traces, screenshots, deployment metadata, and environment files are intentionally excluded from the repository and package.

## Data and privacy boundary

- The retriever reads public review text and public review metadata. It does not log in to either store or modify store data.
- The application source does not contain a review database or persistence layer. A request is processed to produce the response or download.
- Hosting and upstream store providers may retain request metadata under their own logging and privacy policies.
- Review text and reviewer names can still be personal data even when publicly visible. Handle exports according to the rules that apply to your use.
- Review evidence can show patterns in the retrieved sample. It does not, by itself, prove revenue, retention, causality, or the full customer population.

Public endpoints enforce request-size and per-response review-count limits. Google Play MCP retrieval can continue across multiple responses; Apple can be queried by storefront, but its public feeds do not expose a compatible continuation cursor. Store availability and the number of reviews returned can change because Apple and Google control the upstream sources. No public-source retrieval should be described as every review ever posted.

Review Retriever and Review Intelligence are not affiliated with or endorsed by Apple or Google.

## Deployment

The hosted app is configured by [`vercel.json`](./vercel.json). Pushes and pull requests run the test suite, package-boundary check, and dependency audit in GitHub Actions.

Do not commit `.vercel`, environment files, exports, screenshots, or local browser artifacts.

## Security

See [`SECURITY.md`](./SECURITY.md) for private vulnerability reporting. Do not include credentials, private review datasets, or personal data in a public issue.

## License

Apache License 2.0. See [`LICENSE`](./LICENSE).
