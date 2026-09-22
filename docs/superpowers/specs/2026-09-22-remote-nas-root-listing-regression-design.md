# Remote NAS Root Listing Regression Fix

## Goal

Restore top-level Workstation browsing after the repository worker was installed. A `LIST_FOLDER` request whose `remote_path` is missing or an empty string must mean the configured `SOURCE_ROOT`, while absolute paths and traversal remain rejected.

## Confirmed causes

- The repository bridge introduced in `5790fba6` reads `remote_path` through a required-string helper. That helper treats `""` as missing, although `normalizeRemoteNasRelativePath("")` intentionally represents the NAS root.
- Installing `e806b6f9` activated this bridge code and exposed the existing mismatch. `e806b6f9` did not itself add the required-string check.
- The 21:00 source-preparation failure is a separate, confirmed Unicode issue. The worker log contains decomposed paths such as `JPG전체`. The pre-`e806b6f9` source walk compared that value directly with NFC `JPG전체`, recursed into the destination, and then failed final verification.
- `e806b6f9` fixes that underlying verification cause by comparing names in NFC and resolving the real on-disk destination spelling. It also reports numeric merge progress and coalesces progress requests; it is not merely a UI-state override.

## Design

### Request contract

For `LIST_FOLDER` only:

- omitted `remote_path`, `null`, and `""` map to `""`, meaning `SOURCE_ROOT`;
- a string relative path continues to mean a descendant of `SOURCE_ROOT`;
- non-string non-null values remain invalid;
- absolute paths, backslashes, NUL characters, `.` and `..` segments remain invalid.

The API route and Mac Studio bridge will enforce the same contract so a caller cannot pass one layer and fail at the other.

### Worker behavior

`listFolder()` will read `remote_path` as optional and default it to `""` before passing it to `normalizeRemoteNasRelativePath()`. Existing root containment, `realpath`, symlink, and read-only listing behavior stays unchanged.

### API behavior

The remote-jobs POST route will default an omitted or null `remote_path` to `""`. It will still reject non-string values and will continue to reduce the worker payload to the approved `LIST_FOLDER` fields only.

### Unicode handling

No new path normalization will be added to NAS navigation. Raw NFD path segments returned by SMB must continue to round-trip unchanged; NFC normalization remains display/comparison-only. The existing `e806b6f9` source-preparation fix will receive an explicit regression assertion so a decomposed `JPG전체` directory is excluded from source candidates and final verification succeeds.

## Tests

- API accepts omitted, null, and empty `remote_path` and queues `remote_path: ""`.
- Bridge lists `SOURCE_ROOT` for omitted and empty `remote_path`.
- Bridge still rejects non-string, absolute, and traversal paths.
- NFD raw child paths remain unchanged through remote folder listing.
- Source preparation with decomposed `JPG전체` completes without treating its files as unmoved source files.

## Non-goals

- No NAS mutation is added to `LIST_FOLDER`.
- No weakening of source-preparation collision, symlink, RAW-integrity, or EXDEV guards.
- No change to photo project status merely to hide a worker failure.
- No modification of unrelated quote/PDF work currently present in the worktree.
