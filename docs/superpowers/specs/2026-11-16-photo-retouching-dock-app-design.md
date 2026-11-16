# 사진 보정 Dock 독립 앱 설계

## 목표

사진 보정을 Olivia Bridge 내부 작업 버튼에서 분리하고 Olivia OS Dock의 독립 앱으로 제공한다. 기존 사진 보정 화면, 파일 처리, 저장 방식과 API는 그대로 재사용한다.

## 사용자 흐름

1. Olivia OS 하단 Dock에서 `사진보정`을 누른다.
2. 독립 `사진 보정` 창이 열린다.
3. 기존 사진 보정 화면과 동일하게 폴더 선택, 분석 및 보정 작업을 수행한다.

Bridge 작업 도구에는 `사진 보정`을 표시하지 않는다. 모든 앱 검색에서 `사진 보정`, `색감 보정`, `리터칭` 검색은 독립 앱으로 연결한다.

## 구현 경계

- `oliviaAppRegistry`에 `photo-retouching` 독립 앱을 등록한다.
- 기존 `PhotoWorkspaceWindowContent`를 재사용하되 `/photo-retouching` 진입 시 `retouch` 모드로 바로 연다.
- Dock에서 Bridge 다음에 `사진보정`을 배치하고 기존 뒤쪽 앱 순서를 한 칸씩 이동한다.
- Dock 아이콘은 기존 `retouch` 의미와 맞는 선 아이콘을 사용한다.
- Olivia Bridge 작업 도구 및 Olivia Bridge 하위 도구 목록에서는 사진 보정을 제거한다.
- `/photo-retouching` 기존 URL은 유지한다.

## 보존 사항

- 사진 보정 화면의 중성 다크 톤과 기존 컴포넌트를 그대로 유지한다.
- 보정 알고리즘, 작업 상태, Mac Studio 연결, API와 파일 처리 로직은 변경하지 않는다.
- 새 데이터베이스 변경은 없다.

## 검증

- Dock에 `사진보정`이 표시되고 독립 창이 `retouch` 모드로 열린다.
- Bridge 작업 도구에 `사진 보정`이 더 이상 표시되지 않는다.
- `/photo-retouching`과 모든 앱 검색이 독립 앱을 연다.
- 관련 테스트, `tsc --noEmit`, 프로덕션 빌드를 통과한다.
