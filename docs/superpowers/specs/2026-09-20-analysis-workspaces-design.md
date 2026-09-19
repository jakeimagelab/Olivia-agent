# Olivia 분석 작업실 네이티브 전환 설계

## 목표

브랜드 분석, 트렌드 분석, 병원 브랜드 이미지 진단, 채널 분석을 Olivia OS 창 안에서 iframe 없이 실행한다. 기존 페이지와 API·데이터 모델은 유지하면서 사진작업실의 헤더·탭·실행 상태 구조를 공유한다.

## 선택한 접근

기존 분석 페이지를 복제하거나 새 분석 로직을 만들지 않는다. 각 페이지의 client component가 `surface` prop을 받아 직접 URL과 OS 창에서 재사용되도록 하고, OS adapter는 해당 component를 동적 import한다.

공통 `components/analysis-workspace/`는 다음 책임만 가진다.

- `AnalysisExecutionProvider`: 대기·진행·완료·실패와 마지막 실행 시각 보관
- `AnalysisExecutionBar`: 실행 상태와 진행 메시지를 일관되게 표시
- `AnalysisWorkspaceHeader`: 제목·설명·대상 정보 영역
- `AnalysisWorkspaceTabs`: 기능별 탭 정의를 같은 세그먼트 UI로 표시
- `AnalysisWorkspaceShell`: 창/직접 URL surface의 여백과 스크롤 규칙

각 분석 페이지는 현재의 fetch와 결과 렌더링을 유지하며 실행 시작·완료·실패만 Context에 보고한다. 기능별 탭은 현재 실제 화면 상태에 맞춰 선언한다.

## 레지스트리

네 route에 전용 app definition과 adapter를 추가한다. `getOliviaAppByRoute()`가 전용 앱을 먼저 찾으므로 `legacy-route` iframe은 자동으로 우회된다. 기존 `app/<route>/page.tsx`는 남아 직접 URL도 유지한다.

## 오류와 성능

무거운 분석 화면은 adapter에서 `next/dynamic`으로 로드한다. 기능 하나의 로드/실행 실패는 해당 창에만 표시한다. API 요청 순서와 서버 로직은 바꾸지 않는다.

## 검증

- 네 route가 registry 전용 adapter로 해석되는지 테스트
- legacy iframe 로딩·실패·재시도 동작 확인
- typecheck, 전체 테스트, production build
- 직접 URL과 OS 창 양쪽 렌더링 확인
