# Review Intel Chrome extension

This unpacked Manifest V3 extension is a one-click bridge to Review Intel. Click it while viewing an App Store or Google Play listing and it opens `https://www.willthiseverwork.com/review-intel` with that public store URL already in the form. On any other page it opens a blank Review Intel form.

It does not scrape the page, retrieve reviews in the background, run analysis, or send a request until the user presses **Extract reviews** in Review Intel.

This 0.1.1 source package changes the destination and display name for the next Store update. The currently published 0.1.0 build still opens `https://reviews.doubledash.me/`; keep that legacy host available for those users until they update.

## Test locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this `extension` directory.
4. Open an App Store or Google Play listing and click the Review Intel toolbar action.

Version 0.1.0 is already published in the Chrome Web Store under the former Review Retriever name. The 0.1.1 update candidate includes a factual [privacy disclosure](./PRIVACY.md) and the official Double Dash mark as its Chrome icon. It is not live until its package and updated listing are submitted and approved.

## Permission and data boundary

- `activeTab` is the only permission. It gives the extension the current tab URL only after the user clicks the toolbar action.
- There are no host permissions, content scripts, storage permissions, or background retrieval calls.
- A supported public app-listing URL is placed in the URL fragment of the new Review Intel tab. Fragments are not sent in the page request. Review Intel reads the value into the form and clears the fragment; the URL reaches the extraction service only if the user presses **Extract reviews**.
- The bridge strips fragments and nonessential tracking parameters from the original store URL first; unrelated pages on the store domains are not forwarded.
- The extension itself stores nothing.
- The hosted Review Intel tool has its own request and analytics boundary; see the [extension privacy disclosure](./PRIVACY.md) and the repository's [data and privacy boundary](../README.md#data-and-privacy-boundary).

- Live tool: <https://www.willthiseverwork.com/review-intel>
- Source repository: <https://github.com/angrysushi11/review-intelligence>
