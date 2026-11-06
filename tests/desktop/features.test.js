'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateSave, isAllowedLink, readBuildInfo } = require('../../src/main');
const Rx = require('../../src/renderer/regex');
const I18n = require('../../src/renderer/i18n');
const Markdown = require('../../src/renderer/markdown');
const root = path.resolve(__dirname, '../..');

test('exports only save plain files with safe names', () => {
  assert.deepEqual(validateSave('sessions-2026-11-06.csv', 'a,b'), { name: 'sessions-2026-11-06.csv', ext: 'csv', content: 'a,b' });
  for (const name of ['../x.json', 'a/b.json', 'x.exe', '.json', 'x', 'a..json', '', 'C:\\x.json']) assert.throws(() => validateSave(name, '{}'), name);
  assert.throws(() => validateSave('x.json', 42));
  assert.throws(() => validateSave('x.json', 'a'.repeat(5 * 1024 * 1024 + 1)));
});

test('external links are limited to the project and provider documentation', () => {
  assert.equal(isAllowedLink('https://github.com/Ding-Ding-Projects/tunnel-app-deployer/commit/0d71e2b'), true);
  assert.equal(isAllowedLink('https://ding-ding-projects.github.io/tunnel-app-deployer/'), true);
  assert.equal(isAllowedLink('https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/'), true);
  for (const url of ['https://github.com/Ding-Ding-Projects/tunnel-app-deployer-evil', 'http://github.com/Ding-Ding-Projects/tunnel-app-deployer', 'https://user@github.com/Ding-Ding-Projects/tunnel-app-deployer', 'https://evil.test/https://github.com/Ding-Ding-Projects/tunnel-app-deployer', 'javascript:alert(1)', 'file:///etc/passwd', 'nope']) assert.equal(isAllowedLink(url), false, url);
});

test('build provenance is read only from a well-formed record', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tad-'));
  const file = path.join(dir, 'build-info.json');
  fs.writeFileSync(file, JSON.stringify({ version: '0.2.5', buildTime: '2026-11-06T20:58:21Z', commit: 'a'.repeat(40) }));
  assert.deepEqual(readBuildInfo(file), { version: '0.2.5', buildTime: '2026-11-06T20:58:21Z', commit: 'a'.repeat(40) });
  fs.writeFileSync(file, JSON.stringify({ version: 5, buildTime: 'yesterday', commit: 'abc' }));
  assert.deepEqual(readBuildInfo(file), { version: null, buildTime: null, commit: null });
  assert.equal(readBuildInfo(path.join(dir, 'missing.json')), null);
});

test('regex builder explains, validates and blocks catastrophic patterns', () => {
  const parts = Rx.explain('^(motion|theme)\\d+$').map(p => p.kind);
  assert.deepEqual(parts, ['anchor', 'group', 'literal', 'alt', 'literal', 'group', 'class', 'quant', 'anchor']);
  assert.equal(Rx.compile('(a+)+').reason, 'unsafe');
  assert.equal(Rx.compile('(').reason, 'invalid');
  assert.equal(Rx.compile('a'.repeat(301)).reason, 'tooLong');
  assert.equal(Rx.compile('abc', 'gix').flags, 'i');
  assert.equal(Rx.matcher('TUNNEL', { regex: false }).test('quick tunnel'), true);
  assert.equal(Rx.matcher('^qu.*l$', { regex: true, flags: 'i' }).test('Quick tunnel'), true);
  assert.equal(Rx.matcher('(', { regex: true }).ok, false);
  assert.equal(Rx.count(Rx.compile('a'), 'banana'), 3);
});

test('every English string has a Cantonese string and voice tiers keep both languages', () => {
  const missing = Object.keys(I18n.en).filter(k => !(k in I18n.yue));
  assert.deepEqual(missing, []);
  for (const [k, v] of Object.entries(I18n.en)) if (typeof v === 'object') assert.equal(typeof I18n.yue[k], 'object', `${k} needs Cantonese voice tiers`);
  const settings = { language: 'both', funnyEn: 1, funnyYue: 5 };
  const i = I18n.create(() => settings);
  const [en, yue] = i.both('host.live');
  assert.equal(en, 'Your app is live');
  assert.match(yue, /上咗線/);
  settings.language = 'yue';
  assert.deepEqual(i.both('nav.host'), ['分享', null]);
});

test('markdown never passes raw HTML through', () => {
  const html = Markdown.render('# T\n\n<script>alert(1)</script> **b** `c` https://example.com/x');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>b<\/strong>/);
  assert.match(html, /data-external="true"/);
});

test('renderer keeps a strict content policy and no inline styles or scripts', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /https?:\/\/fonts\./);
  const app = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
  assert.doesNotMatch(app, /style="/);
  assert.doesNotMatch(app, /\beval\(|new Function/);
  for (const font of ['roboto-flex.woff2', 'roboto-mono-400.woff2', 'material-symbols-rounded.woff2']) assert.ok(fs.existsSync(path.join(root, 'src/renderer/fonts', font)), font);
});

test('generated content is current and every linked article exists', async () => {
  const { build } = await import(path.join(root, 'scripts/build-content.mjs'));
  const outputs = build();
  for (const [file, content] of Object.entries(outputs)) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), content, `${file} is stale; run npm run content`);
  const content = require('../../src/renderer/content');
  assert.equal(content.features.items.length, new Set(content.features.items.map(i => i.id)).size);
  for (const item of content.features.items) assert.ok(['built', 'partial', 'planned', 'na'].includes(item.status), item.id);
});

test('base64 tools match reference encodings and report exact decode errors', () => {
  const T = require('../../src/renderer/tools');
  for (const s of ['', 'a', 'ab', 'abc', 'Docker compose up --build', 'é€😀']) {
    assert.equal(T.encodeBytes(T.textToBytes(s)), Buffer.from(s).toString('base64'), s);
    assert.equal(T.encodeBytes(T.textToBytes(s), { variant: 'url', padding: false }), Buffer.from(s).toString('base64url'), s);
    assert.equal(T.bytesToText(T.decodeToBytes(Buffer.from(s).toString('base64')).bytes), s);
  }
  assert.deepEqual(T.encodeBytes(T.textToBytes('x'.repeat(100)), { variant: 'mime' }).split('\r\n').map(l => l.length), [76, 60]);
  assert.equal(T.decodeToBytes('RG9j!2Vy').offset, 4);
  assert.equal(T.decodeToBytes('aG k=').ok, false);
  assert.equal(T.decodeToBytes('aG k', { strict: false }).ok, true);
  assert.equal(T.bytesToText(T.textToBytes('hi', 'utf-16le'), 'utf-16le'), 'hi');
  assert.throws(() => T.textToBytes('€', 'latin1'));
  const parsed = T.parseDataUrl(T.dataUrl(T.textToBytes('hi'), 'text/plain'));
  assert.equal(parsed.mime, 'text/plain'); assert.equal(T.bytesToText(parsed.bytes), 'hi');
});

test('table conversion round-trips quoted CSV and states losses', () => {
  const T = require('../../src/renderer/tools');
  const table = T.parseTable('a,b\r\n"x,1","q""z"\n', 'csv');
  assert.deepEqual(table, { columns: ['a', 'b'], rows: [['x,1', 'q"z']] });
  assert.equal(T.formatTable(table, 'csv'), 'a,b\r\n"x,1","q""z"');
  const j = T.parseTable('[{"s":"web","p":3000,"n":{"a":1}}]', 'json');
  assert.match(T.formatTable(j, 'markdown'), /\| web \| 3000 \|/);
  assert.equal(T.conversionLoss('json', 'csv', j).length, 2);
  assert.throws(() => T.parseTable('{"a":1}', 'json'));
  assert.throws(() => T.parseTable('a\n"open', 'csv'));
});

test('personal vocabulary is validated in full before use', () => {
  const T = require('../../src/renderer/tools');
  assert.equal(T.validateVocabulary('{"version":1,"entries":{"Host":"Share"}}').count, 1);
  for (const bad of ['nope', '{"Host":"Share"}', '{"version":2,"entries":{}}', '{"version":1,"entries":{"Host":1}}', `{"version":1,"entries":{"${'w'.repeat(161)}":"x"}}`, `{"version":1,"entries":{"a":"${'x'.repeat(1001)}"}}`, '{"version":1,"entries":{"a":"b"},"x":[[[[[[[[[1]]]]]]]]]}', 'x'.repeat(256 * 1024 + 1)]) assert.equal(T.validateVocabulary(bad).ok, false, bad.slice(0, 40));
  const apply = T.vocabularyReplacer({ Host: 'Share', 'Host app': 'Share it' });
  assert.equal(apply('Host app · Hosting · Host'), 'Share it · Hosting · Share');
});

test('editor detection finds real installs without running anything', () => {
  const { detectEditors } = require('../../src/main');
  const env = { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local', ProgramFiles: 'C:\\Program Files', PATH: 'C:\\Users\\a\\AppData\\Local\\Programs\\Microsoft VS Code\\bin' };
  const found = detectEditors({ platform: 'win32', env, exists: p => /Local\\Programs\\Microsoft VS Code\\(Code\.exe|bin\\code\.cmd)$/.test(p) });
  assert.deepEqual(found.map(e => e.path), ['C:\\Users\\a\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe']);
  assert.deepEqual(detectEditors({ platform: 'linux', env: { PATH: '/usr/bin' }, exists: () => false }), []);
});

test('markdown code fences are escaped', () => {
  assert.match(Markdown.render('```\n<b>{"a":1}</b>\n```'), /<pre><code>&lt;b&gt;\{&quot;a&quot;:1\}&lt;\/b&gt;<\/code><\/pre>/);
});
