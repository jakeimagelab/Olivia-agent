# RAW 파일명 매칭 빠른 탐색 구현 계획

1. `lib/selectMatch/rawIndex.test.ts`에 대상 기반 조기 종료, 누락 시 전체 확인, 작업 결과 폴더 제외 테스트를 추가한다.
2. `lib/selectMatch/rawIndex.ts`에 선택 basename 필터, 출력·숨김 폴더 제외, 깊이별 제한 병렬 탐색을 구현한다.
3. `SelectMatchWorkspace`와 채팅 RAW 매칭 카드에서 선택 basename을 탐색기에 전달한다.
4. 관련 Vitest, 변경 파일 ESLint, 전체 TypeScript 검사를 실행한다.
5. 변경 파일만 커밋하고 `main`을 push한 뒤 배포 상태를 확인한다.
