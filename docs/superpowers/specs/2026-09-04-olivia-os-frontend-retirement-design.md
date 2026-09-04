# OLIVIA OS Pre-Phase 3 Frontend Retirement Design

Date: 2026-09-04

## Objective

Make `/` the only canonical user-facing entry point and make OLIVIA OS Desktop the only post-login frontend. Retire the legacy Dashboard and Agent-first Home from normal navigation without deleting their reusable business logic, APIs, stores, services, or feature components.

## Current State

- `app/page.tsx` is 1,318 lines. Its final 15 lines implement the active authentication-to-Desktop flow; the rest is legacy Dashboard and mobile Dashboard UI.
- `app/admin/dashboard/home/page.tsx` renders the Agent-first Home through `OliviaAdaptiveStage`.
- `app/desktop/page.tsx` renders a second `OliviaDesktop` entry point.
- `app/layout.tsx` globally mounts legacy chrome: `GlobalFeatureSidebar`, `OliviaWorkspaceShell`, `BackgroundJobsWidget`, `GlobalClientContextBridge`, `OliviaPageTransition`, splash, and cursor effects.
- `GlobalFeatureSidebar` already avoids `/` and `/desktop`, and `OliviaWorkspaceShell` avoids both OS routes, but this behavior is spread across components. `BackgroundJobsWidget` has no route-level OS exclusion.
- `components/olivia-os/registry/oliviaAppRegistry.ts` defines app identity, title, icon, route, window size, and content adapter.
- `DesktopSurface.tsx` and `DesktopDock.tsx` maintain separate hardcoded app-ID arrays, so visible navigation is not yet fully registry-driven.
- Customer, calendar, photo workspace, documents, review, and Olivia have real window content adapters. Quote, contract, and conti currently use placeholders.
- Legacy feature routes such as `/clients`, `/calendar`, and `/photo-sorting` remain functional and depend on existing global layout behavior.

## Selected Approach

Use a route-aware global chrome boundary and registry visibility metadata while leaving existing route groups and feature routes in place.

This is preferred over moving all pages into new route groups because it avoids a high-risk migration across roughly 130 page routes. It is preferred over CSS-only hiding because hidden legacy components would still mount, fetch data, and create overlapping interactive surfaces.

## Canonical Routes

### `/`

`app/page.tsx` remains a client component because the current login and passkey flow is client-driven. It contains only:

1. authentication status checking through the existing `/api/auth/check` endpoint;
2. the existing login/passkey UI for unauthenticated users;
3. `OliviaDesktop` for authenticated users.

No Dashboard cards, pipeline, legacy tool grid, old mobile Dashboard, or legacy application modal remains in this file.

### `/desktop`

The page becomes a server redirect to `/` using `redirect()` from `next/navigation`. This produces a replace-style canonical redirect and avoids a back-button loop.

### `/admin/dashboard/home`

The page becomes a server redirect to `/`. Authentication is not duplicated here. An unauthenticated visitor lands at `/` and sees the existing login screen; an authenticated visitor sees OLIVIA OS Desktop.

Other `/admin` pages, including security and team settings, remain intact.

## Global Chrome Boundary

Introduce one small client boundary owned by the root layout. It determines whether the current pathname is an OLIVIA OS route.

On `/`, it must not mount legacy user-facing chrome:

- `GlobalFeatureSidebar` / `AdminSidebar`;
- global `OliviaWorkspaceShell` and its floating chat controls;
- `BackgroundJobsWidget` floating UI;
- legacy page transition wrappers that alter Desktop presentation;
- global client-context UI that can float above the Desktop.

The Desktop itself owns the full visual surface: Desktop Top Bar, Desktop shortcuts, AppWindow headers, and Dock. Global providers or nonvisual bridges may be preserved only when they have no visible output and are required by window adapters.

Legacy standalone feature routes retain their current global layout and sidebar as a compatibility layer. Public or standalone routes such as client portal, team-chat login/invite, remote prompter, and share routes keep their existing exclusions.

The splash and cursor effects are evaluated separately. Any effect that visibly overlays the post-login Desktop is disabled for the OS route. The login screen may retain its current visual treatment, but the authenticated Desktop initial state must show only OS-owned UI.

## Desktop Registry as Source of Truth

Extend each app definition with optional presentation metadata rather than maintaining app-ID lists in Desktop components. The registry owns:

- app ID;
- title and icon;
- window content component;
- canonical legacy route, when one exists;
- default and minimum window size;
- singleton behavior;
- Desktop shortcut order;
- Dock order.

`DesktopSurface` derives shortcuts from shortcut-order metadata. `DesktopDock` derives fixed Dock apps from dock-order metadata and may append running apps that are not fixed. Window title and content continue to come from the same registry entry. All clicks call `openApp`; fixed Desktop navigation does not use full-page route navigation.

Approved visible set:

- Desktop shortcuts: customer, calendar, photo workspace, documents, Olivia;
- Dock: customer, calendar, photo workspace, documents, review content, Olivia.

Quote, contract, and conti remain registered so their identity, route compatibility, and future adapters are preserved. Because their current OS content is placeholder-only, they are hidden from the default Desktop and Dock during stabilization.

`lib/toolNav.ts` remains in place for legacy navigation and Olivia natural-language feature resolution. It is no longer a source for Desktop-visible navigation.

## Window Adapters and Duplicate Headers

Existing adapters remain the boundary between legacy feature implementations and AppWindow. Each adapter imports feature content directly without importing its route layout.

For customer, calendar, photo workspace, documents, review content, and Olivia:

- AppWindow supplies the app-level window header;
- DesktopTopBar supplies the system-level header;
- embedded content must not render `GlobalFeatureSidebar`, a legacy admin header, a standalone page header, a footer, old mobile navigation, or a floating Olivia/FAB control;
- scrolling occurs inside the AppWindow content body.

If a feature already exposes an embedded variant or header-action provider, the adapter uses it. Otherwise, narrowly scoped adapter styling or a small explicit embedded prop is preferred over global CSS hiding.

## Mobile Behavior

OLIVIA OS remains the mobile fallback; the legacy mobile Dashboard is removed. Below the existing mobile breakpoint, an opened AppWindow is constrained to the usable viewport and presented nearly full-screen beneath the Desktop Top Bar, with the Dock remaining usable. Window dragging/resizing controls that do not make sense on touch may be suppressed, but app selection and close/minimize behavior remain available.

## Scrolling and CSS Isolation

The Desktop root remains fixed to the viewport with `height: 100dvh` and `overflow: hidden`. The OS route also prevents document-level vertical scrolling so global `html`, `body`, and layout wrappers cannot create an outer page scrollbar. AppWindow bodies keep `overflow: auto`.

Legacy Dashboard CSS is removed only when repository-wide search confirms that a selector has no remaining consumers. Shared styles used by login or compatibility routes stay. CSS cleanup is secondary to removing unused React code; no broad global selector is deleted solely because its name appears legacy.

## Deletion and Preservation Rules

Delete from `app/page.tsx` after repository-wide reference verification:

- legacy Dashboard component and panel;
- tool grid and cards;
- workflow strip;
- today-task and workspace-task widgets;
- marketing, stalled-work, recent-activity, and daily-idea Dashboard cards;
- legacy mobile tool grid;
- old full-page app modal;
- types, constants, helpers, and imports used only by those components.

Preserve:

- login and passkey flows;
- auth, logout, and session endpoints;
- all APIs and Supabase/data services;
- stores, agent logic, action routing, and tool executors;
- reusable customer, calendar, photo, documents, quote, contract, conti, review, and Olivia components;
- `OliviaAdaptiveStage` and its reusable conversation/tool logic;
- `lib/toolNav.ts` and legacy feature routes.

No file or export is deleted until static imports, dynamic imports, route imports, and barrel exports have been searched repository-wide.

## Data Flow and Failure States

The existing root authentication flow remains authoritative:

1. root renders a neutral checking state;
2. `/api/auth/check` succeeds with authenticated status: render Desktop;
3. it succeeds without authentication or fails: render Login;
4. password or passkey succeeds: update root state and render Desktop without routing to a legacy page;
5. logout returns to the unauthenticated root state using the existing endpoint behavior.

Redirect routes contain no authentication or data fetching. Window adapters keep their current loading and error boundaries. This stabilization does not change API contracts or persistence schemas.

## Verification

Automated verification:

- add focused tests for registry-derived shortcut and Dock membership where practical;
- verify `/desktop` and `/admin/dashboard/home` are server redirects to `/`;
- run `npm run typecheck`;
- run `npm test`;
- run `npm run build`;
- run `npm run lint` and report remaining pre-existing warnings separately.

Browser verification at desktop and mobile widths:

- unauthenticated `/` shows Login;
- successful password/passkey authentication shows `OliviaDesktop`;
- no legacy Dashboard, Agent-first Home, sidebar, header, mobile nav, footer, or floating legacy control appears on `/`;
- `/desktop` and `/admin/dashboard/home` settle on `/` without back-navigation loops;
- customer, calendar, photo workspace, and documents open as AppWindows;
- review and Olivia open from the Dock;
- embedded windows have only DesktopTopBar plus AppWindow header;
- root has no document scrollbar and window bodies scroll independently;
- direct `/photo-sorting` and `/calendar` access still works with compatibility UI;
- auth, logout, passkey, and existing Dashboard API endpoints are unchanged.

## Completion Criteria

The work is complete when users have one remembered entry point (`/`), every visible Desktop launcher is registry-derived, authenticated root rendering contains only OLIVIA OS UI, legacy routes remain available only as compatibility surfaces, and all required verification passes without business-logic deletion.
