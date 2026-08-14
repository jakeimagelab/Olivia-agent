# Workflow Step Processing Chat Tools Design

## Scope

First sub-project of a larger effort ("make chat able to do everything the app can do"). This slice covers only workflow step task/checklist processing — the "올리비아가 현재 단계 처리하기" button and "업무 프로세스" checklist from `components/NextActionCard.tsx`. Later sub-projects (contract item editing, client CRUD, gallery pipeline, documents, revisions, reviews, PER points, reports) are out of scope here and will each get their own design.

## Background

`lib/olivia/v2/toolExecutor.ts` already exposes ~46 tools covering quote/conti editing, calendar CRUD, mailing, gallery, email, meetings, and `open_feature` navigation. It has no tool for running or approving the per-step task checklist that `NextActionCard` drives via `/api/workflow/run-current-step` and `/api/agent/{tasks,approvals}/*`.

Live testing on 2026-08-13 confirmed the UI already guards against a known bug: for `quote`/`contract`/`conti` steps, `NextActionCard` (and its "현재 단계 처리하기" button) is deliberately hidden, because running it there used to advance the workflow using only an AI draft, without real quote/contract data. The guard lives in `lib/clientWorkspace/nextAction.ts` (`computeClientWorkspaceNextAction`) and is duplicated in `app/(client-hub)/clients/page.tsx` (`TOOL_STEP_TITLE`). The same testing found that the existing `advance_workflow_step` chat tool has no such guard — a chat request like "계약 단계로 넘겨줘" can currently skip `quote`/`contract`/`conti` with no real document behind it. This design also closes that gap.

## New Tools

Added to `OLIVIA_V2_TOOLS` in `lib/olivia/v2/toolExecutor.ts`:

- **`list_workflow_step_tasks`** `[READ]` — takes `clientName`, resolves the active workflow run, calls `/api/workflow/next-action`, and returns the current step's checklist (title, status, whether an approval is attached) so Olivia can describe what's left or ask which item to approve.
- **`process_workflow_step`** `[WRITE]` — takes `clientName`. Mirrors the "올리비아가 현재 단계 처리하기" button exactly by calling `/api/workflow/run-current-step`. Runs immediately, no confirmation step (matches current button behavior; it only creates AI drafts, never sends anything external).
- **`approve_workflow_task`** `[WRITE]` — takes `clientName` and `taskSelector` (a title or partial title, matched the same way conti shot selectors are resolved). Finds the one checklist item it identifies and calls `/api/agent/approvals/{id}/approve` if it has a pending approval, otherwise `/api/agent/tasks/{id}/run`. Runs immediately. Returns a clarifying question (no action taken) if the selector matches zero or more than one item.

## Guard: quote/contract/conti steps

All three tools check the run's current step before doing anything. The step-key set that requires a real document (`quote`, `contract`, `conti`) is extracted into a single exported constant, `TOOL_ONLY_STEP_KEYS`, in `lib/workflow.ts`. `lib/clientWorkspace/nextAction.ts` and `app/(client-hub)/clients/page.tsx`'s `TOOL_STEP_TITLE` keys are updated to derive from this constant instead of hardcoding the list a second and third time.

When the current step is in `TOOL_ONLY_STEP_KEYS`, the three new tools do not call their write endpoints. They return a message explaining the step needs a real document, and offer to open the matching builder. If the user confirms, Olivia calls the existing `open_feature` tool with the right query (e.g. "견적서 작성") — same navigation path as the "+ 견적서 작성하기" button.

## `advance_workflow_step` hardening

Before calling `/api/workflow/advance`, `advanceWorkflowStep` (`lib/olivia/tools/workflow.ts`) now checks: if the run's **current** step is in `TOOL_ONLY_STEP_KEYS`, look up whether a real record exists for it (a row in `quotes`/`contracts`/`contis` linked to this `workflow_run_id`). If none exists, refuse with a message pointing at the right builder, the same way the three new tools do. This only blocks the "no real document yet" case — an admin who already has a quote/contract/conti on file can still ask Olivia to jump the run to any step, same as the "관리자 예외 처리" menu item allows today.

## Data flow

```
User: "미소로한의원 지금 단계 뭐 남았어?"
  -> list_workflow_step_tasks(clientName="미소로한의원")
  -> fuzzy-match client -> active workflow_run -> GET /api/workflow/next-action
  -> Olivia lists checklist items + statuses

User: "그거 다 처리해줘"
  -> process_workflow_step(clientName="미소로한의원")
  -> guard check (current_step_key not in TOOL_ONLY_STEP_KEYS) -> proceed
  -> POST /api/workflow/run-current-step
  -> Olivia reports what ran and whether the step advanced

User: "계약서 초안 승인해줘" (on a non-tool step with an approval-gated item)
  -> approve_workflow_task(clientName="...", taskSelector="계약서 초안")
  -> resolve to exactly one checklist item -> approve or run -> report result
```

## Error handling

- No active workflow run for the resolved client → same "활성 워크플로우를 찾을 수 없어요" message pattern already used by `get_workflow_status`.
- `taskSelector` ambiguous or no match → Olivia asks which item, lists the checklist, takes no action.
- Underlying API call fails → surface the server's `error` message, same pattern as every other tool in this file (`fromLegacyResult`).

## Validation

- Unit/typecheck/build as usual.
- Live re-run of the exact scenario tested manually on 2026-08-13 (new client → consult step → `process_workflow_step` → quote step → confirm `process_workflow_step`/`approve_workflow_task` refuse and redirect instead of skipping the step → build the quote for real → contract step reached).
- Explicit test that `advance_workflow_step("...", "contract")` on a client still at `quote` with no quote record is refused, and succeeds once a quote record exists.
