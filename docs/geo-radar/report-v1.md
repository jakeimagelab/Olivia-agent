# GEO 레이더 v1 구현 보고서

- 작성·공식 문서 확인일: 2026-11-11 (KST)
- 대상 저장소: `jakeimagelab/Olivia-agent`
- 운영 DB 변경: **없음**
- 운영 API 호출: **없음**
- 배포·push: **없음**

## 1. 구현 범위

기존 AI Trust Gap의 데이터와 갭·전략·촬영 계획 기능을 유지하면서 GEO 레이더를 독립 앱으로 분리했다.

- 신규 라우트 `/geo-radar`
- 기존 `/ai-trust-gap`은 `/geo-radar`로 리다이렉트
- Olivia OS 전체 앱 목록과 검색에 `GEO 레이더` 등록
- 브랜드 진단센터의 AI 검색 하위 도구 제거
- 시안 기준의 새 분석 4단계와 결과 화면 구현
- 카카오맵 지연 로딩, 반경 원, 행정구역 폴리곤, 병원 마커·클러스터 구현
- HIRA 병원정보서비스와 카카오 로컬 보완 수집 작업 구현
- 4개 AI Provider의 실제 웹 검색 API 호출 구현
- 병원명 구조화 추출, 병원 목록 자동 매칭, 검수 대기함 구현
- 서버 작업 대기열, 재시도, 잠금, 비용 장부, 예산 차단, 180일 원문 보관 구현
- 순위·지도·사이트 점수 안내·갭/전략/촬영 계획·추이·CSV 탭 구현

## 2. DB 적용 순서

운영 DB에는 어떤 SQL도 실행하지 않았다. 아래 순서로 사용자가 검토 후 직접 실행해야 한다.

1. `supabase/ai-trust-gap-schema.sql`
2. `supabase/geo-radar-v1.sql`

두 번째 파일은 기존 `ai_trust_*` 테이블을 삭제하거나 이름을 바꾸지 않고 확장한다. 신규 테이블은 RLS를 활성화하고 `anon`, `authenticated` 권한을 회수해 서버 전용으로 두었다.

글로리의원 등록과 초안 프로젝트 준비는 별도 파일 `supabase/geo-radar-glory-client.example.sql`에 넣었다. 이 파일도 자동 실행하지 않았으며, 기존 `clients`에 같은 병원명이 있으면 재사용하는 멱등 SQL이다.

## 3. 화면 및 OS 연결

Olivia UI 토큰과 작업실 규칙을 적용했다. 독립 앱은 `AnalysisHostProvider surface="window"` 안에서 열리고 1280×820 기본 창, singleton으로 등록된다.

주요 화면:

- 새 분석 ① 범위·병원: `output/playwright/geo-radar-new-analysis-step1-1440.png`
- 새 분석 ② 질문 확인: `output/playwright/geo-radar-new-analysis-step2-1440.png`
- 새 분석 ③ 실행: `output/playwright/geo-radar-new-analysis-step3-1440.png`
- 결과 순위: `output/playwright/geo-radar-result-ranking-1440.png`
- 결과 지도 탭: `output/playwright/geo-radar-result-map-1440.png`
- 운영 현황·비용: `output/playwright/geo-radar-operations-1440.png`
- 390px 모바일: `output/playwright/geo-radar-result-mobile-390.png`
- OS 전체 앱 목록: `output/playwright/geo-radar-os-all-apps-1440.png`
- OS 창 실행: `output/playwright/geo-radar-os-window-1440.png`

SQL 미적용 로컬 환경에서는 스키마 적용 순서를 보여 주는 안전 화면을 표시한다. `preview` 쿼리는 개발 모드에서만 동작하며 실제 AI 호출이나 DB 쓰기를 하지 않는다.

## 4. 지도와 병원 데이터

지도 SDK는 GEO 레이더가 열린 뒤에만 로드한다.

- 반경형: 중심 주황 마커 + 반경 원
- 구 선택형: 강남구·서초구·송파구 GeoJSON 폴리곤
- 서울: 마커 클러스터러
- 결과 지도: 마커 크기는 언급률에 비례, 클라이언트는 주황색
- 키가 없으면 지도 영역에 설정 안내를 표시하고 목록 UI는 유지

행정구역 경계는 [southkorea/seoul-maps](https://github.com/southkorea/seoul-maps)의 2013 통계청 기반 데이터를 사용했다. 라이선스는 Apache License 2.0이며 `public/geo/README.md`에 출처와 확인일을 기록했다.

병원 목록은 HIRA 병원정보서비스의 `xPos`, `yPos`, `radius`, 피부과 코드 `14`를 사용하고, 카카오 로컬 REST API 결과로 좌표·전화·홈페이지를 보완한다. 이름·주소·전화로 중복 후보를 병합한다. 화면 하단 출처는 건강보험심사평가원으로 표시된다.

공식 데이터 설명과 공공누리 제1유형은 [공공데이터포털 병원정보서비스](https://www.data.go.kr/data/15001698/openapi.do)에서 확인했다.

## 5. 실제 AI 검색 측정

모델명은 코드에 고정하지 않고 다음 환경변수 또는 `ai_trust_settings.models`에서 읽는다.

- `AI_TRUST_OPENAI_MODEL`
- `AI_TRUST_GEMINI_MODEL`
- `AI_TRUST_ANTHROPIC_MODEL`
- `AI_TRUST_PERPLEXITY_MODEL`
- `AI_TRUST_EXTRACT_MODEL`

Provider별 구현:

- OpenAI: Responses API + `web_search`, 도구 호출 강제, `KR / Seoul` 근사 위치
- Gemini: Generate Content + `google_search` grounding. 별도 위치 필드 대신 한국어 지역 질문 사용
- Anthropic: Messages API + `web_search_20250305`, `KR / Seoul` 근사 위치
- Perplexity: Agent API `POST /v1/agent` + `web_search`, 도구 호출 강제. 별도 위치 필드 대신 한국어 지역 질문 사용

모든 호출은 60초 제한을 두고 응답 원문, 출처 URL, 실제 모델명, 토큰, 웹 검색 수, 요청 파라미터, 실행 시각을 저장한다. 429와 5xx는 대기열에서 1분→5분→30분 간격으로 최대 3회 재시도한다.

### Perplexity 변경 근거

2026-11-11에 Perplexity 공식 문서를 확인했다.

- [Migrate from Sonar to the Agent API](https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview): 신규 프로젝트에는 Agent API 사용을 권장하며, Sonar Chat Completions 지원은 2026-09-27 종료되었다고 명시한다.
- [Create Agent Response](https://docs.perplexity.ai/api-reference/agent-post): 실제 엔드포인트가 `POST https://api.perplexity.ai/v1/agent`이고 선택적 웹 검색을 지원함을 확인했다.

따라서 기존 Sonar Chat Completions가 아니라 Agent API로 구현했다.

그 밖의 공식 문서:

- [OpenAI Web search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Gemini Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search)
- [Anthropic Web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
- [Kakao Maps JavaScript API](https://apis.map.kakao.com/web/documentation/)
- [Kakao Local REST API](https://developers.kakao.com/docs/ko/local/dev-guide)

## 6. 비용·작업 운영

- `ai_trust_jobs`: `ai_query`, `clinic_sync`, `extract`, `score`, `retention`
- 작업 잠금 10분, 기본 배치 2건, 5분 Cron
- 프로젝트 기본 월 한도 $20, 전체 기본 월 한도 $100
- 80% 알림, 100% 자동 중단
- Provider·모델·토큰·검색 횟수·단가·금액을 `ai_trust_cost_ledger`에 기록
- Perplexity가 반환한 실제 비용이 있으면 설정 단가 추정보다 우선
- 원문 응답은 180일 뒤 비우고 집계 데이터는 유지

Vercel Cron은 `CRON_SECRET` 검증 후 `/api/cron/ai-trust-worker`를 5분마다 호출한다.

## 7. 검증 결과

- `npx tsc --noEmit --incremental false`: 통과
- `npx vitest run tests/geoRadar.test.ts tests/workspaceGroupTabs.test.ts`: 17개 통과
- 관련 파일 ESLint: 통과
- 실제 브라우저: 새 분석 1→2→3, 결과 순위·지도·운영 현황, 390px 반응형 확인
- OS 실제 브라우저: 전체 앱에 GEO 레이더 표시, 독립 창 실행 확인
- HTTP 확인: `/ai-trust-gap` 307 → `/geo-radar`, `/geo-radar` 200
- `npm run build`: 통과 (`/geo-radar` 20.3kB, First Load JS 125kB)

전체 빌드에는 기존 저장소 파일의 `<img>`·Hook 의존성 등 경고가 남아 있지만, GEO 레이더 관련 ESLint 경고와 오류는 0건이다.

브라우저 콘솔의 로컬 오류는 인증 없는 개발 세션에서 기존 Olivia shell이 `/api/remote-jobs`, 대화 API를 요청해 받은 401이다. GEO 레이더 자체 렌더링·전환 오류는 확인되지 않았다.

## 8. 적용 후 수동 확인 항목

운영 DB와 외부 API를 건드리지 말라는 조건 때문에 다음 값은 아직 실측하지 않았다.

- 언주역 1km·강남권의 실제 병원 수, 홈페이지 확보율, 중복 병합 수
- 글로리의원 질문 10개 × 연결 AI × 3회 실제 응답
- 추천 순위, 자동 매칭률, 검수 대기 건수, 실패·재시도 건수
- 실제 호출 수와 비용 장부
- 카카오 실제 지도, 구 경계, 서울 클러스터 화면

위 항목은 SQL 적용과 환경변수 설정 후, 글로리의원 예제 SQL을 검토·실행하고 GEO 레이더의 `새 분석`에서 실행한다. 실제 키가 없는 Provider는 UI에서 `키 없음`으로 비활성화되며 다른 Provider로 가장하지 않는다.

필요한 환경변수 이름은 `.env.example`에 값 없이 기록했다. 카카오 JavaScript 키에는 `olivia.photoclinic.kr`과 `localhost` 도메인을 등록해야 한다.
