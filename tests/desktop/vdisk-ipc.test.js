'use strict';
// The bridge between the Virtual disks screen and the engine: tokens instead of paths, new files
// named beside their source without replacing anything, and requests shaped for the engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { register } = require('../../src/vdisk/ipc');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tad-vdipc-'));
const fixtures = path.join(__dirname, '../fixtures/vdisk');
function fixture(dir, name, as = name) {
  const file = path.join(dir, as);
  fs.writeFileSync(file, zlib.gunzipSync(fs.readFileSync(path.join(fixtures, `${name}.gz`))));
  return file;
}
// A bridge wired to fake Electron parts and a fake engine that records what it was asked to do.
function bridge({ available = true, save = null, open = [] } = {}) {
  const handlers = new Map(), calls = [], sent = [];
  const engine = {
    available,
    run: async (op, request, opts) => {
      calls.push({ op, request });
      opts?.onProgress?.({ id: 'j1', op, step: 'start', done: 0, total: 0 });
      if (op === 'list') return { ok: true, disks: [], isos: [] };
      if (op === 'state') return { ok: true, attached: false, signIn: false };
      return { ok: true, path: request.target || request.path };
    },
    cancel: () => true, pause: () => true
  };
  const userData = temp();
  register({
    handle: (channel, fn) => handlers.set(channel, fn),
    dialog: { showSaveDialog: async () => (save ? { canceled: false, filePath: save } : { canceled: true }), showOpenDialog: async () => ({ canceled: !open.length, filePaths: open }) },
    shell: { showItemInFolder: () => {}, openPath: async () => '' },
    app: { getPath: () => userData },
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (channel, value) => sent.push({ channel, value }) } }),
    engine
  });
  const call = (channel, ...args) => handlers.get(channel)(...args);
  return { call, calls, sent, handlers, userData };
}

test('every screen channel is registered', () => {
  const { handlers } = bridge();
  for (const c of ['vd:library', 'vd:inspect', 'vd:details', 'vd:scripts', 'vd:open', 'vd:add', 'vd:forget', 'vd:choose-save', 'vd:pick-parent', 'vd:pick-items', 'vd:plan', 'vd:run', 'vd:cancel', 'vd:pause', 'vd:reveal', 'vd:open-volume']) assert.ok(handlers.has(c), c);
});

test('dropped files join the library only when they are disk files, and come back as tokens', async () => {
  const dir = temp(), disk = fixture(dir, 'dynamic.vhdx', 'Photos.vhdx'), note = path.join(dir, 'note.txt');
  fs.writeFileSync(note, 'hi');
  const b = bridge();
  const added = await b.call('vd:add', [disk, note, 'relative.vhdx', path.join(dir, 'missing.vhdx')]);
  assert.equal(added.length, 1);
  assert.equal(added[0].name, 'Photos.vhdx'); assert.equal(added[0].format, 'vhdx'); assert.equal(added[0].type, 'dynamic');
  assert.match(added[0].token, /^[0-9a-f-]{36}$/);
  const lib = await b.call('vd:library');
  assert.equal(lib.available, true);
  assert.deepEqual(lib.items.map(i => i.name), ['Photos.vhdx']);
  assert.equal(lib.items[0].attached, false);
  // The list survives a restart of the bridge.
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(b.userData, 'virtual-disks.json'), 'utf8')), [disk]);
});

test('an unknown token is refused instead of reaching the engine', async () => {
  const b = bridge();
  const r = await b.call('vd:run', 'grow', { token: 'not-a-token', size: 1 });
  assert.equal(r.ok, false); assert.equal(r.code, 'token');
  assert.equal(b.calls.length, 0);
});

test('Save as never names an existing file and reports the free space', async () => {
  const dir = temp(), taken = path.join(dir, 'Disk.vhdx');
  fs.writeFileSync(taken, 'x');
  const r = await bridge({ save: taken }).call('vd:choose-save', { format: 'vhdx', name: 'Disk' });
  assert.equal(r.name, 'Disk (1).vhdx'); assert.equal(r.renamed, true); assert.equal(r.folder, dir);
  assert.ok(Number.isFinite(r.free) && r.free > 0, 'free space measured');
  const plain = await bridge({ save: path.join(dir, 'Other') }).call('vd:choose-save', { format: 'vhd', name: 'x' });
  assert.equal(plain.name, 'Other.vhd'); assert.equal(plain.renamed, false);
});

test('convert and child write beside the source under a free name', async () => {
  const dir = temp(), disk = fixture(dir, 'dynamic.vhdx', 'Photos.vhdx');
  fs.writeFileSync(path.join(dir, 'Photos fixed.vhdx'), 'taken');
  const b = bridge();
  const [entry] = await b.call('vd:add', [disk]);
  const conv = await b.call('vd:run', 'convert', { token: entry.token, format: 'vhdx', type: 'fixed', virtualSize: 1 });
  assert.equal(conv.ok, true);
  assert.equal(b.calls.at(-1).request.target, path.join(dir, 'Photos fixed (1).vhdx'));
  await b.call('vd:run', 'convert', { token: entry.token, format: 'vhd', type: 'dynamic' });
  assert.equal(b.calls.at(-1).request.target, path.join(dir, 'Photos.vhd'));
  await b.call('vd:run', 'child', { token: entry.token });
  assert.equal(b.calls.at(-1).request.target, path.join(dir, 'Photos child.avhdx'));
  // Progress reaches the window, and the request never carries the token itself.
  assert.ok(b.sent.some(s => s.channel === 'vd:progress' && s.value.op === 'child'));
  assert.equal('token' in b.calls.at(-1).request, false);
});

test('the equivalent script names the same target the change would write', async () => {
  const dir = temp(), disk = fixture(dir, 'dynamic.vhdx', 'Photos.vhdx');
  const b = bridge();
  const [entry] = await b.call('vd:add', [disk]);
  const s = await b.call('vd:scripts', 'convert', entry.token, { format: 'vhdx', type: 'fixed' });
  assert.match(s.powershell, /Convert-VHD -Path '.*Photos\.vhdx' -DestinationPath '.*Photos fixed\.vhdx' -VHDType Fixed/);
  assert.match(s.diskpart, /create vdisk file=".*Photos fixed\.vhdx" source=".*Photos\.vhdx"/);
  const c = await b.call('vd:scripts', 'create', null, { format: 'vhdx', type: 'dynamic', size: 64 * 2 ** 30, volume: { style: 'GPT', fileSystem: 'NTFS', label: 'Photos' } });
  assert.match(c.powershell, /New-VHD .* -SizeBytes 68719476736 -Dynamic/);
});

test('Quick pack plans beside the dropped items and keeps the wanted name for the report', async () => {
  const root = temp(), trip = path.join(root, 'Trips');
  fs.mkdirSync(path.join(trip, 'day 1'), { recursive: true });
  fs.writeFileSync(path.join(trip, 'day 1', 'a.jpg'), Buffer.alloc(4096));
  fs.writeFileSync(path.join(root, 'Trips.vhdx'), 'taken');
  const b = bridge();
  const plan = await b.call('vd:plan', [trip], { fileSystem: 'NTFS' });
  assert.equal(plan.ok, true); assert.equal(plan.folder, root);
  assert.equal(plan.wanted, 'Trips.vhdx'); assert.equal(plan.name, 'Trips (1).vhdx');
  assert.equal(plan.files, 1); assert.ok(plan.size >= 512 * 2 ** 20);
  const r = await b.call('vd:run', 'pack', { plan: plan.token, fileSystem: 'exFAT', fixed: false });
  assert.equal(r.ok, true);
  const req = b.calls.at(-1).request;
  assert.equal(req.path, path.join(root, 'Trips (1).vhdx')); assert.deepEqual(req.items, [trip]); assert.equal(req.fileSystem, 'exFAT');
  assert.equal(r.entry.name, 'Trips (1).vhdx');
  assert.equal((await b.call('vd:run', 'pack', { plan: 'nope' })).code, 'plan');
  assert.equal((await b.call('vd:plan', ['relative/path'], {})).ok, false);
});

test('off Windows the library still lists known files and says why changes are unavailable', async () => {
  const dir = temp(), disk = fixture(dir, 'fixed.vhd', 'old.vhd');
  const b = bridge({ available: false });
  await b.call('vd:add', [disk]);
  const lib = await b.call('vd:library');
  assert.equal(lib.available, false);
  assert.equal(lib.items[0].format, 'vhd'); assert.equal(lib.items[0].type, 'fixed');
  assert.equal(b.calls.length, 0, 'nothing ran');
});
