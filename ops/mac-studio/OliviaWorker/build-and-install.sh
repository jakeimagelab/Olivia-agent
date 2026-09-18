#!/bin/zsh
# OliviaWorker.app 빌드 + ~/Applications 설치. launchd는 건드리지 않는다 — 이 스크립트는
# 몇 번을 다시 실행해도 안전하다(재빌드만 하고 기존 worker.sh/remote-bridge.sh LaunchAgent는
# 그대로 계속 돈다). LaunchAgent 교체는 별도 단계(swap-launch-agents.sh)에서만 한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
APP_DIR="$HOME/Applications/OliviaWorker.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

echo "[build] source: $SCRIPT_DIR/main.swift"
echo "[build] target app: $APP_DIR"

mkdir -p "$MACOS_DIR"

swiftc -O "$SCRIPT_DIR/main.swift" -o "$MACOS_DIR/OliviaWorker"
chmod +x "$MACOS_DIR/OliviaWorker"

cp "$SCRIPT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"

# Apple Developer 인증서 없이 ad-hoc 서명 — TCC가 code identity를 인식할 수 있는 최소 조건.
# 고정된 --identifier를 매번 같은 값으로 줘서 재빌드해도 같은 앱으로 식별되게 한다.
codesign --force --sign - --identifier com.olivia.macstudio.oliviaworker "$APP_DIR"

echo "[build] 완료: $APP_DIR"
codesign -dv "$APP_DIR" 2>&1 | head -5
