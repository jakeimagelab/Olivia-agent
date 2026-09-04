# OLIVIA OS Reference Layout Design

## Goal

Rebuild the authenticated OLIVIA OS desktop shell to match the approved reference image as closely as practical. The work changes visual hierarchy, proportions, spacing, and system-chrome behavior while preserving the existing App Registry, Window Manager, feature adapters, authentication, APIs, stores, and Olivia conversation engine.

This pass does not redesign app icons or introduce a new visual language. The approved reference and the existing Olivia deep-green, mint, warm-white, and orange palette are the only visual sources of truth.

## Selected Approach

Keep the existing Window Manager and feature adapters, but replace the freeform shortcut-first desktop composition with a reference-driven three-zone shell:

1. a compact left utility rail,
2. a central floating-window workspace,
3. an always-mounted Olivia system-assistant panel.

The Dock remains centered at the bottom and overlays the desktop safe area. This approach avoids duplicating feature UIs, keeps multi-window behavior intact, and makes Olivia persistent without maintaining it as an ordinary app window.

Rejected alternatives:

- Overlaying widgets on the current full-surface desktop would preserve too much of the prototype composition and create inconsistent window bounds.
- Building a separate dashboard page would duplicate navigation and violate the canonical Desktop → Window Manager → AppWindow → Feature Content architecture.

## Desktop Geometry

At 1920×1080, the shell uses the following target geometry:

- Top bar: 46px high.
- Main desktop inset: 20–24px from the viewport edges below the top bar.
- Left utility rail: 240–260px, target 248px.
- Right Olivia panel: 360–400px, target 380px.
- Horizontal gaps: 18–22px, target 20px.
- Dock safe area: 104–116px, target 110px.
- Central workspace: all remaining width, with AppWindow bounds measured relative to this workspace.

The wallpaper remains visible through the gaps around windows and panels. The background asset may be switched through the approved wallpaper control, but the current Olivia wallpaper remains the default.

At widths below 1280px, the layout retains the current floating-window mobile/tablet fallback: the left widgets become unavailable or compact, the assistant becomes a collapsible overlay panel, and the central window workspace keeps priority. No legacy dashboard is restored.

## Left Utility Rail

The left rail contains exactly three reference-style widgets:

### Today Schedule

- Source: existing `/api/dashboard` `todayTasks` data.
- Shows time, title, and compact category/location metadata for the next few schedule items.
- Clicking an item opens or focuses the Calendar AppWindow through `openApp`; it does not navigate to `/calendar`.
- Loading, empty, and error states are compact and do not change widget height abruptly.

### Today Tasks

- Source: existing `/api/dashboard` `workspaceTodayTasks`. When that list is empty, show an honest empty state rather than mixing schedule entries into the task list.
- Uses the existing dashboard provider's shared request and calendar completion mutation.
- Completion controls retain optimistic updates and existing API behavior.
- The visible list is capped, with an action that opens the Calendar AppWindow for the full view.

### Recent Work

- Source: existing `/api/admin/recent-activity`.
- Reuses the existing activity semantics and relative-time display without importing legacy dashboard chrome.
- Displays only a compact recent subset.

The three widgets share one data provider where possible to avoid duplicate network requests. They are desktop utilities, not AppWindows, and cannot overlap the central WindowLayer.

## Central Window Workspace

The existing `AppWindow`, `WindowHeader`, drag, resize, snap, minimize, restore, and focus logic remains the source of truth. The WindowLayer is moved into the central workspace so its coordinate system excludes the persistent left rail and Olivia panel.

- New apps still open only after user action.
- No app is automatically maximized or snapped.
- Default sizes continue to come from the App Registry and are clamped to the new central workspace.
- Maximize means filling the central usable workspace while leaving the Top Bar, Olivia panel, left widgets, and Dock accessible.
- Multiple windows remain supported.

Desktop shortcuts are removed from the primary layout because the approved shell uses the left space for information widgets. App entry remains available through the Dock and All Apps control.

## Olivia System Assistant

Olivia is removed from Desktop shortcuts and Dock output. Its Registry definition remains only as a compatibility descriptor for existing action mappings, but it is filtered from all user-facing app launchers and never creates an `AppWindow`.

An `OliviaSystemPanel` is always mounted on authenticated OLIVIA OS routes and owns a high-priority `OliviaChatDockTarget`. The existing singleton `OliviaConversation` continues to portal into this target, preserving conversation history, input state, tools, and action execution.

Panel behavior:

- Expanded by default on desktop.
- Collapsible to a narrow system-assistant rail and restorable without unmounting the conversation.
- Orange Olivia identity is retained in the panel mark and key assistant accents.
- The panel shows the active app and active client context using the existing desktop context bridge and context store.
- It cannot be closed as an ordinary window.
- It remains visible while other apps open, focus, minimize, maximize, or snap.

## Dock

The Dock keeps the existing App Registry as its source of truth and preserves open/focus/minimize/restore behavior.

- Olivia is excluded.
- Stable primary apps remain visible.
- The Dock is centered inside the available desktop width rather than the entire viewport so it visually aligns with the central workspace.
- Existing icon assets and `AppIcon` rendering are preserved; icon redesign is explicitly out of scope.
- A system utility group exposes Memo, All Apps, and Wallpaper without pretending they are primary Registry apps.

## Memo, All Apps, and Wallpaper

### Memo

The Memo control opens the existing memo capability in an AppWindow through a window-safe adapter extracted from `app/memo/page.tsx`. The standalone `/memo` route renders that same workspace in page mode. No full-page navigation occurs from the Desktop utility.

### All Apps

All Apps is a compact system overlay populated directly from `oliviaAppRegistry`. Selecting an entry calls `openApp` and closes the overlay. It does not maintain a second app list.

### Wallpaper

Wallpaper opens a small system popover containing only existing approved Olivia wallpaper assets. Selection persists locally and changes the wallpaper layer class or asset URL. No generated wallpaper or unrelated visual theme is added.

## Header Menu Behavior

The existing compact Top Bar remains 46px high and matches the reference density. Menu labels become functional through small anchored menus:

- File: open All Apps and close the active app window.
- Edit: exposes only safe actions supported by the active content; unsupported items remain disabled.
- View: show desktop, restore windows, and wallpaper.
- Go: focus/open primary Registry apps.
- Tools: Memo and system utilities.
- Help: concise keyboard/window guidance.

Search continues to be visually present but is not expanded into a new global-search project in this pass. Notification counts and connection state are never fabricated.

## State and Data Flow

- `HomeDashboardDataProvider` fetches dashboard data once and supplies Today Schedule and Today Tasks.
- Recent Work keeps its existing recent-activity endpoint, with its visual surface adapted to the new rail.
- Dock, All Apps, and header app commands resolve app metadata from `oliviaAppRegistry` and call the existing desktop store.
- `OliviaSystemPanel` registers the chat dock target. `OliviaWorkspaceShell` continues to own the single conversation instance.
- The existing effective-active-app and client context stores provide the panel context label.
- Wallpaper and assistant collapsed state use versioned local-only preferences and do not alter business data.

## Error and Empty States

- Widget API failures show a single quiet retry affordance inside the affected widget.
- Empty schedule/task/activity data uses honest empty copy; no fake entries are rendered.
- If the Olivia conversation endpoint is unavailable, the existing conversation error handling remains visible within the persistent panel.
- Popovers close on Escape and outside click and do not leave viewport-sized pointer-blocking overlays mounted.

## Testing and Acceptance

Automated checks:

- TypeScript typecheck.
- Existing unit tests, plus focused tests for Registry filtering and shell utility behavior where practical.
- Production build.

Browser QA at 1920×1080, 1728×1117, 1440×900, and 1280×800:

- Compare the approved reference and the actual screenshot side by side.
- Check Top Bar height, rail/panel widths, gutters, central workspace proportion, Dock alignment, and wallpaper exposure.
- Verify all three widgets render loading, empty, and populated states without layout jumps.
- Verify opening two apps preserves both windows and the permanent Olivia panel.
- Verify maximize stays inside the central workspace.
- Verify Olivia is absent from Dock/shortcuts and remains usable after collapse/expand.
- Verify active app/client context updates without resetting the chat.
- Verify Memo, All Apps, Wallpaper, and Header menus open and close correctly.
- Verify existing standalone routes and feature adapters still work.

The layout is accepted only after at least one screenshot-comparison correction pass. Visual changes are limited to matching the approved reference; no new dashboard cards, icon system, navigation shell, or decorative style is introduced.
