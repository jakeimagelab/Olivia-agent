# PHASE E — 분석 기능 네이티브 작업실 전환

- 구현일: 2026-09-20
- 선행 커밋: `5946258c`

## 공통 구조

`components/analysis-workspace/`에 다음 공통 UI와 상태를 추가했다.

- `AnalysisHostContext`: 직접 URL, Desktop Window, Tablet surface 구분
- `AnalysisExecutionContext`: idle/running/completed/failed, 진행률, 마지막 완료 시각, 공통 실행 action
- `AnalysisExecutionBar`: 실행 버튼, 진행 메시지·진행률·마지막 실행 시각
- `AnalysisWorkspaceHeader`: 분석 제목, 설명, 대상
- `AnalysisWorkspaceTabs`: 사진작업실과 같은 `SegmentedTabs` 사용
- `AnalysisWorkspaceShell`: 공통 여백·스크롤·모바일 반응형 shell

기존 API와 결과 데이터 모델은 변경하지 않았다. 각 기존 page component를 그대로 재사용하며 실행 함수가 공통 Context에 상태만 보고한다.

## 전환된 앱

| 앱 | Route | Registry ID | 공통 탭 |
|---|---|---|---|
| 홈페이지 브랜드 분석 | `/brand-analysis` | `brand-analysis` | 분석 입력 / 분석 결과 |
| 병원 트렌드 분석 | `/trend-dashboard` | `trend-dashboard` | 대시보드 / 키워드 / 경쟁 병원 |
| 병원 브랜드 이미지 진단 | `/hospital-brand-image-diagnosis` | `hospital-brand-image-diagnosis` | 진단 진행 / 진단 결과 / 이전 진단 |
| 병원 채널 분석 | `/channel-analyzer` | `channel-analyzer` | 채널 진단 / 분석 이력 |

## Surface 처리

- Desktop: 전용 Registry adapter가 page component를 동적 로드한다. iframe을 사용하지 않는다.
- Tablet: 채널 분석과 브랜드 이미지 진단이 기존 `TabletRouteFrame` iframe 대신 같은 네이티브 page component를 사용한다.
- Mobile/직접 URL: 기본 `page` surface로 같은 반응형 component를 렌더한다.
- query의 `clientId`, `projectId`, `workflowRunId`는 Desktop WindowContext에서도 보존한다.

## 기능 보존

- 브랜드 분석 API, 다운로드, 결과 탭 유지
- 트렌드 수집, 키워드 분석, 경쟁 병원, AI 인사이트 유지
- 브랜드 이미지 진단 7단계, 업로드, 수집, 통합 리포트, 이전 진단 유지
- 채널 진단, 벤치마킹, 분석 이력, 고객/프로젝트 연결 유지

## 오류 격리

각 분석 실행 실패는 공통 실행 Bar와 기존 화면 오류 영역에 함께 표시된다. 동적 로딩 실패와 실행 실패는 해당 앱 창에만 제한되며 Olivia OS 전체를 중단시키지 않는다.

## 검증 결과

- `npm run typecheck`: 통과
- `npm test`: 176개 파일, 1,243개 테스트 통과
- `npm run build`: 통과 (기존 lint warning만 존재)
- Playwright 직접 URL 확인: 네 화면 모두 공통 실행 Bar·Header·Tabs 및 기존 본문 렌더링 정상
- 로컬 API 오류: 인증/DB가 없는 개발 세션의 기존 401/500만 확인, client render exception 없음
