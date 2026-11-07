'use strict';
// Shared helpers for the screen scripts (clip-matrix.js, ui-audit.js).
// stageApp() copies the real renderer next to the scripted backend and driver used for screenshots,
// so every check runs against the shipped HTML, CSS and JavaScript with a backend that never hosts anything.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const here = __dirname, root = path.resolve(here, '../..');

function stageApp() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tad-screens-'));
  fs.cpSync(path.join(root, 'src/renderer'), path.join(work, 'app'), { recursive: true });
  fs.copyFileSync(path.join(here, 'scripted-backend.js'), path.join(work, 'app/mock.js'));
  fs.copyFileSync(path.join(here, 'drive.js'), path.join(work, 'app/after.js'));
  const index = path.join(work, 'app/index.html');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8')
    .replace('<script defer src="i18n.js"></script>', '<script src="mock.js"></script><script defer src="i18n.js"></script>')
    .replace('<script defer src="app.js"></script>', '<script defer src="app.js"></script><script defer src="after.js"></script>'));
  return { index, cleanup: () => fs.rmSync(work, { recursive: true, force: true }) };
}

const SETTINGS_GROUPS = ['appearance', 'motion', 'language', 'schedules', 'focus', 'access', 'notifications', 'data', 'about'];

// Every app surface: [name, query]. The query drives scripted-backend.js and drive.js.
const APP_SURFACES = [
  ['host-idle', 'state=ready'],
  ['host-missing', 'state=ready&prereq=missing'],
  ['host-picked', 'state=ready&act=picked'],
  ['host-picked-long', 'state=ready&act=picked&long=1'],
  ['host-building', 'state=building'],
  ['host-live', 'state=live'],
  ['host-failed', 'state=failed'],
  ['host-confirm', 'state=live&act=confirm'],
  ['host-menu', 'state=live&act=ctx'],
  ['host-toast', 'state=live&act=toast'],
  ['update-ready', 'state=ready&upd=ready'],
  ['sessions', 'state=ready&view=sessions'],
  ['sessions-long', 'state=ready&view=sessions&long=1'],
  ['sessions-chart', 'state=ready&view=sessions&act=chart'],
  ['sessions-export', 'state=ready&view=sessions&act=export'],
  ['tools-base64', 'state=ready&view=tools&act=b64'],
  ['tools-base64-files', 'state=ready&view=tools&act=b64drop'],
  ['tools-base64-working', 'state=ready&view=tools&act=b64work&b64=working'],
  ['tools-convert', 'state=ready&view=tools&act=conv'],
  ['tools-auth', 'state=ready&view=tools&act=auth'],
  ['tools-auth-add', 'state=ready&view=tools&act=authadd'],
  ['tools-auth-error', 'state=ready&view=tools&act=authbad'],
  ['tools-auth-novault', 'state=ready&view=tools&act=auth&vault=off'],
  ['features', 'state=ready&view=features'],
  ['guide', 'state=ready&view=guide&act=article'],
  ...SETTINGS_GROUPS.map(g => [`settings-${g}`, `state=ready&view=settings&group=${g}`]),
  ['settings-schedule-rule', 'state=ready&view=settings&group=schedules&act=schedadd'],
  ['settings-update-failed', 'state=ready&view=settings&group=about&upd=failed'],
  ['settings-regex', 'state=ready&view=settings&act=rx'],
  ['settings-menu', 'state=ready&view=settings&act=ctxset'],
  ['school-pin', 'state=ready&view=settings&act=pin'],
  ['palette', 'state=ready&act=palette&q=th'],
  ['notifications', 'state=ready&act=notifs&notifs=1'],
  ['tabs', 'state=ready&act=tabs'],
  ['onboarding-1', 'state=onboarding&onb=0'],
  ['onboarding-2', 'state=onboarding&onb=1'],
  ['onboarding-3', 'state=onboarding&onb=2']
];

// Website surfaces: [name, hash, action]. Actions run after the page settles.
const SITE_SURFACES = [
  ['site-home', '', null],
  ['site-guide', '#guide', null],
  ['site-article', '#article/safety', null],
  ['site-changelog', '#changelog', null],
  ['site-palette', '', '#open-palette'],
  ['site-settings', '', '#open-settings']
];

const VIEWPORTS = { phone: [390, 844], tablet: [768, 1024], scaled: [960, 540], desktop: [1440, 900] };

// Runs in the page: visible text elements whose own text is cut off, or that end past the window edge.
// Horizontal scroll containers (other than the main pane, which scrolls vertically) are intentional.
function findClipping() {
  const out = [], vw = document.documentElement.clientWidth;
  const label = el => (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') || el.tagName.toLowerCase();
  const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && p !== document.documentElement && p !== document.body && !p.classList.contains('main')) return true; return false; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[hidden],.sr-only,svg,pre,textarea')) continue;
    if (el.closest('details:not([open])') && !el.closest('summary')) continue; // a closed fold renders none of its content
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) continue; // empty or visually hidden
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) continue;
    const ellipsis = cs.textOverflow === 'ellipsis';
    if (!ellipsis && el.scrollWidth > el.clientWidth + 1 && ['hidden', 'clip'].includes(cs.overflowX)) out.push({ kind: 'cut', el: label(el), text: el.textContent.trim().slice(0, 60) });
    if (r.right > vw + 1 && !scrolls(el)) out.push({ kind: 'offscreen', el: label(el), text: el.textContent.trim().slice(0, 60), right: Math.round(r.right), vw });
  }
  return out;
}

// Runs in the page: pairs of visible text elements that overlap each other. Text is clipped to every
// ancestor that hides overflow, and text in different fixed or sticky layers (bars, menus, dialogs) is
// not compared, because those layers cover scrolling content on purpose.
function findOverlaps() {
  const label = el => (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') || el.tagName.toLowerCase();
  const layerOf = el => { for (let p = el; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') return p; } return null; };
  const visibleRect = (el, r) => {
    let { left, top, right, bottom } = r;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const c = p.getBoundingClientRect(); left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom); }
    }
    return { left, top, right, bottom };
  };
  const items = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[hidden],.sr-only,svg,[aria-hidden=true]')) continue;
    if (el.closest('details:not([open])') && !el.closest('summary')) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
    const range = document.createRange(); range.selectNodeContents(el);
    for (const raw of range.getClientRects()) { const r = visibleRect(el, raw); if (r.right - r.left > 2 && r.bottom - r.top > 2) items.push({ el, r, layer: layerOf(el) }); }
  }
  const out = [], seen = new Set();
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el) || a.layer !== b.layer) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 3 && h > 3) {
      const key = label(a.el) + '|' + label(b.el); if (seen.has(key)) continue; seen.add(key);
      out.push({ a: label(a.el), at: a.el.textContent.trim().slice(0, 30), b: label(b.el), bt: b.el.textContent.trim().slice(0, 30) });
    }
  }
  return out;
}

// Runs in the page after each Tab press: what has focus, whether it is visible, named and visibly focused.
function describeFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return { none: true };
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const label = (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') || el.tagName.toLowerCase();
  const byId = id => document.getElementById(id)?.textContent || '';
  const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(byId).join(' ');
  const name = (el.getAttribute('aria-label') || labelledBy || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('title') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
  const parent = el.parentElement, pcs = parent && getComputedStyle(parent);
  const parentRing = !!parent && parent.matches(':focus-within') && ((pcs.outlineStyle !== 'none' && parseFloat(pcs.outlineWidth) > 0) || pcs.boxShadow !== 'none');
  const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden' && !el.closest('[aria-hidden=true]');
  const modal = document.querySelector('.dialog:not([hidden])[aria-modal=true]');
  return { label, name, ring: ring || parentRing, visible, outsideModal: !!modal && !modal.contains(el) };
}

module.exports = { stageApp, APP_SURFACES, SITE_SURFACES, SETTINGS_GROUPS, VIEWPORTS, findClipping, findOverlaps, describeFocus, root };
