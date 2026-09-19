# Olivia Photo Chat Execution — Phases 2–4 Design

Date: 2026-09-20

## Goal

Extend Olivia's existing photo workflows so chat can start RAW matching, resizing, AI selection, and retouch analysis without opening the Photo Studio first. Hermes selects and validates the request; the Mac Studio Worker performs filesystem work through the existing `remote_jobs` protocol. Existing local Photo Studio screens remain available.

This design does not create replacement photo algorithms. Browser and Worker entry points share the same business rules, with filesystem and image-processing adapters selected for the runtime.

## Architecture

Each feature has four layers:

1. A chat tool resolves one unambiguous photo project and validates the requested options.
2. An authenticated server helper creates one idempotent `remote_jobs` row.
3. A project-owned CLI runner executes the job on the Mac Studio and emits the existing progress JSON format.
4. `/api/worker/report` stores the result and exposes completion through the existing notification/background-job surfaces.

New actions are `PHOTO_RAW_MATCH`, `PHOTO_RESIZE`, `PHOTO_AI_SELECT`, and `PHOTO_RETOUCH`. They use relative paths only. Absolute paths, traversal, symlinks, overwrite, and source deletion are rejected in code.

The external `~/OliviaWorker/bin/worker.sh` is not edited. Project scripts and the action/CLI contract are completed so the external shell can be connected separately.

## Phase 2 — RAW Matching

### Selection resolution

The selected JPG names are resolved in this order:

1. The latest submitted customer selection associated with the project/hospital.
2. JPG files with an XMP rating of at least one in the SSD2 project.
3. If neither exists, stop and ask for a selection source. Never treat every JPG as selected automatically.

Ambiguous galleries or folders stop before job creation. Multiple explicitly requested projects create independent jobs and independent results.

### Matching and output

The existing basename normalization and matching rules are extracted into a runtime-neutral core. Browser handles and Node paths provide adapters around that core.

The Worker recursively reads RAW files only from the SSD1 project and copies matches into the SSD2 project `Selected_RAW/` output. RAW source files are never moved, renamed, overwritten, or deleted. Duplicate RAW candidates, existing conflicting output, and symlinks require review rather than an arbitrary choice.

The result includes selected count, matched count, missing names, ambiguous names, and an explicit source-RAW-unchanged verification.

## Phase 3 — Resize

The default settings remain long edge 4000px and JPEG quality 95. Chat may override both after validation.

The default input is the SSD2 project's `씬별분류/` tree. Output is a separate `{longEdge}px_Q{quality}` folder below that input and preserves relative subfolders. Source files are read-only and existing output files are never overwritten.

The Node adapter uses the installed `sharp` dependency for decoding/resizing and reuses the existing JPEG metadata restoration logic so EXIF, XMP, ICC, and capture time remain present. Verification checks dimensions, filename set, source immutability, and metadata preservation. Visual equivalence is defined by the same long-edge and quality settings; byte identity with a browser JPEG encoder is not required.

## Phase 4 — AI Selection and Retouch Analysis

### AI selection

The existing local blur, brightness, perceptual-hash, and duplicate representative rules become a shared core. The Node image adapter computes the same inputs with `sharp`.

`PHOTO_AI_SELECT` writes a recommendation manifest and reports under the SSD2 project. It does not move, delete, or rename source JPG files and does not automatically copy RAW files. The manifest records every recommendation and reason so the result is reviewable.

The completion notification opens the existing selection surface with the project/job context already attached. Human confirmation remains required before applying a final selection.

### Retouch analysis

The current Olivia retouch feature analyzes color and produces Photoshop/Camera Raw guidance; it does not apply pixel corrections. `PHOTO_RETOUCH` preserves this behavior. It prepares analysis results for confirmed selected images and writes a manifest/report without modifying the images.

The completion notification opens the existing retouch surface with the job result context. Automated JPEG correction, overwrite, and destructive batch editing are explicitly out of scope.

## Job and Notification Behavior

- One active job per project and action.
- Repeated requests return the existing active/completed job unless the user explicitly confirms a retry.
- Progress uses the existing stages and counters; feature-specific messages describe scanning, analyzing, copying, resizing, and verifying.
- Closing a window does not cancel a Worker job.
- Completion and failure are read from server state, not browser polling timeouts.
- Results link back to the relevant Photo Studio mode and include the project/job identifier.

## Safety and Error Handling

- SSD1 RAW is read-only for every new action.
- Resize, selection, and retouch mutate only new output/report files below `OLIVIA_PHOTO_WORK_ROOT`.
- No automatic cleanup occurs after partial failure.
- Temporary output is finalized only after verification where a file is copied or encoded.
- A conflict returns `REVIEW_REQUIRED`/failed job details; it never triggers overwrite or automatic rename.
- Missing mounts keep source data unchanged and produce an actionable failure.

## Tests

Each phase includes unit and integration coverage for:

- chat tool registration, selection, ambiguity, and job idempotency;
- payload path validation and authorization;
- runner progress and machine-readable results;
- source snapshots before and after execution;
- missing, duplicate, and conflicting files;
- metadata preservation for resized JPEGs;
- completion notification handoff context;
- regression of existing Local Photo Studio and Phase 1 photo pipeline tests.

Final verification runs `npm run typecheck`, `npm test`, and `npm run build`.

## Scope Boundaries

This work does not alter Scene Engine rules, SSD1 Watcher behavior, source JPG merge rules, SSD1-to-SSD2 staging rules, Hermes transport/authentication, or the existing Local Photo Studio entry points. It does not edit the external Worker shell.
