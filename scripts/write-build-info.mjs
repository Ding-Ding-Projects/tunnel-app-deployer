// Writes src/build-info.json, the provenance record the app shows on its first screen.
// Usage: node scripts/write-build-info.mjs <version> <commit-sha>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [version, commit] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('Usage: write-build-info.mjs <x.y.z> <40-character commit>'); process.exit(1); }
if (!/^[0-9a-f]{40}$/.test(commit || '')) { console.error('A full 40-character commit SHA is required.'); process.exit(1); }
const record = { version, commit, buildTime: new Date().toISOString() };
fs.writeFileSync(path.join(root, 'src/build-info.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));
