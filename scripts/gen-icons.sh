#!/bin/bash
# Regenerates all icon sizes from client/src/icon/launch.png
# and rebuilds build/icon.icns.
# Usage: bash scripts/gen-icons.sh

set -e

SRC="client/src/icon/launch.png"
ICONSET="build/icon.iconset"

if [ ! -f "$SRC" ]; then
  echo "ERROR: $SRC not found."
  exit 1
fi

mkdir -p "$ICONSET"

echo "Generating icon sizes from $SRC…"

sips -z 16   16   "$SRC" --out "$ICONSET/icon_16x16.png"       -s format png
sips -z 32   32   "$SRC" --out "$ICONSET/icon_16x16@2x.png"    -s format png
sips -z 32   32   "$SRC" --out "$ICONSET/icon_32x32.png"       -s format png
sips -z 64   64   "$SRC" --out "$ICONSET/icon_32x32@2x.png"    -s format png
sips -z 64   64   "$SRC" --out "$ICONSET/icon_64x64.png"       -s format png
sips -z 128  128  "$SRC" --out "$ICONSET/icon_64x64@2x.png"    -s format png
sips -z 128  128  "$SRC" --out "$ICONSET/icon_128x128.png"     -s format png
sips -z 256  256  "$SRC" --out "$ICONSET/icon_128x128@2x.png"  -s format png
sips -z 256  256  "$SRC" --out "$ICONSET/icon_256x256.png"     -s format png
sips -z 512  512  "$SRC" --out "$ICONSET/icon_256x256@2x.png"  -s format png
sips -z 512  512  "$SRC" --out "$ICONSET/icon_512x512.png"     -s format png
cp "$SRC"          "$ICONSET/icon_512x512@2x.png"

echo "Building icon.icns…"
iconutil -c icns "$ICONSET" -o build/icon.icns

echo "Done. build/icon.icns updated."
