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
