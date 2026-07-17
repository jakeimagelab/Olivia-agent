# 어드민 대시보드 기존 디자인 복구

## 목표

`/admin/dashboard/home`만 `c9d4ac4` 커밋 직전의 기존 운영 홈 디자인으로 복구한다. CRM 확정 디자인은 이번 하위 작업에서 적용하지 않는다.

## 복구 기준

복구 기준 파일은 `c9d4ac4^:app/admin/dashboard/home/page.tsx`다. 화면은 다음 구성을 유지한다.

- Olivia Daily Brief
- 오늘 일정 체크리스트
- Daily Quote
- 오늘 할 일·촬영 예정·메일 대기·셀렉 완료·RAW 매칭 필요·지연 프로젝트 요약 카드
- 오늘 처리할 업무
- 빠른 실행
- 올리비아 추천 액션과 최근 활동

## 변경 범위

1. `app/admin/dashboard/home/page.tsx`를 복구 기준의 프레젠테이션 구조로 되돌린다.
2. 복구된 화면에 필요한 기존 CSS와 공통 컴포넌트는 그대로 사용한다.
3. 이후 추가된 워크플로우 API, 보관 알림, 추가 촬영, 고객 포털 코드는 변경하지 않는다.
4. CRM 페이지와 `/clients`, `/workflow/approvals`, `/client-portal/dashboard`는 변경하지 않는다.
5. 현재 어드민 사이드바·헤더·AdminShell은 유지한다.

## 의도적으로 하지 않는 작업

- CRM 대시보드 디자인 변경
- CRM 플레이스홀더 데이터 연결
- 첫 진입 경로 변경
- 기능 페이지 디자인 변경
- DB 또는 Supabase 스키마 변경

## 검증

- `/admin/dashboard/home`에서 기존 Daily Brief 중심 화면이 표시된다.
- 모바일에서 Daily Brief와 오늘 일정 영역이 기존 반응형 규칙대로 표시된다.
- `/admin/crm/dashboard`와 `/clients`의 코드 및 화면에는 회귀가 없다.
- `npx tsc --noEmit`과 `npm run build`가 통과한다.
