# Review Retriever Chrome Web Store packet

Status: Chrome Web Store submission candidate. The extension MVP and hosted Review Retriever handoff are live; the Store listing has not been submitted.

## Commitment diagnosis

- Next commitment: install a small extension and click it from a public app-store listing.
- Commitment load: low effort, but the `activeTab` permission and transfer of the current supported listing URL create a trust question.
- Dominant blockers: ability first, trust second.
- Strategy: explain the one-step handoff in the first sentence, disclose the exact URL handling before installation, and keep installation/setup language out of the primary product promise.

## Exact listing copy

### Name

Review Retriever

### Summary

Open the current App Store or Google Play listing in Review Retriever with the public app URL ready to extract.

### Detailed description

Review Retriever turns public written App Store and Google Play reviews into a Markdown export.

The extension removes one manual step:

1. Open a supported App Store or Google Play app-detail page.
2. Click the Review Retriever toolbar action.
3. Review Retriever opens in a new tab with the canonical public listing URL ready in the form.
4. Press **Extract reviews** when you want the retrieval to begin.

On any unsupported page, the action opens a blank Review Retriever without forwarding that page's URL.

### Data disclosure — keep this prominent in the listing

When you click the toolbar action on a supported public app listing, the extension reads that tab's URL using `activeTab`. It removes fragments and nonessential tracking parameters, then places the canonical public listing URL in the new Review Retriever tab's URL fragment so the form can be prefilled. The fragment is cleared after prefilling and is not sent in the page request. The listing URL reaches the extraction service only if you press **Extract reviews**.

The extension does not read page content, scrape reviews in the background, retain browsing history, run advertising, or send the URL of an unsupported page. See the [privacy disclosure](./PRIVACY.md).

## Privacy practices tab

### Single purpose

Open the current supported App Store or Google Play app listing in Review Retriever with its canonical public URL ready in the form.

### `activeTab` justification

The extension uses `activeTab` only after the user clicks its toolbar action. It reads the current tab URL to confirm that the page is a supported public app-detail page and to prefill Review Retriever with the canonical public listing URL. It does not read page content and has no host permissions or content scripts.

### Remote code

Select: **No, I am not using remote code.** All extension code is packaged. The extension opens the separately hosted Review Retriever web application but does not download or execute remote extension code.

### Data type

Disclose **web browsing activity** because the extension handles the current supported app-listing URL after the user clicks. State that it is used only for the extension's single purpose, is not retained by the extension, and is not handled for unsupported pages.

### Data-use certifications

Certify only after confirming the uploaded package matches this repository state:

- data is used only to provide or improve the extension's single purpose;
- data is not sold;
- data is not used or transferred for advertising or profiling;
- data is not used for creditworthiness or lending;
- transfers are limited to what is necessary to provide or secure the stated feature, comply with law, or another Chrome-policy-allowed case;
- human access is limited to the Chrome Web Store User Data Policy exceptions described in `PRIVACY.md`.

### Privacy policy URL

Use the hosted, branded policy page:

`https://reviews.doubledash.me/extension/privacy/`

The same policy remains reviewable in source at:

`https://github.com/angrysushi11/review-intelligence/blob/main/extension/PRIVACY.md`

## Store assets

The package includes 16, 32, 48, and 128px official Double Dash icons. The 128px Store icon uses the required 96px mark with 16px transparent padding.

Prepared outside the extension ZIP:

- one 1280×800 screenshot from the verified live Review Retriever flow;
- one 440×280 small promotional tile using the official Double Dash extension mark.

## Remaining publication gates

- Finish the production click-through readback for one supported Apple listing and one supported Google Play listing.
- Choose distribution and category in the Chrome Web Store dashboard.
- Review the final listing and privacy disclosures against the uploaded ZIP.
- Obtain explicit extension-submission authority before registration or publication.
