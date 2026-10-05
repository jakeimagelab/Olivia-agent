# Desktop Compact Chat and Top Bar Alignment Design

## Goal

Correct three desktop-shell usability issues without creating a second chat UI or changing conversation state:

1. Give the compact Olivia chat bar an explicit control that restores the existing full chat window.
2. Align the compact chat bar vertically with the desktop Dock.
3. Place the status-bar action group at the physical horizontal center of the screen, regardless of the widths of the left and right status-bar groups.

## Current behavior

- Compact chat is the existing `olivia-chat` `AppWindow` rendered with `chatCompact`; it is not a separate conversation component.
- Its current Y coordinate reserves `DESKTOP_DOCK_SAFE_AREA`, placing it above the Dock.
- Its header is hidden, so the compact UI has no visible restore control.
- `.topBarCenter` uses flex growth between unequal left and right groups, so its visual center is not the screen center.

## Design

### Compact chat restoration

- Keep the current single `OliviaConversation` and existing conversation store.
- Render a compact-only restore button inside the compact window, beside the composer.
- The button uses a Lucide expand icon, has a minimum 44-by-44 CSS pixel target, an accessible label, and calls `setChatCompact(false)` while retaining focus on the existing chat window.
- The full window's saved position, size, messages, draft, and session remain unchanged.

### Compact chat Dock alignment

- Keep the compact bar on the right edge.
- Replace the extra Dock-safe-area offset with the Dock's desktop bottom inset, so both surfaces share the same bottom line (`18px` on the normal desktop layout).
- Keep the Dock at its normal screen-centered position in every chat state.
- Measure the rendered Dock width and reduce the compact chat width to fit the free space on the Dock's right, preserving a 12px gap when space allows.
- Preserve a small viewport edge fallback for narrow workspaces and ensure the compact width cannot overflow the workspace.
- The Dock's position, stacking, and interaction behavior do not change.

### Exact top-bar centering

- Position the action group relative to `.topBar` at `left: 50%` with `translateX(-50%)`.
- Left and right status-bar groups keep their existing layout and behavior.
- Add collision protection at narrower widths by reducing nonessential spacing and hiding the centered group only when it cannot fit without overlapping the side groups.
- Screen capture continues to hide the action group via the existing `data-capturing` behavior.

## Scope and compatibility

- No new chat store, message path, API, or window is introduced.
- Existing `Command+/`, top-bar chat action, minimize, close-to-compact, and full chat behavior remain intact.
- Mobile and tablet shells are unchanged.
- No database or Supabase change is required.

## Verification

- Verify the restore button expands the same chat window and preserves its conversation/draft.
- Verify the compact bar shares the Dock bottom line at normal desktop sizes and does not overflow at narrow widths.
- Verify the action group center matches 50% of the viewport at representative desktop widths.
- Verify top-bar controls do not overlap at narrow widths.
- Run targeted tests, TypeScript checking, and lint for changed files.
