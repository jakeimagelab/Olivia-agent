# 모바일 UI·캘린더·채널분석기 통합 설계

## 목표

Olivia 관리자 화면의 모바일 밀도를 개선하고, 캘린더 주간 일정 편집 중 변경 시간을 즉시 보여주며, 외부 iframe 채널분석기를 Olivia 네이티브 기능으로 통합한다.

## 1. 모바일 관리자 UI

- 460px 이하 관리자 홈 헤더 제목은 현재 크기에서 20% 축소한다.
- AI Assistant 기능 카드는 모바일에서 아이보리 카드 배경·테두리·그림자를 제거하고 아이콘과 기능명만 4열로 표시한다.
- 승인 대기·진행 중·이번 달 완료·고객 응답 대기 KPI는 2열을 유지하되 패딩, 숫자, 보조 문구, 최소 높이를 축소한다.
- 모바일 사이드바는 헤더보다 높은 최상위 레이어에 표시하고 상단 `0`에서 시작한다. 메뉴가 열리면 오버레이와 헤더보다 항상 앞에 위치한다.
- `오늘·내일 고객 미팅`은 관리자 공통 글꼴, 자간, 굵기를 명시해 다른 Olivia 카드 제목과 통일한다.

## 2. 명언 픽셀 초상

- 기존 인물별 피부색·머리색·안경·수염 특성은 유지한다.
- 눈 하이라이트, 볼 음영, 귀 안쪽, 입술 음영, 셔츠와 재킷 라펠을 추가한다.
- CSS 기반 픽셀아트를 유지해 별도 이미지 다운로드나 외부 요청을 만들지 않는다.

## 3. 캘린더 주간 시간 미리보기

- 일정 전체 이동 중 ghost 상단에 새 시작 시간을 옅은 회색 작은 라벨로 표시한다.
- 위쪽 경계 리사이즈 중 박스 상단에 변경 중인 시작 시간을 표시한다.
- 아래쪽 경계 리사이즈 중 박스 상단에 `시작–종료` 미리보기를 표시한다.
- PC 마우스와 모바일 터치 모두 15분 단위 스냅 규칙을 사용한다.
- 저장은 기존 API와 `onUpdateTask`를 그대로 사용하고, 미리보기는 화면 상태로만 관리한다.

## 4. 채널분석기 네이티브 통합

### 구조

- 기존 `/channel-analyzer` iframe을 제거한다.
- ZIP의 4채널 분석 로직을 Olivia 서버 코드로 이식한다.
- 분석 화면은 Olivia 공통 로고·제목 헤더와 고객 연결 배너를 사용한다.
- 입력 채널은 인스타그램, 홈페이지, 네이버 플레이스, 블로그다.
- 인스타그램은 서버에서 Apify를 사용하고, 선택적으로 Anthropic 문장 보정을 적용한다.
- 홈페이지·플레이스·블로그 수집은 서버 전용 URL 수집기로 수행한다.

### 보안

- URL은 `http/https`만 허용한다.
- localhost, 사설 IP, link-local, loopback 주소를 차단해 SSRF를 방지한다.
- 리다이렉트 이후 URL도 동일하게 검증한다.
- APIFY·Anthropic·Naver API 키는 서버 환경변수에서만 읽는다.
- API는 기존 관리자 미들웨어 보호 범위에 `/api/channel-analysis`를 추가한다.

### 고객 연결과 저장

- 독립 실행과 `clientId`, `projectId`, `workflowRunId`, `stepKey` 연결 실행을 모두 지원한다.
- 고객 선택 시 병원명·진료과·기존 채널 URL을 가능한 범위에서 불러온다.
- 분석 완료 결과를 `channel_analysis_reports`에 저장한다.
- 저장 항목은 고객·프로젝트·워크플로우 연결값, 입력 URL, 점수, 채널별 결과, 리포트, 원본 수집 요약이다.
- 페이지에서 최근 분석 이력을 조회하고 다시 열 수 있다.

### API

- `POST /api/channel-analysis/analyze`: 채널 수집·분석·저장
- `GET /api/channel-analysis/reports`: 고객 또는 최근 이력 조회
- `GET /api/channel-analysis/reports/[id]`: 단일 리포트 조회
- `POST /api/channel-analysis/benchmark`: 진료과·지역 주변 병원 벤치마킹

## 5. 데이터베이스

신규 additive migration `supabase/channel-analysis-integration.sql`을 추가한다.

```text
channel_analysis_reports
- id
- client_id / project_id / workflow_run_id
- hospital_name / specialty / address
- input_urls
- overall_score / overall_summary / photo_opportunity
- channel_results / report_data / collection_summary
- analysis_status / error_message
- created_at / updated_at
```

기존 테이블과 라우트는 삭제하거나 이름을 바꾸지 않는다.

## 6. 오류 처리와 호환

- 한 채널 수집 실패가 전체 분석을 중단하지 않으며, 성공한 채널 기준으로 결과를 만든다.
- AI 키가 없거나 AI 호출이 실패하면 규칙 기반 리포트를 생성한다.
- 저장 실패 시 분석 결과는 화면에 표시하고 저장 오류를 별도 안내한다.
- 기존 외부 분석 서비스와 iframe은 런타임 의존성에서 제거한다.

## 7. 검증

- 모바일 390px과 데스크톱 1440px에서 관리자 홈·AI Assistant·사이드바·채널분석기를 확인한다.
- 캘린더 이동, 위 경계 리사이즈, 아래 경계 리사이즈에서 시간 라벨을 확인한다.
- URL 검증과 리포트 변환 단위 테스트를 추가한다.
- `npm test`, `npm run typecheck`, `npm run build`를 통과한다.

## 완료 기준

1. 요청한 모바일 UI 6개 항목이 화면에서 확인된다.
2. 캘린더 주간 일정 변경 중 새 시간이 옅은 회색로 표시된다.
3. `/channel-analyzer`에 iframe이 없다.
4. 채널분석기가 Olivia 공통 헤더와 디자인을 사용한다.
5. 고객을 연결해 분석하고 결과를 다시 열 수 있다.
6. 외부 URL 수집에 SSRF 차단이 적용된다.
7. 기존 기능과 빌드가 정상 동작한다.
