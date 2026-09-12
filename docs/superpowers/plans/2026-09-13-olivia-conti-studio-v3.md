# Olivia Conti Studio V3 Implementation Plan

1. Add and test pure Studio data helpers: state normalization, checklist derivation, schedule derivation, and representative visual resolution.
2. Add the minimal `conti_runs.studio_state` migration and extend canonical services/routes for run patching, clone, Scene duplication, and verified batch reordering.
3. Create one client-side `useContiStudio` controller that loads canonical state once and owns optimistic edits, history, debounced verified autosave, retry, and linkage.
4. Refactor `ContiV2App` to route Stage 1/2/3 around that shared controller rather than letting each view fetch private copies.
5. Extend Stage 1 with the previous-Conti drawer, canonical open/clone, and retained deterministic preview.
6. Build Stage 2 composition with a dominant spreadsheet table and compact checklist/schedule panels; add keyboard navigation, duplicate, delete, undo/redo, manual save, Excel, and print/PDF actions.
7. Rebuild Stage 3 around the shared `ContiSceneCard`, touch-compatible sortable cards, three size presets, tabs, progress, checklist, schedule, and sharing.
8. Update the canonical share page to use the same read-only Scene card renderer.
9. Add container-query styling for Olivia Desktop window sizes and print output.
10. Run focused unit tests, TypeScript checks, full regression tests, production build, and browser verification at desktop and tablet sizes.
