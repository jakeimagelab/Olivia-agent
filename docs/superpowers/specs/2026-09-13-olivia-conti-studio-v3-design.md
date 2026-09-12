# OLIVIA CONTI STUDIO V3 Design

**Date:** 2026-09-13  
**Repository:** `jakeimagelab/Olivia-agent`  
**Branch:** `main`

## 1. Purpose

Conti Studio V3 extends the current canonical Conti V2 implementation into a three-stage Olivia Desktop application:

1. setup and generation,
2. spreadsheet-style editing,
3. tablet-first field operation.

The implementation must preserve the existing generation, load, import, editing, sharing, export, workflow, and Desktop window integrations. It must not revive `conti_saves` as a mutation source or create a parallel Conti document model.

The governing rule is:

> One canonical Conti state, rendered through multiple views.

## 2. Existing System Findings

The repository already contains two Conti implementations:

- legacy UI and data helpers under `components/conti/ContiBuilder.tsx` and `conti_saves`,
- canonical V2 under `components/conti/v2`, `lib/conti/canonicalService.ts`, and `conti_runs`, `conti_groups`, `conti_scenes`.

The canonical V2 implementation already provides:

- deterministic setup preview and Conti generation,
- Olivia Desktop window integration through `ContiWindowContent`,
- inline scene editing and scene creation/deletion,
- scene ordering with desktop HTML drag events,
- scene completion state,
- canonical customer/staff share links,
- read-only canonical share pages.

The main gaps are:

- state is fetched separately by the table and field views instead of being owned once by the Studio,
- no previous-Conti drawer or canonical clone flow,
- no compact checklist and schedule workspace,
- no verified debounced autosave state,
- no explicit canonical manual-save/link flow,
- no Excel export in V2 and only basic browser printing for PDF,
- no reliable touch drag and drop,
- field cards and shared cards use different renderers,
- no persistent checklist, start-time, field-view preference, or visual assignment state,
- no representative Scene image library.

## 3. Chosen Approach

V3 will incrementally extend the V2 stack. `ContiV2App` becomes the container for one loaded canonical state, while focused child components render and mutate it through a small controller API.

Rejected alternatives:

- Keeping independent state in each view would make immediate cross-view consistency unreliable.
- Expanding the 2,554-line legacy `ContiBuilder` would mix V2 mutations with `conti_saves` and increase an already oversized component.

## 4. Canonical Data Model

### 4.1 Existing tables remain authoritative

- `conti_runs`: Conti identity, customer/project linkage, generation inputs, Studio metadata.
- `conti_groups`: group identity and ordering.
- `conti_scenes`: editable Scene content, ordering, preparation text, and completion.

`conti_saves` remains read-only compatibility data where existing routes require it. All new Studio mutations target V2 tables.

### 4.2 Minimal migration

Add one nullable/defaulted JSON column:

```sql
alter table public.conti_runs
add column if not exists studio_state jsonb not null default '{}'::jsonb;
```

The versioned shape is:

```ts
interface ContiStudioState {
  version: 1;
  checklistCompleted: Record<string, boolean>;
  extraChecklistItems: Array<{
    id: string;
    label: string;
    notes?: string;
  }>;
  scheduleStartTime?: string;
  fieldCardSize: "compact" | "normal" | "large";
  sceneMeta: Record<string, {
    cameraAngle?: string;
    visual?: {
      assetId?: string;
      imageUrl?: string;
      source: "library" | "custom" | "ai";
      sceneKey?: string;
    };
  }>;
}
```

Only same-origin or Olivia-controlled image URLs may be stored. The V3 scope does not introduce a new AI image generation API.

### 4.3 Derived checklist

The checklist is derived from every Scene's `preparation_text`:

1. split supported delimiters such as newline, comma, and middle dot,
2. trim and normalize spacing,
3. merge case-insensitive duplicates,
4. retain `linkedSceneIds`,
5. create a stable item ID from the normalized label,
6. read completion from `studio_state.checklistCompleted`.

Editing Scene preparation text therefore updates the checklist without creating another content source. Completion entries whose derived item no longer exists are ignored and removed on the next persisted Studio-state update.

Standalone preparation items added by a user are stored in `extraChecklistItems` and merged into the same checklist presentation. This preserves checklist editing without inventing a second checklist table.

### 4.4 Derived schedule

The schedule is derived from sorted Scenes using:

- Scene ID,
- sort order,
- name,
- duration,
- location.

Without `scheduleStartTime`, the schedule shows ordered durations only. With a valid start time, it calculates consecutive start/end times. Reordering or changing duration immediately recomputes the schedule.

## 5. State Architecture

`ContiV2App` will own:

- run,
- groups,
- scenes,
- studio state,
- current stage/view,
- save status,
- undo/redo history.

A focused hook/controller, tentatively `useContiStudio`, will expose semantic operations instead of raw state setters:

```ts
updateSceneFields(sceneId, fields)
addScene(groupId?)
duplicateScene(sceneId)
deleteScene(sceneId)
reorderScenes(activeId, overId)
toggleSceneComplete(sceneId)
toggleChecklistItem(itemId)
setScheduleStartTime(value)
setFieldCardSize(size)
setSceneVisual(sceneId, visual)
saveDraft()
linkCanonicalConti(context)
reloadAndVerify()
undo()
redo()
```

All Studio views receive the same state and operations. Switching between result table and field mode does not refetch or create another local copy.

Undo/redo is browser-session history, capped at 50 meaningful snapshots. Undo and redo update canonical local state and then follow the same autosave flow; they are not persisted as an audit log.

## 6. Stage 1 — Setup and Generation

The current `ContiCreateScreen` visual direction remains. The main changes are:

- place `이전 콘티 보기` beside the creation heading,
- keep the seven simplified setup sections,
- preserve current detailed specialty/category data and quick-specialty generation,
- reuse `/api/conti/parse-pdf` for PDF/image import and map parsed rows into a newly created canonical V2 run,
- keep deterministic real-time Scene count, duration, and ordering preview,
- submit one generation action that produces Scenes from which checklist and schedule are immediately derived.

### 6.1 Previous Conti drawer

Create `ContiPreviousDrawer` with:

- search,
- recent canonical Contis,
- hospital and specialty metadata,
- updated date and Scene count,
- `열기`,
- `복제해서 새 콘티`.

Opening retains the existing run ID. Cloning creates a new run, groups, and scenes with new IDs. It resets Scene completion and checklist completion, while retaining editable Scene content, grouping, duration, and suitable visual-library matches.

## 7. Stage 2 — Editor Workspace

Create `ContiEditorWorkspace` as a composition layer. It contains:

1. compact document header,
2. dominant spreadsheet table,
3. compact checklist and schedule panels.

### 7.1 Header

The header displays:

- hospital/shoot title,
- `DRAFT`, `고객관리 연결됨`, or save error state,
- `저장 중…`, `자동저장됨 · 방금 전`, or `저장 실패 · 다시 시도`,
- primary actions: `저장하기`, `현장뷰`,
- secondary actions: `Excel`, `PDF`,
- overflow actions for previous Conti, return to setup, and less-used controls.

### 7.2 Spreadsheet table

`ContiResultTable` is refactored into a presentation-focused table and retains all existing editable V2 fields. The recommended visible columns are:

- order,
- Scene/group,
- shooting details,
- people,
- location,
- angle/keyword where supported by the current model,
- preparation,
- duration,
- note,
- status.

Interactions:

- click to edit,
- Tab/Shift+Tab moves between editable cells,
- Enter moves to the same column in the next row,
- touch-compatible row reorder,
- add, duplicate, confirm-delete,
- undo and redo,
- paste into the active cell, with multi-cell paste added only where it can be implemented without a spreadsheet dependency.

No large spreadsheet library is introduced.

### 7.3 Compact secondary panels

`ContiCompactChecklist` and `ContiCompactSchedule` share the bottom region. Their default height is clamped between 180 and 240 pixels and overflowing content scrolls internally.

Each panel has a concise summary and `전체보기`. Below a 750-pixel application content width, the two panels switch to tabs/accordion so they never collapse the main table.

The visual hierarchy is approximately:

- Conti table: 75%,
- checklist and schedule together: 25%.

## 8. Stage 3 — Tablet Field View

`ContiFieldView` targets a 12–13-inch tablet in landscape orientation, while remaining usable in portrait.

The top area contains:

- back/title,
- completed Scene count and progress,
- share and settings actions,
- tabs: `촬영 카드`, `준비사항`, `촬영스케줄`,
- card-size control.

Card-size values snap to layouts rather than scaling text:

- compact: approximately four columns,
- normal: approximately three columns,
- large: approximately two columns.

Touch targets are at least 44 pixels.

### 8.1 Shared Scene card

The existing pure `ContiSceneCard` is extended and becomes the renderer for:

- owner field view,
- customer/staff share view.

It supports optional:

- representative image,
- preparation items,
- completion state,
- owner-only drag and completion controls.

Share pages use the same card without mutation controls. Customer shares continue to hide staff-only/internal fields.

### 8.2 Touch drag and drop

Add the focused `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` packages. Pointer and touch sensors provide reliable iPad behavior. Keyboard sorting is included for accessibility.

One reorder operation updates the local Scene order, recomputes schedule, debounces persistence, writes all affected sort values, and verifies the final order by reading the canonical run.

## 9. Representative Scene Visuals

Add `lib/conti/sceneVisualLibrary.ts` with a deterministic resolver:

```ts
resolveSceneVisual({ specialty, name, keyword, procedures })
```

The first version maps common Scene keys such as doctor profile, consultation, staff, ultrasound, injection, manual therapy, reception, interior, and harmony to controlled local assets. Unmatched Scenes use a neutral placeholder.

The editor may expose `대표 이미지 변경`; AI generation remains a secondary future option and is not a V3 dependency.

## 10. Persistence and Verification

### 10.1 Autosave

Mutations update local state first. A 900-millisecond debounce groups changes, then the controller sends the smallest practical canonical patch. After saving, it reloads or reads back the changed resource and checks key fields/order before displaying success.

States:

- dirty,
- saving,
- saved,
- failed.

On failure, the latest unsaved state remains visible and retryable. Destructive optimistic operations retain a rollback snapshot. The UI never reports success after a failed or unverified request.

### 10.2 Manual save

`저장하기` does not create another Conti. It updates the current run's `hospital_id` and `workflow_run_id` when context is available, verifies the linkage, and triggers the existing workspace publication callback. If customer context is missing, it requests the minimum needed customer selection.

### 10.3 API additions

Extend canonical APIs rather than adding legacy routes:

- list/search canonical runs,
- clone a canonical run,
- patch run Studio state and customer/project linkage,
- persist verified batch Scene ordering,
- duplicate a canonical Scene.

All service functions live in or beside `canonicalService.ts`; route files remain transport adapters.

## 11. Export

### 11.1 Excel

Use the existing `xlsx` dependency. Export three sheets from the current canonical state:

1. 콘티,
2. 준비사항,
3. 촬영스케줄.

Column widths, wrapping, headers, ordering, completion state, and calculated time ranges are included.

### 11.2 PDF

Create a print/export presentation from the same canonical state. It contains the Conti table followed by checklist and schedule summaries. Screen-only controls are hidden through print styles. The export does not read from `conti_saves` or reconstruct different content.

## 12. Responsive Olivia Desktop Behavior

CSS container queries use application-window content width:

- 1050px and above: full table and two compact bottom panels,
- 750–1049px: table remains primary, secondary panels tighten beneath it,
- below 750px: table remains scrollable and secondary panels become tabs/accordion.

The Conti Studio does not introduce an internal application sidebar or full-page shell. It remains content inside the existing Olivia Desktop window.

## 13. Error Handling

- Load failure: show retry without discarding the active resource ID.
- Autosave failure: preserve unsaved local work and show explicit retry.
- Reorder verification failure: restore the pre-drag order and report the failure.
- Clone failure: keep the source Conti open and unchanged.
- Export failure: report the format-specific failure; it does not alter save state.
- Share failure: keep the canonical Conti unchanged and allow retry.
- Missing optional migration: return a clear deployment/schema error rather than silently dropping Studio state.

## 14. Testing Strategy

### 14.1 Unit tests

- preparation parsing, normalization, deduplication, stable IDs, and linked Scene IDs,
- schedule calculation with and without a start time,
- schedule recalculation after reorder or duration change,
- Studio-state normalization and backward-compatible defaults,
- representative visual resolution,
- clone payload reset rules.

### 14.2 Service/API tests

- canonical create/read remains intact,
- clone produces new run/group/scene IDs and leaves the source unchanged,
- Scene edit and duplicate persist correctly,
- batch reorder read-back matches requested order,
- autosave Studio-state read-back matches the request,
- manual save links the existing run instead of inserting another,
- customer/staff sharing remains read-only and audience-filtered.

### 14.3 UI and browser tests

- Stage 1 preview and generated Scene count/time match,
- previous Conti open and clone flows,
- keyboard cell navigation and table operations,
- autosave states and reload restoration,
- compact panels never displace the main table,
- Excel produces three populated sheets,
- PDF/print view contains current canonical data,
- tablet landscape renders 2/3/4-column presets,
- pointer/touch reorder updates field cards, table, and schedule,
- Scene and checklist completion survives reload,
- shared view uses the common card and contains no editing controls,
- Olivia window resize uses container breakpoints.

Finally run TypeScript checks, the full existing test suite, production build, and browser-based visual verification.

## 15. Component Boundary Plan

The intended focused structure is:

```text
components/conti/v2/
  ContiV2App.tsx                 canonical container and stage routing
  useContiStudio.ts              state, history, autosave, operations
  ContiCreateScreen.tsx          setup and deterministic preview
  ContiPreviousDrawer.tsx        list, search, open, clone
  ContiEditorWorkspace.tsx       Stage 2 composition
  ContiResultTable.tsx           spreadsheet presentation
  ContiCompactChecklist.tsx      derived checklist summary/editor
  ContiCompactSchedule.tsx       derived schedule summary/start time
  ContiFieldView.tsx             tablet tabs and orchestration
  ContiFieldToolbar.tsx          progress, share, card-size controls
  ContiV2.module.css             window-aware visual system

components/conti/
  ContiSceneCard.tsx             shared field/share renderer

lib/conti/
  canonicalService.ts            canonical persistence operations
  studioState.ts                 normalization and defaults
  deriveChecklist.ts             pure checklist derivation
  deriveSchedule.ts              pure schedule derivation
  sceneVisualLibrary.ts          deterministic representative assets
```

Exact filenames may be adjusted to match nearby repository conventions, but responsibilities must remain separated. New presentation logic must not be accumulated in the legacy `ContiBuilder`.

## 16. Rollout and Compatibility

- `/conti` and the Olivia Desktop window continue to use `ContiV2App`.
- Existing V2 runs without `studio_state` load with version-1 defaults.
- Existing `completed` and `preparation_text` fields remain authoritative.
- Existing canonical share tokens continue to resolve.
- Legacy `conti_saves` remains available only for existing compatibility/import flows.
- No new agent framework, AI image provider, spreadsheet framework, or duplicate Conti database is introduced.

## 17. Acceptance Answers

1. Result-screen core: **CONTI TABLE**.
2. Checklist/Schedule main content: **NO — compact secondary panels**.
3. Field-view primary device: **Tablet/iPad landscape**.
4. Field Scene drag: **YES**.
5. Reorder reflected in Schedule: **YES**.
6. Field card size control: **YES**.
7. Checklist/Schedule available with generated Conti: **YES, derived from the same generation result**.
8. AI image generated for every Scene: **NO — representative library first**.
9. Autosave and manual save are identical: **NO**.
10. New legacy database: **NO**.
