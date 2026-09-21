#!/bin/zsh
set -euo pipefail

WORKER_HOME="${OLIVIA_WORKER_HOME:-$HOME/OliviaWorker}"
ENV_FILE="${OLIVIA_WORKER_ENV_PATH:-$WORKER_HOME/config/worker.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

export PATH="${PATH:-/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
REPO_ROOT="${OLIVIA_REPO_ROOT:-$HOME/UGnasync/Cloade/Olivia-agent-main}"
BRIDGE_RUNNER="$REPO_ROOT/scripts/mac-studio-remote-bridge.ts"
typeset -A PHASE6_RUNNERS=(
  PHOTO_PREPARE_SOURCE photo-prepare-source-runner.ts
  PHOTO_STAGE_JPG photo-stage-jpg-runner.ts
  PHOTO_CLASSIFY_WORK photo-classify-work-runner.ts
)

if [[ ! -d "$REPO_ROOT" ]]; then
  print -u2 -- "[remote-bridge] 리포지토리를 찾을 수 없습니다: $REPO_ROOT"
  exit 1
fi
if [[ ! -f "$BRIDGE_RUNNER" ]]; then
  print -u2 -- "[remote-bridge] 실행기를 찾을 수 없습니다: $BRIDGE_RUNNER"
  exit 1
fi
for action runner_name in "${(@kv)PHASE6_RUNNERS}"; do
  if [[ ! -f "$REPO_ROOT/scripts/$runner_name" ]]; then
    print -u2 -- "[remote-bridge] $action runner를 찾을 수 없습니다: $REPO_ROOT/scripts/$runner_name"
    exit 1
  fi
done
if ! command -v node >/dev/null 2>&1; then
  print -u2 -- "[remote-bridge] node 실행 파일을 찾을 수 없습니다."
  exit 1
fi

cd "$REPO_ROOT"
exec node --import tsx "$BRIDGE_RUNNER" --repo-root "$REPO_ROOT" "$@"
