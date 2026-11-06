'use strict';
(() => {
const api = window.tunnel;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const Rx = window.RegexTools, MD = window.Markdown, C = window.Content;
const SHIPPED_NAME = 'Tunnel App Deployer';

// ---------- storage ----------
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(`tad.${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`tad.${key}`, JSON.stringify(value)); } catch {} }
};

// ---------- settings ----------
const DEFAULTS = Object.freeze({
  theme: 'system', seed: '#4fbfa5', motion: 'full', sounds: true, volume: 50,
  language: 'en', funnyEn: 5, funnyYue: 5, emoji: false,
  focus: false, lowStim: false, time: false, oneThing: false, momentum: false,
  textSize: 100, density: 'comfortable', toastTime: 6, paletteSize: 'card', dimSum: true, displayName: '',
  narrator: false, voiceEn: 'auto', voiceYue: 'auto', rate: 1, pitch: 1, vocabOn: true, school: false,
  schedules: [
    { id: 'evening', name: 'Evening', from: '18:00', to: '07:00', on: false, values: { theme: 'dark', motion: 'gentle', sounds: '', focus: '' } },
    { id: 'work', name: 'Work hours', from: '09:00', to: '17:00', on: false, values: { theme: '', motion: '', sounds: '', focus: 'on' } }
  ]
});
let settings = { ...DEFAULTS, ...store.get('settings', {}) };
let history = store.get('settingsHistory', []);
function setSetting(key, value, { record = true } = {}) {
  if (settings[key] === value) return;
  settings = { ...settings, [key]: value };
  store.set('settings', settings);
  if (record) recordRevision([key]);
  applySettings();
}
function recordRevision(changed, label) {
  history.push({ at: new Date().toISOString(), changed, label: label || null, values: { ...settings } });
  if (history.length > 200) history = history.slice(-200);
  store.set('settingsHistory', history);
}
if (!history.length) recordRevision(Object.keys(DEFAULTS), 'initial');

const effective = () => settings.school ? { ...settings, language: 'en', funnyEn: 1, emoji: false } : settings;
const I = window.I18n.create(effective);
// Personal vocabulary lives in its own local record: never in settings, history, exports or logs.
let vocab = store.get('vocab', null), vocabApply = s => s;
function refreshVocab() { vocabApply = vocab && settings.vocabOn && !settings.school ? window.Tools.vocabularyReplacer(vocab.entries) : (x => x); }
refreshVocab();
const both = key => I.both(key).map(x => x == null ? x : vocabApply(x));
const t = key => both(key)[0];
function label(key) { const [a, b] = both(key); return b ? `${esc(a)}<span class="alt" lang="yue-Hant-HK">${esc(b)}</span>` : esc(a); }
const plainBoth = key => both(key).filter(Boolean).join(' · ');
const appName = () => settings.displayName.trim() || SHIPPED_NAME;

// ---------- colour ----------
function hexToHue(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return null;
  const n = parseInt(m[1], 16); const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  const r = lin(n >> 16 & 255), g = lin(n >> 8 & 255), b = lin(n & 255);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), mm = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * mm + .4505937099 * s, B = .0259040371 * l + .7827717662 * mm - .808675766 * s;
  return (Math.atan2(B, A) * 180 / Math.PI + 360) % 360;
}
function hueToHex(h) { // approximate, for the hex field when the hue slider moves
  const c = document.createElement('canvas').getContext('2d'); c.fillStyle = `oklch(.72 .12 ${h})`; return c.fillStyle.startsWith('#') ? c.fillStyle : '#4fbfa5';
}
function scheme(dark) {
  const h = hexToHue(settings.seed) ?? 175, th = (h + 60) % 360;
  const o = (l, c, hue = h) => `oklch(${l} ${c} ${hue})`;
  const lowC = settings.lowStim ? .5 : 1;
  return dark ? {
    bg: o(.155, .008), s1: o(.19, .01), s2: o(.215, .012), s3: o(.26, .014), s4: o(.30, .016), ol: o(.47, .016), olv: o(.33, .014),
    on: o(.93, .01), onv: o(.80, .016), p: o(.81, .1 * lowC), onp: o(.30, .06), pc: o(.40, .08 * lowC), onpc: o(.93, .07),
    sc: o(.34, .03), onsc: o(.91, .03), t: o(.83, .06, th), err: '#ffb4ab', onerr: '#690005', errc: '#93000a', onerrc: '#ffdad6',
    warn: '#f3bf6e', warnc: '#5c4200', onwarnc: '#ffdea8', inv: o(.90, .01), oninv: o(.25, .01)
  } : {
    bg: o(.985, .005), s1: o(.965, .008), s2: o(.95, .01), s3: o(.925, .012), s4: o(.895, .014), ol: o(.56, .016), olv: o(.83, .012),
    on: o(.21, .012), onv: o(.40, .016), p: o(.50, .1 * lowC), onp: '#ffffff', pc: o(.90, .07 * lowC), onpc: o(.25, .06),
    sc: o(.91, .03), onsc: o(.25, .03), t: o(.50, .06, th), err: '#ba1a1a', onerr: '#ffffff', errc: '#ffdad6', onerrc: '#410002',
    warn: '#7c5800', warnc: '#ffdea8', onwarnc: '#271900', inv: o(.30, .01), oninv: o(.95, .01)
  };
}
const media = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
function applySettings() {
  const root = document.documentElement;
  const dark = isDark();
  for (const [k, v] of Object.entries(scheme(dark))) root.style.setProperty(`--${k}`, v);
  root.dataset.scheme = dark ? 'dark' : 'light';
  root.dataset.motion = settings.motion;
  root.dataset.density = settings.density;
  root.dataset.focus = settings.focus;
  root.dataset.lowstim = settings.lowStim;
  root.dataset.onething = settings.oneThing;
  refreshVocab();
  root.lang = settings.language === 'yue' ? 'yue-Hant-HK' : 'en';
  root.style.setProperty('--zoom', String(settings.textSize / 100));
  $('theme-toggle').querySelector('.ms').textContent = dark ? 'light_mode' : 'dark_mode';
  document.title = appName();
  api?.setTitle?.(appName()).catch?.(() => {});
  applyI18n();
  renderAll();
}
media.addEventListener('change', () => settings.theme === 'system' && applySettings());

function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.innerHTML = label(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll('[data-tip]')) { el.setAttribute('aria-label', t(el.dataset.tip)); el.title = plainBoth(el.dataset.tip); }
}

// ---------- sound ----------
let audio;
function sound(kind) {
  if (!settings.sounds) return;
  try {
    audio ||= new AudioContext();
    const notes = { start: [523, 659], live: [523, 659, 784], stop: [659, 440], fail: [220, 196], tap: [880] }[kind] || [];
    const gain = audio.createGain(); gain.connect(audio.destination);
    const vol = settings.volume / 100 * .18, now = audio.currentTime;
    notes.forEach((f, i) => {
      const o = audio.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = audio.createGain(); g.gain.setValueAtTime(0, now + i * .11); g.gain.linearRampToValueAtTime(vol, now + i * .11 + .02); g.gain.exponentialRampToValueAtTime(.0001, now + i * .11 + .32);
      o.connect(g); g.connect(gain); o.start(now + i * .11); o.stop(now + i * .11 + .34);
    });
  } catch {}
}

// ---------- announcements, notifications ----------
const announce = text => { $('announce').textContent = ''; requestAnimationFrame(() => { $('announce').textContent = text; }); narrate(text); };
// ---------- narrator ----------
const synth = window.speechSynthesis;
let lastSpoken = { text: '', at: 0 };
function voicesFor(lang) {
  const all = synth?.getVoices?.() || [];
  return lang === 'yue' ? all.filter(v => /^(zh-HK|yue)/i.test(v.lang) || /cantonese|hong kong/i.test(v.name)) : all.filter(v => /^en/i.test(v.lang));
}
function voiceInUse(lang) { const list = voicesFor(lang), want = lang === 'yue' ? settings.voiceYue : settings.voiceEn; return list.find(v => v.voiceURI === want) || list[0] || null; }
function narrate(text) {
  if (!settings.narrator || !synth || !text) return;
  const now = Date.now();
  if (text === lastSpoken.text && now - lastSpoken.at < 4000) return;
  lastSpoken = { text, at: now };
  for (const part of String(text).split(' · ').map(x => x.trim()).filter(Boolean)) {
    const lang = /[\u3400-\u9fff]/.test(part) ? 'yue' : 'en';
    const u = new SpeechSynthesisUtterance(part);
    const v = voiceInUse(lang); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'yue' ? 'zh-HK' : 'en';
    u.rate = settings.rate; u.pitch = settings.pitch;
    synth.speak(u);
  }
}
synth?.addEventListener?.('voiceschanged', () => { if (view === 'settings') renderSettings(); });
let notifications = store.get('notifications', []);
const EMOJI = { ok: '✅', info: '💡', error: '🛠️', warn: '⚠️', dimsum: '🥟' };
function notify(textOrKey, kind = 'info', { action } = {}) {
  const text = textOrKey in window.I18n.en ? plainBoth(textOrKey) : String(textOrKey);
  notifications.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), kind, text, read: false });
  notifications = notifications.slice(0, 300); store.set('notifications', notifications);
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : kind === 'warn' ? 'warn' : ''}`;
  el.innerHTML = `${settings.emoji ? `<span aria-hidden="true">${EMOJI[kind] || EMOJI.info}</span>` : `<span class="ms">${kind === 'error' ? 'error' : kind === 'ok' ? 'check_circle' : kind === 'warn' ? 'warning' : 'info'}</span>`}<span class="msg">${esc(text)}</span>${action ? `<button class="chip" data-act>${esc(action.label)}</button>` : ''}<button aria-label="${esc(t('notif.dismiss'))}"><span class="ms">close</span></button>`;
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  el.querySelector('button[aria-label]').onclick = remove;
  if (action) el.querySelector('[data-act]').onclick = () => { action.run(); remove(); };
  $('toasts').append(el);
  while ($('toasts').children.length > 4) $('toasts').firstElementChild.remove();
  if (kind !== 'error' && kind !== 'warn') setTimeout(remove, settings.toastTime * 1000);
  announce(text);
  renderBadge(); if (!$('notif-panel').hidden) renderNotifications();
}
function renderBadge() { const n = notifications.filter(x => !x.read).length; $('badge').hidden = !n; $('badge').textContent = n > 99 ? '99+' : n; }

// ---------- search with regex builder ----------
const searches = {};
function makeSearch(slotId, placeholderKey, onChange) {
  const slot = $(slotId); if (!slot) return null;
  const state = searches[slotId] = { query: '', regex: false, flags: 'i', onChange };
  const wrap = document.createElement('div'); wrap.className = 'search';
  wrap.innerHTML = `<label class="search-box"><span class="ms">search</span><input type="search" spellcheck="false" autocomplete="off"><button class="chip rx-toggle" aria-pressed="false">.*</button></label><div class="rx" hidden></div>`;
  slot.replaceChildren(wrap);
  const input = wrap.querySelector('input'), toggle = wrap.querySelector('.rx-toggle'), panel = wrap.querySelector('.rx');
  state.input = input; state.panel = panel; state.toggle = toggle; state.placeholderKey = placeholderKey;
  input.addEventListener('input', () => { state.query = input.value; renderRx(state); onChange(); });
  toggle.addEventListener('click', e => { e.preventDefault(); state.regex = !state.regex; renderRx(state); onChange(); input.focus(); });
  relabelSearch(state); renderRx(state);
  return state;
}
function relabelSearch(s) { s.input.placeholder = t(s.placeholderKey); s.input.setAttribute('aria-label', t(s.placeholderKey)); s.toggle.setAttribute('aria-label', t('regex.toggle')); s.toggle.title = plainBoth('regex.toggle'); }
function renderRx(s, count) {
  s.toggle.setAttribute('aria-pressed', String(s.regex));
  s.panel.hidden = !s.regex;
  if (!s.regex) return;
  const m = matcherFor(s);
  const tokens = s.query ? Rx.explain(s.query) : [];
  const status = !s.query ? t('regex.empty') : m.ok ? (count === undefined ? '' : `${count} ${t('regex.matches')}`) : m.reason === 'unsafe' ? t('regex.unsafe') : m.reason === 'tooLong' ? t('regex.tooLong') : `${t('regex.invalid')}: ${m.message || ''}`;
  s.panel.innerHTML = `<div class="rx-flags"><span class="small muted">${esc(t('regex.flags'))}</span>${Rx.FLAGS.map(f => `<button class="chip" data-flag="${f}" aria-pressed="${s.flags.includes(f)}" title="${esc(t('regex.flag.' + f))}">${f}</button>`).join('')}<span class="rx-status ${m.ok ? '' : 'bad'}" role="status">${esc(status)}</span></div><div class="rx-tokens">${tokens.slice(0, 40).map(tk => `<span class="tok ${tk.kind}"><code>${esc(tk.text)}</code><span>${esc(tk.desc)}</span></span>`).join('')}</div>`;
  for (const b of s.panel.querySelectorAll('[data-flag]')) b.onclick = () => { const f = b.dataset.flag; s.flags = s.flags.includes(f) ? s.flags.replace(f, '') : s.flags + f; renderRx(s); s.onChange(); };
}
const matcherFor = s => Rx.matcher(s?.query || '', { regex: !!s?.regex, flags: s?.flags || 'i' });
function setCount(s, n) { if (s?.regex && s.query) { const el = s.panel.querySelector('.rx-status'); if (el && matcherFor(s).ok) el.textContent = `${n} ${t('regex.matches')}`; } }

// ---------- views ----------
const VIEWS = ['host', 'sessions', 'tools', 'features', 'guide', 'settings'];
let view = 'host';
function buildBottomNav() { $('bottom').innerHTML = $('rail').querySelector('.dests').innerHTML; }
function go(next, { focus = true } = {}) {
  if (!VIEWS.includes(next)) return;
  view = next;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== next;
  for (const b of document.querySelectorAll('.dest')) b.setAttribute('aria-selected', String(b.dataset.view === next));
  renderView();
  if (focus) $('main').focus({ preventScroll: true });
  $('main').scrollTop = 0;
}
document.addEventListener('click', e => { const d = e.target.closest('.dest'); if (d) go(d.dataset.view); });
$('fab').onclick = () => { go('host'); if (!locked()) $('choose').focus(); };
function renderView() { ({ host: renderHost, sessions: renderSessions, tools: renderTools, features: renderFeatures, guide: renderGuide, settings: renderSettings })[view]?.(); }
function renderAll() { for (const s of Object.values(searches)) { relabelSearch(s); renderRx(s); } renderHost(); renderProvenance(); renderMomentum(); if (view !== 'host') renderView(); }

// ---------- provenance ----------
let info = { version: null, buildTime: null, commit: null };
function fmtTime(iso) {
  const d = new Date(iso); if (isNaN(d)) return null;
  const p = n => String(n).padStart(2, '0');
  const tz = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(d).find(x => x.type === 'timeZoneName')?.value || '';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${tz}`;
}
function renderProvenance() {
  const built = info.buildTime ? `${t('top.built')} ${fmtTime(info.buildTime)}` : t('top.buildUnknown');
  $('provenance').textContent = `${appName()} ${info.version ? 'v' + info.version : ''}${info.codeName ? ` (${info.codeName.en})` : ''} · ${built}`;
}

// ---------- hosting ----------
const STEPS = ['validating', 'preparing', 'building', 'starting', 'checking', 'connecting'];
let kind = 'dockerfile', selected = null, inspection = null, requirements = null;
let status = { phase: 'idle' }, busy = false, stopping = false, lastMessage = '', liveSince = null;
let session = null, sessions = store.get('sessions', []);
const live = () => status.phase === 'ready' && status.verified === true && !!status.publicUrl;
const active = () => !!status.phase && !['idle', 'error'].includes(status.phase);
const locked = () => busy || active() || stopping;
function saveSessions() { sessions = sessions.slice(0, 500); store.set('sessions', sessions); }
for (const s of sessions) if (s.outcome === 'running') { s.outcome = s.publicUrl ? 'shared' : 'cancelled'; s.endedAt ||= s.lastAt || s.startedAt; s.note = 'app closed'; }
saveSessions();

function phaseStep(phase) { if (phase === 'recovering' || phase === 'ready') return 'connecting'; return STEPS.includes(phase) ? phase : null; }
function trackProgress(event) {
  if (!session) return;
  const now = new Date().toISOString();
  session.lastAt = now;
  const step = phaseStep(event.phase);
  if (step && session.steps.at(-1)?.phase !== step) session.steps.push({ phase: step, at: now });
  if (event.message && step) session.messages[step] = event.message;
  if (live() && !session.reachedLive) { session.reachedLive = true; session.publicUrl = event.publicUrl; session.liveAt = now; }
  if (event.phase === 'error') finishSession('failed', event.error || event.message);
  if (event.phase === 'idle' && session) finishSession(session.reachedLive ? 'shared' : 'cancelled');
  saveSessions();
}
function finishSession(outcome, error) {
  if (!session) return;
  session.outcome = outcome; session.endedAt = new Date().toISOString(); if (error) session.error = String(error).slice(0, 2000);
  session.failedStep = outcome === 'failed' ? session.steps.at(-1)?.phase || 'validating' : null;
  lastFinished = session; session = null; saveSessions();
}
let lastFinished = null;

function setKind(next) {
  if (kind === next || locked()) return;
  kind = next; selected = null; inspection = null; renderHost();
}
$('fmt-dockerfile').onclick = () => setKind('dockerfile');
$('fmt-compose').onclick = () => setKind('compose');
$('choose').onclick = async () => {
  if (locked()) return;
  try {
    const result = await api.select(kind);
    if (!result) return;
    selected = result.source; inspection = result.inspection || {};
    const svc = $('service'); svc.replaceChildren(new Option(t('host.serviceAuto'), ''));
    for (const s of inspection.services || []) svc.add(new Option(s, s));
    svc.value = inspection.service || '';
    $('port').value = inspection.containerPort || '';
    sound('tap');
  } catch (e) { selected = null; notify(e.message, 'error'); }
  renderHost(); validatePort();
};
function validatePort() {
  const v = $('port').value.trim();
  const ok = !v || (/^\d+$/.test(v) && +v >= 1 && +v <= 65535);
  $('port').setAttribute('aria-invalid', String(!ok));
  $('port-hint').className = `hint ${ok ? '' : 'bad'}`;
  $('port-hint').innerHTML = label(!ok ? 'host.portBad' : inspection?.needsPort && !v ? 'host.portNeeded' : 'host.portHint');
  return ok;
}
$('port').addEventListener('input', () => { validatePort(); renderHost(); });
async function host() {
  if ($('host-btn').disabled || !validatePort()) return;
  busy = true; lastFinished = null;
  const file = selected.composePath || selected.dockerfilePath;
  session = { id: crypto.randomUUID(), name: file.split(/[\\/]/).at(-2) || file.split(/[\\/]/).pop(), file, kind, service: kind === 'compose' ? $('service').value || inspection?.service || '' : '', port: $('port').value || inspection?.containerPort || '', startedAt: new Date().toISOString(), outcome: 'running', steps: [], messages: {}, publicUrl: null };
  sessions.unshift(session); saveSessions();
  status = { phase: 'pending' }; stepStart = Date.now(); sound('start'); renderHost();
  try { await api.host({ service: kind === 'compose' ? $('service').value : '', containerPort: $('port').value.trim() }); }
  catch (e) { if (!stopping && session) { finishSession('failed', e.message); } if (!stopping) { status = { phase: 'error', error: e.message }; sound('fail'); notify('toast.failed', 'error'); } }
  finally { busy = false; await refreshStatus(); }
}
$('host-btn').onclick = host;
$('retry-btn').onclick = host;
$('another-btn').onclick = () => { selected = null; status = { phase: 'idle' }; lastFinished = null; renderHost(); $('choose').focus(); };
$('details-btn').onclick = () => copyText([lastFinished?.error || status.error, lastFinished && Object.entries(lastFinished.messages).map(([k, v]) => `${k}: ${v}`).join('\n')].filter(Boolean).join('\n\n'));
$('cancel-btn').onclick = () => doStop();
$('stop-btn').onclick = () => confirmAction({ titleKey: 'confirm.stop.title', bodyKey: 'confirm.stop.body', affectsKey: 'confirm.stop.affects', run: doStop, from: $('stop-btn') });
async function doStop() {
  if (stopping) return;
  stopping = true; renderHost();
  try { await api.stop(); sound('stop'); notify('toast.stopped', 'ok'); }
  catch (e) { notify(e.message, 'error'); }
  finally { stopping = false; busy = false; if (session) finishSession(session.reachedLive ? 'shared' : 'cancelled'); await refreshStatus(); }
}
async function copyText(text) {
  try { await api.copyText(String(text)); return true; } catch (e) { notify('error.copy', 'error'); return false; }
}
$('copy-btn').onclick = async () => {
  try { await api.copy(); $('copy-label').innerHTML = label('host.copied'); $('copy-icon').textContent = 'check'; notify('toast.copied', 'ok'); sound('tap');
    setTimeout(() => { $('copy-label').innerHTML = label('host.copy'); $('copy-icon').textContent = 'content_copy'; }, 1800); }
  catch (e) { notify(e.message, 'error'); await refreshStatus(); }
};
$('open-btn').onclick = async () => { try { await api.open(); } catch (e) { notify(e.message, 'error'); await refreshStatus(); } };
let stepStart = Date.now(), lastStep = null;
function explainError(message) {
  const m = String(message || '');
  if (/readiness timed out|stopped responding|health check/i.test(m)) return 'The app did not answer over HTTP';
  if (/tunnel|cloudflared/i.test(m)) return 'The public tunnel could not be opened';
  if (/port|service/i.test(m)) return 'A container port or service is needed';
  if (/build|docker/i.test(m)) return 'Docker could not build or start the project';
  if (/cancel/i.test(m)) return 'Hosting was cancelled';
  return t('error.generic');
}
function renderHost() {
  const isLive = live(), isActive = active() || busy, isError = status.phase === 'error' || (!isActive && lastFinished?.outcome === 'failed');
  const lockedNow = locked();
  for (const id of ['choose', 'fmt-dockerfile', 'fmt-compose', 'service', 'port']) $(id).disabled = lockedNow;
  $('fmt-dockerfile').setAttribute('aria-pressed', String(kind === 'dockerfile'));
  $('fmt-compose').setAttribute('aria-pressed', String(kind === 'compose'));
  const file = selected && (selected.composePath || selected.dockerfilePath);
  $('file-name').innerHTML = file ? esc(file.split(/[\\/]/).pop()) : label(kind === 'compose' ? 'host.pickCompose' : 'host.pickDockerfile');
  $('file-path').innerHTML = file ? esc(file) : label('host.browse');
  $('choose').dataset.path = file || '';
  $('context-note').innerHTML = lockedNow ? label('host.locked') : label(kind === 'compose' ? 'host.contextCompose' : 'host.contextDockerfile');
  const summary = lockedNow && !!selected;
  $('summary').hidden = !summary; $('choose').hidden = summary; document.querySelector('#card-project .seg').hidden = summary;
  if (summary) {
    const port = $('port').value || inspection?.containerPort || '';
    $('summary').innerHTML = `<div class="file" data-ctx="path" data-path="${esc(file)}"><span class="ms f">${kind === 'compose' ? 'stacks' : 'description'}</span><div><strong>${esc(t(kind === 'compose' ? 'host.compose' : 'host.dockerfile'))}${kind === 'compose' && $('service').value ? ' · ' + esc($('service').value) : ''}</strong><div class="mono small muted">${esc(file)}</div></div></div>${port ? `<div class="file"><span class="ms">lan</span><div><strong>${esc(t('host.port'))} ${esc(port)}</strong>${status.localUrl ? `<div class="mono small muted" data-ctx="text">${esc(status.localUrl)}</div>` : ''}</div></div>` : ''}`;
  }
  $('options').hidden = !selected || summary; $('service-field').hidden = kind !== 'compose';
  $('editor-row').hidden = !selected;
  if (selected) $('editor-row').innerHTML = `<button class="chip" data-editor="vscode" ${editors.length ? '' : 'disabled'} title="${esc(editors.length ? editors[0].name : t('editor.missing'))}"><span class="ms">code</span>${esc(t('editor.vscode'))}</button><button class="chip" data-editor="default"><span class="ms">edit_document</span>${esc(t('editor.default'))}</button><button class="chip" data-editor="reveal"><span class="ms">folder_open</span>${esc(t('editor.reveal'))}</button>${editors.length ? '' : `<a class="chip" href="https://code.visualstudio.com/" data-external="true"><span class="ms">download</span>${esc(t('editor.download'))}</a>`}`;
  const reqOk = requirements?.docker && (requirements?.cloudflared || requirements?.cloudflaredDownloadAvailable) && (kind !== 'compose' || requirements?.compose);
  $('host-btn').disabled = lockedNow || !selected || !reqOk;
  $('host-btn').hidden = isActive && !isLive ? true : isLive;
  $('cancel-btn').hidden = !(isActive && !isLive);
  $('cancel-btn').disabled = stopping;
  $('trust-note').hidden = isActive;
  // link card
  const titleKey = isLive ? 'host.live' : isActive ? 'host.working' : isError ? 'host.stopped' : 'host.ready';
  $('link-title').innerHTML = label(titleKey);
  const chip = $('status-chip');
  chip.className = `status-chip ${isLive ? 'live' : isError && !isActive ? 'bad' : isActive ? 'busy' : ''}`;
  $('status-text').innerHTML = label(`phase.${stopping ? 'stopping' : busy && status.phase === 'idle' ? 'pending' : status.phase in { idle: 1 } && isError ? 'error' : status.phase}`) || label('phase.idle');
  const cur = phaseStep(status.phase);
  const idx = isLive ? STEPS.length : cur ? STEPS.indexOf(cur) : -1;
  $('node-local').className = `node ${idx >= 3 || isLive ? 'on' : ''} ${isActive && idx < 4 && !isLive ? 'busy' : ''}`;
  $('node-tunnel').className = `node ${isLive ? 'on' : ''} ${cur === 'connecting' && !isLive ? 'busy' : ''}`;
  $('node-public').className = `node ${isLive ? 'on' : ''}`;
  $('pipe-1').className = `pipe ${isLive ? 'run' : idx >= 4 ? 'done' : ''}`;
  $('pipe-2').className = `pipe ${isLive ? 'run' : ''}`;
  $('stage').classList.toggle('compact', isActive || isLive || isError);
  $('stage-text').hidden = isActive || isLive || isError;
  $('stage-text').innerHTML = label('host.readyText');
  $('url-card').hidden = !isLive;
  $('public-url').textContent = isLive ? status.publicUrl : '';
  $('stats').hidden = !isLive;
  $('local-url').textContent = status.localUrl || '';
  $('live-actions').hidden = !isLive;
  $('stop-btn').disabled = stopping;
  $('stop-btn').querySelector('[data-i18n]').innerHTML = label(stopping ? 'host.stopping' : 'host.stop');
  // steps
  const src = session || lastFinished;
  const showSteps = (isActive && !isLive) || (isError && src);
  $('steps').hidden = !showSteps;
  if (showSteps) {
    if (cur !== lastStep) { lastStep = cur; stepStart = Date.now(); }
    const failAt = isError ? STEPS.indexOf(src?.failedStep || cur || 'validating') : -1;
    $('steps').innerHTML = STEPS.map((s, i) => {
      const at = src?.steps.findIndex(x => x.phase === s);
      const startT = at >= 0 ? Date.parse(src.steps[at].at) : null, nextT = at >= 0 && src.steps[at + 1] ? Date.parse(src.steps[at + 1].at) : null;
      const state = isError ? (i < failAt ? 'done' : i === failAt ? 'fail' : 'wait') : i < idx ? 'done' : i === idx ? 'now' : 'wait';
      const time = state === 'done' && startT && nextT ? `${((nextT - startT) / 1000).toFixed(1)} s` : state === 'now' && settings.time ? clockDiff(Date.now() - stepStart) : '';
      const icon = state === 'now' ? '<span class="spin" aria-hidden="true"></span>' : `<span class="ms">${state === 'done' ? 'check_circle' : state === 'fail' ? 'cancel' : 'radio_button_unchecked'}</span>`;
      const msg = (state === 'now' || state === 'fail') && src?.messages?.[s] ? `<span class="msg">${esc(src.messages[s])}</span>` : '';
      return `<li class="${state}" ${state === 'now' ? 'aria-current="step"' : ''}>${icon}<span>${label('step.' + s)}${msg}</span><span class="time">${time}</span></li>`;
    }).join('');
  }
  $('alert').hidden = !(isError && !isActive);
  if (isError && !isActive) {
    const message = status.error || lastFinished?.error || '';
    $('alert-title').textContent = explainError(message);
    $('alert-text').textContent = message;
  }
  // focus mode: one thing at a time
  $('card-project').classList.toggle('inactive', isActive || isLive);
  $('card-link').classList.toggle('inactive', !(isActive || isLive || isError));
  renderRequirements(); renderMomentum();
}
function clockDiff(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function renderRequirements() {
  const set = (id, key, state) => { const el = $(id); el.className = `chip static ${state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : ''}`; el.innerHTML = `<span class="ms ${state === 'ok' ? 'f' : ''}">${state === 'ok' ? 'check_circle' : state === 'bad' ? 'cancel' : state === 'dl' ? 'download' : 'pending'}</span><span>${esc(t(key))} · ${esc(t(state === 'ok' ? 'req.ready' : state === 'bad' ? 'req.missing' : state === 'dl' ? 'req.download' : 'req.checking'))}</span>`; };
  const r = requirements;
  set('req-docker', 'req.docker', !r ? 'wait' : r.docker ? 'ok' : 'bad');
  set('req-compose', 'req.compose', !r ? 'wait' : r.compose ? 'ok' : 'bad');
  set('req-tunnel', 'req.tunnel', !r ? 'wait' : r.cloudflared ? 'ok' : r.cloudflaredDownloadAvailable ? 'dl' : 'bad');
  const missing = r?.missing || [];
  $('req-detail').hidden = !missing.length; $('req-detail').textContent = missing.join(' · ');
}
async function checkRequirements() {
  $('recheck').disabled = true; requirements = null; renderRequirements();
  try { requirements = await api.prerequisites(); } catch (e) { requirements = { docker: false, compose: false, cloudflared: false, missing: [t('req.unavailable')] }; }
  finally { $('recheck').disabled = false; renderHost(); }
  return requirements;
}
$('recheck').onclick = checkRequirements;
let polling = false, wasLive = false;
async function refreshStatus() {
  if (polling) return; polling = true;
  try { status = await api.status(); } catch { status = { phase: 'error', error: t('error.generic') }; }
  finally { polling = false; }
  const isLive = live();
  if (isLive && !wasLive) { liveSince = Date.now(); sound('live'); notify('toast.live', 'ok'); }
  if (!isLive) liveSince = null;
  wasLive = isLive;
  if (session && status.phase === 'idle' && !busy) finishSession(session.reachedLive ? 'shared' : 'cancelled');
  renderHost();
}
api?.onProgress(event => {
  status = { ...status, ...event };
  if (event.message) { lastMessage = event.message; announce(event.message); }
  trackProgress(event);
  if (event.phase === 'error' && !stopping) { sound('fail'); }
  const isLive = live();
  if (isLive && !wasLive) { liveSince = Date.now(); sound('live'); notify('toast.live', 'ok'); }
  wasLive = isLive;
  renderHost();
});

// ---------- momentum and time ----------
function renderMomentum() {
  $('momentum').hidden = !settings.momentum;
  if (settings.momentum) {
    const key = live() ? 'momentum.share' : active() || busy ? 'momentum.wait' : status.phase === 'error' || lastFinished?.outcome === 'failed' ? 'momentum.fix' : selected ? 'momentum.host' : 'momentum.pick';
    $('momentum-text').innerHTML = label(key);
  }
}
setInterval(() => {
  $('clock').hidden = !settings.time;
  if (settings.time) $('clock').textContent = new Date().toLocaleTimeString('en-GB');
  if (liveSince) $('uptime').textContent = clockDiff(Date.now() - liveSince);
  if (settings.time && (busy || active()) && !live()) { const now = document.querySelector('#steps li.now .time'); if (now) now.textContent = clockDiff(Date.now() - stepStart); }
}, 1000);

// ---------- sessions view ----------
let sessionFilter = 'all', selectedSessions = new Set();
const sessionsSearch = () => searches['sessions-search'];
function sessionText(s) { return [s.name, s.file, s.kind, s.service, s.port, s.publicUrl, s.outcome, s.error].filter(Boolean).join(' '); }
function renderSessions() {
  const m = matcherFor(sessionsSearch());
  const counts = { all: sessions.length };
  for (const s of sessions) counts[s.outcome] = (counts[s.outcome] || 0) + 1;
  $('sessions-filters').innerHTML = ['all', 'shared', 'failed', 'cancelled', 'running'].filter(k => k === 'all' || counts[k]).map(k => `<button class="chip" data-f="${k}" aria-pressed="${sessionFilter === k}">${sessionFilter === k ? '<span class="ms">check</span>' : ''}${esc(t('sessions.' + k))} · ${counts[k] || 0}</button>`).join('');
  for (const b of $('sessions-filters').querySelectorAll('[data-f]')) b.onclick = () => { sessionFilter = b.dataset.f; renderSessions(); };
  const shown = sessions.filter(s => (sessionFilter === 'all' || s.outcome === sessionFilter) && m.test(sessionText(s)));
  setCount(sessionsSearch(), shown.length);
  const sharedMs = sessions.reduce((a, s) => a + (s.liveAt && s.endedAt ? Date.parse(s.endedAt) - Date.parse(s.liveAt) : 0), 0);
  const reached = sessions.filter(s => s.reachedLive || s.publicUrl).length;
  $('sessions-stats').innerHTML = `<div class="stat"><span class="muted small">${esc(t('sessions.total'))}</span><b>${sessions.length}</b></div><div class="stat"><span class="muted small">${esc(t('sessions.sharedTime'))}</span><b class="mono">${clockDiff(sharedMs)}</b></div><div class="stat"><span class="muted small">${esc(t('sessions.successRate'))}</span><b>${sessions.length ? Math.round(100 * reached / sessions.length) : 0}%</b></div>`;
  $('sessions-empty').hidden = !!shown.length;
  $('sessions-empty-title').innerHTML = label('sessions.empty');
  $('sessions-list').hidden = !shown.length;
  $('sessions-list').innerHTML = shown.map((s, i) => `<div class="srow" role="listitem" data-ctx="session" data-id="${esc(s.id)}" data-url="${esc(s.publicUrl || '')}"><input type="checkbox" aria-label="${esc(s.name)}" data-sel="${esc(s.id)}" ${selectedSessions.has(s.id) ? 'checked' : ''}><span class="av"><span class="ms f">${s.kind === 'compose' ? 'stacks' : 'description'}</span></span><div class="name"><strong>${esc(s.name)}</strong><div class="muted small">${esc(s.kind === 'compose' ? `Compose${s.service ? ' · ' + s.service : ''}` : 'Dockerfile')}${s.port ? ' · port ' + esc(s.port) : ''}</div></div><span class="addr">${esc(s.publicUrl ? s.publicUrl.replace('https://', '') : t('sessions.noLink'))}</span><span class="state ${esc(s.outcome)}">${esc(t('sessions.' + s.outcome))}</span><span class="muted small when">${esc(fmtTime(s.startedAt) || '')}</span></div>`).join('');
  for (const [i, row] of [...$('sessions-list').children].entries()) row.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
  for (const c of $('sessions-list').querySelectorAll('[data-sel]')) c.onchange = () => { c.checked ? selectedSessions.add(c.dataset.sel) : selectedSessions.delete(c.dataset.sel); renderBulk(); };
  renderBulk();
}
function renderBulk() { $('sessions-bulk').hidden = !selectedSessions.size; $('sessions-selected').textContent = `${selectedSessions.size} ${t('sessions.selected')}`; }
$('sessions-fold').open = store.get('foldSessions', false);
$('sessions-fold').addEventListener('toggle', () => store.set('foldSessions', $('sessions-fold').open));
const csvCell = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function exportSessions(list, format) {
  if (!list.length) return notify('toast.nothing', 'info');
  const stamp = new Date().toISOString().slice(0, 10);
  let content;
  if (format === 'json') content = JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), encoding: 'utf-8', sessions: list }, null, 2);
  else if (format === 'csv') { const cols = ['id', 'name', 'file', 'kind', 'service', 'port', 'outcome', 'publicUrl', 'startedAt', 'liveAt', 'endedAt', 'error']; content = ['# schema 1; step timings are not included in CSV, use JSON for them', cols.join(','), ...list.map(s => cols.map(c => csvCell(s[c])).join(','))].join('\r\n'); }
  else content = `# Sessions\n\nExported ${new Date().toISOString()}\n\n| Name | Format | Outcome | Link | Started |\n| --- | --- | --- | --- | --- |\n${list.map(s => `| ${s.name} | ${s.kind} | ${s.outcome} | ${s.publicUrl || 'none'} | ${s.startedAt} |`).join('\n')}\n`;
  return saveFile(`sessions-${stamp}.${format === 'markdown' ? 'md' : format}`, content);
}
async function saveFile(name, content) { try { const ok = await api.save(name, content); if (ok) notify('toast.exported', 'ok'); } catch (e) { notify('error.save', 'error'); } }
$('sessions-export-btn').onclick = e => openMenu(e.currentTarget, [
  { icon: 'data_object', label: 'JSON', run: () => exportSessions(sessions, 'json') },
  { icon: 'table', label: 'CSV', run: () => exportSessions(sessions, 'csv') },
  { icon: 'article', label: 'Markdown', run: () => exportSessions(sessions, 'markdown') }]);
$('sessions-export-selected').onclick = e => openMenu(e.currentTarget, ['json', 'csv', 'markdown'].map(f => ({ icon: 'download', label: f.toUpperCase(), run: () => exportSessions(sessions.filter(s => selectedSessions.has(s.id)), f) })));
$('sessions-remove').onclick = () => confirmAction({ titleKey: 'confirm.remove.title', bodyKey: 'confirm.remove.body', affects: `${selectedSessions.size} ${t('sessions.selected')}`, from: $('sessions-remove'), run: () => { sessions = sessions.filter(s => !selectedSessions.has(s.id) || s.outcome === 'running'); selectedSessions.clear(); saveSessions(); renderSessions(); notify('toast.cleared', 'ok'); } });

// ---------- features view ----------
let featureFilter = 'all';
function renderFeatures() {
  const F = C.features, s = searches['features-search'], m = matcherFor(s);
  const counts = { all: F.items.length }; for (const i of F.items) counts[i.status] = (counts[i.status] || 0) + 1;
  const done = (counts.built || 0) + (counts.partial || 0);
  $('features-count').textContent = `${done} ${t('features.of')} ${F.items.length}`;
  $('features-track').innerHTML = `<i class="b"></i><i class="pa"></i>`;
  $('features-track').children[0].style.width = `${100 * (counts.built || 0) / F.items.length}%`;
  $('features-track').children[1].style.width = `${100 * (counts.partial || 0) / F.items.length}%`;
  $('features-filters').innerHTML = ['all', 'built', 'partial', 'planned', 'na'].map(k => `<button class="chip" data-f="${k}" aria-pressed="${featureFilter === k}">${esc(k === 'all' ? t('sessions.all') : t('status.' + k))} · ${counts[k] || 0}</button>`).join('');
  for (const b of $('features-filters').querySelectorAll('[data-f]')) b.onclick = () => { featureFilter = b.dataset.f; renderFeatures(); };
  const shown = F.items.filter(i => (featureFilter === 'all' || i.status === featureFilter) && m.test(`${i.title} ${i.note} ${i.id}`));
  setCount(s, shown.length);
  $('features-groups').innerHTML = F.groups.map(([g, name]) => { const items = shown.filter(i => i.group === g); if (!items.length) return ''; return `<section class="fgroup"><h2>${esc(name)}</h2><div class="fcards">${items.map(i => `<button class="fc" data-feature="${esc(i.id)}" ${i.article ? `data-article="${esc(i.article)}"` : ''}><span class="st ${i.status}">${esc(t('status.' + i.status))}</span><h3>${esc(i.title)}</h3><p>${esc(i.note)}</p>${i.article ? `<span class="small more">${esc(t('features.readMore'))} →</span>` : ''}</button>`).join('')}</div></section>`; }).join('') || `<div class="empty">${esc(t('palette.none'))}</div>`;
  for (const b of $('features-groups').querySelectorAll('[data-article]')) b.onclick = () => openArticle(b.dataset.article);
}

// ---------- guide ----------
let articleId = 'getting-started';
function openArticle(id) { if (!C.articles.some(a => a.id === id)) return; articleId = id; go('guide'); $('guide-article').focus({ preventScroll: true }); }
function renderGuide() {
  const s = searches['guide-search'], m = matcherFor(s);
  const list = C.articles.filter(a => m.test(`${a.title} ${a.body}`));
  setCount(s, list.length);
  $('guide-nav').innerHTML = list.map(a => `<button class="alink" data-article="${esc(a.id)}" aria-current="${a.id === articleId}"><strong>${esc(a.title)}</strong><span>${esc(a.summary.slice(0, 90))}</span></button>`).join('') || `<p class="muted">${esc(t('guide.none'))}</p>`;
  const a = C.articles.find(x => x.id === articleId) || C.articles[0];
  $('guide-article').innerHTML = `<h1 class="h1">${esc(a.title)}</h1>${MD.render(a.body)}<h2>${esc(t('guide.related'))}</h2><div class="related">${a.related.map(r => C.articles.find(x => x.id === r)).filter(Boolean).map(r => `<button data-article="${esc(r.id)}"><span class="ms">article</span>${esc(r.title)}</button>`).join('')}</div>`;
  $('guide-article').style.animation = 'none'; void $('guide-article').offsetWidth; $('guide-article').style.animation = '';
}
document.addEventListener('click', e => {
  const art = e.target.closest('#view-guide [data-article], .article [data-article]'); if (art) { e.preventDefault(); openArticle(art.dataset.article); return; }
  const ext = e.target.closest('a[data-external]'); if (ext) { e.preventDefault(); api.openLink?.(ext.href).catch(() => notify(ext.href, 'info')); }
});

// ---------- settings ----------
const GROUPS = [
  ['appearance', 'palette', [['theme', 'select', ['system', 'light', 'dark']], ['seed', 'seed'], ['dimSum', 'switch']]],
  ['motion', 'motion_photos_on', [['motion', 'select', ['full', 'gentle', 'off']], ['sounds', 'switch'], ['volume', 'range', 0, 100, 5]]],
  ['language', 'translate', [['language', 'select', ['en', 'yue', 'both']], ['funnyEn', 'range', 1, 5, 1], ['funnyYue', 'range', 1, 5, 1], ['emoji', 'switch'], ['narrator', 'switch'], ['voiceEn', 'voice'], ['voiceYue', 'voice'], ['rate', 'range', 0.5, 2, 0.1], ['pitch', 'range', 0.5, 2, 0.1], ['vocab', 'vocab'], ['vocabOn', 'switch'], ['school', 'school']]],
  ['schedules', 'schedule', [['schedules', 'schedules']]],
  ['focus', 'self_improvement', [['focus', 'switch'], ['lowStim', 'switch'], ['time', 'switch'], ['oneThing', 'switch'], ['momentum', 'switch']]],
  ['access', 'accessibility_new', [['textSize', 'range', 90, 150, 10], ['density', 'select', ['comfortable', 'compact']], ['paletteSize', 'select', ['card', 'full']]]],
  ['notifications', 'notifications', [['toastTime', 'range', 3, 15, 1]]],
  ['data', 'database', [['history', 'history'], ['exports', 'exports']]],
  ['about', 'info', [['about', 'about'], ['displayName', 'text'], ['changelog', 'changelog']]]
];
const LABEL_KEY = { language: 'set.language', funnyEn: 'set.funnyEn', funnyYue: 'set.funnyYue', textSize: 'set.textSize', toastTime: 'set.toastTime', paletteSize: 'set.paletteSize', displayName: 'set.displayName', dimSum: 'set.dimSum', lowStim: 'set.lowStim', oneThing: 'set.oneThing', history: 'set.history', changelog: 'set.changelog' };
const lk = key => LABEL_KEY[key] || `set.${key}`;
let settingsGroup = 'appearance', openInfo = null, clFrom = '', clTo = '';
function optionLabel(key, v) { const k = `${lk(key)}.${v}`; return k in window.I18n.en ? t(k) : v; }
function settingsMatches() { const m = matcherFor(searches['settings-search']); return ([key]) => m.test(`${plainBoth(lk(key))} ${plainBoth(lk(key) + '.d')}`); }
function renderSettings() {
  const query = searches['settings-search']?.query;
  $('settings-groups').innerHTML = GROUPS.map(([g, icon]) => `<button class="g" data-g="${g}" aria-current="${!query && g === settingsGroup}"><span class="ms ${g === settingsGroup ? 'f' : ''}">${icon}</span><span>${label('group.' + g)}</span></button>`).join('');
  for (const b of $('settings-groups').querySelectorAll('[data-g]')) b.onclick = () => { settingsGroup = b.dataset.g; if (searches['settings-search']) { searches['settings-search'].query = ''; searches['settings-search'].input.value = ''; } renderSettings(); };
  const filter = settingsMatches();
  let total = 0;
  const groups = GROUPS.filter(([g]) => query || g === settingsGroup).map(([g, icon, items]) => {
    const shown = (query ? items.filter(filter) : items).filter(([k]) => !schoolHidden(k)); total += shown.length;
    if (!shown.length) return '';
    return `<section class="sgroup" data-group="${g}"><div class="sgroup-head"><h2>${label('group.' + g)}</h2>${['data', 'about'].includes(g) ? '' : `<button class="chip" data-reset="${g}"><span class="ms">restart_alt</span>${esc(t('settings.reset'))}</button>`}</div>${shown.map(it => settingItem(it)).join('')}</section>`;
  }).join('');
  setCount(searches['settings-search'], total);
  $('settings-content').innerHTML = groups || `<div class="empty">${esc(t('settings.noMatch'))}</div>`;
  bindSettings();
}
const SCHOOL_HIDDEN = ['funnyEn', 'funnyYue', 'emoji', 'voiceYue', 'vocab', 'vocabOn', 'dimSum'];
const schoolHidden = key => settings.school && SCHOOL_HIDDEN.includes(key);
const unit = key => key === 'textSize' || key === 'volume' ? '%' : key === 'toastTime' ? ' s' : key === 'rate' || key === 'pitch' ? '×' : '';
function settingItem([key, type, a, b, c]) {
  const infoBtn = `<button class="info" data-info="${key}" aria-label="${esc(t('settings.info'))}: ${esc(t(lk(key)))}" aria-expanded="${openInfo === key}"><span class="ms">info</span></button>`;
  const lab = `<span class="lab"><strong id="lab-${key}">${label(lk(key))}${infoBtn}</strong><span class="d">${label(lk(key) + '.d')}</span></span>`;
  const explain = openInfo === key ? `<div class="explain" role="note">${esc(plainBoth(lk(key) + '.d'))}</div>` : '';
  let control = '';
  if (type === 'select') control = `<select class="select" data-set="${key}" aria-labelledby="lab-${key}">${a.filter(v => !(settings.school && key === 'language' && v !== 'en')).map(v => `<option value="${v}" ${settings[key] === v ? 'selected' : ''}>${esc(optionLabel(key, v))}</option>`).join('')}</select>`;
  else if (type === 'switch') control = `<input type="checkbox" role="switch" class="switch" data-set="${key}" aria-labelledby="lab-${key}" ${settings[key] ? 'checked' : ''}>`;
  else if (type === 'range') control = `<span class="range"><input type="range" min="${a}" max="${b}" step="${c}" value="${settings[key]}" data-set="${key}" aria-labelledby="lab-${key}"><output>${settings[key]}${unit(key)}</output></span>`;
  else if (type === 'text') control = `<span class="row"><input class="input" data-set="${key}" aria-labelledby="lab-${key}" maxlength="60" value="${esc(settings.displayName)}" placeholder="${SHIPPED_NAME}"><button class="chip" data-act="restore-name"><span class="ms">restart_alt</span>${esc(t('set.restoreName'))}</button></span>`;
  else if (type === 'seed') { const sw = ['#4fbfa5', '#5b8def', '#c26ad9', '#e0805a', '#d4b341', '#62b35f']; control = `<span class="color"><span class="swatches">${sw.map(h => `<button class="sw" data-seed="${h}" aria-label="${h}" aria-pressed="${settings.seed === h}"></button>`).join('')}</span><span class="row"><input type="range" class="hue" min="0" max="359" value="${Math.round(hexToHue(settings.seed) ?? 175)}" aria-label="Hue"><input class="hex" value="${esc(settings.seed)}" aria-label="Hex colour" maxlength="7"></span></span>`; }
  else if (type === 'voice') { const lang = key === 'voiceYue' ? 'yue' : 'en', list = voicesFor(lang), using = voiceInUse(lang); control = `<span class="color"><select class="select" data-set="${key}" aria-labelledby="lab-${key}"><option value="auto">${esc(t('set.voice.auto'))}</option>${list.map(v => `<option value="${esc(v.voiceURI)}" ${settings[key] === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select><span class="small muted">${esc(using ? `${t('set.voice.using')}: ${using.name}` : t('set.voice.none'))}</span>${lang === 'en' ? `<button class="chip" data-act="test-voice"><span class="ms">play_arrow</span>${esc(t('set.testVoice'))}</button>` : ''}</span>`; }
  else if (type === 'vocab') return `<div class="item" data-key="vocab">${lab}<span class="tools"><button class="chip" data-act="vocab-upload"><span class="ms">upload_file</span>${esc(t(vocab ? 'set.vocab.replace' : 'set.vocab.upload'))}</button>${vocab ? `<button class="chip danger" data-act="vocab-clear"><span class="ms">delete</span>${esc(t('set.vocab.clear'))}</button>` : ''}</span>${explain}<p class="small muted span-all">${vocab ? `${vocab.count} ${esc(t('set.vocab.loaded'))}` : esc(t('set.vocab.none'))}</p>${vocab ? `<table class="vocab-table"><thead><tr><th>${esc(t('set.vocab.word'))}</th><th>${esc(t('set.vocab.shownAs'))}</th></tr></thead><tbody>${Object.entries(vocab.entries).slice(0, 12).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
  else if (type === 'school') control = `<input type="checkbox" role="switch" class="switch" data-act="school-toggle" aria-labelledby="lab-${key}" ${settings.school ? 'checked' : ''}>`;
  else if (type === 'schedules') return `<div class="item" data-key="schedules">${lab}<button class="chip" data-act="sched-add"><span class="ms">add</span>${esc(t('set.schedule.add'))}</button>${explain}<div class="sched">${settings.schedules.map((r, i) => `<div class="srule ${activeSchedule()?.id === r.id ? 'active' : ''}"><input class="input" data-sched="${i}" data-f="name" value="${esc(r.name)}" maxlength="40" aria-label="${esc(t('set.schedule.name'))}"><label class="mini">${esc(t('set.schedule.from'))}<input type="time" data-sched="${i}" data-f="from" value="${esc(r.from)}"></label><label class="mini">${esc(t('set.schedule.to'))}<input type="time" data-sched="${i}" data-f="to" value="${esc(r.to)}"></label><span class="vals">${SCHED_KEYS.map(([k, opts]) => `<label class="mini">${esc(t(lk(k)))}<select class="select" data-sched="${i}" data-v="${k}"><option value="">${esc(t('set.schedule.unchanged'))}</option>${opts.map(o => `<option value="${o}" ${r.values[k] === o ? 'selected' : ''}>${esc(['on', 'off'].includes(o) ? o : optionLabel(k, o))}</option>`).join('')}</select></label>`).join('')}</span><input type="checkbox" role="switch" class="switch" data-sched="${i}" data-f="on" ${r.on ? 'checked' : ''} aria-label="${esc(r.name)}"><button class="icon-btn" data-sched-remove="${i}" aria-label="${esc(t('set.schedule.remove'))}"><span class="ms">delete</span></button>${activeSchedule()?.id === r.id ? `<span class="small ok-text">${esc(t('set.schedule.active'))}</span>` : ''}</div>`).join('')}</div></div>`;
  else if (type === 'history') return `<div class="item"><span class="lab"><strong>${label('set.history')}</strong><span class="d">${label('set.history.d')}</span></span><span></span><div class="hist">${history.slice().reverse().slice(0, 50).map((h, i) => `<div class="hrow"><span><b>${esc(fmtTime(h.at))}</b> · ${esc(h.label || h.changed.join(', '))}</span>${i ? `<button class="chip" data-restore="${esc(h.at)}"><span class="ms">history</span>${esc(t('set.restore'))}</button>` : ''}</div>`).join('')}</div></div>`;
  else if (type === 'exports') return `<div class="item"><span class="lab"><strong>${label('sessions.export')}</strong></span><span class="tools"><button class="chip" data-act="exp-settings"><span class="ms">download</span>${esc(t('set.exportSettings'))}</button><button class="chip" data-act="exp-history"><span class="ms">download</span>${esc(t('set.exportHistory'))}</button><button class="chip" data-act="exp-notif"><span class="ms">download</span>${esc(t('set.exportNotifications'))}</button><button class="chip danger" data-act="clear-sessions"><span class="ms">delete_sweep</span>${esc(t('set.clearSessions'))}</button><button class="chip danger" data-act="reset-all"><span class="ms">restart_alt</span>${esc(t('set.resetAll'))}</button></span></div>`;
  else if (type === 'about') return `<div class="item"><dl class="kv"><dt>${esc(t('set.version'))}</dt><dd>${esc(info.version || '—')}</dd><dt>${esc(t('set.codeName'))}</dt><dd>${info.codeName ? `<a href="${esc(info.codeName.photo)}" data-external="true">${esc(info.codeName.en)} · ${esc(info.codeName.zhHant)}</a>` : esc(t('set.codeName.none'))}</dd><dt>${esc(t('set.build'))}</dt><dd>${esc(info.buildTime ? fmtTime(info.buildTime) : t('top.buildUnknown'))}</dd><dt>${esc(t('set.commit'))}</dt><dd>${info.commit ? `<a href="${esc(C.changelog.repository)}/commit/${esc(info.commit)}" data-external="true">${esc(info.commit.slice(0, 7))}</a>` : '—'}</dd></dl>${updatesCard()}<span class="tools"><button class="chip" data-act="tour"><span class="ms">tour</span>${esc(t('set.onboarding'))}</button></span><p class="muted small">${esc(t('set.free'))}</p></div>`;
  else if (type === 'changelog') return `<div class="item"><span class="lab"><strong>${label('set.changelog')}</strong></span><span class="dates"><label class="small muted">${esc(t('set.from'))} <input type="date" data-cl="from" value="${clFrom}"></label><label class="small muted">${esc(t('set.to'))} <input type="date" data-cl="to" value="${clTo}"></label></span><div class="cl"><div id="changelog-search-slot"></div><div id="cl-list" class="cl"></div></div></div>`;
  return `<div class="item" data-key="${key}">${lab}${control}${explain}</div>`;
}
function bindSettings() {
  const root = $('settings-content');
  for (const el of root.querySelectorAll('[data-set]')) {
    const key = el.dataset.set;
    const read = () => el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (el.type === 'range') el.addEventListener('input', () => { el.nextElementSibling.textContent = `${el.value}${unit(key)}`; });
    el.addEventListener('change', () => {
      if (key === 'dimSum' && !el.checked) { setTimeout(() => { el.checked = true; notify('toast.dimSumBack', 'info'); }, 600); return; }
      setSetting(key, key === 'displayName' ? read().trim().slice(0, 60) : el.type === 'range' ? Math.round(read() * 10) / 10 : read());
      if (key === 'sounds' && settings.sounds) sound('tap');
    });
  }
  for (const b of root.querySelectorAll('[data-info]')) b.onclick = () => { openInfo = openInfo === b.dataset.info ? null : b.dataset.info; renderSettings(); root.querySelector(`[data-info="${b.dataset.info}"]`)?.focus(); };
  for (const b of root.querySelectorAll('[data-reset]')) b.onclick = () => { const g = GROUPS.find(x => x[0] === b.dataset.reset); const keys = g[2].map(x => x[0]).filter(k => k in DEFAULTS); settings = { ...settings, ...Object.fromEntries(keys.map(k => [k, DEFAULTS[k]])) }; store.set('settings', settings); recordRevision(keys, `reset ${g[0]}`); applySettings(); notify('toast.reset', 'ok'); };
  for (const b of root.querySelectorAll('[data-seed]')) { b.style.background = b.dataset.seed; b.onclick = () => setSetting('seed', b.dataset.seed); }
  const hue = root.querySelector('.hue'), hex = root.querySelector('.hex');
  if (hue) { hue.addEventListener('change', () => setSetting('seed', hueToHex(hue.value))); hex.addEventListener('change', () => { const v = hex.value.trim().replace(/^([^#])/, '#$1'); if (/^#[0-9a-f]{6}$/i.test(v)) setSetting('seed', v.toLowerCase()); else hex.setAttribute('aria-invalid', 'true'); }); }
  for (const b of root.querySelectorAll('[data-restore]')) b.onclick = () => { const h = history.find(x => x.at === b.dataset.restore); if (!h) return; settings = { ...DEFAULTS, ...h.values }; store.set('settings', settings); recordRevision(Object.keys(DEFAULTS), `restored ${fmtTime(h.at)}`); applySettings(); notify('toast.restored', 'ok'); };
  for (const d of root.querySelectorAll('[data-cl]')) d.onchange = () => { d.dataset.cl === 'from' ? clFrom = d.value : clTo = d.value; renderChangelog(); };
  if ($('changelog-search-slot')) { const prev = searches['changelog-search']; makeSearch('changelog-search-slot', 'settings.search', renderChangelog); if (prev) { Object.assign(searches['changelog-search'], { query: prev.query, regex: prev.regex, flags: prev.flags }); searches['changelog-search'].input.value = prev.query; renderRx(searches['changelog-search']); } renderChangelog(); }
  const acts = {
    'restore-name': () => setSetting('displayName', ''),
    'exp-settings': () => saveFile('settings.json', JSON.stringify({ schema: 1, settings }, null, 2)),
    'exp-history': () => saveFile('settings-history.json', JSON.stringify({ schema: 1, history }, null, 2)),
    'exp-notif': () => exportNotifications(),
    'clear-sessions': () => confirmAction({ titleKey: 'confirm.clear.title', bodyKey: 'confirm.clear.body', affects: `${sessions.length} ${t('sessions.title')}`, run: () => { sessions = sessions.filter(s => s.outcome === 'running'); saveSessions(); notify('toast.cleared', 'ok'); renderSettings(); } }),
    'reset-all': () => confirmAction({ titleKey: 'confirm.reset.title', bodyKey: 'confirm.reset.body', run: () => { settings = { ...DEFAULTS }; store.set('settings', settings); recordRevision(Object.keys(DEFAULTS), 'reset all'); applySettings(); notify('toast.reset', 'ok'); } }),
    tour: () => openOnboarding(0),
    'check-updates': () => checkUpdates(),
    'test-voice': () => { const was = settings.narrator; settings.narrator = true; lastSpoken = { text: '', at: 0 }; narrate(plainBoth('toast.live')); settings.narrator = was; },
    'vocab-upload': () => $('file-vocab').click(),
    'vocab-clear': () => { vocab = null; try { localStorage.removeItem('tad.vocab'); } catch {} applySettings(); notify('toast.cleared', 'ok'); },
    'school-toggle': el => { el.checked = settings.school; toggleSchool(); },
    'sched-add': () => setSetting('schedules', [...settings.schedules, { id: crypto.randomUUID(), name: 'Schedule', from: '12:00', to: '13:00', on: false, values: {} }])
  };
  for (const el of root.querySelectorAll('[data-sched]')) el.addEventListener('change', () => {
    const list = settings.schedules.map(r => ({ ...r, values: { ...r.values } })), r = list[+el.dataset.sched];
    if (el.dataset.v) r.values[el.dataset.v] = el.value; else if (el.dataset.f === 'on') r.on = el.checked; else r[el.dataset.f] = el.value;
    setSetting('schedules', list); lastScheduleId = null; runSchedules();
  });
  for (const b of root.querySelectorAll('[data-sched-remove]')) b.onclick = () => setSetting('schedules', settings.schedules.filter((_, i) => i !== +b.dataset.schedRemove));
  for (const b of root.querySelectorAll('[data-act]')) b.onclick = e => { e.stopPropagation(); acts[b.dataset.act]?.(b); };
}
function renderChangelog() {
  const el = $('cl-list'); if (!el) return;
  const s = searches['changelog-search'], m = matcherFor(s);
  const entries = C.changelog.entries.filter(e => (!clFrom || e.date >= clFrom) && (!clTo || e.date <= clTo) && m.test(`${e.version} ${e.note} ${Object.values(e.changes).flat().join(' ')}`));
  setCount(s, entries.length);
  el.innerHTML = entries.map(e => `<div class="rel"><div class="row spread"><strong>${esc(e.version)} · ${esc(e.date)}</strong>${e.commit ? `<a class="mono" href="${esc(C.changelog.repository)}/commit/${esc(e.commit)}" data-external="true">${esc(e.commit.slice(0, 7))}</a>` : `<span class="mono small">${esc(info.commit ? info.commit.slice(0, 7) : '')}</span>`}</div><p class="muted small">${esc(e.note)}</p>${Object.entries(e.changes).map(([k, v]) => `<h4>${esc(k)}</h4><ul>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>`).join('') || `<p class="muted">${esc(t('palette.none'))}</p>`;
}
function teleportSetting(key) {
  const g = GROUPS.find(x => x[2].some(i => i[0] === key)); if (!g) return;
  settingsGroup = g[0]; if (searches['settings-search']) { searches['settings-search'].query = ''; searches['settings-search'].input.value = ''; }
  go('settings', { focus: false });
  const el = $('settings-content').querySelector(`[data-key="${key}"]`) || $('settings-content').querySelector(`[data-group="${g[0]}"]`);
  if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 3000); (el.querySelector('input,select,button') || el).focus({ preventScroll: true }); }
}

// ---------- notification centre ----------
let notifSelected = new Set();
function renderNotifications() {
  const m = matcherFor(searches['notif-search']);
  const list = notifications.filter(n => m.test(n.text));
  setCount(searches['notif-search'], list.length);
  $('notif-list').innerHTML = list.length ? list.map(n => `<div class="nrow ${n.read ? '' : 'unread'}"><input type="checkbox" data-n="${n.id}" aria-label="${esc(n.text)}" ${notifSelected.has(n.id) ? 'checked' : ''}><span class="ms f ${n.kind === 'error' ? 'bad' : 'ok'}">${n.kind === 'error' ? 'error' : n.kind === 'warn' ? 'warning' : n.kind === 'ok' ? 'check_circle' : 'info'}</span><div>${esc(n.text)}<small>${esc(fmtTime(n.at))}</small></div><button class="icon-btn" data-dismiss="${n.id}" aria-label="${esc(t('notif.dismiss'))}"><span class="ms">close</span></button></div>`).join('') : `<p class="muted center">${esc(t('notif.empty'))}</p>`;
  for (const c of $('notif-list').querySelectorAll('[data-n]')) c.onchange = () => c.checked ? notifSelected.add(c.dataset.n) : notifSelected.delete(c.dataset.n);
  for (const b of $('notif-list').querySelectorAll('[data-dismiss]')) b.onclick = () => { notifications = notifications.filter(n => n.id !== b.dataset.dismiss); store.set('notifications', notifications); renderNotifications(); renderBadge(); };
}
let panelReturn = null;
function openNotifications() { panelReturn = document.activeElement; $('notif-panel').hidden = false; $('scrim').hidden = false; notifications.forEach(n => n.read = true); store.set('notifications', notifications); renderBadge(); renderNotifications(); searches['notif-search']?.input.focus(); }
function closeNotifications() { $('notif-panel').hidden = true; if ($('palette').hidden && $('confirm').hidden) $('scrim').hidden = true; panelReturn?.focus?.(); }
$('bell').onclick = openNotifications; $('notif-close').onclick = closeNotifications;
$('notif-select-all').onclick = () => { notifSelected = new Set(notifications.map(n => n.id)); renderNotifications(); };
$('notif-dismiss-sel').onclick = () => { notifications = notifications.filter(n => !notifSelected.has(n.id)); notifSelected.clear(); store.set('notifications', notifications); renderNotifications(); renderBadge(); };
const exportNotifications = () => saveFile('notifications.json', JSON.stringify({ schema: 1, notifications }, null, 2));
$('notif-export').onclick = exportNotifications;
$('notif-clear').onclick = () => confirmAction({ titleKey: 'confirm.notif.title', bodyKey: 'confirm.notif.body', from: $('notif-clear'), run: () => { notifications = []; store.set('notifications', notifications); renderNotifications(); renderBadge(); } });
$('scrim').onclick = () => { if (!$('confirm').hidden) return; closePalette(); closeNotifications(); };

// ---------- two-key confirmation ----------
let confirmState = null;
function confirmAction({ titleKey, bodyKey, affectsKey, affects, run, from }) {
  confirmState = { run, from: from || document.activeElement, k1: false, k2: false };
  $('confirm-title-text').textContent = `${settings.emoji ? '' : ''}${plainBoth(titleKey)}`;
  $('confirm-body').textContent = plainBoth(bodyKey);
  const aff = affectsKey ? plainBoth(affectsKey) : affects;
  $('confirm-affects').hidden = !aff; $('confirm-affects').innerHTML = aff ? `<strong>${esc(t('confirm.affects'))}:</strong> ${esc(aff)}` : '';
  $('confirm').hidden = false; $('scrim').hidden = false;
  renderConfirm(); $('key1').focus();
}
function renderConfirm() {
  const s = confirmState; if (!s) return;
  $('key1').setAttribute('aria-pressed', String(s.k1)); $('key2').setAttribute('aria-pressed', String(s.k2));
  const armed = s.k1 && s.k2;
  $('slide').disabled = !armed; if (!armed) { $('slide').value = 0; }
  $('slide-wrap').classList.toggle('locked', !armed);
  $('slide-wrap').style.setProperty('--v', $('slide').value);
  $('slide-label').textContent = armed ? t('confirm.slide') : t('confirm.keys');
}
$('key1').onclick = () => { confirmState.k1 = !confirmState.k1; sound('tap'); renderConfirm(); };
$('key2').onclick = () => { confirmState.k2 = !confirmState.k2; sound('tap'); renderConfirm(); };
$('slide').addEventListener('input', () => { $('slide-wrap').style.setProperty('--v', $('slide').value); if (+$('slide').value >= 100 && confirmState?.k1 && confirmState?.k2) { const run = confirmState.run; closeConfirm(); run(); } });
function closeConfirm() { const from = confirmState?.from; confirmState = null; $('confirm').hidden = true; if ($('palette').hidden && $('notif-panel').hidden) $('scrim').hidden = true; from?.focus?.(); }
$('confirm-exit').onclick = closeConfirm;

// ---------- context menu ----------
let menuState = null;
function openMenu(anchor, items, { x, y } = {}) {
  closeMenu();
  const r = anchor?.getBoundingClientRect?.();
  menuState = { items, from: document.activeElement, index: 0 };
  const el = $('ctx'); el.hidden = false;
  el.innerHTML = `<div class="filter" id="ctx-filter"></div><div id="ctx-items"></div>`;
  makeSearch('ctx-filter', 'ctx.filter', renderMenuItems);
  renderMenuItems();
  const px = x ?? (r ? r.left : 100), py = y ?? (r ? r.bottom + 4 : 100);
  el.style.left = `${Math.min(px, innerWidth - el.offsetWidth - 8)}px`; el.style.top = `${Math.min(py, innerHeight - el.offsetHeight - 8)}px`;
  searches['ctx-filter'].input.focus();
}
function renderMenuItems() {
  const m = matcherFor(searches['ctx-filter']);
  const shown = menuState.items.filter(i => i.sep || m.test(i.label));
  menuState.shown = shown.filter(i => !i.sep && !i.head);
  menuState.index = Math.min(menuState.index, Math.max(0, menuState.shown.length - 1));
  const row = i => {
    const sel = menuState.shown.indexOf(i) === menuState.index;
    if (i.control === 'switch') return `<div class="mi ctl" role="menuitemcheckbox" aria-checked="${!!settings[i.setting]}" aria-selected="${sel}"><span class="ms">${i.icon}</span><span>${esc(i.label)}</span><span class="mini-switch ${settings[i.setting] ? 'on' : ''}" aria-hidden="true"></span></div>`;
    if (i.control === 'choice') return `<div class="mi ctl" role="group" aria-label="${esc(i.label)}" aria-selected="${sel}"><span class="ms">${i.icon}</span><span>${esc(i.label)}</span><span class="mseg">${i.options.map(o => `<button role="menuitemradio" aria-checked="${settings[i.setting] === o}" data-opt="${o}" tabindex="-1">${esc(optionLabel(i.setting, o))}</button>`).join('')}</span></div>`;
    if (i.head) return `<div class="psec">${esc(i.label)}</div>`;
    return `<button class="mi ${i.danger ? 'danger' : ''}" role="menuitem" aria-selected="${sel}" ${i.disabled ? 'disabled' : ''}><span class="ms">${i.icon}</span><span>${esc(i.label)}</span><kbd>${esc(i.key || '')}</kbd></button>`;
  };
  $('ctx-items').innerHTML = menuState.shown.length ? shown.map(i => i.sep ? '<div class="sep"></div>' : row(i)).join('') : `<p class="muted small center">${esc(t('ctx.none'))}</p>`;
  const rows = [...$('ctx-items').querySelectorAll('.mi')];
  rows.forEach((b, n) => {
    const it = menuState.shown.filter(x => !x.head)[n];
    if (it.control === 'switch') b.onclick = () => menuControl(it, 'toggle');
    else if (it.control === 'choice') for (const o of b.querySelectorAll('[data-opt]')) o.onclick = e => { e.stopPropagation(); menuControl(it, o.dataset.opt); };
    else b.onclick = () => { closeMenu(false); it.run(); };
  });
}
function menuControl(it, how) {
  if (it.control === 'switch') setSetting(it.setting, !settings[it.setting]);
  else if (it.control === 'choice') { const o = it.options, cur = o.indexOf(settings[it.setting]); setSetting(it.setting, how === 'next' ? o[(cur + 1) % o.length] : how === 'prev' ? o[(cur - 1 + o.length) % o.length] : how); }
  sound('tap'); renderMenuItems();
  announce(`${it.label}: ${it.control === 'switch' ? (settings[it.setting] ? 'on' : 'off') : optionLabel(it.setting, settings[it.setting])}`);
}
// A context-menu row for a setting shows that setting's own live control.
function controlFor(key) {
  const g = GROUPS.flatMap(x => x[2]).find(x => x[0] === key); if (!g || schoolHidden(key)) return null;
  const icon = { sounds: 'volume_up', theme: 'dark_mode', motion: 'motion_photos_on', focus: 'self_improvement', lowStim: 'filter_drama', time: 'schedule', oneThing: 'looks_one', momentum: 'arrow_forward', narrator: 'record_voice_over', density: 'density_medium', language: 'translate', emoji: 'mood', vocabOn: 'dictionary', dimSum: 'ramen_dining', paletteSize: 'open_in_full' }[key] || 'tune';
  if (g[1] === 'switch') return { control: 'switch', setting: key, icon, label: t(lk(key)) };
  if (g[1] === 'select') return { control: 'choice', setting: key, icon, label: t(lk(key)), options: g[2].filter(v => !(settings.school && key === 'language' && v !== 'en')) };
  return null;
}
function closeMenu(restore = true) { if (!menuState) return; const from = menuState.from; menuState = null; $('ctx').hidden = true; delete searches['ctx-filter']; if (restore) from?.focus?.(); }
function contextItems(target) {
  const items = [];
  const sel = String(getSelection()).trim();
  const ctx = target?.closest?.('[data-ctx]');
  if (sel) items.push({ icon: 'content_copy', label: t('ctx.copy'), key: 'Ctrl C', run: () => copyText(sel) }, { icon: 'search', label: t('ctx.searchThis'), run: () => openPalette(sel) });
  if (ctx?.dataset.ctx === 'url' && live()) items.push({ icon: 'content_copy', label: t('ctx.copyLink'), key: 'Ctrl Shift C', run: () => $('copy-btn').click() }, { icon: 'open_in_new', label: t('ctx.openLink'), key: 'Ctrl O', run: () => $('open-btn').click() });
  if (ctx?.dataset.ctx === 'path' && ctx.dataset.path) items.push({ icon: 'content_copy', label: t('ctx.copyPath'), run: () => copyText(ctx.dataset.path) });
  if (ctx?.dataset.ctx === 'text') items.push({ icon: 'content_copy', label: t('ctx.copy'), run: () => copyText(ctx.textContent.trim()) });
  if (ctx?.dataset.ctx === 'session') {
    const s = sessions.find(x => x.id === ctx.dataset.id);
    if (s?.publicUrl) items.push({ icon: 'content_copy', label: t('ctx.copyLink'), run: () => copyText(s.publicUrl) });
    if (s) items.push({ icon: 'download', label: t('ctx.export'), run: () => exportSessions([s], 'json') }, { icon: 'delete', label: t('ctx.remove'), danger: true, run: () => confirmAction({ titleKey: 'confirm.remove.title', bodyKey: 'confirm.remove.body', affects: s.name, run: () => { sessions = sessions.filter(x => x.id !== s.id); saveSessions(); renderSessions(); } }) });
  }
  const own = target?.closest?.('.item[data-key]')?.dataset.key;
  if (own && controlFor(own)) items.unshift(controlFor(own), { sep: true });
  if (ctx?.dataset.ctx === 'path' && selected) items.push({ icon: 'code', label: t('editor.vscode'), key: 'Ctrl Shift E', disabled: !editors.length, run: () => openProject('vscode') }, { icon: 'edit_document', label: t('editor.default'), run: () => openProject('default') }, { icon: 'folder_open', label: t('editor.reveal'), run: () => openProject('reveal') });
  if (items.length) items.push({ sep: true });
  items.push({ head: true, label: t('ctx.quick') });
  for (const k of ['theme', 'motion', 'sounds', 'focus', 'narrator']) if (k !== own) { const c = controlFor(k); if (c) items.push(c); }
  items.push({ sep: true });
  items.push({ icon: 'bolt', label: t('ctx.palette'), key: 'Ctrl Shift F', run: () => openPalette() });
  if (live()) items.push({ icon: 'stop_circle', label: t('host.stop'), key: 'Ctrl .', danger: true, run: () => $('stop-btn').click() });
  return items;
}
document.addEventListener('contextmenu', e => { if (e.target.closest('input,textarea')) return; e.preventDefault(); openMenu(null, contextItems(e.target), { x: e.clientX, y: e.clientY }); });

// ---------- command palette ----------
let paletteIndex = 0, paletteItems = [], paletteReturn = null;
const paletteSearch = { query: '', regex: false, flags: 'i' };
function allCommands() {
  const cmds = [];
  const views = [['host', 'rocket_launch', 'Ctrl 1'], ['sessions', 'history', 'Ctrl 2'], ['tools', 'construction', 'Ctrl 3'], ['features', 'auto_awesome_mosaic', 'Ctrl 4'], ['guide', 'menu_book', 'Ctrl 5'], ['settings', 'settings', 'Ctrl 6']];
  for (const [v, icon, key] of views) cmds.push({ sec: 'palette.go', icon, label: plainBoth(`nav.${v}`), key, run: () => go(v) });
  const act = (icon, labelText, run, key, ok = () => true) => ok() && cmds.push({ sec: 'palette.action', icon, label: labelText, key, run });
  act('upload_file', plainBoth(kind === 'compose' ? 'host.pickCompose' : 'host.pickDockerfile'), () => { go('host'); $('choose').click(); }, '', () => !locked());
  act('rocket_launch', plainBoth('host.hostButton'), host, 'Ctrl Enter', () => !$('host-btn').disabled);
  act('content_copy', plainBoth('host.copy'), () => $('copy-btn').click(), 'Ctrl Shift C', live);
  act('open_in_new', plainBoth('host.open'), () => $('open-btn').click(), 'Ctrl O', live);
  act('stop_circle', plainBoth('host.stop'), () => $('stop-btn').click(), 'Ctrl .', live);
  act('close', plainBoth('host.cancel'), doStop, '', () => (busy || active()) && !live());
  act('refresh', plainBoth('req.again'), checkRequirements);
  act('system_update_alt', plainBoth('upd.check'), checkUpdates);
  act('restart_alt', plainBoth('upd.restart'), () => $('upd-restart').click(), '', () => updates.state === 'ready');
  act('notifications', plainBoth('top.notifications'), openNotifications);
  act(isDark() ? 'light_mode' : 'dark_mode', plainBoth('top.theme'), () => setSetting('theme', isDark() ? 'light' : 'dark'));
  for (const f of ['json', 'csv', 'markdown']) act('download', `${plainBoth('sessions.export')} ${plainBoth('sessions.title')} (${f.toUpperCase()})`, () => exportSessions(sessions, f));
  act('tour', plainBoth('set.onboarding'), () => openOnboarding(0));
  act('restart_alt', plainBoth('set.resetAll'), () => confirmAction({ titleKey: 'confirm.reset.title', bodyKey: 'confirm.reset.body', run: () => { settings = { ...DEFAULTS }; store.set('settings', settings); recordRevision(Object.keys(DEFAULTS), 'reset all'); applySettings(); } }));
  for (const [, , items] of GROUPS) for (const [key, type] of items) if (key in DEFAULTS && !schoolHidden(key) && key !== 'schedules') cmds.push({ sec: 'palette.setting', icon: 'tune', label: plainBoth(lk(key)), desc: plainBoth(lk(key) + '.d'), toggle: type === 'switch' ? key : null, run: () => teleportSetting(key) });
  for (const a of [['vocab', 'set.vocab'], ['school', 'set.school'], ['schedules', 'set.schedules']]) if (!schoolHidden(a[0])) cmds.push({ sec: 'palette.setting', icon: 'tune', label: plainBoth(a[1]), desc: plainBoth(a[1] + '.d'), run: () => teleportSetting(a[0]) });
  for (const a of C.articles) cmds.push({ sec: 'palette.article', icon: 'article', label: a.title, desc: a.summary, run: () => openArticle(a.id) });
  return cmds;
}
function openPalette(query = '') {
  paletteReturn = document.activeElement;
  $('palette').classList.toggle('full', settings.paletteSize === 'full');
  $('palette').hidden = false; $('scrim').hidden = false;
  $('palette-input').placeholder = t('palette.placeholder'); $('palette-input').value = query; paletteSearch.query = query;
  paletteIndex = 0; renderPalette(); $('palette-input').focus();
}
function closePalette() { if ($('palette').hidden) return; $('palette').hidden = true; if ($('confirm').hidden && $('notif-panel').hidden) $('scrim').hidden = true; paletteReturn?.focus?.(); }
function renderPalette() {
  const m = matcherFor(paletteSearch);
  paletteItems = allCommands().filter(c => m.test(`${c.label} ${c.desc || ''}`)).slice(0, 80);
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  let last = '';
  $('palette-list').innerHTML = paletteItems.length ? paletteItems.map((c, i) => { const head = c.sec !== last ? `<div class="psec">${esc(t(c.sec))}</div>` : ''; last = c.sec; return `${head}<button class="pit" role="option" id="pit-${i}" aria-selected="${i === paletteIndex}" data-i="${i}"><span class="ms">${c.icon}</span><span>${esc(c.label)}${c.desc ? `<span class="d">${esc(c.desc.slice(0, 110))}</span>` : ''}</span>${c.toggle ? `<span class="mini-switch ${settings[c.toggle] ? 'on' : ''}" data-toggle="${c.toggle}" role="switch" aria-checked="${!!settings[c.toggle]}" aria-label="${esc(c.label)}"></span>` : c.key ? `<kbd>${esc(c.key)}</kbd>` : '<span></span>'}</button>`; }).join('') : `<p class="muted center">${esc(t('palette.none'))}</p>`;
  $('palette-input').setAttribute('aria-activedescendant', paletteItems.length ? `pit-${paletteIndex}` : '');
  for (const b of $('palette-list').querySelectorAll('[data-i]')) b.onclick = e => { const tg = e.target.closest('[data-toggle]'); if (tg) { e.stopPropagation(); setSetting(tg.dataset.toggle, !settings[tg.dataset.toggle]); renderPalette(); return; } runPalette(+b.dataset.i); };
  $('palette-list').querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  const host = $('palette-rx-host');
  $('palette-rx').setAttribute('aria-pressed', String(paletteSearch.regex));
  if (paletteSearch.regex) {
    if (!host.firstChild) { host.innerHTML = '<div class="rx"></div>'; }
    const fake = { ...paletteSearch, panel: host.firstChild, toggle: $('palette-rx'), onChange: renderPalette };
    renderRx(fake, paletteItems.length); paletteSearch.flags = fake.flags;
    for (const b of host.querySelectorAll('[data-flag]')) b.onclick = () => { const f = b.dataset.flag; paletteSearch.flags = paletteSearch.flags.includes(f) ? paletteSearch.flags.replace(f, '') : paletteSearch.flags + f; renderPalette(); };
  } else host.innerHTML = '';
}
function runPalette(i) { const c = paletteItems[i]; if (!c) return; closePalette(); c.run(); }
$('palette-input').addEventListener('input', () => { paletteSearch.query = $('palette-input').value; paletteIndex = 0; renderPalette(); });
$('palette-rx').onclick = () => { paletteSearch.regex = !paletteSearch.regex; renderPalette(); $('palette-input').focus(); };
$('palette-input').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1); renderPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteIndex); }
  else if (e.key === ' ' && e.altKey && paletteItems[paletteIndex]?.toggle) { e.preventDefault(); const k = paletteItems[paletteIndex].toggle; setSetting(k, !settings[k]); renderPalette(); }
});
$('open-palette').onclick = () => openPalette();

// ---------- onboarding ----------
let onbStep = 0, onbCheck = null;
function openOnboarding(step = store.get('onboardingStep', 0)) { onbStep = step; $('onboarding').hidden = false; $('scrim').hidden = false; renderOnboarding(); }
function closeOnboarding() { $('onboarding').hidden = true; $('scrim').hidden = true; store.set('onboarded', true); store.set('onboardingStep', 0); $('choose').focus(); }
function renderOnboarding() {
  store.set('onboardingStep', onbStep);
  const dots = `<div class="dots" aria-label="${esc(t('onb.step'))} ${onbStep + 1} / 3">${[0, 1, 2].map(i => `<i class="${i === onbStep ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (onbStep === 0) body = `<h1 class="h1" id="onb-title">${label('onb.title')}</h1><p class="muted">${label('onb.lead')}</p><div class="osteps">${[['folder_open', 'onb.s1'], ['rocket_launch', 'onb.s2'], ['link', 'onb.s3']].map(([ic, k]) => `<div class="ost"><span class="ic"><span class="ms f">${ic}</span></span><strong>${label(k)}</strong><span class="muted">${label(k + 'd')}</span></div>`).join('')}</div><h2 class="h2">${label('onb.langTitle')}</h2><div class="seg" role="group">${['en', 'yue', 'both'].map(v => `<button data-lang="${v}" aria-pressed="${settings.language === v}"><span class="ms check">check</span>${esc(t('set.language.' + v))}</button>`).join('')}</div><div class="item flat"><span class="lab"><strong>${label(settings.language === 'yue' ? 'set.funnyYue' : 'set.funnyEn')}</strong><span class="d">${label('set.funnyEn.d')}</span></span><span class="range"><input type="range" min="1" max="5" value="${settings.language === 'yue' ? settings.funnyYue : settings.funnyEn}" id="onb-funny" aria-label="${esc(t('set.funnyEn'))}"><output>${settings.language === 'yue' ? settings.funnyYue : settings.funnyEn}</output></span></div>`;
  if (onbStep === 1) body = `<h1 class="h1" id="onb-title">${label('onb.checkTitle')}</h1><p class="muted">${label('onb.checkLead')}</p><div class="req">${onbCheck ? [['req.docker', onbCheck.docker], ['req.compose', onbCheck.compose], ['req.tunnel', onbCheck.cloudflared || onbCheck.cloudflaredDownloadAvailable]].map(([k, ok]) => `<span class="chip static ${ok ? 'ok' : 'bad'}"><span class="ms f">${ok ? 'check_circle' : 'cancel'}</span>${esc(t(k))} · ${esc(t(ok ? 'req.ready' : 'req.missing'))}</span>`).join('') : `<span class="chip static"><span class="spin"></span>${esc(t('req.checking'))}</span>`}</div>${onbCheck?.missing?.length ? `<p class="muted small">${esc(onbCheck.missing.join(' · '))}</p>` : ''}`;
  if (onbStep === 2) body = `<h1 class="h1" id="onb-title">${label('onb.doneTitle')}</h1><p class="muted">${label('onb.doneLead')}</p>`;
  $('onboarding').innerHTML = `${dots}${body}<div class="row spread"><button class="btn text" id="onb-skip">${esc(t('onb.skip'))}</button><span class="row">${onbStep ? `<button class="btn outline" id="onb-back">${esc(t('onb.back'))}</button>` : ''}<button class="btn fill" id="onb-next">${esc(t(onbStep === 2 ? 'onb.finish' : 'onb.next'))}<span class="ms">arrow_forward</span></button></span></div>`;
  for (const b of $('onboarding').querySelectorAll('[data-lang]')) b.onclick = () => { setSetting('language', b.dataset.lang); renderOnboarding(); };
  $('onb-funny')?.addEventListener('change', e => { setSetting(settings.language === 'yue' ? 'funnyYue' : 'funnyEn', +e.target.value); renderOnboarding(); });
  $('onb-skip').onclick = closeOnboarding;
  if ($('onb-back')) $('onb-back').onclick = () => { onbStep--; renderOnboarding(); };
  $('onb-next').onclick = () => { if (onbStep === 2) return closeOnboarding(); onbStep++; renderOnboarding(); if (onbStep === 1) checkRequirements().then(r => { onbCheck = r; if (onbStep === 1) renderOnboarding(); }); };
  $('onb-next').focus();
}

// ---------- dim sum ----------
const DIM_SUM = [['Har gow', '蝦餃'], ['Siu mai', '燒賣'], ['Char siu bao', '叉燒包'], ['Cheung fun', '腸粉'], ['Lo mai gai', '糯米雞'], ['Egg tart', '蛋撻'], ['Turnip cake', '蘿蔔糕'], ['Phoenix claws', '鳳爪'], ['Steamed spare ribs', '豉汁蒸排骨'], ['Custard bun', '流沙包'], ['Sesame ball', '煎堆'], ['Taro dumpling', '芋角']];
function maybeDimSum() {
  if (!store.get('onboarded', false) || settings.school || Math.random() >= 0.1) return;
  setTimeout(() => { if (busy || active() || status.phase === 'error' || !$('onboarding').hidden) return; const [en, zh] = DIM_SUM[Math.floor(Math.random() * DIM_SUM.length)]; notify(`${plainBoth('dimsum.title')}: ${en} · ${zh}`, 'info'); }, 2500);
}


// ---------- editor hand-off ----------
let editors = [];
async function openProject(action) { try { await api.openProject(action); } catch (e) { notify(e.message, 'error'); } }
document.addEventListener('click', e => { const b = e.target.closest('[data-editor]'); if (b && !b.disabled) openProject(b.dataset.editor); });

// ---------- School mode ----------
const enc = new TextEncoder();
async function pinHash(pin, salt) { return window.Tools.sha256(enc.encode(`${salt}:${pin}`)); }
function askPin(titleKey) {
  return new Promise(resolve => {
    $('pin-title').textContent = t(titleKey); $('pin-label').textContent = t('set.school.pin');
    $('pin-ok').textContent = t('set.ok'); $('pin-cancel').textContent = t('set.cancel');
    $('pin-error').hidden = true; $('pin-input').value = '';
    $('pin').hidden = false; $('scrim').hidden = false; $('pin-input').focus();
    const done = value => { $('pin').hidden = true; $('scrim').hidden = true; $('pin-ok').onclick = $('pin-cancel').onclick = null; resolve(value); };
    $('pin-ok').onclick = () => { const v = $('pin-input').value.trim(); if (!/^\d{4,12}$/.test(v)) { $('pin-error').hidden = false; $('pin-error').textContent = t('set.school.pin'); return; } done(v); };
    $('pin-cancel').onclick = () => done(null);
    $('pin-input').onkeydown = e => { if (e.key === 'Enter') $('pin-ok').click(); if (e.key === 'Escape') done(null); };
  });
}
async function toggleSchool() {
  if (!settings.school) {
    const pin = await askPin('set.school.pinTitle'); if (!pin) return;
    const salt = crypto.randomUUID(); store.set('schoolPin', { salt, hash: await pinHash(pin, salt) });
    setSetting('school', true); notify('set.school.on', 'ok');
  } else {
    const pin = await askPin('set.school.pinOff'); if (!pin) return;
    const rec = store.get('schoolPin', null);
    if (!rec || await pinHash(pin, rec.salt) !== rec.hash) { notify('set.school.wrong', 'error'); return; }
    setSetting('school', false); notify('set.school.off', 'ok');
  }
}

// ---------- schedules ----------
const SCHED_KEYS = [['theme', ['system', 'light', 'dark']], ['motion', ['full', 'gentle', 'off']], ['sounds', ['on', 'off']], ['focus', ['on', 'off']]];
const minutes = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
function activeSchedule(now = new Date()) {
  const n = now.getHours() * 60 + now.getMinutes();
  return settings.schedules.find(r => { if (!r.on) return false; const a = minutes(r.from), b = minutes(r.to); return a <= b ? n >= a && n < b : n >= a || n < b; }) || null;
}
let lastScheduleId = store.get('scheduleActive', null);
function runSchedules() {
  const r = activeSchedule(), id = r?.id || null;
  if (id === lastScheduleId) return;
  lastScheduleId = id; store.set('scheduleActive', id);
  if (!r) return;
  const changes = {};
  for (const [k] of SCHED_KEYS) { const v = r.values[k]; if (!v) continue; changes[k] = v === 'on' ? true : v === 'off' ? false : v; }
  if (!Object.keys(changes).length) return;
  settings = { ...settings, ...changes }; store.set('settings', settings); recordRevision(Object.keys(changes), `schedule ${r.name}`); applySettings();
  notify(`${t('set.schedule.applied')}: ${r.name}`, 'info');
}
setInterval(runSchedules, 30000);

// ---------- personal vocabulary ----------
async function loadVocabulary(file) {
  if (!file) return;
  if (file.size > window.Tools.VOCAB_LIMIT) { notify(`${t('set.vocab.invalid')}: 256 KiB`, 'error'); return; }
  const result = window.Tools.validateVocabulary(await file.text());
  if (!result.ok) { notify(`${t('set.vocab.invalid')}: ${result.message}`, 'error'); return; }
  vocab = { entries: result.entries, count: result.count }; store.set('vocab', vocab);
  applySettings(); notify('set.vocab.applied', 'ok');
}
$('file-vocab').onchange = () => { loadVocabulary($('file-vocab').files[0]); $('file-vocab').value = ''; };
let dropHint;
document.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); if (!dropHint && !settings.school) { dropHint = document.createElement('div'); dropHint.className = 'drop-hint'; dropHint.textContent = t('set.vocab'); document.body.append(dropHint); } } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) { dropHint?.remove(); dropHint = null; } });
document.addEventListener('drop', e => { e.preventDefault(); dropHint?.remove(); dropHint = null; const f = e.dataTransfer?.files?.[0]; if (f && !settings.school && /\.json$/i.test(f.name)) loadVocabulary(f); });

// ---------- tools ----------
const T = window.Tools;
const toolState = { tool: 'b64', mode: 'encode', file: null, history: [], from: 'json', to: 'markdown', b64Out: '', convOut: '' };
const hex = bytes => [...bytes.slice(0, 4096)].map(b => b.toString(16).padStart(2, '0')).join(' ') + (bytes.length > 4096 ? ' …' : '');
let b64Timer;
async function runB64(record = true) {
  const input = $('b64-in').value, variant = $('b64-variant').value, encoding = $('b64-encoding').value;
  const stat = $('b64-out-stat'); stat.className = 'small';
  try {
    if (toolState.mode === 'encode') {
      const bytes = toolState.file ? toolState.file.bytes : T.textToBytes(input, encoding);
      const body = T.encodeBytes(bytes, { variant, padding: $('b64-pad').checked });
      const out = $('b64-data').checked ? `data:${toolState.file?.type || 'text/plain;charset=' + encoding};base64,${T.encodeBytes(bytes)}` : body;
      toolState.b64Out = out; $('b64-out').textContent = out;
      $('b64-in-stat').textContent = toolState.file ? `${toolState.file.name} · ${bytes.length} ${t('tools.bytes')}` : `${[...input].length} ${t('tools.chars')} · ${bytes.length} ${t('tools.bytes')}`;
      const back = T.decodeToBytes(body, { strict: false, variant });
      const ok = back.ok && await T.sha256(back.bytes) === await T.sha256(bytes);
      stat.textContent = `${out.length} ${t('tools.chars')} · ${t(ok ? 'tools.verified' : 'tools.verifyFailed')}`; stat.classList.add(ok ? 'ok-text' : 'bad-text');
    } else {
      const r = input.trim().startsWith('data:') ? T.parseDataUrl(input) : T.decodeToBytes(input, { strict: $('b64-strict').checked, variant });
      if (!r.ok) { toolState.b64Out = ''; $('b64-out').textContent = ''; stat.textContent = r.message; stat.classList.add('bad-text'); return; }
      let text; try { text = T.bytesToText(r.bytes, encoding); } catch { text = null; }
      toolState.b64Out = text ?? ''; $('b64-out').textContent = text ?? hex(r.bytes);
      $('b64-in-stat').textContent = `${input.length} ${t('tools.chars')}`;
      stat.textContent = text === null ? `${r.bytes.length} ${t('tools.bytes')} · ${t('tools.binary')}` : `${r.bytes.length} ${t('tools.bytes')}${r.mime ? ' · ' + r.mime : ''}`;
      $('b64-save').disabled = text === null;
    }
    if (record && (input || toolState.file)) { toolState.history.unshift({ at: new Date(), mode: toolState.mode, input, file: toolState.file }); toolState.history = toolState.history.slice(0, 30); renderToolHistory(); }
  } catch (e) { stat.textContent = e.message; stat.classList.add('bad-text'); }
}
function renderToolHistory() {
  $('b64-hist').innerHTML = toolState.history.map((h, i) => `<div class="hrow"><span><b>${esc(h.at.toLocaleTimeString('en-GB'))}</b> · ${esc(t(h.mode === 'encode' ? 'tools.encode' : 'tools.decode'))} · ${esc(h.file ? h.file.name : h.input.slice(0, 60))}</span><button class="chip" data-hist="${i}"><span class="ms">undo</span>${esc(t('tools.undo'))}</button></div>`).join('');
  for (const b of $('b64-hist').querySelectorAll('[data-hist]')) b.onclick = () => { const h = toolState.history[+b.dataset.hist]; toolState.mode = h.mode; toolState.file = h.file; $('b64-in').value = h.input; renderTools(); runB64(false); };
}
const FROM = ['json', 'csv', 'tsv'], TO = ['csv', 'tsv', 'markdown', 'json'];
function runConvert() {
  const input = $('conv-in').value, loss = $('conv-loss'); loss.className = 'small';
  if (!input.trim()) { $('conv-out').textContent = ''; loss.textContent = ''; $('conv-in-stat').textContent = ''; toolState.convOut = ''; return; }
  try {
    const table = T.parseTable(input, toolState.from), out = T.formatTable(table, toolState.to), notes = T.conversionLoss(toolState.from, toolState.to, table);
    toolState.convOut = out; $('conv-out').textContent = out;
    $('conv-in-stat').textContent = `${table.rows.length} ${t('tools.records')} · ${table.columns.length} ${t('tools.columns')}`;
    loss.textContent = notes.length ? notes.join(' ') : t('tools.noLoss'); loss.classList.add(notes.length ? 'muted' : 'ok-text');
  } catch (e) { toolState.convOut = ''; $('conv-out').textContent = ''; loss.textContent = e.message; loss.classList.add('bad-text'); }
}
function renderTools() {
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-selected', String(b.dataset.tool === toolState.tool));
  $('panel-b64').hidden = toolState.tool !== 'b64'; $('panel-conv').hidden = toolState.tool !== 'conv';
  $('b64-enc').setAttribute('aria-pressed', String(toolState.mode === 'encode')); $('b64-dec').setAttribute('aria-pressed', String(toolState.mode === 'decode'));
  $('b64-in').disabled = !!toolState.file && toolState.mode === 'encode';
  $('b64-save').disabled = false;
  $('conv-from').innerHTML = FROM.map(f => `<button data-from="${f}" aria-pressed="${toolState.from === f}">${f.toUpperCase()}</button>`).join('');
  $('conv-to').innerHTML = TO.map(f => `<button data-to="${f}" aria-pressed="${toolState.to === f}">${f === 'markdown' ? 'Markdown' : f.toUpperCase()}</button>`).join('');
  for (const b of $('conv-from').children) b.onclick = () => { toolState.from = b.dataset.from; renderTools(); };
  for (const b of $('conv-to').children) b.onclick = () => { toolState.to = b.dataset.to; renderTools(); };
  runB64(false); runConvert();
}
for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => { toolState.tool = b.dataset.tool; renderTools(); };
$('b64-enc').onclick = () => { toolState.mode = 'encode'; renderTools(); };
$('b64-dec').onclick = () => { toolState.mode = 'decode'; toolState.file = null; renderTools(); };
$('b64-in').addEventListener('input', () => { runB64(false); clearTimeout(b64Timer); b64Timer = setTimeout(() => runB64(true), 1200); });
for (const id of ['b64-variant', 'b64-encoding', 'b64-pad', 'b64-strict', 'b64-data']) $(id).addEventListener('change', () => runB64(false));
$('conv-in').addEventListener('input', runConvert);
$('b64-file').onclick = () => $('file-b64').click();
$('file-b64').onchange = () => {
  const f = $('file-b64').files[0]; $('file-b64').value = ''; if (!f) return;
  const reader = new FileReader();
  reader.onprogress = e => { if (e.lengthComputable) $('b64-in-stat').textContent = `${t('tools.reading')} ${Math.round(100 * e.loaded / e.total)}%`; };
  reader.onload = () => { toolState.mode = 'encode'; toolState.file = { name: f.name, type: f.type || 'application/octet-stream', bytes: new Uint8Array(reader.result) }; $('b64-in').value = ''; renderTools(); runB64(true); };
  reader.onerror = () => notify(reader.error?.message || t('error.generic'), 'error');
  reader.readAsArrayBuffer(f);
};
$('b64-copy').onclick = () => toolState.b64Out && copyText(toolState.b64Out).then(ok => ok && notify('toast.copied', 'ok'));
$('b64-save').onclick = () => toolState.b64Out && saveFile(toolState.mode === 'encode' ? 'base64.txt' : 'decoded.txt', toolState.b64Out);
$('conv-copy').onclick = () => toolState.convOut && copyText(toolState.convOut).then(ok => ok && notify('toast.copied', 'ok'));
$('conv-save').onclick = () => toolState.convOut && saveFile(`converted.${{ markdown: 'md', json: 'json', csv: 'csv', tsv: 'tsv' }[toolState.to]}`, toolState.convOut);


// ---------- updates ----------
let updates = { state: 'unavailable' }, updateDismissed = null;
function updatesCard() {
  const st = updates.state;
  return `<div class="state-card"><strong>${esc(t('upd.title'))}</strong><p class="small ${st === 'failed' ? 'bad-text' : st === 'ready' || st === 'current' ? 'ok-text' : 'muted'}" role="status">${esc(t('upd.state.' + st))}${st === 'failed' && updates.error ? `: ${esc(updates.error)}` : ''}</p>${updates.checkedAt ? `<p class="small muted">${esc(t('upd.lastCheck'))}: ${esc(fmtTime(updates.checkedAt))}</p>` : ''}<p class="small muted">${esc(t('upd.hashNote'))}</p><span class="tools"><button class="chip" data-act="check-updates" ${st === 'unavailable' || st === 'checking' || st === 'downloading' ? 'disabled' : ''}><span class="ms">refresh</span>${esc(t('upd.check'))}</button>${updates.notesUrl ? `<a class="chip" href="${esc(updates.notesUrl)}" data-external="true"><span class="ms">article</span>${esc(t('upd.notes'))}</a>` : ''}</span></div>`;
}
function renderUpdate() {
  const show = updates.state === 'ready' && updateDismissed !== (updates.version || 'ready');
  $('update-banner').hidden = !show;
  if (show) {
    $('upd-title').textContent = updates.version ? t('upd.ready').replace('{v}', updates.version) : t('upd.readyNoVersion');
    $('upd-unsigned').textContent = `${t('upd.unsigned')}${live() ? ' ' + t('upd.stopFirst') : ''}`;
    $('upd-notes').textContent = t('upd.notes'); $('upd-notes').hidden = !updates.notesUrl; $('upd-notes').href = updates.notesUrl || '#';
    $('upd-later').textContent = t('upd.later'); $('upd-restart-label').textContent = t('upd.restart');
  }
  if (view === 'settings' && settingsGroup === 'about') renderSettings();
}
async function checkUpdates() { try { updates = await api.checkUpdates(); } catch (e) { updates = { state: 'failed', error: e.message }; } renderUpdate(); }
$('upd-later').onclick = () => { updateDismissed = updates.version || 'ready'; renderUpdate(); $('main').focus(); };
$('upd-restart').onclick = () => {
  const go = async () => { try { await api.installUpdate(); } catch (e) { notify(e.message, 'error'); } };
  if (live() || active()) confirmAction({ titleKey: 'upd.restart', bodyKey: 'upd.stopFirst', affectsKey: 'confirm.stop.affects', from: $('upd-restart'), run: go }); else go();
};
api?.onUpdate?.(u => { const wasReady = updates.state === 'ready'; updates = u; if (u.state === 'ready' && !wasReady) notify(updates.version ? t('upd.ready').replace('{v}', updates.version) : t('upd.readyNoVersion'), 'info'); if (u.state === 'failed') notify(`${t('upd.state.failed')}: ${u.error || ''}`, 'warn'); renderUpdate(); });

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.ctrlKey && e.shiftKey && k === 'f') { e.preventDefault(); $('palette').hidden ? openPalette() : closePalette(); return; }
  if (e.key === 'Escape') {
    if (menuState) { closeMenu(); return; }
    if (!$('confirm').hidden) { closeConfirm(); return; }
    if (!$('palette').hidden) { closePalette(); return; }
    if (!$('notif-panel').hidden) { closeNotifications(); return; }
    if (!$('onboarding').hidden) { closeOnboarding(); return; }
  }
  const cur = menuState?.shown[menuState.index];
  if (menuState && cur?.control && (e.key === ' ' || e.key === 'Enter' || ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && cur.control === 'choice'))) {
    if (e.key === ' ' && document.activeElement?.closest('.filter') && cur.control !== 'switch') return;
    e.preventDefault(); menuControl(cur, cur.control === 'switch' ? 'toggle' : e.key === 'ArrowLeft' ? 'prev' : 'next'); return;
  }
  if (menuState && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
    e.preventDefault();
    if (e.key === 'Enter') { const it = menuState.shown[menuState.index]; if (it && !it.disabled) { closeMenu(false); it.run(); } return; }
    menuState.index = Math.max(0, Math.min(menuState.shown.length - 1, menuState.index + (e.key === 'ArrowDown' ? 1 : -1))); renderMenuItems(); const it = menuState.shown[menuState.index]; announce(it.control === 'switch' ? `${it.label}, ${settings[it.setting] ? 'on' : 'off'}` : it.control === 'choice' ? `${it.label}, ${optionLabel(it.setting, settings[it.setting])}` : it.label); return;
  }
  if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); const el = document.activeElement; const r = el?.getBoundingClientRect?.(); openMenu(el, contextItems(el), { x: r?.left || 100, y: (r?.bottom || 100) + 4 }); return; }
  if (!$('palette').hidden || !$('confirm').hidden || !$('onboarding').hidden) return;
  if (e.ctrlKey && !e.shiftKey && /^[1-6]$/.test(e.key)) { e.preventDefault(); go(VIEWS[+e.key - 1]); }
  else if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); host(); }
  else if (e.ctrlKey && e.shiftKey && k === 'c' && live()) { e.preventDefault(); $('copy-btn').click(); }
  else if (e.ctrlKey && !e.shiftKey && k === 'o' && live()) { e.preventDefault(); $('open-btn').click(); }
  else if (e.ctrlKey && e.key === '.' && live()) { e.preventDefault(); $('stop-btn').click(); }
  else if (e.ctrlKey && e.shiftKey && k === 'e' && selected && editors.length) { e.preventDefault(); openProject('vscode'); }
});
document.addEventListener('click', e => { if (menuState && !e.target.closest('#ctx')) closeMenu(false); });
$('theme-toggle').onclick = () => setSetting('theme', isDark() ? 'light' : 'dark');

// ---------- start ----------
buildBottomNav();
makeSearch('sessions-search', 'sessions.search', () => renderSessions());
makeSearch('features-search', 'features.search', () => renderFeatures());
makeSearch('guide-search', 'guide.search', () => renderGuide());
makeSearch('settings-search', 'settings.search', () => renderSettings());
makeSearch('notif-search', 'notif.search', () => renderNotifications());
applySettings();
go('host', { focus: false });
renderBadge();
(async () => {
  try { info = await api.info(); } catch {}
  try { editors = await api.editors(); } catch { editors = []; }
  try { updates = await api.updateState(); } catch {}
  renderUpdate();
  runSchedules();
  renderProvenance();
  await Promise.all([checkRequirements(), refreshStatus()]);
  if (!store.get('onboarded', false)) openOnboarding(); else maybeDimSum();
})();
setInterval(refreshStatus, 2000);
})();
