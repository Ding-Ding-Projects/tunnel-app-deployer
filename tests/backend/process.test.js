'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { runner } = require('../../src/backend/process');
function child() { const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough(); return c; }
test('Docker stderr warnings do not corrupt JSON stdout or reveal diagnostics', async () => {
  const c = child();
  const pending = runner(() => c)('docker', ['inspect']);
  c.stderr.write('warning: SECRET=private\n'); c.stdout.write('{"ports":[]}'); c.emit('close', 0);
  assert.deepEqual(JSON.parse(await pending), { ports: [] });
});
test('cancellation awaits process closure and escalates TERM to KILL', async () => {
  const c = child(), controller = new AbortController(), kills = [];
  c.kill = signal => { kills.push(signal); if (signal === 'SIGKILL') setTimeout(() => c.emit('close', 137), 5); };
  let settled = false;
  const pending = runner(() => c, { killGraceMs: 10 })('docker', ['build'], { signal: controller.signal });
  pending.catch(() => { settled = true; });
  controller.abort();
  assert.equal(settled, false);
  await assert.rejects(pending, /cancelled/);
  assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
});
