# Hermes–Olivia Reliability Completion Design

## Goal

Complete and stabilize the existing uncommitted Hermes–Olivia integration work without expanding its feature scope. Hermes remains the primary conversational engine, while Olivia's existing executors remain the canonical implementation for business operations.

## Scope

- Finish the current Hermes MCP bridge and runtime-context changes.
- Stabilize the calendar, client, memo, work, analysis, quote, contract, workflow, and Conti V2 paths already touched in the working tree.
- Preserve the existing approval boundaries for destructive, publish, and externally visible operations.
- Preserve safe cloud fallback for failures that occur before user-visible output or a tool mutation begins.
- Update only tests and implementation directly required to make the current change set correct.

The work does not add new product features, expose additional sensitive tool domains, redesign user interfaces, or refactor unrelated modules.

## Architecture

Olivia's v2 tool executors are the single canonical execution layer. Hermes MCP registrations translate public MCP tool calls into those executors and return normalized results. Shared runtime and execution context carry user, hospital, conversation, and request identity through the bridge without introducing a second business-logic path.

Domain services are used where a browser route and a tool executor need identical behavior. API routes remain thin adapters around those services. Legacy Conti storage must not be used by the new Hermes Conti tools; Conti V2 operates only on the canonical run, group, and scene model.

## Data and Error Flow

1. Web or Telegram submits a conversational request with its identity and conversation context.
2. Hermes handles the request and may invoke an exposed MCP tool.
3. The MCP registration validates input, establishes execution context, and calls the matching Olivia executor.
4. Mutations perform a read-back or equivalent postcondition check before reporting success.
5. Errors are normalized so callers can distinguish validation failures, missing records, ambiguous matches, authorization failures, and infrastructure failures.
6. Cloud fallback is permitted only when Hermes fails before emitting user-visible text or starting a tool operation. Mid-stream and post-mutation failures are returned without retrying through another engine.

## Safety Rules

- Hospital and user scope must be explicit for scoped reads and mutations.
- Ambiguous client or workflow matches fail with actionable candidate information rather than selecting silently.
- Delete, publish, send, and other externally visible actions retain request/approve or request/confirm boundaries where they already exist.
- Success responses may not conceal failed writes, failed read-back verification, or persistence errors.
- Existing user changes and unrelated untracked artifacts remain untouched.

## Verification

Verification proceeds from narrow to broad:

1. Run the Hermes, runtime-context, calendar, memo, Conti, publication, and tool-verification tests affected by the current diff.
2. Repair failures only within the approved scope and add regression coverage for any newly identified defect.
3. Run TypeScript type checking.
4. Run the complete test suite.
5. Run lint on the touched source and test files, or the repository-wide lint command when practical.

Completion requires all relevant tests and type checking to pass. Any unrelated pre-existing repository failure must be reported separately with evidence rather than being folded into this change.
