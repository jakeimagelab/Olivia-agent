# Olivia Tablet Shell V1 Implementation Plan

1. Expand adaptive surface detection to `mobile | tablet | desktop` while preserving `shouldUseOliviaMobileSurface()`.
2. Add development-only `tabletPreview=1` routing and independent HTML surface classes.
3. Define pure Tablet app/navigation metadata using existing registry IDs and icon sources.
4. Build the full-screen Tablet shell, top bar, persistent dock, query-backed history, and lazy app content boundary.
5. Build a Tablet Home from existing Calendar, Todo, Documents, Conti, Olivia context, and conversation sources.
6. Reuse current embedded workspaces for Customer, Calendar, Documents, Chat, Review, Memo, Quote, and Contract.
7. Embed the existing Channel Analysis and Brand Image Diagnosis routes without adding functionality.
8. Add disabled AI Voice and non-executing Mac Studio Photo Remote presentation screens.
9. Add unit tests for surface rules, navigation, and registry icon mapping.
10. Run TypeScript, lint, targeted/full tests, production build, and Playwright landscape/portrait checks.
