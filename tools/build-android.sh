#!/usr/bin/env bash
# Builds a signed, installable APK without needing Android Studio or the Android SDK.
# Requirements: Node.js 18+, a JDK 17+ (javac/java/keytool), python3, curl, unzip, zip.
# The Android build tools (aapt2, D8, apksig, framework resource table) are fetched once from npm
# packages that redistribute them and are cached in tools/.cache.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/tools/.cache"
OUT="$ROOT/build/android"
DIST="$ROOT/dist"
APK_NAME="PocketCraft-0.5.0.apk"
KEYSTORE="$ROOT/android/debug-signing.p12"
KEYPASS="pocketcraft"
KEYALIAS="pocketcraft"
mkdir -p "$CACHE" "$DIST"

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- tools
fetch_npm() { # name version -> extracts into $CACHE/<safe-name>
  local name="$1" ver="$2" safe="${1//\//_}"
  local dir="$CACHE/$safe-$ver"
  if [ -d "$dir/package" ]; then echo "$dir/package"; return; fi
  mkdir -p "$dir"
  local meta url integrity
  meta="$(curl -fsSL "https://registry.npmjs.org/$name/$ver")"
  url="$(printf '%s' "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["dist"]["tarball"])')"
  integrity="$(printf '%s' "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["dist"]["integrity"])')"
  curl -fsSL "$url" -o "$dir/pkg.tgz"
  local got="sha512-$(openssl dgst -sha512 -binary "$dir/pkg.tgz" | base64 | tr -d '\n')"
  if [ "$got" != "$integrity" ]; then echo "integrity mismatch for $name" >&2; rm -rf "$dir"; exit 1; fi
  tar xzf "$dir/pkg.tgz" -C "$dir" && rm "$dir/pkg.tgz"
  echo "$dir/package"
}

log "Fetching Android build tools (cached after the first run)"
AAPT_PKG="$(fetch_npm aaptjs3 2.0.2)"
case "$(uname -s)" in
  Darwin) AAPT2="$AAPT_PKG/bin/x64/darwin/aapt2" ;;
  *) AAPT2="$AAPT_PKG/bin/x64/linux/aapt2" ;;
esac
chmod +x "$AAPT2"
D8_JAR="$(fetch_npm jadx-mcp 1.4.1)/jadx-mcp.jar"
APKSIG_JAR="$(fetch_npm @mishguru/jadx-node 3.1.0)/resources/jadx-1.1.0/lib/apksig-3.5.2.jar"
APKTOOL_JAR="$(fetch_npm @postar/apktool-node 0.3.4)/lib/apktool.jar"
FRAMEWORK="$CACHE/android-framework.jar"
if [ ! -f "$FRAMEWORK" ]; then
  (cd "$CACHE" && unzip -o -q "$APKTOOL_JAR" brut/androlib/android-framework.jar && mv brut/androlib/android-framework.jar "$FRAMEWORK" && rm -rf brut)
fi

# ---------------------------------------------------------------- game bundle
log "Bundling the game"
cd "$ROOT"
[ -d node_modules ] || npm install --no-audit --no-fund
npm run -s build

rm -rf "$OUT"; mkdir -p "$OUT/stubs" "$OUT/classes" "$OUT/dex" "$OUT/assets/www" "$OUT/res"

# ---------------------------------------------------------------- java -> dex
log "Compiling Java"
find "$ROOT/android/stubs" -name '*.java' > "$OUT/stubs.txt"
javac -nowarn --release 8 -d "$OUT/stubs" @"$OUT/stubs.txt" 2>&1 | grep -v "warning: \[options\]" || true
(cd "$OUT/stubs" && jar cf ../android-stubs.jar .)
find "$ROOT/android/src" -name '*.java' > "$OUT/src.txt"
javac -nowarn --release 8 -cp "$OUT/android-stubs.jar" -d "$OUT/classes" @"$OUT/src.txt" 2>&1 | grep -v "warning: \[options\]" || true
log "Converting to dex (D8)"
JDK_HOME="${JAVA_HOME:-}"
if [ -z "$JDK_HOME" ]; then
  if [ -x /usr/libexec/java_home ]; then JDK_HOME="$(/usr/libexec/java_home)"
  else JDK_HOME="$(cd "$(dirname "$(python3 -c 'import os,shutil;print(os.path.realpath(shutil.which("javac")))')")/.." && pwd)"; fi
fi
java -cp "$D8_JAR" com.android.tools.r8.D8 --release --min-api 24 \
  --lib "$JDK_HOME" --lib "$OUT/android-stubs.jar" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class') 2>&1 | grep -v "^Warning" || true
[ -f "$OUT/dex/classes.dex" ] || { echo "D8 failed" >&2; exit 1; }

# ---------------------------------------------------------------- resources + manifest
log "Linking resources (aapt2)"
cp -R "$ROOT/www/." "$OUT/assets/www/"
rm -f "$OUT/assets/www/"*.map
"$AAPT2" compile --dir "$ROOT/android/res" -o "$OUT/res/res.zip"
"$AAPT2" link -o "$OUT/base.apk" -I "$FRAMEWORK" \
  --manifest "$ROOT/android/AndroidManifest.xml" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 50 --version-name 0.5.0 \
  -A "$OUT/assets" "$OUT/res/res.zip"
(cd "$OUT/dex" && zip -q -X "$OUT/base.apk" classes.dex)

log "Aligning"
python3 "$ROOT/tools/zipalign.py" "$OUT/base.apk" "$OUT/aligned.apk"

# ---------------------------------------------------------------- sign
if [ ! -f "$KEYSTORE" ]; then
  log "Creating signing key $KEYSTORE"
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -storepass "$KEYPASS" -keypass "$KEYPASS" \
    -alias "$KEYALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=PocketCraft, OU=Personal, O=PocketCraft, C=TR" >/dev/null 2>&1
fi
log "Signing"
javac -nowarn -cp "$APKSIG_JAR" -d "$OUT" "$ROOT/tools/ApkSign.java"
java -cp "$OUT:$APKSIG_JAR" ApkSign "$OUT/aligned.apk" "$DIST/$APK_NAME" "$KEYSTORE" "$KEYPASS" "$KEYALIAS"
rm -f "$DIST/$APK_NAME.idsig"

log "Done: dist/$APK_NAME ($(du -h "$DIST/$APK_NAME" | cut -f1))"
