# Olivia Photo Studio Remote Completion Design

Date: 2026-09-13
Status: Approved

## Objective

Finish the Photo Studio remote execution experience without creating or copying any photo classification algorithm. Local execution continues to use the existing browser and `FileSystemDirectoryHandle` implementation. Remote photo classification continues to use the existing Mac Studio runner. This change only owns execution-location state, remote job tracking, progress transport, worker presence, reconnect behavior, and remote folder-selection efficiency.

## Guardrails

- Do not change the classification criteria or algorithms in `handleFieldSort` or the headless runner.
- Do not remove or replace `showDirectoryPicker`, `rootDir`, or existing local workflows.
- Do not create remote implementations for Photo Studio tools that do not already have a runner.
- Do not send NAS file contents, previews, or downloads to the browser.
- Preserve raw relative NAS paths, including NFD Unicode form, for every Worker request.
- Keep the existing outbound Worker polling and authentication model.
- Do not add a new state-management dependency.

## Current-State Findings

1. `ExecutionMode` is owned by `PhotoSortingWorkspace` and persisted under a photo-classifier-specific key.
2. Remote photo sorting polls inside `runRemotePhotoSort` for five minutes and throws on timeout. The workspace renders every thrown error as `작업 실패`, even when the server job is still `QUEUED` or `RUNNING`.
3. The runner already produces `STAGING`, `SCANNING`, `ANALYZING`, `ORGANIZING`, and `VERIFYING` progress events, but the CLI only writes human-readable stderr lines and the Worker report API accepts terminal states only.
4. There is no persistent Worker heartbeat model. UI connection badges are inferred from an individual LIST_FOLDER result.
5. Remote NAS listing requests include files and folders. The folder picker cannot request a directory-only response.

## Architecture

### Photo Studio execution context

Add a small client-side `PhotoStudioExecutionProvider` inside the Photo Studio route layout. It owns:

- the shared `LOCAL_DIRECT | REMOTE_WORKER` mode;
- device/surface restrictions;
- migration from the previous classifier-specific localStorage key;
- the current remote job ID and last known job state;
- remote-job polling and reconnect state;
- Worker heartbeat state.

The canonical storage key is `olivia:photo-studio:execution-mode`. Desktop exposes both modes. Tablet and mobile resolve to `REMOTE_WORKER`. The provider must render the execution selector once above the active Photo Studio workspace. `PhotoSortingWorkspace` consumes the context instead of rendering another selector.

An active photo-sort job ID is stored separately in localStorage. Route/tab changes and reloads restore the job and resume read-only status polling. A terminal job remains available for status display until replaced by another job.

### Remote job client

Refactor the existing remote photo-sort client into small operations:

- create a PHOTO_SORT job;
- fetch a job by ID;
- parse and validate job/progress payloads;
- optionally watch an existing job.

The Photo Studio provider owns long-lived polling. Temporary request failures never synthesize a `FAILED` job. They retain the last server state and set a client-only connection state such as `reconnecting`. Poll delays use a bounded 1s, 2s, 3s sequence. Only `remote_jobs.status = FAILED` produces the user-facing `작업 실패` state.

There is no five-minute failure deadline. The browser may reduce or pause polling while hidden, but it must resume using the persisted job ID. The server job remains independent of browser lifetime.

### Progress transport

Add one nullable/default-empty `progress jsonb` column to `remote_jobs`.

Progress schema:

```json
{
  "stage": "STAGING",
  "current": 400,
  "total": 1346,
  "message": "NAS 원본을 작업 폴더로 복사 중입니다."
}
```

Allowed stages match the existing runner: `STAGING`, `SCANNING`, `ANALYZING`, `ORGANIZING`, and `VERIFYING`. The Worker report endpoint accepts `RUNNING`, `COMPLETED`, and `FAILED`. A `RUNNING` report may update progress and message but never sets `completed_at`. Terminal reports retain their existing semantics.

The CLI writes each existing `onProgress` event in a stable machine-readable stderr format while preserving the final JSON result on stdout. The bridge can forward each event to the existing Worker report endpoint. No classification implementation is duplicated in the bridge.

### Worker heartbeat

Add a minimal `remote_workers` table keyed by `worker_id` with:

- `last_seen_at`;
- `worker_status`;
- nullable `nas_connected`;
- `updated_at`.

Every authenticated `/api/worker/next` call upserts the configured Worker heartbeat before claiming a job. The endpoint may read an optional NAS-connected header without requiring an immediate external Worker change. Authenticated progress/final reports also refresh last seen.

Add an admin/internal read endpoint for the configured Worker. `online` is derived from recent `last_seen_at`, rather than stored forever. An explicitly offline Worker disables new remote execution. Unknown status remains non-destructive and is shown as connection checking. A successful LIST_FOLDER response continues to provide concrete NAS-connected state to the folder picker.

### Folder-only NAS selection

Extend `ListRemoteNasFolderOptions` with `foldersOnly`. `PhotoSourcePicker` calls `RemoteNasBrowser` with folder-only mode. The data source sends:

```json
{
  "action": "LIST_FOLDER",
  "payload": {
    "remote_path": "<raw relative path>",
    "folders_only": true
  }
}
```

The API validates `folders_only` as a boolean and forwards only the safe fields. The data-source adapter also filters out files defensively. `RemoteNasBrowser` keeps its existing full browser behavior by default so `/remote-files` remains unchanged. Folder-only mode simplifies labels/columns and enables selecting the current folder immediately after its directory listing succeeds, including an empty folder.

The external Worker should honor `folders_only` during `os.scandir`, returning directory entries without file stat/size/mime work. This repository defines and consumes the protocol; it does not add a second filesystem implementation.

## UI

The shared execution bar appears once in Photo Studio:

- `이 기기에서 작업`
- `Mac Studio 원격 작업`

Remote mode adds a compact status line for Worker/NAS state and the active job. It does not become a dashboard.

The photo classification source control continues to render its local Finder button or remote NAS folder button based on the shared mode, but no longer renders another mode selector. Existing AI Auto and Advanced panels reuse the same source control.

`RemoteJobProgress` renders the existing runner stages as compact rows. Unknown future stages fall back to message-only display. Current/total is shown only when present. Connection loss renders `Mac Studio에서 작업 계속 진행 중` and `연결을 다시 확인하고 있습니다`; it never renders failure.

Remote execution buttons are disabled while the tracked job is `QUEUED` or `RUNNING`, and when Worker presence is explicitly offline. Unsupported remote Photo Studio tools read the shared mode and replace their execution affordance with `Mac Studio 원격 실행 준비 중`; their local implementations remain intact. This is applied only where it can be done without rewriting each tool.

## Database Migration

Create an additive migration that:

1. adds `remote_jobs.progress jsonb not null default '{}'::jsonb`;
2. creates `remote_workers` if absent;
3. adds an index on `remote_workers.last_seen_at` only if useful for status reads;
4. preserves RLS and service-role-only Worker mutations;
5. updates no existing job rows other than applying the column default.

The checked-in `supabase/remote-jobs-schema.sql` is updated to match fresh installations.

## Error Semantics

- Server `FAILED`: show `작업 실패` and the verified server message/error.
- Poll request/network failure: keep last job state, show reconnecting, retry.
- Browser reload/tab change: recover job ID and resume polling.
- Poll inactivity: never write or infer `FAILED`.
- Worker offline before job creation: disable create and explain the connection requirement.
- Worker goes offline after the job starts: retain server job state and reconnect; do not mutate it.
- Invalid progress: reject the progress update with HTTP 400; do not corrupt the job.

## Compatibility

- `handleFieldSort`, `showDirectoryPicker`, and `rootDir` remain the local path.
- The already deployed headless PHOTO_SORT runner remains the remote path.
- `/remote-files` remains a full read-only browser unless folder-only mode is explicitly enabled.
- Mock NAS data remains available and supports the same options.
- Existing Worker auth headers and `claim_remote_job` RPC remain intact.
- Existing terminal Worker reports remain valid without a progress body.

## Testing

Add or update tests for:

- shared mode resolution, storage-key migration, and mobile/tablet enforcement;
- folders-only request payload and defensive entry filtering;
- raw NFD path preservation;
- progress parsing and RUNNING report validation;
- connection errors retaining QUEUED/RUNNING state;
- only server FAILED mapping to failure UI;
- job-ID persistence/recovery helpers;
- heartbeat online/offline derivation;
- duplicate execution prevention.

Run targeted tests, full test suite, typecheck, lint, and production build. Existing unrelated warnings are reported separately from new errors.

## Out of Scope

- New or changed classification algorithms.
- Remote runners for selection, matching, resizing, retouching, or video tools.
- A new Worker framework or inbound Mac Studio connection.
- NAS preview/download/write operations.
- Changes to the external Worker shell beyond documenting the folders-only and structured-progress protocol it should forward.
