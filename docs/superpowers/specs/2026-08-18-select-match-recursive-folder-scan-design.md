# Select & RAW Match Recursive Folder Scan Design

## Goal

Fix the `폴더 직접 선택` input mode so customer-selected JPG files are discovered regardless of folder naming conventions. Preserve all existing selection, rating, preflight, and RAW matching behavior.

## Current Failure

`loadFolder()` only accepts direct child directories whose names start with `scene` or `씬`. Real customer folders such as `0.개인사진` are skipped, leaving `sceneList` empty even when valid JPG files exist.

## Selected Approach

Recursively scan the selected folder tree and create one existing `SceneFolder` UI group for every directory that directly contains supported JPG files.

- First attempt to resolve a direct `JPG` directory exactly as the current code does.
- If `JPG` exists, scan from it; otherwise scan from the selected directory.
- Scan the starting directory and all descendants without filtering directory names.
- Use the same depth policy as RAW indexing: stop when `depth > 5`.
- Collect files supported by the existing `JPG_EXTS` set.
- Use each file's immediate parent directory name as the group name.
- If files are directly inside the scan root, use that directory's actual name, such as `JPG` or the selected folder name.
- Preserve the immediate parent `FileSystemDirectoryHandle` in each group so existing XMP sidecar lookup continues to work.
- Sort photos within each group and sort groups by name using the existing locale-aware behavior.

## Unchanged Behavior

- Text paste input remains unchanged.
- File upload input remains unchanged.
- `buildRawIndex`, `runPreflight`, and `runMatch` remain unchanged.
- Basename normalization and matching remain unchanged.
- Thumbnail loading, embedded XMP scanning, sidecar rating scanning, automatic rating selection, group cards, and best-cut selection remain unchanged.

## User-facing Copy

Remove instructions that require `JPG/SceneXX` naming. Explain that users may choose a categorized JPG folder and that actual subfolder names become group names.

Replace the empty result message with:

> JPG 파일을 찾지 못했습니다. 폴더를 다시 확인해주세요.

## Error Handling

- A cancelled directory picker keeps the current cancellation behavior.
- An unreadable directory keeps the existing friendly folder-read error.
- Empty directories are ignored.
- If no supported JPG files are found anywhere within the depth limit, the normal empty state is displayed.

## Validation

- Arbitrarily named child folders such as `0.개인사진` are discovered.
- JPG files directly inside the selected folder are grouped under the selected folder name.
- Nested folders are discovered through depth 5.
- Numeric RAW folders continue to match by basename.
- Text paste and file upload modes are unaffected.
- Run targeted tests if an existing suitable test seam exists, then run `npm run typecheck`, `npm test`, and `npm run build`.
- Run `git diff --check` and inspect the final diff to ensure no RAW matching or unrelated UI logic changed.

