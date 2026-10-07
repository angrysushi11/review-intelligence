import test from 'node:test';
test('approved share card matches the current saved demo and rendered PNG', async () => {
 await import('../scripts/check-og-cards.mjs');
});
