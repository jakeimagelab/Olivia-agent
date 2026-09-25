# Olivia 3.0 Phase 5.1 — Contract/Conti Completion Design

## Goal

Unify contract and canonical conti internal completion behind resource-aware Core Commands. Internal completion remains separate from client portal publication.

## Command boundaries

- `completeContract(contractId, { workflowRunId? }, db)` validates the persisted contract, exact workflow linkage, current Core Snapshot resource, workflow transition, final contract status, and post-mutation Snapshot.
- `completeConti(contiId, { workflowRunId? }, db)` resolves `conti_runs` first and exact-run `conti_saves` only as compatibility, then validates the current Snapshot resource and post-mutation shooting step.
- Both commands use `completeStep()` and the existing workflow order. They never infer a project from `hospital_name` and never publish portal resources.
- A final resource whose workflow is already beyond its document step returns idempotent success only when the current Snapshot still points at that exact resource.

## Entry points

- Contract UI calls `POST /api/contracts/:id/complete`.
- Canonical conti UI calls `POST /api/conti/runs/:id/complete` after save/link succeeds.
- V2 Chat exposes `complete_contract` and `complete_conti_v2`, both delegating to the same Core Commands.
- Hermes receives those V2 tools through the existing automatic catalog bridge.
- Existing `publishContract()` and `publishConti()` routes and behaviors remain unchanged.

## Error policy

- Missing or unlinked resources fail before workflow mutation.
- Request/resource project mismatch returns `RESOURCE_PROJECT_MISMATCH`.
- Snapshot/resource mismatch returns `RESOURCE_MISMATCH`.
- Open workflow work or approvals return `WORKFLOW_BLOCKED` and cannot be rendered as completed.
- Read-back or Snapshot mismatch returns `VERIFICATION_FAILED`.

## Verification

- Core unit tests cover normal completion, cross-project rejection, Snapshot mismatch, blocked workflow, legacy conti compatibility, and idempotency.
- Vertical flow uses internal completion only: quote → contract → conti → shooting.
- Separate regressions prove internal completion does not insert portal publications.
- UI source tests prevent contract/conti final-completion buttons from returning to the generic complete-step endpoint.
- Run typecheck, full tests, production build, and safe browser QA without mutating production fixtures.
