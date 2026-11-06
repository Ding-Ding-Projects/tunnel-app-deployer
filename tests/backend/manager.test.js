'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createHostManager } = require('../../src/backend');
async function fixture(t, extra = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tunnel-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'Dockerfile'), 'FROM scratch\nEXPOSE 8080\n');
  const calls = [], children = [];
  const run = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === 'inspect') return JSON.stringify({ '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '32900' }] });
    return '';
  };
  const spawn = () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null;
    child.kill = () => { child.exitCode = 0; queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); }); };
    children.push(child);
    if (!extra.noURL) queueMicrotask(() => { child.stderr.write('https://valid-'); child.stderr.write('example.trycloudflare.com |\nsecret-token-should-never-escape'); });
    return child;
  };
  const manager = createHostManager({ stateDir: path.join(directory, 'state'), run, spawn, cloudflaredCommand: 'cloudflared', fetch: async () => ({ status: 200 }), startupTimeoutMs: 40, pollIntervalMs: 1, ...extra });
  return { manager, calls, children, source: { kind: 'dockerfile', contextPath: directory } };
}
test('only reports a verified URL and removes owned resources without volumes', async t => {
  const { manager, calls, source } = await fixture(t);
  const events = [];
  const result = await manager.host(source, { onProgress: e => events.push(e) });
  assert.equal(result.phase, 'ready'); assert.equal(result.publicUrl, 'https://valid-example.trycloudflare.com');
  assert.ok(calls.some(([, a]) => a.includes('127.0.0.1::8080')));
  assert.ok(!JSON.stringify(events).includes('secret-token'));
  await manager.stop(); assert.equal(manager.status().phase, 'idle');
  assert.ok(!calls.flatMap(([, a]) => a).includes('-v'));
});
test('tunnel startup timeout clears URL and cleans application', async t => {
  const { manager, source, calls } = await fixture(t, { noURL: true });
  await assert.rejects(manager.host(source), /timed out/);
  assert.equal(manager.status().publicUrl, null);
  assert.ok(calls.some(([, a]) => a[0] === 'rm'));
});
test('cancelled host does not publish a URL', async t => {
  const { manager, source } = await fixture(t, { noURL: true });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(manager.host(source, { signal: controller.signal }), /cancelled/);
  assert.equal(manager.status().publicUrl, null);
});
test('ambiguous exposed ports require an explicit choice', async t => {
  const { manager, source } = await fixture(t);
  await fs.writeFile(path.join(source.contextPath, 'Dockerfile'), 'FROM scratch\nEXPOSE 8080 9090\n');
  assert.equal((await manager.inspectSource(source)).needsPort, true);
  await assert.rejects(manager.host(source), /Choose a service and container port/);
});
test('compose validation rejects unsafe services with service-specific explanation', async t => {
  const { source } = await fixture(t);
  const file = path.join(source.contextPath, 'compose.yaml'); await fs.writeFile(file, 'services: {}');
  const manager = createHostManager({ stateDir: source.contextPath, run: async () => JSON.stringify({ services: { database: { privileged: true } } }) });
  await assert.rejects(manager.inspectSource({ kind: 'compose', composePath: file }), /database: privileged/);
});
test('public health failure never becomes ready', async t => {
  const { manager, source } = await fixture(t, { fetch: async url => ({ status: url.includes('trycloudflare') ? 503 : 200 }) });
  await assert.rejects(manager.host(source), /readiness timed out/);
  assert.equal(manager.status().publicUrl, null);
});
test('tunnel process exit immediately invalidates the public URL', async t => {
  const { manager, source, children } = await fixture(t);
  await manager.host(source);
  children[0].emit('exit', 1);
  assert.equal(manager.status().publicUrl, null);
  assert.equal(manager.status().verified, false);
  await manager.stop();
});
test('compose preserves service data and removes original host publications', async t => {
  const { source } = await fixture(t);
  const file = path.join(source.contextPath, 'compose.yaml'); await fs.writeFile(file, 'services: {}');
  const calls = [];
  const config = { name: 'original', services: { web: { image: 'web', ports: [{ target: 8080, published: '80' }], environment: { SECRET: '$literal' }, volumes: [{ type: 'volume', source: 'data', target: '/data' }] }, database: { image: 'db', ports: [{ target: 5432, published: '5432' }] } }, volumes: { data: { name: 'original_data' } } };
  let generated;
  const manager = createHostManager({ stateDir: source.contextPath, cloudflaredCommand: 'cloudflared', run: async (_command, args) => {
    calls.push(args);
    if (args.includes('config')) return JSON.stringify(config);
    if (args.includes('up')) { generated = JSON.parse(await fs.readFile(args[args.indexOf('-f') + 1])); throw new Error('stop after configuration'); }
    return '';
  } });
  await assert.rejects(manager.host({ kind: 'compose', composePath: file, service: 'web' }), /stop after configuration/);
  assert.equal(generated.services.database.ports, undefined);
  assert.equal(generated.services.web.ports[0].host_ip, '127.0.0.1');
  assert.equal(generated.services.web.environment.SECRET, '$$literal');
  assert.equal(generated.services.web.volumes[0].source, 'data');
  assert.equal(generated.volumes.data.name, undefined);
  assert.ok(calls.some(args => args.includes('down') && !args.includes('-v')));
});
