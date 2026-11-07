'use strict';
// Reads VHD, VHDX, VHD Set and ISO files without administrator rights, and holds the format limits,
// the Quick pack size estimate and the equivalent PowerShell and DiskPart text for every action.
// Formats: VHD footer and dynamic header (Microsoft VHD specification), VHDX headers, region table
// and metadata (MS-VHDX), ISO 9660 primary volume descriptor.
const fs = require('node:fs');
const path = require('node:path');

const KiB = 1024, MiB = 1024 * KiB, GiB = 1024 * MiB, TiB = 1024 * GiB;
const LIMITS = {
  vhd: { min: 3 * MiB, max: 2040 * GiB },
  vhdx: { min: 3 * MiB, max: 64 * TiB },
  vhdset: { min: 3 * MiB, max: 64 * TiB }
};
const EXTENSIONS = { '.vhd': 'vhd', '.avhd': 'vhd', '.vhdx': 'vhdx', '.avhdx': 'vhdx', '.vhds': 'vhdset', '.iso': 'iso' };
const DEVICE_ID = { iso: 1, vhd: 2, vhdx: 3, vhdset: 4 };

const formatOf = file => EXTENSIONS[path.extname(String(file)).toLowerCase()] || null;

// ---------- byte helpers ----------
function guidLE(b, o) {
  const hex = (start, end) => b.subarray(o + start, o + end).toString('hex');
  return [b.readUInt32LE(o).toString(16).padStart(8, '0'), b.readUInt16LE(o + 4).toString(16).padStart(4, '0'), b.readUInt16LE(o + 6).toString(16).padStart(4, '0'), hex(8, 10), hex(10, 16)].join('-').toUpperCase();
}
function guidRaw(b, o) {
  const h = b.subarray(o, o + 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
}
const isZero = b => b.every(x => x === 0);
const CRC32C = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1; table[i] = c >>> 0; }
  return buf => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();

function readAt(fd, offset, length) {
  const buf = Buffer.alloc(length);
  const n = fs.readSync(fd, buf, 0, length, offset);
  return buf.subarray(0, n);
}

// ---------- VHD ----------
const VHD_TYPES = { 2: 'fixed', 3: 'dynamic', 4: 'differencing' };
function parseVhd(fd, size) {
  if (size < 512) return null;
  let footer = readAt(fd, size - 512, 512);
  if (footer.subarray(0, 8).toString('latin1') !== 'conectix') {
    footer = readAt(fd, size - 511, 511); // older images end with a 511-byte footer
    if (footer.subarray(0, 8).toString('latin1') !== 'conectix') { footer = readAt(fd, 0, 512); if (footer.subarray(0, 8).toString('latin1') !== 'conectix') return null; }
  }
  const out = {
    format: 'vhd', type: VHD_TYPES[footer.readUInt32BE(60)] || 'unknown', virtualSize: Number(footer.readBigUInt64BE(48)),
    diskId: guidRaw(footer, 68), creator: footer.subarray(28, 32).toString('latin1').trim(), savedState: footer[84] === 1,
    blockSize: null, logicalSectorSize: 512, physicalSectorSize: 512, parent: null
  };
  const dataOffset = footer.readBigUInt64BE(16);
  if (out.type !== 'fixed' && dataOffset !== 0xffffffffffffffffn && Number(dataOffset) + 1024 <= size) {
    const h = readAt(fd, Number(dataOffset), 1024);
    if (h.subarray(0, 8).toString('latin1') === 'cxsparse') {
      out.blockSize = h.readUInt32BE(32);
      if (out.type === 'differencing') {
        const name = Buffer.from(h.subarray(64, 576)); name.swap16();
        const locators = [];
        for (let i = 0; i < 8; i++) {
          const e = 576 + i * 24, code = h.subarray(e, e + 4).toString('latin1'), length = h.readUInt32BE(e + 8), offset = Number(h.readBigUInt64BE(e + 16));
          if (!/^(W2ru|W2ku)$/.test(code) || !length || length > 4096 || offset + length > size) continue;
          locators.push({ kind: code === 'W2ru' ? 'relative' : 'absolute', path: readAt(fd, offset, length).toString('utf16le').replace(/\0+$/, '') });
        }
        out.parent = { id: guidRaw(h, 40), name: name.toString('utf16le').replace(/\0+$/, ''), relative: locators.find(l => l.kind === 'relative')?.path || null, absolute: locators.find(l => l.kind === 'absolute')?.path || null };
      }
    }
  }
  return out;
}

// ---------- VHDX ----------
const VHDX = {
  bat: '2DC27766-F623-4200-9D64-115E9BFD4A08', metadata: '8B7CA206-4790-4B9A-B8FE-575F050F886E',
  fileParameters: 'CAA16737-FA36-4D43-B3B6-33F0AA44E76B', virtualDiskSize: '2FA54224-CD1B-4876-B211-5DBED83BF4B8',
  page83: 'BECA12AB-B2E6-4523-93EF-C309E000C746', logicalSector: '8141BF1D-A96F-4709-BA47-F233A8FAAB5F',
  physicalSector: 'CDA348C7-445D-4471-9CC9-E9885251C556', parentLocator: 'A8D35F2D-B30B-454D-ABF7-D3D84834AB0C'
};
function vhdxHeader(fd, offset) {
  const h = readAt(fd, offset, 4096);
  if (h.length < 4096 || h.subarray(0, 4).toString('latin1') !== 'head') return null;
  const copy = Buffer.from(h); copy.writeUInt32LE(0, 4);
  return { valid: CRC32C(copy) === h.readUInt32LE(4), sequence: h.readBigUInt64BE ? h.readBigUInt64LE(8) : 0n, logGuid: h.subarray(48, 64), version: h.readUInt16LE(66) };
}
function parseVhdx(fd, size) {
  if (size < 1 * MiB) return null;
  if (readAt(fd, 0, 8).toString('latin1') !== 'vhdxfile') return null;
  const creator = readAt(fd, 8, 512).toString('utf16le').replace(/\0[\s\S]*$/, '');
  const headers = [vhdxHeader(fd, 64 * KiB), vhdxHeader(fd, 128 * KiB)].filter(h => h && h.valid);
  const header = headers.sort((a, b) => (a.sequence < b.sequence ? 1 : -1))[0] || null;
  const region = readAt(fd, 192 * KiB, 64 * KiB);
  if (region.subarray(0, 4).toString('latin1') !== 'regi') return { format: 'vhdx', type: 'unknown', creator, damaged: true };
  const entries = {};
  for (let i = 0, n = Math.min(region.readUInt32LE(8), 2047); i < n; i++) {
    const e = 16 + i * 32;
    entries[guidLE(region, e)] = { offset: Number(region.readBigUInt64LE(e + 16)), length: region.readUInt32LE(e + 24) };
  }
  const meta = entries[VHDX.metadata];
  if (!meta || meta.offset + 64 * KiB > size) return { format: 'vhdx', type: 'unknown', creator, damaged: true };
  const table = readAt(fd, meta.offset, 64 * KiB);
  if (table.subarray(0, 8).toString('latin1') !== 'metadata') return { format: 'vhdx', type: 'unknown', creator, damaged: true };
  const items = {}, user = [];
  for (let i = 0, n = Math.min(table.readUInt16LE(10), 2047); i < n; i++) {
    const e = 32 + i * 32, id = guidLE(table, e), offset = table.readUInt32LE(e + 16), length = table.readUInt32LE(e + 20), flags = table.readUInt32LE(e + 24);
    const item = { id, offset, length, isUser: !!(flags & 1), isVirtualDisk: !!(flags & 2), isRequired: !!(flags & 4) };
    if (item.isUser) user.push({ id, length }); else items[id] = item;
  }
  const value = id => { const it = items[id]; return it && it.length && it.length <= 64 * KiB ? readAt(fd, meta.offset + it.offset, it.length) : null; };
  const fp = value(VHDX.fileParameters), vs = value(VHDX.virtualDiskSize), p83 = value(VHDX.page83), ls = value(VHDX.logicalSector), ps = value(VHDX.physicalSector);
  const blockSize = fp ? fp.readUInt32LE(0) : null, flags = fp ? fp.readUInt32LE(4) : 0;
  const out = {
    format: 'vhdx', type: flags & 2 ? 'differencing' : flags & 1 ? 'fixed' : 'dynamic', virtualSize: vs ? Number(vs.readBigUInt64LE(0)) : null,
    blockSize, logicalSectorSize: ls ? ls.readUInt32LE(0) : null, physicalSectorSize: ps ? ps.readUInt32LE(0) : null,
    diskId: p83 ? guidLE(p83, 0) : null, creator, userMetadata: user, needsLogReplay: !!header && !isZero(header.logGuid), parent: null
  };
  const pl = value(VHDX.parentLocator);
  if (pl && pl.length >= 20) {
    const kv = {};
    for (let i = 0, n = pl.readUInt16LE(18); i < n && 20 + i * 12 + 12 <= pl.length; i++) {
      const e = 20 + i * 12, ko = pl.readUInt32LE(e), vo = pl.readUInt32LE(e + 4), kl = pl.readUInt16LE(e + 8), vl = pl.readUInt16LE(e + 10);
      if (ko + kl > pl.length || vo + vl > pl.length) continue;
      kv[pl.subarray(ko, ko + kl).toString('utf16le')] = pl.subarray(vo, vo + vl).toString('utf16le');
    }
    out.parent = { id: kv.parent_linkage || null, relative: kv.relative_path || null, absolute: kv.absolute_win32_path || null, volume: kv.volume_path || null };
  }
  return out;
}

// ---------- ISO ----------
function parseIso(fd, size) {
  if (size < 34 * KiB) return null;
  const pvd = readAt(fd, 32768, 2048);
  if (pvd[0] !== 1 || pvd.subarray(1, 6).toString('latin1') !== 'CD001') return null;
  return { format: 'iso', type: 'read-only', label: pvd.subarray(40, 72).toString('latin1').trim(), virtualSize: pvd.readUInt32LE(80) * pvd.readUInt16LE(128) };
}

// Everything that can be read from the file itself. Never needs administrator rights.
function inspectFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw Object.assign(new Error('Not a file.'), { code: 'notfile' });
  const fd = fs.openSync(file, 'r');
  try {
    const kind = formatOf(file);
    let info = null;
    if (kind === 'iso') info = parseIso(fd, stat.size);
    else if (kind === 'vhdset') info = { format: 'vhdset', type: null, limited: true };
    else info = parseVhdx(fd, stat.size) || parseVhd(fd, stat.size);
    if (!info) throw Object.assign(new Error('This file is not a virtual disk Windows can open.'), { code: 'unknown' });
    return { ...info, path: file, name: path.basename(file), fileSize: stat.size, modified: stat.mtimeMs };
  } finally { fs.closeSync(fd); }
}

// The parent chain from a differencing disk up to its base, as far as the files can be found.
function chainOf(file, depth = 0) {
  const info = inspectFile(file), chain = [{ name: info.name, path: file, format: info.format, type: info.type }];
  if (!info.parent || depth > 32) return chain;
  const candidates = [info.parent.relative && path.resolve(path.dirname(file), info.parent.relative.replace(/^\.\\/, '')), info.parent.absolute].filter(Boolean);
  const found = candidates.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  if (!found) return [...chain, { name: path.basename(String(info.parent.absolute || info.parent.relative || '')), path: info.parent.absolute || null, missing: true }];
  return [...chain, ...chainOf(found, depth + 1)];
}

// ---------- create options ----------
const BLOCK_SIZES = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256].map(n => n * MiB);
const FILE_SYSTEMS = new Set(['NTFS', 'ReFS', 'exFAT', 'FAT32', 'FAT']);
function fail(code, message, extra = {}) { throw Object.assign(new Error(message), { code, ...extra }); }
function validateCreate(o) {
  const format = ['vhd', 'vhdx', 'vhdset'].includes(o.format) ? o.format : fail('format', 'Choose VHD, VHDX or VHD Set.');
  const type = ['dynamic', 'fixed', 'differencing'].includes(o.type) ? o.type : fail('type', 'Choose dynamic, fixed or differencing.');
  const out = { format, type, blockSize: 0, logicalSector: 0, physicalSector: 0, sddl: '', volume: null };
  if (type === 'differencing') { if (!o.parent) fail('parent', 'A differencing disk needs a parent.'); out.size = 0; }
  else if (o.source) out.size = 0;
  else {
    const size = Math.ceil(Number(o.size) / MiB) * MiB, lim = LIMITS[format];
    if (!Number.isFinite(size) || size < lim.min) fail('small', 'The size is below the 3 MB minimum.', { min: lim.min });
    if (size > lim.max) fail('large', `The size is above the ${format.toUpperCase()} limit.`, { max: lim.max });
    out.size = size;
  }
  if (format === 'vhdx' && o.blockSize) { if (!BLOCK_SIZES.includes(Number(o.blockSize))) fail('block', 'VHDX block sizes run from 1 MB to 256 MB in powers of two.'); out.blockSize = Number(o.blockSize); }
  if (o.logicalSector) { if (![512, 4096].includes(Number(o.logicalSector)) || format === 'vhd' && Number(o.logicalSector) !== 512) fail('sector', 'Logical sectors are 512 or 4096 bytes; VHD uses 512.'); out.logicalSector = Number(o.logicalSector); }
  if (o.physicalSector) { if (![512, 4096].includes(Number(o.physicalSector))) fail('sector', 'Physical sectors are 512 or 4096 bytes.'); out.physicalSector = Number(o.physicalSector); }
  if (o.sddl) { if (typeof o.sddl !== 'string' || o.sddl.length > 1024 || !/^[A-Za-z0-9:;()\-_,.* ]+$/.test(o.sddl)) fail('sddl', 'The access filter is not valid SDDL.'); out.sddl = o.sddl; }
  if (o.volume) {
    const v = o.volume, fsName = FILE_SYSTEMS.has(v.fileSystem) ? v.fileSystem : fail('fs', 'Choose a file system.');
    const label = String(v.label || '').slice(0, 32).replace(/[\\/:*?"<>|\0]/g, '');
    out.volume = { style: v.style === 'MBR' ? 'MBR' : 'GPT', fileSystem: fsName, label, unit: Number(v.unit) || 0, full: !!v.full, compress: !!v.compress && fsName === 'NTFS', devDrive: !!v.devDrive, letter: /^[D-Z]$/.test(v.letter || '') ? v.letter : v.letter === 'none' ? 'none' : 'auto' };
    if (out.volume.style === 'MBR' && out.size > 2 * TiB) fail('mbr', 'MBR disks stop at 2 TB; choose GPT.');
    if (out.volume.devDrive && (out.volume.fileSystem !== 'ReFS' || out.size && out.size < 50 * GiB)) fail('devdrive', 'A Dev Drive needs ReFS and at least 50 GB.');
    if (fsName === 'FAT32' && out.size > 32 * GiB) fail('fat32', 'Windows formats FAT32 only up to 32 GB; choose exFAT or NTFS.');
  }
  return out;
}

// ---------- Quick pack sizing ----------
// Data rounded up to whole clusters, file-system records for every file and folder, the partition
// table and reserved partitions, the NTFS log, and headroom. Automatic growth covers any shortfall.
function packEstimate({ bytes = [], folders = 0, fileSystem = 'NTFS' }) {
  const cluster = 4096;
  let data = 0;
  for (const b of bytes) data += b <= 700 && fileSystem === 'NTFS' ? 0 : Math.ceil(b / cluster) * cluster;
  const records = (bytes.length + folders) * 1024 + folders * cluster;
  const fixed = 192 * MiB, headroom = Math.max(256 * MiB, Math.ceil(data * 0.1));
  const minimum = fileSystem === 'ReFS' ? 2 * GiB : 512 * MiB;
  return Math.max(minimum, Math.ceil((data + records + fixed + headroom) / MiB) * MiB);
}

// ---------- equivalent scripts ----------
const ps = s => `'${String(s).replace(/'/g, "''")}'`;
const dp = s => `"${String(s)}"`;
const mb = n => Math.ceil(n / MiB);
function scriptsFor(op, a = {}) {
  const f = a.path, sizeGB = n => `${n}`;
  switch (op) {
    case 'create': {
      const t = a.type === 'differencing' ? `-ParentPath ${ps(a.parent)} -Differencing` : `${a.source ? `-SourceDisk <number>` : `-SizeBytes ${sizeGB(a.size)}`} -${a.type === 'fixed' ? 'Fixed' : 'Dynamic'}`;
      const vol = a.volume ? ` |\n    Mount-VHD -Passthru | Initialize-Disk -PartitionStyle ${a.volume.style} -Passthru |\n    New-Partition -UseMaximumSize -AssignDriveLetter |\n    Format-Volume -FileSystem ${a.volume.fileSystem} -NewFileSystemLabel ${ps(a.volume.label)} -Confirm:$false` : '';
      return { powershell: `New-VHD -Path ${ps(f)} ${t}${a.blockSize ? ` -BlockSizeBytes ${a.blockSize}` : ''}${vol}`, diskpart: a.type === 'differencing' ? `create vdisk file=${dp(f)} parent=${dp(a.parent)}` : a.source ? `create vdisk file=${dp(f)} source=${dp(a.source)}` : `create vdisk file=${dp(f)} maximum=${mb(a.size)} type=${a.type === 'fixed' ? 'fixed' : 'expandable'}${a.sddl ? ` sd=${a.sddl}` : ''}` };
    }
    case 'attach': return { powershell: `Mount-DiskImage -ImagePath ${ps(f)} -Access ${a.readOnly ? 'ReadOnly' : 'ReadWrite'}${a.noLetter ? ' -NoDriveLetter' : ''}`, diskpart: `select vdisk file=${dp(f)}\nattach vdisk${a.readOnly ? ' readonly' : ''}` };
    case 'detach': return { powershell: `Dismount-DiskImage -ImagePath ${ps(f)}`, diskpart: `select vdisk file=${dp(f)}\ndetach vdisk` };
    case 'grow': return { powershell: `Resize-VHD -Path ${ps(f)} -SizeBytes ${a.size}\n# then, attached:\n$p = Get-Partition -DiskNumber <n> | Select-Object -Last 1\n$p | Resize-Partition -Size ($p | Get-PartitionSupportedSize).SizeMax`, diskpart: `select vdisk file=${dp(f)}\nexpand vdisk maximum=${mb(a.size)}` };
    case 'shrink': return { powershell: `# shrink the last partition first, then:\nResize-VHD -Path ${ps(f)} ${a.smallest ? '-ToMinimumSize' : `-SizeBytes ${a.size}`}`, diskpart: null };
    case 'compact': return { powershell: `Optimize-VHD -Path ${ps(f)} -Mode ${a.mode === 'quick' ? 'Quick' : 'Full'}`, diskpart: `select vdisk file=${dp(f)}\nattach vdisk readonly\ncompact vdisk\ndetach vdisk` };
    case 'convert': return { powershell: `Convert-VHD -Path ${ps(f)} -DestinationPath ${ps(a.target)} -VHDType ${a.type === 'fixed' ? 'Fixed' : 'Dynamic'}`, diskpart: `create vdisk file=${dp(a.target)} source=${dp(f)}` };
    case 'child': return { powershell: `New-VHD -Path ${ps(a.target)} -ParentPath ${ps(f)} -Differencing`, diskpart: `create vdisk file=${dp(a.target)} parent=${dp(f)}` };
    case 'merge': return { powershell: `Merge-VHD -Path ${ps(f)} -DestinationPath ${ps(a.parent)}`, diskpart: `select vdisk file=${dp(f)}\nmerge vdisk depth=1` };
    case 'reparent': return { powershell: `Set-VHD -Path ${ps(f)} -ParentPath ${ps(a.parent)}`, diskpart: null };
    case 'newid': return { powershell: `Set-VHD -Path ${ps(f)} -ResetDiskIdentifier`, diskpart: null };
    case 'online': return { powershell: `Set-Disk -Number ${a.disk} -IsOffline $false`, diskpart: `select disk ${a.disk}\nonline disk` };
    case 'writable': return { powershell: `Set-Disk -Number ${a.disk} -IsReadOnly $false`, diskpart: `select disk ${a.disk}\nattributes disk clear readonly` };
    case 'fixsig': return { powershell: `Set-Disk -Number ${a.disk} -Guid ([guid]::NewGuid().ToString('B'))\nSet-Disk -Number ${a.disk} -IsOffline $false`, diskpart: `select disk ${a.disk}\nuniqueid disk id=<new GUID>\nonline disk` };
    case 'pack': return { powershell: `New-VHD -Path ${ps(f)} -SizeBytes ${a.size} -Dynamic | Mount-VHD -Passthru |\n    Initialize-Disk -PartitionStyle GPT -Passthru | New-Partition -UseMaximumSize -AssignDriveLetter |\n    Format-Volume -FileSystem NTFS -NewFileSystemLabel ${ps(a.label || 'Pack')} -Confirm:$false\nrobocopy <source> <letter>:\\ /E /COPY:DAT /DCOPY:DAT\nDismount-VHD -Path ${ps(f)}`, diskpart: null };
    default: return { powershell: null, diskpart: null };
  }
}

module.exports = { KiB, MiB, GiB, TiB, LIMITS, DEVICE_ID, formatOf, inspectFile, chainOf, parseVhd, parseVhdx, validateCreate, packEstimate, scriptsFor, CRC32C, guidLE };
