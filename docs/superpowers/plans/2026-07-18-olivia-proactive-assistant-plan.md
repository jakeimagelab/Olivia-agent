# Olivia 능동형 AI 비서 1차 구현 계획

설계 기준: `docs/superpowers/specs/2026-07-18-olivia-proactive-assistant-design.md`

## 작업 1. 데이터·공통 타입·이벤트 기반

변경 파일:

- `supabase/olivia-proactive-assistant.sql`
- `lib/olivia/types.ts`
- `lib/olivia/events.ts`
- `lib/olivia/permissions.ts`
- `lib/olivia/scoring.ts`
- `app/api/olivia/events/route.ts`

검증:

- additive/idempotent SQL인지 확인
- dedupe partial unique index와 FK 인덱스 확인
- TypeScript 빌드 확인

## 작업 2. 기존 기능 이벤트 연결

변경 파일:

- `app/api/clients/route.ts`
- `app/api/memo/route.ts`
- `app/api/memo/transcribe/route.ts`
- `app/api/workflow/start/route.ts`
- `app/api/workflow/portal-event/route.ts`
- `lib/workflowAutomation.ts`
- `app/api/agent/approvals/[id]/reject/route.ts`
- `app/api/agent/approvals/[id]/request-revision/route.ts`

검증:

- 기존 응답 형식 유지
- 이벤트 실패가 기존 성공 경로를 막지 않는지 확인
- 민감정보 payload 제외 확인

## 작업 3. Observer 코어

변경 파일:

- `lib/olivia/context.ts`
- `lib/olivia/rules.ts`
- `lib/olivia/analyzer.ts`
- `lib/olivia/actionPlanner.ts`
- `lib/olivia/observer.ts`
- `app/api/olivia/observer/run/route.ts`

검증:

- 15개 규칙 단위 테스트
- 프로젝트별 오류 격리
- 규칙 결과는 AI 실패와 무관하게 저장
- 인사이트와 행동 중복 방지

## 작업 4. 인사이트·행동·브리핑·약속 API

변경 파일:

- `app/api/olivia/insights/**`
- `app/api/olivia/actions/**`
- `app/api/olivia/briefings/**`
- `app/api/olivia/commitments/**`
- `lib/olivia/briefings.ts`

검증:

- 상태 전환 가드
- 스누즈·무시·피드백 기록
- 승인 필요 행동의 기존 `agent_approvals` 연결

## 작업 5. 크론과 미팅 비서

변경 파일:

- `app/api/cron/olivia-observer/route.ts`
- `app/api/cron/olivia-morning-briefing/route.ts`
- `app/api/olivia/meeting/pre-brief/route.ts`
- `app/api/olivia/meeting/post-analysis/route.ts`
- `app/api/memo/route.ts`
- `vercel.json`

검증:

- `CRON_SECRET` 검증
- KST 하루 한 브리핑
- 최대 30개 실행
- 약속 추출 중복 방지

## 작업 6. 관리자·고객관리 UI

변경 파일:

- `components/olivia/OliviaBriefingPanel.tsx`
- `components/olivia/OliviaInsightCard.tsx`
- `components/olivia/OliviaActionCard.tsx`
- `components/olivia/OliviaPriorityBadge.tsx`
- `components/olivia/OliviaApprovalSummary.tsx`
- `components/olivia/OliviaTimeline.tsx`
- `components/olivia/OliviaDashboardPanel.tsx`
- `app/admin/dashboard/home/page.tsx`
- `app/olivia-assistant/page.tsx`
- `app/(client-hub)/clients/page.tsx`
- `components/admin/AdminSidebar.tsx`
- `app/globals.css`

검증:

- 기존 대시보드와 WorkflowBar 유지
- 신규 DB 미적용 시 빈 상태
- 데스크톱·모바일 브라우저 확인

## 작업 7. 테스트·빌드·최종 검증

변경 파일:

- `vitest.config.ts`
- `tests/olivia/rules.test.ts`
- `tests/olivia/scoring.test.ts`
- `tests/olivia/deduplication.test.ts`
- `package.json`
- `package-lock.json`

검증 순서:

1. 단위 테스트
2. TypeScript 검사
3. `npm run build`
4. 관리자 대시보드와 Olivia 페이지 브라우저 확인
5. 변경 파일·API·이벤트·규칙·권한·제한사항 최종 보고
