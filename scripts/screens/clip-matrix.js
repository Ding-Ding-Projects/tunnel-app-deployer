// Clipping matrix: opens every screen of the real renderer (with the scripted backend used for
// screenshots) at several widths and languages, and reports text that is cut off or pushed off-screen.
// Usage: node scripts/screens/clip-matrix.js [--json]
// Exits 1 when any clipping is found.
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const here = __dirname, root = path.resolve(here, '../..');
const views = ['host', 'sessions', 'tools', 'features', 'guide', 'settings'];
const widths = [[360, 740], [768, 1024], [1280, 800]];
const languages = ['en', 'yue', 'both'];

function stage() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-'));
  fs.cpSync(path.join(root, 'src/renderer'), path.join(work, 'app'), { recursive: true });
  fs.copyFileSync(path.join(here, 'scripted-backend.js'), path.join(work, 'app/mock.js'));
  fs.copyFileSync(path.join(here, 'drive.js'), path.join(work, 'app/after.js'));
  const index = path.join(work, 'app/index.html');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8')
    .replace('<script defer src="i18n.js"></script>', '<script src="mock.js"></script><script defer src="i18n.js"></script>')
    .replace('<script defer src="app.js"></script>', '<script defer src="app.js"></script><script defer src="after.js"></script>'));
  return { work, index };
}

// Runs in the page: visible text elements whose own text is cut off, or that end past the window edge.
function findClipping() {
  const out = [], vw = document.documentElement.clientWidth;
  const label = el => (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') || el.tagName.toLowerCase();
  const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && p !== document.documentElement && p !== document.body && !p.classList.contains('main')) return true; return false; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[hidden],.sr-only,svg,.ctx,.tabstrip,.list,pre,textarea')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) continue;
    const ellipsis = cs.textOverflow === 'ellipsis';
    if (!ellipsis && (el.scrollWidth > el.clientWidth + 1 && ['hidden', 'clip'].includes(cs.overflowX))) out.push({ kind: 'cut', el: label(el), text: el.textContent.trim().slice(0, 60) });
    if (r.right > vw + 1 && !scrolls(el)) out.push({ kind: 'offscreen', el: label(el), text: el.textContent.trim().slice(0, 60), right: Math.round(r.right), vw });
  }
  return out;
}

(async () => {
  const { work, index } = stage();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [w, h] of widths) for (const language of languages) for (const view of views) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
      const settings = encodeURIComponent(JSON.stringify({ theme: 'dark', language }));
      await page.goto(`file://${index}?state=ready&view=${view}&settings=${settings}`);
      await page.waitForTimeout(700);
      const found = await page.evaluate(findClipping);
      results.push({ width: w, language, view, found });
      await page.close();
    }
  } finally { await browser.close(); fs.rmSync(work, { recursive: true, force: true }); }
  const bad = results.filter(r => r.found.length);
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else {
    console.log(`Checked ${results.length} combinations (${views.length} screens x ${widths.length} widths x ${languages.length} languages).`);
    for (const r of bad) for (const f of r.found) console.log(`${r.width}px ${r.language} ${r.view}: ${f.kind} ${f.el} "${f.text}"`);
    console.log(bad.length ? `${bad.length} combinations have clipping.` : 'No clipping found.');
  }
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });
