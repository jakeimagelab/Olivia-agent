# Olivia Tablet Shell V1 Design

## Scope

Add a third adaptive surface for iPad Pro 12.9/13-inch devices without changing the existing Desktop or Mobile shells. Tablet uses the same Olivia features and data with a touch-first, full-screen navigation shell. It does not use the Desktop window manager and does not add backend capabilities.

## Surface selection

`resolveOliviaSurface()` is the single three-way resolver. Preview overrides are development-only at the adaptive root. Mobile keeps its current compatibility function and behavior. Tablet is selected for coarse-pointer viewports wider than 900px; fine-pointer desktop browsers remain Desktop at the same dimensions.

## Shell and navigation

`OliviaTabletShell` owns only `activeApp` navigation. The current app is stored in the `tabletApp` query parameter so browser back/forward works. An always-visible bottom dock uses the existing Olivia registry icons and shared `AppIcon`/`CalendarAppIcon` renderers. App content replaces the full central surface; no window, resize, drag, traffic-light, or Desktop window-store code is used.

## Feature reuse

- Customer, Calendar, Documents, Review Studio, Memo, Quote, and Contract reuse their existing embedded workspace adapters.
- Olivia Chat reuses the single canonical conversation instance through a Tablet dock target.
- Channel Analysis and Brand Image Diagnosis reuse existing routes in same-origin embedded frames.
- Tablet Home reads current Calendar, Todo, Documents, Conti, Olivia context, and conversation state. Missing data renders an empty state; it never creates sample business data.
- AI Voice is an explicitly disabled V1 surface.
- Photo Workspace is a remote-controller presentation only. Its categories mirror existing Desktop photo tools, but no command is sent and no completion is claimed.

## Visual system

The shell uses Olivia ivory, white, deep green, mint, and a single orange primary accent. It is designed around 44px minimum touch targets, an airy structural layout, low-contrast hairlines, and a centered translucent dock. Landscape uses denser master/detail reuse; portrait allows existing feature workspaces to reflow or scroll inside their own content area.

## Performance and isolation

Every heavy feature is loaded dynamically only after selection. Tablet-only styles and modules are not imported by Desktop or Mobile bundles beyond the adaptive dynamic-import boundary. The shell does not subscribe to the Desktop window store.

## Validation

Unit tests cover all requested surface dimensions and preview priorities, Tablet navigation URL parsing, and icon-source mappings. TypeScript, lint, targeted tests, full regression tests, and production build must pass. Browser QA covers app switching and screenshots at 1366×1024 and 1024×1366.
