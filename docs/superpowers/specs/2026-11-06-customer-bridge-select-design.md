# 고객용 Bridge 및 셀렉 비교 설계

작성일: 2026-11-06  
대상 저장소: `jakeimagelab/Olivia-agent`

## 1. 목표와 범위

기존 고객 사진선택(`select_galleries`)에 화면 방식만 추가한다. 기존 공유 링크
`/select/[shareToken]`과 기존 JPG 업로드, 메일링, 제출 이력, RAW 매칭 흐름은 유지한다.

- `classic`: 현재 고객 사진선택 화면과 동작을 그대로 사용한다.
- `bridge`: 관리자 Olivia Bridge의 선택·리뷰 상호작용을 고객 권한에 맞게 제공한다.
- 관리자 Bridge에는 명시적으로 연결한 갤러리의 고객 제출과 관리자 선택을 비교하는 기능을 추가한다.
- 고객 초안, 별점, 메모와 관리자 선택·별점은 서로 독립된 상태로 보존한다.
- NAS 원본 스트리밍, 원본 자동 썸네일 생성, RAW 자동 복사는 이번 범위에 포함하지 않는다.

## 2. 현재 구조와 제약

현재 공개 페이지는 `/api/select/[shareToken]`으로 갤러리를 읽지만, classic 웹 제출과
선택 파일 업로드는 관리자 보호 경로인 `/api/select-galleries/...`를 호출한다. 따라서
비로그인 고객은 미들웨어에서 401을 받을 수 있다. 공개 고객 변경 작업을 토큰 전용 API로
분리해야 하며 `/api/select-galleries` 전체를 공개해서는 안 된다.

현재 웹 선택은 `original_file_name`을 선택 키로 사용한다. 같은 파일명이 여러 하위 폴더에
있으면 한 항목으로 오인할 수 있으므로 새 구현은 이미지 ID를 기본 키로 사용하고
`relative_path`를 보조 식별자로 저장한다.

관리자 Bridge의 리뷰·범위 선택·마키 선택은 순수 함수가 이미 다음 파일에 분리되어 있다.

- `lib/photo-bridge/reviewMode.ts`
- `lib/photo-bridge/marqueeSelection.ts`
- `lib/photo-bridge/bridgeFiles.ts`

고객 화면은 이 계산 함수를 재사용하되 관리자 Bridge 컴포넌트 자체를 렌더하지 않는다.
이렇게 해야 RAW, 컬러 레이블, 파일 작업, 워커 실행 기능이 고객에게 노출되지 않는다.

## 3. 선택한 접근

### 채택: additive customer presentation

공개 데이터 계약과 선택 계산을 공통화하고 화면은 classic, customer Bridge, admin Bridge로
분리한다.

```text
/select/[shareToken]
  -> public gallery API
  -> view_mode === classic -> 기존 classic 화면
  -> view_mode === bridge  -> CustomerBridgeSelect

OliviaBridgeWorkspace
  -> 기존 관리자 선택 상태
  -> 명시적으로 연결한 galleryId의 최신 고객 제출
  -> 두 집합을 화면에서만 비교
```

관리자 Bridge를 고객 화면에서 권한만 가려 재사용하는 방식은 채택하지 않는다. 기능 노출
위험과 상태 결합이 크다. 기존 대형 공개 페이지에 모든 Bridge 로직을 직접 추가하는 방식도
classic 회귀 위험이 커서 채택하지 않는다.

## 4. 데이터 모델

새 migration은 기존 테이블을 삭제하거나 기존 값을 재작성하지 않는 additive migration이다.

### `select_galleries`

- `view_mode text not null default 'classic'`
  - check: `classic`, `bridge`
- `share_token_version integer not null default 1`
- `selection_revision integer not null default 0`
- `bridge_source text null`
  - check: `local`, `remote`
- `bridge_folder_path text null`
  - 원격 폴더의 `root-N/...` 가상 경로만 저장한다.
- `bridge_folder_display_path text null`
  - 사용자에게 보여줄 경로이며 절대 경로를 넣지 않는다.

기존 `client_id`, `workflow_run_id`, `photo_storage_project_id`는 그대로 연결 정보로 사용한다.

### `select_gallery_images`

- `relative_path text null`

신규 업로드는 가능한 경우 NFC 정규화한 상대경로를 저장한다. 기존 이미지의 값은 null로
유지하며 파일명으로 일괄 추정하거나 갱신하지 않는다.

### `select_gallery_drafts`

공개 토큰 사용자의 마지막 작업 상태를 갤러리별로 저장한다.

- `gallery_id text primary key`
- `token_version integer not null`
- `revision bigint not null default 1`
- `selected_image_ids text[] not null default '{}'`
- `ratings jsonb not null default '{}'`
- `image_notes jsonb not null default '{}'`
- `customer_memo text not null default ''`
- `created_at`, `updated_at`

`revision`은 자동 저장의 낙관적 동시성 제어에 사용한다. 토큰 재발급 시
`share_token_version`을 증가시키고 이전 버전 초안은 새 토큰 응답에 포함하지 않는다.

### `client_photo_selection_items`

- `customer_rating smallint null`
  - check: 1~5 또는 null

선택하지 않은 사진은 제출 item에 들어가지 않는다. 클릭으로만 선택한 사진은 rating null,
숫자 1~5로 선택한 사진은 해당 rating을 저장한다.

### `select_raw_matches`

- `invalidated_at timestamptz null`
- `invalidated_by_selection_id text null`

고객 재제출 시 기존 RAW 매칭 행은 삭제하지 않는다. 유효했던 행에 무효화 시각과 새 제출
ID를 기록하고 관리자 화면에는 `고객 재제출 · RAW 매칭 재승인 필요`로 표시한다. 최신 유효
매칭만 완료 수치에 포함한다.

### 공개 요청 제한

공개 변경 API는 DB 기반 fixed-window rate limit을 사용한다. 토큰 원문과 IP 원문은 저장하지
않고 SHA-256 key만 저장한다. service-role 전용 함수가 행 잠금과 카운트 증가를 처리한다.
오래된 window 행은 opportunistic cleanup한다.

## 5. 공개 API와 보안

### 조회

`GET /api/select/[shareToken]`

- 토큰 일치, 만료와 상태를 확인한다.
- `view_mode`, 공개 가능한 갤러리 필드, 이미지 ID/표시 URL/상대경로, 현재 토큰 버전의 초안,
  최신 제출 요약을 반환한다.
- 원본 파일시스템 경로, RAW 경로, service-role 정보는 반환하지 않는다.

### 초안

`PUT /api/select/[shareToken]/draft`

- 최대 body 크기를 content-length와 실제 읽은 byte 양쪽으로 제한한다.
- 토큰, 만료, `allow_web_select`, 이미지 소속, rating 범위, 사진별 메모와 전체 메모 길이를
  검증한다.
- 요청 revision과 DB revision이 일치할 때만 갱신한다.
- 충돌은 409와 서버 revision을 반환하며 조용히 덮어쓰지 않는다.

### 제출

`POST /api/select/[shareToken]/submit`

- `requestKey`를 필수로 받아 기존 `client_photo_selections.request_key` unique index로
  멱등 처리한다.
- 토큰, 만료, 차단 상태, `allow_web_select`, `allow_resubmit`, 선택 이미지의 갤러리 소속,
  메모와 요청 크기를 다시 검증한다.
- 트랜잭션 함수에서 selection, items, gallery 상태, 초안, RAW 무효화를 함께 처리한다.
- 같은 request key 재시도는 기존 selection을 반환하며 중복 행을 만들지 않는다.
- 재제출이 허용되지 않으면 409를 반환한다.

### classic 파일 업로드 제출

기존 `download_upload`도 비로그인 고객이 사용할 수 있도록
`POST /api/select/[shareToken]/upload` 공개 토큰 경로로 옮긴다. `allow_download_upload`, 파일
개수·크기·확장자·갤러리 소속과 재제출을 검증한다. 기존 관리자 경로는 다른 내부 호출자와의
호환을 위해 제거하지 않는다.

### 관리자 API

`/api/select-galleries`는 계속 관리자 인증 대상이다. PATCH는 임의 body spread를 제거하고
허용 필드만 갱신한다. 화면 방식 변경, Bridge 연결, 토큰 재발급은 관리자 전용 액션으로 둔다.

## 6. 고객 Bridge 상태와 상호작용

새 화면은 다음 상태를 이미지 ID 기준으로 가진다.

- `selectedIds: Set<string>`
- `ratings: Record<imageId, 1|2|3|4|5>`
- `notes: Record<imageId, string>`
- `focusedId`, `anchorId`
- `filter: all | selected | unselected`
- `thumbnailSize`
- `reviewOpen`, `reviewActiveId`, `reviewRemoved`
- `fullscreenOpen`
- `saveState: idle | saving | saved | error | conflict`

동작 규칙:

- 사진 클릭/체크: 다른 선택을 유지한 채 해당 사진만 토글한다.
- 1~5: 현재 대상에 별점을 저장하고 선택에 포함한다.
- 0: 별점을 제거하고 선택에서도 제외한다.
- Shift+클릭, Shift+방향키: anchor와 target 사이를 기존 선택에 추가한다.
- 마키: 마우스/펜에서만 사용한다. 터치에서는 스크롤을 우선한다.
- 키보드 이벤트는 input, textarea, select, contenteditable, IME 조합 중 실행하지 않는다.
- 사진 이동만으로 선택이나 rating을 바꾸지 않는다.

선택 변경은 450ms debounce로 초안 저장을 예약한다. 네트워크 오류 시 메모리와
`localStorage` 백업을 유지하고 재시도한다. 서버 저장 성공 후에만 `저장됨`을 표시한다.

## 7. 고객 Bridge UI

Olivia 작업실 토큰과 기존 Bridge의 정보 구조를 따른다.

### 데스크톱

- 상단: `Olivia Bridge`, 고객/촬영명, 전체 사진 수
- 도구: 전체/선택/미선택, 썸네일 크기, 리뷰, 전체화면
- 중앙: 진한 사진 캔버스의 썸네일 그리드
- 우측: `미리보기`, `선택·별점`, `사진별 메모`
- 하단: 선택 장수, 저장 상태, 리뷰, 최종 제출

### 모바일

- 2열 중심 그리드
- 촬영명/전체/선택 수를 짧게 표시
- 사진 터치 시 전체화면 미리보기
- 좌우 swipe 이동
- 선택/해제와 별점 조작
- 선택한 사진만 보기
- safe-area를 반영한 고정 제출 영역
- 입력 시 16px 이상 글꼴과 visual viewport를 고려한 메모 영역

사진 미리보기 기본 상태는 `object-fit: contain`이고 사진 전체가 viewport 안에 들어온다.
확대는 별도의 100%/200% 조작으로 제공하며 확대 상태에서만 내부 pan/scroll을 허용한다.
overlay 배경에는 blur를 사용하지 않는다.

## 8. 리뷰와 전체화면

레이아웃은 `bridgeReviewLayout`, 순환 이동은 `cycleBridgeReviewIndex`, 제거/복원은
`removeBridgeReviewItem`, `restoreBridgeReviewItem`을 재사용한다.

- 1장: single
- 2~4장: grid
- 5장 이상: deck
- Cmd/Ctrl+B: 선택 리뷰
- Space: 현재 사진 전체화면
- Escape: 현재 overlay 닫기
- 리뷰 중 0/↓: 선택 해제
- ↑: 직전 해제 복원
- 1~5: 현재 사진 rating 변경 및 선택 유지
- 좌우: 이전/다음

고객용 visual component는 별도로 만들며 관리자 리뷰의 DOM, 상태, 단축키를 변경하지 않는다.

## 9. 관리자 Bridge 비교

현재 `selectedIds`는 관리자 집합 A로 유지한다. 고객 최신 유효 제출은 별도 상태 B로 읽는다.

- 내 셀렉: A
- 고객 셀렉: B
- 공통 셀렉: A ∩ B
- 나만 선택: A - B
- 고객만 선택: B - A

필터 선택은 보이는 항목만 바꾸며 A나 B 자체를 변경하지 않는다. 카드에는 관리자 표시와
고객 표시를 독립적으로 렌더한다. 고객 rating은 고객 배지에만 쓰고 관리자 rating,
Adobe rating, color label과 합치지 않는다.

기존 개인별 사진선택 import는 `개인별 사진선택 행사 불러오기`로 명확히 유지하고, 신규
기능은 `갤러리 고객 셀렉 불러오기`로 별도 제공한다.

## 10. 갤러리와 폴더의 명시적 연결

Bridge에서 현재 폴더를 연 뒤 관리자가 갤러리를 직접 선택한다. 병원명, 최근 갤러리,
파일명 유사도로 갤러리를 자동 선택하지 않는다.

- 원격/NAS: `root-N/...` 가상 경로와 display path를 DB에 저장한다.
- 노트북 로컬: galleryId 연결은 DB에 기록하고 directory handle은 현재 브라우저 IndexedDB에
  저장한다. 로컬 절대경로는 서버로 보내지 않는다.
- 다른 브라우저에서 로컬 연결을 열면 권한 재선택이 필요하다는 상태를 표시한다.

이미지 매칭 순서:

1. 정확한 gallery image ID가 있으면 ID
2. 업로드 시 저장된 `relative_path`와 Bridge의 `relativeDirectory/name` 완전 일치
3. 기존 데이터는 같은 basename이 현재 폴더에 정확히 하나일 때만 fallback
4. basename 후보가 둘 이상이면 `matching_review_required`
5. 후보가 없으면 `missing`

첫 번째 후보를 임의로 선택하지 않는다. 결과에는 전체 제출 수, 찾은 수, 누락, 중복을 모두
표시하며 누락 또는 중복이 있으면 `전체 매칭 완료`로 표시하지 않는다.

## 11. RAW 매칭 연계

고객 제출을 불러오면 관리자 Bridge의 관리자 선택 A를 자동 덮어쓰지 않는다. 비교 결과를
확인한 뒤 기존 승인/실행 흐름을 통해 A에 반영하거나 RAW 매칭 대상으로 사용한다.

RAW 엔진은 기존 구현을 사용한다. 고객 제출만으로 복사 작업을 시작하지 않는다. 동명 RAW,
누락 JPG/RAW가 있으면 확인 상태로 남기고 일부 매칭과 완전 매칭을 구분한다.

고객이 재제출하면 기존 RAW 결과는 `invalidated_at`이 기록되어 최신 유효 결과에서 제외되고,
관리자에게 재확인 상태가 표시된다. 과거 결과는 감사 목적상 보존한다.

## 12. 오류 처리

- 공개 GET 실패: 링크 없음, 만료, 파일 만료를 구분한다.
- 초안 저장 실패: 로컬 상태를 유지하고 재시도 버튼을 제공한다.
- revision 충돌: 서버 상태로 자동 덮어쓰지 않고 충돌 안내 후 다시 불러오기/로컬 유지 선택을
  제공한다.
- 제출 실패: 제출 화면을 닫지 않고 동일 request key로 재시도한다.
- 이미지 로드 실패: 해당 카드에 실패 상태와 재시도를 표시하며 전체 그리드는 유지한다.
- 관리자 비교 매칭 실패: missing, duplicate, permission-required를 구분한다.

## 13. 테스트와 검증

### 단위 테스트

- 숫자 rating과 선택 규칙
- 범위 추가 선택, 마키 선택
- single/grid/deck, 해제/복원
- A/B 교집합과 차집합
- 상대경로 우선 매칭, 유일 basename fallback, 중복 basename 거부
- 공개 payload 크기, memo/rating 검증

### API 테스트

- 기존 갤러리와 신규 classic이 classic으로 응답
- bridge 설정 분기
- 공개 draft 저장/복원과 revision 충돌
- 비로그인 제출 성공
- 무효·만료 토큰, 다른 갤러리 image ID, 재제출 금지
- request key 멱등성
- 재제출 시 RAW 결과 무효화
- 관리자 PATCH 허용 필드 제한과 토큰 재발급

### 브라우저 검증

- classic 선택과 classic 파일 업로드
- bridge JPG 표시, 개별/범위/마키/숫자 선택
- 리뷰 single/grid/deck 및 전체화면 세로·가로 contain
- 새로고침 후 초안 복원
- 관리자 Bridge의 비교 필터와 출처 표시
- 개인별 사진선택 import 회귀
- 360px, 390px, 430px 모바일
- 관리자 Bridge 기존 데스크톱 화면과 리뷰/Adobe 별점 회귀

검증 명령은 프로젝트의 기존 스크립트를 기준으로 lint, typecheck, 관련 Vitest, build를
실행한다. DB migration이 실제 환경에 적용되지 않은 경우 브라우저의 실데이터 저장 검증은
통과로 보고하지 않고 별도 수동 확인 항목으로 남긴다.

## 14. 롤아웃

1. additive migration 생성
2. 공통 도메인/검증/매칭 함수와 단위 테스트
3. 공개 draft/submit/upload API
4. 관리자 생성·설정의 view mode
5. customer Bridge 화면
6. 관리자 Bridge 갤러리 연결과 비교
7. classic/API/Bridge 회귀 테스트
8. migration은 대표가 Supabase에서 실행한 뒤 실데이터 최종 확인

기존 갤러리는 migration 직후 모두 classic이며 관리자 설정을 바꾸기 전에는 화면이 달라지지
않는다.
