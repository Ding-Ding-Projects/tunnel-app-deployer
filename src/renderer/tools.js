'use strict';
// Local tools: Base64 encode/decode, tabular conversion and personal-vocabulary validation.
(function (root) {
  const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const URLSAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function textToBytes(text, encoding = 'utf-8') {
    const s = String(text);
    if (encoding === 'utf-8') return new TextEncoder().encode(s);
    if (encoding === 'utf-16le') { const out = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out[i * 2] = c & 255; out[i * 2 + 1] = c >> 8; } return out; }
    if (encoding === 'latin1') { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 255) throw new Error(`Character at position ${i} cannot be written as Latin-1.`); out[i] = c; } return out; }
    throw new Error('Unknown text encoding.');
  }
  function bytesToText(bytes, encoding = 'utf-8') {
    if (encoding === 'utf-8') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (encoding === 'utf-16le') { if (bytes.length % 2) throw new Error('UTF-16 text needs an even number of bytes.'); let s = ''; for (let i = 0; i < bytes.length; i += 2) s += String.fromCharCode(bytes[i] | bytes[i + 1] << 8); return s; }
    if (encoding === 'latin1') { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return s; }
    throw new Error('Unknown text encoding.');
  }

  function encodeBytes(bytes, { variant = 'standard', padding = true, lineLength = 0 } = {}) {
    const abc = variant === 'url' ? URLSAFE : STD;
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = bytes[i] << 16 | (bytes[i + 1] ?? 0) << 8 | (bytes[i + 2] ?? 0);
      out += abc[n >> 18 & 63] + abc[n >> 12 & 63] + (i + 1 < bytes.length ? abc[n >> 6 & 63] : padding ? '=' : '') + (i + 2 < bytes.length ? abc[n & 63] : padding ? '=' : '');
    }
    const width = variant === 'mime' ? (lineLength || 76) : lineLength;
    if (width > 0) out = out.match(new RegExp(`.{1,${width}}`, 'g'))?.join('\r\n') ?? '';
    return out;
  }

  // Strict decoding rejects anything outside the alphabet and reports the exact offset.
  // Lenient decoding skips whitespace and accepts both alphabets and missing padding.
  function decodeToBytes(input, { strict = true, variant = 'standard' } = {}) {
    const s = String(input);
    const values = [];
    let pad = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (/\s/.test(c)) { if (strict && variant !== 'mime') return { ok: false, offset: i, message: `Whitespace at position ${i} is not allowed in strict mode.` }; continue; }
      if (c === '=') { pad++; continue; }
      if (pad) return { ok: false, offset: i, message: `Data after padding at position ${i}.` };
      let v = (variant === 'url' ? URLSAFE : STD).indexOf(c);
      if (v < 0 && !strict) v = (variant === 'url' ? STD : URLSAFE).indexOf(c);
      if (v < 0) return { ok: false, offset: i, message: `"${c}" at position ${i} is not a Base64 character.` };
      values.push(v);
    }
    if (strict && pad && (values.length + pad) % 4) return { ok: false, offset: s.length, message: 'Padding does not complete the last group of four.' };
    if (values.length % 4 === 1) return { ok: false, offset: s.length, message: 'The input ends with an incomplete character group.' };
    const out = new Uint8Array(Math.floor(values.length * 3 / 4));
    let o = 0;
    for (let i = 0; i < values.length; i += 4) {
      const n = values[i] << 18 | values[i + 1] << 12 | (values[i + 2] ?? 0) << 6 | (values[i + 3] ?? 0);
      out[o++] = n >> 16 & 255; if (i + 2 < values.length) out[o++] = n >> 8 & 255; if (i + 3 < values.length) out[o++] = n & 255;
    }
    return { ok: true, bytes: out.slice(0, o) };
  }

  function dataUrl(bytes, mime = 'application/octet-stream') { return `data:${mime};base64,${encodeBytes(bytes)}`; }
  function parseDataUrl(text) {
    const m = /^data:([\w.+-]+\/[\w.+-]+)?((?:;[\w-]+=[^;,]*)*)(;base64)?,(.*)$/s.exec(String(text).trim());
    if (!m) return { ok: false, message: 'This is not a data: URL.' };
    const mime = m[1] || 'text/plain';
    if (m[3]) { const r = decodeToBytes(m[4], { strict: false }); return r.ok ? { ok: true, mime, bytes: r.bytes } : { ...r, ok: false }; }
    try { return { ok: true, mime, bytes: new TextEncoder().encode(decodeURIComponent(m[4])) }; } catch { return { ok: false, message: 'The data: URL text is not valid percent-encoding.' }; }
  }

  // ---------- tables ----------
  function parseDelimited(text, sep) {
    const rows = []; let row = [], cell = '', quoted = false;
    const s = String(text).replace(/\r\n/g, '\n');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; continue; }
      if (c === '"' && cell === '') quoted = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (quoted) throw new Error('A quoted value is not closed.');
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const [columns = [], ...body] = rows.filter(r => r.some(v => v !== ''));
    return { columns, rows: body.map(r => columns.map((_, i) => r[i] ?? '')) };
  }
  function parseTable(text, format) {
    if (format === 'json') {
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('JSON must be a list of objects.');
      const columns = [...new Set(data.flatMap(r => Object.keys(r)))];
      const lossy = data.some(r => Object.values(r).some(v => v !== null && typeof v === 'object'));
      return { columns, rows: data.map(r => columns.map(c => r[c] === undefined || r[c] === null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c]))), lossy, types: data };
    }
    return parseDelimited(text, format === 'tsv' ? '\t' : ',');
  }
  const csvCell = v => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  function formatTable(table, format) {
    const { columns, rows } = table;
    if (format === 'json') return JSON.stringify(rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]]))), null, 2);
    if (format === 'csv') return [columns, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    if (format === 'tsv') return [columns, ...rows].map(r => r.map(v => v.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    if (format === 'markdown') { const md = v => v.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' '); return [`| ${columns.map(md).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(md).join(' | ')} |`)].join('\n'); }
    throw new Error('Unknown output format.');
  }
  // What a conversion cannot carry, stated before it runs.
  function conversionLoss(from, to, table) {
    const notes = [];
    if (from === 'json' && to !== 'json') notes.push('Numbers, true/false and empty values become plain text.');
    if (table?.lossy && to !== 'json') notes.push('Nested objects and lists are written as JSON text in one cell.');
    if (to === 'tsv' && table?.rows.some(r => r.some(v => /[\t\r\n]/.test(v)))) notes.push('Tabs and line breaks inside values become spaces.');
    if (to === 'markdown' && table?.rows.some(r => r.some(v => /[\r\n]/.test(v)))) notes.push('Line breaks inside values become spaces.');
    if (from !== 'json' && to === 'json') notes.push('Every value is written as text.');
    return notes;
  }

  // ---------- personal vocabulary ----------
  const VOCAB_LIMIT = 256 * 1024;
  function validateVocabulary(text) {
    if (typeof text !== 'string') return { ok: false, message: 'The file could not be read as text.' };
    if (new TextEncoder().encode(text).length > VOCAB_LIMIT) return { ok: false, message: 'The file is larger than 256 KiB.' };
    let data; try { data = JSON.parse(text); } catch (e) { return { ok: false, message: `The file is not valid JSON: ${e.message}` }; }
    const depth = (v, d = 1) => v && typeof v === 'object' ? Math.max(d, ...Object.values(v).map(x => depth(x, d + 1))) : d;
    if (depth(data) > 8) return { ok: false, message: 'The file is nested deeper than 8 levels.' };
    if (!data || data.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) return { ok: false, message: 'Expected {"version": 1, "entries": {"word": "replacement"}}.' };
    const entries = {};
    for (const [k, v] of Object.entries(data.entries)) {
      if (!k.trim()) return { ok: false, message: 'An entry has an empty word.' };
      if ([...k].length > 160) return { ok: false, message: `The word "${[...k].slice(0, 20).join('')}…" is longer than 160 characters.` };
      if (typeof v !== 'string') return { ok: false, message: `The replacement for "${k}" is not text.` };
      if ([...v].length > 1000) return { ok: false, message: `The replacement for "${k}" is longer than 1,000 characters.` };
      entries[k] = v;
    }
    return { ok: true, entries, count: Object.keys(entries).length };
  }
  function vocabularyReplacer(entries) {
    const keys = Object.keys(entries || {}).sort((a, b) => b.length - a.length);
    if (!keys.length) return s => s;
    const esc = k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
    return s => String(s).replace(re, m => entries[m]);
  }

  async function sha256(bytes) {
    const subtle = (typeof crypto !== 'undefined' && crypto.subtle) || require('node:crypto').webcrypto.subtle;
    return [...new Uint8Array(await subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  }


  // ---------- one-time passwords (RFC 4226 HOTP, RFC 6238 TOTP) ----------
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function base32Decode(text) {
    const clean = String(text).toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
    if (!clean) throw new Error('The secret is empty.');
    let bits = 0, value = 0; const out = [];
    for (let i = 0; i < clean.length; i++) {
      const v = B32.indexOf(clean[i]);
      if (v < 0) throw new Error(`"${clean[i]}" at position ${i} is not a base32 character.`);
      value = value << 5 | v; bits += 5;
      if (bits >= 8) { out.push(value >>> (bits - 8) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  function base32Encode(bytes) { let bits = 0, value = 0, out = ''; for (const b of bytes) { value = value << 8 | b; bits += 8; while (bits >= 5) { out += B32[value >>> (bits - 5) & 31]; bits -= 5; } } if (bits) out += B32[value << (5 - bits) & 31]; return out; }
  const subtleApi = () => (typeof crypto !== 'undefined' && crypto.subtle) || require('node:crypto').webcrypto.subtle;
  async function hotp(secret, counter, { algorithm = 'SHA-1', digits = 6 } = {}) {
    if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) throw new Error('Unsupported algorithm.');
    if (!(digits >= 6 && digits <= 8)) throw new Error('Codes have 6 to 8 digits.');
    const key = await subtleApi().importKey('raw', secret, { name: 'HMAC', hash: algorithm }, false, ['sign']);
    const msg = new Uint8Array(8); let c = BigInt(counter);
    for (let i = 7; i >= 0; i--) { msg[i] = Number(c & 255n); c >>= 8n; }
    const mac = new Uint8Array(await subtleApi().sign('HMAC', key, msg));
    const off = mac[mac.length - 1] & 15;
    const bin = (mac[off] & 127) << 24 | mac[off + 1] << 16 | mac[off + 2] << 8 | mac[off + 3];
    return String(bin % 10 ** digits).padStart(digits, '0');
  }
  async function totp(secret, { time = Date.now() / 1000, period = 30, algorithm = 'SHA-1', digits = 6 } = {}) {
    if (!(period >= 1 && period <= 3600)) throw new Error('The period must be 1 to 3600 seconds.');
    return hotp(secret, Math.floor(time / period), { algorithm, digits });
  }
  function parseOtpauth(uri) {
    let url; try { url = new URL(String(uri).trim()); } catch { return { ok: false, message: 'This is not an otpauth link.' }; }
    if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') return { ok: false, message: 'Only otpauth://totp/ links are supported.' };
    const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const [issuerFromLabel, account] = label.includes(':') ? label.split(/:(.*)/s) : ['', label];
    const p = url.searchParams, algorithm = (p.get('algorithm') || 'SHA1').toUpperCase().replace(/^SHA(\d)/, 'SHA-$1');
    const entry = { name: (account || label).trim(), issuer: (p.get('issuer') || issuerFromLabel || '').trim(), secret: (p.get('secret') || '').replace(/\s/g, '').toUpperCase(), algorithm, digits: Number(p.get('digits') || 6), period: Number(p.get('period') || 30) };
    try { base32Decode(entry.secret); } catch (e) { return { ok: false, message: e.message }; }
    if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(entry.algorithm)) return { ok: false, message: 'Unsupported algorithm.' };
    if (!(entry.digits >= 6 && entry.digits <= 8)) return { ok: false, message: 'Codes have 6 to 8 digits.' };
    if (!(entry.period >= 1 && entry.period <= 3600)) return { ok: false, message: 'The period must be 1 to 3600 seconds.' };
    return { ok: true, entry };
  }
  function otpauthUri(e) { const label = encodeURIComponent(e.issuer ? `${e.issuer}:${e.name}` : e.name); return `otpauth://totp/${label}?secret=${e.secret}&issuer=${encodeURIComponent(e.issuer || '')}&algorithm=${e.algorithm.replace('-', '')}&digits=${e.digits}&period=${e.period}`; }

  const api = { base32Decode, base32Encode, hotp, totp, parseOtpauth, otpauthUri, textToBytes, bytesToText, encodeBytes, decodeToBytes, dataUrl, parseDataUrl, parseTable, formatTable, conversionLoss, validateVocabulary, vocabularyReplacer, sha256, VOCAB_LIMIT };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Tools = api;
})(typeof window === 'undefined' ? globalThis : window);
