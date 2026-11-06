'use strict';
window.addEventListener('load', () => setTimeout(async () => {
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
  const tick = () => new Promise(r => setTimeout(r, 120));
  if (act === 'b64') { $('b64-in').value = 'Docker compose up --build'; $('b64-in').dispatchEvent(new Event('input')); await tick(); }
  if (act === 'conv') { document.querySelector('[data-tool="conv"]').click(); $('conv-in').value = '[\n  {"service": "web", "port": 3000},\n  {"service": "db", "port": 5432}\n]'; $('conv-in').dispatchEvent(new Event('input')); }
  if (act === 'lang' || act === 'sched' || act === 'ctxset') { const g = act === 'sched' ? 'schedules' : act === 'lang' ? 'language' : 'motion'; document.querySelector('[data-g="' + g + '"]').click(); await tick(); }
  if (act === 'ctxset') { const row = document.querySelector('.item[data-key="sounds"]'); const r = row.getBoundingClientRect(); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 200, clientY: r.top + 20 })); }
  if (act === 'picked') $('choose').click();
  if (act === 'palette') { $('open-palette').click(); const i = $('palette-input'); i.value = q.get('q') || ''; i.dispatchEvent(new Event('input')); }
  if (act === 'notifs') $('bell').click();
  if (act === 'confirm') { $('stop-btn').click(); $('key1').click(); }
  if (act === 'article') document.querySelector('#view-guide [data-article="safety"]')?.click();
  if (act === 'rx') { const box = document.querySelector('#view-settings .search-box'); box.querySelector('.rx-toggle').click(); const i = box.querySelector('input'); i.value = '^(motion|theme)'; i.dispatchEvent(new Event('input')); }
  if (act === 'ctx') { const el = $('public-url'); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 400 })); }
}, 300));
