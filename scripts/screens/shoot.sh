#!/bin/bash
# Renders the real renderer in headless Chrome with a scripted backend and saves screenshots.
# Usage: scripts/screens/shoot.sh <output-folder>
# Each shot is "name|query|width,height". The scripted backend never hosts anything: the images
# show the interface for each state, not a live hosting session.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$(cd "$here/../.." && pwd)"
out="${1:?output folder}"; mkdir -p "$out"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cp -r "$root/src/renderer" "$work/app"
cp "$here/scripted-backend.js" "$work/app/mock.js"; cp "$here/drive.js" "$work/app/after.js"
sed -i 's#<script defer src="i18n.js"></script>#<script src="mock.js"></script><script defer src="i18n.js"></script>#; s#<script defer src="app.js"></script>#<script defer src="app.js"></script><script defer src="after.js"></script>#' "$work/app/index.html"
chrome="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
dark='settings=%7B%22theme%22%3A%22dark%22%7D'
shots=(
  "host-live|state=live&$dark|1280,800" "host-building|state=building&$dark|1280,800" "host-failed|state=failed&$dark|1280,800"
  "sessions|state=ready&view=sessions&$dark|1280,800" "settings-rx|state=ready&view=settings&act=rx&$dark|1280,800"
  "confirm|state=live&act=confirm&$dark|1280,800" "tools-b64|state=ready&view=tools&act=b64&$dark|1280,800"
  "tools-convert|state=ready&view=tools&act=conv&$dark|1280,800" "context-controls|state=ready&view=settings&act=ctxset&$dark|1280,800"
  "schedules|state=ready&view=settings&act=sched&$dark|1280,800"
  "authenticator|state=ready&view=tools&act=auth&$dark|1280,800" "tabs|state=ready&act=tabs&$dark|1280,800" "sessions-chart|state=ready&view=sessions&act=chart&$dark|1280,800"
  "bilingual|state=building&settings=%7B%22theme%22%3A%22dark%22%2C%22language%22%3A%22both%22%2C%22momentum%22%3Atrue%2C%22time%22%3Atrue%2C%22oneThing%22%3Atrue%7D|1280,800"
)
for s in "${shots[@]}"; do
  IFS='|' read -r name query size <<< "$s"
  "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-prefers-reduced-motion --virtual-time-budget=7000 \
    --window-size="$size" --screenshot="$out/$name.png" "file://$work/app/index.html?$query" >/dev/null 2>&1
  echo "$out/$name.png"
done
