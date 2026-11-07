'use strict';
// Same-folder Base64 conversion. Encoding writes `name.ext.base64.txt` beside the source; decoding
// writes the original file back beside the text with its name and extension restored. Both stream
// in chunks so memory stays flat, never overwrite (a clash gets a numbered name), and check the
// written file before reporting success.
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const LINE = 76;                       // MIME line length in characters
const CHUNK = 57 * 3 * 4096;           // 700,416 bytes: whole 3-byte groups and whole 57-byte MIME lines
const TEXT_CHUNK = 4 * 192 * 1024;     // characters read per decode step
const MAX_NUMBER = 9999;
const VARIANTS = new Set(['standard', 'url', 'mime']);
const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URLSAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

class ConversionError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

// ---------- names ----------
function splitName(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}
// report.pdf -> report.pdf.base64.txt, report (1).pdf.base64.txt, ... so the extension survives decoding.
function encodedName(name, n = 0) {
  const [stem, ext] = splitName(name);
  return `${n ? `${stem} (${n})` : stem}${ext}.base64.txt`;
}
function numberedName(name, n = 0) {
  if (!n) return name;
  const [stem, ext] = splitName(name);
  return `${stem} (${n})${ext}`;
}
// The name pattern wins: report.pdf.base64.txt, report.pdf.b64 and report.pdf.base64 all mean report.pdf.
function nameFromPattern(textName) {
  const m = /^(.+?)(?:\.base64\.txt|\.b64\.txt|\.base64|\.b64)$/i.exec(textName);
  return m ? m[1] : null;
}
function stemForDetection(textName) {
  const m = /^(.+?)\.txt$/i.exec(textName);
  return m ? m[1] : textName;
}

const MIME_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/bmp': '.bmp',
  'image/tiff': '.tiff', 'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico', 'image/heic': '.heic',
  'application/pdf': '.pdf', 'application/zip': '.zip', 'application/gzip': '.gz', 'application/x-gzip': '.gz', 'application/x-7z-compressed': '.7z',
  'application/vnd.rar': '.rar', 'application/x-rar-compressed': '.rar', 'application/x-tar': '.tar', 'application/json': '.json',
  'application/xml': '.xml', 'text/xml': '.xml', 'text/plain': '.txt', 'text/html': '.html', 'text/css': '.css', 'text/csv': '.csv',
  'text/markdown': '.md', 'text/javascript': '.js', 'application/javascript': '.js', 'application/wasm': '.wasm', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-excel': '.xls', 'application/vnd.ms-powerpoint': '.ppt', 'application/rtf': '.rtf',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/flac': '.flac', 'audio/aac': '.aac', 'audio/mp4': '.m4a',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv', 'video/x-msvideo': '.avi',
  'font/woff': '.woff', 'font/woff2': '.woff2', 'font/otf': '.otf', 'font/ttf': '.ttf', 'application/x-sqlite3': '.sqlite',
  'application/vnd.sqlite3': '.sqlite', 'application/x-msdownload': '.exe'
};
function extensionFromMime(mime) { return MIME_EXT[String(mime || '').toLowerCase().split(';')[0].trim()] || null; }

// Bounded signature check over the first bytes only.
function extensionFromBytes(b) {
  const at = (offset, ...sig) => sig.every((v, i) => b[offset + i] === v);
  const ascii = (offset, s) => [...s].every((c, i) => b[offset + i] === c.charCodeAt(0));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return '.png';
  if (at(0, 0xff, 0xd8, 0xff)) return '.jpg';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return '.gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return '.webp';
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return '.wav';
  if (ascii(0, 'RIFF') && ascii(8, 'AVI ')) return '.avi';
  if (ascii(0, '%PDF-')) return '.pdf';
  if (at(0, 0x50, 0x4b, 0x03, 0x04) || at(0, 0x50, 0x4b, 0x05, 0x06)) return '.zip';
  if (at(0, 0x1f, 0x8b)) return '.gz';
  if (at(0, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return '.7z';
  if (ascii(0, 'Rar!')) return '.rar';
  if (ascii(4, 'ftyp')) { const brand = String.fromCharCode(...b.slice(8, 12)); return brand === 'qt  ' ? '.mov' : /^(M4A |M4B )/.test(brand) ? '.m4a' : /^(avif|avis)/.test(brand) ? '.avif' : /^(heic|heix|mif1)/.test(brand) ? '.heic' : '.mp4'; }
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return String.fromCharCode(...b.slice(0, 64)).includes('webm') ? '.webm' : '.mkv';
  if (ascii(0, 'OggS')) return '.ogg';
  if (ascii(0, 'fLaC')) return '.flac';
  if (ascii(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && b.length > 2)) return '.mp3';
  if (ascii(0, 'BM') && b.length >= 26) return '.bmp';
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return '.ico';
  if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return '.tiff';
  if (ascii(0, 'wOFF')) return '.woff';
  if (ascii(0, 'wOF2')) return '.woff2';
  if (ascii(0, 'OTTO')) return '.otf';
  if (at(0, 0x00, 0x01, 0x00, 0x00, 0x00)) return '.ttf';
  if (ascii(0, 'SQLite format 3')) return '.sqlite';
  if (ascii(0, 'MZ')) return '.exe';
  if (ascii(0, '{\\rtf')) return '.rtf';
  if (ascii(0, '<?xml')) return /<svg[\s>]/i.test(String.fromCharCode(...b.slice(0, 64))) ? '.svg' : '.xml';
  if (ascii(0, '<svg')) return '.svg';
  if (b.length && looksLikeText(b)) return '.txt';
  return null;
}
function looksLikeText(b) {
  if (b.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b.length === 64 ? trimPartialUtf8(b) : b); return true; } catch { return false; }
}
function trimPartialUtf8(b) {
  let end = b.length, back = 0;
  while (end > 0 && back < 3 && (b[end - 1] & 0xc0) === 0x80) { end--; back++; }
  if (end > 0 && b[end - 1] >= 0xc0) end--;
  return b.slice(0, end);
}

// ---------- validation and files ----------
function options(input = {}) {
  const variant = VARIANTS.has(input.variant) ? input.variant : 'standard';
  return { variant, padding: input.padding !== false, strict: input.strict !== false };
}
async function checkSource(file) {
  if (typeof file !== 'string' || !file || file.length > 32767 || file.includes('\0') || !path.isAbsolute(file)) throw new ConversionError('path', 'This file could not be opened.');
  let info;
  try { info = await fsp.stat(file); } catch { throw new ConversionError('missing', 'This file no longer exists or cannot be read.'); }
  if (info.isDirectory()) throw new ConversionError('folder', 'Only files can be converted, not folders.');
  if (!info.isFile()) throw new ConversionError('special', 'Only regular files can be converted.');
  return info;
}
async function checkSpace(dir, needed) {
  if (typeof fsp.statfs !== 'function') return;
  let s;
  try { s = await fsp.statfs(dir); } catch { return; }
  const free = Number(s.bavail) * Number(s.bsize);
  if (Number.isFinite(free) && free < needed) throw new ConversionError('space', 'There is not enough free space in that folder.', { needed, free, shortfall: needed - free });
}
// Opens the first free name with 'wx', so an existing file is never replaced, even in a race.
async function openUnique(dir, nameFor) {
  for (let n = 0; n <= MAX_NUMBER; n++) {
    const name = nameFor(n), file = path.join(dir, name);
    try { return { handle: await fsp.open(file, 'wx'), file, name, renamed: n > 0 }; } catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
  throw new ConversionError('names', 'Every numbered name for this file is already taken.');
}

class Gate {
  constructor(signal) { this.signal = signal; this.paused = false; this.waiters = []; }
  pause() { this.paused = true; }
  resume() { this.paused = false; for (const w of this.waiters.splice(0)) w(); }
  async pass() {
    if (this.signal?.aborted) throw new ConversionError('cancelled', 'Cancelled. Nothing was kept.');
    while (this.paused) {
      await new Promise(resolve => { this.waiters.push(resolve); this.signal?.addEventListener('abort', resolve, { once: true }); });
      if (this.signal?.aborted) throw new ConversionError('cancelled', 'Cancelled. Nothing was kept.');
    }
  }
}

// ---------- Base64 text ----------
function encodeChunk(buf, { variant, padding }) {
  let s = buf.toString(variant === 'url' ? 'base64url' : 'base64');
  if (variant === 'url' && padding) s += '='.repeat((3 - (buf.length % 3)) % 3);
  if (variant !== 'url' && !padding) s = s.replace(/=+$/, '');
  if (variant === 'mime') s = s.match(new RegExp(`.{1,${LINE}}`, 'g'))?.join('\r\n') ?? '';
  return s;
}

// A streaming decoder over bytes of Base64 text. Line breaks are always allowed; strict mode rejects
// any other whitespace and every character outside the chosen alphabet, with the exact position.
const STD_CODES = Buffer.from(STD, 'latin1');
function createDecoder({ variant, strict }, start = 0) {
  const primary = variant === 'url' ? URLSAFE : STD, other = variant === 'url' ? STD : URLSAFE;
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < 64; i++) table[primary.charCodeAt(i)] = i;
  if (!strict) for (let i = 0; i < 64; i++) if (table[other.charCodeAt(i)] < 0) table[other.charCodeAt(i)] = i;
  let position = start, pad = 0, count = 0, pending = '';
  // Structured so the interface can say it in every language; the English text is for logs and tests.
  const fail = (reason, offset, char) => {
    const what = { whitespace: 'whitespace is not allowed in strict mode', afterPadding: 'there is data after the padding', char: `${char} is not a Base64 character`, padding: 'the padding does not complete the last group of four', incomplete: 'the text ends with an incomplete character group', tooMuchPadding: 'there are more than two padding characters' }[reason];
    throw new ConversionError('invalid', `Not Base64 at position ${offset}: ${what}.`, { reason, offset, char });
  };
  const show = c => (c >= 33 && c < 127 ? String.fromCharCode(c) : `0x${c.toString(16).padStart(2, '0')}`);
  return {
    // Returns the decoded bytes of every complete group seen so far.
    push(bytes) {
      const mapped = Buffer.allocUnsafe(bytes.length);
      let k = 0;
      for (let i = 0; i < bytes.length; i++, position++) {
        const c = bytes[i];
        if (c === 10 || c === 13) continue;
        if (c === 32 || c === 9 || c === 12 || c === 11) { if (strict) fail('whitespace', position); continue; }
        if (c === 61) { pad++; continue; }
        if (pad) fail('afterPadding', position);
        const v = table[c];
        if (v < 0) fail('char', position, show(c));
        mapped[k++] = STD_CODES[v];
      }
      count += k;
      pending += mapped.toString('latin1', 0, k);
      const whole = pending.length - (pending.length % 4);
      const ready = Buffer.from(pending.slice(0, whole), 'base64');
      pending = pending.slice(whole);
      return ready;
    },
    end() {
      if (pad > 2) fail('tooMuchPadding', position);
      if (strict && pad && (count + pad) % 4) fail('padding', position);
      if (count % 4 === 1) fail('incomplete', position);
      const last = Buffer.from(pending, 'base64'); pending = '';
      return last;
    },
    get count() { return count; }
  };
}

// ---------- encode ----------
async function encodeBeside(source, input = {}, { signal, onProgress, gate: shared } = {}) {
  const opts = options(input), info = await checkSource(source);
  const dir = path.dirname(source), name = path.basename(source), total = info.size;
  const encodedSize = Math.ceil(total / 3) * 4 + (opts.variant === 'mime' ? Math.max(0, Math.ceil(Math.ceil(total / 3) * 4 / LINE) - 1) * 2 : 0);
  await checkSpace(dir, encodedSize + 1024 * 1024);
  const gate = shared || new Gate(signal);
  const out = await openUnique(dir, n => encodedName(name, n));
  const hash = crypto.createHash('sha256');
  let src, done = 0, first = true;
  try {
    src = await fsp.open(source, 'r');
    const buf = Buffer.allocUnsafe(CHUNK);
    let carry = Buffer.alloc(0);
    for (;;) {
      await gate.pass();
      const { bytesRead } = await src.read(buf, 0, CHUNK, null);
      const final = bytesRead === 0;
      let data = Buffer.concat([carry, buf.subarray(0, bytesRead)]);
      let take = final ? data.length : data.length - (data.length % 57);
      if (take > 0) {
        const part = data.subarray(0, take);
        hash.update(part);
        let text = encodeChunk(part, final ? opts : { ...opts, padding: true });
        if (!first && text && opts.variant === 'mime') text = '\r\n' + text;
        if (text) { await out.handle.write(text, null, 'latin1'); first = false; }
        done += part.length;
      }
      carry = Buffer.from(data.subarray(take));
      onProgress?.({ phase: 'encode', done, total });
      if (final) break;
    }
    if (done !== total) throw new ConversionError('changed', 'The file changed while it was being read. Nothing was kept.');
    await out.handle.close(); out.handle = null;
    await src.close(); src = null;
    const sha256 = hash.digest('hex');
    const check = await digestDecoded(out.file, opts, gate, onProgress, total);
    if (check.sha256 !== sha256 || check.bytes !== total) throw new ConversionError('verify', 'The round trip did not match, so the output was removed.');
    const written = await fsp.stat(out.file);
    return { ok: true, mode: 'encode', source, output: out.file, outputName: out.name, renamed: out.renamed, bytes: total, outputBytes: written.size, sha256, verified: true };
  } catch (err) {
    await out.handle?.close().catch(() => {});
    await src?.close().catch(() => {});
    await fsp.rm(out.file, { force: true }).catch(() => {});
    throw err;
  }
}

async function digestDecoded(file, opts, gate, onProgress, total) {
  const hash = crypto.createHash('sha256'), dec = createDecoder({ ...opts, strict: false });
  const fh = await fsp.open(file, 'r');
  let bytes = 0;
  try {
    const buf = Buffer.allocUnsafe(TEXT_CHUNK);
    for (;;) {
      await gate.pass();
      const { bytesRead } = await fh.read(buf, 0, TEXT_CHUNK, null);
      if (!bytesRead) break;
      const part = dec.push(buf.subarray(0, bytesRead)); hash.update(part); bytes += part.length;
      onProgress?.({ phase: 'verify', done: Math.min(bytes, total), total });
    }
    const last = dec.end(); hash.update(last); bytes += last.length;
  } finally { await fh.close(); }
  return { sha256: hash.digest('hex'), bytes };
}

// ---------- decode ----------
async function readHead(file, size) {
  const fh = await fsp.open(file, 'r');
  try { const buf = Buffer.alloc(size); const { bytesRead } = await fh.read(buf, 0, size, 0); return buf.subarray(0, bytesRead); } finally { await fh.close(); }
}

// A data: URL header, when the text is one: data:image/png;base64,....
function dataHeader(head) {
  let i = 0;
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) i = 3;
  while (i < head.length && (head[i] === 32 || head[i] === 9 || head[i] === 10 || head[i] === 13)) i++;
  if (head.subarray(i, i + 5).toString('latin1').toLowerCase() !== 'data:') return { start: i, mime: null };
  const comma = head.indexOf(44, i);
  if (comma < 0) throw new ConversionError('invalid', 'This data: URL has no comma before its data.', { reason: 'dataUrl', offset: i });
  const meta = head.subarray(i + 5, comma).toString('latin1');
  if (!/;base64$/i.test(meta)) throw new ConversionError('invalid', 'This data: URL is not Base64, so there is nothing to decode.', { reason: 'dataUrlText', offset: i });
  return { start: comma + 1, mime: meta.split(';')[0] || 'text/plain' };
}

async function decodeBeside(source, input = {}, { signal, onProgress, gate: shared } = {}) {
  const opts = options(input), info = await checkSource(source);
  const dir = path.dirname(source), textName = path.basename(source), total = info.size;
  const gate = shared || new Gate(signal);
  const head = await readHead(source, 4096);
  const { start, mime } = dataHeader(head);
  const dec = createDecoder(opts, start);
  const src = await fsp.open(source, 'r');
  let out = null;
  const hash = crypto.createHash('sha256');
  try {
    // Decode enough to name the file: the name pattern, then the data: type, then the first bytes.
    const buf = Buffer.allocUnsafe(TEXT_CHUNK);
    let position = start, firstBytes = Buffer.alloc(0), queued = [], ended = false;
    while (firstBytes.length < 64 && !ended) {
      await gate.pass();
      const { bytesRead } = await src.read(buf, 0, TEXT_CHUNK, position); position += bytesRead;
      if (!bytesRead) { const last = dec.end(); queued.push(last); firstBytes = Buffer.concat([firstBytes, last]); ended = true; break; }
      const part = dec.push(buf.subarray(0, bytesRead)); queued.push(part); firstBytes = Buffer.concat([firstBytes, part]);
    }
    const head64 = firstBytes.subarray(0, 64);
    let finalName, restoredFrom;
    const fromPattern = nameFromPattern(textName);
    if (fromPattern) { finalName = fromPattern; restoredFrom = 'name'; }
    else {
      const stem = stemForDetection(textName);
      const ext = extensionFromMime(mime) || null, sniffed = ext ? null : extensionFromBytes(head64);
      finalName = stem + (ext || sniffed || '.bin');
      restoredFrom = ext ? 'mime' : sniffed ? 'contents' : 'fallback';
    }
    await checkSpace(dir, Math.ceil(Math.max(0, total - start) * 3 / 4) + 1024 * 1024);
    out = await openUnique(dir, n => numberedName(finalName, n));
    let done = 0;
    for (const part of queued) { if (part.length) { hash.update(part); await out.handle.write(part); done += part.length; } }
    onProgress?.({ phase: 'decode', done: Math.min(position, total), total });
    while (!ended) {
      await gate.pass();
      const { bytesRead } = await src.read(buf, 0, TEXT_CHUNK, position); position += bytesRead;
      const part = bytesRead ? dec.push(buf.subarray(0, bytesRead)) : dec.end();
      if (part.length) { hash.update(part); await out.handle.write(part); done += part.length; }
      onProgress?.({ phase: 'decode', done: Math.min(position, total), total });
      if (!bytesRead) ended = true;
    }
    await out.handle.close(); out.handle = null;
    await src.close();
    const sha256 = hash.digest('hex');
    const check = await digestFile(out.file, gate, onProgress);
    if (check.sha256 !== sha256 || check.bytes !== done) throw new ConversionError('verify', 'The written file did not match the decoded data, so it was removed.');
    return { ok: true, mode: 'decode', source, output: out.file, outputName: out.name, renamed: out.renamed, restoredFrom, mime, bytes: done, sha256, verified: true };
  } catch (err) {
    await src.close().catch(() => {});
    if (out) { await out.handle?.close().catch(() => {}); await fsp.rm(out.file, { force: true }).catch(() => {}); }
    throw err;
  }
}

async function digestFile(file, gate, onProgress) {
  const hash = crypto.createHash('sha256'), fh = await fsp.open(file, 'r');
  let bytes = 0;
  try {
    const total = (await fh.stat()).size, buf = Buffer.allocUnsafe(CHUNK);
    for (;;) {
      await gate.pass();
      const { bytesRead } = await fh.read(buf, 0, CHUNK, null);
      if (!bytesRead) break;
      hash.update(buf.subarray(0, bytesRead)); bytes += bytesRead;
      onProgress?.({ phase: 'verify', done: bytes, total });
    }
  } finally { await fh.close(); }
  return { sha256: hash.digest('hex'), bytes };
}

module.exports = { encodeBeside, decodeBeside, encodedName, numberedName, nameFromPattern, extensionFromMime, extensionFromBytes, encodeChunk, createDecoder, ConversionError, Gate, CHUNK };
