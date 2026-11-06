'use strict';
const $ = id => document.getElementById(id);
const api = window.tunnel;
let kind = 'dockerfile', selected = false, busy = false, live = false, stopping = false, active = false;
let requirements = null, pollPending = false;
const announce = message => { $('announcement').textContent = message; };
const error = value => { $('error').hidden = !value; $('error').textContent = value?.message || value || ''; };
const phaseNames = { idle: 'Not sharing', pending: 'Starting', inspecting: 'Inspecting project', building: 'Building app', starting: 'Starting app', health: 'Checking app', tunneling: 'Opening tunnel', verifying: 'Verifying link', ready: 'Sharing live', stopping: 'Stopping', error: 'Needs attention', recovering: 'Reconnecting', validating: 'Checking project', preparing: 'Preparing tunnel', waiting: 'Checking app' };
function controls() {
  const locked = busy || live || active || stopping;
  for (const id of ['choose', 'dockerfile', 'compose', 'service', 'port']) $(id).disabled = locked;
  $('host').disabled = locked || !selected || !requirements?.docker || !(requirements?.cloudflared || requirements?.cloudflaredDownloadAvailable) || (kind === 'compose' && !requirements?.compose);
  $('stop').hidden = !(busy || live || active || stopping);
  $('stop').disabled = stopping;
  $('stop').textContent = stopping ? 'Stopping…' : busy ? 'Cancel hosting' : 'Stop sharing';
  $('copy').disabled = $('open').disabled = !live || stopping;
}
function renderStatus(status) {
  active = !!status.phase && !['idle', 'error'].includes(status.phase);
  live = status.phase === 'ready' && status.verified === true && !!status.publicUrl;
  $('status').classList.toggle('live', live);
  $('status-text').textContent = phaseNames[status.phase] || (busy ? 'Starting' : 'Not sharing');
  $('live-state').hidden = !live;
  $('empty-state').hidden = live || busy || active;
  $('public-url').textContent = live ? status.publicUrl : '';
  $('progress-area').hidden = live || !(busy || active);
  if (live) { error(null); announce('Your app is ready to share.'); }
  if (status.error) error(status.error);
  if (status.phase === 'error') { $('empty-title').textContent = 'Sharing stopped'; $('empty-description').textContent = 'Review the message below, then try again.'; }
  else if (!busy && !live) { $('empty-title').textContent = 'Ready when you are'; $('empty-description').textContent = 'Choose a project, then host it. Your link appears after the app is reachable.'; }
  controls();
}
async function refreshStatus() {
  if (pollPending) return;
  pollPending = true;
  try { renderStatus(await api.status()); } catch (cause) { live = false; $('public-url').textContent = ''; $('live-state').hidden = true; error(cause); controls(); }
  finally { pollPending = false; }
}
async function checkRequirements() {
  $('recheck').disabled = true;
  try {
    requirements = await api.prerequisites();
    const checks = [['docker-check', 'Docker', requirements.docker], ['tunnel-check', 'cloudflared', requirements.cloudflared]];
    for (const [id, label, ok] of checks) { $(id).textContent = `${ok ? '✓' : '○'} ${label} · ${ok ? 'ready' : 'unavailable'}`; $(id).className = `check ${ok ? 'ok' : 'missing'}`; }
    if (!requirements.cloudflared && requirements.cloudflaredDownloadAvailable) { $('tunnel-check').textContent = '↓ cloudflared · downloads on first host'; $('tunnel-check').className = 'check'; }
    const missing = [...(requirements.missing || [])];
    if (!requirements.compose && kind === 'compose' && !missing.some(item => /compose/i.test(item))) missing.push('Docker Compose is required for this project.');
    $('requirement-detail').textContent = missing.join('\n');
    $('requirement-detail').hidden = !missing.length;
  } catch (cause) { requirements = null; error(cause); for (const id of ['docker-check', 'tunnel-check']) { $(id).textContent = 'Check unavailable'; $(id).className = 'check missing'; } }
  finally { $('recheck').disabled = false; controls(); }
}
function setKind(next) {
  if (kind === next) return;
  kind = next; selected = false;
  $('dockerfile').setAttribute('aria-pressed', String(kind === 'dockerfile'));
  $('compose').setAttribute('aria-pressed', String(kind === 'compose'));
  $('file-name').textContent = kind === 'compose' ? 'Choose a Compose file' : 'Choose a Dockerfile';
  $('file-path').textContent = 'Browse your local files'; $('options').hidden = true;
  $('context-note').textContent = kind === 'compose' ? 'Select the service you want to share after choosing your file.' : 'The Dockerfile’s folder is used as the build context.';
  controls();
}
$('dockerfile').addEventListener('click', () => setKind('dockerfile'));
$('compose').addEventListener('click', () => setKind('compose'));
$('choose').addEventListener('click', async () => {
  $('choose').disabled = true; error(null);
  try {
    const result = await api.select(kind);
    if (!result) return;
    selected = true;
    const file = result.source.composePath || result.source.dockerfilePath;
    $('file-name').textContent = file.split(/[\\/]/).pop(); $('file-path').textContent = file;
    $('options').hidden = false; $('service-field').hidden = kind !== 'compose';
    const info = result.inspection || {};
    $('service').replaceChildren(new Option('Auto-select when unambiguous', ''));
    for (const service of info.services || []) $('service').add(new Option(service, service));
    $('service').value = info.service || '';
    $('port').value = info.containerPort || '';
    $('port-hint').textContent = info.needsPort ? 'Enter the HTTP port your app listens on inside the container.' : 'The HTTP port inside your container, such as 3000 or 8080.';
  } catch (cause) { selected = false; error(cause); }
  finally { controls(); }
});
$('host').addEventListener('click', async () => {
  if (!$('port').checkValidity()) { $('port').reportValidity(); return; }
  busy = true; error(null); $('progress-list').replaceChildren();
  renderStatus({ phase: 'pending' });
  try { await api.host({ service: kind === 'compose' ? $('service').value : '', containerPort: $('port').value }); }
  catch (cause) { if (!stopping) error(cause); }
  finally { busy = false; await refreshStatus(); controls(); }
});
$('stop').addEventListener('click', async () => {
  stopping = true; controls();
  try { await api.stop(); error(null); announce('Sharing stopped.'); }
  catch (cause) { error(cause); }
  finally { stopping = false; busy = false; await refreshStatus(); }
});
$('copy').addEventListener('click', async () => {
  try { await api.copy(); $('copy').textContent = 'Copied ✓'; announce('Link copied to clipboard.'); setTimeout(() => { $('copy').textContent = 'Copy link'; }, 1800); }
  catch (cause) { error(cause); await refreshStatus(); }
});
$('open').addEventListener('click', async () => { try { await api.open(); } catch (cause) { error(cause); await refreshStatus(); } });
$('recheck').addEventListener('click', checkRequirements);
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}
try { applyTheme(localStorage.getItem('theme') || 'dark'); } catch { applyTheme('dark'); }
$('theme').addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(theme); try { localStorage.setItem('theme', theme); } catch {} });
api.onProgress(event => {
  if (event.message) {
    const line = document.createElement('li'); line.textContent = event.message;
    $('progress-list').append(line);
    while ($('progress-list').children.length > 50) $('progress-list').firstElementChild.remove();
    line.scrollIntoView({ block: 'nearest' });
    $('progress-label').textContent = phaseNames[event.phase] || 'Preparing your app';
    announce(event.message);
  }
  renderStatus(event);
});
checkRequirements(); refreshStatus(); setInterval(refreshStatus, 2000);
