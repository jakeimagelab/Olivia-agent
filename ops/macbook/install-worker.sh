#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h:h}"
WORKER_HOME="${OLIVIA_WORKER_HOME:-$HOME/OliviaWorker}"

if [[ -z "$WORKER_HOME" || "$WORKER_HOME" == "/" || "$WORKER_HOME" == "$HOME" ]]; then
  print -u2 -- "[macbook-install] 안전하지 않은 OLIVIA_WORKER_HOME입니다: $WORKER_HOME"
  exit 1
fi
if [[ ! -x "$REPO_ROOT/ops/mac-studio/install-worker-bin.sh" ]]; then
  print -u2 -- "[macbook-install] 공통 Worker 설치기를 찾을 수 없습니다."
  exit 1
fi

export OLIVIA_WORKER_HOME="$WORKER_HOME"
export OLIVIA_SKIP_GIT_HOOK=1
"$REPO_ROOT/ops/mac-studio/install-worker-bin.sh"

mkdir -p "$WORKER_HOME/config"
if [[ ! -f "$WORKER_HOME/config/worker.env" ]]; then
  cp "$SCRIPT_DIR/worker.env.example" "$WORKER_HOME/config/worker.env"
  chmod 600 "$WORKER_HOME/config/worker.env"
  print -- "[macbook-install] 환경변수 예시를 생성했습니다: $WORKER_HOME/config/worker.env"
  print -- "[macbook-install] 토큰과 사용자 경로를 입력한 뒤 Worker를 시작하세요."
else
  print -- "[macbook-install] 기존 worker.env를 유지했습니다: $WORKER_HOME/config/worker.env"
fi

print -- "[macbook-install] Worker 실행 파일 설치 완료"
print -- "[macbook-install] 다음 단계: $REPO_ROOT/ops/macbook/README.md"
