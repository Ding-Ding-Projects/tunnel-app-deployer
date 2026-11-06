# Personal vocabulary

Replace words in the interface with your own, from a small JSON file.

## The file

```
{"version": 1, "entries": {"Host": "Share", "Sessions": "History"}}
```

Each entry replaces a whole word or phrase in interface text, never inside your data, paths or links. The file is checked in full before anything changes: at most 256 KiB, nested at most 8 levels deep, words up to 160 characters and replacements up to 1,000. A file that fails any check is rejected with the reason, and nothing from it is applied.

## Loading it

Press **Upload JSON** in **Settings › Language and voice**, or drop the file anywhere on the app window. **Use personal vocabulary** turns the replacements off without removing them, and **Clear vocabulary** deletes the stored copy.

## Privacy

The vocabulary is stored on this computer only, in its own record. It is never included in settings exports, settings history, notifications or session exports.

Related: languages, settings, school-mode
