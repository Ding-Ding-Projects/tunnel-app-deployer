'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const F = require('../../src/vdisk/format');
const { Engine, validate, freeName, packPlan } = require('../../src/vdisk/engine');

const MiB = F.MiB, GiB = F.GiB;
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tad-vdisk-'));
const fixtures = path.join(__dirname, '../fixtures/vdisk');
function fixture(name) {
  const dir = temp(), file = path.join(dir, name);
  fs.writeFileSync(file, zlib.gunzipSync(fs.readFileSync(path.join(fixtures, `${name}.gz`))));
  return file;
}

test('the header reader understands dynamic and fixed VHDX and VHD files', () => {
  const dx = F.inspectFile(fixture('dynamic.vhdx'));
  assert.equal(dx.format, 'vhdx'); assert.equal(dx.type, 'dynamic'); assert.equal(dx.virtualSize, 256 * MiB);
  assert.equal(dx.blockSize, 4 * MiB); assert.equal(dx.logicalSectorSize, 512); assert.match(dx.diskId, /^[0-9A-F-]{36}$/); assert.equal(dx.needsLogReplay, false);
  const fx = F.inspectFile(fixture('fixed.vhdx'));
  assert.equal(fx.type, 'fixed'); assert.equal(fx.virtualSize, 8 * MiB);
  const dv = F.inspectFile(fixture('dynamic.vhd'));
  assert.equal(dv.format, 'vhd'); assert.equal(dv.type, 'dynamic'); assert.equal(dv.blockSize, 2 * MiB); assert.ok(dv.virtualSize >= 128 * MiB);
  const fv = F.inspectFile(fixture('fixed.vhd'));
  assert.equal(fv.type, 'fixed'); assert.equal(fv.virtualSize, 4 * MiB);
});

test('an ISO shows its label and size, and other files are refused', () => {
  const dir = temp(), iso = path.join(dir, 'disc.iso'), buf = Buffer.alloc(40 * 1024);
  buf[32768] = 1; buf.write('CD001', 32769, 'latin1'); buf.write('MY_DISC'.padEnd(32, ' '), 32768 + 40, 'latin1');
  buf.writeUInt32LE(20, 32768 + 80); buf.writeUInt16LE(2048, 32768 + 128);
  fs.writeFileSync(iso, buf);
  const i = F.inspectFile(iso);
  assert.equal(i.format, 'iso'); assert.equal(i.label, 'MY_DISC'); assert.equal(i.virtualSize, 40960);
  const junk = path.join(dir, 'junk.vhdx'); fs.writeFileSync(junk, Buffer.alloc(2 * MiB));
  assert.throws(() => F.inspectFile(junk), e => e.code === 'unknown');
});

test('create options follow each format’s documented limits', () => {
  assert.equal(F.validateCreate({ format: 'vhdx', type: 'dynamic', size: 64 * GiB }).size, 64 * GiB);
  assert.throws(() => F.validateCreate({ format: 'vhd', type: 'dynamic', size: 2041 * GiB }), e => e.code === 'large');
  assert.throws(() => F.validateCreate({ format: 'vhdx', type: 'dynamic', size: 65 * F.TiB }), e => e.code === 'large');
  assert.throws(() => F.validateCreate({ format: 'vhdx', type: 'fixed', size: 2 * MiB }), e => e.code === 'small');
  assert.throws(() => F.validateCreate({ format: 'vhdx', type: 'dynamic', size: GiB, blockSize: 3 * MiB }), e => e.code === 'block');
  assert.throws(() => F.validateCreate({ format: 'vhd', type: 'dynamic', size: GiB, logicalSector: 4096 }), e => e.code === 'sector');
  assert.throws(() => F.validateCreate({ format: 'vhdx', type: 'differencing' }), e => e.code === 'parent');
  assert.throws(() => F.validateCreate({ format: 'vhdx', type: 'dynamic', size: GiB, sddl: 'D:P(A;;GA;;;WD)"; rm' }), e => e.code === 'sddl');
  assert.throws(() => F.validateCreate({ format: 'vhdx', type: 'dynamic', size: 40 * GiB, volume: { fileSystem: 'ReFS', devDrive: true } }), e => e.code === 'devdrive');
  assert.throws(() => F.validateCreate({ format: 'vhdx', type: 'dynamic', size: 64 * GiB, volume: { fileSystem: 'FAT32' } }), e => e.code === 'fat32');
  assert.equal(F.validateCreate({ format: 'vhdx', type: 'dynamic', size: 5 * MiB + 1 }).size, 6 * MiB, 'sizes round up to whole megabytes');
});

test('the Quick pack estimate covers clusters, records and headroom', () => {
  const small = F.packEstimate({ bytes: [10], folders: 1 });
  assert.equal(small, 512 * MiB, 'never below the minimum');
  const many = F.packEstimate({ bytes: Array(10000).fill(5000), folders: 100 });
  assert.ok(many >= 10000 * 8192 + 10100 * 1024, 'every file takes whole clusters plus a record');
  const big = F.packEstimate({ bytes: [10 * GiB] });
  assert.ok(big > 11 * GiB && big < 12 * GiB, `about ten percent headroom, got ${big / GiB}`);
  assert.equal(F.packEstimate({ bytes: [10], fileSystem: 'ReFS' }), 2 * GiB);
});

test('requests are checked before any PowerShell runs', () => {
  assert.throws(() => validate('attach', { path: 'relative.vhdx' }), e => e.code === 'path');
  assert.throws(() => validate('attach', { path: 'C:\\Users\\me\\notes.txt' }), e => e.code === 'path');
  assert.throws(() => validate('attach', { path: '\\\\?\\C:\\x.vhdx' }), e => e.code === 'path');
  assert.equal(validate('attach', { path: 'C:\\d\\disc.iso' }).readOnly, true, 'ISO files always attach read-only');
  assert.throws(() => validate('shrink', { path: 'C:\\d\\a.vhd', size: GiB }), e => e.code === 'vhdxonly');
  assert.throws(() => validate('metadata', { path: 'C:\\d\\a.vhdx', action: 'set', id: 'nope', value: 'x' }), e => e.code === 'id');
  assert.throws(() => validate('disk', { disk: 3, action: 'format' }), e => e.code === 'action');
  assert.throws(() => validate('pack', { path: 'C:\\d\\p.vhdx', items: ['rel'], size: GiB }), e => e.code === 'items');
  assert.throws(() => validate('convert', { path: 'C:\\d\\big.vhdx', target: 'C:\\d\\big.vhd', virtualSize: 3 * F.TiB }), e => e.code === 'large');
  assert.throws(() => validate('rm', {}), e => e.code === 'op');
  const c = validate('create', { path: 'C:\\d\\a.vhdx', format: 'vhdx', type: 'dynamic', size: GiB, volume: { fileSystem: 'NTFS', label: 'A:b*c', letter: 'C' } });
  assert.equal(c.volume.label, 'Abc'); assert.equal(c.volume.letter, 'auto', 'C: is never assigned');
});

test('new names never replace a file, and Quick pack names follow what was dropped', () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, 'Trips.vhdx'), 'x');
  assert.equal(path.basename(freeName(dir, 'Trips.vhdx')), 'Trips (1).vhdx');
  const trip = path.join(dir, 'Trips'); fs.mkdirSync(trip); fs.writeFileSync(path.join(trip, 'a.jpg'), Buffer.alloc(5000));
  const plan = packPlan([trip]);
  assert.equal(path.basename(plan.path), 'Trips (1).vhdx'); assert.equal(plan.files, 1); assert.equal(plan.folders, 1); assert.equal(plan.total, 5000);
  const one = path.join(dir, 'report.pdf'); fs.writeFileSync(one, 'pdf');
  assert.equal(path.basename(packPlan([one]).path), 'report.vhdx');
});

test('equivalent scripts quote paths safely', () => {
  const s = F.scriptsFor('attach', { path: "C:\\Bob's disks\\a.vhdx", readOnly: true });
  assert.match(s.powershell, /'C:\\Bob''s disks\\a\.vhdx' -Access ReadOnly/);
  assert.match(s.diskpart, /attach vdisk readonly/);
  assert.equal(F.scriptsFor('shrink', { path: 'C:\\a.vhdx', smallest: true }).diskpart, null, 'DiskPart cannot shrink, so none is offered');
});

test('the engine says plainly when it is not on Windows', async () => {
  if (process.platform === 'win32') return;
  const r = await new Engine().run('list', {});
  assert.equal(r.ok, false); assert.equal(r.code, 'platform');
});
