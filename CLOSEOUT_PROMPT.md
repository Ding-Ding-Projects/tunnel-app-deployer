# Closeout prompt

Copy the block below into the next session to continue this repository's work.

```
Continue work on Ding-Ding-Projects/tunnel-app-deployer.

State at handoff (2026-11-06):
- Desktop app and website redesigned to design/canvas (21 artboards) and released automatically on every push to main (first release v0.2.0).
- Required-features inventory: content/features.json (115 items). Built and partly built items each link to an article in content/articles. Not-built items are listed in ROADMAP.md.
- Verification: npm test (33 checks) passes; interface states are rendered by scripts/screens/shoot.sh with a scripted backend. The packaged desktop runtime, live public tunnels and native Windows execution are not verified.

Next steps, in order:
1. Read .claude/skills/tunnel-app-deployer-operations/SKILL.md, HANDOFF.md and ROADMAP.md.
2. Pick the next not-built items from ROADMAP.md, design them on the canvas first, then build them, keeping the inventory honest.
3. After each change: npm run content, npm test, scripts/screens/shoot.sh, then commit and push to main and confirm the release.
```
