# Olivia Agent-First Home Design

## Goal

Replace the dashboard-heavy Olivia Home presentation with a simple, light, conversation-first workspace. Preserve all existing routes, database logic, APIs, conversation state, streaming behavior, and adaptive workspaces.

## Desktop Structure

The Home screen has three functional zones:

1. A deep-green navigation sidebar.
2. A flexible central Olivia conversation canvas.
3. An optional right-side context drawer containing today's tasks and recent work.

The right drawer is closed by default on every page entry. Its closed state is not persisted. A compact control in the upper-right opens it, and a close control inside the drawer closes it. Closing the drawer restores the central canvas width.

## Sidebar

Only five primary items are visible:

- 홈 → `/admin/dashboard/home`
- 일정 → `/calendar`
- 고객관리 → `/clients`
- 기록(대화) → `/admin/dashboard/conversations`
- 전체보기(기능) → `/admin/tools`

Individual tool links and Favorites are removed from the primary sidebar presentation, not deleted from the product. Existing feature routes remain available through the tools page.

The sidebar uses the existing Olivia green identity with a deep-green surface, white text, light-mint active state, and minimal borders. The profile area remains at the bottom. Activating it reveals account, settings, and logout actions using existing destinations and sign-out behavior where available.

## Central Home Canvas

The central Home canvas contains only:

1. A small `AI가 함께하는 하루` badge.
2. A compact greeting using the existing user identity presentation.
3. The primary Olivia conversation/composer surface.
4. Four prompt-based Quick Actions.

Mission status, smart suggestions, the embedded calendar, KPI cards, and other dashboard widgets are removed from the Home presentation. Their underlying features and routes remain unchanged.

The Olivia composer is a large white agent surface with a subtle low-saturation gradient hairline, generous radius, restrained shadow, and no strong glass or neon effect. Existing messages, streaming, sending, cancellation, conversation persistence, and workspace transitions continue to use the current `useOliviaConversationStore` and `useOliviaLayoutStore`.

## Prompt Actions

Four actions appear below the composer:

- 업무 요청하기
- 정보 찾아보기
- 보고서 생성
- 일정 확인

Each action includes a light icon, title, and short description. Clicking it sends or stages a natural-language prompt through the existing Olivia conversation path instead of navigating directly to a feature page.

## Right Context Drawer

The drawer contains two stacked cards:

### 오늘 할 일

- Reuses `HomeDashboardDataProvider` data.
- Shows at most five tasks.
- Supports the existing optimistic completion toggle.
- Links to the full Calendar page.

### 최근 작업

- Reuses the existing recent-work source and project/customer links.
- Shows at most five items.
- Links to the appropriate existing customer or project destination.

The drawer opens beside the central canvas on large desktop screens. It uses transform and opacity animation over 150–250ms. When an Olivia workspace opens, the drawer closes so the workspace remains the primary task surface.

## Header

Home uses a minimal utility area rather than a full global admin header. It exposes the drawer trigger and reuses existing search or notification controls only when they fit without duplicating navigation. No new backend search or notification system is introduced.

## Responsive Behavior

- Desktop: deep-green fixed-width sidebar, flexible center, optional adjacent right drawer.
- Tablet: collapsible sidebar and overlay right drawer.
- Mobile: existing mobile header/menu behavior, conversation-first content, and a full-width right drawer. No desktop three-column squeeze is used.

## Visual System

- Pretendard remains the font.
- Main background is white or `#FCFDFC`.
- Deep green is concentrated in the sidebar.
- Light mint and neutral gray support the central canvas.
- Orange is limited to the Olivia mark, notification dot, send control, and important statuses.
- Cards are solid or nearly solid white with subtle borders and diffuse shadows.
- Motion is limited to drawer slide/fade, restrained hover feedback, chat loading, and existing agent state transitions.

## Unchanged Systems

- Supabase and all existing schemas
- Customer and project data
- Quote, contract, conti, workflow, calendar, photo, video, and content tools
- Existing APIs, authentication, authorization, routes, Agent functions, and conversation persistence
- Adaptive Workspace and fullscreen behavior

## Validation

- Home shows only the five sidebar items.
- Right drawer is closed on initial entry and opens only after user action.
- Closing the drawer restores central width.
- Quick Actions enter the Olivia conversation path rather than navigating directly.
- Existing conversation messages remain intact while opening and closing the drawer or workspace.
- Opening a workspace closes the drawer.
- Task completion and recent-work navigation still function.
- Desktop, tablet, and mobile layouts have no clipping or overlapping controls.
- Run `git diff --check`, `npm run typecheck`, `npm test`, and `npm run build`.
- Validate the primary Home flow in a real browser against the supplied reference image.

