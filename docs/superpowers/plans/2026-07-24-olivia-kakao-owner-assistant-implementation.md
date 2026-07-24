# Olivia 2.0 대표자용 카카오 연동 구현 계획

설계 문서: `docs/superpowers/specs/2026-07-24-olivia-kakao-owner-assistant-design.md`

## 원칙

- 기존 웹 올리비아챗, 텔레그램, 첨부파일, 워크플로우 기능을 보존한다.
- 기존 미커밋 변경과 무관한 파일은 수정하거나 스테이징하지 않는다.
- 카카오 외부 자산이 없는 상태에서 실제 송수신 성공을 가장하지 않는다.
- 각 단계는 독립 테스트와 `npm run typecheck`를 통과한 뒤 다음 단계로 이동한다.
- DB 변경은 additive migration만 사용한다.

## Task 1. 기반 스키마

파일:

- `supabase/migrations/20260724_owner_assistant_channels.sql`

구현:

- OWNER, 채널 연결, conversation, action request, confirmation
- webhook event, delivery attempt, link code, notification setting
- audit log, DB job, OAuth credential
- 기존 `olivia_chat_messages`, `olivia_notification_history`, `olivia_briefings` 확장
- 상태 CHECK, unique/partial/composite index
- 원자적 job claim과 confirmation claim RPC
- service role 중심 RLS

검증:

- 기존 테이블 삭제/재생성 없음
- idempotent migration
- FK 컬럼 및 RLS 필터 컬럼 index

## Task 2. 공통 타입과 검증

파일:

- `lib/assistant/types.ts`
- `lib/assistant/validation.ts`
- `lib/assistant/validation.test.ts`

구현:

- channel, role, message, action, confirmation, notification 타입
- UUID, 날짜, 제목, payload 크기 검증
- 안전한 사용자 오류와 내부 오류 분리

검증:

- 잘못된 channel/status/priority 거부
- 과도한 본문, 빈 제목, 잘못된 날짜 거부

## Task 3. 권한과 Action Registry

파일:

- `lib/assistant/permissions.ts`
- `lib/assistant/actions/types.ts`
- `lib/assistant/actions/registry.ts`
- `lib/assistant/actions/dispatcher.ts`
- 관련 테스트

구현:

- OWNER 정책
- 조회/변경/발송별 confirmation 정책
- 등록되지 않은 Action 거부
- 실행 전 서버 권한 및 상태 재검증

## Task 4. Conversation Service

파일:

- `lib/assistant/conversations/service.ts`
- `lib/assistant/conversations/context.ts`
- `app/api/assistant/conversations/route.ts`

구현:

- 웹·텔레그램·카카오 공통 conversation
- 기존 `olivia_chat_messages` 호환 저장
- request/external message id 중복 방지
- 최근 문맥과 요약 문맥 조회

## Task 5. Confirmation Service와 API

파일:

- `lib/assistant/confirmations/service.ts`
- `app/api/assistant/actions/[actionId]/confirm/route.ts`
- `app/api/assistant/actions/[actionId]/cancel/route.ts`

구현:

- hash token
- 만료
- one-time claim
- 승인/취소 감사 로그
- 중복 클릭 방지

## Task 6. OWNER 연결

파일:

- `lib/assistant/owners/service.ts`
- `app/api/kakao/link/route.ts`
- `app/api/kakao/unlink/route.ts`
- 테스트

구현:

- 관리자 세션에서 연결 코드 발급
- Kakao Skill에서 코드 소비
- 실패 시도 제한
- singleton OWNER

## Task 7. Kakao Adapter

파일:

- `lib/assistant/channels/kakao/types.ts`
- `lib/assistant/channels/kakao/parser.ts`
- `lib/assistant/channels/kakao/messageBuilder.ts`
- `lib/assistant/channels/kakao/client.ts`
- `app/api/kakao/skill/route.ts`
- `app/api/kakao/channel-webhook/route.ts`
- 관련 테스트

구현:

- SkillPayload 검증
- 카카오 사용자 식별자 추출
- 500자 제한과 quick reply/card 응답
- skill secret
- webhook idempotency
- callback/Event API disabled 처리

## Task 8. 시뮬레이터와 설정 UI

파일:

- `components/olivia/kakao/KakaoConnectionSettings.tsx`
- `components/olivia/kakao/KakaoNotificationSettings.tsx`
- `components/olivia/kakao/KakaoSkillSimulator.tsx`
- 관련 관리자 API와 기존 Olivia 화면 연결

구현:

- 연결 상태와 코드
- 알림 시간과 quiet hours
- 실제 payload 기반 시뮬레이션
- 실행/승인 기록

## Task 9. Olivia Core 호환 계층

파일:

- `lib/assistant/core/oliviaCore.ts`
- `lib/assistant/core/contextManager.ts`
- `lib/assistant/channels/web.ts`
- `lib/assistant/channels/telegram.ts`
- `app/api/olivia/route.ts`
- `app/api/telegram/route.ts`

구현:

- 기존 prompt/tool 동작을 보존하는 호출 인터페이스
- 채널에 따라 승인 정책이 달라지지 않도록 공통화
- 웹 첨부와 텔레그램 음성 회귀 보존

## Task 10. 주요 Action

파일:

- `lib/assistant/actions/calendar.ts`
- `lib/assistant/actions/task.ts`
- `lib/assistant/actions/memo.ts`
- `lib/assistant/actions/project.ts`
- `lib/assistant/actions/quote.ts`
- `lib/assistant/actions/photo.ts`

구현:

- 기존 DB/API 로직을 서버 유틸로 추출해 직접 호출
- 캘린더 조회, 빈 시간, 생성, 변경, 취소
- 할 일 생성, 조회, 완료
- 메모 생성, 검색
- 프로젝트, 견적/계약, 사진 상태 조회

## Task 11. DB 작업 큐와 알림

파일:

- `lib/assistant/jobs/service.ts`
- `lib/assistant/notifications/service.ts`
- `lib/assistant/notifications/priority.ts`
- `app/api/cron/assistant-jobs/route.ts`
- `app/api/cron/assistant-briefings/route.ts`
- `vercel.json`

구현:

- SKIP LOCKED claim RPC 사용
- retry/backoff
- callback/Event delivery
- dedupe
- quiet hours
- 아침/오후/저녁 브리핑

## Task 12. 이메일

파일:

- `lib/assistant/oauth/crypto.ts`
- `lib/assistant/oauth/google.ts`
- `lib/assistant/actions/email.ts`
- Google 연결/콜백 API

구현:

- 재동의
- refresh token 암호화
- Gmail 조회, 읽기, 요약, 초안
- 실제 발송은 확인 후에만 실행

## Task 13. 음성

파일:

- `lib/assistant/channels/voice.ts`
- 일회용 voice session API
- 모바일 녹음 UI

구현:

- 실제 Kakao 음성 직접 수신 가능 여부 feature flag
- 불가할 때 웹 녹음 fallback
- STT와 사용자 사전
- 원본 삭제

## Task 14. 최종 검증

명령:

```bash
npm run typecheck
npm run test
npm run build
```

추가 검증:

- 기존 웹 올리비아챗 텍스트/첨부
- 텔레그램 기존 흐름
- 카카오 simulator
- OWNER 연결
- 동일 webhook 중복
- 승인 1회 실행
- 만료 승인
- callback/Event key 미설정
- 모바일 설정 UI

## 외부 연동 전 중단점

아래 항목은 카카오 자산 생성 뒤에만 완료할 수 있다.

- 실제 Skill URL 등록
- 실제 `botUserKey` OWNER 연결
- Callback 승인
- Event API와 월렛
- 실제 음성 payload 검증
- 실기기 카카오 테스트
