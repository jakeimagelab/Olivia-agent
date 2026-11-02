# 개인별 사진 셀렉 Dock 등록 설계

## 목표

OliviaOS Dock에서 `개인별 사진 셀렉`을 바로 열 수 있게 한다. 배치 순서는 `Olivia Bridge → 개인별 셀렉 → 영상작업실`로 한다.

## 구현 범위

- `components/olivia-os/registry/oliviaAppRegistry.ts`
  - 기존 `person-select` 앱 정의에 `dockOrder`를 추가한다.
  - 뒤에 오는 앱들의 정수 순서만 한 칸씩 이동해 기존 상대 순서를 보존한다.
- `components/olivia-os/DesktopDock.tsx`
  - `person-select`의 Dock 아이콘을 `lucide-react`의 `UserCheck`로 연결한다.

## 보존 사항

- 기존 `/person-select` 라우트와 `PersonSelectWindowContent`를 그대로 사용한다.
- 앱 창의 기본 크기·최소 크기와 싱글턴 동작을 바꾸지 않는다.
- 개인별 셀렉의 데이터, API, 고객 공개 화면, 관리자 화면을 바꾸지 않는다.
- Dock의 공통 버튼 크기, 색, 간격, 활성 표시와 반응형 축소 동작을 그대로 재사용한다.

## 검증

- `npx tsc --noEmit`
- 넓은 화면과 좁은 화면에서 Dock 순서와 아이콘 확인
- Dock의 `개인별 셀렉`을 눌렀을 때 기존 `/person-select` 창이 열리는지 확인
