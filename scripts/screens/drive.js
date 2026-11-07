'use strict';
window.addEventListener('load', () => setTimeout(async () => {
  try {
  const q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
  const v = q.get('view'); if (v) document.querySelector(`.dest[data-view="${v}"]`)?.click();
  const state = q.get('state'), emit = e => window.__screens.listener()?.(e);
  if (state === 'live') { $('choose').click(); await new Promise(r => setTimeout(r, 2300)); }
  if (state === 'building' || state === 'failed') {
    $('choose').click(); await new Promise(r => setTimeout(r, 200)); $('host-btn').click(); await new Promise(r => setTimeout(r, 50));
    emit({ phase: 'validating', message: 'Validating source' });
    emit({ phase: 'preparing', message: 'Preparing verified cloudflared executable' });
    emit({ phase: 'building', message: 'Step 4/7 : RUN npm ci' });
    if (state === 'failed') { emit({ phase: 'starting', message: 'Starting application' }); emit({ phase: 'checking', message: 'Waiting for application HTTP readiness', localUrl: 'http://127.0.0.1:49213' }); emit({ phase: 'stopping', message: 'Cleaning up failed hosting session' }); emit({ phase: 'error', message: 'HTTP readiness timed out', error: 'HTTP readiness timed out' }); window.__screens.fail?.(new Error('HTTP readiness timed out')); }
  }
  const act = q.get('act');
  const group = q.get('group'); if (group) { document.querySelector(`[data-g="${group}"]`)?.click(); await new Promise(r => setTimeout(r, 150)); }
  const tick = () => new Promise(r => setTimeout(r, 120));
  if (act === 'b64') { $('b64-in').value = 'Docker compose up --build'; $('b64-in').dispatchEvent(new Event('input')); await tick(); }
  if (act === 'b64drop' || act === 'b64work') {
    const drop = (mode, names) => { const dt = new DataTransfer(); for (const n of names) dt.items.add(new File([new Uint8Array(n === 'report.pdf' ? 4096 : 512)], n)); $(`b64-zone-${mode}`).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); };
    if (act === 'b64drop') { drop('decode', ['photo.txt', 'notes.txt']); await new Promise(r => setTimeout(r, 120)); drop('encode', ['report.pdf']); await new Promise(r => setTimeout(r, 160)); }
    else { drop('encode', ['report.pdf', 'archive.zip', 'video.mp4']); await new Promise(r => setTimeout(r, 120)); }
    $('b64-beside').scrollIntoView({ block: 'end' });
  }
  if (act?.startsWith('vd')) {
    document.querySelector('[data-tool="vdisk"]').click(); await new Promise(r => setTimeout(r, 200));
    if (act === 'vd') { document.querySelector('[data-vdi="photos"]')?.click(); await new Promise(r => setTimeout(r, 120)); $('vd-more')?.click(); await new Promise(r => setTimeout(r, 120)); }
    if (act === 'vdnew') { $('vd-new').click(); await tick(); $('vd-s-target').click(); await new Promise(r => setTimeout(r, 120)); }
    if (act === 'vdpack') {
      const dt = new DataTransfer(); for (const n of ['IMG_2201.jpg', 'IMG_2202.jpg', 'itinerary.pdf']) dt.items.add(new File([new Uint8Array(64)], n));
      $('vd-zone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 250)); $('vd-pack').scrollIntoView({ block: 'end' });
    }
  }
  if (act === 'conv') { document.querySelector('[data-tool="conv"]').click(); $('conv-in').value = '[\n  {"service": "web", "port": 3000},\n  {"service": "db", "port": 5432}\n]'; $('conv-in').dispatchEvent(new Event('input')); }
  if (act === 'lang' || act === 'sched' || act === 'ctxset') { const g = act === 'sched' ? 'schedules' : act === 'lang' ? 'language' : 'motion'; document.querySelector('[data-g="' + g + '"]').click(); await tick(); }
  if (act === 'ctxset') { const row = document.querySelector('.item[data-key="sounds"]'); const r = row.getBoundingClientRect(); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 200, clientY: r.top + 20 })); }
  if (act === 'auth') { document.querySelector('[data-tool="auth"]').click(); await new Promise(r => setTimeout(r, 600)); }
  if (act === 'tabs') { document.querySelector('#tabstrip [data-tab="t2"]')?.click(); await tick(); $('newtab').click(); const f = document.querySelector('#ctx-filter input'); if (f) { f.value = 'a'; f.dispatchEvent(new Event('input')); } }
  if (act === 'chart') { $('sessions-fold').open = true; }
  if (act === 'authadd') { document.querySelector('[data-tool="auth"]').click(); await tick(); $('auth-add').click(); }
  if (act === 'authbad') { document.querySelector('[data-tool="auth"]').click(); await tick(); $('auth-add').click(); $('auth-secret').value = 'not base32!'; $('auth-form').requestSubmit(); }
  if (act === 'pin') { document.querySelector('[data-g="language"]').click(); await tick(); document.querySelector('[data-key="school"] input, [data-key="school"] .switch')?.click(); }
  if (act === 'toast') { $('copy-btn')?.click(); }
  if (act === 'export') { $('sessions-export-btn').click(); }
  if (act === 'newtab') { $('newtab')?.click(); }
  if (act === 'picked') $('choose').click();
  if (act === 'palette') { $('open-palette').click(); const i = $('palette-input'); i.value = q.get('q') || ''; i.dispatchEvent(new Event('input')); }
  if (act === 'notifs') $('bell').click();
  if (act === 'confirm') { $('stop-btn').click(); $('key1').click(); }
  if (act === 'article') document.querySelector('#view-guide [data-article="safety"]')?.click();
  if (act === 'rx') { const box = document.querySelector('#view-settings .search-box'); box.querySelector('.rx-toggle').click(); const i = box.querySelector('input'); i.value = '^(motion|theme)'; i.dispatchEvent(new Event('input')); }
  if (act === 'ctx') { const el = $('public-url'); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 400 })); }
  if (act === 'schedadd') document.querySelector('[data-act="sched-add"]')?.click();
  } finally { await new Promise(r => setTimeout(r, 150)); window.__screens.done = true; }
}, 300));
