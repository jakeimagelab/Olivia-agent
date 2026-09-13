# Olivia Tablet UI V1.1 — Structure Cleanup Implementation Plan

1. Add a UI-only Olivia surface context and provide `tablet` from `OliviaTabletShell` without changing surface detection.
2. Simplify `TabletAppFrame` and `TabletAppContent` so applications render directly below the single Tablet Top Bar.
3. Replace the dark system-style Top Bar with the shared Olivia mark, one app title, and the date.
4. Flatten `appViewport`, reclaim vertical workspace height, and add Tablet-scoped touch density rules.
5. Convert the Dock to fixed-size horizontal flex items with touch scrolling and preserved registry icons.
6. Compact Tablet Home into a short greeting row and adaptive live-data dashboard.
7. Make `ClientsWindowContent` surface-aware so Tablet does not claim Desktop window mode.
8. Convert Photo Remote to a compact, non-interactive connection status and remove preview/development copy.
9. Update structural tests, run TypeScript/ESLint/Vitest/build, and verify landscape, portrait, Desktop, and Mobile in Playwright.
