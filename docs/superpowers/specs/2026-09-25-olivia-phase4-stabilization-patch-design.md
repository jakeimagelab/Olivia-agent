# OLIVIA 3.0 Phase 4 안정화 보완 설계

## 범위

신규 기능이나 대형 스트림 라우트 분리를 하지 않는다. 현재 Phase 4 구현 위에서 고객 대상 판정, 진행 타임라인 실패 상태, Hermes 폴백 메타데이터와 표시 의미만 안정화한다.

## 1. 고객 Target Policy 단일화

`lib/core/context/clientTarget.ts`를 고객 대상 판정의 유일한 정책 모듈로 둔다.

- `extractExplicitClientHint()`는 견적·계약·콘티 등 고객 종속 리소스 앞의 고객명 후보를 추출한다.
- `requireClientTarget()`과 최근 고객 후보 안내를 기존 tool executor 공통 함수에서 이 모듈로 옮긴다.
- `resolveTrustedClientProjectContext()`는 `explicit → snapshot → recent` 순서로 대상을 결정하되, 실행형 요청에서는 오래된 recent context를 복구하지 않는다.
- `shouldRequireClientSelection()`은 확정된 client ID도 없고 현재 문장에 명시 고객명 후보도 없을 때만 route에서 요청을 차단한다.
- 현재 문장에 고객명이 있으면 route는 차단하지 않는다. Hermes/tool이 DB에서 실제 고객을 확인하며, 이름 후보를 미리 확정 ID로 취급하지 않는다.
- `lib/hermes/runtimeContext.ts`, stream route, tool executors는 같은 정책 함수를 사용한다.

## 2. Progress Timeline 실패 상태

진행 상태 변환을 순수 helper로 분리하여 테스트한다.

- `agent_status`가 도착해도 `toolCallId`가 연결된 active 단계는 자동 성공 처리하지 않는다.
- `tool_result.success === true`일 때만 해당 도구 단계를 `done`으로 만든다.
- `tool_result.success === false`이면 `error`를 유지하며 이후 상태 이벤트가 이를 덮어쓰지 않는다.
- 정상 `message_complete`에서 일반 상태 단계는 `done`으로 닫되, 결과가 누락된 도구 단계는 `error`로 닫는다.
- 스트림 오류·타임아웃은 남아 있는 active 단계를 `error`로 닫는다.
- `tool_start`에 대응할 active 상태가 없어도 도구 진행 단계가 누락되지 않도록 fallback 단계를 만든다.

## 3. Hermes 폴백 의미와 QA

`fallbackReason`은 Hermes를 실제 시도했으나 안전한 시점에 대체 경로로 전환한 턴에만 존재한다.

- assistant 저장 메타데이터의 `agentEngine`은 route가 판정한 `hermes | legacy` 값으로 강제한다.
- legacy 응답 저장부의 잘못된 `agentEngine: "cloud"` override를 제거한다.
- 기존 `cloud + fallbackReason` 메시지는 hydration에서 legacy로 호환 정규화한다.
- 24시간 집계는 `fallbackReason` 존재를 실제 폴백의 기준으로 사용한다. 설정상 legacy로 시작한 정상 턴은 세지 않는다.
- 배지와 상태 패널은 특정 모델이 답했다고 단정하지 않고, Hermes 대신 대체 처리 경로로 완료됐다고 표현한다.

## 4. 회귀 테스트

- 명시 고객명이 있는 실행 요청은 active client가 없어도 route 정책을 통과한다.
- 고객명 없는 고객 종속 실행은 차단되며 최근 후보가 안내된다.
- 실행 요청은 recent history의 고객을 암묵적으로 복구하지 않는다.
- project/resource 변화는 고객 대상 정책을 바꾸지 않는다.
- 도구 성공, 도구 실패, 결과 누락, 타임아웃의 progress 최종 상태를 각각 검증한다.
- 정상 Hermes, 설정상 legacy, 실제 Hermes 폴백의 저장 메타데이터와 표시/집계를 구분한다.

## 5. 비범위

- `app/api/olivia/v2/stream/route.ts` 대형 분리
- `hermesTurn.ts`, `legacyTurn.ts` 도입
- 신규 상태 머신 또는 이벤트 형식 도입
- Hermes MCP catalog나 사진 파이프라인 변경
