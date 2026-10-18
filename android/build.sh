#!/usr/bin/env bash
# Gera dist/ArenaRoyale.apk sem precisar do Android SDK nem do Android Studio.
# Requisitos: Java 11+ (javac), curl, unzip, zip.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
TOOLS="$HERE/.tools"
BUILD="$HERE/build"
OUT="$ROOT/dist/ArenaRoyale.apk"

VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"

fetch() { # url destino
  [ -f "$2" ] && return
  echo "Baixando $(basename "$2")..."
  for i in 1 2 3 4; do curl -sSfL -o "$2.part" "$1" && mv "$2.part" "$2" && return; sleep $((i * 3)); done
  echo "Falha ao baixar $1" >&2; exit 1
}

mkdir -p "$TOOLS"
fetch https://github.com/iBotPeaches/Apktool/releases/download/v2.12.1/apktool_2.12.1.jar "$TOOLS/apktool.jar"
fetch https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar "$TOOLS/uber-apk-signer.jar"
fetch https://repo1.maven.org/maven2/com/google/android/android/4.1.1.4/android-4.1.1.4.jar "$TOOLS/android.jar"
fetch https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar "$TOOLS/dx.jar"
# aapt2 e os recursos do framework vêm dentro do apktool
if [ ! -x "$TOOLS/prebuilt/linux/aapt2_64" ]; then
  (cd "$TOOLS" && unzip -o -q apktool.jar prebuilt/linux/aapt2_64 prebuilt/android-framework.jar && chmod +x prebuilt/linux/aapt2_64)
fi
AAPT2="$TOOLS/prebuilt/linux/aapt2_64"
FRAMEWORK="$TOOLS/prebuilt/android-framework.jar"

rm -rf "$BUILD"
mkdir -p "$BUILD/assets/www" "$BUILD/classes" "$BUILD/res" "$(dirname "$OUT")"

# 1) Jogo web -> assets/www
cp "$ROOT/index.html" "$ROOT/style.css" "$ROOT/game.js" "$BUILD/assets/www/"
cp -r "$ROOT/lib" "$BUILD/assets/www/"

# 2) Recursos + manifest
"$AAPT2" compile --dir "$HERE/res" -o "$BUILD/res/res.zip"
"$AAPT2" link -o "$BUILD/unsigned.apk" -I "$FRAMEWORK" \
  --manifest "$HERE/AndroidManifest.xml" \
  --min-sdk-version 21 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -A "$BUILD/assets" "$BUILD/res/res.zip"

# 3) Java -> dex
javac --release 8 -nowarn -cp "$TOOLS/android.jar" -d "$BUILD/classes" \
  $(find "$HERE/src" -name '*.java')
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=21 \
  --output="$BUILD/classes.dex" "$BUILD/classes"
(cd "$BUILD" && zip -q -j unsigned.apk classes.dex)

# 4) zipalign + assinatura (v1+v2+v3, chave de debug embutida no uber-apk-signer)
java -jar "$TOOLS/uber-apk-signer.jar" --apks "$BUILD/unsigned.apk" --out "$BUILD/signed" >/dev/null
cp "$BUILD"/signed/*.apk "$OUT"
echo "APK pronto: $OUT ($(du -h "$OUT" | cut -f1))"
