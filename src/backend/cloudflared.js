'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const version = '2026.10.7';
const artifacts = {
  'linux-x64': ['cloudflared-linux-amd64', '1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872'],
  'linux-arm64': ['cloudflared-linux-arm64', '3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775'],
  'win32-x64': ['cloudflared-windows-amd64.exe', '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343']
};
async function ensureCloudflared({ stateDir, run, fetchImpl = fetch, signal, command }) {
  if (command) { await run(command, ['--version'], { signal, timeout: 15000 }); return command; }
  try { await run('cloudflared', ['--version'], { signal, timeout: 15000 }); return 'cloudflared'; } catch {}
  if (signal.aborted) throw new Error('Operation cancelled');
  const artifact = artifacts[`${process.platform}-${process.arch}`];
  if (!artifact) throw new Error('Install cloudflared for this operating system before hosting');
  const [name, digest] = artifact;
  const target = path.join(stateDir, 'bin', `${version}-${name}`);
  const valid = bytes => crypto.createHash('sha256').update(bytes).digest('hex') === digest;
  try { if (valid(await fs.readFile(target))) { await fs.chmod(target, 0o700); return target; } } catch {}
  const response = await fetchImpl(`https://github.com/cloudflare/cloudflared/releases/download/${version}/${name}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
  if (!response.ok || !response.body) throw new Error('Unable to download cloudflared');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('cloudflared download exceeded size limit'); }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (!valid(bytes)) throw new Error('cloudflared download checksum did not match the pinned official release');
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(temporary, bytes, { mode: 0o700 });
  await fs.rename(temporary, target);
  return target;
}
module.exports = { ensureCloudflared, artifacts, version };
