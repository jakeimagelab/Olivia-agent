# Olivia 능동형 AI 비서 1차 설계

- 작성일: 2026-07-18
- 대상: Olivia Agent 최신 `main`
- 범위: Phase 1~5 및 기존 마케팅 기능 연결 지점
- 제외: 마케팅 전략 비서 고도화, 콘텐츠 자동 게시, 고객 메시지 자동 발송

## 1. 목표

기존 12단계 고객관리 워크플로우를 유지하면서, 활성 프로젝트를 주기적으로 관찰하고 위험·지연·누락·약속·기회를 먼저 발견하는 Observer 계층을 추가한다.

Olivia는 안전한 내부 기록과 브리핑만 자동 실행한다. 고객 연락, 포털 공개, 단계 이동 등 외부 상태를 바꾸는 행동은 기존 `agent_approvals`를 통해 대표 승인 후 실행한다.

## 2. 구현 원칙

1. `workflowAutomation.ts`는 단계 작업 생성·실행·승인·전환 책임을 계속 가진다.
2. Observer는 기존 자동화 엔진을 대체하거나 같은 기능을 복제하지 않는다.
3. DB 변경은 전부 additive migration으로 작성한다.
4. 활성 12단계 키와 레거시 단계 매핑을 변경하지 않는다.
5. 신규 기능 오류가 기존 고객 생성, 승인, 포털, 메일링 동작을 실패시키지 않게 격리한다.
6. 규칙 엔진이 사실 후보를 만들고 AI는 선택적으로 설명과 추천을 보완한다.
7. 동일 문제는 중복 생성하지 않고 열린 인사이트를 갱신한다.
8. 현재 mock fallback과 API 하위 호환 필드를 유지한다.

## 3. 현재 저장소 호환 조건

- 활성 워크플로우는 12단계지만 `WORKFLOW_STEPS`에는 레거시 및 독립 실행 키가 함께 존재한다.
- 고객 운영 API는 `hospital_name`, `contact_name`, `specialty` 필드를 사용한다.
- 별도 범용 `projects` 테이블이 없으므로 `workflow_runs.project_id`와 `project_name`을 기준으로 프로젝트 문맥을 구성한다.
- `quotes`, `contracts`에는 워크플로우 FK가 없으므로 초기 문맥 조회는 관련 ID, 고객명, 생성 시각을 제한적으로 사용한다.
- 선택 테이블이나 컬럼이 없는 환경에서는 조회 실패를 빈 값으로 처리한다.
- `/api/olivia/*`는 기존 관리자 미들웨어 보호 범위에 포함하며 `/api/cron/*`는 `CRON_SECRET`을 직접 검증한다.

## 4. 아키텍처

```text
기존 API·워크플로우
        │
        ▼
emitOliviaEvent()
        │
        ▼
olivia_events
        │
        ▼
Observer Engine
 ├─ 문맥 조회
 ├─ 결정 규칙
 ├─ 우선순위 계산
 └─ 선택적 AI 보완
        │
        ├─ olivia_insights
        ├─ olivia_actions
        ├─ agent_tasks 재사용
        ├─ agent_approvals 재사용
        └─ mailing_queue 재사용
```

### 4.1 구성 요소

- `events.ts`: 표준 사건 기록과 처리 상태 변경
- `context.ts`: 워크플로우 전체 문맥의 부분 실패 허용 조회
- `rules.ts`: 결정 가능한 15개 규칙
- `scoring.ts`: 0~100 우선순위 계산
- `analyzer.ts`: OpenAI Structured Output 기반 선택적 보완
- `permissions.ts`: AUTO, REVIEW_REQUIRED, OWNER_ONLY 분류
- `actionPlanner.ts`: 기존 업무·승인·메일링·워크플로우 함수 연결
- `observer.ts`: 한 실행 건 및 다중 실행 건의 오케스트레이션

## 5. 데이터 모델

신규 마이그레이션은 `supabase/olivia-proactive-assistant.sql`에 작성한다.

### 5.1 신규 테이블

- `olivia_events`: 사건 원본, 처리 상태, 발생 시각, 중복 키
- `olivia_insights`: 위험·지연·기회·추천과 점수, 상태, 스누즈
- `olivia_actions`: 준비·승인·실행 행동과 기존 업무/승인 참조
- `meeting_commitments`: 대표·고객·직원 약속과 기한
- `olivia_briefings`: 모닝·미팅 전후 브리핑
- `olivia_notification_history`: 알림 중복 및 재노출 제어
- `olivia_feedback`: 승인·수정 승인·거절·무시·스누즈·직접 처리

### 5.2 추가 필드

`workflow_runs`:

- `preparation_data jsonb`
- `work_progress jsonb`
- `next_action_due_at timestamptz`
- `next_action_owner text`
- `next_action_source text`
- `next_action_updated_at timestamptz`

`olivia_insights`:

- `snoozed_until timestamptz`
- `dismissed_reason text`
- `last_checked_at timestamptz`
- `occurrence_count integer`

`olivia_actions`:

- `deduplication_key text`

### 5.3 참조 및 RLS

- `workflow_run_id`는 실제 FK를 사용한다.
- 여러 운영 스키마와 호환해야 하는 `client_id`, `project_id`, `consultation_memo_id`는 초기에는 UUID 값만 저장한다.
- 신규 테이블에 RLS를 활성화하고 service role 전용 정책만 둔다.
- 외부 클라이언트가 service role key 또는 신규 내부 테이블에 직접 접근하지 않게 한다.

## 6. 중복 방지

인사이트와 행동은 안정적인 중복 키를 사용한다.

```text
approval_waiting:{approvalId}
failed_task:{taskId}:{retryCount}
workflow_stalled:{workflowRunId}:{stepKey}
shooting_missing:{workflowRunId}:{shootDate}:{missingFieldHash}
commitment_overdue:{commitmentId}
ready_mail_waiting:{mailingId}
```

열린 동일 인사이트가 있으면 신규 생성하지 않는다. 대신 `last_checked_at`, `occurrence_count`, 점수, 설명을 갱신한다. 해결 후 실제로 다시 발생한 문제는 상태 또는 기간을 포함한 새 키로 기록한다.

알림 재노출은 인사이트 신규 생성이 아니라 `olivia_notification_history.expires_at`으로 제어한다.

## 7. 이벤트 연결

### 7.1 사건 목록

- 고객: `customer.created`
- 메모: `consultation.memo_created`, `consultation.updated`
- 미팅: `meeting.recording_uploaded`, `meeting.transcribed`, `meeting.analyzed`
- 워크플로우: `workflow.started`, `workflow.step_changed`, `workflow.completed`
- 업무: `agent.task_created`, `agent.task_started`, `agent.task_completed`, `agent.task_failed`
- 승인: `approval.requested`, `approval.approved`, `approval.rejected`, `approval.revision_requested`
- 고객 포털: 견적·계약·콘티·갤러리 열람, 확인, 셀렉, 수정, 리뷰, 리워드 요청

### 7.2 이벤트 실패 정책

- 기존 작업 성공 후 이벤트를 기록한다.
- 이벤트 기록 실패로 기존 API 성공을 실패 응답으로 바꾸지 않는다.
- 실패는 개인정보를 제거해 `agent_logs`에 축약 기록한다.
- 기존 `portal_${event_type}` 로그는 유지한다.
- 이벤트 payload에 이메일, 전화번호, 계약 전문, 전체 녹취를 저장하지 않는다.

## 8. 문맥 구성

`buildWorkflowContext()`는 다음 값을 반환한다.

```text
workflowRun, client, project, currentStep, stepRuns,
tasks, approvals, mailing, consultationMemos, commitments,
quotes, contracts, galleries, revisions, rewards,
recentAgentLogs, recentEvents
```

필수인 `workflow_runs`가 없으면 해당 실행 건을 실패 처리한다. 그 외 테이블 조회 오류는 빈 배열 또는 `null`로 대체하고 진단 정보를 문맥 메타데이터에 남긴다.

## 9. 규칙 엔진

구현 규칙:

1. 승인 24시간 대기
2. 실패 업무 1시간 방치
3. 활성 실행의 다음 행동 없음
4. 견적·계약·콘티·셀렉·납품·수정 고객 미응답
5. 촬영 D-7 준비 누락
6. 촬영 D-3 고위험 누락
7. 촬영 D-1 긴급 누락 및 메시지 초안
8. 미팅 약속 마감 24시간 이내
9. 약속 기한 초과
10. 단계별 워크플로우 정체
11. 전환 가능하지만 12시간 미진행
12. ready 메일 12시간 방치
13. 보정 납기 위험
14. 프로젝트 완료 가능
15. 공개 동의된 긍정 후기 활용 기회

### 9.1 고객 미응답 판정

현재 단계만으로 추측하지 않는다.

```text
대표 승인 완료
+ 메일 ready/sent 또는 포털 공개 사건 존재
+ 이후 고객 반응 사건 없음
+ 단계별 기준 시간 초과
```

### 9.2 촬영 준비 정보

`workflow_runs.preparation_data`의 권장 구조:

```json
{
  "contractApproved": true,
  "depositConfirmed": true,
  "contiApproved": false,
  "contactPhone": "",
  "location": "",
  "medicalStaffCount": 0,
  "hasModel": null,
  "parkingInfo": "",
  "shootingTime": "",
  "shootingItems": []
}
```

기존 승인 데이터로 확인 가능한 값은 자동 병합하고 나머지는 수동 입력값을 사용한다.

## 10. 점수와 알림

```text
priorityScore =
  urgencyScore * 0.35 +
  impactScore * 0.30 +
  customerRiskScore * 0.20 +
  revenueScore * 0.15
```

반올림한 0~100 값을 저장한다.

- 80 이상: 긴급 대시보드 알림
- 60~79: 오늘 브리핑
- 40~59: 주간 기록
- 40 미만: 내부 기록만

## 11. AI 분석

처리 순서:

1. 규칙이 사실과 문제 후보를 만든다.
2. 필요한 최소 문맥만 구성한다.
3. AI가 중요도, 설명, 추천 행동을 보완한다.
4. Structured Output을 검증한다.
5. AI 실패 시 규칙 결과만 저장한다.

AI 입력에는 단계, 상태, 날짜, 업무 요약만 포함한다. 연락처, 계약 전문, 원본 녹취는 제외한다.

## 12. Action Planner와 권한

### AUTO

- 내부 인사이트·로그 저장
- 브리핑 생성
- 약속 추출
- 데이터 누락 검사
- 내부 업무 후보 생성
- 다음 행동 추천

### REVIEW_REQUIRED

- 고객 이메일·후속 연락
- 고객 포털 공개
- 견적·계약·콘티 공개
- NAS 링크 공유
- 직원 업무 배정
- 프로젝트 단계 이동
- 후기 활용 동의 요청

### OWNER_ONLY

- 가격·할인·계약 조건 변경
- 결제·환불
- 고객 불만 답변
- 외부 콘텐츠 게시
- 개인정보 외부 전송

초기 버전에서 단계 이동, 실패 작업 재실행, 고객 연락은 모두 승인 후보만 생성한다. 외부 게시와 파일 삭제는 구현하지 않는다.

## 13. 다음 행동 보호

- `next_action_source = manual`: Observer가 자동 덮어쓰지 않는다.
- `next_action_source = ai`: 새 분석으로 갱신 가능하다.
- 기존 행의 출처가 비어 있으면 기존 수동 데이터로 간주한다.
- AI 추천은 마감, 담당자, 출처, 수정 시각과 함께 저장한다.

## 14. API

신규 API:

```text
POST /api/olivia/events
GET  /api/olivia/events
POST /api/olivia/observer/run
GET  /api/olivia/insights
GET  /api/olivia/insights/[id]
POST /api/olivia/insights/[id]/acknowledge
POST /api/olivia/insights/[id]/dismiss
POST /api/olivia/insights/[id]/snooze
GET  /api/olivia/actions
POST /api/olivia/actions/[id]/prepare
POST /api/olivia/actions/[id]/approve
POST /api/olivia/actions/[id]/run
POST /api/olivia/actions/[id]/dismiss
GET  /api/olivia/briefings
GET  /api/olivia/briefings/latest
GET  /api/olivia/commitments
POST /api/olivia/commitments/[id]/complete
POST /api/olivia/meeting/pre-brief
POST /api/olivia/meeting/post-analysis
GET  /api/cron/olivia-observer
GET  /api/cron/olivia-morning-briefing
```

공통 응답은 `ok`, `data`, `error`를 사용하고 기존 요청서 호환 필드는 필요한 API에서 최상위에 유지한다.

행동 상태는 허용된 순서로만 전환하고 완료·무시된 행동의 중복 실행을 막는다.

## 15. 크론과 오류 격리

- Observer는 한 번에 최대 30개 활성 실행을 처리한다.
- 모닝 브리핑은 한국 날짜 기준 하루 한 건만 생성한다.
- 모든 크론은 `Authorization: Bearer ${CRON_SECRET}`을 검증한다.
- 워크플로우별 독립 `try/catch`를 사용한다.
- AI 오류는 해당 보완 분석만 건너뛴다.
- 실행 건 하나의 오류가 전체 크론을 중단하지 않는다.
- 이벤트는 `processed` 또는 `failed`로 종결한다.

## 16. 미팅 비서

기존 메모 분석 응답을 유지하면서 다음 구조를 추가한다.

```text
customerNeeds, confirmedItems, unresolvedItems,
representativeCommitments, clientCommitments,
objections, decisionMaker, desiredSchedule,
recommendedPackage, nextAction
```

미팅 후에는 분석 저장, 약속 중복 제거 저장, 다음 행동 추천, 내부 업무 후보, 고객 확인 메시지 초안, 견적 초안 제안, `meeting_post` 브리핑 생성을 수행한다.

미팅 전 브리핑은 고객 기본 정보, 최근 메모, 현재 단계, 열린 약속, 승인 대기, 확인 질문을 조합한다. 근거가 없는 항목은 생성하지 않고 `확인 필요`로 표시한다.

## 17. UI

기존 관리자 대시보드 상단에 `대표님, 지금 확인할 내용` 영역을 추가한다.

- 긴급
- 승인 대기
- 오늘 할 일
- 고객 반응
- 올리비아 제안

각 카드에는 발생 내용, 중요 이유, 고객·프로젝트, 기한, 준비된 행동을 표시한다. 상태와 권한에 맞춰 확인, 초안 보기, 승인, 스누즈, 무시, 직접 처리 버튼을 노출한다.

신규 `/olivia-assistant` 페이지는 오늘, 긴급, 승인 대기, 고객 반응, 약속, 제안, 브리핑, 실행 기록 탭을 제공한다.

고객 상세 화면과 `WorkflowBar`는 교체하지 않는다. 별도 컴포넌트로 인사이트 수, 긴급 문제, 약속, 다음 행동 메타데이터, Olivia 요약과 통합 타임라인을 추가한다.

신규 테이블이 없는 환경에서는 기존 UI를 유지하고 Olivia 영역만 빈 상태로 표시한다.

## 18. 테스트 전략

현재 저장소에는 테스트 실행기가 없다. 작은 단위 테스트 환경을 추가하고 규칙과 순수 함수를 우선 검증한다.

단위 테스트:

- 승인 장기 대기
- 실패 업무
- 고객 미응답
- 촬영 D-7, D-3, D-1
- 약속 임박 및 초과
- 정체 실행
- 전환 가능 미진행
- 중복 키 및 점수

통합 테스트는 Supabase 호출 계층을 주입 가능한 어댑터로 두고, 인메모리 또는 mock DB로 이벤트 → 인사이트 → 행동 흐름을 검증한다. 실제 외부 메일과 AI 호출은 수행하지 않는다.

최종 검증:

- 테스트 실행
- TypeScript 검사
- `npm run build`
- 주요 관리자 화면 브라우저 확인

## 19. 구현 순서

1. 마이그레이션과 타입
2. 이벤트 기록과 이벤트 API
3. 기존 API 이벤트 연결
4. 문맥, 규칙, 점수, 권한
5. Observer와 Action Planner
6. 인사이트·행동·브리핑·약속 API
7. Observer 및 모닝 브리핑 크론
8. 미팅 전후 비서
9. 관리자 대시보드와 Olivia 페이지
10. 고객 상세 요약과 타임라인
11. 테스트, 빌드, 브라우저 검증

각 단계에서 기존 기능 호환성과 빌드를 확인하며, 사용자 소유의 미추적 파일과 빌드 산출물은 커밋하지 않는다.

## 20. 이번 차수의 제한사항

- 마케팅 데이터는 기존 트렌드와 데일리 아이디어를 브리핑 후보로 읽는 연결 지점까지만 구현한다.
- 범용 프로젝트 테이블 신설은 하지 않는다.
- 견적·계약 테이블의 전면적인 관계형 마이그레이션은 하지 않는다.
- 고객 메시지, 이메일, 단계 이동, 외부 게시를 자동 실행하지 않는다.
- 모델 재학습은 하지 않고 `olivia_feedback`만 축적한다.

## 21. 완료 조건

요청서의 1차 완료 기준 15개를 대상으로 한다. 특히 Observer 자동 감시, 핵심 위험 규칙, 약속, 다음 행동, 승인 연결, 중복 방지, 스누즈, 모닝 브리핑, 감사 로그, 기존 워크플로우 호환, 테스트·빌드 성공을 필수 조건으로 둔다.
