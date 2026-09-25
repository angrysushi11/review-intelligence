# Review Intel + Review Intelligence

This repository contains two connected parts:

- **Review Intel** gets public written reviews from the Apple App Store or Google Play. It is available as a web tool, a Chrome extension, a command-line tool, and a read-only MCP server.
- **Review Intelligence** is the Codex plugin that analyzes those reviews while keeping evidence, inference, and business outcomes separate.

Review Intel gets the evidence. Review Intelligence analyzes it. The legacy `review-retriever` command, package, schema, and MCP server identifiers remain unchanged for compatibility.

## Use it

- Review Intel: <https://www.willthiseverwork.com/review-intel/>
- Legacy web address, kept working: <https://reviews.doubledash.me/>
- Worked analysis example (no model required): <https://www.willthiseverwork.com/review-intel/#example>
- MCP setup: <https://www.willthiseverwork.com/review-intel/setup/>
- Privacy: <https://www.willthiseverwork.com/review-intel/privacy/>

The hosted web retriever accepts an App Store or Google Play URL and exports up to 500 public written reviews as Markdown. After an export, **Analyze in Claude** and **Analyze in ChatGPT** copy the same full Review Intelligence v13 method as a prompt, your question, and the reviews, repeat your question after the reviews, then open a regular chat. Paste and send to start the analysis. Claude receives the full export; ChatGPT receives the newest 150 reviews. The method is bundled with the browser code so both paths always use the full method, without requiring an installed skill or a custom GPT. Run `npm run build:method` after changing the v13 skill sources to regenerate the Markdown and JavaScript method assets; tests reject stale generated files. The MCP returns bounded batches of up to 500 records and exposes an opaque `continuation.next_cursor` for further Google Play batches. Keep calling with the same app, market, sort order, and a limit of at least 150 until `continuation.has_more` is false. Apple coverage remains limited by the public feed for each storefront. Neither route requires an App Store Connect account, Play Console account, API key, or OAuth client.

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
      "url": "https://www.willthiseverwork.com/review-intel/mcp"
    }
  }
}
```

## Run Review Intel locally

Review Intel supports Node.js 20 through 24. Its existing command name remains `review-retriever`.

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

The Chrome extension in [`extension`](./extension) opens the current App Store or Google Play listing in hosted Review Intel with its URL prefilled. It uses only `activeTab`, has no host permissions or content scripts, and does not extract anything until the user presses **Extract reviews** in the web tool.

Version 0.1.1 is published under the former Review Retriever name. The 0.1.2 source updates the name and destination to Review Intel; it reaches installed users only after the Chrome Web Store update is uploaded, reviewed, and published. See the [extension README](./extension/README.md) for loading steps and the full data boundary.

## Repository map

- `api/` — Vercel functions for extraction and the MCP endpoint
- `src/` — store retrieval, normalization, Markdown export, CLI, and MCP logic
- `web/` — hosted Review Intel and setup pages
- `extension/` — Chrome extension source for opening a store listing in Review Intel
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

Review Intel and Review Intelligence are not affiliated with or endorsed by Apple or Google.

## Deployment

The hosted app is configured by [`vercel.json`](./vercel.json). Pushes and pull requests run the test suite, package-boundary check, and dependency audit in GitHub Actions.

Do not commit `.vercel`, environment files, exports, screenshots, or local browser artifacts.

## Security

See [`SECURITY.md`](./SECURITY.md) for private vulnerability reporting. Do not include credentials, private review datasets, or personal data in a public issue.

## License

Apache License 2.0. See [`LICENSE`](./LICENSE).
