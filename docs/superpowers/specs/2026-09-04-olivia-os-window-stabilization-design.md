# OLIVIA OS Window Stabilization Design

## Goal

Make every OLIVIA OS application behave as a real floating desktop window. Opening an app must preserve the wallpaper, top bar, dock, and other windows. This pass changes window infrastructure and embedding boundaries only; it does not add Phase 3 features or replace business logic.

## Confirmed interaction policy

- A desktop shortcut opens its app on a single click while also becoming selected.
- The dock opens a closed app, focuses an open app, and restores a minimized app.
- New windows always start with `snapMode: "none"`.
- Snap and maximize happen only after an explicit user action.

## Chosen approach

Use `DesktopSurface`/`WindowLayer` as the single coordinate system and mount reusable feature content inside an isolated `AppWindow` content root.

This is preferred over keeping viewport-fixed windows or masking route-page problems with more global CSS. It preserves one implementation of each feature while removing viewport assumptions from desktop embedding.

## Window coordinate system

- `DesktopSurface` is `position: relative`.
- `WindowLayer` is `position: absolute; inset: 0`.
- `AppWindow` is `position: absolute`, with bounds expressed only in WindowLayer coordinates.
- A measured workspace size is shared with the desktop store using `ResizeObserver`.
- Drag, resize, snap, restore, viewport reconciliation, and maximize use the same measured workspace dimensions.
- Top-bar offsets are not added to surface-local Y coordinates. Dock clearance is represented only as a bottom safe area.
- Maximize fills the usable DesktopSurface area rather than the browser viewport.

## Floating defaults

At open time, each registry default size is capped to roughly 82% of the available workspace width and height. Positioning is centered/cascaded within safe margins, with an initial Y offset below the surface top. A small viewport may reduce a window, but must not force it to fill the viewport.

The existing `max-width: 1023px` rule that assigns nearly full-viewport dimensions is removed. Mobile-specific presentation, when introduced, will remain separate from desktop window geometry.

## Feature embedding

- Clients and Calendar expose reusable workspace content with explicit page/window behavior. Window behavior suppresses route synchronization and viewport-sized wrappers that can navigate away from or escape the desktop.
- Photo Workspace mounts the existing `PhotoWorkspace` feature component directly.
- Review Studio mounts `ReviewStoryWorkspace` directly instead of importing its route page.
- Standalone `/clients`, `/calendar`, and `/photo-sorting` routes remain available and keep using the same feature/business logic.
- The window content root supplies `width/height: 100%`, `min-width/min-height: 0`, internal overflow, stacking isolation, and layout/paint containment. Existing window-local overlays remain clipped to the app window instead of covering the desktop.

## Cursor and pointer safety

- Repository-wide cursor, pointer-lock, fullscreen, pointer-capture, and navigation searches identify the concrete source paths.
- OLIVIA Desktop establishes a native cursor fallback and exits stale pointer lock on mount.
- Header drag and resize handles advertise appropriate cursors.
- Drag/resize interaction always cleans up on `pointerup`, `pointercancel`, and component unmount, including pointer capture, global listeners, text-selection suppression, and temporary cursor state.
- Window control buttons never initiate drag.
- Snap and interaction shields exist only during an active interaction and use explicit pointer-event rules.

## State migration

The persisted desktop state schema version increments from 1 to 2. Version-1 bounds and snap state are not restored. A new authenticated Desktop session starts with no windows; the first app interaction opens one floating window.

## Layering

OLIVIA OS layers use shared constants/tokens: wallpaper, shortcuts, windows, snap preview, top bar, dock, and system overlay in that order. Feature-page z-index values are contained inside the AppWindow stacking context.

## Verification

- Static checks: typecheck, tests, production build, and lint when available.
- Browser checks at 1920x1080, 1728x1117, 1440x900, and 1280x800.
- Verify visible cursor, floating Clients/Calendar/Photo windows, concurrent windows, focus, drag, resize, maximize/restore, minimize/dock restore, no route jump, and no legacy state reopening maximized windows.

## Non-goals

No Finder, new dashboard/sidebar, new agent/chat pipeline, feature redesign, duplicate business logic, or wholesale legacy-route deletion is included.
