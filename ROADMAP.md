# Roadmap

Generated from `content/features.json` by `scripts/build-content.mjs`. `[x]` built, `[~]` partly built, `[ ]` not built yet, `[-]` does not apply.

## Language, voice and personalization

- [-] **Job document wording**: This app has no job-related workflows.
- [x] **Language modes**: English, Hong Kong Cantonese and bilingual modes, saved per computer, in the app and on the website.
- [~] **Playfulness sliders and dialog emoji**: Separate English and Cantonese playfulness sliders (1 to 5) change the voice of status, empty-state, toast and error copy. The dialog emoji switch is built. Not every string has five voices yet.
- [ ] **Personal vocabulary upload**: Not built yet.
- [ ] **Drop a vocabulary file onto the app**: Not built yet.
- [ ] **School mode**: Not built yet. Needs the shared cross-app settings record.
- [ ] **Spoken narrator**: Not built yet.
- [x] **Action sounds**: Short synthesized tones when hosting starts, goes live, stops or fails, with a Settings switch and volume. Visual feedback is complete without sound.
- [ ] **Scheduled settings**: Not built yet.
- [x] **Rename the app**: Change the name shown in the window title and header; one action restores the shipped name. Data folders and package ids never change.
- [x] **Focus modes**: Focus, Low stimulation, Time awareness, One thing at a time and Momentum, each its own switch, all off by default.
- [~] **Dim sum surprise**: A 1 in 10 chance at launch of a non-blocking dim sum note with English and Cantonese names. Pictures are not shown yet because the app makes no network requests from its interface.
- [ ] **Dim sum photo source**: Not built yet.

## Appearance and layout

- [x] **Material Design 3**: Material 3 colour roles, shapes, type scale, navigation rail and bottom bar, generated from one seed colour.
- [x] **Workflow navigation**: Five destinations in a navigation rail, a bottom bar in narrow windows, and the current step always visible on Host.
- [x] **Motion with a reduced-motion path**: Full, gentle or off, following the system reduced-motion setting. No state is carried by motion alone.
- [ ] **Live charts**: Not built yet.
- [ ] **Per-element appearance editor**: Not built yet. Global appearance settings exist.
- [~] **Colour picker**: Seed colour by hue wheel, swatches or hex, with the full scheme regenerated live. Colour-space translation is not built.
- [ ] **Logo customization**: Not built yet.
- [x] **Overlays and panels**: Notification centre, command palette and confirmations open as layered panels with focus return and Escape.
- [x] **Collapsible filters and statistics**: Session filters and statistics fold away and remember their state.
- [x] **Accessibility and sizing**: Text size from 90 to 150 percent, comfortable or compact density, visible focus, and layouts tested from 420 px wide.
- [x] **Truthful empty states**: No link, count or status is shown unless the backend reported it.

## Navigation, search and commands

- [x] **First-run setup**: Three steps: language and voice, a real Docker and tunnel check, then a short tour. Skippable, resumable, and reopenable from Settings.
- [ ] **Tabbed navigation**: Not built yet.
- [~] **Regex builder on every search**: Every search box has an adjacent regex builder with flags, live token explanation, match count, validation and a time limit. Full RegexBuddy parity is not built.
- [x] **Command palette**: Ctrl+Shift+F opens every destination, action and setting; picking one jumps to it and highlights it. Card or full-window size is remembered.
- [~] **Context menus**: Right-click or Shift+F10 opens a menu with a filter field for links, paths, sessions and text. Appearance and lock entries are not built.
- [x] **Shortcuts shown in menus**: Menus and the palette show each working shortcut.
- [~] **Rich controls**: Values such as the public link and local address carry copy and open controls. Not every value does yet.
- [~] **Guided forms**: The project form explains each field and validates the port as you type.
- [~] **Info buttons on controls**: Every setting has an info button with an explanation. Worked examples and playgrounds are not built.
- [x] **Settings that explain themselves**: Each setting states what it changes and where.
- [-] **Presets for blank editors**: The app has no free-form editors.

## Safety, locks and sign-in

- [x] **Two-key confirmation**: Stopping a live link, clearing history and resetting settings need two separate keys and a slider, with an emergency exit and Escape.
- [ ] **Element locks**: Not built yet.
- [ ] **Support ticket recovery**: Not built yet.
- [ ] **Unlock ladder**: Not built yet.
- [ ] **Built-in authenticator**: Not built yet.
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

- [ ] **File converter**: Not built yet.
- [ ] **Base64 tools**: Not built yet.
- [ ] **Minecraft server manager**: Not built yet.
- [ ] **Minecraft world generator**: Not built yet.
- [ ] **Ollama manager**: Not built yet.
- [ ] **Open in an external editor**: Not built yet.
- [-] **Browser download hand-off**: There is no browser extension.
- [ ] **Publishing to a forge**: Not built yet.
- [x] **Progress and recovery in place**: Progress shows on the step that is running and recovery actions appear on the step that failed.
- [ ] **Drawing and annotation**: Not built yet.
- [-] **Shared Roblox models**: Applies only to games.
- [-] **Roblox visual realism**: Applies only to games.

## Completeness and evidence

- [x] **Feature inventory**: This list, with the same honest status in the app and on the website.
- [x] **Version and build time on the first screen**: Shows the running version and its build time with seconds and time zone, read from the packaged build record, or says it is unavailable.
- [~] **Real screenshots**: Website screenshots are rendered from the real interface with a scripted backend; they are not captures of live hosting.
- [ ] **Screen recording**: Not built yet.
- [~] **Design reference parity**: The interface follows the checked-in design in design/canvas; a pixel comparison is not automated.
- [x] **Design files in the repository**: All design artboards and notes live in design/.
- [ ] **Clipping checks**: Not built yet.
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
- [ ] **Windows installer**: The app ships as a portable executable today.
- [ ] **Code signing**: Builds are unsigned.
- [ ] **Automatic updates**: Not built yet.
- [ ] **Original icon**: Not built yet.

## Release pipeline

- [x] **A release on every main build**: Every push to main builds the Windows portable executable and publishes the next tagged release with it.
- [x] **Workflow timing in release notes**: Release notes state how long the build took.
- [x] **Line counts in release notes**: Counted by the workflow, never typed by hand.
- [ ] **Dim sum photos in releases**: Not built yet.
- [ ] **Dim sum code names**: Not built yet.
- [x] **CI dependency bootstrap**: Workflows install pinned Node and dependencies with npm ci.
- [~] **Runner selection**: Uses GitHub-hosted Windows and Ubuntu runners.
- [-] **Encrypted builder**: For private repositories only.

## Repository records

- [~] **Tabbed README**: The README uses collapsible sections.
- [ ] **Human time estimate**: Not built yet.
- [~] **Sanitized instruction copy**: AGENTS.md carries the public-safe rules.
- [x] **Wording rules in AGENTS.md**: AGENTS.md states the public wording boundary.
- [ ] **Wording hash lock**: Not built yet.
- [x] **ROADMAP.md checklist**: ROADMAP.md is generated from this inventory.
- [~] **A Markdown file per feature**: content/articles holds one article per built area, shared by the app and website.
- [-] **API collections**: The app exposes no HTTP API.
- [~] **Wiki and website in sync**: The website and the in-app guide are generated from the same articles. There is no wiki.
- [x] **Handoff record**: HANDOFF.md is kept current.
- [ ] **Closeout prompt**: Not built yet.
- [ ] **Discussions as the record**: Not built yet.
- [ ] **Linked project board**: Not built yet.
- [ ] **Operational skill file**: Not built yet.
- [-] **README prompt banner**: Applies only to the instruction repository.
- [-] **Single-file instruction editions**: Applies only to the instruction repository.
- [-] **Project memory folders**: Applies only to the instruction repository.
