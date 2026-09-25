# Olivia AppWindow 헤더 중복 점검

점검일: 2026-09-26

Olivia Desktop의 `AppWindow`/`WindowHeader`가 OS 제목 표시줄을 소유한다. 독립 URL은 기존 페이지 헤더를 유지하고, AppWindow에서만 페이지 제목과 뒤로가기/닫기 성격의 컨트롤을 숨긴다.

## 전용 Window Adapter

| 화면 | 기존 상태 | 창 안 처리 |
|---|---|---|
| 오늘 | 전용 창 UI | 중복 없음 |
| 고객관리 | `ClientsWorkspace` 직접 렌더 | 페이지 전역 헤더 없음 |
| 일정 | 자체 `GlobalHeader` | `CalendarEmbedProvider`로 숨김 |
| 사진작업실 | `PhotoWorkspaceHeader` 노출 | `hideHeader` 전달 |
| 메타데이터 셀렉 | 자체 `GlobalHeader` | `DesktopWindowProvider`로 숨김 |
| 견적서 | modal 헤더/액션 | `DesktopWindowProvider`에서 상단 제목을 숨기고 하단 `ActionBar` 사용 |
| 계약서 | 브랜드 제목과 액션이 함께 노출 | OS 창에서는 상단 제목을 제거하고 하단 `ActionBar` 사용 |
| 콘티 | 편집기 제목과 뒤로가기 노출 | OS 창에서는 제목/뒤로가기를 숨기고 편집 액션만 유지 |
| 초상권 동의서 | 문서 본문 제목 | OS 크롬과 별개인 문서 콘텐츠이므로 유지 |
| 문서함 | 전용 파인더 UI | 중복 없음 |
| 리뷰콘텐츠 | breadcrumb와 페이지 제목 노출 | OS 창에서는 breadcrumb/페이지 제목을 숨기고 편집 액션만 유지 |
| 메모 | 자체 `GlobalHeader` | adapter의 `embedded` prop으로 숨김 |
| 분석 4종 | `AnalysisWorkspaceHeader` 노출 | `surface="window"`이면 숨김 |
| Olivia/모든 앱 | 전용 창 UI | 중복 없음 |

## LegacyRoute iframe

전용 adapter가 없는 화면은 `LegacyRouteWindowContent`가 `oliviaEmbedded=1`로 연다. `RootExperienceShell`이 iframe 여부를 확인해 `html.olivia-embedded`를 설정하고, 공통 CSS가 `.oa-header`, `.pc-header`, `.analyzer-header`를 숨긴다. 독립 URL에서는 이 클래스가 없으므로 기존 헤더가 그대로 보인다.

## 판단 기준

- 네이티브 AppWindow: `DesktopWindowProvider` / 기능별 명시적 `surface="window"`를 사용한다.
- 레거시 iframe: `RootExperienceShell`의 `olivia-embedded` 신호를 사용한다.
- 모달 내부의 대화상자 제목, 문서 자체 제목, 테이블 섹션 제목은 OS 헤더가 아니므로 숨기지 않는다.
