# Olivia Photo Storage PHASE 5 Design

## Goal

When a `photo_storage_projects` row reaches `COPY_COMPLETED`, Mac Studio queues
the existing Olivia Scene classification runner against the already-staged SSD2
project. SSD1 is never passed to or mutated by the classification workflow.

## Flow

`COPY_COMPLETED` → atomic claim → `CLASSIFY_QUEUED` → remote job
`PHOTO_CLASSIFY_WORK` → `CLASSIFYING` → `CLASSIFY_VERIFYING` →
`CLASSIFY_COMPLETED`.

Failures become `CLASSIFY_FAILED` or `REVIEW_REQUIRED`; no automatic cleanup or
automatic retry is performed.

## Runner reuse

The existing `runRemotePhotoSortRunner({ workFolder })` remains the only Scene
algorithm. The new worker action resolves `work_relative_path` beneath
`OLIVIA_PHOTO_WORK_ROOT`, supplies the existing classification settings, and
does not invoke source staging. Existing timestamp, visual, boundary, purpose,
department, naming, profile, quality, and report logic is reused.

## Safety and verification

The classification adapter accepts only a validated relative SSD2 path. It
captures the staged JPG filename/size/byte snapshot before classification and
verifies all managed output JPGs afterward. Missing, duplicate, or unexpected
files prevent completion. RAW files are excluded from the classification scan
and are not moved. Existing output directories are rejected by the current
work-folder safety guard.

## State and UI

Project state and remote job progress remain the source of truth. The existing
photo-storage notification provider displays queued, classifying, verifying,
completed, and failed states on Desktop, Tablet, and Mobile. A retry endpoint
is explicit and never deletes partial output.

## Recovery

The worker claim is protected by a partial unique active-job index and project
`classify_job_id`. Stale queued/classifying states are inspected before a new
claim; an active job is never duplicated. A worker restart does not blindly
rerun a project whose output has not been verified.

## Out of scope

RAW matching, metadata select, resize, retouching, SSD2 cleanup, new Scene
algorithms, and changes to the external `~/OliviaWorker/bin/worker.sh` remain
out of scope.
