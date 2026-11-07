# Virtual disks

Create, attach and change VHD and VHDX files on Windows, and pack files and folders into a new VHDX right beside them.

Open **Tools › Virtual disks**, or search the palette (**Ctrl+Shift+F**) for *Virtual disks*, *New virtual disk* or *Quick pack*.

## The library

- **Attached on this PC** lists every virtual disk Windows has attached, whether this app attached it or not, with its drive letters. **Files** lists the disk files you opened, dropped or made here.
- Filter by **Attached**, **Files** or format, and search by name, folder, type or drive letter. The regex builder works here as it does everywhere else.
- Drop VHDX, VHD, AVHDX, VHDS or ISO files anywhere on the screen to add them. **Remove from this list** forgets a file without touching it.
- The list refreshes when you come back to the window, so disks attached somewhere else show up.

## Details

Choosing a disk shows what its own header says: format, type, virtual size, size on disk, block size, sector sizes, identifier and when it last changed. Reading the header needs no permission. **More details** asks Windows for the smallest safe size, fragmentation and 4K alignment; when Windows only tells an administrator, the screen says so and offers to ask.

An attached disk shows each volume with its letter, file system, free space and **Open**. A differencing disk shows its chain of parents and says when a parent is missing. Damaged headers and unfinished log entries are called out.

## Actions

Every action stays on screen. One that does not apply to the chosen disk says why instead of disappearing.

- **Attach** read-write or read-only, with or without a drive letter, and optionally every time you sign in. Signing in uses a Windows scheduled task, and the details offer **Stop** while it exists. ISO images always attach read-only.
- **Detach** asks first, because programs using the disk lose it.
- **Grow** up to 2,040 GB for VHD or 64 TB for VHDX, extending the last volume into the new space.
- **Shrink** a VHDX to the smallest safe size or a size you choose. The last volume shrinks first; Windows never cuts into used space.
- **Compact**: quick returns blocks the volume already marked free; full also finds blocks filled with zeros.
- **Convert** between VHD and VHDX, and between fixed and dynamic. The result is a new file beside the original. Converting a differencing disk makes a standalone copy with its parents folded in.
- **Differencing child** makes a new file beside the disk that takes every change from then on.
- **Merge into parent** and **New parent path** work on differencing disks, both behind the two-step confirmation.
- **New identifier** gives a copied disk its own identity so Windows can attach it next to the original.
- **Metadata** adds, reads and deletes notes stored inside a VHDX.
- **Bring online** and **Make writable** fix an attached disk that Windows left offline or read-only. A signature collision gets a new signature first.

Changes that need the disk detached detach it, make the change and attach it again.

Each action shows its **Equivalent script** in PowerShell and DiskPart, ready to copy. The PowerShell lines use the Hyper-V module; DiskPart works on every edition of Windows.

## New virtual disk

Presets fill everything in: **Custom**, **Portable data disk** (exFAT), **Dev Drive** (ReFS, 50 GB or more) and **Differencing copy**. Any field can still be changed.

- **Format**: VHDX (recommended, up to 64 TB and safer after a power cut), VHD (up to 2,040 GB) or VHD Set.
- **Type**: dynamically expanding, fixed size, or differencing on top of a parent you choose.
- **Size** and **Save as**. An existing file is never replaced: the next free name is used, and the sheet says so.
- **Prepare a volume**: GPT or MBR, NTFS, ReFS, exFAT or FAT32, a label, a drive letter or none, full format, NTFS compression and Dev Drive.
- **Advanced**: block size, logical and physical sector size, copying an existing disk, and an access filter written in SDDL.

Before anything is written, the sheet checks the limits and the free space on the drive. A fixed disk bigger than the free space is stopped; a dynamic disk that could outgrow the drive gets a warning. FAT32 above 32 GB, MBR above 2 TB and a Dev Drive under 50 GB are stopped with the reason.

## Quick pack

Drop files and folders onto **Quick pack**, or use **Choose files** or **Choose a folder**. A new VHDX appears in the folder they came from, named after the folder or file, holding all of them.

- The size is estimated from the files. When they need more room, the disk and its volume grow by themselves and copying carries on; the progress shows each time it grew.
- Every file is copied with its timestamps, attributes and alternate data streams, then its SHA-256 is compared with the original. Folder timestamps are kept, and **Keep permissions** copies access lists too.
- Links are skipped and listed. The originals are never moved or changed.
- **Fit tightly at the end** shrinks the disk to its files when the copy is done.
- **Pause**, **Resume** and **Cancel** are there throughout. Cancelling, or any problem, removes the half-made VHDX.
- The result lists the files checked, the sizes, any growth and the name used, with **Show in folder** and **Attach now**.

## Permission

Windows asks for administrator permission once for each change. Looking at disks never asks. If you decline, nothing changes and the screen says so. Changes run through the Windows virtual disk API and the Storage module.

## Not yet

- VHD Sets are listed, and created where Windows has its Hyper-V parts, but their checkpoints are not managed here.
- Native boot entries, disk mirroring and change tracking are not offered yet.
- On Windows builds without Dev Drive, creating one fails with the message Windows gives.

Related: tools, safety, search-and-regex
