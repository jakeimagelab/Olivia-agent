# Olivia 기능별 생성·수정 도구 구현 계획

## 목표

올리비아 채팅에 허용 목록 기반의 기능별 생성·수정 도구를 연결하고, 기존 확인 카드와 실행 로그를 재사용한다.

## 작업 순서

1. `lib/olivia/crud/types.ts`, `registry.ts`, `validation.ts`를 추가한다.
   - 지원 도메인과 필드 규칙을 단일 출처로 정의한다.
   - 알 수 없는 필드 제거, 필수값·enum·숫자 범위 검증을 구현한다.
2. `lib/olivia/crud/targetResolver.ts`를 추가한다.
   - UUID, 고객명, 자연키로 수정 대상을 찾는다.
   - 0건/복수 후보를 명시적 오류로 반환한다.
3. `lib/olivia/crud/executor.ts`를 추가한다.
   - 고객, 워크플로우, 메모, 일정, 견적, 계약, 콘티, 갤러리, 셀렉 갤러리, 후기, 메일 초안, 에이전트 업무를 기능별로 생성·수정한다.
   - 기존 워크플로우 함수와 Olivia 이벤트를 재사용한다.
4. `app/api/olivia/route.ts`에 `create_feature_record`, `update_feature_record` 도구를 연결한다.
   - 기존 `pendingTool` 승인 흐름을 유지한다.
   - 프롬프트에 메모/일정 구분과 수정 대상 규칙을 명시한다.
5. `components/OliviaChat.tsx`와 보조 채팅 UI에 도구 라벨·요약을 추가한다.
6. 기능 레지스트리와 실행기의 단위 테스트를 추가한다.
7. `npm run typecheck`, `npm test`, `npm run build`를 실행하고 회귀 오류를 수정한다.

## 초기 지원 도메인

이번 구현에서 실제 스키마가 확인된 다음 도메인을 우선 완성한다.

- `client`
- `workflow`
- `memo`
- `calendar`
- `quote`
- `contract`
- `conti`
- `photo_gallery`
- `select_gallery`
- `review`
- `mail_draft`
- `agent_task`

보정·납품은 독립 테이블이 아니라 고객 링크와 워크플로우 상태에 분산되어 있으므로 `client`와 `workflow` 수정 필드로 제공한다.

## 안전 기준

- 모든 쓰기는 기존 채팅 확인 후 실행한다.
- 삭제와 직접 발송은 포함하지 않는다.
- 가격·할인·계약 조건 수정은 이 도구에서 차단하고 기존 전용 페이지/승인 흐름으로 안내한다.
- 수정은 대상 하나가 확정된 경우만 수행한다.
- 민감정보 전체를 활동 로그에 기록하지 않는다.
