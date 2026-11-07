# Design system

This is the source of truth for how Tunnel App Deployer looks, moves and reads, on the desktop app and on the website. The design canvas in [`design/canvas/`](design/canvas/) shows it screen by screen. When the canvas and this file disagree, this file wins and the canvas is corrected.

## North star

A calm, trustworthy Windows tool that turns a local Docker app into a public link. It should feel like a well-made Material 3 app: quiet tonal surfaces, one accent, the tunnel diagram as the signature element, and motion that explains what changed. The copy can be playful, especially in Cantonese, but facts and warnings are never vague.

Three words: **calm, trustworthy, friendly**.

Not this: a generic SaaS dashboard, neon accents on black, glass panels, marketing gradients, or decoration with no job.

## Colour

- Every colour comes from one seed colour, generated in OKLCH (`scheme()` in `src/renderer/app.js`). The default seed is teal, hue 175. The website uses the same roles with fixed values.
- Roles follow Material 3: `--bg`, tonal surfaces `--s1` to `--s4` (low to high), `--on` and `--onv` for text, `--p`/`--onp` primary, `--pc`/`--onpc` primary container, `--sc`/`--onsc` secondary container, `--t` tertiary, `--err`/`--errc`, `--warn`/`--warnc`, `--ol`/`--olv` outlines, `--inv`/`--oninv` inverse.
- Strategy is restrained. The primary colour marks the main action on a screen, the current selection and the live state. Status colours are used only for status.
- Text on a filled colour always uses that colour's own "on" role. Secondary text inside a filled control inherits the control's text colour; it never uses `--onv`.
- Contrast: body text at least 4.5:1 and large text at least 3:1 in both schemes. Controls and focus rings at least 3:1 against what is next to them. `npm run audit:ui` checks every screen in both schemes.

## Type

Roboto Flex for text, Roboto Mono for addresses, paths, codes and timings. This follows the Material 3 type system on purpose; the bilingual fallbacks are Segoe UI, Microsoft JhengHei UI, PingFang HK and Noto Sans HK.

| Token | Size / line | Use |
| --- | --- | --- |
| `--fs-label-s` | 11 / 16 | Badges, key caps, chart ticks |
| `--fs-body-s` | 12 / 16 | Supporting text, hints, navigation labels |
| `--fs-body` | 14 / 20 | Body text, chips, buttons, menus |
| `--fs-body-l` | 16 / 24 | Fields, search, long reading, card titles |
| `--fs-title` | 22 / 28 | Section and card headings |
| `--fs-headline-s` | 24 / 32 | The public link |
| `--fs-headline` | 28 / 36 | Large numbers, page titles on narrow windows |
| `--fs-headline-l` | 32 / 40 | Page titles, authenticator codes |

Only these sizes are used. Hierarchy comes from size, weight (400, 500, 600) and colour together. Uppercase with wide letter spacing is reserved for short step labels.

## Space and shape

- Spacing sits on a 4 px rhythm: 4, 8, 12, 16, 20, 24, 32, 40, 48. Tight inside a group, generous between groups.
- Corners follow the Material 3 shape scale: 8 px chips and small controls, 12 px fields and menus, 16 to 20 px inner surfaces, 28 px cards and dialogs, full rounding for buttons, switches and pills.
- Buttons morph from fully round to 12 px corners while pressed.

## Elevation

Depth comes from tonal surfaces, not shadows. Only floating layers cast a shadow: menus, dialogs, the notification panel and toasts. A surface never has both a hairline border and a soft shadow.

## States

Every interactive element has default, hover, focus, pressed and disabled states, and where it applies, selected, loading and error states.

- Hover raises the surface one tone (`--s3` on `--s1`).
- Focus shows a 3 px `--p` ring with a 2 px offset. Fields and search boxes show the ring around the whole box.
- Pressed scales buttons to 97 percent and squares their corners.
- Disabled uses 38 percent content and a 12 percent container; it never relies on opacity alone for meaning.
- Targets are at least 24 by 24 px, and 40 px or more wherever space allows.

## Motion

- Material 3 emphasized easing, `cubic-bezier(.2, 0, 0, 1)`, with durations of 150, 250, 400 and 550 ms (`--t1` to `--t4`). The Motion setting can make them gentle or turn them off.
- Views and cards rise in, the live link pops in, failures shake once, the tunnel line flows only while a session is active.
- Only `transform` and `opacity` animate, apart from small controls whose size is part of the state (the segmented button check, the confirm slider).
- No bounce or elastic easing. Reduced motion, the Motion setting and Low stimulation remove every animation; a moving line becomes a solid line.

## Window

On Windows the app draws its own title bar: the window has no system frame, the system caption buttons sit in the top-right overlay, and the 40 px title bar shows the icon, name, version and dim sum code name. The title bar is a drag region; everything clickable in it opts out. Other systems keep their normal frame.

## Layout

- Navigation: an expanded rail (240 px, each name beside its icon, the selected pill spanning both, a labelled New host button) at 1100 px and wider unless the person collapses it; the compact rail (88 px, labels under the icons) from 860 px; bottom navigation below. The rail's width animates and its labels slide in.
- Settings rows put the control beside its label when there is room and below it on narrow windows.
- Nothing is cut off or pushed off screen at 390, 768, 960 by 540 (a 1080p screen at 200 percent) or 1440 px, in English, Cantonese or both. `npm run clip` and `npm run audit:ui` check this.

## Checks

```
npm run audit:ui    # every surface, both themes, three languages, four sizes: accessibility, focus, clipping, console
npm run clip        # clipping and off-screen text only
```

Both must report no problems before a release.
