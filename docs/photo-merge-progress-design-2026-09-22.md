# Photo merge progress synchronization design

Date: 2026-09-22

## Problem

`PHOTO_PREPARE_SOURCE` moves JPG files successfully, but its progress callback only emits a message. It does not emit `current` or `total`, so `PhotoProjectNotification` renders `0 / N` for the entire merge.

The Mac Studio bridge also queues every per-file progress HTTP request. A merge of hundreds of files can finish on SSD1 while the bridge is still sending hundreds of stale progress reports. The final `COMPLETED` report is delayed until that queue drains, leaving the database and UI in `MERGING` even though the file operation has completed.

Production inspection also found that the NAS can return `JPG전체` in decomposed Unicode form. Direct string comparison then fails to exclude that directory from the source scan, so successfully moved files are mistaken for files left at their original location and verification reports a false failure.

## Chosen design

Use accurate producer-side counts and bounded bridge-side reporting together.

1. Change source preparation progress to a structured object containing `stage`, `current`, `total`, and `message`.
2. Emit `current: 0` before the first rename and increment `current` after each successful rename.
3. Coalesce progress reports in the Mac Studio bridge so that at most one progress request is in flight and only the newest pending snapshot is retained.
4. Flush the newest progress snapshot before the terminal report, without replaying every superseded per-file event.
5. Send the terminal `COMPLETED` report immediately after the bounded flush. The existing server synchronization then changes the project to `MERGE_COMPLETED` or `CLASSIFY_APPROVED`.
6. Compare and resolve the `JPG전체` directory by Unicode-normalized name so SMB/macOS filename normalization cannot invalidate verification or idempotent recovery.

This retains per-file accuracy in the UI while preventing hundreds of network round trips from delaying completion.

## Alternatives considered

- Emit a progress request for every file: accurate but recreates the current completion delay under slow networks.
- Update only at fixed file-count intervals in the runner: simple, but progress responsiveness varies greatly between small and large shoots.
- Update only the UI optimistically: hides the symptom but leaves the database and worker state incorrect.

## Safety and invariants

- JPG relocation behavior remains `rename` only.
- No `copyFile`, `unlink`, overwrite, RAW mutation, or Scene Engine change is introduced.
- A progress report is observational; failure to report intermediate progress must not change file-operation semantics.
- The terminal result remains authoritative.
- A failed terminal report must still surface as a worker/reporting failure; it must not be silently presented as completed.

## Verification

- Source prep progress starts at `0 / total`, advances with each successful rename, and reaches `total / total`.
- The bridge sends a bounded number of progress requests and keeps the latest snapshot.
- Completion is not delayed behind one HTTP request per file.
- Merge synchronization stores the numeric progress and terminal result.
- Existing RAW integrity, conflict, symlink, EXDEV, and idempotency tests continue to pass.
