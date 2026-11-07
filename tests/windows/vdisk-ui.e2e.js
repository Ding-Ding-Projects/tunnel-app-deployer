'use strict';
// Drives the real app (main process, preload, IPC and the engine) through Tools > Virtual disks on a
// Windows runner. The runner is already elevated, so no permission prompt appears; only the native
// Save and Open dialogs are answered by the test, inside the main process.
// Run with: npm ci && npm install --no-save playwright-core && node tests/windows/vdisk-ui.e2e.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');
const F = require('../../src/vdisk/format');

const repo = path.resolve(__dirname, '../..');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'vdisk-ui-')));
const out = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'vdisk-ui');
fs.mkdirSync(out, { recursive: true });
const results = [];
const MiB = F.MiB, GiB = F.GiB;
const SLOW = { timeout: 180000 };

(async () => {
  const app = await _electron.launch({ args: [repo], cwd: repo, env: { ...process.env } });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => { localStorage.setItem('tad.onboarded', 'true'); localStorage.setItem('tad.settings', JSON.stringify({ dimSum: false, motion: 'off', sounds: false, theme: 'dark' })); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = name => page.screenshot({ path: path.join(out, `${String(results.length).padStart(2, '0')}-${name}.png`) });
  const answerSave = file => app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
  const answerOpen = paths => app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, paths);
  const detailIs = name => page.waitForFunction(n => document.getElementById('vd-detail-h')?.textContent.includes(n) && !document.querySelector('#vd-detail .vd-spin'), name, SLOW);
  const idle = () => page.waitForFunction(() => document.getElementById('vd-strip').hidden, null, SLOW);
  async function step(name, fn) {
    const started = Date.now();
    try { const note = await fn(); results.push({ name, ok: true, ms: Date.now() - started, note: note ?? '' }); console.log(`PASS ${name}${note ? ` · ${note}` : ''}`); await shot(name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()); }
    catch (e) { results.push({ name, ok: false, ms: Date.now() - started, note: e.message.split('\n')[0] }); console.log(`FAIL ${name} · ${e.message.split('\n')[0]}`); await shot(`failed-${results.length}`).catch(() => {}); }
  }
  const disk = path.join(root, 'E2E.vhdx');

  await step('open Tools > Virtual disks', async () => {
    await page.click('.dest[data-view="tools"]');
    await page.click('[data-tool="vdisk"]');
    await page.waitForSelector('#vd-list [data-vdi], #vd-list .vd-empty', SLOW);
    assert.equal(await page.isHidden('#vd-note'), true, 'Windows is detected and the attached disks were listed');
  });
  await step('create a 512 MB dynamic VHDX with an NTFS volume from the sheet', async () => {
    await answerSave(disk);
    await page.click('#vd-new');
    await page.waitForSelector('#vd-sheet:not([hidden])');
    await page.selectOption('#vd-s-size-u', String(MiB));
    await page.fill('#vd-s-size', '512');
    await page.click('#vd-s-target');
    await page.waitForFunction(() => document.querySelector('#vd-sheet .vd-saveas .mono')?.textContent.includes('E2E.vhdx'));
    await page.fill('#vd-s-label', 'E2E');
    await page.selectOption('#vd-s-letter', 'none');
    assert.match(await page.textContent('#vd-s-pre'), /free/, 'the free-space check ran');
    await page.click('#vd-s-create');
    await detailIs('E2E.vhdx'); await idle();
    const i = F.inspectFile(disk);
    assert.equal(i.format, 'vhdx'); assert.equal(i.type, 'dynamic'); assert.equal(i.virtualSize, 512 * MiB);
    return `${Math.round(fs.statSync(disk).size / MiB)} MB on disk`;
  });
  await step('attach from the details, see the volume, then detach', async () => {
    if (await page.isVisible('#vd-detach')) { await page.click('#vd-detach'); await page.click('#vd-ask-ok'); await page.waitForSelector('#vd-attach', SLOW); }
    await page.click('#vd-attach');
    await page.waitForSelector('#vd-ask:not([hidden])');
    await page.click('#vd-ask-ok');
    await page.waitForSelector('#vd-detach', SLOW); await idle();
    await page.waitForSelector('#vd-detail .vd-vol', SLOW);
    const vol = (await page.textContent('#vd-detail .vd-vols')).replace(/\s+/g, ' ').trim();
    assert.match(vol, /NTFS/);
    await page.click('#vd-detach'); await page.click('#vd-ask-ok');
    await page.waitForSelector('#vd-attach', SLOW); await idle();
    return vol;
  });
  await step('grow to 1 GB from its action card', async () => {
    await page.click('[data-vda="grow"]');
    await page.selectOption('#vd-g-size-u', String(GiB));
    await page.fill('#vd-g-size', '1');
    await page.click('#vd-ask-ok');
    await idle();
    await page.waitForFunction(() => /1 GB/.test(document.querySelector('#vd-detail .vd-facts')?.textContent || ''), null, SLOW);
    assert.equal(F.inspectFile(disk).virtualSize, GiB);
  });
  await step('more details come from Windows', async () => {
    await page.click('#vd-more');
    await page.waitForFunction(() => /Smallest safe size/.test(document.querySelector('#vd-detail .vd-facts')?.textContent || ''), null, SLOW);
  });
  await step('make a differencing child, then merge it back with the two-key confirmation', async () => {
    await page.click('[data-vda="child"]');
    await page.click('#vd-ask-ok');
    await detailIs('E2E child.avhdx'); await idle();
    assert.equal(F.inspectFile(path.join(root, 'E2E child.avhdx')).type, 'differencing');
    await page.click('[data-vda="merge"]');
    await page.waitForSelector('#confirm:not([hidden])');
    await page.click('#key1'); await page.click('#key2');
    await page.$eval('#slide', s => { s.value = '100'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.getElementById('vd-strip').hidden && /Merged/.test(document.getElementById('toasts').textContent), null, SLOW);
  });
  await step('Quick pack a folder: the VHDX lands beside it and every file is checked', async () => {
    const src = path.join(root, 'Holiday');
    fs.mkdirSync(path.join(src, 'day 1'), { recursive: true });
    for (let n = 0; n < 12; n++) fs.writeFileSync(path.join(src, 'day 1', `IMG_${2200 + n}.jpg`), Buffer.alloc(3 * MiB, n));
    fs.writeFileSync(path.join(src, 'itinerary.txt'), 'Day 1: harbour, dim sum, tram.');
    await answerOpen([src]);
    await page.click('#vd-pick-folder');
    await page.waitForSelector('#vd-pr-show', { timeout: 600000 });
    const packed = path.join(root, 'Holiday.vhdx');
    assert.ok(fs.existsSync(packed), 'Holiday.vhdx beside the folder');
    const text = (await page.textContent('#vd-pack-body')).replace(/\s+/g, ' ');
    assert.match(text, /13 · every SHA-256 matched/);
    await page.$eval('#vd-pack', el => el.scrollIntoView({ block: 'end' }));
    return text.slice(0, 160);
  });
  assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
  await app.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(out, 'vdisk-ui-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length} of ${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
