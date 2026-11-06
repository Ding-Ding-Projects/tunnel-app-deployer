# Search and the regex builder

Every search box in the app and on the website has a regex builder right beside it.

## Plain search

Type to filter. Plain search ignores case and matches any part of the text.

## Regex search

Press **.\*** beside a search box. The builder opens under it with:

- **Live explanation**: each part of the pattern is listed with what it means, for example `^` as start of text or `(a|b)` as a group with two choices.
- **Flags**: `i` ignore case, `m` multiline, `s` dot matches newline, `u` Unicode.
- **Match count** for the current screen.
- **Validation**: an invalid pattern says why and matches nothing.

Each search keeps its own pattern and flags, so the Sessions search never changes the Settings search.

## Safety limits

Patterns are limited to 300 characters and each searched text to 20,000 characters. Patterns that repeat a repeated group, such as `(a+)+`, are blocked because they can freeze a search.

## What is not built yet

The builder is not a full RegexBuddy equivalent. Debugging, a library of saved patterns and engine comparisons are planned.

Related: command-palette, sessions, settings
