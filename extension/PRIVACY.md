# Review Retriever Chrome extension privacy

Last updated: 2026-08-25

## Purpose

The Review Retriever Chrome extension does one thing: it opens a public App Store or Google Play app listing in the hosted Review Retriever so the user can choose to retrieve its public reviews.

## What the extension accesses

The extension uses Chrome's `activeTab` permission. It can read the current tab URL only after the user clicks the Review Retriever toolbar action.

If the current page is a supported App Store or Google Play app-detail page, the extension keeps only the canonical public listing URL. It removes fragments and nonessential tracking parameters. It does not handle unrelated pages, other store pages, or privileged Chrome pages.

## What is sent

The extension opens `https://reviews.doubledash.me/` in a new tab. For a supported listing, the canonical public app URL is placed in the new tab's URL fragment so Review Retriever can prefill the form. URL fragments are not sent in the HTTP page request. Review Retriever clears the fragment after prefilling the form. The listing URL reaches the extraction service only if the user presses **Extract reviews** on the hosted page.

The extension does not retrieve reviews itself.

The extension does not send page content, browsing history, form data, credentials, or the URL of an unsupported page.

## Storage and data use

The current supported app-listing URL is web browsing activity under Chrome Web Store policy. The extension handles that single URL only after a deliberate toolbar click and only to provide the stated handoff. It has no storage permission and does not retain the listing URL or browsing history. Chrome may still record the opened Review Retriever page in normal browser history.

The extension has no account system, advertising, content scripts, host permissions, background retrieval, or remotely hosted extension code. Extension data is not sold, used for advertising or profiling, or used to determine creditworthiness or lending eligibility.

The hosted Review Retriever uses Google Analytics and is hosted on Vercel. Analytics receives a sanitized page location without the app URL, query parameters, or fragment. Those providers may still process ordinary request or page metadata under their own policies. If the user starts retrieval, Review Retriever processes the public app URL, public review text, and public review metadata to produce the requested result. Hosting and upstream app-store providers may retain request metadata. Public review text and reviewer names can still be personal data even when publicly visible.

## Limited use

Information handled through the extension is used only to provide or improve its single user-facing purpose. It is not transferred except where necessary to provide or secure that purpose, comply with law, or as otherwise allowed by the Chrome Web Store User Data Policy. Humans do not read extension-handled data except with the user's explicit consent, when necessary for security or legal compliance, or in an aggregated and anonymized form for internal operations.

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## User control

The user can stop the extension's behavior by not clicking its toolbar action or by removing the extension from Chrome.

Questions: [tools@doubledash.me](mailto:tools@doubledash.me)
