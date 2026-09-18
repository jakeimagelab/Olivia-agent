#!/bin/zsh
# 기존 2개 LaunchAgent(worker, remote-bridge)를 내리고 OliviaWorker.app 하나로 교체한다.
# 원본 plist는 삭제하지 않고 .disabled로 보존한다(롤백 가능하게). build-and-install.sh로
# OliviaWorker.app이 이미 빌드·서명되어 있고, foreground 테스트로 정상 동작을 확인한
# *이후에만* 실행해야 한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

OLD_WORKER="$AGENTS_DIR/com.olivia.macstudio.worker.plist"
OLD_BRIDGE="$AGENTS_DIR/com.olivia.macstudio.remote-bridge.plist"
NEW_PLIST="$AGENTS_DIR/com.olivia.macstudio.oliviaworker.plist"

echo "[swap] 기존 LaunchAgent 2개를 내립니다..."
launchctl bootout "gui/$UID_NUM/com.olivia.macstudio.worker" 2>&1 || echo "  (worker는 이미 내려가 있음)"
launchctl bootout "gui/$UID_NUM/com.olivia.macstudio.remote-bridge" 2>&1 || echo "  (remote-bridge는 이미 내려가 있음)"

if [ -f "$OLD_WORKER" ]; then
  mv "$OLD_WORKER" "$OLD_WORKER.disabled"
  echo "[swap] $OLD_WORKER → .disabled로 보존"
fi
if [ -f "$OLD_BRIDGE" ]; then
  mv "$OLD_BRIDGE" "$OLD_BRIDGE.disabled"
  echo "[swap] $OLD_BRIDGE → .disabled로 보존"
fi

cp "$SCRIPT_DIR/com.olivia.macstudio.oliviaworker.plist" "$NEW_PLIST"
echo "[swap] 새 LaunchAgent 설치: $NEW_PLIST"

launchctl bootstrap "gui/$UID_NUM" "$NEW_PLIST"
echo "[swap] launchctl bootstrap 완료"

sleep 2
echo "[swap] 현재 상태:"
launchctl list | grep -i olivia || echo "  (olivia 관련 항목 없음 — 문제 가능성)"
