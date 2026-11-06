// Counts hand-written lines tracked by git, leaving out vendored, generated and binary files.
// Usage: node scripts/count-lines.mjs [--json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const groups = {
  'App source': ['src'],
  Tests: ['tests'],
  Scripts: ['scripts', 'build.bat', 'build-installer.bat', '.github'],
  Website: ['docs/app.js', 'docs/style.css', 'docs/index.html', 'docs/site-i18n.js'],
  'Articles and inventory': ['content']
};
const excluded = [/\/fonts\//, /^src\/renderer\/content\.js$/, /\.(png|ico|woff2?|svg)$/i];
const counts = {};
for (const [name, paths] of Object.entries(groups)) {
  const files = execFileSync('git', ['ls-files', '--', ...paths], { encoding: 'utf8' }).split('\n').filter(f => f && !excluded.some(r => r.test(f)) && fs.existsSync(f));
  counts[name] = files.reduce((sum, f) => sum + fs.readFileSync(f, 'utf8').split('\n').length - 1, 0);
}
counts.Total = Object.values(counts).reduce((a, b) => a + b, 0);
if (process.argv.includes('--json')) console.log(JSON.stringify(counts));
else for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);
