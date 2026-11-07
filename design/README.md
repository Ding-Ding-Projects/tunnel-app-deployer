# Design workspace

Read [the designer handoff](../HANDOFF.md) first. [DESIGN.md](../DESIGN.md) is the design system's source of truth; this folder holds the screen-by-screen design canvas for the desktop app and the website.

## Redesign, November 2026

`canvas/` is a complete copy of the design canvas: `canvas.json` (the board index and layout) and one `.dc.html` artboard per screen. Each artboard is a standalone HTML file and opens in any browser.

| Artboard | What it shows |
| --- | --- |
| `Main.dc.html` | Host screen before a project is chosen; requirement chips |
| `Building.dc.html` | Hosting in progress: locked project card, stage list with timings, flowing tunnel line |
| `Live.dc.html` | Verified public link with Copy and Open, session stats, hold-to-stop control |
| `Failed.dc.html` | Failure with a plain-language cause, one-click recovery actions and recent output |
| `Sessions.dc.html` | Local history of hosting attempts with search, filters and export |
| `Settings.dc.html` | Grouped settings with search and the adjacent regex builder |
| `Features.dc.html` | Required-features inventory with delivered, partial and planned states |
| `Palette.dc.html` | Command palette (Ctrl+Shift+F) |
| `Onboarding.dc.html` | First-run tour |
| `Narrow.dc.html` | 420 px window with bottom navigation |
| `Site.dc.html` | Website: hero, how it works, feature inventory, limits, download |
| `Sweep.dc.html` | Final review of every screen: findings by severity with their root-cause fixes, and the polish direction |

### Design language

- Material 3, dark first with a matching light scheme. Seed colour teal (`#82d5c0` primary on dark, `#006b58` on light).
- Type: Roboto Flex for text, Roboto Mono for addresses, paths and timings. Icons: Material Symbols Rounded, one weight throughout.
- Navigation rail with six destinations (Host, Sessions, Tools, Features, Guide, Settings); a bottom navigation bar below 860 px. On Windows a 40 px app-drawn title bar sits above both.
- The tunnel diagram (this computer, Quick Tunnel, public) is the signature element. Its line animates only while a session is active.
- Motion: Material emphasized easing `cubic-bezier(.2,0,0,1)`, 200 to 500 ms. Cards rise in, the live link pops in, failures shake once. Every animation is removed under reduced motion.
- Placeholders in square brackets (`[VERSION]`, `[N] of [TOTAL]`) are filled from real data in the implementation; the design never states a number it cannot know.

### Review notes

- Guidance followed: restraint (real words only where the story is), one icon family, real fonts, no invented logo (the website uses a plain text wordmark), status colour used only for status.
- Guidance written for animated marketing demos (cursor choreography, contact-sheet filming) does not apply to app screens and was not used. The website hero uses a cropped product shot that runs off the right edge rather than a boxed screenshot.
- The design is not a claim that any behaviour is implemented. Implementation status lives in the app's Features screen and in `ROADMAP.md`.
