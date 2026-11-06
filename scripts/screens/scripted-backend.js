'use strict';
(() => {
const q = new URLSearchParams(location.search), state = q.get('state') || 'ready', view = q.get('view');
try {
  localStorage.clear();
  localStorage.setItem('tad.onboarded', JSON.stringify(state !== 'onboarding'));
  const s = JSON.parse(q.get('settings') || '{}'); localStorage.setItem('tad.settings', JSON.stringify(s));
  const now = Date.now(), iso = d => new Date(now - d).toISOString();
  localStorage.setItem('tad.sessions', JSON.stringify([
    { id: 'a', name: 'notes-app', file: 'C:\\Projects\\notes-app\\Dockerfile', kind: 'dockerfile', port: '3000', outcome: 'shared', publicUrl: 'https://quiet-river-maple.trycloudflare.com', startedAt: iso(9e5), liveAt: iso(8.4e5), endedAt: iso(1e5), steps: [], messages: {}, reachedLive: true },
    { id: 'b', name: 'shop-stack', file: 'C:\\Projects\\shop-stack\\compose.yaml', kind: 'compose', service: 'web', port: '8080', outcome: 'shared', publicUrl: 'https://dawn-cedar-loop.trycloudflare.com', startedAt: iso(9e7), liveAt: iso(8.9e7), endedAt: iso(8.5e7), steps: [], messages: {}, reachedLive: true },
    { id: 'c', name: 'notes-app', file: 'C:\\Projects\\notes-app\\Dockerfile', kind: 'dockerfile', port: '3000', outcome: 'failed', error: 'HTTP readiness timed out', startedAt: iso(2e6), endedAt: iso(1.9e6), steps: [], messages: {} },
    { id: 'd', name: 'blog', file: 'C:\\Projects\\blog\\docker-compose.yml', kind: 'compose', service: 'app', outcome: 'cancelled', startedAt: iso(3e8), endedAt: iso(3e8), steps: [], messages: {} }]));
  if (q.get('notifs')) localStorage.setItem('tad.notifications', JSON.stringify([
    { id: '1', at: iso(2e4), kind: 'ok', text: 'Your app is live and reachable over HTTPS.', read: false },
    { id: '2', at: iso(1e4), kind: 'ok', text: 'Link copied. Paste it anywhere.', read: false },
    { id: '3', at: iso(9e5), kind: 'error', text: 'Hosting failed. The message on Host says why.', read: true }]));
} catch {}
const statuses = {
  ready: { phase: 'idle' }, onboarding: { phase: 'idle' },
  building: { phase: 'building', message: 'Step 4/7 : RUN npm ci' },
  live: { phase: 'ready', verified: true, publicUrl: 'https://quiet-river-maple.trycloudflare.com', localUrl: 'http://127.0.0.1:49213' },
  failed: { phase: 'error', error: 'HTTP readiness timed out' }
};
let listener;
window.tunnel = {
  prerequisites: async () => ({ docker: true, compose: true, cloudflared: false, cloudflaredDownloadAvailable: true, missing: [] }),
  status: async () => state === 'live' && !window.__screens?.picked ? statuses.ready : statuses[state] || statuses.ready,
  select: async kind => (window.__screens.picked = true, { source: kind === 'compose' ? { kind, composePath: 'C:\\Projects\\shop-stack\\compose.yaml' } : { kind, dockerfilePath: 'C:\\Projects\\notes-app\\Dockerfile', contextPath: 'C:\\Projects\\notes-app' }, inspection: kind === 'compose' ? { services: ['web', 'db'], service: 'web', containerPort: 8080 } : { containerPort: 3000 } }),
  host: () => new Promise((_res, rej) => { window.__screens.fail = rej; }), stop: async () => ({ phase: 'idle' }), copy: async () => true, open: async () => true,
  info: async () => ({ version: '0.2.0', buildTime: '2026-11-06T20:58:21Z', commit: '205a6caafcebb3763ebc39a7faa2248314b828a4' }),
  copyText: async () => true, editors: async () => [{ name: 'Visual Studio Code' }], openProject: async () => true, setTitle: async () => true, openLink: async () => true, save: async () => true,
  onProgress: cb => { listener = cb; return () => {}; }
};
window.__screens = { state, view, listener: () => listener };
})();
if (!new URLSearchParams(location.search).get('dimsum')) Math.random = () => 0.5;
