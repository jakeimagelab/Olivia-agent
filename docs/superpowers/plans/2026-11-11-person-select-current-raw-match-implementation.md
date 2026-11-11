# 개인별·공동 셀렉 RAW 매칭 구현 계획

설계 기준: `docs/superpowers/specs/2026-11-11-person-select-current-raw-match-design.md`

## 1. 공통 대상 계산과 권한 정규화

- `lib/person-select/rawMatch.ts`에 source 파싱, 개인별/공동 셀렉 합집합, 대상 수 집계 순수 함수를 추가한다.
- `lib/person-select/reviewerPermissions.ts`에 레거시 검토자 최종 확정 권한 정규화 함수를 추가한다.
- 대상 계산과 레거시 권한 단위 테스트를 먼저 추가한다.

## 2. 원격 작업과 Mac Studio 워커

- `/api/remote-jobs`가 `source`와 `reviewerIds`를 검증해 기존 `PERSON_SELECT_RAW_MATCH` payload에 보존한다.
- Mac Studio runner가 두 옵션을 스크립트 인자로 전달한다.
- `scripts/person-select-raw-match.ts`가 제출본/현재 상태를 DB에서 조회하고 공통 대상 계산을 사용한다.
- 기존 촬영시각 파서와 후보 판정을 재사용하고, RAW 복사는 `ditto`로 바꾼다.
- 결과에 source, 제출본/제출 전 수, 확인 필요 목록을 저장한다.

## 3. 관리자 화면

- RAW 매칭 확인 모달에 source와 공동 검토자 범위를 추가한다.
- 제목 줄 작업 버튼을 탭 줄 오른쪽 작업 영역으로 이동하고 작은 폭에서는 더보기 메뉴로 정리한다.
- 공동 관리자 Bridge에 전용 toolbar slot과 결과 slot을 추가해 RAW 매칭을 리뷰 앞에 표시한다.
- 개인별 고객 셀렉 표 위에 RAW 매칭 버튼과 비활성 이유를 표시한다.

## 4. 공동 셀렉 최종 제출

- 공개 접근 응답과 submit API 모두 레거시 null 권한을 true로 처리한다.
- 관리자 설정에서 최종 확정 가능 검토자가 없을 때 경고를 표시한다.
- 고객 Bridge와 classic 화면에서 같은 권한 규칙을 사용한다.
- 모바일 하단 바의 safe area를 검증한다.

## 5. 검증과 배포

- 관련 Vitest, `npx tsc --noEmit`, `npm run build`를 실행한다.
- 관련 파일만 커밋하고 main에 푸시한다.
- Mac Studio worker 업데이트·재시작 경로를 확인한 뒤 실행하고 online 상태를 확인한다.
