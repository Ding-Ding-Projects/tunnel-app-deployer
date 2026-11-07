'use strict';
// Runs virtual disk operations through vdisk.ps1. Reading a file's header happens here in Node with
// no rights at all; listing attached disks runs PowerShell as the person; everything that changes a
// disk runs one elevated PowerShell per action, so Windows shows its administrator prompt once.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const F = require('./format');

const SCRIPT = path.join(__dirname, 'vdisk.ps1');
// Reading state and details is tried as the person first; every change asks for permission.
const ELEVATED = new Set(['create', 'attach', 'detach', 'forgettask', 'grow', 'shrink', 'compact', 'convert', 'child', 'merge', 'reparent', 'newid', 'disk', 'metadata', 'pack']);
const DISK_EXT = /\.(vhdx?|avhdx?|vhds|iso)$/i;

function fail(code, message, extra = {}) { throw Object.assign(new Error(message), { code, ...extra }); }
const absolute = p => typeof p === 'string' && p.length > 3 && p.length < 32767 && !p.includes('\0') && path.win32.isAbsolute(p) && !/^\\\\[.?]\\/.test(p);

// Every request is checked here before any PowerShell runs; the script checks the risky parts again.
function validate(op, a = {}) {
  const disk = p => (absolute(p) && DISK_EXT.test(p) ? p : fail('path', 'Choose a virtual disk file.'));
  const folderFile = (p, ext) => (absolute(p) && ext.test(p) ? p : fail('path', 'Choose where to save the virtual disk.'));
  switch (op) {
    case 'list': return {};
    case 'state': case 'details': case 'detach': case 'forgettask': return { path: disk(a.path) };
    case 'attach': return { path: disk(a.path), readOnly: !!a.readOnly || /\.iso$/i.test(a.path), noLetter: !!a.noLetter, atSignIn: !!a.atSignIn };
    case 'create': {
      const o = F.validateCreate(a);
      const p = folderFile(a.path, o.format === 'vhd' ? /\.vhd$/i : o.format === 'vhdset' ? /\.vhds$/i : /\.vhdx$/i);
      const parent = o.type === 'differencing' ? disk(a.parent) : null, source = a.source ? (/^\\\\\.\\PhysicalDrive\d{1,3}$/i.test(a.source) ? a.source : disk(a.source)) : null;
      return { ...o, path: p, parent, source, keepAttached: !!a.keepAttached };
    }
    case 'grow': case 'shrink': {
      const size = Math.ceil(Number(a.size) / F.MiB) * F.MiB, fmt = F.formatOf(a.path);
      if (op === 'shrink' && fmt !== 'vhdx') fail('vhdxonly', 'Only VHDX files can shrink.');
      if (!a.smallest && (!Number.isFinite(size) || size < F.LIMITS[fmt || 'vhdx'].min || size > F.LIMITS[fmt || 'vhdx'].max)) fail('size', 'That size is outside the format limits.');
      return { path: disk(a.path), size: a.smallest ? 0 : size, extend: a.extend !== false, smallest: !!a.smallest, allowUnsafe: false };
    }
    case 'compact': return { path: disk(a.path), mode: a.mode === 'quick' ? 'quick' : 'full' };
    case 'convert': {
      const target = folderFile(a.target, /\.(vhdx?|vhds)$/i);
      const fmt = F.formatOf(target), size = Number(a.virtualSize) || 0;
      if (fmt === 'vhd' && size > F.LIMITS.vhd.max) fail('large', 'This disk is larger than a VHD can hold.');
      return { path: disk(a.path), target, type: a.type === 'fixed' ? 'fixed' : 'dynamic', blockSize: fmt === 'vhdx' && a.blockSize ? F.validateCreate({ format: 'vhdx', type: 'dynamic', size: F.GiB, blockSize: a.blockSize }).blockSize : 0 };
    }
    case 'child': return { path: disk(a.path), target: folderFile(a.target, /\.a?vhdx?$/i) };
    case 'merge': return { path: disk(a.path), depth: Math.min(Math.max(1, Number(a.depth) | 0), 32) };
    case 'reparent': return { path: disk(a.path), parent: disk(a.parent) };
    case 'newid': return { path: disk(a.path) };
    case 'disk': {
      if (!['online', 'writable', 'fixsig'].includes(a.action)) fail('action', 'Unknown disk action.');
      const n = Number(a.disk); if (!Number.isInteger(n) || n < 0 || n > 4096) fail('disk', 'Unknown disk.');
      return { disk: n, action: a.action };
    }
    case 'metadata': {
      const action = ['list', 'set', 'delete'].includes(a.action) ? a.action : 'list';
      const id = action === 'list' ? null : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.id || '') ? a.id : fail('id', 'A metadata item needs a GUID.');
      if (action === 'set' && (typeof a.value !== 'string' || Buffer.byteLength(a.value) > 64 * 1024)) fail('value', 'Metadata text must be under 64 KB.');
      if (!/\.a?vhdx$/i.test(a.path || '')) fail('vhdxonly', 'Only VHDX files hold custom metadata.');
      return { path: disk(a.path), action, id, value: action === 'set' ? a.value : null };
    }
    case 'pack': {
      if (!Array.isArray(a.items) || !a.items.length || a.items.length > 1000 || !a.items.every(absolute)) fail('items', 'Choose files or folders to pack.');
      const fsName = ['NTFS', 'exFAT', 'ReFS'].includes(a.fileSystem) ? a.fileSystem : 'NTFS';
      const size = Math.ceil(Number(a.size) / F.MiB) * F.MiB;
      if (!Number.isFinite(size) || size < 64 * F.MiB || size > F.LIMITS.vhdx.max) fail('size', 'The pack size is outside the VHDX limits.');
      return { path: folderFile(a.path, /\.vhdx$/i), items: a.items, size, fileSystem: fsName, fixed: !!a.fixed, label: String(a.label || 'Pack').replace(/[\\/:*?"<>|\0]/g, '').slice(0, 32) || 'Pack', keepAcl: !!a.keepAcl, tight: !!a.tight };
    }
    default: fail('op', 'Unknown operation.');
  }
}

// The first free name in a folder: Photos.vhdx, Photos (1).vhdx, ... Never an existing file.
function freeName(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  for (let n = 0; n < 10000; n++) {
    const candidate = path.join(dir, n ? `${stem} (${n})${ext}` : name);
    if (!fs.existsSync(candidate)) return candidate;
  }
  fail('names', 'Every numbered name is taken.');
}

// Sizes for Quick pack, measured in Node before any permission is asked.
function measure(items) {
  const bytes = [];
  let folders = 0;
  const walk = p => {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { folders++; for (const e of fs.readdirSync(p)) walk(path.join(p, e)); }
    else if (st.isFile()) bytes.push(st.size);
  };
  for (const item of items) walk(item);
  return { files: bytes.length, folders, total: bytes.reduce((a, b) => a + b, 0), bytes };
}
function packPlan(items, options = {}) {
  const m = measure(items);
  const dir = path.dirname(items[0]);
  const base = items.length === 1 ? path.basename(items[0]).replace(/\.[^.\\/]+$/, '') : path.basename(dir) || 'Pack';
  const fileSystem = ['NTFS', 'exFAT', 'ReFS'].includes(options.fileSystem) ? options.fileSystem : 'NTFS';
  return { folder: dir, mixedFolders: items.some(i => path.dirname(i) !== dir), name: base, path: freeName(dir, `${base}.vhdx`), files: m.files, folders: m.folders, total: m.total, size: F.packEstimate({ bytes: m.bytes, folders: m.folders, fileSystem }) };
}

// ---------- running PowerShell ----------
let elevatedCache = null;
// The temp folder can come back as an 8.3 short path; Windows reports mount points by long path.
function longTemp() { try { return fs.realpathSync.native(os.tmpdir()); } catch { return os.tmpdir(); } }
function powershell() { return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); }
function isElevated() {
  if (elevatedCache !== null) return Promise.resolve(elevatedCache);
  return new Promise(resolve => {
    const p = spawn(powershell(), ['-NoProfile', '-NonInteractive', '-Command', '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('error', () => resolve((elevatedCache = false)));
    p.on('close', () => resolve((elevatedCache = /True/.test(out))));
  });
}

class Engine {
  constructor({ elevate = 'auto', scriptPath = SCRIPT } = {}) { this.elevate = elevate; this.scriptPath = scriptPath; this.jobs = new Map(); }
  get available() { return process.platform === 'win32'; }

  // Runs one operation and resolves with its result object; never throws for operation failures.
  async run(op, args, { onProgress, elevated = false } = {}) {
    if (!this.available) return { ok: false, code: 'platform', message: 'Virtual disks need Windows.' };
    let request;
    try { request = { op, ...validate(op, args) }; } catch (e) { return { ok: false, code: e.code || 'invalid', message: e.message, ...(e.min ? { min: e.min } : {}), ...(e.max ? { max: e.max } : {}) }; }
    const id = crypto.randomUUID();
    const dir = fs.mkdtempSync(path.join(longTemp(), 'tad-vdisk-'));
    const script = path.join(dir, 'vdisk.ps1');
    fs.writeFileSync(script, fs.readFileSync(this.scriptPath, 'utf8'), 'utf8');
    fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify(request), 'utf8');
    const needs = (ELEVATED.has(op) || elevated) && (this.elevate === true || (this.elevate === 'auto' && !(await isElevated())));
    const job = { id, dir, op, done: false };
    this.jobs.set(id, job);
    const progressFile = path.join(dir, 'progress.jsonl');
    let seen = 0;
    const poll = () => {
      try {
        const text = fs.readFileSync(progressFile, 'utf8'), lines = text.split('\n');
        for (; seen < lines.length - 1; seen++) { try { onProgress?.({ id, op, ...JSON.parse(lines[seen].replace(/^\uFEFF/, '')) }); } catch { /* partial line */ } }
      } catch { /* no progress yet */ }
    };
    const timer = setInterval(poll, 250);
    onProgress?.({ id, op, step: needs ? 'permission' : 'start', done: 0, total: 0 });
    const exit = await new Promise(resolve => {
      const inner = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Job', dir];
      const quoted = inner.map(a => `'${a.replace(/'/g, "''")}'`).join(',');
      const argv = needs
        ? ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; try { $p = Start-Process -FilePath '${powershell().replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList ${quoted}; exit $p.ExitCode } catch { exit 1223 }`]
        : inner;
      const child = spawn(powershell(), argv, { windowsHide: true });
      job.child = child;
      let stderr = '';
      child.stderr.on('data', d => { stderr += d; });
      child.on('error', e => resolve({ code: -1, stderr: e.message }));
      child.on('close', code => resolve({ code, stderr }));
    });
    clearInterval(timer); poll();
    job.done = true; this.jobs.delete(id);
    let result;
    try { result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8').replace(/^\uFEFF/, '')); }
    catch { result = exit.code === 1223 ? { ok: false, code: 'declined', message: 'Administrator permission was not given. Nothing changed.' } : { ok: false, code: 'failed', exitCode: exit.code, message: (exit.stderr || `PowerShell stopped without a result (exit code ${exit.code}).`).trim().slice(0, 2000) }; }
    if (!job.keep) fs.rm(dir, { recursive: true, force: true }, () => {});
    return { ...result, id, route: op === 'list' || op === 'state' ? 'Storage module' : op === 'pack' ? 'VirtDisk API and Storage module' : 'VirtDisk API', elevated: needs };
  }

  // Pausing holds Quick pack between files; the flag file is the only channel to the elevated script.
  pause(id, on) {
    const job = this.jobs.get(id);
    if (!job || job.done) return false;
    const flag = path.join(job.dir, 'pause.flag');
    try { if (on) fs.writeFileSync(flag, '1'); else fs.rmSync(flag, { force: true }); } catch { return false; }
    return true;
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job || job.done) return false;
    try { fs.writeFileSync(path.join(job.dir, 'cancel.flag'), '1'); } catch { return false; }
    return true;
  }
}

module.exports = { Engine, validate, freeName, measure, packPlan, ELEVATED };
