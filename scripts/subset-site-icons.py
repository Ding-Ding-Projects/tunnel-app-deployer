"""Builds docs/fonts/site-icons.woff2: Material Symbols Rounded cut down to the icons the website uses.

Usage: python3 scripts/subset-site-icons.py   (needs: pip install fonttools brotli)
Icon names are collected from docs/index.html and docs/app.js, so adding an icon there and rerunning is enough.
"""
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / "src/renderer/fonts/material-symbols-rounded.woff2"
text = (root / "docs/index.html").read_text() + (root / "docs/app.js").read_text()
names = set(re.findall(r'class="ms[^"]*">([a-z0-9_]+)<', text))
names |= set(re.findall(r"icon: ['\"]([a-z0-9_]+)['\"]", text))
names |= set(re.findall(r"'([a-z_]+_mode)'", text))
names |= {"close", "info", "search", "article", "settings", "arrow_forward", "tune", "light_mode", "dark_mode"}
names = sorted(names)
letters = "abcdefghijklmnopqrstuvwxyz0123456789_"
subprocess.run([
    "pyftsubset", str(source), f"--glyphs={','.join(names)}", f"--text={letters}",
    "--no-layout-closure", "--layout-features=liga,rlig,calt", "--flavor=woff2",
    f"--output-file={root / 'docs/fonts/site-icons.woff2'}",
], check=True)
print(f"{len(names)} icons: {' '.join(names)}")
