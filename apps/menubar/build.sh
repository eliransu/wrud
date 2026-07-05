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
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
EOF

# ponytail: host arch only; add `-target x86_64-apple-macos13.0` + lipo if you ever ship universal
swiftc -O wrud-menubar.swift -o "$APP/Contents/MacOS/wrud-menubar" \
  -target "$(uname -m)-apple-macos13.0"
codesign --force --sign - "$APP"

echo "built $APP"
echo "  run   : open $APP"
echo "  check : $APP/Contents/MacOS/wrud-menubar --check"
