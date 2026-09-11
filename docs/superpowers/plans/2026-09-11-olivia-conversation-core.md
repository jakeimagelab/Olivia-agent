# Olivia Conversation Core Implementation Plan

1. Add a typed, validated pending-action state stored in canonical conversation metadata.
2. Add a deterministic turn resolver for approve, reject, defer, and correction-shaped replies.
3. Add channel-neutral execution outcomes and a concise Korean response renderer.
4. Integrate pending-action resolution before Hermes/cloud routing in the shared v2 stream.
5. Capture every shared `REQUEST_APPROVAL` action into conversation state and expose it as a normal approval block.
6. Make web approval buttons resolve the same canonical pending action instead of bypassing conversation state.
7. Route Telegram approval UI through the shared approval representation while retaining transport-only preview behavior.
8. Add unit and regression tests for state transitions, wording rules, duplicate approval protection, and channel parity.
9. Run focused tests, the full suite, typecheck, touched-file lint, and production build.
10. Commit and push the completed implementation while leaving unrelated working-tree files untouched.
