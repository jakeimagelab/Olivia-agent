#!/bin/zsh
set -uo pipefail

# PHASE 6 jobs are claimed here and dispatched by remote-bridge.sh:
# PHOTO_PREPARE_SOURCE -> scripts/photo-prepare-source-runner.ts
# PHOTO_STAGE_JPG      -> scripts/photo-stage-jpg-runner.ts
# PHOTO_CLASSIFY_WORK  -> scripts/photo-classify-work-runner.ts

WORKER_HOME="${OLIVIA_WORKER_HOME:-$HOME/OliviaWorker}"
ENV_FILE="${OLIVIA_WORKER_ENV_PATH:-$WORKER_HOME/config/worker.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

export PATH="${PATH:-/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
SCRIPT_DIR="${0:A:h}"
BRIDGE="$SCRIPT_DIR/remote-bridge.sh"
REMOTE_BASE="${REMOTE_API_BASE:-${NEXT_PUBLIC_BASE_URL:-}}"
WORKER_TOKEN_VALUE="${OLIVIA_WORKER_TOKEN:-${WORKER_TOKEN:-}}"
WORKER_ID_VALUE="${OLIVIA_WORKER_ID:-${WORKER_ID:-jake-macstudio-01}}"
POLL_SECONDS="${OLIVIA_WORKER_POLL_SECONDS:-5}"
CURRENT_BRIDGE_PID=""
STOP_REQUESTED=0

log() {
  print -u2 -- "[$(date '+%Y-%m-%d %H:%M:%S')] [worker] $*"
}

fail_config() {
  log "$1"
  exit 1
}

[[ -n "$REMOTE_BASE" ]] || fail_config "REMOTE_API_BASE가 설정되어 있지 않습니다."
[[ -n "$WORKER_TOKEN_VALUE" ]] || fail_config "OLIVIA_WORKER_TOKEN이 설정되어 있지 않습니다."
[[ -x "$BRIDGE" ]] || fail_config "remote-bridge.sh를 실행할 수 없습니다: $BRIDGE"
[[ "$POLL_SECONDS" == <-> && "$POLL_SECONDS" -gt 0 ]] || fail_config "OLIVIA_WORKER_POLL_SECONDS는 1 이상의 정수여야 합니다."

REMOTE_BASE="${REMOTE_BASE%/}"
export OLIVIA_WORKER_TOKEN="$WORKER_TOKEN_VALUE"
export OLIVIA_WORKER_ID="$WORKER_ID_VALUE"

on_signal() {
  STOP_REQUESTED=1
  if [[ -n "$CURRENT_BRIDGE_PID" ]] && kill -0 "$CURRENT_BRIDGE_PID" 2>/dev/null; then
    kill -TERM "$CURRENT_BRIDGE_PID" 2>/dev/null || true
  fi
}
trap on_signal INT TERM

boolean_header_for_root() {
  local root="$1"
  local kind="$2"
  if [[ -z "$root" ]]; then
    return
  fi
  local mounted=false
  local accessible=false
  if [[ -d "$root" ]]; then
    mounted=true
    if command ls -1 "$root" >/dev/null 2>&1; then
      accessible=true
    fi
  fi
  print -- "x-olivia-${kind}-mounted: $mounted"
  print -- "x-olivia-${kind}-accessible: $accessible"
}

poll_once() {
  local job_file http_code curl_status bridge_status
  job_file="$(mktemp "${TMPDIR:-/tmp}/olivia-worker-job.XXXXXX")" || return 1
  local -a headers
  headers=(
    -H "Authorization: Bearer $WORKER_TOKEN_VALUE"
    -H "x-olivia-worker: $WORKER_ID_VALUE"
  )
  if [[ -n "${VERCEL_BYPASS_SECRET:-}" ]]; then
    headers+=(-H "x-vercel-protection-bypass: $VERCEL_BYPASS_SECRET")
  fi

  local diagnostic_header
  while IFS= read -r diagnostic_header; do
    [[ -n "$diagnostic_header" ]] && headers+=(-H "$diagnostic_header")
  done < <(boolean_header_for_root "${SOURCE_ROOT:-${OLIVIA_PHOTO_SOURCE_ROOT:-}}" "workstation")
  while IFS= read -r diagnostic_header; do
    [[ -n "$diagnostic_header" ]] && headers+=(-H "$diagnostic_header")
  done < <(boolean_header_for_root "${OLIVIA_PHOTO_WORK_ROOT:-}" "agentstation")

  http_code="$(curl -sS --connect-timeout 10 --max-time 40 -o "$job_file" -w '%{http_code}' \
    "${headers[@]}" "$REMOTE_BASE/api/worker/next")"
  curl_status=$?
  if (( curl_status != 0 )); then
    log "작업 조회 네트워크 오류(curl=$curl_status)"
    rm -f "$job_file"
    return 1
  fi
  if [[ "$http_code" != "200" ]]; then
    log "작업 조회 실패(HTTP $http_code): $(head -c 1000 "$job_file")"
    rm -f "$job_file"
    return 1
  fi

  "$BRIDGE" --job-file "$job_file" &
  CURRENT_BRIDGE_PID=$!
  wait "$CURRENT_BRIDGE_PID"
  bridge_status=$?
  CURRENT_BRIDGE_PID=""
  rm -f "$job_file"

  if (( bridge_status == 3 )); then
    return 3
  fi
  if (( bridge_status != 0 )); then
    log "작업 실행이 실패했습니다(remote-bridge exit=$bridge_status). 위의 실제 오류를 확인하세요."
    return "$bridge_status"
  fi
  return 0
}

log "시작됨(worker=$WORKER_ID_VALUE, api=$REMOTE_BASE)"
while (( STOP_REQUESTED == 0 )); do
  poll_once
  poll_status=$?
  if [[ "${OLIVIA_WORKER_ONCE:-0}" == "1" ]]; then
    if (( poll_status == 3 )); then exit 0; else exit "$poll_status"; fi
  fi
  (( STOP_REQUESTED == 0 )) && sleep "$POLL_SECONDS"
done
log "종료됨"
