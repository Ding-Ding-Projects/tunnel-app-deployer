# Sessions and history

Every hosting attempt is saved on this computer so you can look back, search and export.

## What a session records

The file you hosted, the format, the service and port, every step with its time, the outcome (shared, failed, cancelled) and the public address it had. Nothing is uploaded.

## Search and filters

- The search box matches names, paths, addresses and outcomes. Turn on the **.\*** regex builder for patterns.
- The outcome chips filter the list, and **Statistics** folds open to show totals, time shared and how many attempts reached live.
- The filters and the statistics panel remember whether they were open.

## Bulk actions

Tick sessions (or **Select all**) to **Export selected** or **Remove…**. Removing uses the two-key confirmation.

## Export formats

- **JSON**: every field, re-importable, UTF-8 with schema version 1.
- **CSV**: one row per session, UTF-8, CRLF line endings for spreadsheets. Step timings are left out; the file says so in its header row.
- **Markdown**: a readable table.

## Settings history

Every settings change is saved as a revision in **Settings › Data and history**. **Restore** brings back an older revision as a new one, so history is never rewritten.

Related: safety, search-and-regex, settings
