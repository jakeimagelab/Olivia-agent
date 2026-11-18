# RAW Match Parent Probe Performance Design

## Goal

RAW 매칭이 현재 JPG 폴더의 바로 상위 폴더에 있는 RAW를 빠르게 찾고, 장시간 탐색 중에도 Mac Studio Worker를 오프라인으로 잘못 표시하지 않게 한다.

## Confirmed cause

- 브라우저 자동 탐색은 `JPG`, `JPG전체`, `JPG원본` 후보를 통째로 제외하므로 그 폴더 바로 안의 RAW도 확인하지 않는다.
- Mac Studio 워커는 촬영 프로젝트 전체를 재귀 순회한 뒤 후보를 만들기 때문에, RAW가 JPG 폴더의 바로 상위에 있어도 수천 파일을 훑을 수 있다.
- 긴 runner 실행 중 워커의 일반 폴링이 멈추면 최근 heartbeat가 오래되어 UI가 워커를 오프라인으로 표시할 수 있다.

## Design

### Direct ancestor probe first

- 선택 JPG의 basename 1~2개를 표본으로 사용한다.
- 현재 JPG 폴더와 그 상위 경로를 프로젝트 루트까지 가까운 순서로 확인한다.
- `JPG`, `JPG전체`, `JPG원본`처럼 재귀 탐색에서 제외되는 폴더도 그 폴더 바로 안의 RAW 직접 조회는 허용한다.
- 직접 조회는 알려진 RAW 확장자와 정확한 basename 조합을 사용하며, NFC/NFD와 대소문자 차이는 디렉터리 열거 fallback으로 확인한다.

### Bounded fallback scan

- 직접 조회로 찾지 못한 basename만 기존 재귀 탐색에 넘긴다.
- `Selected_RAW`, 납품 회차 폴더와 불필요한 JPG 하위 트리는 계속 건너뛴다.
- 이미 찾은 항목은 다시 인덱싱하지 않는다.

### Worker presence

- RAW 탐색의 진행 보고가 들어올 때 Worker `last_seen_at`도 갱신되도록 기존 원격 작업 보고 경로를 사용한다.
- 진행 중인 작업에서 최근 진행 보고가 있으면 UI는 Worker를 온라인으로 판단한다.
- Worker 프로세스가 실제로 중단된 경우의 기존 오프라인 판정은 유지한다.

## Safety and compatibility

- RAW 원본은 읽기만 하며 수정·이동하지 않는다.
- 파일명과 촬영시각 ±2초가 모두 맞아야 확정하는 규칙은 유지한다.
- 대상 덮어쓰기 금지, 메타데이터 보존 복사, JPG/XMP 이동 규칙은 변경하지 않는다.
- DB 스키마와 화면 배치는 변경하지 않는다.

## Tests

- `JPG전체` 바로 안에 RAW가 있으면 직접 조회만으로 찾는다.
- 현재 JPG 폴더의 바로 상위에 RAW가 있으면 프로젝트 전체 재귀 순회를 호출하지 않는다.
- 직접 조회에서 일부만 찾으면 나머지만 fallback 탐색한다.
- `Selected_RAW`와 납품 회차 폴더는 fallback에서 계속 제외된다.
- 장시간 진행 보고 중 Worker 상태가 온라인으로 유지된다.
- 관련 Vitest와 `npx tsc --noEmit`을 통과한다.

