# Olivia Remote Photo Sort Runner Design

## Scope

Build a standalone Node.js runner for the existing field-photo classification flow used by `PhotoSortingWorkspace.handleFieldSort`. The runner executes on Mac Studio without browser APIs and produces the same core folder structure and reports from a protected working copy.

This version supports `shooting_mode: "field"` only. A `studio` request must fail explicitly. It does not modify the external Mac Studio worker shell or connect the runner to `worker.sh`.

## Existing Logic Reused

The runner reuses the existing classification modules instead of defining a new algorithm:

- EXIF timestamp parsing and mtime fallback
- stable capture-time ordering
- hard-gap candidate segments
- local visual boundary candidates
- department-specific precise settings
- boundary feature weights and decisions
- minimum-scene stabilization
- purpose-transition sampling
- Scene construction and folder naming rules
- department configuration and scene labels
- quality thresholds and profile-exclusion policy where their options are enabled

The browser workspace remains unchanged. Shared logic is extracted only where both the existing API routes and the Node runner need the same AI analysis implementation.

## Execution Modes

### Production staging

```text
--source-folder 0913_BLS_GN2
```

The argument is a relative folder under the fixed NAS root. The runner resolves the source, verifies containment under `/Volumes/Workstation(M.2SSD)`, requires a new destination under `/Users/jakemacstudio/Desktop/Olivia_Work_Test`, copies the folder, verifies the copy, then classifies only the destination.

### Existing work-copy test

```text
--work-folder /Users/jakemacstudio/Desktop/Olivia_Work_Test/0913_BLS_GN2
```

This mode never reads from the NAS. The path must resolve inside the fixed work root, must already exist, and must look unprocessed. It is intended for the manually copied test folder named by the user.

The legacy example flag `--source` is accepted as an alias for `--work-folder` so the documented test command remains usable. Its value must still resolve inside the work root.

Exactly one execution mode must be supplied.

## Safety Boundary

Path safety is enforced before scanning or writing:

1. The CLI uses fixed NAS and work-root constants. Internal functions accept injected roots only from automated tests; production CLI flags and environment variables cannot replace these roots.
2. Production input is normalized as a relative path. Absolute paths, empty root selection, `.`/`..`, NUL bytes, and containment escapes are rejected.
3. Existing roots and sources are resolved through filesystem canonical paths. A not-yet-created destination is checked against the canonical work root and its canonical parent before creation. The source must remain under the source root and the destination under the work root.
4. The source tree is exposed to the staging layer only. The classification and organization layers receive only the work-folder path.
5. Destination creation uses exclusive semantics. An existing destination is an error; no overwrite or merge is attempted.
6. Existing `RAW`, `JPG`, `SELECT`, or `REPORT` output directories in test mode are treated as an already-started run and fail the preflight.
7. All write helpers assert work-root containment on every destination and deletion target.
8. Files are copied with no-clobber behavior, size-verified, journaled, and only then removed from their original location inside the work copy.
9. Nothing in the implementation exposes delete, move, rename, mkdir, or write operations for SOURCE_ROOT.

If staging or classification partially fails, the NAS remains untouched. The working copy and operation journal remain for diagnosis; the runner does not claim success.

## Architecture

### CLI

`scripts/remote-photo-sort-runner.ts` parses CLI options, validates the supported mode and payload fields, invokes the orchestration service, prints progress to stderr, and emits exactly one machine-readable JSON result to stdout.

### Orchestrator

A Node-only orchestration module performs:

1. safety preflight;
2. optional NAS-to-work staging;
3. work-copy scanning;
4. feature extraction and Scene classification;
5. automatic acceptance of the resulting Scene plan;
6. work-copy organization and report writing;
7. result verification and summary generation.

### Filesystem adapter

The Node filesystem adapter replaces `FileSystemDirectoryHandle`, `FileSystemFileHandle`, and browser `File` operations. It uses filesystem paths internally and never fabricates browser handles.

### Image adapter

The existing `sharp` dependency decodes and resizes JPG data. Its RGBA pixels are passed through the same dHash, histogram, background-grid, composition-grid, brightness, and Laplacian quality calculations used by the browser implementation. No placeholder feature vectors are allowed. Decode failures are reported and use the existing explicit AI/local fallback behavior rather than invented image values.

### AI analysis adapter

Purpose scan, boundary analysis, Scene classification/naming, and optional profile analysis are moved behind server-only functions. Existing API routes and the runner call those functions so prompts, schemas, model selection, department rules, and fallback behavior remain aligned.

The runner requires the corresponding AI key only when the requested option actually needs that analysis. AI errors are recorded. Boundary fallback uses the existing `decideBoundary` behavior; profile failures leave the file in its Scene, matching the browser's conservative behavior.

## Classification Flow

1. Scan only root-level files in the work copy.
2. Separate supported RAW and JPG extensions using the existing extension sets.
3. Read JPG capture timestamps from EXIF; fall back to mtime and record warnings.
4. Stable-sort JPG files by timestamp and natural filename.
5. In fast mode, build Scene groups from the configured time gap.
6. In precise mode, extract real visual features, build candidates, run purpose-transition and boundary analysis, decide boundaries, and stabilize short scenes.
7. Construct Scene names using existing occurrence-order rules. When AI naming is enabled, use the existing scene-analysis naming output.
8. Since no browser review UI exists, automatically accept the generated Scene plan. Every boundary that would have required review remains marked in reports.
9. Organize the work copy only after the complete plan exists.

## File Organization

The initial execution creates:

```text
<work folder>/
  RAW/
  JPG/
    <scene folders>/
  SELECT/
    JPG_SELECT/
  REPORT/
```

Root-level RAW files move into `RAW/` inside the work copy. Root-level JPG files move into their planned Scene folders under `JPG/`. Empty `SELECT/JPG_SELECT` is prepared for the later manual selection workflow.

Reports include the operation journal, boundary decisions, Scene summary, warnings, effective options, and final counts. Optional quality/profile passes create their existing report/output structures only when enabled.

The runner does not perform RAW SELECT matching because the newly created `JPG_SELECT` folder is initially empty and the browser workflow performs that step only after a human selects JPG files.

## Payload and CLI Mapping

The runner accepts the existing `PHOTO_SORT` fields:

- `source_folder`
- `shooting_mode`
- `department`
- `gap_minutes`
- `classification_ui_mode`
- `fast_analyze_mode`
- `department_logic_enabled`
- `ai_naming_enabled`
- `quality_analysis_enabled`
- `profile_classification_enabled`

CLI flags map to the same option object. Unsupported fields are not invented. Invalid department values, non-positive gaps, and unsupported shooting modes fail before any write.

## Output Contract

Success emits:

```json
{
  "ok": true,
  "status": "COMPLETED",
  "sourceFolder": "0913_BLS_GN2",
  "workFolder": "/Users/jakemacstudio/Desktop/Olivia_Work_Test/0913_BLS_GN2",
  "fileCount": 1234,
  "sceneCount": 18,
  "durationMs": 123456
}
```

Failure emits one JSON object with `ok: false`, `status: "FAILED"`, and a safe error message, and sets a nonzero process exit code. Operational logs go to stderr so Worker integration can parse stdout reliably.

## Error Handling

- Preflight failures make no writes.
- Existing destination or output structure is a hard failure.
- Copy verification failure stops before classification.
- Individual image decode/AI issues are reported according to existing fallbacks.
- Any organization failure stops the run, records the failed operation, and returns `FAILED`.
- A completion result is emitted only after output folders, expected file counts, and the operation journal are verified.

## Tests

Automated tests use temporary directories, never the NAS or the named production/test folder. They cover:

- relative-path traversal and absolute-path rejection;
- source/work containment, including symlink escapes;
- existing destination refusal;
- existing output-folder refusal;
- staging copy preservation and no-clobber behavior;
- real small JPG feature extraction with `sharp`;
- timestamp sorting and Scene grouping through reused core logic;
- work-copy-only organization;
- operation journal and result JSON;
- unsupported studio mode failure;
- CLI output/exit behavior where practical.

Validation runs the focused tests, `npm run typecheck`, `npm run lint`, and `npm run build`. The actual NAS and `/Users/jakemacstudio/Desktop/Olivia_Work_Test/0913_BLS_GN2` are not executed during implementation.

## Known Functional Difference from Browser Flow

The browser pauses for a human to approve, merge, split, or rename Scenes before moving files. The headless runner automatically accepts the stabilized result and records review-required boundaries. Manual JPG selection and subsequent RAW SELECT matching remain later human-driven steps. Studio sorting is outside this version.
