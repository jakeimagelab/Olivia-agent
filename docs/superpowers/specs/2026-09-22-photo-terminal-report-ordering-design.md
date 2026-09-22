# Photo terminal report ordering design

## Incident

During the `0922_test_os` production E2E test, the first `PHOTO_CLASSIFY_WORK`
job completed successfully (`673` JPG, `6` scenes). Before the matching
`photo_storage_projects` row changed from `CLASSIFY_QUEUED` to
`CLASSIFY_COMPLETED`, the worker claimed the same project again. More completed
classification jobs continued to be created.

The report route currently makes the job terminal first and synchronizes the
project second:

1. `remote_jobs.RUNNING -> COMPLETED`
2. `syncPhotoClassificationProject()`

The recovery clause in `claim_copy_completed_photo_project()` is allowed to
claim a stale `CLASSIFY_QUEUED` project when no queued/running classification
job exists. Between steps 1 and 2, that condition is briefly true. A second
claim replaces `classify_job_id`; the first completion sync then updates zero
rows and the cycle repeats.

## Decision

For terminal reports (`COMPLETED` or `FAILED`) of photo lifecycle jobs, keep the
remote job `RUNNING` while synchronizing the project first:

1. Read and validate the running remote job.
2. Synchronize the corresponding photo project lifecycle.
3. Only after successful synchronization, change the remote job to its terminal
   state.

`RUNNING` progress reports keep their existing order. While the job remains
active, the database claim function cannot select the same project, so the
race window is removed without changing the worker, filesystem pipeline, or
claim/recovery policy.

If terminal project synchronization fails, the report request fails before the
remote job becomes terminal. This deliberately leaves the active job as a
recovery fence instead of allowing duplicate file jobs to be claimed silently.

## Scope

- Refactor `POST /api/worker/report` ordering for:
  - `PHOTO_PREPARE_SOURCE`
  - `PHOTO_STAGE_JPG`
  - `PHOTO_CLASSIFY_WORK`
- Add a route-level regression test asserting project synchronization happens
  before the terminal `remote_jobs` update.
- Preserve current progress coalescing, filesystem runners, safety checks, and
  notification event creation.

## Rejected alternatives

- Increasing the 30-second stale threshold only makes the race less likely and
  does not remove it.
- Adding a completed-job exclusion in the claim function prevents duplicates
  but can leave the project permanently queued.
- A new transactional SQL RPC is stronger but requires a production migration
  and duplicates existing lifecycle logic; it is unnecessary for this focused
  incident fix.

## Verification

1. Route regression test proves lifecycle sync precedes terminal job update.
2. Existing photo storage, worker script, and end-to-end tests pass.
3. TypeScript and production build pass.
4. Deploy, restore the verified `0922_test_os` project to
   `CLASSIFY_COMPLETED`, resume the worker, and confirm no new classification
   job appears during at least two polling intervals.
