'use strict';
(() => {
const q = new URLSearchParams(location.search), state = q.get('state') || 'ready', view = q.get('view');
const long = q.get('long') ? '-with-a-deliberately-long-name-to-test-wrapping' : '';
try {
  localStorage.clear();
  localStorage.setItem('tad.onboarded', JSON.stringify(state !== 'onboarding'));
  if (q.get('onb')) localStorage.setItem('tad.onboardingStep', q.get('onb'));
  const s = JSON.parse(q.get('settings') || '{}'); localStorage.setItem('tad.settings', JSON.stringify(s));
  const now = Date.now(), iso = d => new Date(now - d).toISOString();
  localStorage.setItem('tad.sessions', JSON.stringify([
    { id: 'a', name: 'notes-app' + long, file: `C:\\Projects\\notes-app${long}\\Dockerfile`, kind: 'dockerfile', port: '3000', outcome: 'shared', publicUrl: 'https://quiet-river-maple.trycloudflare.com', startedAt: iso(9e5), liveAt: iso(8.4e5), endedAt: iso(1e5), steps: [], messages: {}, reachedLive: true },
    { id: 'b', name: 'shop-stack', file: 'C:\\Projects\\shop-stack\\compose.yaml', kind: 'compose', service: 'web', port: '8080', outcome: 'shared', publicUrl: 'https://dawn-cedar-loop.trycloudflare.com', startedAt: iso(9e7), liveAt: iso(8.9e7), endedAt: iso(8.5e7), steps: [], messages: {}, reachedLive: true },
    { id: 'c', name: 'notes-app', file: 'C:\\Projects\\notes-app\\Dockerfile', kind: 'dockerfile', port: '3000', outcome: 'failed', error: 'HTTP readiness timed out', startedAt: iso(2e6), endedAt: iso(1.9e6), steps: [], messages: {} },
    { id: 'd', name: 'blog', file: 'C:\\Projects\\blog\\docker-compose.yml', kind: 'compose', service: 'app', outcome: 'cancelled', startedAt: iso(3e8), endedAt: iso(3e8), steps: [], messages: {} }]));
  if (q.get('notifs')) localStorage.setItem('tad.notifications', JSON.stringify([
    { id: '1', at: iso(2e4), kind: 'ok', text: 'Your app is live and reachable over HTTPS.', read: false },
    { id: '2', at: iso(1e4), kind: 'ok', text: 'Link copied. Paste it anywhere.', read: false },
    { id: '3', at: iso(9e5), kind: 'error', text: 'Hosting failed. The message on Host says why.', read: true }]));
  const seal = t => btoa(t);
  if (q.get('act') === 'auth') localStorage.setItem('tad.auth', JSON.stringify([
    { id: 'x1', name: 'alex@example.com', issuer: 'Example Cloud', algorithm: 'SHA-1', digits: 6, period: 30, sealed: seal('JBSWY3DPEHPK3PXP') },
    { id: 'x2', name: 'ops@example.com', issuer: 'Status Hub', algorithm: 'SHA-256', digits: 8, period: 30, sealed: seal('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ') },
    { id: 'x3', name: 'build-bot', issuer: 'Example Mail', algorithm: 'SHA-1', digits: 6, period: 60, sealed: seal('KRSXG5CTMVRXEZLUKN2XAZLSKNSWG4TFOQ') }]));
  if (q.get('act') === 'tabs') localStorage.setItem('tad.tabs', JSON.stringify([
    { id: 't1', type: 'tool', ref: 'auth', icon: 'password', title: 'Authenticator' },
    { id: 't2', type: 'settings', ref: 'appearance', icon: 'palette', title: 'Appearance' },
    { id: 't3', type: 'article', ref: 'safety', icon: 'article', title: 'Safety' }]));
} catch {}
const statuses = {
  ready: { phase: 'idle' }, onboarding: { phase: 'idle' },
  building: { phase: 'building', message: 'Step 4/7 : RUN npm ci' },
  live: { phase: 'ready', verified: true, publicUrl: 'https://quiet-river-maple.trycloudflare.com', localUrl: 'http://127.0.0.1:49213' },
  failed: { phase: 'error', error: 'HTTP readiness timed out' }
};
let listener, b64Listener;
// Staged results for the same-folder Base64 card, keyed by the dropped file's name.
const b64Staged = {
  'report.pdf': { ok: true, mode: 'encode', sourceName: 'report.pdf', folder: 'Downloads', outputName: 'report.pdf.base64.txt', renamed: false, bytes: 66080512, outputBytes: 88107352, verified: true, token: 's1' },
  'photo.txt': { ok: true, mode: 'decode', sourceName: 'photo.txt', folder: 'Downloads', outputName: 'photo (1).png', renamed: true, restoredFrom: 'contents', bytes: 2411520, outputBytes: 2411520, verified: true, token: 's2' },
  'notes.txt': { ok: false, sourceName: 'notes.txt', code: 'invalid', reason: 'char', offset: 1204, char: '#' }
};
window.tunnel = {
  prerequisites: async () => q.get('prereq') === 'missing'
    ? { docker: false, compose: false, cloudflared: false, cloudflaredDownloadAvailable: false, missing: ['Docker Desktop is not running.', 'Docker Compose was not found.'] }
    : { docker: true, compose: true, cloudflared: false, cloudflaredDownloadAvailable: true, missing: [] },
  status: async () => state === 'live' && !window.__screens?.picked ? statuses.ready : statuses[state] || statuses.ready,
  select: async kind => (window.__screens.picked = true, { source: kind === 'compose' ? { kind, composePath: 'C:\\Projects\\shop-stack\\compose.yaml' } : { kind, dockerfilePath: `C:\\Projects\\notes-app${long}\\Dockerfile`, contextPath: `C:\\Projects\\notes-app${long}` }, inspection: kind === 'compose' ? { services: ['web', 'db'], service: 'web', containerPort: 8080 } : { containerPort: 3000 } }),
  host: () => new Promise((_res, rej) => { window.__screens.fail = rej; }), stop: async () => ({ phase: 'idle' }), copy: async () => true, open: async () => true,
  windowChrome: q.get('chrome') === 'overlay' ? 'overlay' : 'native', setTitlebar: async () => true,
  info: async () => ({ version: '0.2.0', buildTime: '2026-11-06T20:58:21Z', commit: '205a6caafcebb3763ebc39a7faa2248314b828a4' }),
  copyText: async () => true, editors: async () => [{ name: 'Visual Studio Code' }], openProject: async () => true, setTitle: async () => true, openLink: async () => true, save: async () => true,
  vaultAvailable: async () => q.get('vault') !== 'off', vaultSeal: async t => btoa(t), vaultOpen: async s => atob(s),
  updateState: async () => q.get('upd') ? { state: q.get('upd'), installed: true, version: '0.2.10', notesUrl: 'https://github.com/Ding-Ding-Projects/tunnel-app-deployer/releases/latest', error: q.get('upd') === 'failed' ? 'The update feed could not be reached.' : undefined, checkedAt: new Date().toISOString() } : { state: 'idle', installed: true }, checkUpdates: async () => ({ state: 'current' }), installUpdate: async () => true, onUpdate: () => () => {},
  onProgress: cb => { listener = cb; return () => {}; },
  b64Files: (id, mode, files) => new Promise(resolve => {
    const list = [...files], first = list[0], total = 66080512;
    setTimeout(() => b64Listener?.({ id, index: 0, count: list.length, name: first.name, phase: mode, done: Math.round(total * 0.62), total }), 10);
    if (q.get('b64') !== 'working') setTimeout(() => resolve(list.map(f => b64Staged[f.name] || { ok: true, mode, sourceName: f.name, folder: 'Downloads', outputName: mode === 'encode' ? `${f.name}.base64.txt` : f.name.replace(/\.base64\.txt$/i, ''), renamed: false, restoredFrom: mode === 'decode' ? 'name' : null, bytes: f.size, outputBytes: f.size, verified: true, token: f.name })), 40);
  }),
  b64Control: async () => true, b64Reveal: async () => true,
  onB64Progress: cb => { b64Listener = cb; return () => {}; },
  vd: virtualDisks()
};
// Sample disks for Tools > Virtual disks, matching the design board. Nothing here touches a disk.
function virtualDisks() {
  const GiB = 2 ** 30, MiB = 2 ** 20;
  const disk = (token, name, folder, format, type, virtualSize, fileSize, extra = {}) => ({ token, name, path: `${folder}\\${name}`, folder, format, type, virtualSize, fileSize, attached: false, ...extra });
  const items = [
    disk('photos', 'Photos.vhdx', 'D:\\Archive', 'vhdx', 'dynamic', 64 * GiB, 23.9 * GiB, { attached: true, diskNumber: 3, readOnly: false, style: 'GPT', volumes: [{ partition: 2, letter: 'E', label: 'Photos', fileSystem: 'NTFS', size: 64 * GiB - 16 * MiB, free: 39.6 * GiB, type: 'Basic', paths: ['E:\\'] }] }),
    disk('win11', 'Win11_24H2.iso', 'D:\\Downloads', 'iso', 'read-only', 5.8 * GiB, 5.8 * GiB, { attached: true, readOnly: true, label: 'CCCOMA_X64FRE', volumes: [{ letter: 'F', label: 'CCCOMA_X64FRE' }] }),
    disk('builds', 'Builds.vhdx', 'D:\\VMs', 'vhdx', 'fixed', 20 * GiB, 20 * GiB),
    disk('scratch', 'Builds-scratch.avhdx', 'D:\\VMs', 'vhdx', 'differencing', 20 * GiB, 1.2 * GiB, { hasParent: true }),
    disk('backup', 'old-backup.vhd', 'E:\\Backups', 'vhd', 'dynamic', 127 * GiB, 41 * GiB),
    disk('cluster', 'cluster-data.vhds', 'D:\\Cluster', 'vhdset', null, null, 64 * 1024, { limited: true })
  ];
  const byToken = t => items.find(i => i.token === t);
  const info = i => ({ format: i.format, type: i.type, virtualSize: i.virtualSize, fileSize: i.fileSize, blockSize: i.format === 'vhdx' ? 32 * MiB : i.format === 'vhd' ? 2 * MiB : null,
    logicalSectorSize: i.format === 'iso' ? null : 512, physicalSectorSize: i.format === 'vhdx' ? 4096 : 512, diskId: i.format === 'vhdx' ? '6B250732-3E3C-4445-9130-3A44CF4266D8' : null, label: i.label || null,
    modified: Date.parse('2026-11-05T21:14:00Z') });
  let progress, packTimer;
  const emit = e => progress?.({ id: 'job-1', ...e });
  return {
    library: async () => ({ available: true, listed: true, items }),
    inspect: async token => {
      const i = byToken(token);
      const chain = i.type === 'differencing' ? [{ name: i.name, path: i.path }, { name: 'Builds.vhdx', path: 'D:\\VMs\\Builds.vhdx' }] : [{ name: i.name, path: i.path }];
      return { ...i, info: info(i), chain, state: { ok: true, attached: i.attached, signIn: false, ...(i.diskNumber != null ? { disk: { number: i.diskNumber, offline: false, readOnly: i.readOnly, style: i.style, offlineReason: '', volumes: [{ partition: 1, type: 'Reserved', size: 16 * MiB }, ...i.volumes] } } : {}) } };
    },
    details: async () => ({ ok: true, smallestSafeSize: 25.1 * GiB, fragmentation: 3, is4kAligned: true, virtualDiskId: 'd8259f81-98cb-4fbd-8372-55cc7dcb7bf8' }),
    scripts: async (op, token) => {
      const f = token ? byToken(token)?.path : 'D:\\Archive\\Photos.vhdx';
      return op === 'detach' ? { powershell: `Dismount-DiskImage -ImagePath '${f}'`, diskpart: `select vdisk file="${f}"\ndetach vdisk` }
        : op === 'create' ? { powershell: `New-VHD -Path '${f}' -SizeBytes 68719476736 -Dynamic |\n    Mount-VHD -Passthru | Initialize-Disk -PartitionStyle GPT -Passthru |\n    New-Partition -UseMaximumSize -AssignDriveLetter |\n    Format-Volume -FileSystem NTFS -NewFileSystemLabel 'Photos' -Confirm:$false`, diskpart: `create vdisk file="${f}" maximum=65536 type=expandable` }
        : { powershell: `Mount-DiskImage -ImagePath '${f}' -Access ReadWrite`, diskpart: `select vdisk file="${f}"\nattach vdisk` };
    },
    open: async () => [], add: async () => [], forget: async () => true,
    chooseSave: async () => ({ token: 'new', name: 'Photos.vhdx', folder: 'D:\\Archive', drive: 'D:\\', renamed: false, free: 212 * GiB }),
    pickParent: async () => items[2], pickItems: async () => null,
    plan: async () => ({ ok: true, token: 'plan-1', name: 'Trips.vhdx', wanted: 'Trips.vhdx', folder: 'D:\\Trips', mixedFolders: false, files: 1204, folders: 37, total: 3.81 * GiB, size: 4.26 * GiB, items: 3 }),
    run: (op, args) => new Promise(resolve => {
      if (op !== 'pack') { setTimeout(() => resolve({ ok: true }), 20); return; }
      const mode = q.get('vd');
      emit({ op, step: 'permission', done: 0, total: 0 });
      if (mode === 'permission') return;
      packTimer = setTimeout(() => {
        emit({ op, step: 'measure', done: 3.81 * GiB, total: 3.81 * GiB, files: 1204, folders: 37 });
        emit({ op, step: 'create', done: 1, total: 1 });
        emit({ op, step: 'format', done: 1, total: 1 });
        emit({ op, step: 'copy', done: 2.2 * GiB, total: 3.81 * GiB, file: 'IMG_2206.jpg', index: 700, count: 1204 });
        emit({ op, step: 'grow', done: 2.3 * GiB, total: 3.81 * GiB, from: 4.26 * GiB, to: 4.9 * GiB, file: 'IMG_2207.jpg' });
        emit({ op, step: 'copy', done: 2.37 * GiB, total: 3.81 * GiB, file: 'IMG_2207.jpg', index: 754, count: 1204 });
        if (mode !== 'done') return;
        emit({ op, step: 'detach', done: 1, total: 1 });
        resolve({ ok: true, path: 'D:\\Trips\\Trips (1).vhdx', files: 1204, folders: 37, bytes: 3.81 * GiB, grows: [{ from: 4.26 * GiB, to: 4.9 * GiB, file: 'IMG_2207.jpg' }], skipped: [], partial: false, verified: true, virtualSize: 4.9 * GiB, fileSize: 3.97 * GiB,
          entry: disk('trips', 'Trips (1).vhdx', 'D:\\Trips', 'vhdx', 'dynamic', 4.9 * GiB, 3.97 * GiB) });
      }, 30);
    }),
    cancel: async () => true, pause: async () => true, reveal: async () => true, openVolume: async () => true,
    onProgress: cb => { progress = cb; return () => {}; }
  };
}
window.__screens = { state, view, listener: () => listener };
})();
if (!new URLSearchParams(location.search).get('dimsum')) Math.random = () => 0.5;
