'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isTunnelUrl, validateOptions, validSender } = require('../../src/main');

test('external navigation only accepts the exact HTTPS quick tunnel origin', () => {
  assert.equal(isTunnelUrl('https://blue-river-12.trycloudflare.com'), true);
  assert.equal(isTunnelUrl('https://blue-river-12.trycloudflare.com/'), true);
  for (const url of ['http://blue.trycloudflare.com', 'https://trycloudflare.com', 'https://blue.trycloudflare.com.evil.test', 'https://user:pass@blue.trycloudflare.com', 'https://blue.trycloudflare.com:8443', 'file:///tmp/a', 'javascript:alert(1)', 'https://blue.trycloudflare.com/path', 'https://blue.trycloudflare.com/?next=evil', 'https://blue.trycloudflare.com/#fragment', 'https://a.b.trycloudflare.com', 'not a url']) {
    assert.equal(isTunnelUrl(url), false, url);
  }
});
test('hosting options cannot carry paths, commands or invalid ports', () => {
  assert.deepEqual(validateOptions({ service: 'web-app', containerPort: '8080' }), { service: 'web-app', containerPort: 8080 });
  assert.deepEqual(validateOptions({ service: '', containerPort: '' }), {});
  for (const options of [null, [], { contextPath: '/tmp' }, { command: 'sh' }, { service: '--flag' }, { service: 'web;echo' }, { containerPort: 0 }, { containerPort: 65536 }, { containerPort: 2.5 }, { containerPort: 'abc' }, { containerPort: true }, { containerPort: [80] }]) {
    assert.throws(() => validateOptions(options));
  }
});
test('IPC requires the owning main frame and exact local document', () => {
  const page = 'file:///app/index.html';
  const frame = { url: page };
  const contents = { mainFrame: frame };
  const window = { isDestroyed: () => false, webContents: contents };
  assert.equal(validSender({ sender: contents, senderFrame: frame }, window, page), true);
  assert.equal(validSender({ sender: {}, senderFrame: frame }, window, page), false);
  assert.equal(validSender({ sender: contents, senderFrame: { url: page } }, window, page), false);
  frame.url = 'https://example.com';
  assert.equal(validSender({ sender: contents, senderFrame: frame }, window, page), false);
});
test('renderer has a restrictive policy and no Node integration', () => {
  const root = path.resolve(__dirname, '../../src');
  const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script[^>]*>[^<\s]/);
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  assert.doesNotMatch(preload, /exposeInMainWorld\(['"](?:require|ipcRenderer|process)/);
  assert.doesNotMatch(preload, /invoke:|send:/);
});

test('Electron browser entry starts even when its loader owns require.main', () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/main.js'), 'utf8');
  let electronLoads = 0, lockRequests = 0, quits = 0;
  const load = name => {
    if (name === 'electron') {
      electronLoads++;
      return { app: { requestSingleInstanceLock: () => { lockRequests++; return false; }, quit: () => { quits++; } } };
    }
    if (name === './backend') return {};
    return require(name);
  };
  load.main = { filename: 'electron' };
  const run = runtime => vm.runInNewContext(source, {
    require: load, module: { exports: {} }, process: runtime, console,
  });
  run({ versions: { node: process.versions.node } });
  assert.equal(electronLoads, 0, 'Node imports must remain side-effect-free');
  run({ versions: { electron: '45.2.3' }, type: 'renderer' });
  assert.equal(electronLoads, 0, 'Renderer imports must not launch the application');
  run({ versions: { electron: '45.2.3' }, type: 'browser' });
  assert.equal(electronLoads, 1);
  assert.equal(lockRequests, 1);
  assert.equal(quits, 1);
});
