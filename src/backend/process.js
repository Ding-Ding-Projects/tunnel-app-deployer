'use strict';
const { spawn } = require('node:child_process');

function runner(spawnImpl = spawn, { killGraceMs = 2000 } = {}) {
  return (command, args, { signal, timeout = 120000, cwd } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Operation cancelled')); return; }
    const child = spawnImpl(command, args, { shell: false, windowsHide: true, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stderr = '', settled = false, terminationError, killTimer, finalTimer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(killTimer); clearTimeout(finalTimer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const terminate = error => {
      if (terminationError || settled) return;
      terminationError = error;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        child.kill('SIGKILL');
        finalTimer = setTimeout(() => finish(new Error('Child process did not confirm termination')), killGraceMs);
      }, killGraceMs);
    };
    const abort = () => terminate(new Error('Operation cancelled'));
    const timer = setTimeout(() => terminate(new Error(`${command} timed out`)), timeout);
    child.stdout?.on('data', chunk => { output = (output + chunk.toString()).slice(-2 * 1024 * 1024); });
    // Drain warnings separately. Raw subprocess text can contain project secrets and is never surfaced.
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
    child.on('error', () => finish(new Error(`Unable to start ${command}`)));
    child.on('close', code => finish(terminationError || (code === 0 ? null : new Error(`${command} failed (exit ${code}; diagnostics withheld)`)), output));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
module.exports = { runner };
