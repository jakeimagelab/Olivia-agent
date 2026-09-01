# Olivia 통합 작업실 1차 설계

## 목표

`/admin/tools`를 개별 기능 카드 나열 화면에서 업무 단위 Workspace launcher로 바꾼다. 사용자는 사진, 콘티, 브랜드 진단, 콘텐츠, 리포트 중 하나를 먼저 이해하고, 카드 안의 하위 기능 chip으로 원하는 실제 기능에 바로 진입한다.

이번 단계는 기존 기능 엔진이나 개별 페이지를 재작성하지 않는다. 기존 route와 standalone 도구는 유지하며, Workspace 내부 완전 통합은 후속 단계에서 진행한다.

## 중앙 Registry

`lib/workspaceGroups.ts`가 다음을 단일 소스로 소유한다.

- Workspace id, 이름, 설명, icon, accent
- canonical route
- 실제 구현된 하위 기능의 id, 이름, aliases, 기존 route
- Launcher에서 중복 노출하지 않을 기존 통합 대상 href

`ALL_TOOLS`는 Sidebar와 기존 기능 resolver의 호환성을 위해 유지한다. 통합 Launcher는 `WORKSPACE_GROUPS`를 primary 카드로 렌더링하고, 그룹에 포함되지 않은 `ALL_TOOLS`만 standalone 카드로 표시한다.

## 진입 및 deep link

- Workspace 카드의 `열기`는 canonical route를 연다.
- sub-tool chip은 Registry가 정한 deep link를 연다.
- 사진작업실은 `/photo-sorting?tool=...`를 canonical deep link로 사용하고 `PhotoWorkspace`가 기존 내부 mode/selectMode로 정규화한다.
- 아직 내부 통합 shell이 없는 콘티·브랜드·콘텐츠·리포트 그룹은 Registry의 실제 기존 route를 직접 연다. 이는 기능 복제나 임시 mock 없이 한 번의 클릭으로 실제 기능에 도달하게 하기 위한 1차 호환 경로다.
- 고객/프로젝트 관련 query는 deep link에 병합해 유지한다.

## Olivia 연동

기존 세부 기능 이름은 `ALL_TOOLS`에서 계속 검색하지만, 매칭 결과 href는 Workspace Registry를 통해 canonical deep link로 정규화한다. 따라서 Olivia와 Launcher가 같은 목적지를 사용한다. 독립 기능은 기존 href를 그대로 유지한다.

## UI

`/admin/tools`는 다음 순서로 렌더링한다.

1. `통합 작업실` 제목과 설명
2. mint 안내 배너
3. 다섯 개 가로형 compact Workspace 카드
4. 실제 standalone 도구 섹션

카드는 115~135px 높이, 14~16px radius, 얇은 border, 최소 shadow를 사용한다. desktop은 icon / copy+chips / 열기 버튼의 가로 구조이고 mobile은 세로로 쌓는다. hover 이동은 최대 1px이며 reduced motion에서는 제거한다.

## 그룹 범위

- 사진작업실: 셀렉 & RAW 매칭, 메타데이터 매칭, AI 컷 정리, AI 사진검색, 사진 분류, 사진 보정, 파일 변환
- 콘티 스튜디오: 촬영 콘티, 영상 콘티, 유튜브 편집, B-roll 프롬프트, 초상권
- 브랜드 진단센터: 브랜드, 이미지, 채널, AI 검색, 트렌드
- 콘텐츠 스튜디오: 아이디어, 홍보 콘텐츠, 리뷰 콘텐츠
- 리포트 · 인사이트: 실제 구현된 업무 리포트, 트렌드 리포트

표시 이름과 기존 기능의 실제 route 연결은 Registry 테스트로 고정한다.

## 회귀 보호

- 캘린더, 프롬프터, 팀 채팅, 공유 링크, 휴지통 등 standalone 기능 접근 유지
- `ALL_TOOLS`와 Sidebar 구조 유지
- 검색 시 Workspace 제목·설명·sub-tool aliases와 standalone 도구를 모두 검색
- 사진작업실 browser back/forward query 상태 유지
- Olivia의 기존 alias 점수와 ambiguous 처리 유지
- typecheck, 전체 test, build, 가능하면 lint 및 실제 `/admin/tools`, `/photo-sorting` 브라우저 확인

## 후속 단계와 경계

이번 1차는 Launcher, 중앙 mapping, deep-link, Olivia resolve까지다. 콘티·브랜드·콘텐츠·리포트의 여러 기존 화면을 하나의 내부 tab UI로 합치는 작업은 각 Workspace 후속 Phase에서 수행한다.
