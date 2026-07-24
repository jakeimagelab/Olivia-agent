# Olivia 2.0 대표자용 카카오 채널 연동 설계

작성일: 2026-07-24  
상태: 사용자 승인 완료  
범위: 대표자(OWNER) 1인용 1차 연동

## 1. 목적

Olivia 웹 대시보드의 올리비아챗과 카카오톡이 서로 다른 AI로 동작하지 않도록 한다. 두 채널은 동일한 대화 문맥, 권한 정책, Action 실행기, 승인 상태와 업무 데이터를 공유한다.

카카오톡은 독립 프로그램이 아니라 Olivia의 외부 입력 및 알림 채널이다. 고객용 상담 챗봇과 불특정 사용자 가입은 1차 범위에서 제외한다.

## 2. 승인된 결정

- 기존 `/api/olivia`에 카카오 로직을 직접 누적하지 않는다.
- 기존 기능을 유지하면서 공통 Olivia Core를 단계적으로 추출한다.
- 1차 연결 대상은 현재 Olivia 대표자 관리자 1명뿐이다.
- 데이터 모델과 권한 타입은 향후 ADMIN, STAFF, READ_ONLY 확장을 허용한다.
- 카카오 비즈니스 채널, 챗봇, 비즈 앱은 아직 생성되지 않은 상태다.
- 실제 카카오 자산이 준비되기 전에는 공식 payload를 재현하는 시뮬레이터로 Core, Action, 승인, 중복 방지 흐름을 검증한다.
- 카카오 음성 원본 수신 가능 여부는 실제 채널 개설 뒤 검증한다. 직접 수신이 불가능하면 보안 웹 음성 입력 링크를 사용한다.

## 3. 기존 구조 분석

### 3.1 현재 Olivia AI

`app/api/olivia/route.ts`가 현재 사실상의 Olivia Core다.

- Anthropic Claude 호출
- 시스템 프롬프트
- 단축 의도 처리
- 도구 정의
- 도구 실행
- DB 조회
- CRUD 실행
- 페이지 이동 응답

이 기능들이 한 라우트에 함께 있어 채널을 추가할수록 결합도가 높아진다. 기존 동작을 한 번에 재작성하지 않고, 공통 인터페이스를 먼저 만든 뒤 기능 단위로 이동한다.

### 3.2 웹 올리비아챗

`components/OliviaChat.tsx`는 다음 역할을 동시에 처리한다.

- 웹 메시지 상태
- 대화 저장 및 재조회
- `/api/olivia` 호출
- 도구 요청 렌더링
- 일부 도구 자동 실행
- 승인 카드
- 첨부파일

웹 채널의 UI 동작은 유지하되, 메시지 처리와 Action 실행 정책은 서버 공통 계층으로 옮긴다.

### 3.3 텔레그램

`app/api/telegram/route.ts`는 텍스트, 사진, 음성(STT), Olivia 호출, 도구 실행, 응답 전송을 한 파일에서 처리한다.

현재 텔레그램은 일부 도구를 승인 없이 바로 실행한다. 이는 새 승인 정책과 충돌한다. 카카오 개발 중 텔레그램을 제거하지 않으며, 공통 Channel Adapter와 Confirmation Service를 사용하도록 후속 이전한다.

### 3.4 기존 대화 저장

`olivia_chat_messages`는 현재 `web`, `telegram` 소스 대화를 저장하며 `metadata`가 추가되어 있다. 기존 데이터를 보존하고 다음 컬럼을 additive migration으로 확장한다.

- conversation_id
- owner_id
- external_message_id
- parent_message_id
- channel
- delivery_status

기존 `source`, `chat_id`, `metadata`는 호환성을 위해 유지한다.

### 3.5 기존 Action 및 승인

다음 구조를 재사용한다.

- `olivia_actions`: 관찰자가 제안한 능동형 업무 Action
- `agent_tasks`: 자동화 업무
- `agent_approvals`: 기존 승인 대기
- `team_tasks`: 직원용 업무
- `lib/olivia/permissions.ts`: 권한 수준
- `lib/olivia/actionPlanner.ts`: 상태 전이, 중복 키, 실행 이벤트

대화에서 발생한 일반적인 캘린더, 메모, 조회 요청은 워크플로우 중심의 `olivia_actions`만으로 표현하기 어렵다. 따라서 채널 공통 실행 요청을 기록하는 `assistant_action_requests`를 추가하고, 필요할 때 기존 `olivia_actions` 또는 `agent_approvals`를 참조한다.

### 3.6 기존 알림과 브리핑

다음 기능이 이미 존재한다.

- `olivia_notification_history`
- `olivia_briefings`
- 캘린더 알림 Cron
- 아침 브리핑 생성 Cron
- 텔레그램 발송 유틸
- Olivia 이벤트와 deduplication key

새 알림 시스템을 별도로 중복 구축하지 않는다. 수신자, 채널, 예약 시간, 발송 결과, 읽음 상태를 확장하고 카카오 어댑터를 추가한다.

### 3.7 인증의 현재 한계

대표자 로그인은 `pc_admin_session=active` 쿠키로만 판별되어 고유 사용자 ID가 없다. 팀채팅은 별도의 Supabase 사용자와 `chat_members`를 사용한다.

1차에서는 singleton OWNER 프로필을 생성하고 현재 관리자 세션을 이 OWNER로 해석한다. 카카오 계정은 이 프로필 하나에만 연결한다. 서비스 키는 서버에서만 사용한다.

### 3.8 이메일의 현재 한계

현재 Google OAuth는 다음 범위에 한정되어 있다.

- 브라우저 쿠키에 1시간짜리 access token 저장
- `gmail.metadata` 권한
- 보낸 메일의 수신자 헤더 조회
- refresh token의 서버 영구 저장 없음

따라서 중요 메일 능동 감지, 본문 읽기와 요약, 서버 Cron 브리핑은 현재 구조로 구현할 수 없다. 이메일 단계에서는 별도 재동의와 암호화된 refresh token 저장이 필요하다.

## 4. 목표 아키텍처

```text
Web Adapter ─────┐
Telegram Adapter ├─> Conversation Service ─> Olivia Core
Kakao Adapter ───┤                              │
Voice Adapter ───┘                              v
                                      Intent / Action Registry
                                                  │
                                      Permission Service
                                                  │
                                      Confirmation Service
                                                  │
                                      Action Dispatcher
                                                  │
                           Calendar / Task / Memo / Project / Mail / Photo
                                                  │
                                      Notification Service
                                                  │
                              Web / Kakao / Telegram output
```

채널 어댑터는 다음만 담당한다.

- 외부 payload 검증 및 정규화
- 공통 메시지 입력 형식으로 변환
- 공통 응답을 채널별 카드, 버튼, 텍스트로 변환
- 채널별 전송 결과 기록

AI 해석, 권한, 승인, 실제 업무 실행은 어댑터에 작성하지 않는다.

## 5. 권장 코드 구조

현재 프로젝트가 `app`, `components`, `lib` 루트 구조를 사용하므로 `src/features`를 새로 도입하지 않는다.

```text
lib/assistant/
  core/
    oliviaCore.ts
    intentRouter.ts
    contextManager.ts
    responseGenerator.ts
  actions/
    registry.ts
    dispatcher.ts
    types.ts
    calendar.ts
    task.ts
    memo.ts
    project.ts
    quote.ts
    photo.ts
    email.ts
  channels/
    types.ts
    web.ts
    telegram.ts
    kakao.ts
    voice.ts
  conversations/
    service.ts
  confirmations/
    service.ts
  notifications/
    service.ts
    priority.ts
  permissions/
    service.ts
  validation/
    index.ts

app/api/assistant/
  message/route.ts
  actions/[actionId]/confirm/route.ts
  actions/[actionId]/cancel/route.ts
  conversations/route.ts

app/api/kakao/
  skill/route.ts
  link/route.ts
  unlink/route.ts
  channel-webhook/route.ts
  simulator/route.ts

components/olivia/kakao/
  KakaoConnectionSettings.tsx
  KakaoNotificationSettings.tsx
  AssistantActionHistory.tsx
  AssistantApprovalInbox.tsx
  KakaoSkillSimulator.tsx
```

파일명은 구현 중 기존 규칙과 충돌하면 조정할 수 있으나 계층의 책임은 유지한다.

## 6. 공통 메시지 계약

```ts
type AssistantChannel = "web" | "telegram" | "kakao" | "voice";

type AssistantIncomingMessage = {
  requestId: string;
  externalMessageId?: string;
  conversationId?: string;
  ownerId: string;
  channel: AssistantChannel;
  content: string;
  attachments?: AssistantAttachment[];
  parentMessageId?: string;
  callbackUrl?: string;
  receivedAt: string;
};
```

`requestId`, `externalMessageId`, 채널을 조합한 unique key로 중복 웹훅과 중복 실행을 차단한다.

## 7. Action 계약

AI가 DB를 임의 변경하지 않도록 모든 실행을 등록된 Action으로 제한한다.

```ts
type AssistantActionDefinition<TInput, TResult> = {
  actionName: string;
  description: string;
  permissionLevel: "OWNER" | "ADMIN" | "STAFF" | "READ_ONLY";
  confirmationRequired: boolean;
  validate(input: unknown): TInput;
  execute(context: AssistantActionContext, input: TInput): Promise<TResult>;
  rollback?: (
    context: AssistantActionContext,
    result: TResult,
  ) => Promise<void>;
  audit: boolean;
};
```

1차 등록 Action:

- `calendar.search`
- `calendar.getAvailability`
- `calendar.create`
- `calendar.update`
- `calendar.cancel`
- `task.search`
- `task.create`
- `task.complete`
- `memo.search`
- `memo.create`
- `project.search`
- `project.getStatus`
- `quote.search`
- `contract.getStatus`
- `photo.getStatus`
- `email.search`
- `email.read`
- `email.summarize`
- `email.createDraft`
- `notification.create`
- `briefing.generate`

실제 Action 구현은 기존 API 라우트를 내부 HTTP로 재호출하지 않고 기존 서버 유틸 또는 추출한 서비스 함수를 직접 사용한다.

## 8. 확인 및 상태 전이

상태:

- `queued`
- `processing`
- `waiting_confirmation`
- `approved`
- `completed`
- `failed`
- `cancelled`
- `expired`

규칙:

- 조회는 즉시 실행한다.
- 메모와 내부 할 일 생성은 기본 즉시 실행하되 정책으로 변경 가능하게 한다.
- 카카오 일정 생성은 확인 후 실행한다.
- 변경, 삭제, 외부 발송, 고객정보 변경, 금액 확정, 파일 작업은 항상 확인한다.
- 승인 시 DB에서 현재 상태와 만료 시간을 원자적으로 확인한다.
- 같은 승인 토큰은 한 번만 사용할 수 있다.
- 실행 직전 대상의 현재 상태를 다시 읽는다.
- 사용자 응답이 `변경`, `취소`처럼 짧아도 parent action과 conversation context로 연결한다.

## 9. 대표자 카카오 연결

1. 로그인된 Olivia 관리자 화면에서 일회용 코드 생성
2. 코드 원문은 한 번만 표시하고 DB에는 해시만 저장
3. 카카오에서 `올리비아 연결 {코드}` 입력
4. 만료, 사용 여부, 시도 횟수 검증
5. 성공 시 `botUserKey`, 가능하면 `plusfriendUserKey`, 추후 `appUserId`를 OWNER 연결에 저장
6. 이후 같은 카카오 사용자만 명령 실행 허용
7. 연결 해제 시 채널 연결을 비활성화하되 감사 로그는 보존

연결 실패는 rate limit을 적용하고 기술 오류를 사용자에게 노출하지 않는다.

## 10. 카카오 공식 연동 제약

### 10.1 인바운드

카카오 챗봇 관리자센터의 Skill 서버 요청을 `/api/kakao/skill`에서 받는다.

- payload 스키마 검증
- 설정된 스킬 비밀 헤더 검증
- `X-Request-Id` 및 외부 메시지 ID 기반 중복 방지
- 미연결 사용자 차단
- 5초 내 응답

### 10.2 긴 AI 처리

카카오 Skill은 처리 제한이 짧아 긴 AI 응답에 Callback API가 필요하다.

- Callback 승인이 없으면 즉시 접수 안내와 웹 결과 저장
- Callback 승인이 있으면 DB 작업 큐에 저장하고 `useCallback` 응답
- callback URL은 암호화 또는 제한된 수명으로 저장
- 유효 시간 내 한 번만 호출
- 실패 시 대시보드 알림 및 재시도 가능 상태 기록

### 10.3 능동 알림

능동 알림은 Event API 자격과 월렛 설정 전에는 실제 발송할 수 없다.

- 준비 전: 알림을 DB와 웹에 정상 저장
- 준비 후: 카카오 Event Adapter 활성화
- 접수 성공과 실제 전달 성공을 구분
- task 결과 조회로 최종 발송 상태 갱신
- 비용이 발생하는 발송은 설정된 중요도와 수신 동의에 따라 제한

## 11. 음성 설계

현재 확인된 공식 Skill payload는 일반 음성 메시지 원본 파일 전달을 명확히 보장하지 않는다.

두 경로를 지원한다.

### 경로 A: 직접 음성 수신

실제 봇에서 음성 또는 파일 URL이 전달되는 것이 확인되면:

1. 서명 및 URL 검증
2. 크기와 MIME 제한
3. 임시 저장
4. 지원 포맷 변환
5. STT
6. 정규화 및 사용자 사전 적용
7. 공통 Core 전달
8. 임시 파일 삭제

### 경로 B: 보안 웹 녹음

직접 수신이 불가능하면 카카오 버튼으로 1회용 웹 녹음 페이지를 연다.

- OWNER 연결과 일회용 토큰 검증
- 모바일 브라우저 녹음
- STT 완료 후 원본 삭제
- 결과는 원래 카카오 conversation에 연결
- 낮은 신뢰도는 실행하지 않고 확인

음성 직접 수신을 실제 검증하지 않은 상태로 완료 처리하지 않는다.

## 12. 이메일 설계

이메일 단계에서 Google OAuth 연결을 다음과 같이 확장한다.

- `gmail.readonly`로 재동의
- 답장 초안이 필요하면 `gmail.compose`
- 실제 발송은 별도 승인과 필요한 최소 권한 사용
- refresh token은 서버에서 AES-GCM으로 암호화 저장
- 암호화 키는 환경변수로만 제공
- 토큰과 본문을 로그에 남기지 않음
- 중요 메일 판단 근거만 구조화해 저장
- 서버 Cron과 브리핑에서 refresh token으로 갱신

기존 메일링용 브라우저 쿠키 흐름은 먼저 유지하고 새 연결로 점진적으로 교체한다.

## 13. 알림 및 브리핑

기존 `olivia_notification_history`, `olivia_briefings`, Olivia 이벤트를 확장한다.

알림은 다음 정보를 가진다.

- recipient
- type
- priority
- channels
- deduplication_key
- scheduled_at
- sent_at
- read_at
- action_taken
- delivery status per channel

우선순위:

- `CRITICAL`: 방해 금지 시간에도 즉시
- `HIGH`: 빠른 확인
- `NORMAL`: 다음 브리핑
- `LOW`: 웹 기록 중심

브리핑:

- 아침: 일정, 준비, 마감, 중요 메일, 승인
- 오후: 오전 완료, 남은 일정, 새 중요 메일, 지연
- 저녁: 완료, 미완료, 내일 일정과 준비

기존 아침 브리핑 생성기를 공통 생성기로 확장하고 시간과 채널은 OWNER 설정에서 관리한다.

## 14. 데이터베이스 변경

단일 additive migration을 기준으로 하되 구현 규모에 따라 안전하게 분할할 수 있다.

신규 테이블:

- `assistant_owners`
- `assistant_channel_connections`
- `assistant_conversations`
- `assistant_action_requests`
- `assistant_confirmations`
- `assistant_delivery_attempts`
- `assistant_webhook_events`
- `assistant_link_codes`
- `assistant_notification_settings`
- `assistant_audit_logs`
- `assistant_jobs`
- `assistant_oauth_credentials`

기존 테이블 확장:

- `olivia_chat_messages`: conversation, owner, external ID, parent, delivery 상태
- `olivia_notification_history`: recipient, channel, delivery 상태
- `olivia_briefings`: owner 및 발송 상태

제약:

- 기존 테이블 삭제 또는 재생성 금지
- 상태와 역할은 CHECK constraint
- 중복 웹훅, 연결 ID, confirmation token, deduplication key는 unique index
- token 원문 저장 금지
- 서비스 역할 외 직접 접근 차단
- 관리자 UI API에서도 서버 측 `pc_admin_session` 검증

## 15. 비동기 작업

새 외부 Queue 제품을 바로 추가하지 않고 Supabase DB 기반 작업 큐와 Vercel Cron을 사용한다.

대상:

- 긴 AI 응답
- Kakao Callback
- STT
- 이메일 분석
- 브리핑
- Event API 발송
- 재시도

작업은 lease 기반으로 claim하고 다음을 기록한다.

- attempt count
- lease expiration
- next retry
- last error category
- terminal status

동일 작업을 여러 인스턴스가 동시에 실행하지 않도록 원자적 claim RPC를 사용한다.

## 16. 오류와 보안

- 모든 외부 payload 런타임 검증
- 카카오 스킬 비밀 헤더와 채널 webhook 인증 분리
- API key, callback URL, OAuth token, 음성 URL 로그 금지
- user-facing error와 internal error 분리
- 외부 fetch timeout 적용
- rate limit 및 실패 인증 잠금
- callback과 Event API 재시도에 idempotency 적용
- DB 변경은 Action Dispatcher만 수행
- AI 프롬프트 결과만으로 권한을 결정하지 않음
- 민감한 고객 데이터는 카카오에 최소 표시
- 긴 문서와 원본 파일은 만료 링크로 웹에서 열기

## 17. 대시보드 UI

기존 Olivia UI와 동일한 디자인 시스템을 사용한다.

Olivia 설정 또는 채팅 내부에 다음 영역을 추가한다.

- 카카오 연결 상태
- 연결 코드 발급 및 해제
- 마지막 수신/발신 시간
- 알림과 브리핑 시간
- 방해 금지 시간
- 웹/카카오/음성 대화 기록
- 실행 및 오류 기록
- 승인 대기함
- 카카오 Skill 시뮬레이터(개발 모드)

별도 복잡한 관리자 제품처럼 만들지 않고 연결, 알림, 기록, 승인 네 영역으로 제한한다.

## 18. 단계별 구현

### A. 기반

- migration
- 타입
- validation
- Conversation Service
- Action Registry 인터페이스
- 테스트 fixture

### B. 기존 Core 공통화

- 기존 `/api/olivia` 동작을 공통 Core 뒤로 이동
- 웹 어댑터 연결
- 텔레그램은 호환 래퍼 유지
- 기존 웹 대화, 첨부, 승인 회귀 검증

### C. 대표자 연결 및 Kakao Adapter

- OWNER 프로필
- 연결 코드
- Skill payload parser
- message builder
- webhook idempotency
- simulator

### D. 주요 Action

- 캘린더
- 할 일
- 메모
- 프로젝트
- 견적/계약 조회
- 사진 작업 상태

### E. 승인 동기화

- 승인 생성, 만료, 진행, 취소
- 카카오 quick reply
- 웹 승인함
- 양쪽 상태 Realtime 또는 polling 반영

### F. 이메일

- OAuth 재동의
- 암호화 refresh token
- 조회, 본문, 요약, 답장 초안
- 실제 발송 승인

### G. 알림 및 브리핑

- 공통 알림
- 중요도 필터
- 아침, 오후, 저녁
- quiet hours
- Event Adapter

### H. 음성

- 실제 Kakao 입력 조사
- 직접 수신 또는 웹 녹음
- STT, 정규화, 삭제

### I. 실제 카카오 연결

- 비즈니스 채널 및 앱 생성
- 챗봇 연결
- Callback 승인
- Event API와 월렛
- 실기기 테스트

## 19. 테스트 전략

단위 테스트:

- Skill payload 파싱
- 메시지 빌더 제한
- 날짜 및 시간 정규화
- Action 입력 검증
- OWNER 권한
- confirmation 만료와 1회 사용
- notification dedupe
- quiet hours
- webhook idempotency

통합 테스트:

- 웹 메시지 → Core → 조회 Action → 저장
- Kakao simulator → Core → Action → Kakao response
- 일정 생성 → 승인 → 단일 실행
- 웹 승인 요청 → Kakao 승인
- Kakao 승인 → 웹 반영
- 외부 API timeout과 재시도
- 등록되지 않은 사용자 차단
- 같은 webhook 두 번 수신
- callback 만료

회귀 테스트:

- 기존 웹 올리비아챗
- 기존 첨부파일
- 기존 텔레그램 텍스트와 음성
- 캘린더 CRUD
- Olivia observer, action, approval
- 팀 업무와 agent 업무 분리

최종 명령:

```bash
npm run typecheck
npm run test
npm run build
```

## 20. 외부 준비사항

코드 개발과 병행하거나 실제 연결 전에 다음이 필요하다.

1. 카카오 비즈니스 계정
2. 비즈니스 채널
3. 챗봇 관리자센터 봇
4. 비즈 앱
5. 채널, 앱, 봇 연결
6. Skill URL과 비밀 헤더 등록
7. AI Callback 사용 신청
8. Event API 요건과 월렛 설정
9. 채널 친구 추가 및 테스트 계정
10. Google 이메일 재동의

환경변수 후보:

- `KAKAO_BOT_ID`
- `KAKAO_REST_API_KEY`
- `KAKAO_ADMIN_KEY`
- `KAKAO_SKILL_SECRET`
- `KAKAO_CHANNEL_PUBLIC_ID`
- `ASSISTANT_LINK_CODE_PEPPER`
- `ASSISTANT_CREDENTIAL_ENCRYPTION_KEY`
- `ASSISTANT_OWNER_EMAIL`
- 기존 `CRON_SECRET`
- 기존 Google OAuth 변수

키가 없는 경우 카카오 발송 기능은 명시적으로 disabled 상태여야 하며 mock 성공을 반환하지 않는다.

## 21. 완료 판단

코드 단계의 완료와 외부 연동 완료를 분리한다.

### 코드 준비 완료

- 공통 Core와 Action이 웹 및 Kakao simulator에서 동일하게 동작
- OWNER 연결, 승인, 로그, 중복 방지 통과
- 주요 Action 통과
- 기존 기능 회귀 테스트 통과
- 환경변수 누락 시 안전한 disabled 처리

### 실제 1차 연동 완료

- 실제 카카오 OWNER 연결
- 실제 텍스트 명령
- 실제 승인 버튼
- Callback 결과 전달
- Event API 알림과 브리핑
- 실제 음성 직접 수신 또는 승인된 대체 경로
- 웹과 카카오 기록 및 상태 동기화
- 실제 기기 테스트 기록

카카오 자산과 외부 승인이 없는 상태에서는 코드 준비 완료까지만 보고하며, 실제 카카오 연동 완료로 표현하지 않는다.

## 22. 비범위

- 고객 상담 챗봇
- 다중 조직
- 불특정 가입
- 카카오 내부 복잡한 CRM
- 무승인 이메일 발송
- 자동 견적/계약 확정
- 사진 원본 직접 전송
- 대규모 파일 업로드
- 고객 개인정보의 광범위한 카카오 노출

## 23. 성공 기준

- 웹과 카카오가 하나의 Olivia Core, Action Registry, Permission, Confirmation을 사용한다.
- 대표자 이외 사용자는 실행할 수 없다.
- 위험 작업은 승인 전에 실행되지 않는다.
- 동일 웹훅과 승인 응답은 한 번만 실행된다.
- 대화와 업무 상태가 양방향으로 동기화된다.
- 능동 알림은 중복과 방해 금지 정책을 지킨다.
- 외부 설정이 없을 때 실패를 숨기거나 성공으로 가장하지 않는다.
- 기존 웹 올리비아챗, 텔레그램, 캘린더, 워크플로우, 팀 업무가 손상되지 않는다.

