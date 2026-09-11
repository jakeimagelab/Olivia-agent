# Olivia 공통 임시문서함 설계

## 목표

Olivia가 생성하는 견적서, 계약서, 콘티 등 모든 업무 문서를 실제 DB에 먼저 저장하고, 고객이 아직 확정되지 않은 문서는 공통 임시문서함에서 관리한다. Telegram에서는 생성 직후 이미지 미리보기를 제공하고, Olivia OS의 모바일 문서함에서도 같은 임시문서를 확인하고 고객등록까지 완료할 수 있어야 한다.

## 확인된 현재 상태

- 로컬 설정은 Hermes를 주 엔진으로 지정하지만 `http://100.89.79.55:8642/health` 연결은 실패한다.
- 화면에 표시된 Test 병원 견적은 실제 `quotes` 테이블에 `draft`, `client_id = null`로 저장되어 있다.
- 현재 문서함은 원본 테이블을 실시간 통합 조회하지만 별도 임시문서 상태나 카테고리가 없다.
- 현재 콘티 검색은 canonical `conti_runs`가 아닌 legacy `conti_saves`만 읽는다.
- Telegram 이미지 미리보기는 견적서만 지원하며 렌더 실패를 사용자에게 알리지 않는다.

## 핵심 구조

### 원본 문서

각 문서의 전체 내용은 기존 canonical 테이블에만 저장한다.

- 견적서: `quotes`
- 계약서: `contracts`
- 콘티: `conti_runs`, `conti_groups`, `conti_scenes`
- 보고서, 체크리스트, 수정요청서, 프로젝트 문서: `workflow_artifacts`
- 이후 지원할 문서: 해당 문서의 canonical 원본 테이블

임시문서함은 원본 내용을 복제하지 않는다.

### 공통 임시문서 인덱스

새 `temporary_documents` 테이블은 다음 공통 정보만 가진다.

- `id`
- `document_type`
- `source_table`
- `source_id`
- `title`
- `hospital_name`
- `client_id`
- `workflow_run_id`
- `status`: `pending_review`, `content_approved`, `pending_client`, `linked`, `archived`, `failed`
- `preview_url`
- `metadata`
- `created_at`, `updated_at`, `linked_at`

`source_table + source_id`는 유일해야 한다. 원본 문서가 정식 고객 문서함으로 연결되면 인덱스를 삭제하지 않고 `linked`로 전환해 이력과 중복 실행 방지를 유지한다. 기본 임시문서 목록은 `linked`, `archived`를 제외한다.

## 문서 생성 흐름

1. Olivia가 문서 생성 요청을 문서 종류별 canonical executor로 보낸다.
2. executor가 원본 문서를 `draft` 또는 해당 원본의 초안 상태로 저장한다.
3. 저장된 원본을 다시 읽어 필수 필드와 ID를 검증한다.
4. 병원명으로 고객을 정확 일치 검색한다.
5. 고객이 정확히 한 명이면 원본의 `client_id`와 활성 프로젝트를 연결하고 임시문서 인덱스를 `linked`로 기록한다.
6. 정확 일치 고객이 없으면 임시문서 인덱스를 `pending_review`로 생성한다.
7. 생성 결과에는 `temporaryDocumentId`, `documentType`, `resourceId`, `clientResolution`, `previewDescriptor`를 공통 형식으로 반환한다.

원본 저장이나 read-back 검증이 실패하면 생성 성공 문구를 반환하지 않는다. 임시문서 인덱스 생성이 실패하면 원본 저장 성공을 숨기지 않되 `failed` 복구 대상으로 기록하고 사용자에게 임시문서 등록 실패를 명시한다.

## 승인과 고객등록 상태 전이

### 기존 고객

정확히 일치하는 기존 고객이 있으면 질문 없이 문서를 고객과 활성 프로젝트에 자동 연결하고 정식 문서함에 표시한다.

### 신규 고객

1. 문서 생성 직후 상태는 `pending_review`다.
2. Telegram 이미지 또는 OS 미리보기에서 사용자가 첫 번째로 `오케이`, `승인`, `내용 확인`을 하면 `content_approved`로 전환한다.
3. Olivia는 `OO병원을 고객으로 등록할까요?`라고 명시적으로 질문하고 상태를 `pending_client`로 전환한다.
4. 두 번째 승인 시 고객을 생성하고 활성 workflow를 준비한 뒤, 같은 정규화 병원명을 가진 열린 임시문서를 모두 고객과 workflow에 연결한다.
5. 연결 검증 후 각 임시문서는 `linked`로 전환되고 정식 고객 문서함에 표시된다.
6. `보류`, `나중에`, `아직` 응답은 원본과 임시문서를 그대로 유지한다.

승인 의도는 대화의 pending action과 `temporaryDocumentId`에 묶는다. 단순한 `응`이 이전 문서가 아닌 다른 작업을 승인하지 않도록 conversation-scoped pending action을 사용한다.

## 과거 임시문서 고객등록

`예전에 만든 OO병원 고객등록` 요청은 다음 순서로 처리한다.

1. 열린 임시문서에서 정규화한 병원명으로 검색한다.
2. 병원 후보가 하나면 연결할 문서 종류와 개수를 요약해 승인을 요청한다.
3. 병원 후보가 여러 개면 병원명과 문서 목록을 보여주고 하나를 선택하게 한다.
4. 승인 후 고객을 생성하거나 기존 고객을 확정한다.
5. 같은 병원명의 견적서, 계약서, 콘티 및 다른 생성 문서를 재시도 가능한 일괄 작업으로 연결한다.
6. 일부 연결 실패 시 성공 문서와 실패 문서를 나눠 보고하고 실패 문서는 임시문서함에 남긴다.

## Telegram 이미지 미리보기

공통 `DocumentPreviewRenderer`가 문서 종류별 렌더러를 선택한다.

- 견적서: 기존 견적 HTML 렌더러 사용
- 계약서: 계약서 HTML/PDF 표현을 PNG로 렌더링
- 콘티: canonical 장면 데이터를 모바일 가독성에 맞춘 PNG 또는 여러 PNG로 렌더링

Telegram 전송은 `sendPhoto`를 기본으로 사용한다. 긴 콘티는 Telegram 이미지 크기 제한에 맞춰 여러 장으로 나눌 수 있다. 메시지에는 문서명, 초안 상태, 임시문서 ID와 `내용 확인`, `수정 요청`, `보류` 버튼을 포함한다.

렌더 또는 전송 실패를 조용히 무시하지 않는다. 원본은 이미 저장된 상태이므로 사용자는 `임시문서에 저장됐지만 이미지 생성에 실패했습니다`라는 안내와 OS 문서함 deep link를 받는다. 전송 재시도는 원본 문서를 다시 생성하지 않는다.

## Olivia OS 문서함

문서함 사이드바에 `임시문서` 카테고리를 추가한다. 데스크톱과 모바일이 같은 API를 사용한다.

임시문서 카드에는 다음 정보를 표시한다.

- 문서 종류와 제목
- 병원명
- 생성 시각
- `내용 확인 전`, `고객등록 대기`, `연결 실패` 상태
- 미리보기, 고객등록, 보류 또는 재시도 동작

카드는 `source_table`과 `source_id`로 원본 문서 화면을 연다. 현재처럼 `client_id`가 없다는 이유로 링크를 `#`로 만들지 않는다. 고객등록이 완료된 문서는 임시문서 기본 목록에서 빠지고 정식 고객 문서함에서 확인한다.

## Hermes 장애와 클라우드 fallback

문서 저장 계약은 Hermes와 클라우드 모델 양쪽에서 동일한 Olivia executor를 사용한다. Hermes가 사용자 출력이나 tool mutation 전에 연결 실패하면 클라우드 fallback이 문서 생성 도구를 실행해야 한다. 모델이 문서를 만들었다고 말했지만 tool audit에 저장 성공 기록이 없으면 완료 문구를 차단한다.

Telegram과 Web 응답 메타데이터에는 실제 엔진, 문서 ID, 임시문서 ID, 저장 검증 결과를 남긴다. 따라서 Hermes 장애 여부와 무관하게 저장 여부를 추적할 수 있다.

## 지원 범위

첫 구현은 견적서, 계약서, canonical Conti V2와 `workflow_artifacts`에 생성되는 보고서, 체크리스트, 수정요청서, 프로젝트 문서를 지원한다. 이후 생성형 문서는 공통 registry에 원본 adapter와 preview renderer를 등록하면 같은 흐름을 따른다. 메모와 갤러리처럼 별도 생명주기를 가진 자료는 임시문서 자동 등록 대상에 포함하지 않는다.

## 오류 처리와 복구

- 모든 생성 성공은 원본 DB read-back으로 검증한다.
- 원본 생성과 임시문서 인덱스 등록은 동일 요청에서 수행하며 중복 키로 재시도 안전성을 확보한다.
- Telegram callback은 idempotency key를 사용해 중복 승인을 막는다.
- 고객 생성 후 문서 연결은 문서별 read-back으로 검증한다.
- 일부 실패는 `PARTIAL_SUCCESS`로 보고하고 실패 문서를 `failed` 상태로 남긴다.
- preview 재생성은 문서 데이터를 변경하지 않는다.

## 테스트

- Hermes 연결 실패 후 클라우드 fallback에서도 원본과 임시문서가 저장되는지 검증
- 저장 audit 없이 생성 완료를 주장할 때 응답 차단
- 기존 고객 정확 일치 자동 연결
- 신규 고객의 `pending_review → content_approved → pending_client → linked` 전이
- 보류 응답이 원본과 임시문서를 유지하는지 검증
- 과거 병원명 검색, 단일/복수 후보, 여러 문서 일괄 연결
- 견적서, 계약서, Conti V2, workflow artifact 렌더와 Telegram `sendPhoto`
- 렌더 실패 시 저장 성공과 실패 안내가 함께 전달되는지 검증
- 모바일 문서함의 임시문서 목록, deep link, 고객등록 동작
- callback 중복 실행과 부분 연결 실패 복구

## 완료 기준

- 모든 지원 문서 생성 시 실제 원본과 임시문서 인덱스가 검증 가능하게 저장된다.
- 기존 고객 문서는 자동 연결되고 신규 고객 문서는 임시문서함에 남는다.
- Telegram에서 이미지 미리보기와 승인·수정·보류 동작을 사용할 수 있다.
- 모바일 Olivia OS에서 임시문서를 확인하고 고객등록할 수 있다.
- Hermes가 중단돼도 클라우드 fallback이 같은 저장 및 검증 계약을 지킨다.
- 관련 테스트, 전체 테스트, 타입 검사와 린트가 오류 없이 통과한다.
