# Bridge 사진 분류 전환 오류 수정 설계

작성일: 2026-10-25

## 문제

Bridge의 Scene 계획을 적용하면 계획은 `PhotoStudioExecutionContext`에 저장되지만, 같은 컨텍스트 안의 사진 분류 도구를 여는 `setToolKey("classification")` 호출이 선택 연동 수정 과정에서 빠졌다. 검토 창만 닫힌 뒤 사용자가 별도 분류 화면으로 이동하면, 실행 위치에 따라 폴더 핸들과 대기 중인 계획을 공유하지 못해 오류 또는 초기 상태가 나타난다.

## 결정

- Scene 계획 생성과 저장이 성공한 직후 검토 창을 닫고 `classification` 도구를 연다.
- 사진 분류는 Bridge와 같은 `PhotoStudioExecutionProvider` 안에서 마운트되어 대기 중인 계획, 현재 폴더 핸들, 선택 JPG를 그대로 소비한다.
- Olivia 수동 선택과 Adobe Bridge XMP 별점 선택의 합집합, 선택 파일 전용 Scene 계획, 진료과 결정 로직은 변경하지 않는다.
- 별도 페이지나 OS 창 사이에 파일 핸들을 직렬화하거나 새 전역 저장소를 만들지 않는다.
- 오류 표시, 기존 다크 톤, 탭 수, 단일 주요 실행 버튼과 `BridgeFloatingWindow` 구조를 유지한다.

## 오류 처리

- 계획 생성이 실패하면 현재처럼 Scene 검토 창에 오류를 표시하며 사진 분류 도구를 열지 않는다.
- 계획 적용이 성공했을 때만 사진 분류 도구를 열어, `PhotoSortingWorkspace`가 계획을 한 번 소비하도록 한다.

## 검증

- 소스 회귀 테스트에서 계획 저장 뒤 `setToolKey("classification")`이 호출되는지 확인한다.
- 선택 파일 전용 계획과 Adobe Bridge 선택 합집합 테스트를 유지한다.
- 관련 Vitest, 타입 검사, 린트, 프로덕션 빌드를 실행한다.
- 브라우저에서 Bridge Scene 계획 적용 뒤 같은 창의 사진 분류 도구가 열리고 오류 없이 검토 단계가 표시되는지 확인한다.
