# Olivia Conversation Core Design

## 1. Goal

Olivia must feel like one context-aware assistant regardless of whether the user talks through the web, mobile OS, or Telegram. Telegram is only a transport adapter. It must not contain its own interpretation rules or business conversation policy.

Natural conversation means more than friendly wording:

- Olivia remembers the current subject and unresolved request.
- Short replies such as “응”, “그렇게 해”, and “일단 보류” act on the correct pending work.
- Olivia never asks again for an approval the user already gave.
- Olivia reports a mutation as complete only after its persisted result is verified.
- Replies state the useful result once, without exposing tool names, routing decisions, database terminology, or internal uncertainty.

## 2. Chosen Approach

Use a shared conversation core with a structured dialogue state and a controlled response renderer.

Prompt-only tuning is rejected because it cannot reliably preserve approvals, targets, and execution truth across short follow-ups. Sending every result through an unrestricted second model is also rejected because it can turn a verified tool result into an inaccurate claim. The selected hybrid keeps state and execution deterministic while allowing natural language where it is safe.

## 3. Boundaries

### Conversation core

The shared Olivia v2 stream route remains the single entry point for conversational reasoning. Its responsibilities are split into focused modules:

1. `dialogueState` loads the active subject and any pending action from canonical conversation metadata.
2. `turnResolver` resolves the new utterance against that state before model routing. It identifies confirmation, rejection, postponement, correction, missing information, and ordinary chat.
3. The existing tool selection and execution layer performs the work.
4. `resultInterpreter` converts tool results and verification into a channel-neutral response outcome.
5. `conversationRenderer` turns that outcome into a concise, natural Olivia reply.

The stream route orchestrates these units but does not itself accumulate additional phrase-specific business rules.

### Channel adapters

Web, mobile OS, and Telegram all call the same conversation core and consume the same stream events and persisted messages. A channel adapter may only:

- receive and deliver text or attachments;
- present a shared approval as a native button or card;
- render a shared document preview appropriately for the channel;
- report delivery failures.

It must not decide what the user meant, whether an action is approved, which business tool to call, or how to describe the business result.

## 4. Structured Dialogue State

The active conversation metadata stores one current pending action. The initial implementation extends the existing `assistant_conversations.metadata`; it does not add a new table.

```ts
type OliviaPendingAction = {
  id: string;
  status: "pending" | "approved" | "rejected" | "deferred" | "completed" | "failed";
  intent: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  target?: {
    resourceType?: string;
    resourceId?: string;
    title?: string;
  };
  prompt: string;
  createdAt: string;
  resolvedAt?: string;
};
```

Rules:

- A tool-generated `REQUEST_APPROVAL` creates or replaces the pending action.
- “응”, “맞아”, “해줘”, “그렇게 해” approves and executes the exact stored tool and input.
- “아니”, “취소” rejects it without executing.
- “일단 보류”, “나중에” marks it deferred and preserves the linked resource so it can be found later.
- A correction such as “아니, 240으로” updates the requested value and follows the normal validation or approval policy for that operation.
- A completed or rejected action cannot execute a second time. Idempotency remains enforced by the executor as a second line of defense.
- If there is no pending action, a short acknowledgement remains ordinary chat and must not guess an operation.

Active resource metadata continues to identify the latest quote, contract, conti, temporary document, client, or other subject. The resolver prefers an explicit target in the new message, then reply context, pending-action target, active resource, and finally recent canonical history.

## 5. Turn Flow

1. Persist the user message in the owner’s active canonical conversation.
2. Load recent messages, compact summary, active resource, and pending action.
3. Resolve the turn deterministically when it is an unambiguous response to pending work.
4. Otherwise use the model for intent and tool selection with the resolved context.
5. Execute tools through the existing executor.
6. Verify persistence and required resource changes.
7. Convert the verified outcome into one of these response contracts:
   - `completed`: the action actually succeeded;
   - `needs_confirmation`: an exact action is waiting for approval;
   - `needs_input`: one essential fact is missing;
   - `deferred`: the work was safely retained for later;
   - `failed`: the action did not complete and the previous state is known;
   - `chat`: no business mutation was requested.
8. Render one user-facing response, persist it, then deliver the same content through the active channel.
9. Update or clear dialogue state only after persistence succeeds.

## 6. Natural Response Policy

For business actions, the executor supplies immutable facts such as action, target, value, verification, and failure state. The renderer may change wording but may not invent, omit, or reverse those facts.

Default reply shapes:

- Completed: `됐어요. 리나클리닉 견적을 230만 원으로 맞췄어요.`
- Confirmation: `리나클리닉 견적을 230만 원으로 맞출까요?`
- Missing input: `어느 병원 견적인지만 알려주세요.`
- Deferred: `알겠어요. 임시문서함에 그대로 둘게요.`
- Failed: `지금은 저장되지 않았어요. 기존 금액은 그대로예요. 다시 해볼까요?`

The renderer follows these constraints:

- Lead with the outcome.
- Prefer one or two short sentences.
- Do not repeat the user’s full instruction.
- Do not narrate planning or restate the internal task.
- Do not say “확인할 수 없다” when the system has not attempted the relevant tool.
- Do not expose tool names, model names, Hermes status, database details, or routing terminology unless the user explicitly asks for diagnostics.
- Match casual short input with a casual short answer; use polite Korean without becoming ceremonial.
- Ask at most one concrete question when essential information is missing.

Ordinary conversation can remain model-authored. Verified business outcomes use deterministic facts with either concise server-authored text or a constrained renderer. If rendering fails, a safe server-authored sentence is returned; execution is never repeated merely to regenerate wording.

## 7. Approval and UI Behavior

Approval is a conversation state, not a web-only card behavior.

- The core emits the same approval block for every channel.
- Web and mobile may show an approval card.
- Telegram may translate the block to inline buttons.
- Typed approval and button approval both resolve the same pending-action ID.
- The action is persisted as approved before execution and completed only after verification.
- A stale button or duplicate message returns a brief already-resolved response instead of executing again.

This makes text replies and UI controls equivalent views of the same operation.

## 8. Failure Handling

Internal errors remain in logs. The user-facing response distinguishes these cases:

- Not attempted: explain the single missing input or ask whether to retry.
- Attempted but failed: say that it did not complete and state whether existing data remains unchanged.
- Executed but verification failed: never claim success; say the result could not be confirmed and offer a retry or direct check.
- Partial multi-action result: name what succeeded and what did not in separate short sentences.
- Channel delivery failure: keep the canonical assistant message and execution state; retrying delivery must not repeat the business action.

Hermes availability affects which runtime performs reasoning, but it must not change dialogue-state resolution, execution truth, or user-facing tone. The cloud fallback uses the same core.

## 9. Initial Scope

The first implementation applies the architecture to the existing Olivia v2 chat path and all channels already using it. It covers:

- approvals and short follow-ups;
- quote, contract, conti, temporary-document, and client-registration actions;
- shared success, deferred, missing-input, and failure responses;
- removal of Telegram-specific intent and approval decisions where the core now owns them.

It does not introduce a new personality settings UI, multiple personas, or a separate long-term-memory product. Those can build on the core later.

## 10. Testing and Acceptance

Unit tests cover dialogue-state transitions, target precedence, response contracts, rendering constraints, stale approvals, and verified-result handling. Integration tests run the same transcript through web and Telegram adapters and assert identical tool intent, target, and canonical response facts.

A regression corpus includes the observed failures:

- “230만 원으로 맞출까요?” → “맞아, 230만 원으로 맞추면 돼” executes once and answers with verified completion.
- A following “해줘” does not merely paraphrase the requested operation.
- “일단 보류” retains the temporary document without client registration.
- “예전에 등록한 OO병원 고객등록” finds the retained document and resumes the correct flow.
- Hermes being offline does not make the fallback assistant deny or forget an otherwise executable action.
- No response contains internal phrases such as “조정 적용 요청”, raw database errors, or unverified completion claims.

Before release, run the full automated test suite, type checking, lint for touched files, and production build. A manual smoke test must verify one approval flow and one deferred-document flow from both Olivia web chat and Telegram.

## 11. Rollout

Implement behind an internal conversation-core feature flag if necessary for safe comparison, but keep one canonical state format. Add structured logs for resolved turn type, pending-action ID, executed tool, verification state, renderer mode, and channel. Logs must contain diagnostics without leaking them into user-visible text.

Success is measured by behavior: a short follow-up consistently affects the intended object, mutations are reported truthfully, and the reply reads like a natural continuation rather than an explanation of the system’s work.
