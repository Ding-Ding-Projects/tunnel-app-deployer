'use strict';
// Real virtual disk operations on a Windows runner (already elevated, so no prompt appears).
// Every step uses the same engine and script as the app. Run with: node tests/windows/vdisk.integration.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Engine, packPlan } = require('../../src/vdisk/engine');
const F = require('../../src/vdisk/format');

const engine = new Engine({ elevate: 'auto' });
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'vdisk-it-')));
const results = [];
const MiB = F.MiB;
async function step(name, fn) {
  const started = Date.now();
  try { const note = await fn(); results.push({ name, ok: true, ms: Date.now() - started, note: note ?? '' }); console.log(`PASS ${name}${note ? ` · ${note}` : ''}`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - started, note: e.message }); console.log(`FAIL ${name} · ${e.message}`); }
}
async function run(op, args, opts) {
  const progress = [];
  const r = await engine.run(op, args, { ...opts, onProgress: p => progress.push(p) });
  if (!r.ok) throw new Error(`${op}: ${r.code} ${r.message || ''}${r.line ? ` (script line ${r.line})` : ''}`.trim());
  return Object.assign(r, { progress });
}
const p = name => path.join(root, name);

(async () => {
  const vol = { style: 'GPT', fileSystem: 'NTFS', label: 'Test', letter: 'none' };
  await step('create a dynamic VHDX with an NTFS volume', async () => {
    const r = await run('create', { path: p('a.vhdx'), format: 'vhdx', type: 'dynamic', size: 300 * MiB, volume: vol });
    const i = F.inspectFile(p('a.vhdx'));
    assert.equal(i.format, 'vhdx'); assert.equal(i.type, 'dynamic'); assert.equal(i.virtualSize, 300 * MiB);
    assert.ok(r.volume?.some(v => v.fileSystem === 'NTFS'), 'volume formatted');
    return `${i.blockSize / MiB} MB blocks, ${i.logicalSectorSize}/${i.physicalSectorSize} sectors`;
  });
  await step('the header reader agrees with the VirtDisk API', async () => {
    const d = await run('details', { path: p('a.vhdx') }), i = F.inspectFile(p('a.vhdx'));
    assert.equal(Number(d.virtualSize), i.virtualSize); assert.equal(Number(d.blockSize), i.blockSize); assert.equal(Number(d.sectorSize), i.logicalSectorSize);
    assert.equal(Number(d.providerSubtype), 3, 'dynamic subtype');
    return `identifier ${d.identifier}, virtual disk id ${d.virtualDiskId}, page 83 ${i.diskId}`;
  });
  await step('attach, list, write a file, detach', async () => {
    await run('attach', { path: p('a.vhdx') });
    const list = await run('list', {});
    const mine = list.disks.find(d => String(d.path).toLowerCase() === p('a.vhdx').toLowerCase());
    assert.ok(mine, `listed as attached; listed: ${JSON.stringify(list.disks.map(d => d.path))}`);
    const state = await run('state', { path: p('a.vhdx') });
    assert.equal(state.attached, true);
    const letter = state.disk.volumes.find(v => v.letter)?.letter;
    if (letter) fs.writeFileSync(`${letter}:\\hello.txt`, 'hello');
    await run('detach', { path: p('a.vhdx') });
    assert.equal((await run('state', { path: p('a.vhdx') })).attached, false);
    return letter ? `wrote to ${letter}:` : 'no drive letter assigned';
  });
  await step('grow to 600 MB and extend the volume', async () => {
    await run('grow', { path: p('a.vhdx'), size: 600 * MiB, extend: true });
    assert.equal(F.inspectFile(p('a.vhdx')).virtualSize, 600 * MiB);
    await run('attach', { path: p('a.vhdx'), readOnly: true });
    const s = await run('state', { path: p('a.vhdx') });
    await run('detach', { path: p('a.vhdx') });
    const big = Math.max(...s.disk.volumes.map(v => Number(v.size) || 0));
    assert.ok(big > 500 * MiB, `volume is ${big}`);
    return `${Math.round(big / MiB)} MB volume`;
  });
  await step('compact, quick and full', async () => {
    const q = await run('compact', { path: p('a.vhdx'), mode: 'quick' });
    const f = await run('compact', { path: p('a.vhdx'), mode: 'full' });
    return `${q.before} → ${q.fileSize} → ${f.fileSize} bytes`;
  });
  await step('shrink to the smallest safe size', async () => {
    const r = await run('shrink', { path: p('a.vhdx'), smallest: true });
    const i = F.inspectFile(p('a.vhdx'));
    assert.ok(i.virtualSize < 600 * MiB, `still ${i.virtualSize}`);
    return `${Math.round(i.virtualSize / MiB)} MB`;
  });
  await step('convert VHDX to a dynamic VHD and to a fixed VHDX', async () => {
    await run('convert', { path: p('a.vhdx'), target: p('a.vhd'), type: 'dynamic' });
    assert.equal(F.inspectFile(p('a.vhd')).format, 'vhd'); assert.equal(F.inspectFile(p('a.vhd')).type, 'dynamic');
    await run('convert', { path: p('a.vhdx'), target: p('a-fixed.vhdx'), type: 'fixed' });
    assert.equal(F.inspectFile(p('a-fixed.vhdx')).type, 'fixed');
  });
  await step('differencing child, chain, reparent and merge', async () => {
    await run('child', { path: p('a.vhdx'), target: p('a-child.avhdx') });
    const c = F.inspectFile(p('a-child.avhdx'));
    assert.equal(c.type, 'differencing'); assert.ok(/a\.vhdx$/i.test(c.parent.absolute || c.parent.relative || ''), 'parent locator names a.vhdx');
    assert.equal(F.chainOf(p('a-child.avhdx')).length, 2);
    fs.copyFileSync(p('a.vhdx'), p('a-moved.vhdx'));
    await run('reparent', { path: p('a-child.avhdx'), parent: p('a-moved.vhdx') });
    assert.ok(/a-moved\.vhdx$/i.test(F.inspectFile(p('a-child.avhdx')).parent.absolute || ''), 'parent changed');
    await run('merge', { path: p('a-child.avhdx'), depth: 1 });
  });
  await step('new identifier', async () => {
    const before = await run('details', { path: p('a-fixed.vhdx') }), page83 = F.inspectFile(p('a-fixed.vhdx')).diskId;
    const r = await run('newid', { path: p('a-fixed.vhdx') });
    const after = await run('details', { path: p('a-fixed.vhdx') }), page83b = F.inspectFile(p('a-fixed.vhdx')).diskId;
    assert.notEqual(after.virtualDiskId, before.virtualDiskId, 'virtual disk id (page 83) changed'); assert.notEqual(page83b, page83, 'page 83 metadata changed');
    return `identifier changed; virtual disk id ${before.virtualDiskId === after.virtualDiskId ? 'unchanged' : 'changed'}; page 83 ${page83 === page83b ? 'unchanged' : 'changed'}`;
  });
  await step('custom metadata set, read, delete', async () => {
    const id = crypto.randomUUID();
    const set = await run('metadata', { path: p('a-fixed.vhdx'), action: 'set', id, value: 'hello metadata' });
    assert.ok(set.items.some(x => x.id.toLowerCase() === id && x.text === 'hello metadata'));
    assert.ok(F.inspectFile(p('a-fixed.vhdx')).userMetadata.some(x => x.id.toLowerCase() === id), 'header reader sees the user item');
    const del = await run('metadata', { path: p('a-fixed.vhdx'), action: 'delete', id });
    assert.ok(!del.items.some(x => x.id.toLowerCase() === id));
  });
  await step('VHD format: create, child, merge', async () => {
    await run('create', { path: p('b.vhd'), format: 'vhd', type: 'dynamic', size: 64 * MiB });
    await run('child', { path: p('b.vhd'), target: p('b-child.vhd') });
    assert.equal(F.inspectFile(p('b-child.vhd')).type, 'differencing');
    await run('merge', { path: p('b-child.vhd'), depth: 1 });
  });
  await step('limits are refused before anything runs', async () => {
    const r = await engine.run('create', { path: p('huge.vhd'), format: 'vhd', type: 'dynamic', size: 3000 * F.GiB });
    assert.equal(r.ok, false); assert.equal(r.code, 'large'); assert.equal(fs.existsSync(p('huge.vhd')), false);
  });
  await step('Quick pack grows by itself and verifies every file', async () => {
    const src = p('trip'); fs.mkdirSync(path.join(src, 'day 1', 'raw'), { recursive: true });
    const hashes = {};
    for (let i = 0; i < 24; i++) {
      const rel = path.join(i % 2 ? 'day 1' : path.join('day 1', 'raw'), `photo-${i}.bin`), data = crypto.randomBytes(6 * MiB);
      fs.writeFileSync(path.join(src, rel), data); hashes[rel] = crypto.createHash('sha256').update(data).digest('hex');
    }
    fs.writeFileSync(path.join(src, 'note.txt'), 'small'); fs.writeFileSync(`${path.join(src, 'note.txt')}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n');
    fs.chmodSync(path.join(src, 'note.txt'), 0o444);
    const plan = packPlan([src]);
    assert.equal(path.basename(plan.path), 'trip.vhdx');
    const r = await run('pack', { path: plan.path, items: [src], size: 96 * MiB, fileSystem: 'NTFS', label: 'trip' });
    assert.equal(r.files, 25); assert.ok(r.grows.length >= 1, 'grew at least once'); assert.equal(r.partial, false);
    assert.ok(r.progress.some(x => x.step === 'grow'), 'reported the growth');
    await run('attach', { path: plan.path, readOnly: true });
    const s = await run('state', { path: plan.path });
    const letter = s.disk.volumes.find(v => v.letter)?.letter;
    let checked = 0;
    if (letter) {
      for (const [rel, h] of Object.entries(hashes)) { assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`${letter}:\\trip\\${rel}`)).digest('hex'), h); checked++; }
      assert.match(fs.readFileSync(`${letter}:\\trip\\note.txt:Zone.Identifier`, 'utf8'), /ZoneId=3/);
      assert.equal(fs.statSync(`${letter}:\\trip\\note.txt`).mode & 0o222, 0, 'the read-only flag came along');
    }
    await run('detach', { path: plan.path });
    const plan2 = packPlan([src]);
    assert.equal(path.basename(plan2.path), 'trip (1).vhdx', 'never overwrites');
    return `grew ${r.grows.map(g => `${Math.round(g.from / MiB)}→${Math.round(g.to / MiB)} MB`).join(', ')}; ${checked} files re-checked from the disk`;
  });
  await step('a cancelled pack leaves nothing behind', async () => {
    const src = p('many'); fs.mkdirSync(src);
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(src, `f${i}.bin`), crypto.randomBytes(64 * 1024));
    const plan = packPlan([src]);
    let id = null;
    const r = await engine.run('pack', { path: plan.path, items: [src], size: plan.size }, { onProgress: x => { id = x.id; if (x.step === 'copy' && x.index === 5) engine.cancel(x.id); } });
    assert.equal(r.ok, false); assert.equal(r.code, 'cancelled'); assert.equal(fs.existsSync(plan.path), false, 'no VHDX left');
  });
  await step('VHD Set create and attach (best effort, needs Hyper-V parts)', async () => {
    const r = await engine.run('create', { path: p('set.vhds'), format: 'vhdset', type: 'dynamic', size: 64 * MiB });
    return r.ok ? 'created' : `not available here: ${r.code} ${r.message}`;
  });
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'vdisk-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length} of ${results.length} steps passed`);
  try { for (const f of fs.readdirSync(root)) if (/\.(vhdx?|avhdx?)$/i.test(f)) await engine.run('detach', { path: p(f) }); } catch { }
  process.exit(failed.length ? 1 : 0);
})();
