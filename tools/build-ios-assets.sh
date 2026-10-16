#!/usr/bin/env bash
# Rebuilds the game bundle used by the iOS app (www/game.js) and regenerates the Xcode project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -d node_modules ] || npm install --no-audit --no-fund
npm run -s build
python3 tools/gen_xcodeproj.py
echo "Open ios/PocketCraft.xcodeproj in Xcode, pick your Team under Signing & Capabilities and press Run."
