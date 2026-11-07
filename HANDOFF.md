# Designer handoff: Tunnel App Deployer

## Product

A local desktop app for selecting a Dockerfile or Docker Compose project and clicking **Host** to receive a free, public HTTPS link. It runs the selected app locally in Docker and connects it through Cloudflare Quick Tunnels. The desktop app is not hosted in AWS and does not require Cloudflare account sign-in or a domain.

This is a separate product from AWS App Deployer. Preserve that repository and its deployment workflow. This public repository is https://github.com/Ding-Ding-Projects/tunnel-app-deployer; documentation is at https://ding-ding-projects.github.io/tunnel-app-deployer/.

## User journey

1. Open the app; inspect Docker, Compose and tunnel prerequisites. Reuse valid installations. Supported missing tunnel binaries can be acquired from a pinned official release and hash-verified without global installation.
2. Choose a Dockerfile or Compose file using the native file picker. Inspect the actual source. For Compose, display every service and select the public web service; do not silently omit dependencies or unsupported settings.
3. Infer the container listening port when unambiguous; otherwise request that one selection. Default to local-only host binding, automatically allocated host ports, and a unique app-owned container/Compose project.
4. Press **Host** once. Run build, startup, local health, tunnel creation and public health checks automatically. Render actual events, not simulated progress.
5. Show the verified public URL with Copy and Open controls. Anyone with the link can access the app unless the hosted application itself requires authentication.
6. Show an explicit Stop sharing action. Stop the owned tunnel and app session safely; never delete persistent volumes or unrelated containers. Cancelling a startup must not leak an owned public tunnel.

## Lifecycle and recovery

Quick Tunnel links are temporary. A new tunnel can receive a new hostname; show that change clearly. Keep the hosting computer, Docker service and app running while sharing. If the process dies, immediately mark the old URL unavailable. Closing the app stops sharing; there is no implicit always-on cloud hosting.

Use bounded retries for supported transient startup and health failures, and actionable error messages for build failures, inaccessible ports, stopped Docker, unavailable network transport, unsupported Compose features and tunnel-provider limits. Never broaden permissions, delete data, replace user configurations, or retry forever to claim one-click success.

Quick Tunnels have no uptime guarantee, support up to 200 in-flight requests, and do not support server-sent events. Explain these limitations contextually; do not market this as permanent production hosting. Source: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/.

## Screens and interaction

Create a polished Material 3 desktop workflow with project selection, detected services, optional port, Host, active-session status, copyable/openable verified URL, Stop sharing, concise progress, and recovery actions. Include empty, checking, building, starting, verifying, live, stopping, cancelled, offline and failed states. Do not show an active URL merely because a string appeared in tunnel logs.

Use accessible names, keyboard navigation, visible focus, light/dark themes, reduced motion and a useful narrow-window layout. Remember presentation settings locally. Never place credentials or raw sensitive process output in the renderer, telemetry, screenshots, documentation, or shared links. No account registration screen is needed for the default Quick Tunnel flow.

## Parallel ownership and integration

- Backend: `src/backend/` and `tests/backend/`.
- Desktop: `src/main.js`, `src/preload.js`, `src/renderer/`, desktop tests, package files and build entrypoints.
- Design: `design/`; coordinate renderer edits on a dedicated branch before integration.
- Documentation/CI: `docs/`, root documentation and `.github/workflows/`.

The initial desktop implementation is being built alongside this handoff. The collaborating designer can refine its appearance and flow without changing backend ownership or inventing success states. Provide annotated designs and source files in `design/`, then submit a focused pull request.

Backend contract: `createHostManager({stateDir, ...testDependencies})` exposes `prerequisites()`, `inspectSource(source)`, `host(source, {onProgress, signal})`, `stop()`, and `status()`. Dockerfile input is `{kind:'dockerfile', contextPath, dockerfilePath, containerPort?}`; Compose input is `{kind:'compose', composePath, service?, containerPort?}`. Progress uses `{phase,message,...}`. Status exposes phase, local URL, public URL, error and source. Confirm final result shapes against the checked-in backend before wiring controls.

The preload bridge exposes only specific validated operations. The renderer must have no Node.js or arbitrary command access. Open external URLs only when they match the current verified HTTPS tunnel URL. Isolate operations, reject duplicate Host actions, and await cancellation/cleanup before another session begins.

## Acceptance and current limits

Verify source selection, ambiguous ports, multi-service inspection, normal hosting, missing prerequisites, failed builds, cancellation at each stage, process death, stale-URL clearing, Stop sharing, data preservation, keyboard use and restart settings. Exercise an actual container and actual public tunnel before claiming end-to-end delivery. Verify native packaging on its supported OS separately.

The initial desktop and backend code are integrated. All 20 automated checks pass. The actual Linux desktop was launched with real prerequisite checks; theme switching worked. The original idle-state screenshot has been replaced by renders of the redesigned interface (see below). Real Dockerfile and two-service Compose smoke tests built and started the selected local application, passed local HTTP checks, then correctly reported tunnel-service connection failure and cleaned up their containers. The managed environment cannot currently reach the Quick Tunnel service through its configured network route; no public-hosting success is claimed. Native Windows execution remains unverified.

Current Compose sessions use a fresh isolated project per attempt. Volumes survive Stop, but their data is not automatically attached to a later attempt. Explain this in the UI and do not market the preview as durable database hosting. Stable project identity, explicit restart/resume and volume management require follow-up implementation. The current source rejects shared/external networks and volumes, fixed container names, host networking, privileged/device access and Docker-socket mounts.

Review the checked-in API and tests before renderer changes. Terminal backend failures now perform owned cleanup before entering a retry-ready error state. Live links are gated by verified readiness and cleared on local health failure or tunnel death.

## Redesign, November 2026

- Design source: `design/canvas/` (17 artboards, including the full required-features inventory) with notes in `design/README.md`.
- The renderer was rebuilt to that design: navigation rail and bottom bar, per-step progress from real backend phases (`validating`, `preparing`, `building`, `starting`, `checking`, `connecting`, `ready`), session history, features inventory, offline guide, settings with history, command palette, context menus, notification centre, two-key confirmations, first-run setup, language modes and focus modes.
- New preload operations, each validated in the main process: `info`, `copyText`, `setTitle`, `openLink` (project and provider documentation only) and `save` (plain JSON, CSV, Markdown or text through a save dialog).
- Shared content lives in `content/`; `npm run content` regenerates `src/renderer/content.js`, `docs/content.js` and `ROADMAP.md`, and fails when a feature links to a missing article.
- Releases: `.github/workflows/release.yml` publishes the next `v0.2.N` tag with the Windows portable executable on every push to `main`, and writes `src/build-info.json` so the first screen shows the real version and build time. `checks.yml` runs the tests separately.
- Verified: 28 automated checks; headless renders of every interface state with a scripted backend (`docs/assets/screens/`). Not verified here: the packaged desktop runtime, live public tunnels and native Windows execution.

## Wave 2, November 2026

- New design boards: Tools, narrator and vocabulary and School mode, schedules and editor hand-off, the app icon, and live controls in the context menu.
- New: Tools screen (Base64 and table converter), live switches and choices in context menus and the command palette, narrator, personal vocabulary (stored apart from settings and never exported), School mode with a PIN, schedules, opening the project in VS Code or the default editor, and an original icon.
- New preload operations, validated in the main process: `editors` (detects VS Code without running it) and `openProject` (only the chosen project file or folder).
- Repository records: `.claude/skills/tunnel-app-deployer-operations/SKILL.md`, `CLOSEOUT_PROMPT.md`, `scripts/count-lines.mjs` and `scripts/screens/`.

## Wave 3 (installer, updates, authenticator, tabs)

- Squirrel.Windows installer: proven in v0.2.6 (Setup.exe, RELEASES, full .nupkg; code name Classic Har Gow). Unsigned.
- Automatic updates: built, checks every 4 hours after a 15 s start delay. Not yet proven updating a real installed copy; that needs an installed v0.2.6 to pick up a newer release.
- Authenticator: TOTP (SHA-1/256/512) with secrets sealed by Electron safeStorage. Tested against RFC 6238 vectors; the vault itself is mocked in screenshots.
- Utility tabs: Workspace plus catalogue tabs, persisted, Ctrl+T/Ctrl+W/Ctrl+Tab.
- Sessions chart: 14-day outcome chart (partly built; no streaming chart of a running session).
- Clipping matrix: `npm run clip` (Playwright with Chromium) checks 6 screens x 3 widths x 3 languages; first run found and fixed the Guide overflowing a 360 px phone. Not in CI yet.
- GitHub cancels a queued Release run when a newer push queues behind it, so a quick series of pushes tags only the newest commit; that release contains every earlier change.

## Final sweep (polish and accessibility)

- `DESIGN.md` is now the design system's source of truth: colour roles, one type scale as tokens (`--fs-*`), spacing, shape, states, motion, window and layout rules.
- `npm run audit:ui` audits 49 surfaces in 686 combinations (themes, languages, sizes). The first run found 12 accessibility rules failing, clipping in schedule rules, overlaps in bilingual settings and invisible focus in search boxes; all are fixed and the audit reports no problems.
- On Windows the window has no system frame: the renderer draws a 40 px title bar and Windows keeps its caption buttons in the overlay (`titleBarOverlay`). The overlay colours follow the theme through the validated `app:titlebar` IPC. This is not yet seen on a real Windows machine; check dragging, Snap layouts and the caption button colours on the next installed update.
- Fixed: text size above 100 percent cut off the bottom of the window (zoom multiplied `100vh`).
- Menus are a filter combobox driving a listbox of options; tabs are sibling tab and close buttons with arrow, Home, End and Delete keys; navigation uses `aria-current`; all icon glyph names are hidden from assistive technology.

## Base64 beside the original

- Tools › Base64 has a third card, **Files beside their originals**, with two drop targets: one writes `name.ext.base64.txt` next to each dropped or chosen file, the other turns such a text back into the original file next to it. The name comes from the text's name pattern, then a `data:` type, then the first bytes, with `.bin` last. A clash gets a number before the extension; nothing is overwritten and sources are never changed.
- The work happens in the main process (`src/base64-files.js`): files stream in 700 KB pieces with pause, resume and cancel, a free-space check comes first, and every written file is checked by SHA-256 before it is reported. A cancel or a refusal removes only the file that run created.
- The preload resolves paths from real `File` objects with `webUtils.getPathForFile`, so the page cannot ask for arbitrary paths; `main.js` validates every request again, and **Show in folder** only opens files this session wrote.
- `npm test` covers naming, every alphabet against the panel's own encoder, exact error offsets, overwrite refusal, extension restoration, cancel clean-up and pausing; deliberately breaking overwrite refusal or character checks turns those tests red. `npm run audit:ui` now audits 51 surfaces in 714 combinations, including the results list and the working state, with no findings.
- Not yet verified on a real Windows install: dragging from File Explorer, very large files on a slow disk, and **Show in folder**.

## Virtual disks

- Tools › Virtual disks follows the three boards (`VDisks`, `VDiskCreate`, `VDiskPack`): a library of attached disks and known disk files, a details pane read from the file header, action cards that explain themselves when they do not apply, a New virtual disk side sheet with presets and a live free-space check, and Quick pack beside the files.
- The engine is `src/vdisk/`: `format.js` reads VHD, VHDX and ISO headers in Node and validates requests; `engine.js` runs `vdisk.ps1` (VirtDisk API through P/Invoke plus the Storage module) once per change, elevated when Windows needs it; `ipc.js` hands the screen tokens instead of paths and names every new file beside its source without replacing anything. The screen is `src/renderer/vdisk-ui.js`, which uses helpers app.js shares as `window.App`.
- Quick pack sizes the VHDX from the files, grows the disk and its volume whenever the files do not fit (before a file or on a disk-full error), copies with timestamps, attributes and streams, and checks every file by SHA-256. A cancel or failure detaches and deletes the half-made VHDX.
- Proof: `tests/windows/vdisk.integration.js` runs every operation on real disks on a Windows runner, and `tests/windows/vdisk-ui.e2e.js` drives the real app (main process, preload, IPC, engine) through the screen there, answering only the native Save and Open dialogs; screenshots are kept as run artifacts. `tests/desktop/vdisk-ipc.test.js` covers tokens, naming and request shapes; `npm run audit:ui` covers five new surfaces in every theme, language and size.
- Not yet verified on a real installed copy: the administrator prompt itself (the runner is already elevated), dragging from File Explorer, Dev Drive (the runner is Windows Server) and VHD Sets (Windows refuses them without its Hyper-V parts). Not built: VHD Set checkpoints, native boot entries, mirroring and change tracking.

