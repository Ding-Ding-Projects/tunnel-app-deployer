// Picks this release's dim sum code name from the public catalogue at
// https://github.com/Ding-Ding-Projects/dim-sum-photos: the first dish, in catalogue order, that has a
// published photo in a catalog-v1 release and has not named an earlier release of this repository.
// Usage: node scripts/dim-sum-code-name.mjs   (GITHUB_TOKEN is optional and only raises API limits)
// Prints JSON. Any failure prints {"ok": false, "reason": ...} and exits 0: a code name never blocks a release.
const CATALOG = 'Ding-Ding-Projects/dim-sum-photos';
const SELF = process.env.GITHUB_REPOSITORY || 'Ding-Ding-Projects/tunnel-app-deployer';
const INDEX = `https://raw.githubusercontent.com/${CATALOG}/main/catalog/index.json`;
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'tunnel-app-deployer-release', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

async function json(url, opts = {}) {
  const r = await fetch(url, { headers: opts.api ? headers : {}, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r.json();
}
async function pages(path) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await json(`https://api.github.com/${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, { api: true });
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export function pickDish(dishes, published, used) {
  return dishes.find(d => d?.id && d.name?.en && d.name?.zhHant && d.image?.path && published.has(d.image.path.split('/').pop()) && !used.has(d.id)) || null;
}

async function main() {
  const index = await json(INDEX);
  const releases = (await pages(`repos/${CATALOG}/releases`)).filter(r => /^catalog-v1(\b|-)/.test(r.tag_name));
  const published = new Map();
  for (const r of releases) for (const a of await pages(`repos/${CATALOG}/releases/${r.id}/assets`)) if (!published.has(a.name)) published.set(a.name, a.browser_download_url);
  const used = new Set();
  for (const r of await pages(`repos/${SELF}/releases`)) for (const m of String(r.body || '').matchAll(/Dish id: (hk-dish-\d+)/g)) used.add(m[1]);
  const dish = pickDish(index.dishes, published, used);
  if (!dish) return { ok: false, reason: 'No unused dish with a published photo was found.' };
  return { ok: true, id: dish.id, en: dish.name.en, zhHant: dish.name.zhHant, photo: published.get(dish.image.path.split('/').pop()), catalog: `https://github.com/${CATALOG}` };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('dim-sum-code-name.mjs')) {
  main().then(r => console.log(JSON.stringify(r)), e => console.log(JSON.stringify({ ok: false, reason: e.message })));
}
