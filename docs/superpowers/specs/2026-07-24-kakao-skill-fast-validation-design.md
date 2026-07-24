# Kakao Skill Fast Validation Design

## Problem

Kakao reaches `POST /api/kakao/skill` and receives HTTP 200, but the Kakao
builder reports an invalid skill-server response. Kakao requires a valid skill
response within five seconds. The route currently loads the Olivia core,
conversation, job, voice, and Supabase modules before it knows whether the
request needs those systems, increasing cold-start latency.

## Chosen approach

Keep the existing endpoint and security model, but make its validation path
lightweight:

- accept Kakao's conventional `x-api-key` header in addition to the existing
  `x-olivia-kakao-skill-secret` header;
- parse and validate the request before loading database and Olivia Core
  modules;
- dynamically import database and feature services only in the branches that
  use them;
- return the existing Kakao 2.0 `simpleText` response for malformed test
  payloads, without touching the database;
- retain the existing 403 response for missing or incorrect secrets;
- record only sanitized timing and failure-stage information in server logs.

The secret value, owner-only account policy, database schema, webhook
deduplication, confirmations, and conversation synchronization remain
unchanged.

## Alternatives considered

1. Change only the header name. This is low risk but does not address the
   observed cold-start timeout risk.
2. Enable Kakao Callback API for every request. This supports long AI work but
   requires separate Kakao approval and does not solve skill registration.
3. Add a separate health URL. This could pass registration while hiding a slow
   production endpoint, so it is not used.

## Verification

- unit-test both accepted header names and malformed payload responses;
- run the Kakao adapter tests and TypeScript checks;
- build the production application;
- deploy and verify the production endpoint returns Kakao 2.0 JSON within five
  seconds;
- retry the Kakao skill-server transmission using `x-api-key`.
