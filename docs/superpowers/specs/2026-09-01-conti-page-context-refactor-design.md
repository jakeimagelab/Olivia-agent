# Olivia ContiBuilder and PageContext Refactor Design

## Objective

Refactor the existing Conti workspace without recreating or removing behavior, and extend the existing Olivia context source of truth so the Agent can identify the current page mode, available actions, selected row or scene, document state, brand, and edit/finalization permissions.

This work has exactly two product scopes:

1. Split `components/conti/ContiBuilder.tsx` into screen-level components.
2. Extend the existing `oliviaContextStore` and connect the additional context to workspaces and deterministic tool selection.

## Compatibility Boundaries

- Preserve all current Conti behavior: create, load, save, autosave, duplicate, delete, row add/delete/reorder, PDF, Excel, client linking, Workflow linking, mailing, checklist, schedule, drawing/memo, field view, portrait consent, and scene image behavior.
- Keep the current Conti state and mutation functions as the single source of truth. Extracted components receive data and actions through props.
- Reuse the existing shared Conti mutation functions and existing business handlers. Do not duplicate mutation logic in child components.
- Preserve every existing `OliviaContextSnapshot` field and name. All new fields are optional.
- Store only pointers and decision summaries in Olivia context, never full document rows, DB records, blobs, or handles.
- Preserve legacy Conti fields on read and write where current persistence or exports depend on them.

## Conti Architecture

`ContiBuilder` remains the controller and screen assembler. It owns the current form/result state, history, autosave, resource lifecycle, async actions, drawing state, and modal/page coordination. Its render tree delegates coherent UI regions to the following components:

- `ContiSetupForm`: simplified initial form and collapsed legacy detail controls.
- `ContiSummaryBar`: compact one- or two-line document summary.
- `ContiSceneTable`: scene table, selection, drag/drop wiring, and row action composition.
- `ContiSceneRow`: memoized row-level editing boundary when it reduces cell edits from rerendering unrelated rows.
- `ContiLensSelect`: lens-only editor for new user changes, with legacy angle values displayed without destructive conversion.
- `ContiChecklist`: existing checklist presentation connected to parent-owned actions.
- `ContiSchedule`: existing schedule presentation connected to parent-owned actions.
- `ContiExportActions`: existing save, PDF, Excel, duplicate, mailing, sharing, and Workflow action UI connected to parent-owned handlers.

Components will not be split below meaningful screen or row boundaries. Existing field-view and drawing UI may remain in the container unless moving a whole coherent region materially reduces the container without entangling business logic.

## Setup Data Mapping

The simplified first screen exposes:

- Shoot title
- Purpose
- Shooting space
- Main people
- Required scenes
- Notes

Shoot title is a dedicated compatibility-safe field. Existing documents fall back to persisted title and then hospital/client name. Main people and required scenes use dedicated lightweight form values for new input while legacy staff, patient, specialty, and location structures remain available in a collapsed details section and remain part of compatible generation/save payloads.

## Scene Table Contract

The visible column order is:

1. Scene
2. Location
3. People
4. Lens/composition
5. Description
6. Time
7. Notes

The keyword field remains in the data model, persistence, imports, and exports where required for compatibility, but is not rendered in the primary editing table.

`ContiLensSelect` offers `24-70mm`, `35mm`, `85mm`, and `135mm`. Existing `WIDE`, `MEDIUM`, `CLOSE`, or other legacy values remain readable and unchanged until the user chooses a new lens value.

Clicking or focusing a scene row registers its actual stable scene id as `selectedSceneId`. If a legacy row has no persisted id, the UI will use the same stable client-side identity mechanism already required for row editing and reordering rather than infer a target from the displayed row number.

## PageContext Model

Add these optional fields to `OliviaContextSnapshot`, the Zustand state, snapshots, server normalization, and prompt serialization:

- `pageMode?: "create" | "edit" | "view" | "list"`
- `capabilities?: string[]`
- `selectedRowId?: string`
- `selectedSceneId?: string`
- `documentStatus?: string`
- `brand?: string`
- `canEdit?: boolean`
- `canFinalize?: boolean`

The existing store remains the only context source of truth. A focused page-context setter updates related fields atomically. Workspace registration will not clear client, project, recent action, alias, or Agent memory context.

## Workspace Registration

The main document workspaces register actual UI capabilities when mounted and update document-specific values when their resources or states change.

- Quote: `quote.edit`, `quote.discount`, `quote.add_item`, `quote.publish`, `contract.create`
- Conti: `conti.edit`, `conti.add_scene`, `conti.remove_scene`, `conti.reorder_scene`, `conti.export`
- Contract: `contract.edit`, `contract.sign`, `contract.publish`, `contract.download_pdf`

Capabilities and permission booleans reflect the actual rendered state and available handlers. Quote row selection uses `selectedRowId`; Conti scene selection uses `selectedSceneId`. Brand is registered from the workspace's existing brand source instead of inferred from text.

## Lifecycle and Stale Context Prevention

Workspace registration occurs on entry. Document identity, mode, status, brand, and permissions update when the active resource changes. Row or scene selection updates independently.

Changing workspace clears previous workspace transient values: `selectedRowId`, `selectedSceneId`, page capabilities, page mode, document status, brand, `canEdit`, and `canFinalize`. Changing document identity clears row and scene selection before registering the next document. Unmount cleanup only clears context if the store still points to the same workspace/resource, preventing an old component cleanup from erasing a newly opened workspace.

Existing client, project, recent entities/actions, aliases, tool intent, and memory-related state remain intact unless their existing lifecycle explicitly clears them.

## Tool Selection

Deterministic tool selection continues to derive domains from the message, recent text, and active workspace. When `capabilities` is present, page-dependent mutation tools are filtered through an explicit capability-to-tool mapping. Read-only, navigation, database/global, memory, and cross-page discovery actions remain eligible.

Examples:

- Quote + `canFinalize=true` + `quote.publish` makes `request_quote_publish` eligible for “최종 승인해”.
- Quote + `canFinalize=false` or no `quote.publish` excludes that publish mutation.
- Conti + `selectedSceneId=scene3` allows `remove_conti_shot` to target `scene3` for “이 장면 삭제해”.
- Contract + `canEdit=true` + `contract.edit` keeps `update_contract_terms` eligible for “계약금 30%로”.

Tool execution target resolution will prefer explicit input, then the selected PageContext id, then existing compatible fallbacks. Capability filtering does not itself grant permission; executor-side validation remains authoritative.

## Rendering Strategy

Extracted row components receive primitive row values and stable callbacks where practical. Functional state updates remain in the parent. `React.memo` is used only at meaningful row/component boundaries, and callbacks are stabilized where required for memoization. No performance optimization may change save timing, selection semantics, history behavior, or mutations.

## Testing and Verification

Add focused tests for:

- Quote finalization candidate when allowed.
- Quote publish exclusion when finalization is disallowed.
- Selected Conti scene targeting for deletion.
- Contract term update selection when editing is allowed.
- Clearing row and scene selection across workspace/document changes.
- Preserving `jakeimage` brand without Photoclinic inference.
- Snapshot and server normalization of every new optional field.
- Existing client, project, document, recent action, alias, memory, and workspace behavior.

Verify the refactor with `npm run typecheck`, `npm test`, `npm run build`, and, where feasible, `npm run lint`. Report the original and final `ContiBuilder.tsx` line counts, extracted files, feature regression evidence, PageContext wiring, tool-selection behavior, tests, and command results.

## Non-Goals

- Rebuilding the Conti feature or changing its persistence schema beyond compatibility-safe optional form data.
- Introducing a second PageContext store or moving the Conti document into a new global store.
- Removing legacy fields or existing features.
- Broad redesign of quote, contract, field view, drawing, or portrait-consent functionality.
