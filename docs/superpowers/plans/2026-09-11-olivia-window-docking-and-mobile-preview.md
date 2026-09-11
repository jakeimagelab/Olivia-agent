# Olivia 창 도킹 및 모바일 문서 미리보기 구현 계획

## 목표

승인된 설계에 따라 대화 기록 팝업, 부모–자식 창 도킹, 견적 요청 완전성, 7일 Telegram 모바일 미리보기, 임시문서 복원을 구현하고 배포 가능한 상태로 검증한다.

## 작업 1. 대화 기록 팝업

- `OliviaConversationNavigation.tsx`에서 tick element와 guide bounds를 측정한다.
- 선택 tick 중심을 CSS custom property로 전달한다.
- guide와 popover 사이 hover 이동을 유지하는 닫기 지연을 추가한다.
- `admin.css`에서 팝업을 rail 바로 옆에 배치하고 투명 bridge를 만든다.
- 선택 항목 삭제 및 mobile fixed layout을 안전하게 처리한다.

검증: typecheck, navigator 관련 단위/UI 검증.

## 작업 2. 부모–자식 창 도킹

- `windowDocking.ts` 순수 모듈에 후보 탐색, 결합 bounds, follower bounds 계산을 작성한다.
- `OliviaWindowState`에 `parentWindowId`를 추가하고 데스크톱 영속 버전을 올린다.
- store의 move/resize/snap/minimize/restore/close가 자식 채팅을 함께 갱신하도록 한다.
- 채팅 헤더 drag 시작 시 연결을 해제한다.
- `useWindowInteractions`에서 채팅 drag 중 메인 창 후보를 계산하고 drop 시 결합한다.
- drag overlay에 메인 오른쪽 도킹 가이드와 예상 채팅 영역을 표시한다.

검증: 순수 함수 및 store 테스트, 실제 브라우저 drag 검증.

## 작업 3. 견적 생성 완전성

- CRUD validation이 선택 문자열의 `null`을 정상 생략/변환하도록 타입 규칙을 보완한다.
- `create_quote` 도구 schema에 할인율, 유료 추가 항목, 무료 서비스 항목을 추가한다.
- `buildAgentQuoteData`가 모든 항목을 만들고 서버 계산 함수로 합계를 계산하도록 확장한다.
- 저장된 견적의 요청 필드와 합계를 검증한다.
- 한 턴에서 실패 후 성공한 같은 도구의 복구된 오류 문구를 최종 답변에서 제거한다.
- client request ID 기반 생성 중복 방지를 추가하거나 기존 dedupe 경계를 연결한다.

검증: 실제 사례 payload로 단위 테스트하고 할인·서비스·메모·연락처·합계를 확인한다.

## 작업 4. 7일 모바일 미리보기 URL

- `quote_shares`에 `expires_at`을 추가하는 migration을 작성한다.
- 공유 토큰 발급/조회에서 7일 만료와 재발급을 구현한다.
- Telegram 문서 전달을 `sendPhoto`에서 URL 버튼 메시지로 변경한다.
- 미리보기, 내용 확인, 수정 요청, 보류 버튼을 같은 inline keyboard에 배치한다.
- 실제 URL 및 Telegram message ID가 있어야 전송 성공으로 판정한다.
- 계약서·콘티는 기존 공유 인프라를 점검해 동일한 service interface로 연결하고, 없는 모바일 화면은 최소 공통 문서 미리보기 route로 보완한다.

검증: 토큰 만료/취소/재발급 단위 테스트와 Telegram payload 테스트.

## 작업 5. 임시문서함 복원

- 문서 카드의 anchor navigation을 typed open action으로 교체한다.
- Olivia OS 앱 launcher를 통해 quote/contract/conti 창에 `resourceId`를 전달한다.
- 페이지 fallback은 `resourceId` query parameter를 표준으로 사용한다.
- `QuoteBuilder` 페이지 모드가 query resource ID를 읽고 단건 문서를 복원하도록 한다.
- 조회/mapper 오류는 창 내부 error state로 처리한다.
- 카드에 OS 열기와 모바일 미리보기 동작을 구분한다.

검증: 최신 임시 견적 ID로 OS 내부 복원과 모바일 URL 열기를 확인한다.

## 작업 6. 전체 검증 및 배포 준비

- 관련 테스트를 먼저 실행하고 실패를 수정한다.
- 전체 `npm test`, `npm run typecheck`, 변경 파일 lint, `npm run build`를 실행한다.
- Playwright로 기록 팝업, 창 도킹/분리, 임시문서 복원을 확인한다.
- DB migration을 적용한 뒤 테스트 견적의 Telegram 링크를 확인한다.
- 변경 파일만 커밋하고 `main`에 푸시한다.
