# Accessibility

Keyboard first, readable at any size, and announced to screen readers.

## Keyboard

Every control can be reached with **Tab**, has a visible focus ring, and works with **Enter** or **Space**. The command palette (**Ctrl+Shift+F**) reaches every screen, action and setting. **Shift+F10** opens the context menu of the focused item.

- In menus and the palette, type to filter, use the **arrow keys** to move and **Enter** to run. Left and right change a choice in place.
- In the tab bar, the **arrow keys**, **Home** and **End** move between tabs and **Delete** closes one.
- Dialogs keep the keyboard inside until they close, then return you to where you were.

## Size and density

- **Text size** scales the whole interface from 90 to 150 percent.
- **Density** switches between comfortable and compact spacing.
- Layouts work from 390 pixels wide up, including a 1080p screen at 200 percent scale. Nothing is cut off, settings stack their controls under the label on narrow windows, and long addresses wrap only after dots, dashes and slashes.
- At every text size the whole window stays reachable.

## Screen readers

Progress messages, copied links and notifications are announced through a polite live region. Icon glyphs are hidden, so buttons are read by their words, and icon-only buttons have names. The bell says how many notifications are unread. Menus are read as lists with the highlighted item, and the Sessions chart has the same numbers as a table. Errors use an alert role.

## Contrast and motion

Colours are generated to keep text at a contrast ratio of at least 4.5 to 1 in both themes, including Cantonese text inside buttons. Motion follows your system's reduced-motion setting, and moving lines become solid lines.

## How it is checked

Every screen and dialog is checked automatically before release: an accessibility audit against WCAG 2.2 AA, a keyboard walk, and a search for cut-off or overlapping text, in both themes, all three language modes and four window sizes (`npm run audit:ui`). Automated checks catch a lot, not everything; please report anything that gets in your way.

Related: focus-modes, motion-and-sound, getting-around
