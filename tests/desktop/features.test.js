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
  assert.deepEqual(readBuildInfo(file), { version: '0.2.5', buildTime: '2026-11-06T20:58:21Z', commit: 'a'.repeat(40), codeName: null });
  fs.writeFileSync(file, JSON.stringify({ version: 5, buildTime: 'yesterday', commit: 'abc' }));
  assert.deepEqual(readBuildInfo(file), { version: null, buildTime: null, commit: null, codeName: null });
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

test('Squirrel install events create and remove shortcuts, then quit', () => {
  const { squirrelCommand } = require('../../src/main');
  const exe = 'C:\\Users\\a\\AppData\\Local\\TunnelAppDeployer\\app-0.2.9\\Tunnel App Deployer.exe';
  assert.deepEqual(squirrelCommand(['x', '--squirrel-install'], exe), { update: 'C:\\Users\\a\\AppData\\Local\\TunnelAppDeployer\\Update.exe', args: ['--createShortcut', 'Tunnel App Deployer.exe'], quit: true });
  assert.deepEqual(squirrelCommand(['x', '--squirrel-uninstall'], exe).args, ['--removeShortcut', 'Tunnel App Deployer.exe']);
  assert.deepEqual(squirrelCommand(['x', '--squirrel-obsolete'], exe), { quit: true });
  assert.deepEqual(squirrelCommand(['x', '--squirrel-firstrun'], exe), { quit: false });
  assert.equal(squirrelCommand(['x'], exe), null);
  assert.equal(squirrelCommand(['x', 'C:\\project'], exe), null);
});

test('release code names are read only from the public catalogue record', () => {
  const { readBuildInfo } = require('../../src/main');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tad-'));
  const file = path.join(dir, 'build-info.json');
  const good = { id: 'hk-dish-0001', en: 'Classic Har Gow', zhHant: '蝦餃', photo: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png' };
  fs.writeFileSync(file, JSON.stringify({ version: '0.2.9', buildTime: '2026-11-06T22:00:00Z', commit: 'b'.repeat(40), codeName: good }));
  assert.deepEqual(readBuildInfo(file).codeName, good);
  fs.writeFileSync(file, JSON.stringify({ version: '0.2.9', codeName: { ...good, photo: 'https://evil.test/x.png' } }));
  assert.equal(readBuildInfo(file).codeName, null);
});

test('the dish picker skips used dishes and dishes without a published photo', async () => {
  const { pickDish } = await import(path.join(root, 'scripts/dim-sum-code-name.mjs'));
  const dish = (n, file) => ({ id: `hk-dish-000${n}`, name: { en: `Dish ${n}`, zhHant: '點心' }, image: { path: `images/${file}` } });
  const dishes = [dish(1, 'a.png'), dish(2, 'b.png'), dish(3, 'c.png')];
  assert.equal(pickDish(dishes, new Set(['a.png', 'c.png']), new Set(['hk-dish-0001'])).id, 'hk-dish-0003');
  assert.equal(pickDish(dishes, new Set(['b.png']), new Set(['hk-dish-0002'])), null);
});

test('TOTP matches the RFC 6238 published vectors for every algorithm', async () => {
  const Tools = require('../../src/renderer/tools');
  const keys = { 'SHA-1': '12345678901234567890', 'SHA-256': '12345678901234567890123456789012', 'SHA-512': '1234567890123456789012345678901234567890123456789012345678901234' };
  const vectors = [[59, '94287082', '46119246', '90693936'], [1111111109, '07081804', '68084774', '25091201'], [1234567890, '89005924', '91819424', '93441116'], [20000000000, '65353130', '77737706', '47863826']];
  for (const [time, s1, s256, s512] of vectors) {
    for (const [algorithm, want] of [['SHA-1', s1], ['SHA-256', s256], ['SHA-512', s512]]) {
      assert.equal(await Tools.totp(new TextEncoder().encode(keys[algorithm]), { time, algorithm, digits: 8, period: 30 }), want, `${algorithm} at ${time}`);
    }
  }
});

test('base32 round-trips and otpauth links are validated', () => {
  const Tools = require('../../src/renderer/tools');
  const bytes = new TextEncoder().encode('12345678901234567890');
  assert.equal(Tools.base32Encode(bytes), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(Array.from(Tools.base32Decode('gezd gnbv-gy3tqojqgezdgnbvgy3tqojq')), Array.from(bytes));
  assert.throws(() => Tools.base32Decode('NOT*BASE32'));
  const ok = Tools.parseOtpauth('otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=6&period=30');
  assert.equal(ok.ok, true);
  assert.equal(ok.entry.issuer, 'Example');
  assert.equal(ok.entry.name, 'alice@example.com');
  assert.equal(Tools.parseOtpauth('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP').ok, false);
  assert.equal(Tools.parseOtpauth('https://example.com').ok, false);
  const back = Tools.parseOtpauth(Tools.otpauthUri(ok.entry));
  assert.equal(back.entry.secret, ok.entry.secret);
});

test('Windows draws its caption buttons over the app title bar; other systems keep their frame', () => {
  const { windowChromeOptions, validateTitlebarColors } = require('../../src/main');
  const win = windowChromeOptions('win32');
  assert.equal(win.titleBarStyle, 'hidden');
  assert.equal(win.titleBarOverlay.height, 40);
  assert.deepEqual(windowChromeOptions('linux'), {});
  assert.deepEqual(windowChromeOptions('darwin'), {});
  assert.deepEqual(validateTitlebarColors({ color: '#0E1513', symbolColor: '#dde4e1' }), { color: '#0e1513', symbolColor: '#dde4e1', height: 40 });
  for (const bad of [null, {}, { color: 'oklch(.2 .01 175)', symbolColor: '#ffffff' }, { color: '#fff', symbolColor: '#ffffff' }, { color: '#000000' }]) assert.throws(() => validateTitlebarColors(bad));
});

test('icon glyph names are hidden from assistive technology on the app and the website', () => {
  for (const file of ['src/renderer/index.html', 'src/renderer/app.js', 'docs/index.html', 'docs/app.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const exposed = text.match(/<span class="ms\b[^"]*"(?! aria-hidden="true")/g) || [];
    assert.deepEqual(exposed, [], `${file} has icons without aria-hidden`);
  }
});

test('app landmarks and navigation semantics', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.match(html, /<main class="main" id="main"/);
  assert.doesNotMatch(html, /class="dest" role="tab"/);
  assert.doesNotMatch(html, /<aside[^>]*role="dialog"/);
  assert.match(html, /<div class="tabbar"[^>]*>\s*<div class="tabstrip"[^>]*role="tablist"[^>]*><\/div>\s*<button class="newtab"/);
  assert.match(html, /<input id="palette-input" aria-labelledby="palette-label"/);
});

test('article headings start at level 2 under the page title', () => {
  const html = Markdown.render('Intro\n\n## Section\n\n### Detail');
  assert.match(html, /<h2 id="h-section">Section<\/h2>/);
  assert.match(html, /<h3 id="h-detail">Detail<\/h3>/);
});

test('the navigation rail can expand with names beside its icons', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.match(html, /<button class="rail-toggle" id="rail-toggle" data-tip="nav.collapse"[^>]*aria-expanded="true"/);
  assert.match(html, /<button class="fab" id="fab"><span class="ms f" aria-hidden="true">add_link<\/span><span class="fab-lbl" data-i18n="nav.newHost">/);
  const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
  assert.match(css, /@media \(min-width:1100px\)\{\s*html\[data-rail=expanded\] \.rail\{width:240px/);
  for (const lang of ['en', 'yue']) for (const k of ['nav.collapse', 'nav.expand', 'set.rail', 'set.rail.d', 'set.rail.expanded', 'set.rail.compact']) assert.ok(I18n[lang][k], `${lang} ${k}`);
});
