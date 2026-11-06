'use strict';
const { spawn } = require('node:child_process');

function runner(spawnImpl = spawn) {
  return (command, args, { signal, timeout = 120000, cwd } = {}) => new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { shell: false, windowsHide: true, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const abort = () => { child.kill(); finish(new Error('Operation cancelled')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error(`${command} timed out`)); }, timeout);
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => { output = (output + chunk.toString()).slice(-2 * 1024 * 1024); });
    child.on('error', () => finish(new Error(`Unable to start ${command}`)));
    child.on('close', code => finish(code === 0 ? null : new Error(`${command} failed (exit ${code})`), output));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
module.exports = { runner };
