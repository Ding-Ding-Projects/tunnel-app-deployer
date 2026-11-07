'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const B = require('../../src/base64-files');
const T = require('../../src/renderer/tools');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tad-b64-'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

test('encoded and numbered names keep the original extension', () => {
  assert.equal(B.encodedName('report.pdf'), 'report.pdf.base64.txt');
  assert.equal(B.encodedName('report.pdf', 1), 'report (1).pdf.base64.txt');
  assert.equal(B.encodedName('Makefile', 2), 'Makefile (2).base64.txt');
  assert.equal(B.encodedName('.env'), '.env.base64.txt');
  assert.equal(B.numberedName('photo.png', 3), 'photo (3).png');
  assert.equal(B.nameFromPattern('report (1).pdf.base64.txt'), 'report (1).pdf');
  assert.equal(B.nameFromPattern('image.png.B64'), 'image.png');
  assert.equal(B.nameFromPattern('notes.txt'), null);
});

test('chunked encoding matches the panel encoder for every variant', () => {
  const bytes = crypto.randomBytes(1000);
  for (const variant of ['standard', 'url', 'mime']) for (const padding of [true, false]) {
    assert.equal(B.encodeChunk(bytes, { variant, padding }), T.encodeBytes(bytes, { variant, padding }), `${variant} ${padding}`);
  }
});

test('the streaming decoder names the exact offset of a bad character', () => {
  const dec = B.createDecoder({ variant: 'standard', strict: true });
  assert.throws(() => dec.push(Buffer.from('QUJD#')), err => err.code === 'invalid' && err.reason === 'char' && err.offset === 4 && err.char === '#');
  const lenient = B.createDecoder({ variant: 'standard', strict: false });
  const out = Buffer.concat([lenient.push(Buffer.from('QU JD\nRA')), lenient.end()]);
  assert.equal(out.toString(), 'ABCD');
});

test('encode beside writes name.ext.base64.txt, verifies it and never overwrites', async () => {
  const dir = temp(), src = path.join(dir, 'report.pdf');
  const bytes = crypto.randomBytes(B.CHUNK * 2 + 1234);
  fs.writeFileSync(src, bytes);
  const seen = [];
  const first = await B.encodeBeside(src, { variant: 'mime' }, { onProgress: p => seen.push(p.phase) });
  assert.equal(first.outputName, 'report.pdf.base64.txt');
  assert.equal(first.verified, true);
  assert.equal(first.sha256, sha(bytes));
  assert.equal(fs.readFileSync(first.output, 'latin1'), T.encodeBytes(bytes, { variant: 'mime' }));
  assert.ok(seen.includes('encode') && seen.includes('verify'));
  const second = await B.encodeBeside(src, { variant: 'url', padding: false });
  assert.equal(second.outputName, 'report (1).pdf.base64.txt');
  assert.equal(second.renamed, true);
  assert.equal(fs.readFileSync(first.output, 'latin1'), T.encodeBytes(bytes, { variant: 'mime' }), 'the first output is untouched');
  assert.deepEqual(fs.readFileSync(src), bytes, 'the source is untouched');
});

test('decode beside restores the name from the pattern, refusing to overwrite', async () => {
  const dir = temp(), bytes = crypto.randomBytes(5000);
  fs.writeFileSync(path.join(dir, 'report.pdf'), 'existing');
  const txt = path.join(dir, 'report.pdf.base64.txt');
  fs.writeFileSync(txt, T.encodeBytes(bytes, { variant: 'mime' }) + '\r\n');
  const r = await B.decodeBeside(txt, { variant: 'standard', strict: true });
  assert.equal(r.outputName, 'report (1).pdf');
  assert.equal(r.restoredFrom, 'name');
  assert.equal(r.renamed, true);
  assert.deepEqual(fs.readFileSync(r.output), bytes);
  assert.equal(fs.readFileSync(path.join(dir, 'report.pdf'), 'utf8'), 'existing');
});

test('decode beside finds the extension from a data: type, then the first bytes, then .bin', async () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, 'picture.txt'), `data:image/webp;base64,${T.encodeBytes(PNG)}`);
  const a = await B.decodeBeside(path.join(dir, 'picture.txt'), { strict: true });
  assert.equal(a.outputName, 'picture.webp'); assert.equal(a.restoredFrom, 'mime');
  fs.writeFileSync(path.join(dir, 'photo.txt'), T.encodeBytes(PNG));
  const b = await B.decodeBeside(path.join(dir, 'photo.txt'), { strict: true });
  assert.equal(b.outputName, 'photo.png'); assert.equal(b.restoredFrom, 'contents');
  fs.writeFileSync(path.join(dir, 'blob'), T.encodeBytes(Buffer.from([0, 1, 2, 3, 255, 254])));
  const c = await B.decodeBeside(path.join(dir, 'blob'), { strict: true });
  assert.equal(c.outputName, 'blob.bin'); assert.equal(c.restoredFrom, 'fallback');
  assert.equal(B.extensionFromBytes(Buffer.from('%PDF-1.7')), '.pdf');
  assert.equal(B.extensionFromMime('application/pdf; charset=binary'), '.pdf');
});

test('a refused decode or a cancel leaves no new file and the source untouched', async () => {
  const dir = temp(), bad = path.join(dir, 'notes.txt');
  fs.writeFileSync(bad, 'QUJD'.repeat(400) + '#QUJD');
  await assert.rejects(B.decodeBeside(bad, { strict: true }), err => err.code === 'invalid' && err.offset === 1600);
  assert.deepEqual(fs.readdirSync(dir), ['notes.txt']);
  const src = path.join(dir, 'big.bin');
  fs.writeFileSync(src, crypto.randomBytes(B.CHUNK * 3));
  const controller = new AbortController();
  await assert.rejects(B.encodeBeside(src, {}, { signal: controller.signal, onProgress: () => controller.abort() }), err => err.code === 'cancelled');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['big.bin', 'notes.txt']);
  await assert.rejects(B.encodeBeside(dir), err => err.code === 'folder');
  await assert.rejects(B.encodeBeside('relative.txt'), err => err.code === 'path');
});

test('pausing holds the work until it resumes', async () => {
  const gate = new B.Gate();
  gate.pause();
  let passed = false;
  const waiting = gate.pass().then(() => { passed = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(passed, false);
  gate.resume();
  await waiting;
  assert.equal(passed, true);
});
