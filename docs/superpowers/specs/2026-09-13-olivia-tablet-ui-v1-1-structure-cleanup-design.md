# Olivia Tablet UI V1.1 — Structure Cleanup Design

## Goal

Keep the existing Tablet Shell navigation, data, and application behavior while removing duplicate chrome and improving touch density. The resulting structure is exactly `Top Bar → Real App Content → Dock`.

## Chosen approach

Use a minimal structural cleanup instead of CSS-only hiding or per-app rewrites. `TabletAppFrame` becomes a content boundary, existing business workspaces stay canonical, and Tablet-specific layout and density are scoped below `[data-olivia-tablet-shell]`.

## Shell structure

- Keep `OliviaTabletShell`, navigation/history, `tabletPreview`, and the existing app registry integration.
- Render one 64px light Top Bar with the Desktop Olivia brand source, the current app title, and the date.
- Remove app Hero/status/description chrome from `TabletAppFrame`.
- Make `appViewport` edge-to-edge between the Top Bar and Dock without shell cards, nested radius, or shell shadow.
- Reserve approximately 86px for the Dock so the app content receives the remaining height.

## Top Bar

- Use `#FAF9F6` or translucent white with a subtle green hairline.
- Reuse `/assets/photoclinic-mark.png`, matching `DesktopTopBar`.
- Home shows the Olivia identity and a short greeting; other apps show a back/home control and one app title.
- Remove mode badges, system labels, app eyebrows, and status terminology.
- Keep only the date and minimal shared controls in V1.1. App-specific actions remain inside the existing workspaces.

## App frame and workspace reuse

- `TabletAppFrame` renders only its children inside a simple full-size boundary.
- Continue dynamically loading the current Clients, Calendar, Documents, Review, Memo, Conti, Quote/Contract, Chat, Channel Analysis, and Brand Diagnosis implementations.
- Do not fork API, state, database, or domain logic.
- Add a lightweight Tablet UI surface signal only where an existing workspace needs to avoid Desktop-specific chrome or density.
- Update `ClientsWindowContent` with an optional `surface` prop; Desktop remains the default and Tablet uses `DesktopWindowProvider` with a false value.

## Tablet touch density

- Scope all density changes to `[data-olivia-tablet-shell]`.
- Target controls at 44px minimum, inputs around 46px, tabs at 44px, and list/table rows around 52–56px where the workspace structure permits.
- Do not use `transform: scale()`.
- Do not modify Desktop or Mobile styles.

## Dock

- Keep all 13 existing apps and registry-backed icons.
- Replace the fixed 13-column grid with a centered horizontal flex strip.
- Keep each Dock item at 66px minimum width, icon tiles at 44–46px, and labels at 10px or larger.
- Use horizontal touch scrolling when the available width is insufficient, especially in portrait.
- Preserve the orange selected-app indicator and avoid selected tile backgrounds.

## Home

- Preserve the existing calendar, todo, document, Conti, Olivia Context, and conversation state sources.
- Replace the large marketing Hero with a compact 70–90px greeting and Olivia Chat action.
- Use an adaptive dashboard grid for schedule, todos, recent documents, recent Conti, and current context.
- Keep the Home page free from horizontal clipping; portrait may adapt between one and two columns.
- Do not introduce fake metrics or data.

## Photo Workspace Remote

- Preserve the Remote Controller concept and disabled send action.
- Remove the interactive connection toggle and all user-facing preview/development terminology.
- Show a compact, non-interactive Mac Studio status row with “연결 준비 중”.
- Reduce the Hero so the tool selection and request form begin immediately below the Top Bar.

## Responsive behavior

- Landscape 1366×1024: 64px Top Bar, approximately 76px Dock, and most height allocated to real app content.
- Portrait 1024×1366: unchanged icon/control sizes; Dock scrolls horizontally rather than compressing.
- Home uses an adaptive grid without horizontal clipping.
- Existing app workspaces retain their own responsive behavior, augmented only by Tablet-scoped density.

## Non-goals

- No feature additions, backend changes, migrations, new app icons, window manager, app-specific business forks, or Desktop/Mobile modifications.
- No automatic Dock hiding in V1.1.
- No real Mac Studio connection or remote execution.

## Verification

- Unit tests cover navigation, all 13 Dock apps, content-only AppFrame, removed Tablet status chrome, and fixed-width scrollable Dock behavior.
- TypeScript, targeted ESLint, full Vitest, and production build must pass.
- Playwright verifies Home and representative workspaces at 1366×1024 and 1024×1366.
- Browser assertions verify no horizontal body clipping, preserved Tablet navigation, and unchanged Desktop/Mobile surface selection.
