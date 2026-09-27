# Mac Studio Silent-Failure Safety Design

## Goal

Eliminate four silent Mac Studio failure modes without changing the photo pipeline or its data-safety rules:

1. The per-job `remote-bridge.sh` must not be supervised as a resident process.
2. A NAS watcher that owns no lock or no longer scans must be considered unhealthy even if its PID is alive.
3. Finder metadata must not reset photo-copy stabilization.
4. The worker must report watcher activity and installed repository revision to the server.

The existing worker polling endpoint remains the transport. No second worker-control API is introduced.

## Architecture

### Photo fingerprint boundary

`fingerprintPhotoProject()` continues to recurse through the project and count every real photo and ordinary file. It ignores only Finder/macOS metadata:

- names beginning with `.`
- AppleDouble names beginning with `._`
- `Icon\r`

Symbolic-link rejection, RAW/JPG counts, byte totals, and modification-time comparison remain unchanged. A real photo addition still changes the fingerprint and restarts stabilization.

### Watcher lifecycle and lock ownership

`PhotoStorageWatcher` tracks whether the current instance acquired the lock. `releaseLock()` removes the lock only when that instance owns it. A failed secondary watcher must never remove the active watcher's lock.

`nas-backup-watcher.ts` retries only the recognized lock-conflict error three times at five-second intervals. It starts auxiliary timers only after the watcher has successfully acquired the lock. A terminal startup or runtime failure:

1. clears the auxiliary timer,
2. stops resources owned by the current instance,
3. logs the same fatal summary to stdout and stderr,
4. exits with status 1 in resident mode.

This deliberately lets `OliviaWorker.app` restart a failed watcher instead of leaving a non-working process alive.

### Activity heartbeat and stabilization progress

After every completed scan, the NAS watcher atomically writes `~/OliviaWorker/state/nas-watcher-heartbeat`. The file contains a small JSON payload and its modification time is the liveness signal. The payload contains:

- scan timestamp and source status,
- currently stabilizing projects,
- elapsed and target stabilization seconds.

Heartbeat-write failure is logged. If updates stop, the supervisor detects the stale modification time.

`OliviaWorker.app` checks the heartbeat on its existing 30-second health cycle. After a five-minute startup grace period, a missing or older-than-five-minutes heartbeat causes only the NAS watcher child to receive `SIGTERM`. The existing process termination handler performs the delayed restart. A per-process restart guard prevents repeated termination requests for the same stale instance.

### Bridge supervision

`remote-bridge.sh` remains a per-job subprocess launched by `worker.sh --job-file ...`. The app removes both the resident `ManagedProcess` definition and `addAndStart` call.

For installations still running the old compiled app, a no-argument compatibility guard keeps `remote-bridge.sh` idle instead of exiting every eleven seconds. Job invocations with arguments follow the normal path. Rebuilding `OliviaWorker.app` removes the obsolete resident process permanently.

### Worker diagnostics transport

`install-worker-bin.sh` writes the checked-out commit SHA and installation timestamp beneath `$WORKER_HOME/state` after a verified installation. `worker.sh` reads those files plus the watcher heartbeat and adds diagnostics to its existing `/api/worker/next` request:

- watcher last scan time,
- base64-encoded watcher progress JSON,
- installed worker revision,
- installation timestamp.

Header values are size-limited and decoded defensively. Invalid or missing values are ignored rather than breaking job polling.

An additive migration adds nullable `watcher_progress jsonb`, `worker_rev text`, and `worker_installed_at timestamptz` columns to `remote_workers`. The current schema-fallback heartbeat remains: if the migration is not installed yet, the server retries without diagnostic fields and still claims jobs.

### Server status and UI

`collectSystemStatus()` remains the diagnostic source of truth. It compares the reported worker revision with the deployed revision from `VERCEL_GIT_COMMIT_SHA` (or the local server revision when available). A mismatch produces a Mac Studio warning with both short SHAs, installation time, and the two update commands. If the server revision cannot be determined, the worker revision is displayed without claiming it is stale.

Watcher stabilization is panel-specific progress, so `collectStatusPanelData()` reads the stored watcher progress and adds progress entries such as `복사 확인 중 45/90초`. These entries link directly to `/photo-sorting?remoteFolder=...`. They do not appear when no project is stabilizing.

## Error Handling

- PID survival is never treated as sufficient watcher health.
- Only lock conflicts are retried; configuration, permission, and code errors fail immediately.
- Fatal messages are written to both watcher log streams.
- Missing database columns, diagnostics headers, revision environment values, or heartbeat payload fields cannot stop worker polling or the desktop UI.
- The watcher state/baseline file is never deleted or reset by this change.

## Tests

Automated coverage will verify:

- `.DS_Store` mtime and AppleDouble creation do not change fingerprints;
- adding a photo does change the fingerprint;
- a watcher that failed to acquire a lock cannot remove another instance's lock;
- fatal resident-mode errors clear timers and select an exit path;
- the Swift supervisor no longer launches `remote-bridge.sh` and includes heartbeat-stale handling;
- installation writes revision metadata and worker headers report it;
- diagnostics parsing, database row mapping, schema fallback, and revision mismatch status;
- stabilization progress is converted into a targeted status-panel entry.

The final verification is `npm run typecheck`, `npm test`, and `npm run build`. On the Mac Studio, the compiled app must then be rebuilt with `ops/mac-studio/OliviaWorker/build-and-install.sh`; logs are checked afterward to confirm the bridge restart loop has stopped and `watcher_last_scan_at` advances.

## Non-goals

- No photo pipeline state-machine changes.
- No deletion or reset of watcher baseline/state.
- No automatic exclusion of ordinary non-photo files beyond the named macOS metadata.
- No new worker polling or control endpoint.
- No automatic log deletion in repository code.
