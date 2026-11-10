# Bridge Adobe 별점·RAW 자동 탐색 안정화 설계

## 목적

하위 폴더 JPG의 Adobe XMP 별점이 SMB 한글 폴더 정규화 차이 때문에 누락되는 문제와, RAW 자동 탐색이 JPG 폴더 전체를 재귀 스캔해 멈춘 것처럼 보이는 문제를 함께 제거한다. 기존 Bridge UI, 선택 기준, RAW 매칭·복사·보정본 이동 동작은 유지한다.

## Adobe 별점 읽기

- `scanBridgeFolder`가 JPG·RAW·XMP마다 실제 부모 `FileSystemDirectoryHandle`을 보존한다.
- 별점 수집은 `parentHandle`에서 XMP를 직접 읽으며, 핸들이 없는 레거시 후보에만 상대 경로 해석을 사용한다.
- 상대 경로 폴백은 원문, NFC, NFD 이름을 시도하고, 실패하면 `entries()`의 실제 이름을 NFC 기준으로 비교한다.
- 수집 결과는 `ratings`, `read`, `rated`, `failed`, `firstError`를 반환한다. 첫 실패는 콘솔에 남기고 나머지는 개수로 집계한다.
- 200장마다 중간 별점과 진행률을 화면에 반영한다. 동일 폴더·동일 사진 목록의 진행 중 요청은 focus 이벤트가 와도 재시작하지 않는다.
- 상태는 셀렉 기준 옆에 `읽는 중 N/전체`, `별점 N장 / 전체`, `읽기 실패 N장`, `다시 읽기`로 표시한다.
- 내장 XMP 탐색 범위는 앞 1MB이며, 여러 `x:xmpmeta` 블록 중 실제 `xmp:Rating`이 있는 블록을 사용한다.

## 별점 병합 규칙

- `olivia`: Olivia 기본값과 Olivia 편집값만 사용한다.
- `adobe`: Adobe 별점만 사용하며 로컬 `ratingEdits`를 적용하지 않는다.
- `both`: Olivia 기본값 위에 Adobe 값을 병합한 뒤, 1~5점 Olivia 편집만 덮어쓴다. 편집값 0은 Adobe 별점을 삭제하지 않는다.
- `ratingEdits`의 localStorage 저장·복원은 Olivia 기준에서만 적용한다.

## RAW 자동 탐색

- 현재 폴더 이름이 `JPG전체`, `JPG원본`, `JPG`, `N차보정본`이면 자동 탐색 후보에서 제외하고 상위 폴더부터 시작한다.
- 자동 탐색은 표본 basename 1~2개에 대해 후보 직속 파일과 바로 아래 하위 폴더만 직접 `getFileHandle`로 확인한다.
- 하위 폴더 중 이름에 `jpg`가 포함되거나 `Selected_RAW`, `N차보정본`이면 건너뛴다.
- 자동 탐색에서는 `buildRawIndex`와 재귀 `scanTree`를 호출하지 않는다.
- 후보별 제한 시간은 5초다. 상태는 `폴더명 확인 중 (현재/전체)`로 표시한다.
- 촬영 폴더 경로별 성공한 RAW 폴더 핸들을 기존 `olivia-bridge` IndexedDB에 저장한다. 권한이 유효한 기억 핸들만 첫 후보로 쓰고, 사용할 수 없으면 일반 후보 탐색으로 넘어간다.
- 모든 후보가 실패하면 즉시 `자동으로 찾지 못했습니다`와 큰 `RAW 폴더 직접 선택` 버튼을 표시한다.
- 사용자가 직접 선택한 뒤의 전체 RAW 인덱싱과 기존 매칭은 그대로 유지한다.

## 오류 및 동시성

- Adobe 수집은 폴더·사진 목록 키로 진행 중 작업을 식별한다. 같은 키 재호출은 기존 Promise를 재사용한다.
- 폴더나 사진 목록이 바뀐 이전 응답은 generation으로 무시한다.
- 컴포넌트의 선택 반영·별점 게시 함수는 최신 ref를 통해 호출해 effect 의존성 변화로 수집이 취소되지 않게 한다.
- RAW 후보 시간 초과는 오류가 아니라 다음 후보로 진행하며, 최종 실패만 사용자에게 표시한다.

## 검증

- NFD 하위 폴더의 `parentHandle` XMP 읽기
- NFC 상대 경로에서 NFD 실제 폴더 찾기
- 동일 Adobe 수집 키의 요청 중복 방지와 200장 진행 반영
- Adobe/both에서 편집값 0이 Adobe 5점을 지우지 않는 병합 규칙
- 300KB 이후에 있는 내장 XMP 별점 읽기
- JPG 계열 현재 폴더의 후보 제외
- 후보 직속·한 단계 RAW 폴더 탐색과 재귀 스캔 미사용
- 전체 후보 실패 시 즉시 `not_found`
- 기존 Bridge 선택·RAW 매칭·보정본 이동 관련 테스트, TypeScript 검사, 프로덕션 빌드

## 범위 밖

- DB 변경
- 관리자 Bridge 디자인 변경
- RAW 복사·이동 알고리즘 변경
- 원격 Mac Studio 워커의 별도 전체 인덱싱 방식 변경
