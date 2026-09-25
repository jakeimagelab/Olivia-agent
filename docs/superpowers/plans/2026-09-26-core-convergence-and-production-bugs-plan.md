# Olivia Core 연결 및 실사용 버그 실행 계획

1. A-1 대상 6개 화면의 현재 데이터 출처와 mutation 경로를 확인한다.
2. 정확한 workflow run ID를 기준으로 Snapshot hook을 연결하고 중복 fetch를 제거한다.
3. A-1 grep, 관련 테스트, typecheck를 실행한다.
4. 기존 전체 테스트 1,611개 통과를 A-2 기준선으로 기록한다.
5. 스트림 라우트의 공통 입력·출력 계약을 고정한 뒤 pending/Hermes/legacy 경로를 순서대로 추출한다.
6. 리팩터 후 전체 테스트와 route 줄 수를 확인한다.
7. 씬 빌더와 Worker 보고 구조를 수정해 AI 미실행·판별 실패·진료과 추정을 구분한다.
8. Remote NAS root 설정과 listFolder 경계를 수정하고 Unicode 비교 회귀 테스트를 추가한다.
9. 브라우저에서 고객관리 루프를 재현하고 확인된 feedback loop만 수정한다.
10. Window registry/adapter/legacy route를 조사해 중복 헤더 목록을 만들고 embedded 모드에서만 숨긴다.
11. 각 B 작업별 grep과 테스트를 실행한다.
12. 최종 typecheck, 전체 test, build, 가능한 브라우저 QA를 수행한다.
