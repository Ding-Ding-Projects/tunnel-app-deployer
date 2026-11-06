'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { runner } = require('./process');
const { inspectSource } = require('./source');
const { ensureCloudflared, artifacts } = require('./cloudflared');

function createHostManager(options = {}) {
  if (!options.stateDir) throw new Error('stateDir is required');
  const spawnImpl = options.spawn || spawn;
  const run = options.run || runner(spawnImpl);
  const fetchImpl = options.fetch || fetch;
  let state = { phase: 'idle', localUrl: null, publicUrl: null };
  let session, busy = false;
  const status = () => ({ ...state });
  const emit = (phase, message, extra = {}) => {
    state = { ...state, phase, ...extra };
    try { session?.onProgress?.({ ...status(), message }); } catch {}
  };
  async function prerequisites() {
    const check = async (cmd, args) => { try { await run(cmd, args, { timeout: 15000 }); return true; } catch { return false; } };
    const docker = await check('docker', ['info', '--format', '{{.ServerVersion}}']);
    const compose = docker && await check('docker', ['compose', 'version']);
    const cloudflared = await check(options.cloudflaredCommand || 'cloudflared', ['--version']);
    const cloudflaredDownloadAvailable = !!artifacts[`${process.platform}-${process.arch}`];
    return { docker, compose, cloudflared, cloudflaredDownloadAvailable, ready: docker && (cloudflared || cloudflaredDownloadAvailable), missing: [!docker && 'Docker Engine', !cloudflared && !cloudflaredDownloadAvailable && 'cloudflared'].filter(Boolean) };
  }
  async function healthy(url, signal) {
    try { const response = await fetchImpl(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(options.healthTimeoutMs || 5000)]), redirect: 'manual' }); await response.body?.cancel(); return response.status >= 200 && response.status < 400; } catch { return false; }
  }
  async function untilHealthy(url, signal, alive = () => true) {
    const end = Date.now() + (options.startupTimeoutMs || 120000);
    while (Date.now() < end) {
      if (signal.aborted) throw new Error('Operation cancelled');
      if (!alive()) throw new Error('Tunnel process exited');
      if (await healthy(url, signal)) return;
      await new Promise(resolve => setTimeout(resolve, options.pollIntervalMs || 500));
    }
    throw new Error('HTTP readiness timed out');
  }
  async function cleanup(s) {
    if (s.cleanupPromise) return s.cleanupPromise;
    s.cleanupPromise = cleanupResources(s);
    return s.cleanupPromise;
  }
  async function cleanupResources(s) {
    clearInterval(s.monitor);
    s.controller.abort();
    if (s.tunnel) {
      s.tunnel.kill();
      await Promise.race([s.tunnelClosed, new Promise(resolve => setTimeout(resolve, 2000))]);
      if (s.tunnel.exitCode === null) s.tunnel.kill('SIGKILL');
    }
    if (s.container) await run('docker', ['rm', '-f', s.container], { timeout: 30000 }).catch(() => {});
    if (s.composeArgs) await run('docker', [...s.composeArgs, 'down', '--remove-orphans'], { timeout: 60000 }).catch(() => {});
    if (s.image) await run('docker', ['image', 'rm', s.image], { timeout: 30000 }).catch(() => {});
    if (s.file) await fs.rm(s.file, { force: true }).catch(() => {});
  }
  async function stop() {
    const s = session;
    if (!s) { state = { phase: 'idle', localUrl: null, publicUrl: null }; return status(); }
    s.stopping = true;
    emit('stopping', 'Stopping hosting', { publicUrl: null, verified: false });
    s.controller.abort();
    await s.hostSettled;
    await cleanup(s);
    if (session === s) { session = null; state = { phase: 'idle', localUrl: null, publicUrl: null }; }
    return status();
  }
  async function startTunnel(s) {
    if (s.controller.signal.aborted) throw new Error('Operation cancelled');
    const child = spawnImpl(s.cloudflared, ['tunnel', '--url', state.localUrl, '--no-autoupdate'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    s.tunnel = child;
    s.alive = true;
    s.tunnelClosed = new Promise(resolve => child.once('close', resolve));
    const url = await new Promise((resolve, reject) => {
      let buffer = '', done = false;
      const finish = (err, value) => { if (done) return; done = true; clearTimeout(timer); s.controller.signal.removeEventListener('abort', abort); err ? reject(err) : resolve(value); };
      const abort = () => finish(new Error('Operation cancelled'));
      const timer = setTimeout(() => finish(new Error('Tunnel URL timed out')), options.startupTimeoutMs || 120000);
      s.controller.signal.addEventListener('abort', abort, { once: true });
      for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => {
        buffer = (buffer + chunk.toString()).slice(-8192);
        const match = buffer.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s|/]|$)/);
        if (match) finish(null, match[0]);
      });
      child.once('error', () => { s.alive = false; finish(new Error('Unable to start cloudflared; install cloudflared first')); });
      child.once('exit', () => {
        if (s.tunnel !== child) return;
        s.alive = false;
        finish(new Error('Tunnel process exited'));
        if (session === s && state.phase === 'ready') {
          emit('recovering', 'Tunnel disconnected; reconnecting', { publicUrl: null, verified: false });
          recover(s).catch(() => { if (session === s && !s.controller.signal.aborted) emit('error', 'Tunnel recovery failed; stop and host again', { publicUrl: null, verified: false, error: 'Tunnel recovery failed' }); });
        }
      });
    });
    await untilHealthy(url, s.controller.signal, () => s.alive);
    if (!s.alive || s.controller.signal.aborted) throw new Error('Tunnel process exited');
    emit('ready', 'Public HTTPS link verified', { publicUrl: url, verified: true });
    if (!s.monitor) {
      s.monitor = setInterval(async () => {
        if (s.monitorBusy || state.phase !== 'ready' || s.controller.signal.aborted) return;
        s.monitorBusy = true;
        const ok = await healthy(state.localUrl, s.controller.signal);
        s.monitorBusy = false;
        if (!ok && session === s && state.phase === 'ready' && !s.controller.signal.aborted) {
          emit('error', 'Application stopped responding; stop and host again', { publicUrl: null, verified: false, error: 'Application HTTP health check failed' });
          s.tunnel?.kill();
        }
      }, options.monitorIntervalMs || 10000);
      s.monitor.unref?.();
    }
  }
  async function recover(s) {
    for (let attempt = 0; attempt < 2 && !s.controller.signal.aborted; attempt++) {
      try { await startTunnel(s); return; } catch { s.tunnel?.kill(); }
    }
    if (!s.controller.signal.aborted) throw new Error('Tunnel recovery failed');
  }
  async function host(input, { onProgress, signal } = {}) {
    if (busy || session) throw new Error('Stop the current hosting session first');
    busy = true;
    const s = { controller: new AbortController(), onProgress };
    s.hostSettled = new Promise(resolve => { s.resolveHostSettled = resolve; });
    session = s;
    const abort = () => s.controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      emit('validating', 'Validating source', { publicUrl: null, localUrl: null, verified: false, error: null });
      const source = await inspectSource(input, run, s.controller.signal);
      if (!source.containerPort || source.kind === 'compose' && !source.service) throw new Error('Choose a service and container port before hosting');
      emit('preparing', 'Preparing verified cloudflared executable');
      s.cloudflared = await ensureCloudflared({ stateDir: options.stateDir, run, fetchImpl, signal: s.controller.signal, command: options.cloudflaredCommand });
      const id = `tunnel-app-${crypto.randomBytes(8).toString('hex')}`;
      await fs.mkdir(options.stateDir, { recursive: true, mode: 0o700 });
      if (source.kind === 'dockerfile') {
        s.image = id;
        emit('building', 'Building application image');
        await run('docker', ['build', '-t', id, '-f', source.dockerfilePath, source.contextPath], { signal: s.controller.signal, timeout: 1800000 });
        s.container = id;
        emit('starting', 'Starting application');
        await run('docker', ['run', '-d', '--name', id, '--label', 'app.tunnel-deployer.managed=true', '-p', `127.0.0.1::${source.containerPort}`, id], { signal: s.controller.signal });
      } else {
        const config = source.config;
        delete config.name;
        for (const [name, service] of Object.entries(config.services)) {
          delete service.ports;
          service.labels = { ...service.labels, 'app.tunnel-deployer.managed': 'true' };
          // Building must never overwrite an image tag used by the original project.
          if (service.build) service.image = `${id}-${name}`.toLowerCase();
        }
        config.services[source.service].ports = [{ target: source.containerPort, published: '0', host_ip: '127.0.0.1', protocol: 'tcp' }];
        s.file = path.join(options.stateDir, `${id}.json`);
        // Compose reads generated files again; protect already resolved literal dollars.
        const literalConfig = JSON.parse(JSON.stringify(config), (_key, value) => typeof value === 'string' ? value.replaceAll('$', () => '$$') : value);
        await fs.writeFile(s.file, JSON.stringify(literalConfig), { mode: 0o600 });
        s.composeArgs = ['compose', '--project-name', id, '--project-directory', source.directory, '-f', s.file];
        emit('building', 'Building and starting Compose services');
        await run('docker', [...s.composeArgs, 'up', '-d', '--build'], { signal: s.controller.signal, timeout: 1800000 });
        s.containerId = (await run('docker', [...s.composeArgs, 'ps', '-q', source.service], { signal: s.controller.signal })).trim().split(/\s+/)[0];
        if (!s.containerId) throw new Error('Selected service did not start');
      }
      const bindings = JSON.parse(await run('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', s.containerId || s.container], { signal: s.controller.signal }));
      const binding = bindings[`${source.containerPort}/tcp`]?.find(p => p.HostIp === '127.0.0.1');
      if (!binding || !/^\d+$/.test(binding.HostPort)) throw new Error('Application has no loopback port binding');
      emit('checking', 'Waiting for application HTTP readiness', { localUrl: `http://127.0.0.1:${binding.HostPort}` });
      await untilHealthy(state.localUrl, s.controller.signal);
      emit('connecting', 'Creating public HTTPS link');
      await startTunnel(s);
      return status();
    } catch (error) {
      await cleanup(s);
      if (session === s && !s.stopping) { emit('error', error.message, { publicUrl: null, localUrl: null, verified: false, error: error.message }); session = null; }
      throw error;
    } finally { busy = false; signal?.removeEventListener('abort', abort); s.resolveHostSettled(); }
  }
  return { prerequisites, inspectSource: async input => { const result = await inspectSource(input, run); const { config, ...safe } = result; return safe; }, host, stop, status };
}
module.exports = { createHostManager };
