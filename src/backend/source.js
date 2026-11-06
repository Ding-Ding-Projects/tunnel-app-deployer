'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
function port(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Choose a container TCP port between 1 and 65535');
  return n;
}
async function inspectSource(input, run, signal) {
  if (!input || !['dockerfile', 'compose'].includes(input.kind)) throw new Error('Choose a Dockerfile or Compose source');
  if (input.kind === 'dockerfile') {
    const contextPath = path.resolve(input.contextPath || '.');
    const dockerfilePath = path.resolve(contextPath, input.dockerfilePath || 'Dockerfile');
    if (!(await fs.stat(contextPath)).isDirectory()) throw new Error('Build context must be a directory');
    const contents = await fs.readFile(dockerfilePath, 'utf8');
    const stages = [...contents.matchAll(/^\s*FROM\s+/gim)];
    const finalStage = stages.length ? contents.slice(stages.at(-1).index) : contents;
    const exposed = [...finalStage.matchAll(/^\s*EXPOSE\s+([^\r\n]+)/gim)].flatMap(m => m[1].split(/\s+/)).filter(v => /^\d+(\/tcp)?$/.test(v)).map(v => port(v.split('/')[0]));
    const unique = [...new Set(exposed)];
    const containerPort = input.containerPort ? port(input.containerPort) : unique.length === 1 ? unique[0] : null;
    return { kind: 'dockerfile', contextPath, dockerfilePath, containerPort, needsPort: !containerPort };
  }
  const composePath = path.resolve(input.composePath || 'compose.yaml');
  await fs.access(composePath);
  const directory = path.dirname(composePath);
  const normalized = await run('docker', ['compose', '--project-directory', directory, '-f', composePath, 'config', '--format', 'json'], { signal });
  let config;
  try { config = JSON.parse(normalized); } catch { throw new Error('Docker Compose returned invalid configuration'); }
  const services = config.services || {};
  if (!Object.keys(services).length) throw new Error('Compose has no services');
  for (const [name, service] of Object.entries(services)) {
    for (const [condition, reason] of [[service.privileged, 'privileged mode'], [service.devices?.length, 'host devices'], [service.network_mode, 'custom network mode'], [service.container_name, 'fixed container_name'], [service.external_links?.length, 'external links']]) {
      if (condition) throw new Error(`Service ${name}: ${reason} is unsupported for isolated hosting`);
    }
    if (service.volumes?.some(v => typeof v === 'object' && v.type === 'bind' && /docker\.sock$/.test(v.source || ''))) throw new Error(`Service ${name}: Docker socket mounts are unsupported`);
    if (service.volumes_from?.some(v => String(v).startsWith('container:'))) throw new Error(`Service ${name}: volumes from external containers are unsupported`);
  }
  for (const [name, network] of Object.entries(config.networks || {})) {
    if (network.external || network.name && !network.name.startsWith(`${config.name}_`)) throw new Error(`Network ${name}: external or fixed shared networks are unsupported`);
    delete network.name;
  }
  for (const [name, volume] of Object.entries(config.volumes || {})) {
    if (volume.external || volume.name && !volume.name.startsWith(`${config.name}_`)) throw new Error(`Volume ${name}: external or fixed shared volumes are unsupported`);
    delete volume.name;
  }
  const candidates = Object.entries(services).filter(([, s]) => s.ports?.length || s.expose?.length).map(([name]) => name);
  const service = input.service || (candidates.length === 1 ? candidates[0] : Object.keys(services).length === 1 ? Object.keys(services)[0] : null);
  if (service && !services[service]) throw new Error('Selected Compose service does not exist');
  const selected = services[service];
  const ports = selected ? [...new Set([...(selected.ports || []).filter(p => !p.protocol || p.protocol === 'tcp').map(p => p.target), ...(selected.expose || []).filter(p => !String(p).includes('/udp')).map(p => String(p).split('/')[0])].map(port))] : [];
  const containerPort = input.containerPort ? port(input.containerPort) : ports.length === 1 ? ports[0] : null;
  return { kind: 'compose', composePath, directory, service, services: Object.keys(services), containerPort, needsService: !service, needsPort: !containerPort, config };
}
module.exports = { inspectSource, port };
