#Requires -Version 5.1
# Virtual disk operations for Tunnel App Deployer. The app writes request.json into a fresh job
# folder and runs this script, elevated only when the action needs it. Progress goes to
# progress.jsonl, the outcome to result.json, and a cancel.flag file asks the work to stop.
# Routes: the VirtDisk API (every Windows edition), the Storage module, and nothing else.
param([Parameter(Mandatory = $true)][string]$Job)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$progressFile = Join-Path $Job 'progress.jsonl'
$resultFile = Join-Path $Job 'result.json'
$cancelFile = Join-Path $Job 'cancel.flag'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Json([string]$file, $value, [switch]$Append) {
  $text = ($value | ConvertTo-Json -Depth 8 -Compress)
  if ($Append) { [IO.File]::AppendAllText($file, $text + "`n", $utf8) } else { [IO.File]::WriteAllText($file, $text, $utf8) }
}
function Step([string]$step, [double]$done = 0, [double]$total = 0, $extra = @{}) {
  $o = [ordered]@{ step = $step; done = $done; total = $total }
  foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] }
  Write-Json $progressFile $o -Append
}
function Stop-With([string]$code, [string]$message, $extra = @{}) {
  $e = New-Object System.Exception $message
  $e.Data['code'] = $code
  foreach ($k in $extra.Keys) { $e.Data[$k] = $extra[$k] }
  throw $e
}
$pauseFile = Join-Path $Job 'pause.flag'
function Test-Cancel {
  if (Test-Path -LiteralPath $cancelFile) { Stop-With 'cancelled' 'Cancelled.' }
  if (Test-Path -LiteralPath $pauseFile) {
    Step 'paused' 0 0
    while (Test-Path -LiteralPath $pauseFile) { Start-Sleep -Milliseconds 300; if (Test-Path -LiteralPath $cancelFile) { Stop-With 'cancelled' 'Cancelled.' } }
    Step 'resumed' 0 0
  }
}

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;

public static class VDiskApi {
  public const int IoPending = 997, Aborted = 995, InsufficientBuffer = 122;
  public static readonly Guid Microsoft = new Guid("EC984AEC-A0F9-47e9-901F-71415A66345B");
  public delegate bool Tick(long done, long total);

  [DllImport("virtdisk.dll", CharSet = CharSet.Unicode)] static extern int OpenVirtualDisk(IntPtr type, string path, int access, int flags, IntPtr parameters, out IntPtr handle);
  [DllImport("virtdisk.dll", CharSet = CharSet.Unicode)] static extern int CreateVirtualDisk(IntPtr type, string path, int access, IntPtr sd, int flags, int providerFlags, IntPtr parameters, IntPtr overlapped, out IntPtr handle);
  [DllImport("virtdisk.dll")] static extern int ResizeVirtualDisk(IntPtr handle, int flags, IntPtr parameters, IntPtr overlapped);
  [DllImport("virtdisk.dll")] static extern int CompactVirtualDisk(IntPtr handle, int flags, IntPtr parameters, IntPtr overlapped);
  [DllImport("virtdisk.dll")] static extern int MergeVirtualDisk(IntPtr handle, int flags, IntPtr parameters, IntPtr overlapped);
  [DllImport("virtdisk.dll")] static extern int GetVirtualDiskInformation(IntPtr handle, ref int size, IntPtr info, IntPtr used);
  [DllImport("virtdisk.dll")] static extern int SetVirtualDiskInformation(IntPtr handle, IntPtr info);
  [DllImport("virtdisk.dll")] static extern int GetVirtualDiskOperationProgress(IntPtr handle, IntPtr overlapped, IntPtr progress);
  [DllImport("virtdisk.dll")] static extern int EnumerateVirtualDiskMetadata(IntPtr handle, ref int count, [Out] Guid[] items);
  [DllImport("virtdisk.dll")] static extern int GetVirtualDiskMetadata(IntPtr handle, ref Guid item, ref int size, IntPtr data);
  [DllImport("virtdisk.dll")] static extern int SetVirtualDiskMetadata(IntPtr handle, ref Guid item, int size, IntPtr data);
  [DllImport("virtdisk.dll")] static extern int DeleteVirtualDiskMetadata(IntPtr handle, ref Guid item);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CancelIoEx(IntPtr handle, IntPtr overlapped);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, int revision, out IntPtr sd, IntPtr size);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool GetDiskFreeSpaceEx(string directory, out ulong available, out ulong total, out ulong free);
  public static long Free(string directory) { ulong a, t, f; if (!GetDiskFreeSpaceEx(directory, out a, out t, out f)) throw new Win32Exception(Marshal.GetLastWin32Error()); return (long)a; }

  static void Check(int rc) { if (rc != 0) throw new Win32Exception(rc); }
  static IntPtr Alloc(int size) { IntPtr p = Marshal.AllocHGlobal(size); for (int i = 0; i < size; i++) Marshal.WriteByte(p, i, 0); return p; }
  static void WriteGuid(IntPtr p, int offset, Guid g) { Marshal.Copy(g.ToByteArray(), 0, IntPtr.Add(p, offset), 16); }
  static Guid ReadGuid(IntPtr p, int offset) { byte[] b = new byte[16]; Marshal.Copy(IntPtr.Add(p, offset), b, 0, 16); return new Guid(b); }
  static void WriteType(IntPtr p, int offset, int deviceId) { Marshal.WriteInt32(p, offset, deviceId); if (deviceId != 0) WriteGuid(p, offset + 4, Microsoft); }
  static IntPtr StorageType(int deviceId) { IntPtr p = Alloc(20); WriteType(p, 0, deviceId); return p; }

  // Waits for an overlapped VirtDisk operation, reporting progress; a false Tick cancels it.
  static int Wait(IntPtr handle, IntPtr overlapped, int rc, Tick tick) {
    if (rc != IoPending) return rc;
    IntPtr progress = Alloc(24);
    bool cancelled = false;
    try {
      while (true) {
        int r = GetVirtualDiskOperationProgress(handle, overlapped, progress);
        if (r != 0) return r;
        int status = Marshal.ReadInt32(progress, 0);
        if (status != IoPending) return cancelled && status == Aborted ? Aborted : status;
        if (tick != null && !cancelled && !tick(Marshal.ReadInt64(progress, 8), Marshal.ReadInt64(progress, 16))) { cancelled = true; CancelIoEx(handle, overlapped); }
        Thread.Sleep(200);
      }
    } finally { Marshal.FreeHGlobal(progress); }
  }
  static IntPtr Overlapped(ManualResetEvent evt) { IntPtr ov = Alloc(32); Marshal.WriteIntPtr(ov, 24, evt.SafeWaitHandle.DangerousGetHandle()); return ov; }

  public static IntPtr Open(string path, int deviceId, bool readOnly, bool infoOnly, int flags) {
    IntPtr type = StorageType(deviceId), p = Alloc(44), handle;
    try {
      Marshal.WriteInt32(p, 0, 2); Marshal.WriteInt32(p, 4, infoOnly ? 1 : 0); Marshal.WriteInt32(p, 8, readOnly ? 1 : 0);
      Check(OpenVirtualDisk(type, path, 0, flags, p, out handle));
      return handle;
    } finally { Marshal.FreeHGlobal(type); Marshal.FreeHGlobal(p); }
  }
  public static void Close(IntPtr handle) { if (handle != IntPtr.Zero) CloseHandle(handle); }

  // CREATE_VIRTUAL_DISK_PARAMETERS version 2, 64-bit layout.
  public static void Create(string path, int deviceId, long size, int blockSize, int logicalSector, int physicalSector, string parent, int parentDeviceId, string source, int sourceDeviceId, bool fixedSize, string sddl, Tick tick) {
    IntPtr type = StorageType(deviceId), p = Alloc(128), parentPtr = IntPtr.Zero, sourcePtr = IntPtr.Zero, sd = IntPtr.Zero, ov = IntPtr.Zero, handle = IntPtr.Zero;
    ManualResetEvent evt = new ManualResetEvent(false);
    try {
      Marshal.WriteInt32(p, 0, 2);
      Marshal.WriteInt64(p, 24, size);
      Marshal.WriteInt32(p, 32, blockSize); Marshal.WriteInt32(p, 36, logicalSector); Marshal.WriteInt32(p, 40, physicalSector);
      if (!String.IsNullOrEmpty(parent)) { parentPtr = Marshal.StringToHGlobalUni(parent); Marshal.WriteIntPtr(p, 48, parentPtr); WriteType(p, 68, parentDeviceId); }
      if (!String.IsNullOrEmpty(source)) { sourcePtr = Marshal.StringToHGlobalUni(source); Marshal.WriteIntPtr(p, 56, sourcePtr); WriteType(p, 88, sourceDeviceId); }
      int flags = fixedSize ? 1 : 0;
      if (!String.IsNullOrEmpty(source) && source.StartsWith(@"\\.\PhysicalDrive", StringComparison.OrdinalIgnoreCase)) flags |= 2;
      if (!String.IsNullOrEmpty(sddl) && !ConvertStringSecurityDescriptorToSecurityDescriptor(sddl, 1, out sd, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
      ov = Overlapped(evt);
      int rc = CreateVirtualDisk(type, path, 0, sd, flags, 0, p, ov, out handle);
      Check(Wait(handle, ov, rc, tick));
    } finally {
      Close(handle); Marshal.FreeHGlobal(type); Marshal.FreeHGlobal(p);
      if (parentPtr != IntPtr.Zero) Marshal.FreeHGlobal(parentPtr);
      if (sourcePtr != IntPtr.Zero) Marshal.FreeHGlobal(sourcePtr);
      if (sd != IntPtr.Zero) LocalFree(sd);
      if (ov != IntPtr.Zero) Marshal.FreeHGlobal(ov);
      GC.KeepAlive(evt); evt.Dispose();
    }
  }

  // RESIZE_VIRTUAL_DISK_FLAG: 1 allows an unsafe size, 2 resizes to the smallest safe size.
  public static void Resize(string path, int deviceId, long size, bool smallest, bool allowUnsafe, Tick tick) {
    IntPtr handle = Open(path, deviceId, false, false, 0), p = Alloc(16), ov = IntPtr.Zero;
    ManualResetEvent evt = new ManualResetEvent(false);
    try {
      Marshal.WriteInt32(p, 0, 1); Marshal.WriteInt64(p, 8, smallest ? 0 : size);
      ov = Overlapped(evt);
      Check(Wait(handle, ov, ResizeVirtualDisk(handle, (allowUnsafe ? 1 : 0) | (smallest ? 2 : 0), p, ov), tick));
    } finally { Close(handle); Marshal.FreeHGlobal(p); if (ov != IntPtr.Zero) Marshal.FreeHGlobal(ov); GC.KeepAlive(evt); evt.Dispose(); }
  }

  // COMPACT_VIRTUAL_DISK_FLAG 1 skips the zero scan (quick).
  public static void Compact(string path, int deviceId, bool quick, Tick tick) {
    IntPtr handle = Open(path, deviceId, false, false, 0), p = Alloc(8), ov = IntPtr.Zero;
    ManualResetEvent evt = new ManualResetEvent(false);
    try {
      Marshal.WriteInt32(p, 0, 1);
      ov = Overlapped(evt);
      Check(Wait(handle, ov, CompactVirtualDisk(handle, quick ? 1 : 0, p, ov), tick));
    } finally { Close(handle); Marshal.FreeHGlobal(p); if (ov != IntPtr.Zero) Marshal.FreeHGlobal(ov); GC.KeepAlive(evt); evt.Dispose(); }
  }

  // MERGE_VIRTUAL_DISK_PARAMETERS version 2: source depth 1 is the child, target depth 2 its parent.
  public static void Merge(string path, int deviceId, int targetDepth, Tick tick) {
    IntPtr handle = Open(path, deviceId, false, false, 0), p = Alloc(12), ov = IntPtr.Zero;
    ManualResetEvent evt = new ManualResetEvent(false);
    try {
      Marshal.WriteInt32(p, 0, 2); Marshal.WriteInt32(p, 4, 1); Marshal.WriteInt32(p, 8, targetDepth);
      ov = Overlapped(evt);
      Check(Wait(handle, ov, MergeVirtualDisk(handle, 0, p, ov), tick));
    } finally { Close(handle); Marshal.FreeHGlobal(p); if (ov != IntPtr.Zero) Marshal.FreeHGlobal(ov); GC.KeepAlive(evt); evt.Dispose(); }
  }

  // SET_VIRTUAL_DISK_INFO: version 1 parent path, version 2 identifier.
  public static void SetParent(string path, int deviceId, string parent) {
    IntPtr handle = Open(path, deviceId, false, false, 1), p = Alloc(16), s = Marshal.StringToHGlobalUni(parent);
    try { Marshal.WriteInt32(p, 0, 1); Marshal.WriteIntPtr(p, 8, s); Check(SetVirtualDiskInformation(handle, p)); }
    finally { Close(handle); Marshal.FreeHGlobal(p); Marshal.FreeHGlobal(s); }
  }
  // Version 5 sets the virtual disk ID that Windows reports as the SCSI page 0x83 identifier (what
  // Set-VHD -ResetDiskIdentifier changes); version 2 renews the file's own unique identifier too.
  public static string NewIdentifier(string path, int deviceId) {
    IntPtr handle = Open(path, deviceId, false, false, 0), p = Alloc(24);
    Guid id = Guid.NewGuid();
    try {
      Marshal.WriteInt32(p, 0, 5); WriteGuid(p, 8, id); Check(SetVirtualDiskInformation(handle, p));
      Marshal.WriteInt32(p, 0, 2); WriteGuid(p, 8, Guid.NewGuid()); SetVirtualDiskInformation(handle, p);
      return id.ToString();
    } finally { Close(handle); Marshal.FreeHGlobal(p); }
  }

  // GET_VIRTUAL_DISK_INFO, union at offset 8. Each version is read on its own so one unsupported
  // version never hides the rest.
  public static Hashtable Details(string path, int deviceId) {
    IntPtr handle = Open(path, deviceId, true, true, 0);
    Hashtable h = new Hashtable();
    try {
      for (int v = 1; v <= 15; v++) {
        int size = 1024; IntPtr p = Alloc(size);
        try {
          Marshal.WriteInt32(p, 0, v);
          int rc = GetVirtualDiskInformation(handle, ref size, p, IntPtr.Zero);
          if (rc == InsufficientBuffer) { Marshal.FreeHGlobal(p); p = Alloc(size); Marshal.WriteInt32(p, 0, v); rc = GetVirtualDiskInformation(handle, ref size, p, IntPtr.Zero); }
          if (rc != 0) continue;
          switch (v) {
            case 1: h["virtualSize"] = Marshal.ReadInt64(p, 8); h["physicalSize"] = Marshal.ReadInt64(p, 16); h["blockSize"] = Marshal.ReadInt32(p, 24); h["sectorSize"] = Marshal.ReadInt32(p, 28); break;
            case 2: h["identifier"] = ReadGuid(p, 8).ToString(); break;
            case 3: h["parentResolved"] = Marshal.ReadInt32(p, 8) != 0; h["parentLocations"] = Marshal.PtrToStringUni(IntPtr.Add(p, 12)); break;
            case 4: h["parentIdentifier"] = ReadGuid(p, 8).ToString(); break;
            case 5: h["parentTimestamp"] = Marshal.ReadInt32(p, 8); break;
            case 6: h["deviceId"] = Marshal.ReadInt32(p, 8); break;
            case 7: h["providerSubtype"] = Marshal.ReadInt32(p, 8); break;
            case 8: h["is4kAligned"] = Marshal.ReadInt32(p, 8) != 0; break;
            case 9: h["hostLogicalSector"] = Marshal.ReadInt32(p, 8); h["hostPhysicalSector"] = Marshal.ReadInt32(p, 12); h["isRemote"] = Marshal.ReadInt32(p, 16) != 0; break;
            case 10: h["physicalSectorSize"] = Marshal.ReadInt32(p, 8); break;
            case 11: h["smallestSafeSize"] = Marshal.ReadInt64(p, 8); break;
            case 12: h["fragmentation"] = Marshal.ReadInt32(p, 8); break;
            case 13: h["isLoaded"] = Marshal.ReadInt32(p, 8) != 0; break;
            case 14: h["virtualDiskId"] = ReadGuid(p, 8).ToString(); break;
            case 15: h["changeTracking"] = Marshal.ReadInt32(p, 8) != 0; break;
          }
        } finally { Marshal.FreeHGlobal(p); }
      }
    } finally { Close(handle); }
    return h;
  }

  public static string[] MetadataIds(string path, int deviceId) {
    IntPtr handle = Open(path, deviceId, true, true, 0);
    try {
      int count = 0; int rc = EnumerateVirtualDiskMetadata(handle, ref count, null);
      if (rc != 0 && rc != 234 && rc != InsufficientBuffer) Check(rc);
      Guid[] items = new Guid[Math.Max(count, 1)];
      if (count > 0) Check(EnumerateVirtualDiskMetadata(handle, ref count, items));
      string[] ids = new string[count]; for (int i = 0; i < count; i++) ids[i] = items[i].ToString();
      return ids;
    } finally { Close(handle); }
  }
  public static byte[] GetMetadata(string path, int deviceId, Guid item) {
    IntPtr handle = Open(path, deviceId, true, true, 0);
    try {
      int size = 0; int rc = GetVirtualDiskMetadata(handle, ref item, ref size, IntPtr.Zero);
      if (rc != 0 && rc != 234 && rc != InsufficientBuffer) Check(rc);
      IntPtr p = Alloc(Math.Max(size, 1));
      try { Check(GetVirtualDiskMetadata(handle, ref item, ref size, p)); byte[] b = new byte[size]; Marshal.Copy(p, b, 0, size); return b; } finally { Marshal.FreeHGlobal(p); }
    } finally { Close(handle); }
  }
  public static void SetMetadata(string path, int deviceId, Guid item, byte[] data) {
    IntPtr handle = Open(path, deviceId, false, false, 0), p = Alloc(Math.Max(data.Length, 1));
    try { Marshal.Copy(data, 0, p, data.Length); Check(SetVirtualDiskMetadata(handle, ref item, data.Length, p)); } finally { Close(handle); Marshal.FreeHGlobal(p); }
  }
  public static void DeleteMetadata(string path, int deviceId, Guid item) {
    IntPtr handle = Open(path, deviceId, false, false, 0);
    try { Check(DeleteVirtualDiskMetadata(handle, ref item)); } finally { Close(handle); }
  }
}
'@

$req = [IO.File]::ReadAllText((Join-Path $Job 'request.json'), $utf8) | ConvertFrom-Json
# Windows reports mount points and disk locations by long path, so the job folder must be one too.
$Job = (New-Object -ComObject Scripting.FileSystemObject).GetFolder($Job).Path
$devices = @{ '.iso' = 1; '.vhd' = 2; '.avhd' = 2; '.vhdx' = 3; '.avhdx' = 3; '.vhds' = 4 }
function DeviceOf([string]$path) { $d = $devices[[IO.Path]::GetExtension($path).ToLowerInvariant()]; if (-not $d) { Stop-With 'format' 'Unsupported file type.' }; $d }
$script:tickStep = 'work'
$script:tick = [VDiskApi+Tick]{ param($done, $total) Step $script:tickStep $done $total; return (-not (Test-Path -LiteralPath $cancelFile)) }
function Ticker([string]$step) { $script:tickStep = $step; return $script:tick }
function FileSize([string]$path) { (Get-Item -LiteralPath $path -Force).Length }

# ---------- attach state ----------
function Get-Attach([string]$path) {
  try { $img = Get-DiskImage -ImagePath $path } catch { return $null }
  if (-not $img.Attached) { return $null }
  $disk = $null; try { $disk = $img | Get-Disk } catch { }
  [ordered]@{ attached = $true; number = $(if ($disk) { $disk.Number } else { $null }); readOnly = $(if ($disk) { [bool]$disk.IsReadOnly } else { $true }) }
}
function Attach([string]$path, [bool]$readOnly, [bool]$noLetter) {
  $mount = @{ ImagePath = $path; Access = $(if ($readOnly) { 'ReadOnly' } else { 'ReadWrite' }); PassThru = $true }
  if ([IO.Path]::GetExtension($path) -ieq '.vhds') { $mount['StorageType'] = 'VHDSet' }
  if ($noLetter) { $mount['NoDriveLetter'] = $true }
  Mount-DiskImage @mount | Out-Null
}
function Detach([string]$path) { Dismount-DiskImage -ImagePath $path | Out-Null }
# Runs work on a detached disk and puts the attachment back the way it was.
function With-Detached([string]$path, [scriptblock]$work) {
  $was = Get-Attach $path
  if ($was) { Detach $path }
  try { & $work } finally { if ($was) { try { Attach $path $was.readOnly $false } catch { } } }
}
function Get-Volumes([int]$number) {
  @(Get-Partition -DiskNumber $number -ErrorAction SilentlyContinue | ForEach-Object {
    $v = $null; try { $v = $_ | Get-Volume -ErrorAction Stop } catch { }
    [ordered]@{ partition = $_.PartitionNumber; letter = $(if ($_.DriveLetter -and $_.DriveLetter -ne [char]0) { [string]$_.DriveLetter } else { $null }); size = $_.Size; type = [string]$_.Type;
      label = $(if ($v) { $v.FileSystemLabel } else { $null }); fileSystem = $(if ($v) { $v.FileSystem } else { $null }); free = $(if ($v) { $v.SizeRemaining } else { $null }); paths = @($_.AccessPaths) }
  })
}
function Extend-Last([int]$number) {
  $p = Get-Partition -DiskNumber $number | Where-Object { $_.Type -ne 'Reserved' } | Sort-Object Offset | Select-Object -Last 1
  if (-not $p) { return }
  $max = ($p | Get-PartitionSupportedSize).SizeMax
  if ($max -gt $p.Size + 1MB) { $p | Resize-Partition -Size $max }
}
function Guard-Disk([int]$number) {
  $d = Get-Disk -Number $number
  if ($d.IsBoot -or $d.IsSystem) { Stop-With 'protected' 'This is the Windows boot or system disk, so it is never changed here.' }
  if ($d.BusType -ne 'File Backed Virtual') { Stop-With 'notvirtual' 'Only virtual disks are changed here.' }
  $d
}
function Prepare-Volume($disk, $vol) {
  Initialize-Disk -Number $disk.Number -PartitionStyle $vol.style -ErrorAction SilentlyContinue
  $np = @{ DiskNumber = $disk.Number; UseMaximumSize = $true }
  if ($vol.letter -match '^[D-Z]$') { $np['DriveLetter'] = $vol.letter } elseif ($vol.letter -ne 'none') { $np['AssignDriveLetter'] = $true }
  $part = New-Partition @np
  $fv = @{ Partition = $part; FileSystem = $vol.fileSystem; Confirm = $false; Force = $true }
  if ($vol.label) { $fv['NewFileSystemLabel'] = $vol.label }
  if ($vol.unit -gt 0) { $fv['AllocationUnitSize'] = $vol.unit }
  if ($vol.full) { $fv['Full'] = $true }
  if ($vol.compress) { $fv['Compress'] = $true }
  if ($vol.devDrive) { $fv['DevDrive'] = $true }
  Format-Volume @fv | Out-Null
  $part
}

# ---------- operations ----------
function Op-List {
  $disks = @(Get-Disk | Where-Object { $_.BusType -eq 'File Backed Virtual' } | ForEach-Object {
    [ordered]@{ number = $_.Number; path = $_.Location; size = $_.Size; offline = [bool]$_.IsOffline; readOnly = [bool]$_.IsReadOnly; style = [string]$_.PartitionStyle;
      status = [string]$_.OperationalStatus; offlineReason = [string]$_.OfflineReason; volumes = @(Get-Volumes $_.Number) }
  })
  $drives = @(Get-CimInstance Win32_CDROMDrive -ErrorAction SilentlyContinue).Count
  $isos = @(0..([Math]::Max($drives, 1) - 1) | ForEach-Object {
    try { $img = Get-DiskImage -DevicePath "\\.\CDROM$_" -ErrorAction Stop } catch { $img = $null }
    if ($img -and $img.Attached) { $vol = $null; try { $vol = $img | Get-Volume -ErrorAction Stop } catch { }
      [ordered]@{ path = $img.ImagePath; size = $img.Size; letter = $(if ($vol -and $vol.DriveLetter) { [string]$vol.DriveLetter } else { $null }); label = $(if ($vol) { $vol.FileSystemLabel } else { $null }) } }
  })
  @{ ok = $true; disks = $disks; isos = $isos }
}
function Op-State($r) {
  $a = Get-Attach $r.path
  $out = [ordered]@{ ok = $true; attached = [bool]$a }
  if ($a -and $null -ne $a.number) { $d = Get-Disk -Number $a.number; $out['disk'] = [ordered]@{ number = $d.Number; offline = [bool]$d.IsOffline; readOnly = [bool]$d.IsReadOnly; style = [string]$d.PartitionStyle; offlineReason = [string]$d.OfflineReason; volumes = @(Get-Volumes $d.Number) } }
  $out
}
function Op-Details($r) {
  $h = [VDiskApi]::Details($r.path, (DeviceOf $r.path))
  $out = @{ ok = $true }; foreach ($k in $h.Keys) { $out[$k] = $h[$k] }
  $out
}
function Op-Create($r) {
  if (Test-Path -LiteralPath $r.path) { Stop-With 'exists' 'A file with that name already exists.' }
  $dev = DeviceOf $r.path
  $parentDev = $(if ($r.parent) { DeviceOf $r.parent } else { 0 })
  $sourceDev = $(if ($r.source -and $r.source -notmatch '^\\\\\.\\PhysicalDrive') { DeviceOf $r.source } else { 0 })
  Step 'create' 0 1
  try {
    [VDiskApi]::Create($r.path, $dev, [long]$r.size, [int]$r.blockSize, [int]$r.logicalSector, [int]$r.physicalSector, [string]$r.parent, $parentDev, [string]$r.source, $sourceDev, ($r.type -eq 'fixed'), [string]$r.sddl, (Ticker 'create'))
  } catch { if (Test-Path -LiteralPath $r.path) { Remove-Item -LiteralPath $r.path -Force -ErrorAction SilentlyContinue }; throw }
  $out = [ordered]@{ ok = $true; path = $r.path; fileSize = (FileSize $r.path) }
  if ($r.volume) {
    Step 'format' 0 1
    try {
      Attach $r.path $false $true
      $disk = Get-DiskImage -ImagePath $r.path | Get-Disk
      $part = Prepare-Volume $disk $r.volume
      $out['volume'] = @(Get-Volumes $disk.Number)
      if ($r.volume.devDrive -and $part.DriveLetter) { & fsutil devdrv trust "$($part.DriveLetter):" | Out-Null }
      if (-not $r.keepAttached) { Detach $r.path }
    } catch { try { Detach $r.path } catch { }; Remove-Item -LiteralPath $r.path -Force -ErrorAction SilentlyContinue; throw }
  }
  $out
}
function Op-Attach($r) {
  if (Get-Attach $r.path) { return @{ ok = $true; already = $true } }
  Attach $r.path ([bool]$r.readOnly) ([bool]$r.noLetter)
  $out = Op-State $r
  if ($r.atSignIn) {
    $name = 'Tunnel App Deployer attach ' + ([IO.Path]::GetFileName($r.path) -replace '[^\w\-. ]', '_')
    $cmd = "Mount-DiskImage -ImagePath '$($r.path -replace "'", "''")' -Access $(if ($r.readOnly) { 'ReadOnly' } else { 'ReadWrite' })"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -RunLevel Highest
    Register-ScheduledTask -TaskName $name -TaskPath '\TunnelAppDeployer\' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    $out['task'] = $name
  }
  $out
}
function Op-Detach($r) {
  if (-not (Get-Attach $r.path)) { return @{ ok = $true; already = $true } }
  Detach $r.path
  @{ ok = $true }
}
function Op-ForgetTask($r) {
  $name = 'Tunnel App Deployer attach ' + ([IO.Path]::GetFileName($r.path) -replace '[^\w\-. ]', '_')
  Unregister-ScheduledTask -TaskName $name -TaskPath '\TunnelAppDeployer\' -Confirm:$false -ErrorAction SilentlyContinue
  @{ ok = $true }
}
function Op-Grow($r) {
  $dev = DeviceOf $r.path; $before = FileSize $r.path
  $was = Get-Attach $r.path
  With-Detached $r.path { [VDiskApi]::Resize($r.path, $dev, [long]$r.size, $false, $false, (Ticker 'grow')) }
  if ($r.extend) {
    $temp = -not (Get-Attach $r.path)
    if ($temp) { Attach $r.path $false $true }
    try { $n = (Get-DiskImage -ImagePath $r.path | Get-Disk).Number; Extend-Last $n } finally { if ($temp) { Detach $r.path } }
  }
  @{ ok = $true; before = $before; fileSize = (FileSize $r.path); restored = [bool]$was }
}
function Op-Shrink($r) {
  $dev = DeviceOf $r.path
  if ($dev -ne 3) { Stop-With 'vhdxonly' 'Only VHDX files can shrink.' }
  $temp = -not (Get-Attach $r.path)
  if ($temp) { Attach $r.path $false $true }
  try {
    $n = (Get-DiskImage -ImagePath $r.path | Get-Disk).Number
    $p = Get-Partition -DiskNumber $n | Where-Object { $_.Type -ne 'Reserved' } | Sort-Object Offset | Select-Object -Last 1
    if ($p) {
      $sup = $p | Get-PartitionSupportedSize
      $target = $(if ($r.smallest) { $sup.SizeMin + 64MB } else { [long]$r.size - $p.Offset - 2MB })
      if ($target -lt $sup.SizeMin) { Stop-With 'tooSmall' 'The volume holds more than that size.' @{ min = ($sup.SizeMin + $p.Offset + 2MB) } }
      if ($target -lt $p.Size) { $p | Resize-Partition -Size ([Math]::Floor($target / 1MB) * 1MB) }
    }
  } finally { if ($temp) { Detach $r.path } }
  With-Detached $r.path { [VDiskApi]::Resize($r.path, $dev, [long]$r.size, [bool]$r.smallest, [bool]$r.allowUnsafe, (Ticker 'shrink')) }
  @{ ok = $true; details = (Op-Details $r) }
}
function Op-Compact($r) {
  $dev = DeviceOf $r.path; $before = FileSize $r.path
  With-Detached $r.path { [VDiskApi]::Compact($r.path, $dev, ($r.mode -eq 'quick'), (Ticker 'compact')) }
  @{ ok = $true; before = $before; fileSize = (FileSize $r.path); mode = $(if ($r.mode -eq 'quick') { 'quick' } else { 'full' }) }
}
function Op-Convert($r) {
  if (Test-Path -LiteralPath $r.target) { Stop-With 'exists' 'A file with that name already exists.' }
  $was = Get-Attach $r.path
  if ($was) { Detach $r.path }
  try {
    [VDiskApi]::Create($r.target, (DeviceOf $r.target), 0, [int]$r.blockSize, 0, 0, $null, 0, $r.path, (DeviceOf $r.path), ($r.type -eq 'fixed'), $null, (Ticker 'convert'))
  } catch { Remove-Item -LiteralPath $r.target -Force -ErrorAction SilentlyContinue; throw } finally { if ($was) { try { Attach $r.path $was.readOnly $false } catch { } } }
  @{ ok = $true; path = $r.target; fileSize = (FileSize $r.target) }
}
function Op-Child($r) {
  if (Test-Path -LiteralPath $r.target) { Stop-With 'exists' 'A file with that name already exists.' }
  if (Get-Attach $r.path) { Stop-With 'attached' 'Detach the parent first; a parent must not change while it has children.' }
  [VDiskApi]::Create($r.target, (DeviceOf $r.target), 0, 0, 0, 0, $r.path, (DeviceOf $r.path), $null, 0, $false, $null, (Ticker 'child'))
  @{ ok = $true; path = $r.target; fileSize = (FileSize $r.target) }
}
function Op-Merge($r) {
  if (Get-Attach $r.path) { Stop-With 'attached' 'Detach the disk before merging.' }
  [VDiskApi]::Merge($r.path, (DeviceOf $r.path), [int]$r.depth + 1, (Ticker 'merge'))
  @{ ok = $true }
}
function Op-Reparent($r) {
  if (Get-Attach $r.path) { Stop-With 'attached' 'Detach the disk before changing its parent.' }
  [VDiskApi]::SetParent($r.path, (DeviceOf $r.path), $r.parent)
  @{ ok = $true }
}
function Op-NewId($r) {
  With-Detached $r.path { $script:newId = [VDiskApi]::NewIdentifier($r.path, (DeviceOf $r.path)) }
  @{ ok = $true; identifier = $script:newId }
}
function Op-Disk($r) {
  $d = Guard-Disk ([int]$r.disk)
  switch ($r.action) {
    'online' { Set-Disk -Number $d.Number -IsOffline $false }
    'writable' { Set-Disk -Number $d.Number -IsReadOnly $false }
    'fixsig' {
      if ($d.PartitionStyle -eq 'GPT') { Set-Disk -Number $d.Number -Guid ([guid]::NewGuid().ToString('B')) } else { Set-Disk -Number $d.Number -Signature ([uint32](Get-Random -Minimum 1 -Maximum ([int]::MaxValue))) }
      Set-Disk -Number $d.Number -IsOffline $false
    }
    default { Stop-With 'action' 'Unknown disk action.' }
  }
  @{ ok = $true; volumes = @(Get-Volumes $d.Number) }
}
function Op-Metadata($r) {
  $dev = DeviceOf $r.path
  if ($r.action -eq 'set') { With-Detached $r.path { [VDiskApi]::SetMetadata($r.path, $dev, [guid]$r.id, [Text.Encoding]::UTF8.GetBytes([string]$r.value)) } }
  elseif ($r.action -eq 'delete') { With-Detached $r.path { [VDiskApi]::DeleteMetadata($r.path, $dev, [guid]$r.id) } }
  $items = @([VDiskApi]::MetadataIds($r.path, $dev) | ForEach-Object {
    $b = [VDiskApi]::GetMetadata($r.path, $dev, [guid]$_)
    $text = $null; try { $text = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($b) } catch { }
    [ordered]@{ id = $_; size = $b.Length; text = $text; hex = (($b | Select-Object -First 64 | ForEach-Object { $_.ToString('x2') }) -join '') }
  })
  @{ ok = $true; items = $items }
}

# ---------- Quick pack ----------
function Long([string]$p) { if ($p.Length -ge 240 -and -not $p.StartsWith('\\?\')) { if ($p.StartsWith('\\')) { '\\?\UNC\' + $p.Substring(2) } else { '\\?\' + $p } } else { $p } }
function Hash([string]$p) {
  $s = [IO.File]::Open((Long $p), 'Open', 'Read', 'ReadWrite')
  try { $sha = [Security.Cryptography.SHA256]::Create(); try { [BitConverter]::ToString($sha.ComputeHash($s)) } finally { $sha.Dispose() } } finally { $s.Dispose() }
}
function Walk([string]$root, [string]$rel, [Collections.Generic.List[object]]$files, [Collections.Generic.List[string]]$dirs, [Collections.Generic.List[object]]$skipped) {
  $dirs.Add($rel)
  try { $entries = [IO.Directory]::EnumerateFileSystemEntries((Long $root)) } catch { $skipped.Add([ordered]@{ path = $rel; reason = $_.Exception.Message }); return }
  foreach ($e in $entries) {
    $name = [IO.Path]::GetFileName($e); $childRel = $(if ($rel) { "$rel\$name" } else { $name })
    $attr = [IO.File]::GetAttributes($e)
    if ($attr -band [IO.FileAttributes]::ReparsePoint) { $skipped.Add([ordered]@{ path = $childRel; reason = 'link' }); continue }
    if ($attr -band [IO.FileAttributes]::Directory) { Walk $e $childRel $files $dirs $skipped }
    else { $files.Add([ordered]@{ src = $e; rel = $childRel; size = (New-Object IO.FileInfo $e).Length }) }
  }
}
function Mount-Pack([string]$path, [string]$mnt) {
  Attach $path $false $true
  $disk = Get-DiskImage -ImagePath $path | Get-Disk
  $part = Get-Partition -DiskNumber $disk.Number | Where-Object { $_.Type -ne 'Reserved' } | Sort-Object Offset | Select-Object -Last 1
  # The mount manager remembers the folder mount across a detach, so only add it when it is gone.
  if (-not ((Get-Item -LiteralPath $mnt -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { Add-PartitionAccessPath -InputObject $part -AccessPath "$mnt\" }
  $part
}
function Op-Pack($r) {
  if (Test-Path -LiteralPath $r.path) { Stop-With 'exists' 'A file with that name already exists.' }
  $mnt = Join-Path $Job 'mnt'; New-Item -ItemType Directory -Path $mnt -Force | Out-Null
  $files = New-Object 'Collections.Generic.List[object]'; $dirs = New-Object 'Collections.Generic.List[string]'; $skipped = New-Object 'Collections.Generic.List[object]'
  foreach ($item in $r.items) {
    $attr = [IO.File]::GetAttributes($item)
    if ($attr -band [IO.FileAttributes]::Directory) { Walk $item ([IO.Path]::GetFileName($item.TrimEnd('\'))) $files $dirs $skipped }
    else { $files.Add([ordered]@{ src = $item; rel = [IO.Path]::GetFileName($item); size = (New-Object IO.FileInfo $item).Length }) }
  }
  $total = [long]0; foreach ($f in $files) { $total += [long]$f.size }
  Step 'measure' $total $total @{ files = $files.Count; folders = $dirs.Count }
  $size = [long]$r.size; $grows = New-Object 'Collections.Generic.List[object]'; $created = $false
  try {
    Test-Cancel
    [VDiskApi]::Create($r.path, 3, $size, 0, 0, 0, $null, 0, $null, 0, [bool]$r.fixed, $null, (Ticker 'create'))
    $created = $true
    Attach $r.path $false $true
    $disk = Get-DiskImage -ImagePath $r.path | Get-Disk
    Initialize-Disk -Number $disk.Number -PartitionStyle GPT
    $part = New-Partition -DiskNumber $disk.Number -UseMaximumSize
    if ($part.DriveLetter -and $part.DriveLetter -ne [char]0) { Remove-PartitionAccessPath -DiskNumber $disk.Number -PartitionNumber $part.PartitionNumber -AccessPath "$($part.DriveLetter):\" -ErrorAction SilentlyContinue }
    Format-Volume -Partition $part -FileSystem $r.fileSystem -NewFileSystemLabel $r.label -Confirm:$false -Force | Out-Null
    Add-PartitionAccessPath -DiskNumber $disk.Number -PartitionNumber $part.PartitionNumber -AccessPath "$mnt\"
    $part = Get-Partition -DiskNumber $disk.Number -PartitionNumber $part.PartitionNumber
    Step 'format' 1 1
    foreach ($d in $dirs) { if ($d) { [IO.Directory]::CreateDirectory((Long (Join-Path $mnt $d))) | Out-Null } }
    $done = 0; $index = 0
    foreach ($f in $files) {
      Test-Cancel
      $index++
      $dst = Join-Path $mnt $f.rel
      $free = [VDiskApi]::Free("$mnt\")
      $attempt = 0
      while ($true) {
        $need = [long]$f.size + 64MB
        if ($free -lt $need -or $attempt -gt 0) {
          $from = $size; $size = [long]([Math]::Ceiling(($size + [Math]::Max($need - $free, 0) + [Math]::Max(($total - $done) * 0.25, 256MB)) / 1MB) * 1MB)
          if ($size -gt 64TB) { Stop-With 'limit' 'The files need more than the 64 TB VHDX limit.' }
          $host_ = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($r.path))
          if (-not $r.fixed -and $host_.AvailableFreeSpace -lt ($total - $done + 256MB)) { Stop-With 'space' 'There is not enough free space for the files.' @{ shortfall = ($total - $done + 256MB - $host_.AvailableFreeSpace) } }
          Step 'grow' $done $total @{ from = $from; to = $size; file = $f.rel }
          Detach $r.path
          [VDiskApi]::Resize($r.path, 3, $size, $false, $false, $null)
          $part = Mount-Pack $r.path $mnt
          Extend-Last $part.DiskNumber
          $grows.Add([ordered]@{ from = $from; to = $size; file = $f.rel })
          $free = [VDiskApi]::Free("$mnt\")
        }
        try {
          if ([IO.File]::Exists((Long $dst))) { [IO.File]::SetAttributes((Long $dst), 'Normal'); [IO.File]::Delete((Long $dst)) }
          [IO.File]::Copy((Long $f.src), (Long $dst), $false)
          break
        } catch [IO.IOException] {
          $code = $_.Exception.HResult -band 0xFFFF
          if ($code -ne 112 -and $code -ne 39) { $skipped.Add([ordered]@{ path = $f.rel; reason = $_.Exception.Message }); $dst = $null; break }
          $attempt++
          if ($attempt -gt 4) { throw }
          $free = 0
        } catch [UnauthorizedAccessException] { $skipped.Add([ordered]@{ path = $f.rel; reason = $_.Exception.Message }); $dst = $null; break }
      }
      if ($dst) {
        $si = New-Object IO.FileInfo (Long $f.src)
        # The copy carries the read-only flag along, and .NET Framework opens a file for writing to
        # set its times, so the flags are cleared first and put back once the copy is checked.
        [IO.File]::SetAttributes((Long $dst), [IO.FileAttributes]::Normal)
        [IO.File]::SetCreationTimeUtc((Long $dst), $si.CreationTimeUtc); [IO.File]::SetLastWriteTimeUtc((Long $dst), $si.LastWriteTimeUtc); [IO.File]::SetLastAccessTimeUtc((Long $dst), $si.LastAccessTimeUtc)
        if ($r.keepAcl) { try { Set-Acl -LiteralPath $dst -AclObject (Get-Acl -LiteralPath $f.src) } catch { } }
        if ((Hash $f.src) -ne (Hash $dst)) { Stop-With 'verify' 'A copied file did not match its original.' @{ file = $f.rel } }
        # Read-only, hidden, system, archive and not-indexed are the flags a file can be given directly.
        # Plain statements on purpose: Windows PowerShell rejects an if-expression whose branches mix an
        # object with a number ("Argument types do not match").
        $keep = [IO.FileAttributes]([int]$si.Attributes -band 0x2027)
        if ([int]$keep -eq 0) { $keep = [IO.FileAttributes]::Normal }
        [IO.File]::SetAttributes((Long $dst), $keep)
      }
      $done += $f.size
      Step 'copy' $done $total @{ file = $f.rel; index = $index; count = $files.Count }
    }
    foreach ($d in ($dirs | Sort-Object Length -Descending)) {
      if (-not $d) { continue }
      $src = $null; foreach ($item in $r.items) { $base = [IO.Path]::GetFileName($item.TrimEnd('\')); if ($d -eq $base -or $d.StartsWith("$base\")) { $src = Join-Path ([IO.Path]::GetDirectoryName($item.TrimEnd('\'))) $d } }
      if ($src) { $di = New-Object IO.DirectoryInfo (Long $src); $dd = New-Object IO.DirectoryInfo (Long (Join-Path $mnt $d)); $dd.CreationTimeUtc = $di.CreationTimeUtc; $dd.LastWriteTimeUtc = $di.LastWriteTimeUtc }
    }
    if ($r.tight) {
      Step 'fit' 0 1
      $p = Get-Partition -DiskNumber $part.DiskNumber -PartitionNumber $part.PartitionNumber
      $sup = $p | Get-PartitionSupportedSize
      if ($sup.SizeMin + 128MB -lt $p.Size) { $p | Resize-Partition -Size ([Math]::Ceiling(($sup.SizeMin + 128MB) / 1MB) * 1MB) }
      Remove-PartitionAccessPath -InputObject $p -AccessPath "$mnt\" -ErrorAction SilentlyContinue
      Detach $r.path
      [VDiskApi]::Resize($r.path, 3, 0, $true, $false, $null)
    } else {
      Remove-PartitionAccessPath -InputObject $part -AccessPath "$mnt\" -ErrorAction SilentlyContinue
      Detach $r.path
    }
    Step 'detach' 1 1
    $details = [VDiskApi]::Details($r.path, 3)
    @{ ok = $true; path = $r.path; files = $files.Count; folders = $dirs.Count; bytes = $total; grows = @($grows); skipped = @($skipped); partial = ($skipped.Count -gt 0); verified = $true;
       virtualSize = $details['virtualSize']; fileSize = (FileSize $r.path) }
  } catch {
    if ($created) {
      try { Get-DiskImage -ImagePath $r.path | Get-Disk | Get-Partition | Where-Object { $_.AccessPaths -contains "$mnt\" } | ForEach-Object { Remove-PartitionAccessPath -InputObject $_ -AccessPath "$mnt\" -ErrorAction SilentlyContinue } } catch { }
      try { Detach $r.path } catch { }
      Remove-Item -LiteralPath $r.path -Force -ErrorAction SilentlyContinue
    }
    throw
  }
}

# ---------- dispatch ----------
try {
  $handlers = @{ list = { Op-List }; state = { Op-State $req }; details = { Op-Details $req }; create = { Op-Create $req }; attach = { Op-Attach $req }; detach = { Op-Detach $req };
    forgettask = { Op-ForgetTask $req }; grow = { Op-Grow $req }; shrink = { Op-Shrink $req }; compact = { Op-Compact $req }; convert = { Op-Convert $req }; child = { Op-Child $req };
    merge = { Op-Merge $req }; reparent = { Op-Reparent $req }; newid = { Op-NewId $req }; disk = { Op-Disk $req }; metadata = { Op-Metadata $req }; pack = { Op-Pack $req } }
  $handler = $handlers[[string]$req.op]
  if (-not $handler) { Stop-With 'op' 'Unknown operation.' }
  $result = & $handler
  Write-Json $resultFile $result
} catch {
  $ex = $_.Exception
  while ($ex.InnerException -and -not $ex.Data['code']) { $ex = $ex.InnerException }
  $code = $(if ($ex.Data['code']) { $ex.Data['code'] } elseif ($ex -is [ComponentModel.Win32Exception]) { if ($ex.NativeErrorCode -eq 995) { 'cancelled' } else { 'win32' } } else { 'failed' })
  $out = [ordered]@{ ok = $false; code = $code; message = $ex.Message }
  if ($ex -is [ComponentModel.Win32Exception]) { $out['win32'] = $ex.NativeErrorCode }
  foreach ($k in $ex.Data.Keys) { if ($k -ne 'code') { $out[[string]$k] = $ex.Data[$k] } }
  # Unexpected failures carry the script line, so a report from another computer can be traced.
  if ($code -eq 'failed' -and $_.InvocationInfo) { $out['line'] = $_.InvocationInfo.ScriptLineNumber }
  Write-Json $resultFile $out
  exit 1
}
