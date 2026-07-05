#!/bin/bash
# Build dist/Wrud.app - a menu bar shell over the wrud CLI. Needs Xcode CLT (swiftc).
set -euo pipefail
cd "$(dirname "$0")"

APP=dist/Wrud.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>wrud-menubar</string>
  <key>CFBundleIdentifier</key><string>dev.wrud.menubar</string>
  <key>CFBundleName</key><string>wrud</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
EOF

# app icon: rendered from make-icon.swift, scaled with sips, packed with iconutil (all built-in)
ICONSET=dist/AppIcon.iconset
rm -rf "$ICONSET" && mkdir -p "$ICONSET" "$APP/Contents/Resources"
swift make-icon.swift dist/icon-1024.png >/dev/null
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" dist/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z "$((s * 2))" "$((s * 2))" dist/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET" dist/icon-1024.png

# universal binary - the .app ships inside the @wrud/cli npm tarball, so both Mac arches
for arch in arm64 x86_64; do
  swiftc -O wrud-menubar.swift -o "dist/wrud-menubar-$arch" -target "$arch-apple-macos13.0"
done
lipo -create dist/wrud-menubar-arm64 dist/wrud-menubar-x86_64 \
  -output "$APP/Contents/MacOS/wrud-menubar"
rm dist/wrud-menubar-arm64 dist/wrud-menubar-x86_64
codesign --force --sign - "$APP"

echo "built $APP"
echo "  run   : open $APP"
echo "  check : $APP/Contents/MacOS/wrud-menubar --check"
