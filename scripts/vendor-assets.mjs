// Copies bundled fonts from installed npm packages into the app and the website.
// Usage: node scripts/vendor-assets.mjs   (run after npm ci)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = p => path.join(root, 'node_modules', p);
const assets = [
  ['@fontsource-variable/roboto-flex/files/roboto-flex-latin-full-normal.woff2', 'roboto-flex.woff2'],
  ['@fontsource-variable/roboto-flex/files/roboto-flex-latin-ext-full-normal.woff2', 'roboto-flex-ext.woff2'],
  ['@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff2', 'roboto-mono-400.woff2'],
  ['@fontsource/roboto-mono/files/roboto-mono-latin-500-normal.woff2', 'roboto-mono-500.woff2'],
  ['material-symbols/material-symbols-rounded.woff2', 'material-symbols-rounded.woff2']
];
const licences = [
  ['@fontsource-variable/roboto-flex/LICENSE', 'LICENSE-roboto-flex.txt'],
  ['@fontsource/roboto-mono/LICENSE', 'LICENSE-roboto-mono.txt'],
  ['material-symbols/LICENSE', 'LICENSE-material-symbols.txt']
];
for (const target of ['src/renderer/fonts', 'docs/fonts']) {
  const dir = path.join(root, target);
  fs.mkdirSync(dir, { recursive: true });
  for (const [from, to] of [...assets, ...licences]) {
    const source = nm(from);
    if (!fs.existsSync(source)) { console.error(`Missing ${from}. Run npm ci first.`); process.exit(1); }
    fs.copyFileSync(source, path.join(dir, to));
  }
  const versions = ['@fontsource-variable/roboto-flex', '@fontsource/roboto-mono', 'material-symbols'].map(p => `${p} ${JSON.parse(fs.readFileSync(nm(`${p}/package.json`), 'utf8')).version}`);
  fs.writeFileSync(path.join(dir, 'SOURCES.txt'), `Copied by scripts/vendor-assets.mjs from npm packages:\n${versions.join('\n')}\n`);
  console.log(`vendored fonts into ${target}`);
}
