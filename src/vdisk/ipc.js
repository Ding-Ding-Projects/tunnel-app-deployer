'use strict';
// The bridge between the Virtual disks screen and the engine. The page never sends a path: it
// refers to disks by tokens handed out here for files the person opened, dropped or created, and
// new files are always named here, beside their source, without replacing anything.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const F = require('./format');
const { Engine, packPlan, freeName } = require('./engine');

const DISK_FILTER = [{ name: 'Virtual disks', extensions: ['vhdx', 'vhd', 'avhdx', 'avhd', 'vhds', 'iso'] }];

function register({ handle, dialog, shell, app, getWindow, engine = new Engine() }) {
  const tokens = new Map(), byPath = new Map(), plans = new Map();
  const store = path.join(app.getPath('userData'), 'virtual-disks.json');
  let known = [];
  try { known = JSON.parse(fs.readFileSync(store, 'utf8')).filter(p => typeof p === 'string' && path.isAbsolute(p)); } catch { /* first run */ }
  const save = () => { try { fs.writeFileSync(store, JSON.stringify(known.slice(0, 200))); } catch { /* best effort */ } };
  const remember = p => { known = [p, ...known.filter(k => k.toLowerCase() !== p.toLowerCase())]; save(); };
  const tokenFor = p => { const key = p.toLowerCase(); let t = byPath.get(key); if (!t) { t = crypto.randomUUID(); byPath.set(key, t); tokens.set(t, p); } return t; };
  const pathOf = t => {
    const p = typeof t === 'string' ? tokens.get(t) : undefined;
    if (!p) throw Object.assign(new Error('This disk is no longer known to the app.'), { code: 'token' });
    return p;
  };
  const send = (channel, value) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send(channel, value); };
  function entry(p, extra = {}) {
    const base = { token: tokenFor(p), name: path.basename(p), path: p, folder: path.dirname(p), format: F.formatOf(p) };
    try {
      const i = F.inspectFile(p);
      return { ...base, format: i.format, type: i.type, virtualSize: i.virtualSize ?? null, fileSize: i.fileSize, label: i.label || null, limited: !!i.limited, hasParent: !!i.parent, needsLogReplay: !!i.needsLogReplay, ...extra };
    } catch (e) { return { ...base, missing: !fs.existsSync(p), unreadable: e.code || 'unreadable', ...extra }; }
  }

  handle('vd:library', async () => {
    if (!engine.available) return { available: false, items: known.map(p => entry(p)) };
    const r = await engine.run('list', {});
    const attached = new Map();
    for (const d of (r.ok && r.disks) || []) if (d.path) attached.set(d.path.toLowerCase(), { path: d.path, state: { attached: true, diskNumber: d.number, readOnly: !!d.readOnly, offline: !!d.offline, offlineReason: d.offlineReason || '', style: d.style, volumes: d.volumes || [] } });
    for (const i of (r.ok && r.isos) || []) if (i.path) attached.set(i.path.toLowerCase(), { path: i.path, state: { attached: true, readOnly: true, volumes: [{ letter: i.letter, label: i.label }] } });
    const items = [...attached.values()].map(a => entry(a.path, a.state));
    for (const p of known) if (!attached.has(p.toLowerCase())) items.push(entry(p, { attached: false }));
    return { available: true, listed: !!r.ok, message: r.ok ? null : r.message, items };
  });
  handle('vd:inspect', async token => {
    const p = pathOf(token), e = entry(p);
    let info = null, chain = null;
    try { info = F.inspectFile(p); chain = F.chainOf(p).map(c => ({ ...c, token: c.path && !c.missing ? tokenFor(c.path) : null })); } catch { /* shown as unreadable */ }
    const state = engine.available ? await engine.run('state', { path: p }) : { ok: false, code: 'platform' };
    return { ...e, info, chain, state };
  });
  handle('vd:details', async (token, elevated) => engine.run('details', { path: pathOf(token) }, { elevated: !!elevated }));
  handle('vd:scripts', (op, token, extra) => {
    const a = { ...(extra && typeof extra === 'object' ? extra : {}), path: token ? pathOf(token) : '' };
    return F.scriptsFor(String(op), a);
  });
  handle('vd:open', async () => {
    const r = await dialog.showOpenDialog(getWindow(), { properties: ['openFile', 'multiSelections'], filters: DISK_FILTER });
    if (r.canceled) return [];
    for (const p of r.filePaths) remember(p);
    return r.filePaths.map(p => entry(p));
  });
  handle('vd:add', paths => {
    const ok = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && path.isAbsolute(p) && F.formatOf(p) && fs.existsSync(p)).slice(0, 50);
    for (const p of ok) remember(p);
    return ok.map(p => entry(p));
  });
  handle('vd:forget', token => { const p = pathOf(token); known = known.filter(k => k.toLowerCase() !== p.toLowerCase()); save(); return true; });
  handle('vd:choose-save', async request => {
    const format = ['vhd', 'vhdx', 'vhdset'].includes(request?.format) ? request.format : 'vhdx';
    const ext = format === 'vhd' ? 'vhd' : format === 'vhdset' ? 'vhds' : 'vhdx';
    const name = String(request?.name || 'Disk').replace(/[\\/:*?"<>|\0]/g, '').slice(0, 120) || 'Disk';
    const r = await dialog.showSaveDialog(getWindow(), { defaultPath: `${name}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (r.canceled || !r.filePath) return null;
    let file = r.filePath.toLowerCase().endsWith(`.${ext}`) ? r.filePath : `${r.filePath}.${ext}`;
    const renamed = fs.existsSync(file);
    if (renamed) file = freeName(path.dirname(file), path.basename(file));
    return { token: tokenFor(file), name: path.basename(file), folder: path.dirname(file), renamed };
  });
  handle('vd:pick-parent', async () => {
    const r = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'], filters: DISK_FILTER });
    return r.canceled || !r.filePaths[0] ? null : entry(r.filePaths[0]);
  });
  handle('vd:pick-items', async folders => {
    const r = await dialog.showOpenDialog(getWindow(), { properties: folders ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'] });
    return r.canceled ? null : r.filePaths;
  });
  handle('vd:plan', (paths, options) => {
    const items = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p)).slice(0, 1000);
    if (!items.length) return { ok: false, code: 'items' };
    const plan = packPlan(items, options || {}), token = crypto.randomUUID();
    plans.set(token, { items, fileSystem: plan.fileSystem });
    return { ok: true, token, name: path.basename(plan.path), folder: plan.folder, mixedFolders: plan.mixedFolders, files: plan.files, folders: plan.folders, total: plan.total, size: plan.size, items: items.length };
  });
  handle('vd:run', async (op, args) => {
    const a = args && typeof args === 'object' ? args : {};
    let request;
    try {
      const subject = a.token ? pathOf(a.token) : null;
      const beside = (ext, suffix = '') => freeName(path.dirname(subject), `${path.basename(subject).replace(/\.[^.]+$/, '')}${suffix}${ext}`);
      switch (op) {
        case 'create': request = { ...a, path: pathOf(a.target), parent: a.parent ? pathOf(a.parent) : undefined, source: a.source ? pathOf(a.source) : undefined }; break;
        case 'convert': request = { path: subject, target: beside(a.format === 'vhd' ? '.vhd' : a.format === 'vhdset' ? '.vhds' : '.vhdx', a.format === F.formatOf(subject) ? ` ${a.type}` : ''), type: a.type, blockSize: a.blockSize, virtualSize: a.virtualSize }; break;
        case 'child': request = { path: subject, target: beside(F.formatOf(subject) === 'vhd' ? '.vhd' : '.avhdx', ' child') }; break;
        case 'reparent': request = { path: subject, parent: pathOf(a.parent) }; break;
        case 'pack': {
          const plan = plans.get(a.plan);
          if (!plan) return { ok: false, code: 'plan', message: 'Choose the files again.' };
          const fresh = packPlan(plan.items, { fileSystem: a.fileSystem });
          request = { path: fresh.path, items: plan.items, size: Number(a.size) || fresh.size, fileSystem: a.fileSystem, fixed: !!a.fixed, label: path.basename(fresh.path, '.vhdx'), keepAcl: !!a.keepAcl, tight: !!a.tight };
          break;
        }
        case 'disk': request = { disk: a.disk, action: a.action }; break;
        default: request = { ...a, path: subject };
      }
    } catch (e) { return { ok: false, code: e.code || 'invalid', message: e.message }; }
    delete request.token;
    const r = await engine.run(op, request, { onProgress: p => send('vd:progress', p) });
    if (r.ok && r.path && ['create', 'convert', 'child', 'pack'].includes(op)) { remember(r.path); r.entry = entry(r.path); }
    if (op === 'merge' && r.ok) r.invalidated = [path.basename(request.path)];
    return r;
  });
  handle('vd:cancel', id => engine.cancel(String(id)));
  handle('vd:pause', (id, on) => engine.pause(String(id), !!on));
  handle('vd:reveal', token => { shell.showItemInFolder(pathOf(token)); return true; });
  handle('vd:open-volume', letter => (/^[A-Z]$/.test(String(letter)) ? shell.openPath(`${letter}:\\`).then(() => true) : false));
  return { engine };
}

module.exports = { register };
