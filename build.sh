#!/bin/sh
# Construit les versions Windows, macOS et Linux, puis prépare le site dans site/.
# Usage : ./build.sh   (nécessite Node.js ; à lancer sur un Mac pour signer l'app macOS)
set -eu
cd "$(dirname "$0")"
RACINE=$(pwd)
VERSION=$(node -p "require('./desktop/neutralino.config.json').version")

echo "→ Ressources de l'application"
rm -rf desktop/resources
mkdir -p desktop/resources
cp app/* desktop/resources/

echo "→ Binaires Neutralino"
cd desktop
[ -d node_modules ] || npm install
[ -d bin ] || npx neu update
rm -rf dist
npx neu build --embed-resources >/dev/null
BIN="$RACINE/desktop/dist/boites-a-classer"
cd "$RACINE"

SORTIE="$RACINE/site/telechargements"
rm -rf "$SORTIE"
mkdir -p "$SORTIE"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

echo "→ Windows"
mkdir "$T/win"
cp "$BIN/boites-a-classer-win_x64.exe" "$T/win/Boites-a-classer.exe"
(cd "$T/win" && zip -q -X "$SORTIE/boites-a-classer-windows.zip" Boites-a-classer.exe)

echo "→ macOS"
APP="$T/mac/Boîtes à classer.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN/boites-a-classer-mac_universal" "$APP/Contents/MacOS/boites-a-classer"
chmod +x "$APP/Contents/MacOS/boites-a-classer"
cp icone/icone.icns "$APP/Contents/Resources/icone.icns"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Boîtes à classer</string>
  <key>CFBundleDisplayName</key><string>Boîtes à classer</string>
  <key>CFBundleIdentifier</key><string>fr.boitesaclasser.app</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleExecutable</key><string>boites-a-classer</string>
  <key>CFBundleIconFile</key><string>icone</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>10.15</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF
if command -v codesign >/dev/null; then codesign --force --deep -s - "$APP"; fi
(cd "$T/mac" && ditto -c -k --sequesterRsrc --keepParent "Boîtes à classer.app" "$SORTIE/boites-a-classer-macos.zip")

echo "→ Linux"
for arch in x64 arm64; do
  D="$T/linux-$arch/boites-a-classer"
  mkdir -p "$D"
  cp "$BIN/boites-a-classer-linux_$arch" "$D/boites-a-classer"
  chmod +x "$D/boites-a-classer"
  cp icone/icone-256.png "$D/icone.png"
  cat > "$D/installer.sh" <<'EOF'
#!/bin/sh
# Installe Boîtes à classer pour l'utilisateur courant (menu des applications).
set -eu
cd "$(dirname "$0")"
mkdir -p "$HOME/.local/share/boites-a-classer" "$HOME/.local/share/applications"
cp boites-a-classer icone.png "$HOME/.local/share/boites-a-classer/"
cat > "$HOME/.local/share/applications/boites-a-classer.desktop" <<FIN
[Desktop Entry]
Type=Application
Name=Boîtes à classer
Comment=Classer les êtres vivants dans des boîtes emboîtées
Exec=$HOME/.local/share/boites-a-classer/boites-a-classer
Icon=$HOME/.local/share/boites-a-classer/icone.png
Categories=Education;Science;
FIN
echo "Installé : cherchez « Boîtes à classer » dans le menu des applications."
EOF
  chmod +x "$D/installer.sh"
  (cd "$T/linux-$arch" && tar -czf "$SORTIE/boites-a-classer-linux-$arch.tar.gz" boites-a-classer)
done

echo "→ Version en ligne"
rm -rf site/app
mkdir -p site/app
cp app/* site/app/
cp icone/icone-256.png site/icone.png

echo "$VERSION" > "$SORTIE/VERSION"
echo
ls -lh "$SORTIE"
