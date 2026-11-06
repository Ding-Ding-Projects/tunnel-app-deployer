'use strict';
(() => {
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const Rx = window.RegexTools, MD = window.Markdown, C = window.Content, L = window.SiteI18n;
const REPO = 'Ding-Ding-Projects/tunnel-app-deployer';
const store = { get(k, d) { try { const v = localStorage.getItem(`tadsite.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(`tadsite.${k}`, JSON.stringify(v)); } catch {} } };
const DEFAULTS = { theme: 'system', language: 'en', motion: 'full', funnyEn: 5, funnyYue: 5, emoji: false, textSize: 100, focus: false, lowStim: false };
let settings = { ...DEFAULTS, ...store.get('settings', {}) };

// ---------- language ----------
const tier = n => n <= 2 ? 's' : n === 3 ? 'w' : 'p';
const pick = (table, key, level) => { const v = table[key] ?? L.en[key]; if (v === undefined) return key; return typeof v === 'string' ? v : v[tier(level)] ?? v.s; };
function both(key) {
  const e = pick(L.en, key, settings.funnyEn), y = pick(L.yue, key, settings.funnyYue);
  if (settings.language === 'yue') return [y, null];
  if (settings.language === 'both') return [e, y === e ? null : y];
  return [e, null];
}
const t = key => both(key)[0];
const plain = key => both(key).filter(Boolean).join(' · ');
const label = key => { const [a, b] = both(key); return b ? `${esc(a)}<span class="alt" lang="yue-Hant-HK">${esc(b)}</span>` : esc(a); };

// ---------- settings ----------
const media = matchMedia('(prefers-color-scheme: dark)');
const dark = () => settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
function apply() {
  const r = document.documentElement;
  r.dataset.scheme = dark() ? 'dark' : 'light';
  r.dataset.motion = settings.motion; r.dataset.focus = settings.focus; r.dataset.lowstim = settings.lowStim;
  r.lang = settings.language === 'yue' ? 'yue-Hant-HK' : 'en';
  r.style.setProperty('--scale', String(settings.textSize / 100));
  for (const el of document.querySelectorAll('[data-i18n]')) el.innerHTML = label(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-tip]')) { el.setAttribute('aria-label', t(el.dataset.tip)); el.title = plain(el.dataset.tip); }
  for (const s of Object.values(searches)) relabel(s);
  $('page').innerHTML = ''; for (const k of ['guide-search', 'cl-search']) delete searches[k];
  renderFeatures(); route(); renderProvenance(); renderRelease();
}
function setSetting(k, v) { settings = { ...settings, [k]: v }; store.set('settings', settings); apply(); }
media.addEventListener('change', () => settings.theme === 'system' && apply());

// ---------- toasts ----------
function toast(text, kind = 'info') {
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `${settings.emoji ? `<span aria-hidden="true">${kind === 'dimsum' ? '🥟' : '💡'}</span>` : '<span class="ms">info</span>'}<span class="msg">${esc(text)}</span><button aria-label="${esc(t('toast.dismiss'))}"><span class="ms">close</span></button>`;
  const remove = () => el.remove();
  el.querySelector('button').onclick = remove;
  $('toasts').append(el); setTimeout(remove, 6000);
}

// ---------- search with regex builder ----------
const searches = {};
function makeSearch(slotId, key, onChange) {
  const slot = $(slotId); if (!slot) return null;
  const s = searches[slotId] = { query: '', regex: false, flags: 'i', key, onChange };
  slot.innerHTML = `<div class="search"><label class="search-box"><span class="ms">search</span><input type="search" autocomplete="off" spellcheck="false"><button class="chip rx-toggle" aria-pressed="false">.*</button></label><div class="rx" hidden></div></div>`;
  s.input = slot.querySelector('input'); s.toggle = slot.querySelector('.rx-toggle'); s.panel = slot.querySelector('.rx');
  s.input.oninput = () => { s.query = s.input.value; renderRx(s); onChange(); };
  s.toggle.onclick = e => { e.preventDefault(); s.regex = !s.regex; renderRx(s); onChange(); s.input.focus(); };
  relabel(s); return s;
}
function relabel(s) { s.input.placeholder = t(s.key); s.input.setAttribute('aria-label', t(s.key)); s.toggle.setAttribute('aria-label', t('rx.toggle')); s.toggle.title = plain('rx.toggle'); }
const matcher = s => Rx.matcher(s?.query || '', { regex: !!s?.regex, flags: s?.flags || 'i' });
function renderRx(s, count) {
  s.toggle.setAttribute('aria-pressed', String(s.regex)); s.panel.hidden = !s.regex; if (!s.regex) return;
  const m = matcher(s);
  const status = !s.query ? t('rx.empty') : m.ok ? (count === undefined ? '' : `${count} ${t('rx.matches')}`) : t(m.reason === 'unsafe' ? 'rx.unsafe' : m.reason === 'tooLong' ? 'rx.tooLong' : 'rx.invalid');
  s.panel.innerHTML = `<div class="rx-flags"><span class="small muted">${esc(t('rx.flags'))}</span>${Rx.FLAGS.map(f => `<button class="chip" data-flag="${f}" aria-pressed="${s.flags.includes(f)}">${f}</button>`).join('')}<span class="rx-status ${m.ok ? '' : 'bad'}" role="status">${esc(status)}</span></div><div class="rx-tokens">${(s.query ? Rx.explain(s.query) : []).slice(0, 40).map(k => `<span class="tok ${k.kind}"><code>${esc(k.text)}</code><span>${esc(k.desc)}</span></span>`).join('')}</div>`;
  for (const b of s.panel.querySelectorAll('[data-flag]')) b.onclick = () => { const f = b.dataset.flag; s.flags = s.flags.includes(f) ? s.flags.replace(f, '') : s.flags + f; renderRx(s); s.onChange(); };
}
const count = (s, n) => { if (s?.regex && s.query && matcher(s).ok) { const el = s.panel.querySelector('.rx-status'); if (el) el.textContent = `${n} ${t('rx.matches')}`; } };

// ---------- features ----------
let filter = 'all', showAll = false;
function renderFeatures() {
  const F = C.features, s = searches['feat-search'], m = matcher(s);
  const n = st => F.items.filter(i => i.status === st).length;
  $('feat-count').textContent = `${n('built') + n('partial')} / ${F.items.length}`;
  const [b, pa] = $('feat-track').children;
  requestAnimationFrame(() => { b.style.width = `${100 * n('built') / F.items.length}%`; pa.style.width = `${100 * n('partial') / F.items.length}%`; });
  $('feat-filters').innerHTML = ['all', 'built', 'partial', 'planned', 'na'].map(k => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${esc(k === 'all' ? t('feat.all') : t('status.' + k))} · ${k === 'all' ? F.items.length : n(k)}</button>`).join('');
  for (const x of $('feat-filters').querySelectorAll('[data-f]')) x.onclick = () => { filter = x.dataset.f; renderFeatures(); };
  const shown = F.items.filter(i => (filter === 'all' || i.status === filter) && m.test(`${i.title} ${i.note}`));
  count(s, shown.length);
  const limited = !showAll && filter === 'all' && !s?.query;
  const visible = new Set((limited ? shown.slice(0, 12) : shown).map(i => i.id));
  $('feat-groups').innerHTML = F.groups.map(([g, name]) => { const items = shown.filter(i => i.group === g && visible.has(i.id)); return items.length ? `<section class="fgroup"><h3>${esc(name)}</h3><div class="fcards">${items.map((i, k) => { const inner = `<span class="st ${i.status}">${esc(t('status.' + i.status))}</span><h4>${esc(i.title)}</h4><p>${esc(i.note)}</p>${i.article ? `<span class="more">${esc(t('feat.read'))} →</span>` : ''}`; return i.article ? `<a class="fc" href="#article/${esc(i.article)}">${inner}</a>` : `<div class="fc">${inner}</div>`; }).join('')}</div></section>` : ''; }).join('') + (limited ? `<p><button class="btn outline" id="feat-more"><span class="ms">expand_more</span>${esc(t('feat.all'))} · ${shown.length}</button></p>` : '') || `<p class="muted">${esc(t('pal.none'))}</p>`;
  $('feat-more')?.addEventListener('click', () => { showAll = true; renderFeatures(); });
}

// ---------- pages ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const page = h === 'guide' || h.startsWith('article/') ? 'guide' : h === 'changelog' ? 'changelog' : null;
  $('home').hidden = !!page; $('page').hidden = !page;
  for (const a of document.querySelectorAll('.links a')) a.setAttribute('aria-current', String(a.getAttribute('href') === `#${page}`));
  if (page === 'guide') renderGuide(h.startsWith('article/') ? h.slice(8) : null);
  if (page === 'changelog') renderChangelog();
}
let guideId = null;
function renderGuide(id) {
  guideId = C.articles.some(a => a.id === id) ? id : guideId || C.articles.find(a => a.id === 'getting-started')?.id || C.articles[0].id;
  if (!$('guide-search')) {
    $('page').innerHTML = `<div class="guide"><nav class="guide-nav" aria-label="Articles"><h1 class="h3">${label('guide.title')}</h1><div class="search-slot" id="guide-search"></div><div id="guide-list"></div><p class="small muted">${label('guide.lang')}</p></nav><article class="article" id="guide-article" tabindex="-1"></article></div>`;
    makeSearch('guide-search', 'guide.search', () => renderGuide(guideId));
  }
  const s = searches['guide-search'], m = matcher(s);
  const list = C.articles.filter(a => m.test(`${a.title} ${a.body}`)); count(s, list.length);
  $('guide-list').innerHTML = list.map(a => `<a class="alink" href="#article/${a.id}" aria-current="${a.id === guideId}"><strong>${esc(a.title)}</strong><span>${esc(a.summary.slice(0, 90))}</span></a>`).join('') || `<p class="muted">${esc(t('guide.none'))}</p>`;
  const a = C.articles.find(x => x.id === guideId);
  const el = $('guide-article');
  if (el.dataset.id !== a.id) {
    el.dataset.id = a.id;
    el.innerHTML = `<h1>${esc(a.title)}</h1>${MD.render(a.body).replace(/href="#article\//g, 'href="#article/')}<h2>${esc(t('guide.related'))}</h2><div class="related">${a.related.map(r => C.articles.find(x => x.id === r)).filter(Boolean).map(r => `<a href="#article/${r.id}"><span class="ms">article</span>${esc(r.title)}</a>`).join('')}</div>`;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    if (location.hash.startsWith('#article/')) { scrollTo({ top: 0 }); el.focus({ preventScroll: true }); }
  }
}
let clFrom = '', clTo = '';
function renderChangelog() {
  if (!$('cl-search')) {
    $('page').innerHTML = `<h1 class="h2">${label('cl.title')}</h1><div class="dates"><label>${esc(t('cl.from'))} <input type="date" id="cl-from"></label><label>${esc(t('cl.to'))} <input type="date" id="cl-to"></label></div><div class="search-slot" id="cl-search"></div><div class="cl" id="cl-list"></div>`;
    makeSearch('cl-search', 'cl.search', renderChangelog);
    $('cl-from').onchange = e => { clFrom = e.target.value; renderChangelog(); };
    $('cl-to').onchange = e => { clTo = e.target.value; renderChangelog(); };
  }
  const s = searches['cl-search'], m = matcher(s);
  const list = C.changelog.entries.filter(e => (!clFrom || e.date >= clFrom) && (!clTo || e.date <= clTo) && m.test(`${e.version} ${e.note} ${Object.values(e.changes).flat().join(' ')}`));
  count(s, list.length);
  $('cl-list').innerHTML = list.map(e => `<div class="rel"><div class="row spread"><strong>${esc(e.version)} · ${esc(e.date)}</strong>${e.commit ? `<a class="mono" href="https://github.com/${REPO}/commit/${esc(e.commit)}">${esc(e.commit.slice(0, 7))}</a>` : `<span class="small muted">${esc(t('cl.this'))}</span>`}</div><p class="small muted">${esc(e.note)}</p>${Object.entries(e.changes).map(([k, v]) => `<h4>${esc(k)}</h4><ul>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>`).join('') || `<p class="muted">${esc(t('pal.none'))}</p>`;
}
addEventListener('hashchange', () => { const leaving = $('home').hidden; route(); if (!$('home').hidden && leaving) { const target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); else scrollTo({ top: 0 }); } });
document.addEventListener('click', e => { const a = e.target.closest('[data-route="home"]'); if (a) { e.preventDefault(); history.pushState(null, '', location.pathname); route(); scrollTo({ top: 0 }); } });

// ---------- release and provenance (from the public GitHub API) ----------
let release, contentCommit;
const fmt = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium', timeZoneName: 'short' }); };
async function loadRemote() {
  try { const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } }); release = r.ok ? await r.json() : null; } catch { release = null; }
  try { const r = await fetch(`https://api.github.com/repos/${REPO}/commits?path=docs&per_page=1`); const j = r.ok ? await r.json() : []; contentCommit = j[0] || null; } catch { contentCommit = null; }
  renderRelease(); renderProvenance();
}
function renderRelease() {
  const info = $('release-info'), btn = $('download-btn');
  if (release === undefined) return;
  const asset = release?.assets?.find(a => a.name.endsWith('.exe'));
  if (release && asset) {
    btn.href = asset.browser_download_url; btn.removeAttribute('aria-disabled');
    $('download-label').textContent = `${t('nav.download')} ${release.tag_name}`;
    info.textContent = `${t('hero.release')}: ${release.tag_name} · ${fmt(release.published_at)}`;
  } else { info.textContent = t('hero.noRelease'); btn.href = `https://github.com/${REPO}/releases`; }
}
function renderProvenance() {
  const el = $('provenance');
  el.textContent = release ? `${t('hero.release')}: ${release.tag_name} · ${fmt(release.published_at)}` : contentCommit ? `${t('hero.updated')}: ${fmt(contentCommit.commit?.committer?.date)} · ${contentCommit.sha.slice(0, 7)}` : '';
}

// ---------- site settings ----------
const SET = [['theme', 'select', ['system', 'light', 'dark']], ['language', 'select', ['en', 'yue', 'both']], ['motion', 'select', ['full', 'gentle', 'off']], ['funnyEn', 'range', 1, 5], ['funnyYue', 'range', 1, 5], ['emoji', 'switch'], ['textSize', 'range', 90, 150, 10], ['focus', 'switch'], ['lowStim', 'switch']];
let settingsReturn;
function renderSettings() {
  const m = matcher(searches['set-search']);
  const items = SET.filter(([k]) => m.test(plain(`set.${k}`)));
  count(searches['set-search'], items.length);
  $('set-list').innerHTML = items.map(([k, type, a, b, step]) => {
    const id = `set-${k}`;
    const control = type === 'select' ? `<select class="select" id="${id}" data-k="${k}">${a.map(v => `<option value="${v}" ${settings[k] === v ? 'selected' : ''}>${esc(t(`set.${k}.${v}`))}</option>`).join('')}</select>` : type === 'switch' ? `<input type="checkbox" role="switch" class="switch" id="${id}" data-k="${k}" ${settings[k] ? 'checked' : ''}>` : `<span class="range"><input type="range" id="${id}" data-k="${k}" min="${a}" max="${b}" step="${step || 1}" value="${settings[k]}"><output>${settings[k]}${k === 'textSize' ? '%' : ''}</output></span>`;
    return `<div class="sitem"><label for="${id}">${label(`set.${k}`)}</label>${control}</div>`;
  }).join('') || `<p class="muted">${esc(t('set.none'))}</p>`;
  for (const el of $('set-list').querySelectorAll('[data-k]')) el.onchange = () => { setSetting(el.dataset.k, el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value); renderSettings(); $(`set-${el.dataset.k}`)?.focus(); toast(t('toast.saved')); };
}
function openSettings() { settingsReturn = document.activeElement; $('settings').hidden = false; $('scrim').hidden = false; renderSettings(); searches['set-search'].input.focus(); }
function closeSettings() { $('settings').hidden = true; if ($('palette').hidden) $('scrim').hidden = true; settingsReturn?.focus?.(); }
$('open-settings').onclick = openSettings; $('close-settings').onclick = closeSettings;
$('reset-settings').onclick = () => { settings = { ...DEFAULTS }; store.set('settings', settings); apply(); renderSettings(); toast(t('toast.reset')); };

// ---------- command palette ----------
const pal = { query: '', regex: false, flags: 'i', index: 0, items: [] };
let palReturn;
function commands() {
  const go = hash => () => { location.hash = hash; };
  const out = [['how', 'nav.how'], ['features', 'nav.features'], ['limits', 'nav.limits'], ['download', 'nav.download'], ['guide', 'nav.guide'], ['changelog', 'nav.changelog']].map(([h, k]) => ({ sec: 'pal.go', icon: 'arrow_forward', label: plain(k), run: go(h) }));
  out.push({ sec: 'pal.action', icon: 'tune', label: plain('nav.settings'), run: openSettings });
  out.push({ sec: 'pal.action', icon: dark() ? 'light_mode' : 'dark_mode', label: plain('set.theme'), run: () => setSetting('theme', dark() ? 'light' : 'dark') });
  for (const [k] of SET) out.push({ sec: 'pal.setting', icon: 'settings', label: plain(`set.${k}`), run: () => { openSettings(); $(`set-${k}`)?.focus(); } });
  for (const a of C.articles) out.push({ sec: 'pal.article', icon: 'article', label: a.title, desc: a.summary, run: go(`article/${a.id}`) });
  return out;
}
function renderPalette() {
  const m = matcher(pal);
  pal.items = commands().filter(c => m.test(`${c.label} ${c.desc || ''}`)).slice(0, 60);
  pal.index = Math.min(pal.index, Math.max(0, pal.items.length - 1));
  let last = '';
  $('pal-list').innerHTML = pal.items.map((c, i) => { const head = c.sec !== last ? `<div class="psec">${esc(t(c.sec))}</div>` : ''; last = c.sec; return `${head}<button class="pit" role="option" id="pit-${i}" aria-selected="${i === pal.index}" data-i="${i}"><span class="ms">${c.icon}</span><span>${esc(c.label)}${c.desc ? `<span class="d">${esc(c.desc.slice(0, 100))}</span>` : ''}</span></button>`; }).join('') || `<p class="muted pad">${esc(t('pal.none'))}</p>`;
  $('pal-input').setAttribute('aria-activedescendant', pal.items.length ? `pit-${pal.index}` : '');
  for (const b of $('pal-list').querySelectorAll('[data-i]')) b.onclick = () => runPal(+b.dataset.i);
  $('pal-list').querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  $('pal-rx').setAttribute('aria-pressed', String(pal.regex));
  const host = $('pal-rx-host');
  if (pal.regex) { if (!host.firstChild) host.innerHTML = '<div class="rx"></div>'; const s = { ...pal, panel: host.firstChild, toggle: $('pal-rx'), onChange: renderPalette }; renderRx(s, pal.items.length); for (const b of host.querySelectorAll('[data-flag]')) b.onclick = () => { const f = b.dataset.flag; pal.flags = pal.flags.includes(f) ? pal.flags.replace(f, '') : pal.flags + f; renderPalette(); }; }
  else host.innerHTML = '';
}
function openPalette() { palReturn = document.activeElement; $('palette').hidden = false; $('scrim').hidden = false; $('pal-input').placeholder = t('pal.placeholder'); $('pal-input').value = pal.query; renderPalette(); $('pal-input').focus(); }
function closePalette() { $('palette').hidden = true; if ($('settings').hidden) $('scrim').hidden = true; palReturn?.focus?.(); }
function runPal(i) { const c = pal.items[i]; if (!c) return; closePalette(); c.run(); }
$('pal-input').oninput = () => { pal.query = $('pal-input').value; pal.index = 0; renderPalette(); };
$('pal-rx').onclick = () => { pal.regex = !pal.regex; renderPalette(); $('pal-input').focus(); };
$('pal-input').onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); pal.index = Math.min(pal.index + 1, pal.items.length - 1); renderPalette(); } else if (e.key === 'ArrowUp') { e.preventDefault(); pal.index = Math.max(pal.index - 1, 0); renderPalette(); } else if (e.key === 'Enter') { e.preventDefault(); runPal(pal.index); } };
$('open-palette').onclick = openPalette;
$('scrim').onclick = () => { closePalette(); closeSettings(); };
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('palette').hidden ? openPalette() : closePalette(); }
  else if (e.key === 'Escape') { if (!$('palette').hidden) closePalette(); else if (!$('settings').hidden) closeSettings(); }
});

// ---------- motion: reveal on scroll ----------
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => { for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }, { threshold: .12 }) : null;
for (const el of document.querySelectorAll('.reveal')) io ? io.observe(el) : el.classList.add('in');

// ---------- start ----------
makeSearch('feat-search', 'nav.search', renderFeatures);
makeSearch('set-search', 'set.search', renderSettings);
apply();
loadRemote();
const DIM = [['Har gow', '蝦餃'], ['Siu mai', '燒賣'], ['Char siu bao', '叉燒包'], ['Cheung fun', '腸粉'], ['Egg tart', '蛋撻'], ['Turnip cake', '蘿蔔糕']];
if (Math.random() < .1) setTimeout(() => { const [e, z] = DIM[Math.floor(Math.random() * DIM.length)]; toast(`${plain('dimsum.title')}: ${e} · ${z}`, 'dimsum'); }, 3000);
})();
