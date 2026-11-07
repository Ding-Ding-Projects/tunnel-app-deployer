'use strict';
// Tools > Virtual disks: the library of attached disks and known disk files, details and actions for
// the chosen disk, the New virtual disk sheet, and Quick pack. The page refers to disks by tokens
// from the main process and never names a path itself. Shared helpers ($, t, both, label, compose,
// fill, esc, plain, notify, announce, confirmAction, copyText, makeSearch, ...) come from app.js as window.App.
(() => {
  const App = window.App;
  if (!App) return;
  const { api, $, t, both, label, compose, fill, esc, plain, notify, announce, sound, confirmAction, copyText, makeSearch, matcherFor, searches, setCount, clearDropHint } = App;
  const vd = api?.vd, panel = $('panel-vdisk');
  if (!panel) return;
  const MiB = 2 ** 20, GiB = 2 ** 30, TiB = 2 ** 40, MIN = 3 * MiB;
  const LIMIT = { vhd: 2040 * GiB, vhdx: 64 * TiB, vhdset: 64 * TiB };
  const FMT = { vhd: 'VHD', vhdx: 'VHDX', vhdset: 'VHD Set', iso: 'ISO' };
  const ICON = { vhd: 'hard_drive', vhdx: 'hard_drive', vhdset: 'stacks', iso: 'album' };
  const CANCELLABLE = new Set(['create', 'compact', 'convert', 'grow']);
  const FILTERS = ['all', 'attached', 'files', 'vhdx', 'vhd', 'iso', 'vhdset'];
  const DISK_FILE = /\.(vhdx?|avhdx?|vhds|iso)$/i;
  const VD = {
    loaded: false, loading: false, available: !!vd, listed: true, message: null, lastLoad: 0,
    items: [], selected: null, view: null, filter: 'all', details: {}, job: null,
    script: 'powershell', scriptOpen: false,
    pack: { opts: { fixed: false, fileSystem: 'NTFS', keepAcl: false, tight: false }, job: null, result: null },
    sheet: null
  };

  // ---------- small helpers ----------
  const icon = (name, filled, cls = '') => `<span class="ms${filled ? ' f' : ''}${cls ? ` ${cls}` : ''}" aria-hidden="true">${name}</span>`;
  // Plain text in every shown language, with {placeholders} filled: for toasts and announcements.
  const say = (key, vars = {}) => both(key).filter(Boolean).map(s => fill(s, vars)).join(' · ');
  // One phrase per shown language, built by `make(li)` where li picks the language: compact lines.
  const tx = (key, li) => { const b = both(key); return b[li] ?? b[0]; };
  const dual = make => { const a = make(0), b = make(1); return b !== a ? `${esc(a)}<span class="alt" lang="yue-Hant-HK">${esc(b)}</span>` : esc(a); };
  const fmt = f => FMT[f] || '?';
  const itemOf = token => VD.items.find(i => i.token === token);
  function bytes(n) {
    if (n == null || n === '') return '';
    n = Number(n);
    if (!Number.isFinite(n) || n < 0) return '';
    const [u, d] = n >= TiB ? ['TB', TiB] : n >= GiB ? ['GB', GiB] : n >= MiB ? ['MB', MiB] : n >= 1024 ? ['KB', 1024] : ['B', 1];
    const v = n / d;
    return `${(v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).toLocaleString('en')} ${u}`;
  }
  const stamp = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
  const btn = (cls, id, ic, key, extra = '') => `<button class="btn ${cls}"${id ? ` id="${id}"` : ''} ${extra}>${ic ? icon(ic) : ''}<span>${label(key)}</span></button>`;
  const sw = (id, key, on, extra = '') => `<label class="vd-sw" for="${id}"><span>${label(key)}</span><input type="checkbox" role="switch" class="switch" id="${id}" ${on ? 'checked' : ''} ${extra}></label>`;
  const seg = (name, labelKey, options, current, extra = '') => `<div class="seg small-seg vd-seg" role="group" aria-label="${esc(t(labelKey))}">${options.map(([v, key]) => `<button type="button" data-${name}="${v}" id="vd-${name}-${v}" aria-pressed="${v === current}" ${extra}><span class="ms check" aria-hidden="true">check</span><span>${label(key)}</span></button>`).join('')}</div>`;
  function wireSeg(root, name, onPick) {
    const all = [...root.querySelectorAll(`[data-${name}]`)];
    for (const b of all) b.onclick = () => { for (const x of all) x.setAttribute('aria-pressed', String(x === b)); onPick?.(b.dataset[name]); };
  }
  const picked = (root, name) => root.querySelector(`[data-${name}][aria-pressed=true]`)?.dataset[name];
  // Re-render a region without losing the keyboard position inside it.
  function keepFocus(box, draw) {
    const a = document.activeElement;
    let sel = null;
    if (a && a !== box && box.contains(a)) {
      if (a.id) sel = `#${CSS.escape(a.id)}`;
      else { const k = Object.keys(a.dataset || {}).find(x => x.startsWith('vd')); if (k) sel = `[data-${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}="${CSS.escape(a.dataset[k])}"]`; }
    }
    draw();
    if (sel) box.querySelector(sel)?.focus({ preventScroll: true });
  }
  const DIALOGS = ['confirm', 'palette', 'vd-sheet', 'vd-ask'];
  function openDialog(box) { box.hidden = false; $('scrim').hidden = false; }
  function closeDialog(box, from) {
    box.hidden = true;
    if (DIALOGS.every(id => $(id).hidden) && $('notif-panel').hidden) $('scrim').hidden = true;
    if (from && document.contains(from)) from.focus(); else if (from !== null) $('vd-new').focus();
  }

  // ---------- library ----------
  async function load() {
    if (!vd) { VD.loaded = true; VD.available = false; render(); return; }
    if (VD.loading) return;
    VD.loading = true; VD.lastLoad = Date.now();
    if (!VD.loaded) renderList();
    try {
      const r = await vd.library();
      VD.available = r.available !== false; VD.listed = r.listed !== false; VD.message = r.message || null; VD.items = r.items || [];
    } catch (e) { VD.listed = false; VD.message = e.message; }
    VD.loading = false; VD.loaded = true;
    if (VD.selected && !itemOf(VD.selected)) { VD.selected = null; VD.view = null; panel.dataset.pane = 'list'; }
    if (VD.selected) await inspect(VD.selected, true); else render();
  }
  async function inspect(token, quiet = false) {
    if (VD.selected !== token || !VD.view) VD.view = { token, name: itemOf(token)?.name || '', loading: true };
    VD.selected = token;
    if (!quiet) panel.dataset.pane = 'detail';
    render();
    let v;
    try { v = await vd.inspect(token); } catch (e) { v = { token, name: itemOf(token)?.name || '', error: e.message }; }
    if (VD.selected !== token) return;
    VD.view = v; render();
    if (!quiet && matchMedia('(max-width: 860px)').matches) $('vd-detail').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
  }
  const matches = (i, f) => f === 'all' || (f === 'attached' ? !!i.attached : f === 'files' ? !i.attached : i.format === f);
  const count = f => VD.items.filter(i => matches(i, f)).length;
  function visible() {
    const m = matcherFor(searches['vd-search']);
    // Each field is tested on its own, so an anchored pattern such as \.vhdx$ means "a name ending in .vhdx".
    const fields = i => [i.name, i.folder, fmt(i.format), i.type, i.label, ...(i.volumes || []).map(v => (v.letter ? `${v.letter}:` : ''))].filter(Boolean);
    return VD.items.filter(i => matches(i, VD.filter) && (!searches['vd-search']?.query || fields(i).some(f => m.test(f))));
  }

  function render() {
    if (panel.hidden) return;
    if (!VD.loaded && !VD.loading) load();
    renderNote(); renderFilters(); renderList(); renderDetail(); renderStrip();
    if (!$('vd-pack').contains(document.activeElement)) renderPack();
  }
  window.vdRender = render;

  function renderNote() {
    const note = $('vd-note');
    const html = !VD.available ? `${icon('desktop_windows')}<span>${label('vd.needsWindows')}</span>`
      : !VD.listed ? `${icon('info')}<span>${label('vd.listFailed')}${VD.message ? ` <span class="mono small">${esc(VD.message)}</span>` : ''}</span>` : '';
    note.hidden = !html; note.innerHTML = html;
    for (const id of ['vd-new', 'vd-packgo']) $(id).disabled = !VD.available;
  }
  function renderFilters() {
    const box = $('vd-filters');
    keepFocus(box, () => {
      box.innerHTML = FILTERS.filter(f => ['all', 'attached', 'files'].includes(f) || count(f) || VD.filter === f)
        .map(f => `<button class="chip" data-vdf="${f}" aria-pressed="${VD.filter === f}">${VD.filter === f ? icon('check') : ''}<span>${label(`vd.f.${f}`)}</span><span class="vd-n">${count(f)}</span></button>`).join('');
    });
    for (const b of box.querySelectorAll('[data-vdf]')) b.onclick = () => { VD.filter = b.dataset.vdf; renderFilters(); renderList(); };
  }
  function subLine(i) {
    if (i.unreadable) return label(i.missing ? 'vd.missing' : 'vd.unreadable');
    return dual(li => {
      const p = [fmt(i.format)];
      if (i.format === 'iso') p.push(i.label || '', bytes(i.virtualSize || i.fileSize));
      else if (i.format === 'vhdset') p.push(tx('vd.needsHyperV', li));
      else {
        p.push(tx(`vd.short.${i.type || 'unknown'}`, li));
        if (i.type !== 'differencing') p.push(bytes(i.virtualSize));
        if (i.type !== 'fixed' && i.fileSize != null) p.push(fill(tx('vd.onDiskN', li), { n: bytes(i.fileSize) }));
      }
      return p.filter(Boolean).join(' · ');
    });
  }
  function pill(i) {
    if (i.attached) {
      const letters = (i.volumes || []).map(v => v.letter).filter(Boolean).map(l => `${l}:`).join(' ');
      const cls = i.offline ? 'warn' : i.readOnly ? 'ro' : 'on';
      return `<span class="vpill ${cls}">${i.offline ? label('vd.offline') : letters ? esc(letters) : label('vd.attached')}${i.readOnly && !i.offline ? `<span class="vpill-x"> · </span>${label('vd.readOnly')}` : ''}</span>`;
    }
    if (i.format === 'vhdset') return `<span class="vpill warn">${label('vd.limited')}</span>`;
    return `<span class="vpill">${label(i.unreadable ? 'vd.unavailable' : 'vd.detached')}</span>`;
  }
  function renderList() {
    const box = $('vd-list'), shown = visible();
    setCount(searches['vd-search'], shown.length);
    keepFocus(box, () => {
      if (!VD.loaded) { box.innerHTML = `<p class="vd-empty muted">${icon('progress_activity', false, 'vd-spin')}<span>${label('vd.loading')}</span></p>`; return; }
      if (!shown.length) { box.innerHTML = `<div class="vd-empty">${icon(VD.items.length ? 'search_off' : 'hard_drive', false, 'big')}<p class="muted">${label(VD.items.length ? 'vd.noMatch' : 'vd.empty')}</p></div>`; return; }
      const row = i => `<div role="listitem"><button class="vd-item" data-vdi="${esc(i.token)}" aria-current="${VD.selected === i.token}"><span class="vd-ic${i.attached ? ' on' : ''}">${icon(ICON[i.format] || 'hard_drive', i.attached)}</span><span class="vd-tx"><span class="vd-nm">${esc(i.name)}</span><span class="vd-sub">${subLine(i)}</span></span>${pill(i)}</button></div>`;
      const group = (id, key, items) => (items.length ? `<h2 class="vd-grp" id="${id}">${label(key)}</h2><div role="list" aria-labelledby="${id}">${items.map(row).join('')}</div>` : '');
      box.innerHTML = group('vd-g-att', 'vd.g.attached', shown.filter(i => i.attached)) + group('vd-g-files', 'vd.g.files', shown.filter(i => !i.attached));
    });
    const rows = [...box.querySelectorAll('[data-vdi]')];
    rows.forEach((b, n) => {
      b.onclick = () => inspect(b.dataset.vdi);
      b.onkeydown = e => {
        const to = { ArrowDown: n + 1, ArrowUp: n - 1, Home: 0, End: rows.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault(); rows[Math.max(0, Math.min(rows.length - 1, to))].focus();
      };
    });
  }

  // ---------- details ----------
  const fact = (key, html) => (html ? `<div class="vd-fact"><span class="k">${label(key)}</span><span class="v">${html}</span></div>` : '');
  const actCard = (id, ic, key, note, enabled) => `<button class="vd-act" data-vda="${id}"${enabled ? '' : ' aria-disabled="true"'}>${icon(ic)}<span class="vd-act-t">${label(key)}</span><span class="vd-act-d">${note}</span></button>`;
  function context() {
    const v = VD.view, i = v.info || {}, st = v.state?.ok ? v.state : null, item = itemOf(v.token) || {};
    const disk = st?.disk || null, attached = st ? !!st.attached : !!item.attached;
    const volumes = (disk?.volumes || item.volumes || []).filter(x => x.type !== 'Reserved');
    return { v, i, item, disk, attached, readOnly: disk ? !!disk.readOnly : !!item.readOnly, volumes, d: VD.details[v.token], isDisk: ['vhd', 'vhdx'].includes(v.format) && !v.unreadable };
  }
  function renderDetail() {
    const box = $('vd-detail'), v = VD.view;
    const back = `<button class="btn text vd-back" id="vd-back">${icon('arrow_back')}<span>${label('vd.back')}</span></button>`;
    keepFocus(box, () => {
      if (!v) { box.innerHTML = `<div class="vd-blank">${icon('hard_drive', false, 'big')}<h2 class="h3" id="vd-detail-h">${label('vd.pick')}</h2><p class="muted">${label('vd.pickHint')}</p></div>`; return; }
      if (v.loading) { box.innerHTML = `${back}<div class="vd-blank"><h2 class="h3" id="vd-detail-h">${esc(v.name)}</h2><p class="muted">${icon('progress_activity', false, 'vd-spin')} ${label('vd.loading')}</p></div>`; return; }
      if (v.error) { box.innerHTML = `${back}<div class="vd-blank"><h2 class="h3" id="vd-detail-h">${esc(v.name || '')}</h2><p class="bad-text">${esc(v.error)}</p></div>`; return; }
      box.innerHTML = back + detailHtml(context());
    });
    for (const m of box.querySelectorAll('.vd-meter[data-used]')) m.firstElementChild.style.width = `${m.dataset.used}%`;
    wireDetail();
  }
  function detailHtml(c) {
    const { v, i, disk, attached, readOnly, volumes, d, isDisk } = c;
    const letters = volumes.filter(x => x.letter);
    const diff = i.type === 'differencing', isVhdx = v.format === 'vhdx', fixed = i.type === 'fixed';
    const head = `<div class="vd-head"><div class="vd-title"><h2 class="h2" id="vd-detail-h">${esc(v.name)}</h2><span class="mono small muted vd-path">${esc(v.path || '')}</span></div>
      <div class="vd-headacts">${pill({ ...c.item, format: v.format, attached, readOnly, offline: disk?.offline, volumes })}
        ${attached ? btn('tonal', 'vd-detach', 'eject', 'vd.detach') : btn('fill', 'vd-attach', 'link', 'vd.attach', v.format === 'vhdset' || v.unreadable || !VD.available ? 'disabled' : '')}
        ${letters.slice(0, 2).map(x => `<button class="btn outline" data-vdvol="${esc(x.letter)}">${icon('folder_open')}<span>${esc(fill(tx('vd.openLetter', 0), { l: x.letter }))}</span></button>`).join('')}
        <button class="icon-btn" id="vd-reveal" data-tip="vd.reveal" aria-label="${esc(t('vd.reveal'))}">${icon('folder')}</button>
        ${attached ? '' : `<button class="icon-btn" id="vd-forget" data-tip="vd.forget" aria-label="${esc(t('vd.forget'))}">${icon('playlist_remove')}</button>`}</div></div>`;
    const facts = [
      fact('vd.k.format', esc(fmt(v.format))),
      fact('vd.k.type', i.type ? label(`vd.type.${i.type}`) : ''),
      fact('vd.k.size', esc(bytes(i.virtualSize))),
      fact('vd.k.onDisk', esc(bytes(v.fileSize))),
      fact('vd.k.safe', d?.ok && d.smallestSafeSize ? esc(bytes(d.smallestSafeSize)) : ''),
      fact('vd.k.block', i.blockSize ? esc(bytes(i.blockSize)) : ''),
      fact('vd.k.sectors', i.logicalSectorSize ? compose('vd.sectors', { l: i.logicalSectorSize, p: i.physicalSectorSize || i.logicalSectorSize }) : ''),
      fact('vd.k.disk', disk ? `${esc(`${disk.number} · ${disk.style || '?'}`)} · ${label(disk.offline ? 'vd.offline' : 'vd.online')}` : ''),
      fact('vd.k.label', i.label ? esc(i.label) : ''),
      fact('vd.k.frag', d?.ok && d.fragmentation != null ? esc(`${d.fragmentation}%`) : ''),
      fact('vd.k.aligned', d?.ok && d.is4kAligned != null ? label(d.is4kAligned ? 'vd.yes' : 'vd.no') : ''),
      fact('vd.k.id', i.diskId ? `<span class="mono">${esc(i.diskId)}</span>` : ''),
      fact('vd.k.modified', i.modified ? esc(stamp(i.modified)) : '')
    ].join('');
    const notes = [
      i.damaged ? `<p class="vd-flag bad">${icon('report')}<span>${label('vd.damaged')}</span></p>` : '',
      i.needsLogReplay ? `<p class="vd-flag">${icon('info')}<span>${label('vd.logReplay')}</span></p>` : '',
      v.format === 'vhdset' ? `<p class="vd-flag">${icon('info')}<span>${label('vd.limitedLong')}</span></p>` : '',
      disk?.offline && disk.offlineReason ? `<p class="vd-flag">${icon('info')}<span>${label(/collision/i.test(disk.offlineReason) ? 'vd.collision' : 'vd.offlineWhy')} <span class="mono small">${esc(disk.offlineReason)}</span></span></p>` : '',
      v.state?.signIn ? `<div class="vd-flag">${icon('event_repeat')}<span>${label('vd.signInOn')}</span><button class="btn text" id="vd-signin-stop">${label('vd.signInStop')}</button></div>` : ''
    ].join('');
    const more = !d && isDisk && VD.available ? `<button class="btn text vd-more" id="vd-more">${icon('manage_search')}<span>${label('vd.more')}</span></button>`
      : d && !d.ok ? `<div class="small muted vd-flag">${icon('lock')}<span>${label('vd.moreFailed')}</span><button class="btn text" id="vd-more-admin">${icon('admin_panel_settings')}<span>${label('vd.moreAdmin')}</span></button></div>` : '';
    const vols = volumes.map(x => {
      const used = x.size && x.free != null ? Math.max(0, Math.min(100, Math.round((100 * (x.size - x.free)) / x.size))) : null;
      const folders = (x.paths || []).filter(p => !/^[A-Z]:\\$/.test(p) && !/^\\\\\?\\Volume/.test(p));
      const meta = [x.fileSystem || '', x.free != null ? plain(compose('vd.volFree', { free: bytes(x.free), size: bytes(x.size) })) : bytes(x.size)].filter(Boolean).join(' · ');
      return `<div class="vd-vol">${icon('storage', true)}<div class="vd-vol-tx"><div class="vd-vol-line"><b>${esc([x.letter ? `${x.letter}:` : '', x.label || ''].filter(Boolean).join(' ') || t('vd.volume'))}</b><span class="small muted">${esc(meta)}</span></div>${used != null ? `<div class="vd-meter" data-used="${used}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${used}" aria-label="${esc(t('vd.used'))}"><i></i></div>` : ''}${folders.length ? `<div class="small muted">${label('vd.mountedAt')} <span class="mono">${esc(folders.join(', '))}</span></div>` : ''}</div>${x.letter ? `<button class="btn text" data-vdvol="${esc(x.letter)}">${icon('open_in_new')}<span>${label('vd.openVol')}</span></button>` : ''}</div>`;
    }).join('');
    const chainList = v.chain && v.chain.length ? v.chain : [{ name: v.name }];
    const chain = isDisk ? `<div class="vd-chain"><span class="small muted">${label('vd.chain')}</span>${chainList.map((x, n) => `${n ? icon('arrow_forward', false, 'vd-arrow') : ''}<span class="vd-node${n === 0 ? ' me' : ''}${x.missing ? ' bad' : ''}">${esc(x.name || '?')}</span>`).join('')}<span class="small muted">${label(chainList.length < 2 ? 'vd.noParent' : chainList.some(x => x.missing) ? 'vd.parentMissing' : 'vd.chainOk')}</span></div>` : '';
    const shrinkNote = !isVhdx ? label('vd.a.vhdxOnly') : diff ? label('vd.a.notDiff') : d?.ok && d.smallestSafeSize ? compose('vd.a.shrinkTo', { n: bytes(d.smallestSafeSize) }) : label('vd.a.shrinkD');
    const can = VD.available;
    const acts = isDisk ? `<div class="vd-acts">
      ${actCard('grow', 'open_in_full', 'vd.a.grow', label(diff ? 'vd.a.notDiff' : 'vd.a.growD'), can && !diff)}
      ${actCard('shrink', 'close_fullscreen', 'vd.a.shrink', shrinkNote, can && isVhdx && !diff)}
      ${actCard('compact', 'compress', 'vd.a.compact', label(fixed ? 'vd.a.notFixed' : 'vd.a.compactD'), can && !fixed)}
      ${actCard('convert', 'sync_alt', 'vd.a.convert', label(diff ? 'vd.a.convertDiff' : 'vd.a.convertD'), can)}
      ${actCard('child', 'account_tree', 'vd.a.child', label(attached ? 'vd.a.detachFirst' : 'vd.a.childD'), can && !attached)}
      ${actCard('merge', 'merge', 'vd.a.merge', label(!diff ? 'vd.a.diffOnly' : attached ? 'vd.a.detachFirst' : 'vd.a.mergeD'), can && diff && !attached)}
      ${actCard('reparent', 'link', 'vd.a.reparent', label(!diff ? 'vd.a.diffOnly' : attached ? 'vd.a.detachFirst' : 'vd.a.reparentD'), can && diff && !attached)}
      ${actCard('newid', 'fingerprint', 'vd.a.newid', label('vd.a.newidD'), can)}
      ${actCard('metadata', 'sell', 'vd.a.meta', label(isVhdx ? 'vd.a.metaD' : 'vd.a.vhdxOnly'), can && isVhdx)}
      ${disk?.offline ? actCard('online', 'power_settings_new', 'vd.a.online', label(/collision/i.test(disk.offlineReason || '') ? 'vd.a.collisionD' : 'vd.a.onlineD'), can) : ''}
      ${disk && readOnly && v.format !== 'iso' ? actCard('writable', 'edit', 'vd.a.writable', label('vd.a.writableD'), can) : ''}
    </div>` : '';
    return `${head}<div class="vd-facts">${facts}</div>${notes}${more}${vols ? `<div class="vd-vols">${vols}</div>` : ''}${chain}${acts}
      ${scriptBlock('vd-script', attached ? 'detach' : 'attach', VD.scriptOpen)}
      <p class="small muted vd-route">${icon('route')}<span>${label(v.format === 'iso' ? 'vd.routeIso' : 'vd.route')}</span></p>`;
  }
  // An "equivalent script" disclosure; the operation shown is stored on the element.
  function scriptBlock(id, op, open = false) {
    return `<details class="vd-script fold" id="${id}" data-op="${op}"${open ? ' open' : ''}><summary>${icon('terminal')}<span>${label('vd.script')}</span></summary>
      <div class="vd-script-body"><div class="seg small-seg vd-seg" role="group" aria-label="${esc(t('vd.scriptKind'))}">${['powershell', 'diskpart'].map(k => `<button type="button" data-vds="${k}" aria-pressed="${VD.script === k}"><span class="ms check" aria-hidden="true">check</span><span>${k === 'powershell' ? 'PowerShell' : 'DiskPart'}</span></button>`).join('')}</div>
      <pre class="mono vd-code" tabindex="0" aria-label="${esc(t('vd.script'))}"></pre><div class="row spread"><span class="small muted">${label('vd.scriptNote')}</span><button type="button" class="btn text" data-vdcopy="1">${icon('content_copy')}<span>${label('vd.copy')}</span></button></div></div></details>`;
  }
  function wireScript(det, token, args) {
    if (!det || !vd) return;
    const paint = async () => {
      let s = {};
      try { s = await vd.scripts(det.dataset.op, token, typeof args === 'function' ? args() : args || {}); } catch { /* shown as unavailable */ }
      det.querySelector('pre').textContent = s[VD.script] || say('vd.noScript');
    };
    det.addEventListener('toggle', () => { if (det.id === 'vd-script') VD.scriptOpen = det.open; if (det.open) paint(); });
    for (const b of det.querySelectorAll('[data-vds]')) b.onclick = () => { VD.script = b.dataset.vds; for (const x of det.querySelectorAll('[data-vds]')) x.setAttribute('aria-pressed', String(x === b)); paint(); };
    det.querySelector('[data-vdcopy]').onclick = async () => { if (await copyText(det.querySelector('pre').textContent)) notify('vd.copied', 'ok'); };
    det.paint = paint;
    if (det.open) paint();
  }
  const repaintAsk = () => { const d = $('vd-ask-script'); if (d?.open) d.paint(); };
  function back() { panel.dataset.pane = 'list'; const row = VD.selected && $('vd-list').querySelector(`[data-vdi="${CSS.escape(VD.selected)}"]`); (row || $('vd-new')).focus(); }
  function wireDetail() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('vd-back', back);
    const v = VD.view;
    if (!v || v.loading || v.error) return;
    const c = context();
    on('vd-attach', () => askAttach(v));
    on('vd-detach', () => askDetach(v, c));
    on('vd-reveal', () => vd.reveal(v.token));
    on('vd-forget', async () => { await vd.forget(v.token); VD.selected = null; VD.view = null; panel.dataset.pane = 'list'; notify(say('vd.forgotten', { name: v.name }), 'info'); load(); });
    on('vd-signin-stop', () => runOp('forgettask', { token: v.token }, v.name));
    on('vd-more', () => moreDetails(v.token, false));
    on('vd-more-admin', () => moreDetails(v.token, true));
    for (const b of $('vd-detail').querySelectorAll('[data-vdvol]')) b.onclick = () => vd.openVolume(b.dataset.vdvol);
    for (const b of $('vd-detail').querySelectorAll('[data-vda]')) b.onclick = () => {
      if (b.getAttribute('aria-disabled') === 'true') { notify(VD.available ? plain(b.querySelector('.vd-act-d').innerHTML) : say('vd.needsWindows'), 'info'); return; }
      action(b.dataset.vda, v, c, b);
    };
    wireScript($('vd-script'), v.token, () => ({}));
  }
  async function moreDetails(token, elevated) {
    const b = $(elevated ? 'vd-more-admin' : 'vd-more'); if (b) b.disabled = true;
    try { VD.details[token] = await vd.details(token, elevated); } catch (e) { VD.details[token] = { ok: false, message: e.message }; }
    if (VD.selected === token) renderDetail();
  }

  // ---------- running a change ----------
  function report(op, r, name) {
    if (r.ok) { notify(say(`vd.done.${op}`, { name }), 'ok'); sound('tap'); }
    else if (r.code === 'cancelled') notify('vd.cancelled', 'info');
    else if (r.code === 'declined') notify('vd.declined', 'warn');
    else { notify(`${say(`vd.op.${op}`)}: ${r.message || r.code}`, 'error'); sound('fail'); }
  }
  async function runOp(op, args, name = VD.view?.name || '') {
    if (VD.job || VD.pack.job) { notify('vd.busy', 'info'); return null; }
    VD.job = { op, name, id: null, step: 'start', pct: 0 };
    renderStrip(); announce(say(`vd.op.${op}`));
    let r;
    try { r = await vd.run(op, args); } catch (e) { r = { ok: false, code: 'failed', message: e.message }; }
    VD.job = null; renderStrip();
    report(op, r, r.entry?.name || name);
    if (op === 'merge' && r.ok) delete VD.details[args.token];
    if (['grow', 'shrink', 'compact', 'newid'].includes(op)) delete VD.details[args.token];
    await load();
    if (r.ok && r.entry) await inspect(r.entry.token);
    return r;
  }
  function renderStrip() {
    const s = $('vd-strip'), j = VD.job;
    s.hidden = !j;
    if (!j) { s.innerHTML = ''; return; }
    s.innerHTML = `${j.step === 'permission' ? permBanner() : ''}<div class="vd-strip-row">${icon('progress_activity', false, 'vd-spin')}<div class="vd-strip-tx"><b>${label(`vd.op.${j.op}`)}</b><span class="mono small">${esc(j.name)}</span></div><span class="mono small" id="vd-strip-pct"></span>${CANCELLABLE.has(j.op) ? btn('text', 'vd-strip-cancel', '', 'tools.cancel', j.id && j.step !== 'permission' ? '' : 'disabled') : ''}</div>
      <div class="zprog" id="vd-strip-prog" role="progressbar" aria-label="${esc(t(`vd.op.${j.op}`))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${j.pct}"><div class="zprog-bar"></div></div>`;
    paintStrip();
    const c = $('vd-strip-cancel'); if (c) c.onclick = () => { c.disabled = true; vd.cancel(j.id); };
  }
  function paintStrip() {
    const j = VD.job, p = $('vd-strip-prog'); if (!j || !p) return;
    p.firstElementChild.style.transform = `scaleX(${j.pct / 100})`; p.setAttribute('aria-valuenow', String(j.pct));
    $('vd-strip-pct').textContent = j.pct ? `${j.pct}%` : '';
  }
  const permBanner = () => `<div class="vd-banner">${icon('admin_panel_settings', true)}<div><b>${label('vd.perm')}</b><span class="small">${label('vd.permHint')}</span></div></div>`;
  vd?.onProgress(p => {
    const pct = p.total ? Math.min(100, Math.floor((100 * p.done) / p.total)) : 0;
    const pj = VD.pack.job;
    if (pj && (pj.id ? pj.id === p.id : p.op === 'pack')) { packProgress(p, pct); return; }
    const j = VD.job;
    if (!j || (j.id ? j.id !== p.id : p.op !== j.op)) return;
    const redraw = !j.id || (j.step === 'permission') !== (p.step === 'permission');
    j.id = p.id; j.step = p.step; j.pct = pct;
    if (redraw) renderStrip(); else paintStrip();
  });

  // ---------- dialogs for actions ----------
  let askFrom = null;
  function ask({ title, body, okKey, okIcon = '', run, script }) {
    const box = $('vd-ask');
    askFrom = document.activeElement;
    box.innerHTML = `<h2 class="h2" id="vd-ask-h">${title}</h2><div class="vd-ask-body">${body}</div>${script ? scriptBlock('vd-ask-script', script.op) : ''}<p class="bad-text small" id="vd-ask-err" role="alert"></p><div class="row end"><button class="btn text" id="vd-ask-cancel">${label('tools.cancel')}</button><button class="btn fill" id="vd-ask-ok">${okIcon ? icon(okIcon) : ''}<span>${label(okKey)}</span></button></div>`;
    openDialog(box);
    const close = () => closeDialog(box, askFrom);
    $('vd-ask-cancel').onclick = close;
    $('vd-ask-ok').onclick = () => {
      try { const go = run(box); if (go === false) return; close(); if (typeof go === 'function') go(); }
      catch (e) { $('vd-ask-err').textContent = e.message; }
    };
    box.onkeydown = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) { e.preventDefault(); $('vd-ask-ok').click(); }
    };
    if (script) wireScript($('vd-ask-script'), VD.view?.token, script.args);
    (box.querySelector('.vd-ask-body input:not([disabled]), .vd-ask-body select, .vd-ask-body button') || $('vd-ask-ok')).focus();
    return box;
  }
  const sizeField = (id, value, unit = GiB, key = 'vd.f.newSize') => `<div class="vd-two"><div class="field"><label for="${id}">${label(key)}</label><input id="${id}" type="number" inputmode="decimal" min="0" step="any" value="${value}"></div><div class="field vd-unit"><label for="${id}-u">${label('vd.f.unit')}</label><select id="${id}-u">${[[MiB, 'MB'], [GiB, 'GB'], [TiB, 'TB']].map(([n, u]) => `<option value="${n}"${n === unit ? ' selected' : ''}>${u}</option>`).join('')}</select></div></div>`;
  const readSize = id => Math.round(Number($(id)?.value || 0) * Number($(`${id}-u`)?.value || GiB));
  const nice = n => { const u = n >= TiB && n % TiB === 0 ? TiB : n >= GiB ? GiB : MiB; return { v: Math.round((n / u) * 100) / 100, u }; };
  const err = key => new Error(plain(label(key)));

  function askAttach(v) {
    const iso = v.format === 'iso';
    ask({ title: compose('vd.attachTitle', { name: v.name }), okKey: 'vd.attach', okIcon: 'link',
      body: `<div class="vd-checks">${sw('vd-ro', 'vd.ro', iso, iso ? 'disabled' : '')}${sw('vd-noletter', 'vd.noLetter', false)}${iso ? '' : sw('vd-signin', 'vd.signIn', false)}</div><p class="small muted">${label(iso ? 'vd.attachHintIso' : 'vd.attachHint')}</p>`,
      script: { op: 'attach', args: () => ({ readOnly: $('vd-ro')?.checked, noLetter: $('vd-noletter')?.checked }) },
      run: () => { const a = { token: v.token, readOnly: $('vd-ro').checked, noLetter: $('vd-noletter').checked, atSignIn: !!$('vd-signin')?.checked }; return () => runOp('attach', a, v.name); } });
    for (const id of ['vd-ro', 'vd-noletter']) $(id).addEventListener('change', repaintAsk);
  }
  function askDetach(v, c) {
    const letters = c.volumes.filter(x => x.letter).map(x => `${x.letter}:`).join(' ');
    ask({ title: compose('vd.detachTitle', { name: v.name }), okKey: 'vd.detach', okIcon: 'eject',
      body: `<p>${letters ? compose('vd.detachBody', { letters }) : label('vd.detachBodyNone')}</p>`,
      script: { op: 'detach', args: {} },
      run: () => () => runOp('detach', { token: v.token }, v.name) });
  }
  function action(id, v, c, from) {
    const i = c.i, size = i.virtualSize || 0, limit = LIMIT[v.format] || LIMIT.vhdx;
    if (id === 'grow') {
      const start = nice(Math.min(limit, Math.max(size * 2, size + GiB)));
      ask({ title: compose('vd.growTitle', { name: v.name }), okKey: 'vd.a.grow', okIcon: 'open_in_full',
        body: `<p class="small muted">${compose('vd.nowSize', { n: bytes(size) })}</p>${sizeField('vd-g-size', start.v, start.u)}<div class="vd-checks">${sw('vd-g-extend', 'vd.extend', true)}</div><p class="small muted">${label('vd.growHint')}</p>`,
        script: { op: 'grow', args: () => ({ size: readSize('vd-g-size') }) },
        run: () => { const n = readSize('vd-g-size'); if (!(n > size)) throw err('vd.err.bigger'); if (n > limit) throw err(v.format === 'vhd' ? 'vd.err.vhdLimit' : 'vd.err.limit'); const extend = $('vd-g-extend').checked; return () => runOp('grow', { token: v.token, size: n, extend }, v.name); } });
      for (const x of ['vd-g-size', 'vd-g-size-u']) $(x).addEventListener('input', repaintAsk);
      return;
    }
    if (id === 'shrink') {
      const safe = c.d?.ok ? c.d.smallestSafeSize : 0, start = nice(Math.max(safe || 0, Math.floor(size / 2)));
      const box = ask({ title: compose('vd.shrinkTitle', { name: v.name }), okKey: 'vd.a.shrink', okIcon: 'close_fullscreen',
        body: `${seg('vdshr', 'vd.a.shrink', [['smallest', 'vd.smallest'], ['size', 'vd.toSize']], 'smallest')}<div id="vd-shr-size-box" hidden>${sizeField('vd-shr-size', start.v, start.u)}</div><p class="small muted">${safe ? `${compose('vd.safeIs', { n: bytes(safe) })} ` : ''}${label('vd.shrinkHint')}</p>`,
        script: { op: 'shrink', args: () => ({ smallest: picked($('vd-ask'), 'vdshr') !== 'size', size: readSize('vd-shr-size') }) },
        run: b => { const smallest = picked(b, 'vdshr') !== 'size', n = readSize('vd-shr-size'); if (!smallest && !(n < size)) throw err('vd.err.smaller'); if (!smallest && safe && n < safe) throw err('vd.err.belowSafe'); return () => runOp('shrink', { token: v.token, smallest, size: smallest ? 0 : n }, v.name); } });
      wireSeg(box, 'vdshr', p => { $('vd-shr-size-box').hidden = p !== 'size'; repaintAsk(); });
      return;
    }
    if (id === 'compact') {
      const box = ask({ title: compose('vd.compactTitle', { name: v.name }), okKey: 'vd.a.compact', okIcon: 'compress',
        body: `${seg('vdcm', 'vd.a.compact', [['quick', 'vd.quick'], ['full', 'vd.full']], 'quick')}<p class="small muted">${label('vd.compactHint')}</p>`,
        script: { op: 'compact', args: () => ({ mode: picked($('vd-ask'), 'vdcm') }) },
        run: b => { const mode = picked(b, 'vdcm'); return () => runOp('compact', { token: v.token, mode }, v.name); } });
      wireSeg(box, 'vdcm', repaintAsk);
      return;
    }
    if (id === 'convert') {
      const box = ask({ title: compose('vd.convertTitle', { name: v.name }), okKey: 'vd.a.convert', okIcon: 'sync_alt',
        body: `<p class="small">${label('vd.convertHint')}</p><div class="field"><span class="flabel">${label('vd.f.format')}</span>${seg('vdcf', 'vd.f.format', [['vhdx', 'vd.fmt.vhdx'], ['vhd', 'vd.fmt.vhd']], v.format === 'vhdx' ? 'vhd' : 'vhdx')}</div><div class="field"><span class="flabel">${label('vd.f.type')}</span>${seg('vdct', 'vd.f.type', [['dynamic', 'vd.type.dynamic'], ['fixed', 'vd.type.fixed']], i.type === 'fixed' ? 'dynamic' : 'fixed')}</div>`,
        script: { op: 'convert', args: () => ({ format: picked($('vd-ask'), 'vdcf'), type: picked($('vd-ask'), 'vdct') }) },
        run: b => { const format = picked(b, 'vdcf'), type = picked(b, 'vdct'); if (format === 'vhd' && size > LIMIT.vhd) throw err('vd.err.vhdLimit'); return () => runOp('convert', { token: v.token, format, type, virtualSize: size }, v.name); } });
      wireSeg(box, 'vdcf', repaintAsk); wireSeg(box, 'vdct', repaintAsk);
      return;
    }
    if (id === 'child') {
      ask({ title: compose('vd.childTitle', { name: v.name }), okKey: 'vd.a.child', okIcon: 'account_tree', body: `<p>${label('vd.childHint')}</p>`,
        script: { op: 'child', args: {} }, run: () => () => runOp('child', { token: v.token }, v.name) });
      return;
    }
    if (id === 'merge') {
      const parent = v.chain?.[1]?.name || '?';
      confirmAction({ titleKey: 'vd.mergeTitle', bodyKey: 'vd.mergeBody', affects: `${v.name} → ${parent}`, from, run: () => runOp('merge', { token: v.token, depth: 1 }, v.name) });
      return;
    }
    if (id === 'reparent') {
      (async () => {
        const p = await vd.pickParent();
        if (p) confirmAction({ titleKey: 'vd.reparentTitle', bodyKey: 'vd.reparentBody', affects: `${v.name} → ${p.name}`, from, run: () => runOp('reparent', { token: v.token, parent: p.token }, v.name) });
      })();
      return;
    }
    if (id === 'newid') {
      ask({ title: compose('vd.newidTitle', { name: v.name }), okKey: 'vd.a.newid', okIcon: 'fingerprint', body: `<p>${label('vd.newidHint')}</p>`,
        script: { op: 'newid', args: {} }, run: () => () => runOp('newid', { token: v.token }, v.name) });
      return;
    }
    if (id === 'online' || id === 'writable') {
      const sub = id === 'online' ? (/collision/i.test(c.disk.offlineReason || '') ? 'fixsig' : 'online') : 'writable';
      runOp('disk', { token: v.token, disk: c.disk.number, action: sub }, v.name);
      return;
    }
    if (id === 'metadata') metadata(v, null);
  }
  async function metadata(v, items) {
    if (!items) {
      const r = await runOp('metadata', { token: v.token, action: 'list' }, v.name);
      if (!r?.ok) return;
      items = r.items || [];
    }
    const rows = items.length ? `<div class="vd-metas">${items.map(m => `<div class="vd-meta"><div><span class="mono small">${esc(m.id)}</span><div class="small">${m.text != null ? esc(m.text) : esc(`${m.size} B · ${m.hex}`)}</div></div><button class="btn text danger" data-vdmd="${esc(m.id)}">${icon('delete')}<span>${label('vd.delete')}</span></button></div>`).join('')}</div>` : `<p class="muted small">${label('vd.metaNone')}</p>`;
    const box = ask({ title: compose('vd.metaTitle', { name: v.name }), okKey: 'vd.metaAdd', okIcon: 'add',
      body: `${rows}<div class="field"><label for="vd-md-text">${label('vd.metaText')}</label><input id="vd-md-text" maxlength="4000" autocomplete="off"></div><p class="small muted">${label('vd.metaHint')}</p>`,
      run: () => {
        const value = $('vd-md-text').value.trim();
        if (!value) throw err('vd.err.text');
        const id = crypto.randomUUID();
        return async () => { const r = await runOp('metadata', { token: v.token, action: 'set', id, value }, v.name); if (r?.ok) metadata(v, r.items || [...items, { id, text: value, size: value.length }]); };
      } });
    for (const b of box.querySelectorAll('[data-vdmd]')) b.onclick = () => {
      closeDialog(box, null);
      confirmAction({ titleKey: 'vd.metaDelTitle', bodyKey: 'vd.metaDelBody', affects: b.dataset.vdmd, from: $('vd-detail').querySelector('[data-vda=metadata]'),
        run: async () => { const r = await runOp('metadata', { token: v.token, action: 'delete', id: b.dataset.vdmd }, v.name); if (r?.ok) metadata(v, r.items || items.filter(m => m.id !== b.dataset.vdmd)); } });
    };
  }

  // ---------- New virtual disk sheet ----------
  const PRESETS = {
    custom: {},
    portable: { format: 'vhdx', type: 'dynamic', size: 64 * GiB, volume: true, fileSystem: 'exFAT', devDrive: false, source: null },
    devdrive: { format: 'vhdx', type: 'dynamic', size: 64 * GiB, volume: true, fileSystem: 'ReFS', devDrive: true, source: null },
    diff: { type: 'differencing', source: null }
  };
  const PRESET_ICON = { custom: 'tune', portable: 'usb', devdrive: 'code', diff: 'account_tree' };
  function openSheet() {
    if (!VD.available) { notify('vd.needsWindows', 'warn'); return; }
    VD.sheet = { preset: 'custom', format: 'vhdx', type: 'dynamic', size: 64 * GiB, target: null, parent: null, source: null, volume: true, style: 'GPT', fileSystem: 'NTFS', label: '', letter: 'auto', full: false, compress: false, devDrive: false, block: 0, ls: 0, ps: 0, sddl: '', from: document.activeElement };
    drawSheet(); openDialog($('vd-sheet'));
    $('vd-sheet').querySelector('[data-vdp]').focus();
  }
  function closeSheet() { const from = VD.sheet?.from; VD.sheet = null; closeDialog($('vd-sheet'), from); }
  function keepSheet() {
    const s = VD.sheet;
    if ($('vd-s-size')) s.size = readSize('vd-s-size');
    if ($('vd-s-label')) s.label = $('vd-s-label').value;
    if ($('vd-s-letter')) s.letter = $('vd-s-letter').value;
    if ($('vd-s-full')) s.full = $('vd-s-full').checked;
    if ($('vd-s-compress')) s.compress = $('vd-s-compress').checked;
    if ($('vd-s-dev')) s.devDrive = $('vd-s-dev').checked;
    if ($('vd-s-block')) s.block = Number($('vd-s-block').value);
    if ($('vd-s-ls')) s.ls = Number($('vd-s-ls').value);
    if ($('vd-s-ps')) s.ps = Number($('vd-s-ps').value);
    if ($('vd-s-sddl')) s.sddl = $('vd-s-sddl').value;
    if ($('vd-s-adv')) s.adv = $('vd-s-adv').open;
    if ($('vd-s-script')) s.scriptOpen = $('vd-s-script').open;
  }
  function drawSheet() {
    const s = VD.sheet, box = $('vd-sheet'), diff = s.type === 'differencing';
    const sz = nice(s.size || 64 * GiB);
    const sizeOrParent = diff
      ? `<div class="field"><span class="flabel">${label('vd.f.parent')}</span><div class="vd-saveas"><span class="mono">${s.parent ? esc(s.parent.path || s.parent.name) : `<span class="muted">${label('vd.noParentYet')}</span>`}</span><button class="btn text" id="vd-s-parent">${label('vd.browse')}</button></div></div>`
      : `${sizeField('vd-s-size', sz.v, sz.u, 'vd.f.size')}<span class="small muted vd-hint">${label(`vd.limitHint.${s.format}`)}${s.source ? ` ${compose('vd.sourceSize', { n: bytes(s.source.virtualSize), name: s.source.name })}` : ''}</span>`;
    const volume = diff || s.source ? '' : `<div class="vd-box">
        <label class="vd-sw vd-sw-head" for="vd-s-vol"><span><b>${label('vd.prepare')}</b><span class="small muted">${label('vd.prepareD')}</span></span><input type="checkbox" role="switch" class="switch" id="vd-s-vol" ${s.volume ? 'checked' : ''}></label>
        ${s.volume ? `<div class="vd-segs">${seg('vdss', 'vd.f.style', [['GPT', 'vd.gpt'], ['MBR', 'vd.mbr']], s.style)}${seg('vdsfs', 'vd.f.fs', ['NTFS', 'ReFS', 'exFAT', 'FAT32'].map(f => [f, `vd.fs.${f}`]), s.fileSystem)}</div>
        <div class="vd-two"><div class="field"><label for="vd-s-label">${label('vd.f.label')}</label><input id="vd-s-label" maxlength="${s.fileSystem === 'FAT32' || s.fileSystem === 'exFAT' ? 11 : 32}" autocomplete="off" value="${esc(s.label)}"></div>
        <div class="field vd-unit"><label for="vd-s-letter">${label('vd.f.letter')}</label><select id="vd-s-letter"><option value="auto">${esc(t('vd.nextLetter'))}</option><option value="none"${s.letter === 'none' ? ' selected' : ''}>${esc(t('vd.noLetterOpt'))}</option>${'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => `<option${s.letter === l ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="vd-checks">${sw('vd-s-full', 'vd.fullFormat', s.full)}${s.fileSystem === 'NTFS' ? sw('vd-s-compress', 'vd.compress', s.compress) : ''}${s.fileSystem === 'ReFS' ? sw('vd-s-dev', 'vd.devDrive', s.devDrive) : ''}</div>` : ''}</div>`;
    const adv = `<details class="vd-adv fold" id="vd-s-adv"${s.adv ? ' open' : ''}><summary>${icon('tune')}<span>${label('vd.advanced')}</span></summary><div class="vd-adv-body">
        ${s.format === 'vhdx' && !diff ? `<div class="field"><label for="vd-s-block">${label('vd.f.block')}</label><select id="vd-s-block"><option value="0">${esc(t('vd.default'))}</option>${[1, 2, 4, 8, 16, 32, 64, 128, 256].map(n => `<option value="${n * MiB}"${s.block === n * MiB ? ' selected' : ''}>${n} MB</option>`).join('')}</select></div>` : ''}
        ${diff ? '' : `<div class="vd-two"><div class="field"><label for="vd-s-ls">${label('vd.f.logical')}</label><select id="vd-s-ls"><option value="0">${esc(t('vd.default'))}</option><option${s.ls === 512 ? ' selected' : ''}>512</option>${s.format === 'vhd' ? '' : `<option${s.ls === 4096 ? ' selected' : ''}>4096</option>`}</select></div><div class="field vd-unit"><label for="vd-s-ps">${label('vd.f.physical')}</label><select id="vd-s-ps"><option value="0">${esc(t('vd.default'))}</option><option${s.ps === 512 ? ' selected' : ''}>512</option><option${s.ps === 4096 ? ' selected' : ''}>4096</option></select></div></div>
        <div class="field"><span class="flabel">${label('vd.f.source')}</span><div class="vd-saveas"><span class="mono">${s.source ? esc(s.source.name) : `<span class="muted">${label('vd.noSource')}</span>`}</span>${s.source ? `<button class="btn text" id="vd-s-source-x">${label('vd.clear')}</button>` : ''}<button class="btn text" id="vd-s-source">${label('vd.browse')}</button></div><span class="small muted">${label('vd.sourceHint')}</span></div>`}
        <div class="field"><label for="vd-s-sddl">${label('vd.f.sddl')}</label><input id="vd-s-sddl" class="mono" spellcheck="false" autocomplete="off" placeholder="D:P(A;;GA;;;BA)(A;;GA;;;SY)" value="${esc(s.sddl || '')}"><span class="small muted">${label('vd.sddlHint')}</span></div></div></details>`;
    keepFocus(box, () => {
      box.innerHTML = `<div class="vd-sheet-head"><h2 class="h2" id="vd-sheet-h">${label('vd.newTitle')}</h2><button class="icon-btn" id="vd-sheet-x" data-tip="vd.close" aria-label="${esc(t('vd.close'))}">${icon('close')}</button></div>
      <div class="vd-sheet-body">
        <div class="chips" role="group" aria-label="${esc(t('vd.presets'))}">${Object.keys(PRESETS).map(k => `<button class="chip" data-vdp="${k}" aria-pressed="${s.preset === k}">${icon(PRESET_ICON[k])}<span>${label(`vd.p.${k}`)}</span></button>`).join('')}</div>
        <div class="field"><span class="flabel">${label('vd.f.format')}</span>${seg('vdsf', 'vd.f.format', [['vhdx', 'vd.fmt.vhdx'], ['vhd', 'vd.fmt.vhd'], ['vhdset', 'vd.fmt.vhdset']], s.format)}<span class="small muted vd-hint">${label(`vd.fmtHint.${s.format}`)}</span></div>
        <div class="field"><span class="flabel">${label('vd.f.type')}</span>${seg('vdst', 'vd.f.type', [['dynamic', 'vd.type.dynamic'], ['fixed', 'vd.type.fixed'], ['differencing', 'vd.type.differencing']], s.type)}<span class="small muted vd-hint">${label(`vd.typeHint.${s.type}`)}</span></div>
        ${sizeOrParent}
        <div class="field"><span class="flabel">${label('vd.f.saveAs')}</span><div class="vd-saveas"><span class="mono">${s.target ? esc(`${s.target.folder}\\${s.target.name}`) : `<span class="muted">${label('vd.noTarget')}</span>`}</span><button class="btn text" id="vd-s-target">${label('vd.browse')}</button></div>${s.target?.renamed ? `<span class="small muted vd-hint">${label('vd.renamed')}</span>` : ''}</div>
        ${volume}${adv}
        <div class="vd-pre" id="vd-s-pre"></div>
        ${scriptBlock('vd-s-script', 'create', s.scriptOpen)}
        <p class="bad-text small" id="vd-s-err" role="alert"></p>
      </div>
      <div class="vd-sheet-foot"><span class="small muted vd-perm-note">${icon('admin_panel_settings')}<span>${label('vd.permOnce')}</span></span><button class="btn text" id="vd-s-cancel">${label('tools.cancel')}</button><button class="btn fill" id="vd-s-create">${icon('add')}<span>${label('vd.create')}</span></button></div>`;
    });
    wireSheet();
  }
  function sheetArgs() {
    const s = VD.sheet, diff = s.type === 'differencing', withVolume = !diff && !s.source && s.volume;
    return {
      target: s.target?.token, format: s.format, type: s.type, size: diff ? 0 : s.size, parent: diff ? s.parent?.token : undefined, source: diff ? undefined : s.source?.token,
      volume: withVolume ? { style: s.style, fileSystem: s.fileSystem, label: s.label, letter: s.letter, full: s.full, compress: s.fileSystem === 'NTFS' && s.compress, devDrive: s.fileSystem === 'ReFS' && s.devDrive } : null,
      blockSize: s.block || 0, logicalSector: s.ls || 0, physicalSector: s.ps || 0, sddl: (s.sddl || '').trim()
    };
  }
  // Problems that stop Create, worst first, as text keys.
  function sheetProblems() {
    const s = VD.sheet, diff = s.type === 'differencing', out = [];
    if (diff && !s.parent) out.push('vd.err.parent');
    if (!diff) {
      if (!(s.size >= MIN)) out.push('vd.err.min');
      if (s.size > LIMIT[s.format]) out.push(s.format === 'vhd' ? 'vd.err.vhdLimit' : 'vd.err.limit');
      if (s.source && s.size < (s.source.virtualSize || 0)) out.push('vd.err.source');
      if (!s.source && s.volume) {
        if (s.style === 'MBR' && s.size > 2 * TiB) out.push('vd.err.mbr');
        if (s.fileSystem === 'FAT32' && s.size > 32 * GiB) out.push('vd.err.fat32');
        if (s.fileSystem === 'ReFS' && s.devDrive && s.size < 50 * GiB) out.push('vd.err.devDrive');
      }
    }
    if (!s.target) out.push('vd.err.target');
    return out;
  }
  function preflight() {
    const s = VD.sheet, box = $('vd-s-pre'); if (!s || !box) return;
    keepSheet();
    const problems = sheetProblems().filter(k => k !== 'vd.err.target');
    const free = s.target?.free, drive = s.target?.drive || '';
    let kind = 'ok', ic = 'check_circle', html;
    if (problems.length) { kind = 'bad'; ic = 'error'; html = label(problems[0]); }
    else if (s.type === 'differencing') { kind = 'info'; ic = 'info'; html = s.parent ? compose('vd.preDiff', { parent: s.parent.name }) : label('vd.preDiffNone'); }
    else if (free == null) { kind = 'info'; ic = 'info'; html = compose(s.type === 'fixed' ? 'vd.preFixedNoTarget' : 'vd.preDynamicNoTarget', { n: bytes(s.size) }); }
    else if (s.type === 'fixed') { if (s.size > free) { kind = 'bad'; ic = 'error'; } html = compose(s.size > free ? 'vd.preFixedShort' : 'vd.preFixed', { drive, free: bytes(free), n: bytes(s.size) }); }
    else { if (s.size > free) { kind = 'warn'; ic = 'warning'; } html = compose(s.size > free ? 'vd.preDynamicShort' : 'vd.preDynamic', { drive, free: bytes(free), n: bytes(s.size) }); }
    box.className = `vd-pre ${kind}`;
    box.innerHTML = `${icon(ic, true)}<div><b>${label(`vd.pre.${kind}`)}</b><span class="small">${html}</span></div>`;
    s.blocked = kind === 'bad';
    const det = $('vd-s-script'); if (det?.open) det.paint?.();
  }
  function wireSheet() {
    const s = VD.sheet, box = $('vd-sheet');
    for (const b of box.querySelectorAll('[data-vdp]')) b.onclick = () => {
      keepSheet();
      const p = PRESETS[b.dataset.vdp];
      Object.assign(s, { preset: b.dataset.vdp }, p);
      if (s.type === 'differencing' && s.format === 'vhdset') s.format = 'vhdx';
      if (s.target && !s.target.name.toLowerCase().endsWith(`.${s.format === 'vhdset' ? 'vhds' : s.format}`)) s.target = null;
      drawSheet();
    };
    wireSeg(box, 'vdsf', v => {
      keepSheet();
      if (s.type === 'differencing' && s.parent && v !== s.parent.format) { notify('vd.fmtFromParent', 'info'); drawSheet(); return; }
      s.format = v; s.preset = 'custom';
      if (v === 'vhdset' && s.type === 'differencing') s.type = 'dynamic';
      if (v === 'vhd' && s.ls === 4096) s.ls = 0;
      if (s.target) { s.target = null; notify('vd.chooseAgain', 'info'); }
      drawSheet();
    });
    wireSeg(box, 'vdst', v => { keepSheet(); s.type = v; s.preset = v === 'differencing' ? 'diff' : 'custom'; if (v === 'differencing' && s.format === 'vhdset') { s.format = 'vhdx'; s.target = null; } drawSheet(); });
    wireSeg(box, 'vdss', v => { s.style = v; preflight(); });
    wireSeg(box, 'vdsfs', v => { keepSheet(); s.fileSystem = v; if (v !== 'ReFS') s.devDrive = false; drawSheet(); });
    $('vd-s-vol')?.addEventListener('change', e => { keepSheet(); s.volume = e.target.checked; drawSheet(); });
    $('vd-s-dev')?.addEventListener('change', preflight);
    for (const id of ['vd-s-size', 'vd-s-sddl', 'vd-s-label']) $(id)?.addEventListener('input', preflight);
    for (const id of ['vd-s-size-u', 'vd-s-letter', 'vd-s-block', 'vd-s-ls', 'vd-s-ps', 'vd-s-full', 'vd-s-compress']) $(id)?.addEventListener('change', preflight);
    const choose = async (setter) => { const p = await vd.pickParent(); if (p) { keepSheet(); setter(p); drawSheet(); } };
    $('vd-s-parent') && ($('vd-s-parent').onclick = () => choose(p => {
      if (!['vhd', 'vhdx'].includes(p.format)) { notify('vd.err.parentKind', 'warn'); return; }
      s.parent = p; if (s.format !== p.format) { s.format = p.format; s.target = null; }
    }));
    $('vd-s-source') && ($('vd-s-source').onclick = () => choose(p => { s.source = p; if ((p.virtualSize || 0) > s.size) s.size = p.virtualSize; }));
    $('vd-s-source-x') && ($('vd-s-source-x').onclick = () => { keepSheet(); s.source = null; drawSheet(); });
    $('vd-s-target').onclick = async () => {
      keepSheet();
      const r = await vd.chooseSave({ format: s.format, name: s.label || (s.parent ? `${s.parent.name.replace(/\.[^.]+$/, '')} child` : 'Disk') });
      if (r) { s.target = r; drawSheet(); $('vd-s-target').focus(); }
    };
    $('vd-sheet-x').onclick = closeSheet; $('vd-s-cancel').onclick = closeSheet;
    box.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); } };
    wireScript($('vd-s-script'), null, () => { keepSheet(); return sheetArgs(); });
    $('vd-s-create').onclick = () => {
      keepSheet(); preflight();
      const problems = sheetProblems();
      if (problems.length || s.blocked) {
        $('vd-s-err').innerHTML = problems.length ? label(problems[0]) : $('vd-s-pre').querySelector('.small').innerHTML;
        $('vd-s-err').scrollIntoView({ block: 'nearest' });
        if (problems[0] === 'vd.err.target') $('vd-s-target').focus();
        return;
      }
      const args = sheetArgs(), name = s.target.name;
      closeSheet();
      runOp('create', args, name);
    };
    preflight();
  }

  // ---------- Quick pack ----------
  function renderPack() {
    const o = VD.pack.opts, busy = !!VD.pack.job, dis = busy ? 'disabled' : '';
    const opts = $('vd-pack-opts');
    keepFocus(opts, () => {
      opts.innerHTML = `<div class="field"><span class="flabel">${label('vd.f.type')}</span>${seg('vdpt', 'vd.f.type', [['dynamic', 'vd.type.dynamic'], ['fixed', 'vd.type.fixed']], o.fixed ? 'fixed' : 'dynamic', dis)}</div>
        <div class="field vd-fs"><label for="vd-p-fs">${label('vd.f.fs')}</label><select id="vd-p-fs" ${dis}>${['NTFS', 'exFAT', 'ReFS'].map(f => `<option${o.fileSystem === f ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="vd-checks">${sw('vd-p-acl', 'vd.keepAcl', o.keepAcl, dis)}${sw('vd-p-tight', 'vd.tight', o.tight, dis)}</div>`;
    });
    wireSeg(opts, 'vdpt', v => { o.fixed = v === 'fixed'; });
    $('vd-p-fs').onchange = e => { o.fileSystem = e.target.value; };
    $('vd-p-acl').onchange = e => { o.keepAcl = e.target.checked; };
    $('vd-p-tight').onchange = e => { o.tight = e.target.checked; };
    for (const id of ['vd-pick-files', 'vd-pick-folder']) $(id).disabled = busy || !VD.available;
    drawPackBody();
  }
  function drawPackBody() {
    const body = $('vd-pack-body'), p = VD.pack;
    if (p.job) { drawPackJob(); return; }
    const r = p.result;
    if (!r) { body.innerHTML = ''; return; }
    if (r.ok) {
      const g = r.grows || [];
      const grew = !g.length ? label('vd.grewNo') : compose(g.length === 1 ? 'vd.grewOnce' : 'vd.grewMany', { n: g.length, from: bytes(g[0].from), to: bytes(g[g.length - 1].to) });
      const name = r.entry?.name || '', wanted = r.plan?.wanted;
      keepFocus(body, () => {
        body.innerHTML = `<div class="vd-done"><div class="vd-done-head"><span class="vd-ic ok">${icon('task_alt', true)}</span><div><b class="mono">${esc(name)}</b><div class="small muted">${compose('vd.beside', { folder: r.entry?.folder || '' })}</div></div></div>
          <dl class="vd-dl">
            <dt>${label('vd.k.files')}</dt><dd>${compose('vd.filesChecked', { n: Number(r.files).toLocaleString('en') })}</dd>
            <dt>${label('vd.k.size')}</dt><dd>${esc(bytes(r.virtualSize))}</dd>
            <dt>${label('vd.k.onDisk')}</dt><dd>${esc(bytes(r.fileSize))}</dd>
            <dt>${label('vd.k.grew')}</dt><dd>${grew}</dd>
            ${wanted && name && wanted.toLowerCase() !== name.toLowerCase() ? `<dt>${label('vd.k.name')}</dt><dd>${compose('vd.nameFree', { name, wanted })}</dd>` : ''}
            ${r.partial ? `<dt>${label('vd.k.skipped')}</dt><dd class="bad-text">${compose('vd.skippedN', { n: r.skipped.length })} <span class="mono small">${esc(r.skipped.slice(0, 6).map(x => x.path).join(', '))}${r.skipped.length > 6 ? ' …' : ''}</span></dd>` : ''}
          </dl>
          <div class="row">${btn('tonal', 'vd-pr-show', 'folder_open', 'tools.res.show')}${btn('outline', 'vd-pr-attach', 'link', 'vd.attachNow')}${btn('text', 'vd-pr-clear', '', 'vd.packAnother')}</div></div>`;
      });
      $('vd-pr-show').onclick = () => vd.reveal(r.entry.token);
      $('vd-pr-attach').onclick = async () => { await inspect(r.entry.token); askAttach(VD.view); };
    } else {
      const key = { cancelled: 'vd.packCancelled', declined: 'vd.declinedLong', space: 'vd.packSpace', limit: 'vd.packLimit', exists: 'vd.packExists' }[r.code] || 'vd.packFailed';
      keepFocus(body, () => {
        body.innerHTML = `<div class="vd-done bad"><div class="vd-done-head"><span class="vd-ic">${icon(r.code === 'cancelled' ? 'block' : r.code === 'declined' ? 'gpp_bad' : 'error', true)}</span><div><b>${label(key)}</b>${r.code === 'cancelled' || r.code === 'declined' ? '' : `<div class="small">${esc(r.message || r.code)}</div>`}<div class="small">${label(r.code === 'declined' ? 'vd.nothingChanged' : 'vd.packRemoved')}</div></div></div><div class="row">${btn('text', 'vd-pr-clear', '', 'vd.packAnother')}</div></div>`;
      });
    }
    $('vd-pr-clear').onclick = () => { p.result = null; drawPackBody(); $('vd-pick-files').focus(); };
  }
  async function planFrom(items) {
    if (!VD.available) { notify('vd.needsWindows', 'warn'); return; }
    if (VD.pack.job || VD.job) { notify('vd.busy', 'info'); return; }
    if (!items?.length) return;
    let plan;
    try { plan = await vd.plan(items, VD.pack.opts); } catch (e) { plan = { ok: false, message: e.message }; }
    if (!plan?.ok) { notify('vd.err.items', 'warn'); return; }
    startPack(plan);
  }
  async function startPack(plan) {
    const p = VD.pack, o = { ...p.opts };
    p.job = { plan, opts: o, id: null, step: 'permission', pct: 0, steps: {}, grows: [], paused: false };
    p.result = null; renderPack();
    $('vd-pack').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    announce(say('vd.packStarted', { name: plan.name, folder: plan.folder }));
    let r;
    try { r = await vd.run('pack', { plan: plan.token, fileSystem: o.fileSystem, fixed: o.fixed, keepAcl: o.keepAcl, tight: o.tight }); } catch (e) { r = { ok: false, code: 'failed', message: e.message }; }
    p.job = null; p.result = { ...r, plan };
    renderPack();
    if (r.ok) { notify(say('vd.done.pack', { name: r.entry?.name || plan.name, folder: plan.folder }), 'ok'); sound('tap'); $('vd-pr-show')?.focus(); }
    else { report('pack', r, plan.name); $('vd-pr-clear')?.focus(); }
    load();
  }
  const packSteps = j => ['measure', 'create', 'format', 'copy', ...(j.opts.tight ? ['fit'] : []), 'detach'];
  function packProgress(e, pct) {
    const j = VD.pack.job;
    const first = !j.id;
    j.id = e.id;
    if (e.step === 'grow') { j.grows.push({ from: e.from, to: e.to, file: e.file }); announce(say('vd.grewLine', { from: bytes(e.from), to: bytes(e.to), file: e.file || '' })); }
    else if (e.step === 'paused' || e.step === 'resumed') j.paused = e.step === 'paused';
    else if (e.step === 'start') j.step = 'measure';
    else if (e.step !== 'permission') { j.step = e.step; j.steps[e.step] = e; if (e.step === 'copy') j.pct = pct; }
    if (!first && e.step === 'copy' && $('vd-pack-prog') && $('vd-step-copy')?.classList.contains('now')) { paintPack(); return; }
    drawPackJob();
  }
  function paintPack() {
    const j = VD.pack.job, bar = $('vd-pack-prog'); if (!j || !bar) return;
    bar.firstElementChild.style.transform = `scaleX(${j.pct / 100})`; bar.setAttribute('aria-valuenow', String(j.pct));
    const e = j.steps.copy, line = $('vd-step-copy');
    if (line && e?.count) { line.querySelector('.t').innerHTML = compose('vd.s.copying', { i: Number(e.index).toLocaleString('en'), n: Number(e.count).toLocaleString('en') }); line.querySelector('.vd-step-v').textContent = `${j.pct}%`; }
  }
  function drawPackJob() {
    const j = VD.pack.job, body = $('vd-pack-body'), steps = packSteps(j), at = steps.indexOf(j.step);
    const m = j.steps.measure, size = j.grows.length ? j.grows[j.grows.length - 1].to : j.plan.size;
    // Steps read as what will happen, and as what happened once done.
    const text = (s, done) => ({
      measure: m?.files != null ? compose('vd.s.measured', { files: Number(m.files).toLocaleString('en'), folders: Number(m.folders).toLocaleString('en') }) : label('vd.s.measure'),
      create: compose(`vd.s.${done ? 'created' : 'create'}${j.opts.fixed ? 'Fixed' : 'Dynamic'}`, { name: j.plan.name }),
      format: compose(done ? 'vd.s.formatted' : 'vd.s.format', { fs: j.opts.fileSystem, label: j.plan.name.replace(/\.vhdx$/i, '') }),
      copy: done ? compose('vd.s.copied', { n: Number(j.steps.copy?.count || m?.files || 0).toLocaleString('en') }) : j.steps.copy?.count ? compose('vd.s.copying', { i: Number(j.steps.copy.index).toLocaleString('en'), n: Number(j.steps.copy.count).toLocaleString('en') }) : label('vd.s.copy'),
      fit: label(done ? 'vd.s.fitted' : 'vd.s.fit'),
      detach: label(done ? 'vd.s.detached' : 'vd.s.detach')
    })[s];
    const value = s => ({ measure: m?.total != null ? bytes(m.total) : '', create: bytes(size), format: 'GPT', copy: j.step === 'copy' ? `${j.pct}%` : '' })[s] || '';
    const line = (s, n) => {
      const state = at < 0 ? 'wait' : n < at || (s === 'detach' && j.steps.detach) ? 'done' : n === at ? 'now' : 'wait';
      return `<li class="vd-step ${state}" id="vd-step-${s}">${icon(state === 'done' ? 'check_circle' : state === 'now' ? 'progress_activity' : 'radio_button_unchecked', state === 'done', state === 'now' ? 'vd-spin' : '')}<span class="t">${text(s, state === 'done')}</span><span class="vd-step-v mono small">${esc(value(s))}</span><span class="sr-only">${label(`vd.state.${state}`)}</span></li>`;
    };
    keepFocus(body, () => {
      body.innerHTML = `${j.step === 'permission' ? permBanner() : ''}<ol class="vd-steps">${steps.map(line).join('')}</ol>
        <div class="zprog" id="vd-pack-prog" role="progressbar" aria-label="${esc(t('vd.pack.title'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${j.pct}"><div class="zprog-bar"></div></div>
        ${j.grows.length ? `<div class="vd-grow">${icon('open_in_full', true)}<div><b>${label('vd.grew')}</b><span class="small">${compose('vd.grewLine', { from: bytes(j.grows[0].from), to: bytes(j.grows[j.grows.length - 1].to), file: j.grows[j.grows.length - 1].file || '' })}</span></div></div>` : ''}
        ${j.paused ? `<p class="small muted vd-flag">${icon('pause_circle')}<span>${label('tools.paused')}</span></p>` : ''}
        <div class="row">${btn('tonal', 'vd-pack-pause', j.paused ? 'play_arrow' : 'pause', j.paused ? 'tools.resume' : 'tools.pause', j.id && j.step === 'copy' ? '' : 'disabled')}${btn('text', 'vd-pack-cancel', '', 'tools.cancel', j.id ? '' : 'disabled')}</div>`;
    });
    paintPack();
    $('vd-pack-pause').onclick = () => { j.paused = !j.paused; vd.pause(j.id, j.paused); drawPackJob(); };
    $('vd-pack-cancel').onclick = () => { $('vd-pack-cancel').disabled = true; vd.cancel(j.id); };
  }

  // ---------- wiring ----------
  makeSearch('vd-search', 'vd.search', () => renderList());
  $('vd-new').onclick = openSheet;
  const openFiles = async () => { const added = await vd?.open(); if (added?.length) { await load(); inspect(added[0].token); } };
  $('vd-open').onclick = openFiles;
  $('vd-refresh').onclick = () => load();
  const focusPack = () => { $('vd-pack').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); $('vd-pick-files').focus({ preventScroll: true }); };
  $('vd-packgo').onclick = focusPack;
  $('vd-pick-files').onclick = async () => planFrom(await vd?.pickItems(false));
  $('vd-pick-folder').onclick = async () => planFrom(await vd?.pickItems(true));
  window.vdOpenSheet = openSheet; window.vdFocusPack = focusPack; window.vdOpenFiles = openFiles;
  $('scrim').addEventListener('click', () => { if (!$('vd-ask').hidden && $('confirm').hidden) closeDialog($('vd-ask'), askFrom); });
  // Disks attached or removed elsewhere show up when the window comes back, at most every 15 s.
  window.addEventListener('focus', () => { if (!panel.hidden && !VD.job && !VD.pack.job && Date.now() - VD.lastLoad > 15000) load(); });

  const hasFiles = e => [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file');
  const zone = $('vd-zone');
  let depth = 0;
  const over = (on, n = 0) => {
    zone.classList.toggle('over', on);
    $('vd-zone-t').innerHTML = on ? compose(n === 1 ? 'vd.pack.releaseOne' : 'vd.pack.release', { n }) : label('vd.pack.zone');
    $('vd-zone-d').innerHTML = label(on ? 'vd.pack.releaseSub' : 'vd.pack.zoneSub');
    if (on) clearDropHint();
  };
  zone.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); if (depth++ === 0) over(true, e.dataTransfer.items.length); });
  zone.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = VD.pack.job || !VD.available ? 'none' : 'copy'; clearDropHint(); });
  zone.addEventListener('dragleave', e => { e.stopPropagation(); if (depth && --depth === 0) over(false); });
  zone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); depth = 0; over(false); planFrom([...(e.dataTransfer?.files || [])]); });
  // Disk files dropped anywhere else on this screen join the library.
  panel.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); clearDropHint(); });
  panel.addEventListener('drop', async e => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    const disks = files.filter(f => DISK_FILE.test(f.name));
    if (!disks.length) { notify('vd.dropHint', 'info'); return; }
    const added = await vd?.add(disks);
    if (added?.length) { notify(say('vd.added', { n: added.length }), 'ok'); await load(); inspect(added[0].token); }
  });
  render();
})();
