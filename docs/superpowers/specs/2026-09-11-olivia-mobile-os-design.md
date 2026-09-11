# OLIVIA MOBILE OS Design

**Date:** 2026-09-11  
**Repository:** `jakeimagelab/Olivia-agent`  
**Branch:** `main`  
**Status:** Approved for implementation

## 1. Product intent

OLIVIA MOBILE OS is a separate mobile experience for commanding work, checking results, making small corrections, approving work, and reviewing schedules. It is not a scaled-down copy of the existing desktop operating system.

- Desktop = Workstation
- Mobile = Command & Control

The existing `OliviaDesktop`, window manager, dock, floating windows, desktop calendar, quote editor, and contract editor remain intact. Mobile shares their canonical data, services, conversation, agent, and resource identifiers, but not their desktop DOM or navigation.

The user-facing name for the agent conversation is always **올리비아 채팅**. The phrases `에이전트 채팅`, `Agent Chat`, `고객 채팅`, `Hermes Chat`, and the technical name `Hermes` must not appear in the mobile UI.

## 2. Chosen approach

### 2.1 Alternatives considered

1. **Adaptive root with a separate mobile DOM — chosen.** The authenticated root selects either `OliviaMobileShell` or `OliviaDesktop`. Both use the same URL and shared services, but only one product shell mounts.
2. **Automatic `/mobile` redirect.** This creates unnecessary URL, authentication, and browser-back complexity and is not the preferred single-URL experience.
3. **CSS scaling or responsive reuse of desktop windows.** Rejected because it preserves desktop interaction constraints and violates the product requirement.

### 2.2 Adaptive entry

After authentication, a small client-side surface gate evaluates:

- `?mobilePreview=1` as a development-only override;
- a primary `max-width: 820px` media query;
- viewport and coarse-pointer information as supplemental signals without adding a device-detection dependency.

Until the surface is known, neither shell mounts. This prevents the desktop from opening windows, changing overflow, or initializing desktop state on a mobile device. Once selected:

```tsx
mobile ? <OliviaMobileShell /> : <OliviaDesktop />
```

The mobile branch is a distinct component tree. It does not use `transform: scale`, hidden desktop windows, or desktop-only navigation.

## 3. Component boundary

The expected mobile component family is:

```text
components/olivia-mobile/
  OliviaMobileShell.tsx
  OliviaMobileShell.module.css
  MobileHeader.tsx
  MobileBottomNav.tsx
  MobileHome.tsx
  MobileCalendar.tsx
  MobileMemo.tsx
  MobileDocuments.tsx
  MobileQuoteContractList.tsx
  MobileDocumentLibrary.tsx
  MobileOliviaChat.tsx
  MobileResourceCard.tsx
  MobileResourcePreview.tsx
  MobileCurrentWorkCard.tsx
```

Exact file grouping may be adjusted to match existing repository conventions, but the mobile shell, mobile navigation, and mobile screen DOM remain separate from desktop components.

Heavy preview and screen modules may be loaded only when needed. No new UI library or design system is introduced.

## 4. Navigation and history

The fixed bottom navigation has exactly five destinations:

1. 홈
2. 캘린더
3. 메모
4. 문서
5. 올리비아 채팅

`미리보기` is contextual and never appears in the bottom navigation. The document screen contains its own `견적/계약` and `문서함` segment.

Mobile screen changes are represented in browser history so that refresh and browser back remain deterministic. The shell may use root-level search parameters such as `mobileView`, `resourceType`, and `resourceId`; it must not require a separate production `/mobile` URL.

Expected flow:

```text
문서 목록 -> 미리보기 -> 수정 요청 -> 올리비아 채팅
             ^                         |
             +------ browser back -----+
```

Returning again from the preview goes to the originating document list. Mobile history must never fall through into a desktop window state or open a new browser window.

## 5. Home

The home screen uses a white or soft-mint background, Olivia deep green, thin borders, 16–20px radii, restrained shadows, and generous spacing.

Header content:

- OLIVIA logo
- `안녕하세요, 오늘도 좋은 하루 되세요! 👋`
- `포토클리닉 스튜디오`

Primary home sections:

1. **오늘 일정** card, backed by the canonical calendar API.
2. **현재 작업 중** generic resource card.
3. Six quick-menu cards with the exact names:
   - 캘린더
   - 메모
   - 견적/계약
   - 문서함
   - 올리비아 채팅
   - 미리보기
4. A compact `Olivia에게 무엇을 시킬까요?` command card that opens 올리비아 채팅.

### 5.1 Current resource resolution

When selecting the current-work resource:

1. Prefer the current session's `activeResourceId` or `currentDocumentId`.
2. If the session has none, restore the most recently updated non-final quote, contract, or supported document from canonical storage.
3. Otherwise show `현재 작성 중인 문서가 없어요.`

The card is generic so further resource types such as conti can be added without redesigning Home.

The state labels `작업 중`, `완료`, and `실패` are derived from actual agent-run/tool verification and a resource read-back. Assistant prose alone never marks work complete.

## 6. Shared data and services

Mobile-specific tables, quotes, contracts, memos, calendars, conversations, agents, or prompts are prohibited.

The initial shared sources are:

- Calendar: existing `/api/calendar` and `calendar_tasks`
- Memo: existing `/api/memo` and `consultation_memos`
- Quotes: existing `/api/quotes` and `/api/quotes/[id]`
- Contracts: existing contract service and `/api/contracts/[id]`
- Document library: existing `/api/documents/search` and `searchDocuments`
- Conversation: existing `useOliviaConversationStore` and `/api/olivia/v2/stream`
- Resource context: existing `useOliviaContextStore`
- Agent execution state: existing agent-run and tool-verification data

Presentation-oriented normalization may be added in shared library code or a lightweight aggregate endpoint, but it must read canonical records and must not create a mobile data silo.

## 7. Calendar

The mobile calendar is a simple screen, not the desktop calendar workspace.

- Header: `캘린더` and a 44px-or-larger add button.
- Views: `오늘`, `주간`, `월간`; default is `오늘`.
- Today view shows date, count, time, title, and location.
- Selecting a date displays that date's schedule list.
- Selecting a schedule opens a bottom sheet or compact detail screen.
- Editable fields: title, date, time, location, and memo.

Empty state: `오늘 예정된 일정이 없어요.`

## 8. Memo

The memo screen uses the existing memo records and provides:

- recent memo list;
- search;
- new memo;
- title, body, and optional related customer;
- compact editing appropriate to mobile.

A memo created through 올리비아 채팅 is saved by the existing memo tool and appears in this same list after refresh. There is no mobile memo database.

Empty state: `아직 작성한 메모가 없어요.`

## 9. Documents

The mobile document screen contains the top segment:

- `견적/계약` — default
- `문서함`

### 9.1 Quote and contract list

Subfilters are `전체`, `견적서`, and `계약서`. Cards show title, client, date, actual status, amount when available, and a disclosure affordance.

Mobile does not implement a complex quote or contract creation form. Creation is initiated through 올리비아 채팅. Mobile focuses on reading, previewing, approving, and requesting corrections.

### 9.2 Document library

The document library is a compact searchable file browser. Folder labels are:

- 견적서
- 계약서
- 촬영 원본
- 보정본
- 고객 자료
- 스튜디오 자료

These folders are presentation filters over existing canonical document/file data, not new folder records. A category without matching canonical records displays an empty state rather than fabricated content.

Empty state: `저장된 문서가 없어요.`

## 10. 올리비아 채팅

The title is `올리비아 채팅` and the subtitle is `Olivia에게 업무를 지시하세요.` The other participant is OLIVIA only; the UI does not resemble a customer messenger or show customer identities as chat recipients.

The mobile chat surface reuses:

- the same logical conversation and persisted messages;
- the same `useOliviaConversationStore` send, hydrate, retry, stop, and approval actions;
- the same Hermes Primary Brain behind the existing Olivia API;
- the same Olivia tool and service path;
- the existing attachment sanitizer/uploader and photo/file support.

No mobile agent, prompt, or AI router is added. Existing channel metadata remains `web` unless a mobile enum is demonstrably necessary; a new enum is not required for this version.

The composer is fixed above the bottom navigation and safe area:

```text
[ + ]  Olivia에게 무엇이든 말해보세요...  [↑]
```

The composer must stay visible while the iOS keyboard is open. Voice input is not added unless it is already supported by the reused composer.

Loading text: `Olivia가 확인하고 있어요...`

## 11. Chat resource cards

Persisted `resource_card` blocks and verified tool results containing a real resource identifier become tappable mobile resource cards. Cards display the type, title/client, and canonical amount or summary after read-back.

Tapping a resource card opens Mobile Preview for its actual `resourceType` and `resourceId`. It never renders a copied static payload as the source of truth.

If a tool reports success without an existing resource or persistence verification, the UI presents a failure/check state instead of a completed resource card.

## 12. Mobile Preview

Mobile Preview is a dedicated contextual screen with:

- header: back, `미리보기`, overflow action;
- a mobile-width canonical renderer for quote and contract;
- support for generic document resources as data permits;
- fixed bottom actions: `공유`, `다운로드`, `수정 요청`.

Preview loads the resource directly by ID. It is not a screenshot, a low-resolution render, or an old saved copy.

### 12.1 Refresh behavior

- Refresh immediately after a successful relevant tool result.
- Refresh on window focus and visibility restoration.
- While Preview is visible, poll the same resource at a modest interval and update only when `updated_at` changes.
- Home/current work and open lists refresh after relevant tool completion.

This makes Telegram, Desktop, and Mobile converge on the same DB row without a duplicate mobile resource.

### 12.2 Edit request context

`수정 요청` records the previewed resource in the existing context store and navigates to 올리비아 채팅. A follow-up such as `프로필 3명으로` therefore targets the same resource ID. The system must not create a new quote merely because the user omitted the document name.

### 12.3 Share and download

- Share produces a seven-day signed URL.
- The public share page resolves the token and reads the canonical source record on each load; it is not a frozen image.
- Existing temporary-document sharing is reused where the resource already has a temporary-document reference.
- Quote/contract sharing follows the same seven-day behavior without duplicating the underlying resource.
- Download reuses existing PDF rendering/generation code. Shared helpers may be extracted from the desktop builders; no new PDF or UI dependency is installed.

## 13. Mobile styling and platform behavior

- Font stack starts with `-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `SF Pro Text`, and `Pretendard`.
- Page height uses `100dvh` with safe fallbacks.
- Top and bottom chrome include `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Touch targets are at least 44px.
- No essential interaction depends on hover.
- The desktop dark-green wallpaper is not used as the full mobile background.
- Skeletons are limited; short state text and stable empty cards are preferred.
- Errors stay inside the relevant screen and provide a retry action instead of crashing the shell.

## 14. Performance and isolation

- Desktop-only modules are not mounted on mobile.
- Large screen/preview modules are loaded on demand where practical.
- Independent Home data requests run in parallel or through a shared aggregate read to avoid waterfalls.
- Mobile state selectors subscribe only to required store slices.
- Event listeners, polling, and visual-viewport handling are cleaned up on unmount.
- Existing desktop CSS and window behavior are not rewritten for mobile.

## 15. Testing

### 15.1 Automated checks

- TypeScript typecheck
- ESLint
- Existing test suite
- Production build
- Unit tests for adaptive-surface detection, mobile history, resource normalization, context handoff, and status derivation
- Static and rendered checks ensuring forbidden chat labels are absent from mobile components

### 15.2 Mobile browser matrix

Test at minimum:

- 375×812
- 390×844
- 393×852
- 430×932

Verify in Chrome device emulation and an iPhone Safari-compatible layout, including safe areas and keyboard/composer behavior.

### 15.3 Required E2E flows

1. Mobile root renders Mobile Home rather than desktop windows and dock.
2. Home opens the existing Olivia conversation under `올리비아 채팅`.
3. A quote command produces a verified quote resource, chat card, and current-work card.
4. The quote resource card opens Mobile Preview.
5. `수정 요청` followed by a short command updates the same quote ID.
6. Desktop reads the same updated quote.
7. Mobile calendar reads and writes canonical calendar data.
8. Mobile memo reads and writes canonical memo data.
9. Document top segments and filters switch correctly.
10. No mobile UI contains `에이전트 채팅`, `고객 채팅`, or `Hermes Chat`.

### 15.4 Desktop regression

At 1440px and wider, confirm that the existing `OliviaDesktop`, desktop dock, movable windows, window adapters, quote editor, contract editor, and calendar workspace still mount and behave as before.

## 16. Non-goals

This phase does not add:

- a scaled desktop OS;
- all desktop applications on mobile;
- a mobile database or duplicated resources;
- a mobile-specific agent, prompt, or router;
- a customer messenger;
- a new design system or UI library;
- complex mobile quote/contract editing;
- mobile conti creation;
- mobile photo classification;
- broad desktop UI changes.

## 17. Acceptance summary

The representative can open Olivia on an iPhone, see the day's schedule and current work, issue a command in 올리비아 채팅, inspect the resulting canonical resource, request a correction in context, and see the same updated resource on Mobile, Desktop, and Telegram-connected workflows.

- Mobile forbidden chat labels remaining: **NO**
- User-facing name of the command conversation: **올리비아 채팅**

