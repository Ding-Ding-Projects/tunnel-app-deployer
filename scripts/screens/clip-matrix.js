// Clipping matrix: opens every screen of the real renderer (with the scripted backend used for
// screenshots) at several widths and languages, and reports text that is cut off or pushed off-screen.
// Usage: node scripts/screens/clip-matrix.js [--json]
// Exits 1 when any clipping is found. `npm run audit:ui` runs the same check and much more.
'use strict';
const { chromium } = require('playwright');
const { stageApp, findClipping } = require('./stage');

const views = ['host', 'sessions', 'tools', 'features', 'guide', 'settings'];
const widths = [[360, 740], [768, 1024], [1280, 800]];
const languages = ['en', 'yue', 'both'];

(async () => {
  const staged = stageApp();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [w, h] of widths) for (const language of languages) for (const view of views) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
      const settings = encodeURIComponent(JSON.stringify({ theme: 'dark', language }));
      await page.goto(`file://${staged.index}?state=ready&view=${view}&settings=${settings}`);
      await page.waitForFunction(() => window.__screens?.done, null, { timeout: 15000 });
      results.push({ width: w, language, view, found: await page.evaluate(findClipping) });
      await page.close();
    }
  } finally { await browser.close(); staged.cleanup(); }
  const bad = results.filter(r => r.found.length);
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else {
    console.log(`Checked ${results.length} combinations (${views.length} screens x ${widths.length} widths x ${languages.length} languages).`);
    for (const r of bad) for (const f of r.found) console.log(`${r.width}px ${r.language} ${r.view}: ${f.kind} ${f.el} "${f.text}"`);
    console.log(bad.length ? `${bad.length} combinations have clipping.` : 'No clipping found.');
  }
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });
