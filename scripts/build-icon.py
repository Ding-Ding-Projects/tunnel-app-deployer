"""Generates the app icon files from the master SVGs in build/.

Usage: python3 scripts/build-icon.py   (needs Google Chrome or Chromium and: pip install pillow)
build/icon.svg is the master; build/icon-small.svg is the simplified mark used at 32 px and below.
Outputs: build/icon.png (512), build/icon.ico (16 to 256), src/renderer/icon.png (256) and
docs/assets/icon.png (180) plus docs/assets/favicon.png (32).
"""
import shutil
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
chrome = next((c for c in ["google-chrome", "chromium", "chromium-browser", "chrome"] if shutil.which(c)), None)
if not chrome:
    raise SystemExit("Chrome or Chromium is required to rasterize the SVG.")

def render(svg: Path, size: int) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "icon.html"
        page.write_text(f'<html><body style="margin:0;background:transparent"><img src="{svg.as_uri()}" width="{size}" height="{size}"></body></html>')
        out = Path(tmp) / "icon.png"
        subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
                        f"--window-size={size},{size}", f"--screenshot={out}", page.as_uri()], check=True, capture_output=True)
        return Image.open(out).convert("RGBA").crop((0, 0, size, size))

big = render(root / "build/icon.svg", 1024)
small = render(root / "build/icon-small.svg", 256)
big.resize((512, 512), Image.LANCZOS).save(root / "build/icon.png")
big.resize((256, 256), Image.LANCZOS).save(root / "src/renderer/icon.png")
big.resize((180, 180), Image.LANCZOS).save(root / "docs/assets/icon.png")
small.resize((32, 32), Image.LANCZOS).save(root / "docs/assets/favicon.png")
frames = {s: (big if s > 32 else small).resize((s, s), Image.LANCZOS) for s in (16, 24, 32, 48, 64, 128, 256)}
frames[256].save(root / "build/icon.ico", sizes=[(s, s) for s in frames], append_images=[frames[s] for s in (16, 24, 32, 48, 64, 128)])
print("icons written")
