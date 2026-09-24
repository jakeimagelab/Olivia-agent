# 고객관리 직접 경로의 Olivia OS 전환 설계

작성일: 2026-09-24

## 문제

Olivia OS 안의 고객관리는 `ClientsWindowContent`로 네이티브 실행되지만, `/clients?id=...`처럼 기존 경로를 직접 여는 링크는 `(client-hub)` 레이아웃과 독립 `ClientsWorkspace`를 렌더한다. 이 때문에 배포된 최신 코드에서도 과거 관리자 UI가 전체 화면으로 노출된다.

## 결정

`/clients`는 더 이상 독립 관리자 화면을 표시하지 않는다. 기존 링크와 북마크의 호환성을 유지하면서 루트 Olivia 화면으로 이동하고, 대상 기기에 맞는 고객관리 화면을 자동으로 연다.

- `/clients?id=<id>`와 `/clients?clientId=<id>`를 `/?oliviaApp=customer&clientId=<id>`로 정규화한다.
- `workflowRunId`가 있으면 함께 보존한다.
- 데스크톱은 `customer` 앱을 Olivia OS 창으로 연다.
- 모바일은 기존 `clients` 모바일 뷰로 연다.
- 딥링크를 소비한 뒤 주소창에서 임시 실행 파라미터를 제거해 새로고침 시 창을 반복 실행하지 않는다.
- 기존 고객 API, Store, `ClientsWorkspace`, 모바일 고객관리 데이터 흐름은 변경하지 않는다.

## 대안과 판단

1. 기존 `/clients` 화면의 CSS만 바꾸기: 독립 화면 자체가 계속 남으므로 제외한다.
2. `/clients` 안에 Olivia OS를 중첩 렌더링하기: `(client-hub)` 레이아웃과 OS 셸이 겹치므로 제외한다.
3. 루트 Olivia 화면으로 딥링크 전환하기: 단일 셸과 기존 네이티브 앱 레지스트리를 재사용하므로 채택한다.

## 오류·호환 처리

- 잘못된 고객 ID라도 고객관리 창은 열고 기존 빈 상태/조회 오류 처리를 사용한다.
- 알 수 없는 `oliviaApp` 값은 무시한다.
- 로그인 전이면 기존 로그인 화면을 유지하고, 로그인 성공 뒤 딥링크를 한 번 처리한다.
- 모바일과 데스크톱 분기는 기존 `OliviaAdaptiveRoot` 판정을 그대로 사용한다.

## 검증

- `/clients?id=<id>`에서 구형 고객관리 전체 화면이 잠깐도 나타나지 않는다.
- 데스크톱에서 Olivia OS 고객관리 창이 해당 고객으로 열린다.
- 모바일에서 모바일 고객 상세가 열린다.
- `/clients?clientId=<id>&workflowRunId=<id>`의 컨텍스트가 보존된다.
- 새로고침해도 무한 리다이렉트나 창 중복 생성이 없다.
- `/clients` 내부에서 고객을 선택해도 브라우저 전체가 구형 페이지로 이동하지 않는다.

## 범위 밖

- 고객관리 UI 재설계
- 고객 API 또는 DB 구조 변경
- 다른 legacy route 전환
