import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Run after check:og. Approved source is kept verbatim; only card elements are captured.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'scripts/og-cards.html');
const output = path.resolve(process.argv[2] || path.join(root, 'web/og'));
const ids = process.argv.slice(3);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href);
  await page.evaluate(() => document.fonts.ready);
  const fontFaces = await page.evaluate(() => [...document.fonts].map(f => ({ family: f.family, status: f.status })));
  if (!fontFaces.some(f => f.family === 'Geist' && f.status === 'loaded')) throw new Error('Geist did not load; refusing fallback-font images.');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root: dom } = await cdp.send('DOM.getDocument');
  await mkdir(output, { recursive: true });
  const cards = ids.length ? ids : await page.locator('.card').evaluateAll(els => els.map(el => el.id));
  const evidence = { sourceSha256: hash(await readFile(source)), chromium: browser.version(), deviceScaleFactor: 1, cards: [] };
  for (const id of cards) {
    const card = page.locator(`#${id}`);
    const box = await card.boundingBox();
    if (!box || box.width !== 1200 || box.height !== 630) throw new Error(`${id}: expected 1200×630`);
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: dom.nodeId, selector: `#${id} h1` });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    if (!fonts.length || fonts.some(f => !f.familyName.startsWith('Geist') || !f.isCustomFont)) throw new Error(`${id}: actual heading font is not downloaded Geist: ${JSON.stringify(fonts)}`);
    const clipped = await card.evaluate(el => [...el.querySelectorAll('*')].filter(x => {
      const a=x.getBoundingClientRect(), b=el.getBoundingClientRect();
      return a.width && a.height && (a.left<b.left-.5 || a.top<b.top-.5 || a.right>b.right+.5 || a.bottom>b.bottom+.5);
    }).map(x => x.className?.baseVal ?? x.className));
    if (clipped.length) throw new Error(`${id}: content outside card: ${clipped}`);
    const png = await card.screenshot({ animations: 'disabled', type: 'png' });
    if (png.readUInt32BE(16)!==1200 || png.readUInt32BE(20)!==630) throw new Error(`${id}: incorrect PNG dimensions`);
    const filename = `${id}-v2.png`;
    await writeFile(path.join(output, filename), png);
    evidence.cards.push({ id, filename, width: 1200, height: 630, sha256: hash(png), fonts });
  }
  await writeFile(path.join(root, 'scripts/og-render-manifest.json'), JSON.stringify(evidence, null, 2)+'\n');
  console.log(`Rendered ${cards.length} approved cards in Chromium ${evidence.chromium}; actual Geist font verified.`);
} finally { await browser.close(); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
