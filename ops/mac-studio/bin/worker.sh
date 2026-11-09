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
BRIDGE="${OLIVIA_REMOTE_BRIDGE_PATH:-$SCRIPT_DIR/remote-bridge.sh}"
REMOTE_BASE="${REMOTE_API_BASE:-${NEXT_PUBLIC_BASE_URL:-}}"
WORKER_TOKEN_VALUE="${OLIVIA_WORKER_TOKEN:-${WORKER_TOKEN:-}}"
WORKER_ID_VALUE="${OLIVIA_WORKER_ID:-${WORKER_ID:-jake-macstudio-01}}"
POLL_SECONDS="${OLIVIA_WORKER_POLL_SECONDS:-5}"
IDLE_MAX_SECONDS="${OLIVIA_WORKER_IDLE_MAX_SECONDS:-10}"
POLL_BACKOFF_FACTOR="${OLIVIA_WORKER_POLL_BACKOFF_FACTOR:-2}"
INTERACTIVE_POLL_SECONDS="${OLIVIA_WORKER_INTERACTIVE_POLL_SECONDS:-1}"
INTERACTIVE_WINDOW_SECONDS="${OLIVIA_WORKER_INTERACTIVE_WINDOW_SECONDS:-30}"
MAX_POLLS="${OLIVIA_WORKER_MAX_POLLS:-0}"
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
[[ "$IDLE_MAX_SECONDS" == <-> && "$IDLE_MAX_SECONDS" -ge "$POLL_SECONDS" ]] || fail_config "OLIVIA_WORKER_IDLE_MAX_SECONDS는 기본 폴링 간격 이상이어야 합니다."
[[ "$POLL_BACKOFF_FACTOR" == <-> && "$POLL_BACKOFF_FACTOR" -ge 2 ]] || fail_config "OLIVIA_WORKER_POLL_BACKOFF_FACTOR는 2 이상의 정수여야 합니다."
[[ "$INTERACTIVE_POLL_SECONDS" == <-> && "$INTERACTIVE_POLL_SECONDS" -gt 0 && "$INTERACTIVE_POLL_SECONDS" -le "$POLL_SECONDS" ]] || fail_config "OLIVIA_WORKER_INTERACTIVE_POLL_SECONDS는 1 이상 기본 폴링 간격 이하의 정수여야 합니다."
[[ "$INTERACTIVE_WINDOW_SECONDS" == <-> && "$INTERACTIVE_WINDOW_SECONDS" -ge 0 ]] || fail_config "OLIVIA_WORKER_INTERACTIVE_WINDOW_SECONDS는 0 이상의 정수여야 합니다."
[[ "$MAX_POLLS" == <-> ]] || fail_config "OLIVIA_WORKER_MAX_POLLS는 0 이상의 정수여야 합니다."

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
    -H "x-olivia-openai-api-key-configured: $([[ -n "${OPENAI_API_KEY:-}" ]] && print true || print false)"
  )

  local heartbeat_path="$WORKER_HOME/state/nas-watcher-heartbeat"
  local installed_rev_path="$WORKER_HOME/state/installed-rev"
  local installed_at_path="$WORKER_HOME/state/installed-at"
  local heartbeat_epoch heartbeat_iso heartbeat_payload worker_rev worker_installed_at worker_health_path worker_health_payload
  if [[ -f "$heartbeat_path" ]]; then
    heartbeat_epoch="$(stat -f '%m' "$heartbeat_path" 2>/dev/null || true)"
    if [[ -n "$heartbeat_epoch" ]]; then
      heartbeat_iso="$(date -u -r "$heartbeat_epoch" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)"
      [[ -n "$heartbeat_iso" ]] && headers+=(-H "x-olivia-photo-watcher-last-scan-at: $heartbeat_iso")
    fi
    heartbeat_payload="$(/usr/bin/base64 < "$heartbeat_path" 2>/dev/null | tr -d '\r\n' || true)"
    [[ -n "$heartbeat_payload" && ${#heartbeat_payload} -le 8192 ]] && headers+=(-H "x-olivia-photo-watcher-progress: $heartbeat_payload")
  fi
  if [[ -f "$installed_rev_path" ]]; then
    worker_rev="$(head -n 1 "$installed_rev_path" 2>/dev/null | tr -cd '0-9a-fA-F' | head -c 64 || true)"
    [[ -n "$worker_rev" ]] && headers+=(-H "x-olivia-worker-rev: $worker_rev")
  fi
  if [[ -f "$installed_at_path" ]]; then
    worker_installed_at="$(head -n 1 "$installed_at_path" 2>/dev/null | tr -d '\r\n' || true)"
    [[ -n "$worker_installed_at" ]] && headers+=(-H "x-olivia-worker-installed-at: $worker_installed_at")
  fi
  # OliviaWorker.app의 bounded supervisor snapshot. 프로세스 restart storm과 로그
  # 증가율을 서버 자가 점검에서 판단할 수 있게, 실행 경로나 로그 내용은 보내지 않는다.
  worker_health_path="$WORKER_HOME/state/oliviaworker_app_status.json"
  if [[ -f "$worker_health_path" ]]; then
    worker_health_payload="$(/usr/bin/base64 < "$worker_health_path" 2>/dev/null | tr -d '\r\n' || true)"
    [[ -n "$worker_health_payload" && ${#worker_health_payload} -le 12000 ]] && headers+=(-H "x-olivia-worker-process-health: $worker_health_payload")
  fi
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

log "시작됨(worker=$WORKER_ID_VALUE, api=$REMOTE_BASE, poll=${POLL_SECONDS}s, idle-max=${IDLE_MAX_SECONDS}s, interactive=${INTERACTIVE_POLL_SECONDS}s/${INTERACTIVE_WINDOW_SECONDS}s)"
current_poll_seconds="$POLL_SECONDS"
interactive_remaining_seconds=0
poll_count=0
while (( STOP_REQUESTED == 0 )); do
  poll_once
  poll_status=$?
  (( poll_count += 1 ))
  if [[ "${OLIVIA_WORKER_ONCE:-0}" == "1" ]]; then
    if (( poll_status == 3 )); then exit 0; else exit "$poll_status"; fi
  fi
  if (( MAX_POLLS > 0 && poll_count >= MAX_POLLS )); then
    break
  fi

  if (( poll_status == 0 )); then
    interactive_remaining_seconds="$INTERACTIVE_WINDOW_SECONDS"
    current_poll_seconds="$POLL_SECONDS"
  fi

  if (( interactive_remaining_seconds > 0 )); then
    sleep_seconds="$INTERACTIVE_POLL_SECONDS"
    (( sleep_seconds > interactive_remaining_seconds )) && sleep_seconds="$interactive_remaining_seconds"
    (( interactive_remaining_seconds -= sleep_seconds ))
    if (( poll_status == 0 )); then
      log "작업을 감지해 ${INTERACTIVE_WINDOW_SECONDS}초 동안 ${INTERACTIVE_POLL_SECONDS}초 간격으로 확인합니다."
    fi
  else
    sleep_seconds="$current_poll_seconds"
    next_poll_seconds=$(( current_poll_seconds * POLL_BACKOFF_FACTOR ))
    (( next_poll_seconds > IDLE_MAX_SECONDS )) && next_poll_seconds="$IDLE_MAX_SECONDS"
    if (( next_poll_seconds != current_poll_seconds )); then
      log "작업 없음/조회 오류: 다음 폴링 간격 ${next_poll_seconds}초"
    fi
    current_poll_seconds="$next_poll_seconds"
  fi
  (( STOP_REQUESTED == 0 )) && sleep "$sleep_seconds"
done
log "종료됨"
