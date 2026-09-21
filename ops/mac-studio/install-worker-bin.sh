#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h:h}"
SOURCE_BIN="$SCRIPT_DIR/bin"
WORKER_HOME="${OLIVIA_WORKER_HOME:-$HOME/OliviaWorker}"
TARGET_BIN="$WORKER_HOME/bin"
BACKUP_ROOT="$WORKER_HOME/backups"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_DIR="$BACKUP_ROOT/worker-bin-$TIMESTAMP"
NEW_BIN="$WORKER_HOME/.worker-bin-install-$TIMESTAMP-$$"
FROM_HOOK=0

if [[ -e "$BACKUP_DIR" ]]; then
  BACKUP_DIR="$BACKUP_ROOT/worker-bin-$TIMESTAMP-$$"
fi

if [[ "${1:-}" == "--from-hook" ]]; then
  FROM_HOOK=1
elif [[ -n "${1:-}" ]]; then
  print -u2 -- "사용법: $0 [--from-hook]"
  exit 2
fi

if [[ -z "$WORKER_HOME" || "$WORKER_HOME" == "/" || "$WORKER_HOME" == "$HOME" ]]; then
  print -u2 -- "[install] 안전하지 않은 OLIVIA_WORKER_HOME입니다: $WORKER_HOME"
  exit 1
fi
if [[ ! -f "$SOURCE_BIN/worker.sh" || ! -f "$SOURCE_BIN/remote-bridge.sh" ]]; then
  print -u2 -- "[install] 리포지토리의 worker script를 찾을 수 없습니다: $SOURCE_BIN"
  exit 1
fi

required_runners=(
  scripts/mac-studio-remote-bridge.ts
  scripts/remote-photo-sort-runner.ts
  scripts/photo-prepare-source-runner.ts
  scripts/photo-stage-jpg-runner.ts
  scripts/photo-classify-work-runner.ts
  scripts/photo-raw-match-runner.ts
  scripts/photo-resize-runner.ts
  scripts/photo-ai-select-runner.ts
  scripts/photo-retouch-runner.ts
)
for runner in "${required_runners[@]}"; do
  if [[ ! -f "$REPO_ROOT/$runner" ]]; then
    print -u2 -- "[install] 필요한 runner가 없습니다: $REPO_ROOT/$runner"
    exit 1
  fi
done

mkdir -p "$WORKER_HOME" "$BACKUP_ROOT"
if [[ -L "$TARGET_BIN" ]]; then
  print -u2 -- "[install] $TARGET_BIN이 심볼릭 링크입니다. 자동 교체하지 않습니다."
  exit 1
fi
if [[ -e "$NEW_BIN" ]]; then
  print -u2 -- "[install] 임시 설치 경로가 이미 존재합니다: $NEW_BIN"
  exit 1
fi

cleanup() {
  if [[ -d "$NEW_BIN" ]]; then
    rm -rf -- "$NEW_BIN"
  fi
}
trap cleanup EXIT INT TERM

mkdir "$NEW_BIN"
cp "$SOURCE_BIN/worker.sh" "$NEW_BIN/worker.sh"
cp "$SOURCE_BIN/remote-bridge.sh" "$NEW_BIN/remote-bridge.sh"
chmod 755 "$NEW_BIN/worker.sh" "$NEW_BIN/remote-bridge.sh"
/bin/zsh -n "$NEW_BIN/worker.sh"
/bin/zsh -n "$NEW_BIN/remote-bridge.sh"

mkdir "$BACKUP_DIR"
if [[ -d "$TARGET_BIN" ]]; then
  mv "$TARGET_BIN" "$BACKUP_DIR/bin"
  print -- "[install] 기존 bin 백업: $BACKUP_DIR/bin"
else
  print -- "[install] 기존 bin 없음: 새로 설치합니다."
fi

if ! mv "$NEW_BIN" "$TARGET_BIN"; then
  print -u2 -- "[install] 새 bin 설치 실패"
  if [[ -d "$BACKUP_DIR/bin" && ! -e "$TARGET_BIN" ]]; then
    mv "$BACKUP_DIR/bin" "$TARGET_BIN"
    print -u2 -- "[install] 기존 bin을 복원했습니다."
  fi
  exit 1
fi
trap - EXIT INT TERM

if [[ "$FROM_HOOK" == "0" && "${OLIVIA_SKIP_GIT_HOOK:-0}" != "1" && -d "$REPO_ROOT/.git" ]]; then
  existing_hooks_path="$(git -C "$REPO_ROOT" config --local --get core.hooksPath 2>/dev/null || true)"
  if [[ -z "$existing_hooks_path" || "$existing_hooks_path" == "ops/mac-studio/git-hooks" ]]; then
    git -C "$REPO_ROOT" config --local core.hooksPath ops/mac-studio/git-hooks
    print -- "[install] git pull 자동 설치 hook 활성화: ops/mac-studio/git-hooks/post-merge"
  else
    print -u2 -- "[install] 기존 core.hooksPath($existing_hooks_path)를 유지합니다. git pull 후 설치 스크립트를 직접 실행하세요."
  fi
fi

print -- "[install] 설치 완료: $TARGET_BIN"
print -- "[install] 리포지토리: $REPO_ROOT"
print -- "[install] worker.env, logs, state, LaunchAgent는 변경하지 않았습니다."
if [[ "$FROM_HOOK" == "0" ]]; then
  print -- "[install] 실행 중인 Worker에는 재시작 후 새 worker.sh가 적용됩니다."
fi
