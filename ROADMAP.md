# Roadmap

Generated from `content/features.json` by `scripts/build-content.mjs`. `[x]` built, `[~]` partly built, `[ ]` not built yet, `[-]` does not apply.

## Language, voice and personalization

- [-] **Job document wording**: This app has no job-related workflows.
- [x] **Language modes**: English, Hong Kong Cantonese and bilingual modes, saved per computer, in the app and on the website.
- [~] **Playfulness sliders and dialog emoji**: Separate English and Cantonese playfulness sliders (1 to 5) change the voice of status, empty-state, toast and error copy. The dialog emoji switch is built. Not every string has five voices yet.
- [x] **Personal vocabulary upload**: Upload or drop a versioned JSON file; it is validated in full (256 KiB, depth 8, 160 and 1,000 character limits) before anything applies, and it is never exported or added to settings history.
- [x] **Drop a vocabulary file onto the app**: Drop a vocabulary JSON file anywhere on the window to validate and apply it.
- [~] **School mode**: English only, plain wording, no emoji, vocabulary or dim sum, with those settings left out, and a PIN to turn it off. It is not yet shared across apps.
- [~] **Spoken narrator**: Off by default; reads progress, results and notifications with separate English and Cantonese voice pickers, the voice in use shown, and speed and pitch. It does not yet detect a running screen reader.
- [x] **Action sounds**: Short synthesized tones when hosting starts, goes live, stops or fails, with a Settings switch and volume. Visual feedback is complete without sound.
- [~] **Scheduled settings**: Time-of-day schedules for theme, motion, sounds and focus using local time, with precedence and history entries. Date ranges and outside sources are not built.
- [x] **Rename the app**: Change the name shown in the window title and header; one action restores the shipped name. Data folders and package ids never change.
- [x] **Focus modes**: Focus, Low stimulation, Time awareness, One thing at a time and Momentum, each its own switch, all off by default.
- [~] **Dim sum surprise**: A 1 in 10 chance at launch of a non-blocking dim sum note with English and Cantonese names. Pictures are not shown yet because the app makes no network requests from its interface.
- [ ] **Dim sum photo source**: Not built yet.

## Appearance and layout

- [x] **Material Design 3**: Material 3 colour roles, shapes and one type scale, navigation rail and bottom bar, generated from one seed colour; on Windows the app draws its own title bar beside the system caption buttons.
- [x] **Workflow navigation**: Five destinations in a navigation rail, a bottom bar in narrow windows, and the current step always visible on Host.
- [x] **Motion with a reduced-motion path**: Full, gentle or off, following the system reduced-motion setting. No state is carried by motion alone.
- [~] **Live charts**: Sessions shows a 14-day chart of outcomes that redraws as sessions finish, with a screen-reader table. Not a streaming chart of a running session.
- [ ] **Per-element appearance editor**: Not built yet. Global appearance settings exist.
- [~] **Colour picker**: Seed colour by hue wheel, swatches or hex, with the full scheme regenerated live. Colour-space translation is not built.
- [ ] **Logo customization**: Not built yet.
- [x] **Overlays and panels**: Notification centre, command palette and confirmations open as layered panels with focus return and Escape.
- [x] **Collapsible filters and statistics**: Session filters and statistics fold away and remember their state.
- [x] **Accessibility and sizing**: Text size from 90 to 150 percent with the whole window always reachable, comfortable or compact density, visible focus everywhere, and every screen audited automatically (WCAG 2.2 AA, keyboard walk, clipping) at four window sizes, both themes and all language modes.
- [x] **Truthful empty states**: No link, count or status is shown unless the backend reported it.

## Navigation, search and commands

- [x] **First-run setup**: Three steps: language and voice, a real Docker and tunnel check, then a short tour. Skippable, resumable, and reopenable from Settings.
- [x] **Tabbed navigation**: A Workspace tab plus utility tabs opened from a searchable New tab catalogue, with Ctrl+T, Ctrl+W and Ctrl+Tab. Tabs persist.
- [~] **Regex builder on every search**: Every search box has an adjacent regex builder with flags, live token explanation, match count, validation and a time limit. Full RegexBuddy parity is not built.
- [x] **Command palette**: Ctrl+Shift+F opens every destination, action and setting; picking one jumps to it and highlights it. Card or full-window size is remembered.
- [ ] **Extension support**: Not built yet. Planned: extensions tailored to sharing apps, each with a versioned manifest, an out-of-process protocol and declared permissions you allow before it runs, with a searchable manager, useful built-in extensions and an author guide.
- [~] **Context menus**: Right-click or Shift+F10 opens a filterable menu; settings show live switches and choices beside their labels that work without closing the menu. Appearance and lock entries are not built.
- [x] **Shortcuts shown in menus**: Menus and the palette show each working shortcut.
- [~] **Rich controls**: Links and addresses carry copy and open controls, and settings in menus and the command palette show live switches. Not every value does yet.
- [~] **Guided forms**: The project form explains each field and validates the port as you type.
- [~] **Info buttons on controls**: Every setting has an info button with an explanation. Worked examples and playgrounds are not built.
- [x] **Settings that explain themselves**: Each setting states what it changes and where.
- [-] **Presets for blank editors**: The app has no free-form editors.

## Safety, locks and sign-in

- [x] **Two-key confirmation**: Stopping a live link, clearing history and resetting settings need two separate keys and a slider, with an emergency exit and Escape.
- [ ] **Element locks**: Not built yet.
- [ ] **Support ticket recovery**: Not built yet.
- [ ] **Unlock ladder**: Not built yet.
- [x] **Built-in authenticator**: TOTP codes with SHA-1, SHA-256 and SHA-512, secrets sealed in the system vault, search, guarded export. Codes match the RFC 6238 vectors in tests.
- [ ] **QR pairing**: Not built yet.
- [x] **Free, no nagging**: The app is free, has no paid tier, ads or upgrade prompts.

## Records, history and messages

- [~] **Local version history**: Every hosting attempt and every settings change is kept locally; a settings revision can be restored as a new revision. Encrypted snapshots are not built.
- [~] **Export everything**: Sessions as JSON, CSV or Markdown; settings, settings history and notifications as JSON. Archives are not built.
- [~] **Bulk actions**: Select many sessions or notifications to export or remove them.
- [~] **Changelog viewer**: Every release with date, changes and commit, with date-range filter and regex search. Exporting the filtered view is not built.
- [x] **Offline guide**: Every article on the website ships inside the app and opens without a network.
- [-] **Rendered provider text**: The app shows no provider-authored rich text.
- [x] **Notifications and their centre**: Non-blocking toasts, a searchable notification centre with bulk clear, and errors that stay until dismissed.

## Built-in tools and hand-off

- [~] **File converter**: Converts JSON lists, CSV and TSV to CSV, TSV, Markdown or JSON and states any loss before you save. Other formats are not built.
- [~] **Base64 tools**: Text and file encoding, standard, URL-safe and MIME alphabets, padding, three text encodings, strict decoding with exact positions, data: URLs, SHA-256 round-trip checks and session history. Streaming, pause and ZIP export are not built.
- [ ] **Minecraft server manager**: Not built yet.
- [ ] **Minecraft world generator**: Not built yet.
- [ ] **Ollama manager**: Not built yet.
- [~] **Open in an external editor**: Detects VS Code (per-user, machine, Insiders, PATH) without running it and opens the project folder; also opens the file in the default editor or shows it in the file manager. Choosing another editor is not built.
- [-] **Browser download hand-off**: There is no browser extension.
- [ ] **Publishing to a forge**: Not built yet.
- [x] **Progress and recovery in place**: Progress shows on the step that is running and recovery actions appear on the step that failed.
- [ ] **Drawing and annotation**: Not built yet.
- [-] **Shared Roblox models**: Applies only to games.
- [-] **Roblox visual realism**: Applies only to games.

## Completeness and evidence

- [x] **Feature inventory**: This list, with the same honest status in the app and on the website.
- [x] **Version and build time on the first screen**: Shows the running version and its build time with seconds and time zone, read from the packaged build record, or says it is unavailable.
- [~] **Real screenshots**: Website and README screenshots are rendered from the real interface by scripts/screens/shoot.sh with a scripted backend; they are not captures of live hosting.
- [ ] **Screen recording**: Not built yet.
- [~] **Design reference parity**: The interface follows the checked-in design in design/canvas; a pixel comparison is not automated.
- [x] **Design files in the repository**: All design artboards and notes live in design/.
- [~] **Clipping checks**: npm run clip opens all six screens at 360, 768 and 1280 pixels in English, Cantonese and both, and reports cut-off or off-screen text. It needs Playwright with Chromium and is not run in CI yet.
- [~] **Public screenshot gallery**: The website has a gallery of interface renders. They are rendered with a scripted backend, not captured from live hosting.

## Website and shared links

- [~] **Material website**: The website carries the feature list, articles, language modes, themes, motion settings, search with regex and the command palette. Not every app feature has a website equivalent.
- [x] **Phone-friendly website**: Every website section works from 320 px wide.
- [x] **Download button**: Points at the latest published release and shows its version and date when the release exists.
- [~] **An article per feature**: Every built or partly built feature links to an article. Planned features do not have articles yet.
- [x] **Bundled fonts**: Roboto Flex, Roboto Mono and Material Symbols are copied from npm by scripts/vendor-assets.mjs into the app and the website.
- [x] **Link preview image**: The website has Open Graph tags and a preview image.
- [x] **Website linked from the repository**: The repository About field links to the website, and the README links to it at the top.
- [-] **Private wording boundary**: The app and website are public and have no signed-in surfaces.
- [-] **Packaged website for private repositories**: This repository is public.

## Status reporting

- [ ] **Status hub**: Not built yet.
- [-] **Discord status bridge**: Part of the status hub app, not this one.
- [-] **Panic webhooks**: Part of the status hub app, not this one.
- [-] **Tidbyt displays**: Part of the status hub app, not this one.

## Build and install

- [x] **build.bat and build-installer.bat**: Both exist at the repository root.
- [~] **One build-and-run command**: build.bat builds; it does not launch the result yet.
- [~] **One-click dependency fetcher**: The tunnel helper downloads and is hash-verified automatically. Docker must still be installed by you.
- [~] **Bundled dependencies**: Fonts and icons are bundled; Docker is not.
- [x] **Windows installer**: Squirrel.Windows Setup.exe, RELEASES and full package are published with every release from main, first in v0.2.6. Unsigned.
- [ ] **Code signing**: Builds are unsigned.
- [~] **Automatic updates**: Installed copies check the release feed every four hours and offer an unsigned restart banner. Not yet proven on an installed copy updating to a newer release.
- [x] **Original icon**: An original icon generated by scripts/build-icon.py from build/icon.svg into PNG and a multi-size .ico used by the window and the packaged executable.

## Release pipeline

- [x] **A release on every main build**: Every push to main builds the Windows portable executable and publishes the next tagged release with it.
- [x] **Workflow timing in release notes**: Release notes state how long the build took.
- [x] **Line counts in release notes**: Release notes list hand-written line counts from scripts/count-lines.mjs, run by the workflow.
- [ ] **Dim sum photos in releases**: Not built yet.
- [x] **Dim sum code names**: Each release takes the next unused dish with a published photo from the public catalogue, recorded in its notes and shown in About.
- [x] **CI dependency bootstrap**: Workflows install pinned Node and dependencies with npm ci.
- [~] **Runner selection**: Uses GitHub-hosted Windows and Ubuntu runners.
- [-] **Encrypted builder**: For private repositories only.

## Repository records

- [~] **Tabbed README**: The README uses collapsible sections.
- [x] **Human time estimate**: The README shows an estimate range with its method, the counted lines from scripts/count-lines.mjs, the assumed rate and the arithmetic.
- [~] **Sanitized instruction copy**: AGENTS.md carries the public-safe rules.
- [x] **Wording rules in AGENTS.md**: AGENTS.md states the public wording boundary.
- [ ] **Wording hash lock**: Not built yet.
- [x] **ROADMAP.md checklist**: ROADMAP.md is generated from this inventory.
- [~] **A Markdown file per feature**: content/articles holds one article per built area, shared by the app and website.
- [-] **API collections**: The app exposes no HTTP API.
- [~] **Wiki and website in sync**: The website and the in-app guide are generated from the same articles. There is no wiki.
- [x] **Handoff record**: HANDOFF.md is kept current.
- [x] **Closeout prompt**: CLOSEOUT_PROMPT.md holds a copy-ready prompt for the next session.
- [ ] **Discussions as the record**: Not built yet.
- [ ] **Linked project board**: Not built yet.
- [~] **Operational skill file**: .claude/skills/tunnel-app-deployer-operations/SKILL.md records build, generation, screenshot, release and recovery routes. It has not been put through a skill evaluation.
- [-] **README prompt banner**: Applies only to the instruction repository.
- [-] **Single-file instruction editions**: Applies only to the instruction repository.
- [-] **Project memory folders**: Applies only to the instruction repository.
