# Review Retriever Chrome extension MVP

This unpacked Manifest V3 extension is a one-click bridge to the existing Review Retriever. Click it while viewing an App Store or Google Play listing and it opens `https://reviews.doubledash.me/` with that public store URL already in the form. On any other page it opens a blank Retriever.

It does not scrape the page, retrieve reviews in the background, run analysis, or send a request until the user presses **Extract reviews** in Review Retriever.

## Try the local MVP

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this `extension` directory.
4. Open an App Store or Google Play listing and click the Review Retriever toolbar action.

This source is an MVP for local testing. It has not been submitted to or published in the Chrome Web Store.

The review candidate includes a factual [privacy disclosure](./PRIVACY.md) and the official Double Dash mark as its Chrome icon. Store screenshots, distribution settings, and submission remain separate publication work.

## Permission and data boundary

- `activeTab` is the only permission. It gives the extension the current tab URL only after the user clicks the toolbar action.
- There are no host permissions, content scripts, storage permissions, or background retrieval calls.
- A supported public app-listing URL is placed in the URL fragment of the new Review Retriever tab. Fragments are not sent in the page request. Review Retriever reads the value into the form and clears the fragment; the URL reaches the extraction service only if the user presses **Extract reviews**.
- The bridge strips fragments and nonessential tracking parameters from the original store URL first; unrelated pages on the store domains are not forwarded.
- The extension itself stores nothing.
- The hosted Review Retriever has its own request and analytics boundary; see the [extension privacy disclosure](./PRIVACY.md) and the repository's [data and privacy boundary](../README.md#data-and-privacy-boundary).

- Live tool: <https://reviews.doubledash.me/>
- Source repository: <https://github.com/angrysushi11/review-intelligence>
