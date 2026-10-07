import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const read = p => readFile(new URL('../'+p, import.meta.url));
const html = (await read('web/index.html')).toString();
const card = (await read('scripts/og-cards.html')).toString();
// Compare the approved card to the same saved Calm demo shown by the product.
// Counts are the price/paid-access/trial/subscription cluster, not a fresh live pull.
const scope = html.match(/Calm, (\d+) Google Play reviews/);
const theme = html.match(/(\d+) of (\d+) reviews \(\d+%\) criticize the price, paid access, the trial or the subscription requirement; (\d+) are 1★/);
assert.ok(scope && theme, 'Calm source example changed; recheck the card against the new example.');
assert.equal(scope[1], theme[2]);
assert.ok(card.includes(`Calm, ${scope[1]} Google Play reviews, United States`));
assert.ok(card.includes(`<span class="big">${theme[1]}<small> of ${scope[1]}</small></span>`));
assert.ok(card.includes(`<b>${theme[3]}</b>`));
const quote = card.match(/<mark>“([^”]+)”<\/mark>/)?.[1];
assert.ok(quote && html.includes(quote.replace(/\.$/,'')), 'Card quote no longer matches the saved demo.');
assert.ok(html.includes('United States, Jun 23 – Oct 1, 2026'), 'Calm source date/market changed; refresh its card.');
if (!process.argv.includes('--facts-only')) {
 const manifest = JSON.parse(await read('scripts/og-render-manifest.json'));
 const hash = b => createHash('sha256').update(b).digest('hex');
 assert.equal(hash(await read('scripts/og-cards.html')),manifest.sourceSha256,'Card source changed; render and visually inspect again.');
 assert.equal(manifest.cards.length,1);
 const png=await read('web/og/og-review-intel-v2.png');
 assert.equal(hash(png),manifest.cards[0].sha256);
 assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
}
console.log(`Review Intel card matches saved Calm demo: ${theme[1]}/${scope[1]}, ${theme[3]} one-star, quote and scope.`);
