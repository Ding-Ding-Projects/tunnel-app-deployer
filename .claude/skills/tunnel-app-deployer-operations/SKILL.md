---
name: tunnel-app-deployer-operations
description: Build, test, screenshot, release and recover Tunnel App Deployer. Use when changing, verifying or releasing this repository, regenerating its content, icons or screenshots, or diagnosing a failed release.
---

# Tunnel App Deployer operations

Run every command from the repository root with Node.js 24.

## Build and run

1. `npm ci`
2. `npm test` runs every automated check (desktop and backend).
3. `npm start` launches the desktop app. `build.bat` or `npm run package:win` builds `dist/Tunnel-App-Deployer-<version>-x64.exe` on Windows.

## Generated files

Edit sources, then regenerate; never edit generated files by hand.

| Source | Command | Generates |
| --- | --- | --- |
| `content/features.json`, `content/articles/*.md`, `content/changelog.json` | `npm run content` | `src/renderer/content.js`, `docs/content.js`, `ROADMAP.md`, `docs/regex.js`, `docs/markdown.js` |
| npm font packages | `npm run vendor` | `src/renderer/fonts/`, `docs/fonts/` |
| `docs/index.html`, `docs/app.js` icon names | `python3 scripts/subset-site-icons.py` | `docs/fonts/site-icons.woff2` |
| `build/icon.svg`, `build/icon-small.svg` | `python3 scripts/build-icon.py` | `build/icon.png`, `build/icon.ico`, `src/renderer/icon.png`, `docs/assets/icon.png`, `docs/assets/favicon.png` |

`npm run content:check` and the content test fail when generated content is stale or a feature links to a missing article.

## Screenshots

`scripts/screens/shoot.sh docs/assets/screens` renders the real renderer in headless Chrome with `scripts/screens/scripted-backend.js` standing in for the backend, and `scripts/screens/drive.js` performing the clicks for each state. The images show interface states only; never describe them as live hosting.

`npm run audit:ui` runs `scripts/screens/ui-audit.js`: every app surface (the scripted backend drives each state, dialog and menu) and every website page, in dark and light, English, Cantonese and both, at 390, 768, 960 by 540 and 1440 pixels. It reports console errors, axe-core accessibility violations (WCAG 2.2 AA and best practices), clipped, off-screen or overlapping text, and keyboard focus problems. `--quick`, `--only name,name`, `--shots <folder>` and `--json <file>` narrow or record a run. It exits 1 on any finding; run it before every release. [DESIGN.md](../../../DESIGN.md) is the design system it checks against.

`npm run clip` runs `scripts/screens/clip-matrix.js`: every screen at 360, 768 and 1280 pixels in English, Cantonese and both languages, reporting text that is cut off or pushed past the window edge. It exits 1 on any finding. Run it after layout or wording changes.

## Release

Every push to `main` runs `.github/workflows/release.yml`: it picks the next `v<major>.<minor>.<n>` tag, stamps `package.json` and `src/build-info.json`, builds the Windows portable executable and publishes the release with timing and line counts. `checks.yml` runs the tests separately. Confirm with `gh api repos/Ding-Ding-Projects/tunnel-app-deployer/releases/latest`.

## Recovery

- Release run failed: read the failing step with `gh api repos/Ding-Ding-Projects/tunnel-app-deployer/actions/runs/<id>/jobs`, fix, push again. A failed run publishes nothing, so the next run reuses the same version.
- Stale content: run `npm run content` and commit the result.
- A failed hosting session cleans up its own containers and tunnel; Docker volumes are kept.

## Public wording

Everything in this repository is public. Use ordinary professional English in code, commits, documentation, releases and the website.
