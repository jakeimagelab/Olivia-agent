# Olivia 3.0 Phase 5 — Core Project Snapshot Design

## Goal

Promote the existing Olivia Core commands into the shared source of truth for the quote → contract → conti → shooting vertical slice. This phase adds a read model over existing tables; it does not add a workflow state machine, resource-registry table, dashboard redesign, or hospital-name-based resource inference.

The canonical runtime project identity is `workflow_runs.id`. In this design, `workflowRunId` and the UI context store's `activeProjectId` identify that value. `workflow_runs.project_id` is optional metadata and must never be required to build a snapshot.

## Ownership Boundaries

- `lib/workflow.ts` and `lib/workflowAutomation.ts` remain the workflow source of truth.
- Core Snapshot represents actual persisted project state.
- `useOliviaContextStore` represents what the user is currently viewing. It must not be used to infer whether a workflow step is complete or which resource actually exists.
- Core Commands remain the only mutation path for the document vertical slice.
- Resource discovery uses exact `workflow_run_id` links only. `hospital_name` is never a registry fallback.

## Core Read Model

Add:

- `lib/core/readModels/types.ts`
- `lib/core/readModels/resourceRegistry.ts`
- `lib/core/readModels/projectSnapshot.ts`

`types.ts` defines `CoreResourceRef`, `CoreResourceRegistry`, `CoreWorkflowStepState`, and `CoreProjectSnapshot`. A resource ref may include `sourceTable` so a canonical `conti_runs` row can be distinguished from a legacy `conti_saves` row without changing the public resource type from `conti`.

### Resource Registry

`loadCoreResourceRegistry(db, workflowRunId)` performs independent resource queries in parallel and returns the newest exact-run resources.

- Quote: query the newest `published`/`final` quote and newest quote of any status, then reuse `selectWorkspaceQuote()`.
- Contract: newest `contracts.created_at`, including `source_quote_id`.
- Conti: newest exact-run `conti_runs.updated_at` first. If absent, use newest exact-run `conti_saves.saved_at`. Never query by hospital name.
- Photo project: newest exact-run row using the real `updated_at` column.
- Select gallery: newest exact-run `created_at`.
- Photo gallery: newest exact-run `created_at`.

An empty exact-run result is a valid `null` resource. A database query failure is not converted to `null`; it propagates so the Snapshot returns an explicit Core failure. Rows whose `workflow_run_id` is null remain outside the Registry even if their hospital name matches.

### Project Snapshot

`getCoreProjectSnapshot(workflowRunId, db = getSupabaseAdmin())` returns `CoreCommandResult<CoreProjectSnapshot>`.

1. Load the exact workflow run. A missing run returns `PROJECT_NOT_FOUND` and `프로젝트를 찾을 수 없습니다.`
2. If `client_id` exists, load the client. Resolve the display name as `clients.hospital_name`, then `workflow_runs.client_name`, then `이름 없는 고객`.
3. Load `workflow_step_runs`, `agent_tasks`, `agent_approvals`, and `mailing_queue` for the exact run.
4. Load resources only through `loadCoreResourceRegistry()`.
5. Reuse existing workflow definitions and helpers: `ACTIVE_WORKFLOW_STEP_KEYS`, `getWorkflowDisplayStepKey`, `STEP_NAME`, `getWorkflowPhaseProgress()`, and `buildWorkflowNextAction()`.

`completedSteps` contains only actual step runs whose persisted status is `completed`. A `skipped` row remains `skipped` in `stepStates`; it is not relabeled as completed. Missing step rows remain pending. Progress percent intentionally reuses the existing phase progress helper for UI compatibility.

The snapshot performs local consistency checks only:

- every resource ref must contain the requested workflow run ID;
- if a contract has `source_quote_id` and the selected registry quote exists with a different ID, add `CONTRACT_SOURCE_QUOTE_MISMATCH`.

The global `findWorkflowConsistencyIssues()` scan remains in the status panel and is not rerun for every snapshot request.

Export a deterministic `summarizeCoreProjectSnapshot(snapshot)` helper. UI, Olivia V2, legacy status reads, and Hermes use the same summary rather than asking an LLM to infer facts from independent rows.

## API and Consumers

### Snapshot API

Add read-only `GET /api/core/workflows/[id]/snapshot`. It performs the existing administrator authentication, validates the ID, calls only `getCoreProjectSnapshot()`, maps `PROJECT_NOT_FOUND` to 404, and maps other Core failures to an explicit server error. The route contains no database queries.

### Client Workspace

Keep the existing response shape and active-project selection. After selecting the active workflow run, call `getCoreProjectSnapshot(activeProject.id, db)`.

Populate these fields from the Snapshot:

- `resourceIds.quote`
- `resourceIds.contract`
- `resourceIds.conti`
- `resourceIds.select_gallery`
- quote metadata
- workflow current step, current step name, progress, and next action

Retain existing workspace-only queries and response sections for publications, portal access, recent activity, client details, memo, and workspace next action. Remove only the resource/task/approval/mailing queries made redundant by the Snapshot.

### Olivia V2 and Existing Workflow Status

Add `get_project_snapshot` to the V2 workflow executor and tool catalog. It accepts an optional `workflowRunId`; otherwise it uses `context.activeProjectId`. With neither, it returns `먼저 프로젝트를 선택해주세요.` It returns both the canonical snapshot and deterministic summary with executed/resource verification.

Keep fuzzy customer-to-run lookup in `getWorkflowStatus()`. Once it resolves an exact run ID, use `getCoreProjectSnapshot()` for all state/resource facts and return the same summary.

### Hermes MCP

Register read-only `workflow.get_snapshot` with exact UUID input and optional request ID. It delegates through the existing MCP runner to `get_project_snapshot`; it does not copy Snapshot queries or inference logic.

## Quote → Contract → Conti Vertical Slice

### Quote Completion and Contract Creation

Keep the existing `completeQuote()` route and command. The repository already has the UI route `/api/contracts/from-quote`, which delegates to `createContractFromQuote()`, so no duplicate quote-contract route is added.

Strengthen `createContractFromQuote()` idempotency:

- same `workflow_run_id` and same `source_quote_id`: return the existing contract as `ok: true`, `idempotent: true`;
- same workflow run but a different source quote: return `CONTRACT_SOURCE_CONFLICT` without modifying the contract;
- concurrent unique-index conflict: re-read the existing contract and apply the same same-source/conflicting-source rule.

### Contract Completion

Keep `publishContract()` and its existing publication/workflow service. After a successful command, read the Core Snapshot and verify that the workflow is at `conti`. A mismatch is returned as a verification failure rather than hidden as success.

### Conti Source and Completion

The canonical conti resource is `conti_runs`; exact-run `conti_saves` is supported only as a legacy fallback. New Desktop and Hermes conti creation remains on `conti_runs`.

Extend the existing `publishConti()` resource validation to accept either source table while requiring exact `client_id`/`hospital_id` and `workflow_run_id` linkage. Publication and workflow advancement continue through the existing command logic. After success, verify through the Snapshot that:

- `workflow.currentStep === "shooting"`;
- `resources.conti.id` is the published conti ID.

No hospital-name link or automatic legacy relinking is introduced.

## Failure Rules

- Core reads return a complete exact-run snapshot or an explicit failure; no silent partial success.
- A missing resource is `null`; a failed query is an error.
- Commands do not claim completion when post-command Snapshot verification disagrees.
- Contract conflicts do not overwrite or relink an existing contract.
- Legacy unlinked rows are never silently adopted.
- Existing Phase 4/4.5 target selection, progress events, Hermes fallback, and context bridge behavior remain unchanged.

## Tests

Add or extend the following suites without skips or removal of existing tests.

### `tests/coreResourceRegistry.test.ts`

- exact-run isolation for two projects belonging to the same client;
- approved quote selection when a newer draft exists;
- contract source quote preservation;
- exclusion of null-run legacy contracts;
- canonical `conti_runs` lookup and exact-run legacy fallback;
- exact-run select gallery and photo gallery lookup.

### `tests/coreProjectSnapshot.test.ts`

- missing run returns `PROJECT_NOT_FOUND`;
- null `project_id` succeeds;
- persisted current step is preserved;
- completed steps come only from actual completed step rows;
- contract resource inclusion;
- contract/source quote mismatch marks consistency false;
- query failures are surfaced.

### `tests/documentCoreCommands.test.ts`

- first contract creation;
- repeated same-source creation returns the same ID with `idempotent: true`;
- only one contract row exists;
- a different source quote on the same run returns `CONTRACT_SOURCE_CONFLICT`;
- unique-index races produce the same deterministic result.

### `tests/coreDocumentVerticalFlow.test.ts`

- quote completion advances to contract and is visible in Snapshot;
- contract creation and repeated creation are correct in Snapshot;
- contract publication advances to conti;
- canonical conti creation retains `client_id`/`hospital_id` and `workflow_run_id`;
- conti publication advances to shooting and remains the Snapshot conti resource.

### Chat, MCP, and Workspace Regression

- V2 and Hermes return the exact-run Snapshot;
- deterministic summaries never claim missing contract/conti resources;
- cross-project resources never mix even when hospital names match;
- Client Workspace response shape and quote/contract/conti/select-gallery behavior remain compatible.

## Verification

Run:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`

Browser QA uses a safe local fixture or existing test project. Read-only Snapshot and workspace behavior can be verified directly. Mutation flows are reported as browser-verified only if they are actually exercised against a safe environment. Production verification is never claimed without production evidence.

## Out of Scope

- shooting and later workflow conversion;
- worker/NAS/photo-classification redesign;
- new workflow states or a Registry database table;
- Hermes planner or automatic multi-step agent;
- Dashboard redesign;
- projects/workflow_runs consolidation;
- Context Store removal;
- large chat-route refactoring.

