# Bridge 협업 확장과 공통 AI 품질 검사 설계

작성일: 2026-11-07
대상: Olivia-agent 최신 `main`

## 1. 목적과 기존 구현 보존

관리자 Olivia Bridge와 고객 Bridge가 같은 사진 식별자와 같은 AI 품질 결과를 사용하도록 확장한다. 프로젝트 공유 사진선택의 다중 검토자 기능에는 사진별 대화, 최종 확정 권한, 안전한 원본 다운로드를 추가한다.

다음 현재 구현은 교체하지 않는다.

- 검토자별 전용 링크, 독립 draft·제출, 별점 1~5, 컬러 6~9, 사진 메모
- 프로젝트 대화와 서버 검증 SSE
- 고객 Bridge의 폴더 탐색, 작업 대상 선택, 리뷰, 전체화면, 자동저장
- 관리자 Bridge의 Adobe/직접 셀렉, 고객 셀렉 비교, RAW 매칭
- 개인별 PIN, classic 사진선택, 기존 공용 링크의 호환 검토자
- 기존 프로젝트 사진 1,645장과 모든 선택·주문·제출 데이터

새 기능은 additive migration과 기존 API 확장으로 구현한다. AI 판정은 별점·컬러·선택·파일을 자동 변경하지 않는다.

## 2. 채택한 구현 접근

### 2.1 AI 분석

세 가지 접근을 비교했다.

1. 모든 사진을 외부 시각 모델로 분석: 구현은 단순하지만 비용, 대기시간, 외부 전송량이 크다.
2. 전부 로컬 휴리스틱으로 분석: 저렴하지만 단체사진 눈감음, 실루엣, 의도적 움직임의 오탐이 크다.
3. **로컬 선별 + OpenAI 시각 재판정(채택)**: 경량 특징으로 정상 가능성이 높은 사진을 처리하고, 사람 판단이 필요한 후보와 저신뢰 결과만 OpenAI로 재판정한다.

기존 `app/api/photo-quality/route.ts`의 Anthropic 전용 호출은 공통 `PhotoQualityAnalysis` 서비스로 교체한다. 저장소가 이미 사용하는 `OPENAI_API_KEY`와 OpenAI 클라이언트를 재사용하고, 모델은 `OPENAI_PHOTO_QUALITY_MODEL`로 교체 가능하게 한다. 분석에는 원본 대신 기존 미리보기를 사용한다.

### 2.2 NAS 다운로드

기존 `nas_download_url` 외부 링크 열기는 호환 동작으로 유지한다. 새 안전 다운로드는 브라우저가 NAS 경로를 받지 않고 서버에 다운로드 작업을 요청한다. 서버는 프로젝트·검토자 권한을 확인하고 Mac Studio Worker에 상대 파일 식별자만 전달한다. Worker가 NAS에서 읽은 결과는 짧은 만료 URL 또는 ZIP 결과로 제공한다.

NAS 경로, 계정, Worker 인증값은 고객 응답에 포함하지 않는다. Worker가 지원되지 않거나 오프라인이면 외부 링크로 조용히 대체하지 않고 정확한 오류를 표시한다.

## 3. 데이터 모델

### 3.1 검토자 권한

`person_select_shared_reviewers`에 다음 필드를 추가한다.

- `can_view_ai_results boolean not null default false`
- `can_download_jpg boolean not null default false`
- `can_download_raw boolean not null default false`
- `can_finalize boolean not null default false`

기존 검토자는 모두 false로 이관한다. 기존 제출 권한은 그대로 유지하며, `can_finalize`는 여러 검토자의 제출 중 프로젝트 최종안을 확정하는 별도 권한이다. 최종 확정자는 관리자 또는 `can_finalize`가 있는 활성 검토자만 가능하다.

`person_select_events`에는 원본 다운로드 작업 연결에 필요한 관리자 전용 필드를 추가한다.

- `download_source_kind text null` — `mac_studio` 또는 기존 외부 공유 링크
- `download_source_ref text null` — 서버·Worker만 해석하는 불투명 식별자

공개 API에는 위 두 필드를 반환하지 않는다.

### 3.2 사진별 대화

기존 `person_select_project_messages`에 `image_id uuid null`을 추가하고 `(event_id, image_id, created_at, id)` 인덱스를 둔다.

- `image_id is null`: 프로젝트 전체 대화
- `image_id is not null`: 해당 사진 대화

메시지 생성 시 서버가 이미지가 같은 이벤트 소유인지 검증한다. 고객 요청에서 작성자·프로젝트 ID를 신뢰하지 않고 토큰으로 확정한다. 대화 데이터와 셀렉 데이터는 계속 독립 저장한다.

### 3.3 AI 분석 결과

`photo_quality_analysis_results`

- `id uuid primary key`
- `project_id uuid not null` — person-select 이벤트 ID
- `photo_id uuid not null` — `person_select_images.id`
- `content_fingerprint text not null` — 미리보기 내용/파일 버전 식별자
- `analysis_version text not null`
- `model_provider text not null`
- `model_name text not null`
- `analysis_status text not null` — `queued | analyzing | normal | suspected | needs_review | failed`
- `flags jsonb not null` — 복수 플래그와 각 판정 상태
- `confidence jsonb not null` — 플래그별 0~1 신뢰도
- `evidence jsonb not null` — 얼굴 검출 여부, 주 피사체 선명도 등 설명 가능한 요약
- `analyzed_at timestamptz null`
- `reviewed_by text null`
- `review_status text null` — `confirmed_issue | confirmed_normal | needs_review`
- `reviewed_at timestamptz null`
- `created_at`, `updated_at`

유일성은 `(project_id, photo_id, content_fingerprint, analysis_version)`이다. 같은 내용과 같은 분석 버전은 재사용한다. 현재 UI가 읽는 행은 사진별 최신 유효 결과 하나다.

`flags`의 키는 `eyes_closed`, `face_too_dark`, `motion_blur`이며 값은 `normal | suspected | unknown`이다. 눈이 보이지 않거나 얼굴이 검출되지 않는 경우를 불량으로 확정하지 않고 `unknown`과 `needs_review`로 보존한다.

### 3.4 AI 배치 작업

`photo_quality_analysis_jobs`

- 프로젝트, 상태, 분석 버전, 전체·완료·실패·검토필요 수
- `queued | running | paused | completed | partial_failed | failed | canceled`
- 시작·종료 시각, 요청 관리자, 오류 요약

`photo_quality_analysis_job_items`

- job ID, photo ID, 상태, 시도 횟수, 마지막 오류, 결과 ID
- `(job_id, photo_id)` unique

여러 Worker가 처리해도 `FOR UPDATE SKIP LOCKED` 또는 기존 원격 작업 claim 규칙으로 같은 항목을 중복 처리하지 않는다. 인덱스는 프로젝트/상태/갱신시각 조회 경로에 맞춘다.

### 3.5 다운로드 작업과 이력

`person_select_download_jobs`

- 프로젝트, 요청 검토자/관리자, 형식 `single | selected_zip`
- 대상 `jpg | raw`, 상태, 선택 photo ID snapshot, Worker job ID
- 결과 저장 위치, 만료 시각, 성공·실패 수, 오류

`person_select_download_audit`

- 프로젝트, 검토자/관리자, 작업 ID, 대상 수, 결과, 요청 시각, IP 해시

대상 사진은 요청 시점 snapshot으로 고정하고 모두 같은 프로젝트 소유인지 검증한다. RAW는 `can_download_raw`가 있어도 기존 RAW 매칭 결과가 명확한 사진만 허용한다.

## 4. 공통 PhotoQualityAnalysis 엔진

### 4.1 입력과 출력

엔진 입력은 `projectId`, `photoId`, `previewPath`, `contentFingerprint`, `analysisVersion`이다. 공개 URL이나 파일명으로 사진을 추측하지 않는다.

출력은 세 플래그 각각에 대해 상태, 신뢰도, 근거 요약을 반환한다.

- `eyes_closed`: 한 명/여러 명, 눈 가시성, 일부 인물 의심을 구분
- `face_too_dark`: 얼굴 영역 노출과 식별 가능성을 기준으로 판정
- `motion_blur`: 얼굴 또는 주 피사체 선명도를 기준으로 판정

얼굴 미검출, 옆모습, 고개 숙임, 실루엣, 배경 보케, 의도적 움직임은 저신뢰 불량으로 강제하지 않는다.

### 4.2 1차 로컬 선별

기존 `imageAdapter`, `visual-feature`, T컷 분석 유틸을 공통 입력 형태로 감싼다. 밝기 평균 하나로 판정하지 않고 가능한 경우 얼굴/주 피사체 영역 특징을 사용한다.

- 명확한 정상 또는 명확한 기술 결함 후보를 계산
- 애매한 결과, 얼굴 관련 판정, 의도성 구분이 필요한 결과는 OpenAI 재판정 대상으로 표시
- 로컬 결과만으로 확정할 수 없는 항목은 `unknown`

### 4.3 OpenAI 시각 재판정

OpenAI에는 기존 미리보기와 구조화된 판정 요청만 보낸다. 응답은 strict JSON 스키마로 검증하고 스키마 위반은 재시도 후 실패 처리한다.

- 모델: `OPENAI_PHOTO_QUALITY_MODEL`
- 낮은 해상도 미리보기 우선
- 한 요청에 과도한 사진을 묶지 않음
- 얼굴 수가 많거나 저신뢰일 때 검토 필요 유지
- 외부 호출 실패 시 로컬 후보를 불량으로 승격하지 않음

모델명, 프롬프트, 임계값이 바뀌면 `analysisVersion`을 변경한다.

### 4.4 캐시와 재분석

`contentFingerprint + analysisVersion`이 같으면 캐시를 사용한다. 미리보기 내용 또는 분석 버전이 바뀐 경우에만 새 결과를 만든다. 실패 항목만 재시도할 수 있으며 전체 사진을 매번 다시 분석하지 않는다.

## 5. API와 권한

### 5.1 관리자 AI API

- 분석 작업 생성·조회·일시정지·재개·실패 재시도
- 프로젝트 결과 요약·필터 조회
- 사진 판정 검토 `confirmed_issue | confirmed_normal | needs_review`

모든 변경 API는 관리자 세션과 rate limit을 확인한다. 기존 `/api/photo-quality`는 단일 base64 입력을 직접 받지 않고 인증된 프로젝트·사진 ID를 받는 공통 엔진 진입점 또는 호환 어댑터로 축소한다.

### 5.2 고객 AI API

검토자 토큰으로 접근하며 다음 조건을 모두 확인한다.

- 활성 검토자와 같은 프로젝트
- `can_view_ai_results = true`
- 요청 사진이 프로젝트 소유

고객은 결과 열람과 필터만 가능하다. 관리자 검토 상태를 변경하거나 분석 작업을 시작하지 못한다.

### 5.3 메시지 API

현재 프로젝트 메시지 API에 `imageId` 필터와 생성값을 추가한다. SSE는 프로젝트 변경 신호를 전달하고 클라이언트가 현재 전체/사진 대화의 canonical 목록을 다시 조회한다. 다른 프로젝트 imageId는 400 또는 403으로 거부한다.

### 5.4 다운로드 API

- 개별 JPG 다운로드 작업 요청
- 현재 검토자 셀렉 JPG ZIP 요청
- 허용 시 RAW ZIP 요청
- 작업 상태·진행률 조회
- 완료 결과의 짧은 만료 URL 발급

토큰, 권한, 프로젝트, photo ID, 선택 snapshot, Worker 가용성을 검증한다. URL 만료 후에는 권한을 다시 확인해 재발급하며 NAS 경로를 응답하지 않는다.

## 6. 화면 통합

### 6.1 관리자 Olivia Bridge

기존 왼쪽 `폴더와 필터` 패널에 `AI 품질 검사` 섹션만 추가한다.

- `AI 검사 시작` 보조 버튼
- 전체, 눈감음 의심, 얼굴 어두움 의심, 흔들림 의심, 확인 필요, 정상 개수
- 분석 중 진행률과 실패 재시도

중앙 썸네일에는 작은 품질 상태만 표시한다. 오른쪽 기존 미리보기 탭에 세 항목 결과와 `[문제 확인]`, `[정상으로 확인]`을 추가한다. 기존 선택·별점·파일 작업 버튼은 이동하지 않는다.

### 6.2 고객 Bridge

기존 폴더/그리드/미리보기·대화 구조를 유지한다.

- `can_view_ai_results`일 때만 같은 AI 필터와 읽기 전용 결과 노출
- 고객 셀렉은 AI 상태와 관계없이 허용
- 대화 탭에서 `프로젝트 전체`와 현재 사진 대화를 전환
- 다운로드 권한이 있을 때만 개별/선택 ZIP 동작 노출
- 최종 확정 권한은 일반 제출과 구분된 명칭과 확인 절차 사용

최종 제출만 고객 Bridge의 주 실행 오렌지 버튼으로 유지한다. AI 시작, 다운로드, 대화 전환은 보조 동작이다.

### 6.3 관리자 프로젝트 화면

기존 검토자 관리 행에 AI 열람, JPG 다운로드, RAW 다운로드, 최종 확정 권한을 추가한다. 검토자별 결과, 합집합, 전체 교집합, 관리자와의 교집합을 계산하되 원본 선택 데이터를 합치거나 덮지 않는다.

## 7. 오류와 상태 처리

- OpenAI 키/모델 없음: 작업 시작 전에 명확히 차단
- Worker 오프라인: 다운로드 작업을 완료로 표시하지 않음
- 분석 일부 실패: `partial_failed`와 실패 수 표시
- 저신뢰: 정상/불량 대신 확인 필요
- 메시지 SSE 단절: 재연결 및 제한 폴링 보완
- 다운로드 만료: 권한 재검증 후 새 URL 발급
- 검토자 비활성화: 새 메시지·다운로드·제출 즉시 거부
- 늦은 분석 응답: job item과 분석 버전이 현재 요청과 일치할 때만 반영

## 8. 검증 계획

### 8.1 협업

1. 세 검토자의 별점·컬러·메모·제출이 서로 독립
2. 검토자별 결과, 전체 교집합, 관리자 교집합 정확
3. 프로젝트 대화와 사진별 대화가 다른 프로젝트/사진과 섞이지 않음
4. SSE 동시 접속과 재연결 시 누락·중복 없음
5. 최종 확정 권한 없는 검토자 거부

### 8.2 다운로드

6. 권한 없는 JPG/RAW 요청 거부
7. photo ID가 다른 프로젝트면 거부
8. 고객 응답과 로그에 NAS 경로가 없음
9. 개별 JPG와 선택 ZIP 진행률·재시도·만료 처리
10. Worker 오프라인과 일부 실패 안내

### 8.3 AI 정확도

검증 세트에 정상 인물, 눈감음, 단체 일부 눈감음, 매우 어두운 얼굴, 얼굴은 보이는 어두운 사진, 실루엣, 흔들린 얼굴, 선명한 인물/흐린 배경, 의도적 움직임을 포함한다.

플래그별 precision, recall, `needs_review` 비율을 기록한다. 작은 검증 세트의 결과를 100% 정확도로 표현하지 않는다. 오탐/미탐 사진은 분석 버전과 함께 보고한다.

### 8.4 성능과 회귀

11. 1,645장 batch가 UI 요청과 분리되어 실행
12. 캐시 재실행에서 외부 AI 호출 0 또는 변경 사진만 호출
13. 분석 중 다른 OS 앱 사용, 일시정지·재개·실패 재시도
14. 관리자/고객 Bridge 폴더, 스크롤, 셀렉, 리뷰, 전체화면 정상
15. 기존 개인별 PIN, classic, 공용 링크, RAW 매칭 정상

실제 운영 데이터에는 테스트 별점·제출·AI 검토 결과를 쓰지 않는다. 전용 fixture 또는 테스트 프로젝트를 사용한다.

## 9. 단계별 구현 순서

1. additive migration과 권한/도메인 타입
2. 사진별 대화와 검토자 권한 API
3. 공통 PhotoQualityAnalysis 엔진과 캐시
4. 배치 job/Worker 실행 및 관리자 API
5. 관리자 Bridge AI 필터·미리보기
6. 고객 Bridge 읽기 전용 AI·사진별 대화
7. 안전 다운로드 job·감사 로그·UI
8. 관리자 비교/최종 확정과 전체 회귀 검증

각 단계는 이전 단계의 테스트가 통과한 뒤 진행하며 기존 20261109 migration을 다시 쓰지 않고 새 migration만 추가한다.

## 10. 완료 기준과 제외 범위

완료는 목업이 아니라 DB 저장, API 권한, Worker/배치 상태, 두 Bridge 화면의 실제 데이터 연결과 회귀 테스트를 포함한다.

이번 범위에서 제외한다.

- AI가 별점·컬러·선택·파일을 자동 변경하는 기능
- NAS 원본 수정·이동·삭제
- 검토자 조직/팀 계정 체계
- 메시지 첨부·수정·삭제·멘션
- 공개 고객이 AI 분석 작업을 직접 시작하는 기능
