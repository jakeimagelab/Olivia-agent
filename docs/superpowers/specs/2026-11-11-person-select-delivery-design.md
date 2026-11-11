# 개인별·공동 셀렉 보정본 전달 설계

작성일: 2026-11-11

대상: Olivia OS 사진선택(person-select)

상태: 사용자 승인 완료, 구현 전 설계 기준

## 1. 목표

고객이 기존 개인별 또는 프로젝트 공동 링크에서 원본 사진을 선택한 뒤, 같은 프로젝트와 같은 인증 방식으로 보정본을 확인하도록 확장한다. 고객은 사진별 확인 또는 수정 요청을 남기고, 모든 보정본을 확인한 후 최종 확인과 원본 다운로드를 진행한다.

다음 원칙을 지킨다.

- 기존 원본 사진, 셀렉, 제출, 주문, 메모 기록을 삭제하거나 변환하지 않는다.
- 개인별 로그인/PIN과 공동 공유 링크를 그대로 사용한다.
- `customer_stage`가 `delivery`일 때 원본 셀렉 화면은 숨기기만 한다.
- 보정본 원본은 비공개 Storage에 저장하며 승인 전에는 다운로드 URL을 발급하지 않는다.
- 파일 가져오기와 정리 작업은 Mac Studio 워커가 담당하고 Vercel을 파일 프록시로 사용하지 않는다.
- 기존 사진선택 UI 구조를 유지하고 새 독립 갤러리를 만들지 않는다.

## 2. 범위

### 포함

- 보정본 관련 DB migration
- 관리자 프로젝트 설정과 업로드 흐름
- Mac Studio `PERSON_SELECT_DELIVERY_IMPORT` 작업
- 개인별·공동 고객 보정본 검토 화면과 공개 API
- 사진별 확인/수정 요청, 수정 요청 제출, 최종 확인
- 승인 후 개별 다운로드 및 브라우저 ZIP 다운로드
- 관리자 진행 현황, 수정 요청 확인, 다시 열기, 보관 연장
- 보관 기한이 지난 원본의 자동 삭제 작업
- 권한·상태 전이·연결 규칙·버전 관리 테스트

### 제외

- 기존 셀렉 데이터 구조 교체
- 원본 셀렉 파일 삭제
- Vercel 서버 ZIP 생성
- 운영 DB 자동 migration 적용
- 보정본에 대한 새로운 별점/컬러 셀렉 시스템
- 기존 사진선택과 Bridge 화면의 임의 재디자인

## 3. 데이터 모델

기존 migration 번호와 충돌하지 않는 다음 순번인 `supabase/migrations/20261114_person_select_deliveries.sql`을 추가한다. 운영 DB에는 자동 적용하지 않는다.

### 3.1 person_select_events 확장

- `customer_stage text not null default 'select'`
  - 허용값: `select`, `delivery`
- `delivery_retention_days int not null default 30`
- `delivery_state text not null default 'none'`
  - 공동 모드의 프로젝트 단위 상태
- `delivery_approved_at timestamptz null`

체크 제약으로 단계와 상태의 허용값을 제한하고 보관일은 양수로 제한한다.

### 3.2 person_select_deliveries

보정본 논리 항목 한 장을 나타낸다.

- `id uuid primary key`
- `event_id uuid not null` → `person_select_events`
- `person_id uuid null` → `person_select_people`
  - 개인별 모드에서는 필수
  - 공동 모드에서는 `null`
- `group_label text null`
  - 공동 모드 폴더 구분
- `display_name text not null`
- `sort_order int not null default 0`
- `current_version int not null default 1`
- `status text not null default 'pending'`
  - `pending`, `revision_requested`, `revised`, `approved`
- `customer_memo text not null default ''`
- `linked_image_id uuid null` → `person_select_images`
- `link_method text null`
  - `exif`, `filename`, `folder`, `manual`
- `created_at`, `updated_at`

논리적으로 동일한 파일은 이벤트, 사람 또는 공동 그룹, 정규화된 파일명으로 찾는다. 재업로드 시 delivery 행을 새로 만들지 않고 버전을 올린다.

### 3.3 person_select_delivery_versions

실제 업로드 버전과 당시 수정 요청 기록을 보존한다.

- `id uuid primary key`
- `delivery_id uuid not null` → `person_select_deliveries`
- `version int not null`
- `storage_path_original text not null`
- `storage_path_preview text not null`
- `size bigint not null`
- `width int null`
- `height int null`
- `exif_datetime text null`
- `uploaded_at timestamptz not null`
- `customer_memo_snapshot text not null default ''`
- `(delivery_id, version)` unique

Storage 경로:

```text
person-select/{eventId}/deliveries/{deliveryId}/v{version}/original.jpg
person-select/{eventId}/deliveries/{deliveryId}/v{version}/preview.jpg
```

### 3.4 person_select_people 확장

- `delivery_state text not null default 'none'`
  - `none`, `reviewing`, `revision_sent`, `approved`
- `delivery_approved_at timestamptz null`
- `delivery_downloaded_at timestamptz null`
- `delivery_files_purged_at timestamptz null`

개인별 상태는 사람 행에, 공동 상태는 이벤트 행에 저장한다.

### 3.5 인덱스와 RLS

다음 조회 패턴에 맞는 인덱스를 둔다.

- deliveries: `(event_id, person_id, sort_order, id)`
- deliveries: `(event_id, status)`
- versions: `(delivery_id, version desc)`
- people: `(event_id, delivery_state)`

새 테이블은 RLS를 활성화한다. 브라우저 공개 API는 기존 서버 세션/공유 토큰을 검증한 뒤 service role 서버 클라이언트로 필요한 행만 읽고 쓴다. service role 키와 Storage 내부 경로는 고객 브라우저에 노출하지 않는다.

## 4. 인증과 권한

### 4.1 개인별 모드

- 기존 `/pick/[eventSlug]` 로그인과 세션 쿠키를 사용한다.
- API는 이벤트와 로그인한 `person_id`의 소속을 함께 확인한다.
- 고객은 자신의 delivery 행만 조회·수정·다운로드할 수 있다.

### 4.2 공동 모드

- 기존 공유 토큰과 검토자 세션을 사용한다.
- delivery 상태와 사진별 검토 결과는 프로젝트 공동 데이터다.
- 활성 검토자는 사진별 확인과 수정 요청을 할 수 있다.
- `can_finalize=true`인 검토자만 최종 확인할 수 있다.
- 레거시 공동 검토자의 `can_finalize`가 `null`이면 기존 호환 규칙에 따라 `true`로 처리한다.

### 4.3 다운로드 권한

원본 서명 URL은 다음 조건을 모두 만족할 때만 발급한다.

- 최종 확인 상태가 `approved`
- 보관 만료 전
- 현재 버전의 원본 경로
- 요청자에게 해당 개인 또는 공동 프로젝트 접근 권한이 있음

서명 URL의 유효기간은 10분이다. 승인 전 요청은 403을 반환한다. 미리보기는 목록 API에서 짧은 서명 URL로 제공한다. 다운로드 URL이 정상 발급된 최초 시점을 다운로드 시작 시도로 보고 `delivery_downloaded_at`을 기록한다.

## 5. 상태 전이

### 5.1 사진 상태

```text
pending ──확인──> approved
pending ──수정 요청──> revision_requested
revision_requested ──새 버전 업로드──> revised
revised ──확인──> approved
revised ──수정 요청──> revision_requested
```

- 수정 요청에는 비어 있지 않은 메모가 필수다.
- 새 버전을 올릴 때 직전 메모를 version의 `customer_memo_snapshot`에 남긴다.
- 관리자가 다시 열어도 버전과 과거 메모는 삭제하지 않는다.

### 5.2 개인/프로젝트 상태

- 보정본이 처음 연결되면 `reviewing`
- 수정 요청이 하나 이상이고 고객이 전송하면 `revision_sent`
- 모든 현재 보정본이 `approved`일 때만 최종 확인 가능
- 최종 확인 시 `approved`와 `delivery_approved_at=now()` 저장
- 관리자 다시 열기 시 `reviewing`으로 변경하고 다운로드를 다시 잠근다.

상태 전이는 서버에서 트랜잭션성 검증을 수행한다. 화면 상태만 믿지 않는다.

## 6. 보정본 가져오기

### 6.1 관리자 화면

기존 `사진 올리기` 탭 내부에 `원본 올리기 | 보정본 올리기` 전환을 추가한다. 제목 줄에는 새 버튼을 추가하지 않는다.

보정본 모드에서 Mac Studio 폴더를 선택하거나 경로를 입력하고 업로드 작업을 생성한다. 작업 진행 및 최종 결과는 기존 작업 상태 UI와 사라지지 않는 결과 줄에 표시한다.

### 6.2 워커 작업

새 원격 작업:

```ts
PERSON_SELECT_DELIVERY_IMPORT
payload: { eventId: string; sourcePath: string }
```

워커는 하위 폴더를 포함해 JPG/JPEG만 읽고 다음을 수행한다.

1. EXIF와 상대경로 수집
2. 사람 또는 공동 그룹 연결
3. delivery 및 version 생성/갱신
4. 원본 파일 업로드
5. 긴 변 2000px, JPEG Q85 미리보기 생성 및 업로드
6. 결과 집계 반환

대용량 파일 바이트를 Vercel 함수로 전달하지 않는다. 워커가 Supabase Storage에 직접 업로드한다.

### 6.3 연결 우선순위

처음 성공한 규칙을 사용한다.

1. EXIF: 고객이 고른 프로젝트 원본 사진과 DateTimeOriginal/SubSec 기준 2초 이내이며 정확히 한 장
2. 파일명: 확장자를 제거하고 첫 `_` 또는 `-` 앞부분을 사람 이름과 비교
3. 폴더명: 직계 상위 폴더 이름을 사람 이름과 비교
4. 수동: 자동 연결 실패 항목을 관리자가 지정

이름 비교는 공백과 끝의 `님`을 제거하고 NFC 정규화한 값으로 한다. 공동 모드에서는 상위 폴더 이름을 `group_label`로 사용한다.

같은 사람 또는 같은 공동 그룹에서 정규화 파일명이 같으면 새 버전으로 처리한다. `revision_requested`였던 항목은 `revised`가 된다.

결과 예시:

```text
올림 52장 · 새 버전 8장 · 자동연결(촬영시각 31 / 파일명 9 / 폴더 10) · 연결 안 됨 2
```

## 7. 고객 화면

### 7.1 단계 분기

서버 페이지는 `customer_stage`를 확인한다.

- `select`: 기존 화면과 API를 그대로 사용
- `delivery`: 원본 사진 목록과 기존 셀렉 UI를 고객에게 내려주지 않고 보정본 화면을 렌더링

보정본이 없는 개인은 `보정본을 준비 중입니다.`를 표시한다. 기존 셀렉 기록은 관리자 화면과 DB에 유지된다.

### 7.2 레이아웃

기존 사진선택의 그리드, 미리보기, 전체화면 구조를 재사용한다.

- 사진 카드: 현재 버전 미리보기, 상태, 수정됨 배지
- 사진 상세: 크게 보기, 파일명, 버전, 메모 입력
- 사진 동작: `확인`, `수정 요청`
- 하단 고정 바: 전체/확인/수정 요청 수와 현재 가능한 핵심 동작

하단 핵심 동작은 상태에 따라 바뀐다.

- 수정 요청 존재: `수정 요청 보내기`
- 모든 사진 확인: `최종 확인`
- 최종 확인 완료: `한 장씩 저장`, `전체 받기`

모바일에서는 safe area를 반영하고 메모 키보드가 열릴 때 하단 바가 입력 영역을 가리지 않게 한다.

### 7.3 다운로드

- 한 장씩 저장: 10분 유효 원본 서명 URL을 받아 직접 다운로드
- 전체 받기: 현재 원본 서명 URL을 받아 브라우저에서 ZIP 생성
- Vercel 함수에서 ZIP 파일을 만들거나 파일 내용을 프록시하지 않음
- 일부 다운로드 실패 시 성공한 파일은 유지하고 실패 파일 재시도를 안내

보관 기간이 끝났거나 원본이 정리된 경우 다운로드 대신 다음을 표시한다.

```text
보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요.
```

## 8. 관리자 화면

### 8.1 프로젝트 설정

- 고객 화면 단계: `원본 셀렉`, `보정본 확인`
- 보정본 보관 기간: 기본 30일

단계를 바꾸어도 기존 데이터는 삭제하지 않는다.

### 8.2 진행 현황

기존 사람별 진행표에 다음 정보를 추가한다.

- 보정본 장수
- 수정 요청 장수
- 최종 확인 여부와 날짜
- 최초 다운로드 여부

`수정 요청만 보기` 필터에서는 요청 메모, 현재 보정본, 모든 버전과 메모 스냅샷을 한 화면에서 확인한다.

행 메뉴:

- `다시 열기`
- `보관 연장 +30일`

공동 모드는 프로젝트 단위 요약을 같은 정보 구조로 표시한다.

## 9. API

관리자:

- `POST /api/person-select/[eventId]/deliveries/import`
- `PATCH /api/person-select/[eventId]/deliveries/[deliveryId]/assign`
- `PATCH /api/person-select/[eventId]/deliveries/state`
  - 개인 또는 공동 보정본 검토 다시 열기
  - 개인 모드에서는 본문의 `personId` 소속 검증
- `PATCH /api/person-select/[eventId]/deliveries/retention`
  - 개인 또는 공동 보관 만료일을 30일 연장
  - 개인 모드에서는 본문의 `personId` 소속 검증

개인 고객:

- `GET /api/pick/[eventSlug]/deliveries`
- `PATCH /api/pick/[eventSlug]/deliveries/[deliveryId]`
- `POST /api/pick/[eventSlug]/deliveries/submit`
- `GET /api/pick/[eventSlug]/deliveries/download-urls`

공동 고객:

- 위 기능을 `/api/pick/shared/[shareToken]/deliveries...`에 동일하게 제공한다.

공개 API는 요청 크기, 메모 길이, 이벤트 상태, 단계, 세션/토큰, delivery 소속을 서버에서 검증한다. 저장 횟수 제한은 IP가 아닌 개인 또는 공동 검토자 식별자를 기준으로 한다.

## 10. 자동 삭제

Mac Studio 워커 정기 작업이 하루 한 번 만료 대상을 조회한다.

- 개인: `person.delivery_approved_at + event.delivery_retention_days`
- 공동: `event.delivery_approved_at + event.delivery_retention_days`

만료되면 모든 버전의 `original.jpg`만 Storage에서 삭제하고 `delivery_files_purged_at`을 기록한다. 미리보기, DB 행, 메모, 상태, 버전 기록은 유지한다. 이미 삭제된 경로를 다시 처리해도 성공으로 보는 멱등 작업으로 구현한다.

## 11. 실패 처리와 관측성

`PERSON_SELECT_DELIVERY_IMPORT` runner는 실패 시 stdout 마지막 줄에 다음 JSON을 출력하고 exit 1로 종료한다.

```json
{"ok":false,"error":"<원인>","stage":"<단계>"}
```

`remote_jobs.result`에는 다음 진단 정보를 남긴다.

- stderr 마지막 40줄
- stdout 마지막 20줄
- exitCode
- workerCodeVersion
- 처리/성공/실패 수

관리자 화면에는 토스트와 함께 사라지지 않는 실패 박스를 표시한다.

```text
실패 · 원인 · 단계 · 시각
[자세히] [다시 시도]
```

재시도에는 동일 작업 중복 생성을 막는 멱등 키를 사용한다. 부분 성공은 롤백하지 않고 실패 파일만 다시 처리한다.

## 12. 테스트 전략

### 단위 테스트

- EXIF가 정확히 하나 일치하면 `exif`
- EXIF 불일치 후 파일명 일치하면 `filename`
- 파일명 불일치 후 폴더 일치하면 `folder`
- 모두 실패하면 연결 안 됨
- 이름 공백/`님`/NFC 정규화
- 같은 논리 파일 재업로드 시 버전 증가
- `revision_requested` 재업로드 시 `revised`
- 수정 요청의 빈 메모 거부
- 모든 사진이 approved가 아니면 최종 확인 거부
- 공동 검토자 최종 확정 권한 검증
- 최종 확인 전 download URL 403
- 만료 후 download URL 거부
- 보관 기간 경과 원본 삭제 대상 선정
- `customer_stage=delivery`에서 원본 사진 목록 미제공
- runner 예외 마지막 줄 JSON 형식

### 통합·회귀 테스트

- 개인 PIN 로그인 → 보정본 확인 → 수정 요청 → 재업로드 → 최종 확인 → 다운로드
- 공동 공유 링크 → 여러 검토자 사진별 검토 → 최종 권한자 확정
- 다른 개인/프로젝트 delivery ID 접근 거부
- 기존 원본 셀렉, 메모, 제출, 주문 데이터 유지
- 기존 개인별/공동 셀렉 화면과 RAW 매칭 정상
- 모바일 360/390/430px 하단 바와 키보드 대응
- Mac Studio 워커 미연결/부분 실패/재시도 표시

검증 명령:

```bash
npx tsc --noEmit
npx vitest run <관련 테스트>
npx vitest run
```

## 13. 구현 순서

1. migration과 공통 delivery 타입/상태 규칙
2. 서버 도메인 서비스와 개인·공동 인증 어댑터
3. 공개/관리자 API
4. Mac Studio import와 만료 정리 작업
5. 고객 delivery 화면
6. 관리자 설정·업로드·진행 현황
7. 테스트 및 회귀 검증
8. SQL 내용 별도 보고
9. 커밋·push
10. Mac Studio 워커 최신화·재시작 및 실제 작업 확인

## 14. 완료 조건

- 운영 DB를 자동 변경하지 않는다.
- SQL 파일 내용을 사용자에게 별도로 제공한다.
- 개인별과 공동 모드 모두 같은 링크/로그인에서 보정본 단계를 사용할 수 있다.
- 승인 전 원본 URL이 발급되지 않는다.
- 새 버전과 과거 수정 요청 기록이 보존된다.
- 만료 정리는 원본만 삭제한다.
- 기존 원본 셀렉과 관리자 기능에 회귀가 없다.
- TypeScript와 관련 테스트가 통과한다.
- 구현 커밋을 main에 push한다.
- Mac Studio 워커를 최신 코드로 재시작한다.
