# Olivia Bridge 셀렉 기준과 RAW 폴더 오류 표시 설계

## 범위

관리자 Olivia Bridge에 폴더별 셀렉 기준(`olivia`, `adobe`, `both`)을 추가한다. 기존 사진 탐색, 도구 실행, 고객 셀렉 비교, 리뷰, RAW 매칭 흐름은 현재 `selectedIds`와 `effectiveRatings`를 계속 소비하며, 두 값의 계산 기준만 명시적으로 바꾼다. RAW 검색 기준 폴더 팝업은 실패를 큰 경고로 표시하고 지원되는 브라우저에서 현재 폴더를 시작 위치로 사용한다. DB와 기존 화면 구조는 바꾸지 않는다.

## 상태와 순수 함수

- `BridgeSelectionSource`는 `"olivia" | "adobe" | "both"`이며 기본값은 `olivia`다.
- `resolveBridgeSelection(source, manual, adobe, manualRemoved)`는 다음을 반환한다.
  - `olivia`: manual만
  - `adobe`: adobe만
  - `both`: manual과 adobe의 합집합에서 manualRemoved 제외
- `resolveBridgeRatings(source, base, adobe, edits)`는 Olivia에서 Adobe 값을 제외하고, Adobe와 both에서는 기존 병합 및 편집 우선 규칙을 유지한다.
- `manualRemoved`는 both에서 Adobe 선택을 수동 해제할 때만 갱신하며 Adobe 재조회 뒤에도 유지한다. 폴더가 바뀌면 새 작업 대상으로 초기화한다.

## 폴더별 기준과 동기화

- 로컬 폴더 키는 breadcrumb 이름을 `/`로 연결하고, NAS는 `remoteFolder.path`를 사용한다.
- localStorage 키는 `olivia-bridge-selection-source:<폴더 식별자>`다. 읽기와 쓰기는 예외를 삼키며 잘못된 값은 Olivia로 정규화한다.
- 기준 전환 즉시 선택 ID, 표시 별점, 공유 선택 파일명과 공유 별점을 다시 계산한다.
- Olivia에서는 초기 로드와 창 focus에서 Adobe 조회를 실행하지 않고 Adobe 배지를 숨긴다.
- Adobe에서는 클릭이 포커스와 미리보기만 바꾸며 manual 상태는 보존한다. 사진 선택이나 0~5 별점 변경을 시도하면 안내를 표시한다.
- both에서는 기존 합집합을 유지하되 manualRemoved가 Adobe 재조회보다 우선한다.

## UI

- 기존 폴더 변경 줄에 `셀렉 기준` 세그먼트를 배치한다. 기존 밝은 OS 조작면의 선·색·글자 체계를 그대로 사용한다.
- 오른쪽 선택 요약에는 `기준: 올리비아/어도비/둘 다`를 작게 표시한다.
- Adobe 기준 변경 안내는 상단에 한 줄로 표시하고 다른 조작면을 가리지 않는다.
- RAW 팝업 제목은 `RAW 파일을 어디서 찾을까요?`로 바꾸고 두 선택지 설명을 쉬운 문구로 교체한다.
- 상위 폴더가 현재 폴더를 포함하지 않으면 팝업 내부 `role="alert"` 경고 박스를 표시한다.
- 성공하면 팝업을 닫고 상단에 RAW 검색 범위 안내를 3초 표시한 다음 기존 RAW 매칭 창을 연다.

## 폴더 선택기

`usePhotoFolderPicker.pick`은 선택적 `{ startIn }`을 받는다. 브라우저가 지원하면 `showDirectoryPicker({ mode, startIn })`로 호출한다. `startIn` 때문에 실패하는 구현은 같은 사용자 제스처 안에서 기존 `{ mode }` 호출로 한 번 재시도하며, 기존 취소·오류 처리는 유지한다.

## 검증

- 새 테스트에서 세 선택 기준, manualRemoved, 별점 출처, 잘못된 저장값의 Olivia 기본값을 검증한다.
- 기존 labels 테스트를 새 함수 시그니처에 맞추고 기존 병합 우선순위를 보존한다.
- TypeScript, 변경 파일 ESLint, 관련 Vitest, production build를 실행한다.
- 사용자 소유의 비디오 작업실 및 WorkspaceGrid 변경은 커밋하지 않는다.
