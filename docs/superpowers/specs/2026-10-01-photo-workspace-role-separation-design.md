# Photo workspace role separation and safe rename design

## Context observed in the repository

`PhotoWorkspace` is the canonical photo-studio shell, but its former
`raw-match` mode was labelled **T컷 정리** while rendering a nested
**AI 컷 정리 / RAW 매칭** switch.  The legacy `/raw-select` page also mixed
quality filtering, scene naming, RAW source selection, RAW copying, reports,
and duplicate detection.  This made a failure-cut task able to expose and run
RAW work.

The workspace already has a local File System Access API context.  It kept the
active directory, but not selected JPG names; individual tools owned their own
folder state.  The safe rename implementation and generic file transfer layer
already provide copy, size/SHA-256 verification, batch commit, and rollback.

## Approved target boundaries

The canonical workspace has exactly these modes, in this order:

1. 사진 셀렉
2. RAW 매칭
3. 사진 분류
4. T컷 정리
5. 사진 리사이즈
6. 이름변경
7. 사진 보정

`사진 셀렉` only chooses JPGs.  Manual and client selection publish the
selected JPG names to the shared workspace context.  `RAW 매칭` consumes those
names when available and retains its own RAW-source and copy/move choices.
It does not judge image quality.

`T컷 정리` is a separate local JPG-only workspace.  It offers AI and manual
tabs, exposes only eyes-closed, blur, and face-unreadable lighting checks, and
requires the user to select candidates before moving them to `Trash_JPG`.
It never asks for a RAW directory, creates a RAW output directory, names
scenes, or calls RAW-matching code.  The move uses the existing safe
copy/verify/commit transfer helper.

## Current folder and legacy routes

The execution context owns one non-serializable active FSA directory and one
set of selected JPG identifiers.  A tool that chooses a local directory writes
it to that context.  Tools first consume the shared directory; their own
folder-picker remains only as a way to establish or intentionally replace it.

Legacy `/raw-select` resolves to the canonical T컷 mode and `/select-match`
continues to resolve to RAW matching.  The removed combined UI is not rendered
by the canonical workspace.

## Rename behavior

The existing three rename rules remain untouched: sequential template, direct
parent-folder prefix, and direct custom prefix.  The rename surface consumes
the shared directory.  If none exists, it offers one explicit source-folder
picker and publishes its result to the same context.  All modes retain the
existing preflight collision checks and byte-preserving batch
copy → SHA-256 verify → commit behavior.

## Validation

Tests cover mode/tool routing, T컷 candidate classification and destination
plan, Trash_JPG transfer planning, shared-folder handoff, all rename naming
rules, duplicate blocking, SHA mismatch rollback, and menu ordering.  Browser
verification checks the canonical mode tabs and confirms no RAW labels or
folder controls exist in the T컷 surface.
