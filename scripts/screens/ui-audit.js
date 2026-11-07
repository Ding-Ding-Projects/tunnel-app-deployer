'use strict';
// Interface audit. Opens every app surface (with the scripted backend) and every website surface in
// headless Chromium, in dark and light themes, English, Cantonese and both languages, at phone, tablet,
// 960 x 540 (a 1080p screen at 200 percent scale) and desktop sizes. It reports:
// - console errors, including styles or scripts blocked by the Content Security Policy
// - accessibility violations found by axe-core (WCAG 2.0, 2.1 and 2.2 A and AA, plus best practices)
// - clipped or off-screen text and overlapping text
// - keyboard focus problems: focus on hidden or unnamed controls, no visible focus, focus escaping a dialog
// Usage: node scripts/screens/ui-audit.js [--quick] [--only name,name] [--shots <folder>] [--json <file>]
// Exits 1 when any problem is found.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const { stageApp, APP_SURFACES, SITE_SURFACES, VIEWPORTS, findClipping, findOverlaps, describeFocus, root } = require('./stage');

const args = process.argv.slice(2), arg = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const quick = args.includes('--quick'), shots = arg('--shots'), jsonOut = arg('--json'), only = arg('--only')?.split(',');
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// Contrast changes with the theme; layout changes with language and width.
function combos() {
  const out = [];
  for (const vp of Object.keys(VIEWPORTS)) for (const [theme, language] of [['dark', 'en'], ['light', 'en'], ['dark', 'both']]) out.push({ vp, theme, language });
  out.push({ vp: 'phone', theme: 'dark', language: 'yue' }, { vp: 'desktop', theme: 'dark', language: 'yue' });
  return quick ? out.filter(c => (c.vp === 'desktop' || c.vp === 'phone') && c.language !== 'yue') : out;
}

async function focusWalk(page) {
  const steps = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(describeFocus);
    if (i > 2 && steps.length && !d.none && d.label === steps[0].label && d.name === steps[0].name) break;
    steps.push(d);
  }
  const problems = [], seen = new Set();
  const add = p => { const k = JSON.stringify(p); if (!seen.has(k)) { seen.add(k); problems.push(p); } };
  for (const s of steps) {
    if (s.none) continue;
    if (!s.visible) add({ kind: 'focus on a hidden control', el: s.label, name: s.name });
    else if (!s.ring) add({ kind: 'no visible focus', el: s.label, name: s.name });
    if (!s.name) add({ kind: 'unnamed control', el: s.label });
    if (s.outsideModal) add({ kind: 'focus escapes the dialog', el: s.label, name: s.name });
  }
  return { stops: steps.length, problems };
}

async function runOne(browser, job, paths) {
  const [width, height] = VIEWPORTS[job.vp];
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', colorScheme: job.theme });
  if (job.kind === 'site') await context.addInitScript(s => { try { localStorage.setItem('tadsite.settings', s); } catch {} }, JSON.stringify({ theme: job.theme, language: job.language }));
  // The app never reaches the network and the website must work offline, so outside requests are refused.
  await context.route(/^https?:/, r => r.abort());
  const page = await context.newPage(), errors = [], network = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/^Failed to load resource/.test(m.text()) && /^https?:/.test(m.location().url || '')) network.push(m.location().url); else errors.push(m.text().slice(0, 240));
  });
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 240)));
  try {
    if (job.kind === 'app') {
      const settings = encodeURIComponent(JSON.stringify({ theme: job.theme, language: job.language }));
      await page.goto(`file://${paths.app}?${job.query}&settings=${settings}`);
      await page.waitForFunction(() => window.__screens?.done, null, { timeout: 15000 });
    } else {
      await page.goto(`file://${paths.site}${job.hash}`);
      await page.waitForTimeout(500);
      if (job.action) await page.click(job.action);
    }
    await page.waitForTimeout(350);
    await page.evaluate(axeSource);
    const axe = await page.evaluate(async tags => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'], preload: false });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
        nodes: v.nodes.slice(0, 5).map(n => ({ target: n.target.join(' '), why: (n.failureSummary || '').split('\n').slice(1, 3).join(' ').slice(0, 200) })) }));
    }, AXE_TAGS);
    const clipping = await page.evaluate(findClipping), overlaps = await page.evaluate(findOverlaps);
    if (shots) await page.screenshot({ path: path.join(shots, `${job.name}__${job.vp}__${job.theme}__${job.language}.jpg`), type: 'jpeg', quality: 75 });
    const focus = job.vp === 'desktop' && job.theme === 'dark' && job.language === 'en' ? await focusWalk(page) : null;
    return { ...job, errors, network, axe, clipping, overlaps, focus };
  } catch (e) {
    return { ...job, errors: [...errors, `The audit could not stage this surface: ${String(e.message).split('\n')[0].slice(0, 200)}`], axe: [], clipping: [], overlaps: [], focus: null };
  } finally { await context.close(); }
}

(async () => {
  const staged = stageApp(), paths = { app: staged.index, site: path.join(root, 'docs/index.html') };
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const jobs = [];
  for (const c of combos()) {
    for (const [name, query] of APP_SURFACES) jobs.push({ kind: 'app', name, query, ...c });
    for (const [name, hash, action] of SITE_SURFACES) jobs.push({ kind: 'site', name, hash, action, ...c });
  }
  const todo = only ? jobs.filter(j => only.some(o => j.name === o || j.name.startsWith(o + '-'))) : jobs;
  const browser = await chromium.launch(), results = [];
  try {
    let next = 0;
    const worker = async () => { while (next < todo.length) { const job = todo[next++]; results.push(await runOne(browser, job, paths)); } };
    await Promise.all(Array.from({ length: 6 }, worker));
  } finally { await browser.close(); staged.cleanup(); }

  const where = r => `${r.name} (${r.vp}, ${r.theme}, ${r.language})`;
  const byRule = new Map();
  for (const r of results) for (const v of r.axe) {
    const e = byRule.get(v.id) || { id: v.id, impact: v.impact, help: v.help, places: [], examples: [] };
    e.places.push(where(r)); if (e.examples.length < 4) e.examples.push(...v.nodes.slice(0, 2).map(n => `${r.name}: ${n.target} ${n.why}`));
    byRule.set(v.id, e);
  }
  const problems = { errors: results.filter(r => r.errors.length), axe: [...byRule.values()], clipping: results.filter(r => r.clipping.length), overlaps: results.filter(r => r.overlaps.length), focus: results.filter(r => r.focus?.problems.length) };
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ results, axe: problems.axe }, null, 1));
  console.log(`Audited ${results.length} combinations of ${new Set(todo.map(j => j.name)).size} surfaces.`);
  for (const r of problems.errors) console.log(`Console: ${where(r)}: ${r.errors.join(' | ')}`);
  for (const v of problems.axe) console.log(`Accessibility [${v.impact}] ${v.id}: ${v.help} (${v.places.length} places, e.g. ${v.places.slice(0, 3).join('; ')})\n    ${v.examples.join('\n    ')}`);
  for (const r of problems.clipping) for (const c of r.clipping) console.log(`Clipping: ${where(r)}: ${c.kind} ${c.el} "${c.text}"`);
  for (const r of problems.overlaps) for (const o of r.overlaps) console.log(`Overlap: ${where(r)}: ${o.a} "${o.at}" / ${o.b} "${o.bt}"`);
  for (const r of problems.focus) for (const f of r.focus.problems) console.log(`Focus: ${r.name}: ${f.kind} ${f.el}${f.name ? ` "${f.name}"` : ''}`);
  const total = problems.errors.length + problems.axe.length + problems.clipping.length + problems.overlaps.length + problems.focus.length;
  console.log(total ? 'Problems found.' : 'No problems found.');
  process.exitCode = total ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });
