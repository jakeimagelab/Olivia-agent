# Bridge 선택 사진 분류 수정 구현 계획

설계 기준: `docs/superpowers/specs/2026-10-25-bridge-selected-classification-design.md`

1. Adobe Bridge가 저장한 XMP 별점을 제한된 동시성으로 읽는 공통 함수를 추가한다.
2. Olivia 수동 선택과 Adobe Bridge 별점 선택을 출처별로 유지하고, 화면·공유 컨텍스트에는 합집합을 반영한다.
3. 폴더 열기, 창 포커스 복귀, 사진 분류 열기 시 Adobe Bridge 별점을 다시 확인한다.
4. 기존 분석 파일로 Scene 경계와 범위를 다시 만드는 순수 함수를 `bridgeFiles`에 분리한다.
5. 전체 분석 중 합쳐진 선택 ID의 파일만 골라 선택 전용 Scene 분석을 계산한다.
6. Scene 검토 카드·요약·적용 버튼을 선택 전용 분석에 연결하고, 선택 0장 안내를 표시한다.
7. 분류 계획 검증은 계획 파일의 존재와 서명만 확인하고 폴더의 미선택 JPG는 허용한다.
8. 단위·회귀 테스트를 보강하고 타입 검사, 린트, 빌드, 화면 검증을 실행한다.
