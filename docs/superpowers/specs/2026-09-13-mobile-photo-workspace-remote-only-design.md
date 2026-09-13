# Olivia Mobile Photo Workspace — Remote Only Design

## Goal

Expose Photo Workspace from the existing Olivia mobile shell without creating a second photo-processing implementation. Phone users enter from the Home quick menu and use only the existing Mac Studio remote workflow.

## Chosen approach

Add `photo-workspace` as a mobile navigation view and render a small mobile shell adapter around the existing `PhotoWorkspace` and `PhotoStudioExecutionProvider` components.

This approach was selected over:

- Navigating out to the standalone `/photo-sorting` page, which would leave the current mobile shell and introduce inconsistent navigation chrome.
- Rebuilding Photo Sorting as a mobile-only component, which would duplicate the current remote NAS, remote job, progress, and retry logic.

The mobile bottom navigation remains unchanged. The new entry appears in the Home quick menu so the existing five primary destinations stay readable and stable.

## Architecture

### Mobile navigation

- Extend `MobilePrimaryView` and its parser with `photo-workspace`.
- Add a Photo Workspace card to the Home quick menu using the existing Olivia `photo-studio` application icon.
- Render the view through `OliviaMobileShell`, with the normal bottom navigation retained so the user can leave the feature predictably.

### Mobile workspace adapter

Create `MobilePhotoWorkspace` with:

- The existing `MobileHeader` for one consistent mobile app header.
- `PhotoStudioExecutionProvider` as the shared execution and remote-job state owner.
- The existing `PhotoStudioExecutionBar` and `PhotoWorkspace` content.
- A mobile-scoped content boundary for vertical scrolling, safe-area spacing, and touch sizing.

No photo algorithm, NAS browser, remote job API, or worker protocol is duplicated.

### Remote-only enforcement

`usePhotoSourceSurface()` inherits the Olivia mobile surface. Existing `photoSourceModesForSurface("mobile")` returns only `REMOTE_WORKER`, and `resolvePhotoExecutionMode()` therefore ignores a previously stored desktop-local preference.

Consequences on phone:

- The local execution button is not rendered.
- `showDirectoryPicker()` and `FileSystemDirectoryHandle` are never offered through this screen.
- Folder selection opens the existing responsive `RemoteNasBrowser`.
- Photo classification creates and tracks the existing `PHOTO_SORT` remote job.
- Unsupported Photo Workspace tabs keep their existing “Mac Studio remote execution is being prepared” state instead of exposing broken actions.

Desktop and tablet behavior remains unchanged.

## UI behavior

- Home quick menu label: `사진작업실`.
- Mobile feature title: `사진작업실`.
- Status and controls show only Mac Studio remote execution.
- The workspace scrolls inside the mobile viewport; the shell itself remains fixed.
- Existing Remote NAS Browser mobile full-screen behavior, raw relative-path preservation, worker status, progress, and reconnect messaging are reused unchanged.

## Failure and recovery

- Worker offline state continues to disable new remote work through the existing execution context.
- Temporary polling/network errors remain reconnecting states and do not become job failures.
- A stored active remote job ID is restored by the existing provider when the screen is reopened.
- Only a server job with status `FAILED` is presented as failed.

## Testing

1. Mobile navigation parser accepts and round-trips `mobileView=photo-workspace`.
2. Home quick menu opens Photo Workspace inside the mobile shell.
3. Phone surface exposes only `REMOTE_WORKER` even if local mode was previously stored.
4. Remote NAS picker opens and returns its raw relative path.
5. Remote classification can enter queued/running/progress/completed states.
6. Workspace and modal content can scroll on a phone-sized viewport without hiding fixed actions.
7. Existing mobile Home, Calendar, Memo, Documents, Chat, and Voice views still open.
8. Desktop keeps both local and remote modes; tablet remains remote-only.

## Out of scope

- A mobile-only photo-processing engine.
- Local Finder access on phones.
- New remote runners for tools that do not currently support remote execution.
- Backend, database, worker, or remote job protocol changes.
