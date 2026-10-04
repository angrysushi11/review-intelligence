# Review Intel extension privacy

Updated 25 September 2026.

The extension does one thing: when you click it on a public App Store or Google Play app page, it opens Review Intel with that link in the form.

## The short version

- No background scraping.
- No browsing-history storage.
- No access to page content.
- No ads, profiling or sale of data.

## What it can access

The extension uses Chrome’s `activeTab` permission. It can read the current tab’s URL only after you click its toolbar button.

If that URL is a supported App Store or Google Play app page, the extension keeps only the canonical public listing URL, without fragments or nonessential tracking parameters. It doesn’t handle unrelated pages, other store pages or privileged Chrome pages.

## What it sends

It opens [Review Intel](https://www.willthiseverwork.com/review-intel/) in a new tab and puts the listing URL in the new tab’s URL fragment, so the form can be filled in. Fragments aren’t sent with the page request, and Review Intel clears the fragment after filling the form. Builds up to version 0.1.1 may keep opening reviews.doubledash.me until they update.

The listing URL reaches the review service only if you press **Get the reviews**. The extension doesn’t collect reviews itself, and it never sends page content, form data, credentials, browsing history or the URL of an unsupported page.

## Storage and data use

The current supported app-listing URL counts as web browsing activity under Chrome Web Store policy. The extension handles that one URL only after your deliberate click, and only for the hand-off above. It has no storage permission and keeps neither the URL nor your browsing history. Chrome may still record the page it opens in your normal browser history.

The extension has no account system, advertising, content scripts, host permissions, background collection or remotely hosted code. Its data isn’t sold, used for advertising or profiling, or used to decide creditworthiness or lending eligibility.

## The Review Intel website

The website is hosted on Vercel and uses Google Analytics. Analytics gets a cleaned page location and referrer, without the app link, query parameters or fragment, and a referrer is cut down to its origin. If a link carries supported UTM fields, only a validated campaign ID and the source, medium, campaign, content or term labels are sent, never the full query string. Other sources are reduced to an internal path, an external hostname or a short label.

When a visit comes from a recognized AI assistant, analytics also gets a coarse label such as ChatGPT, Claude, Perplexity, Gemini or Copilot. Those providers may still process ordinary request or page metadata under their own policies.

If you start a collection, Review Intel processes the public app URL, public review text and public review details to produce your result. Hosting and store providers may keep request metadata. Public review text and reviewer names can still be personal data, even when anyone can read them.

## Limited use

Information handled through the extension is used only to provide or improve its single user-facing purpose. It is not transferred except where necessary to provide or secure that purpose, comply with law, or as otherwise allowed by the Chrome Web Store User Data Policy.

Humans do not read extension-handled data except with your explicit consent, when necessary for security or legal compliance, or in an aggregated and anonymized form for internal operations. Use of information received from Chrome APIs follows the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your control

If you don’t want the hand-off to run, don’t click the toolbar button. You can remove the extension from Chrome at any time.

Questions: [support@willthiseverwork.com](mailto:support@willthiseverwork.com)
