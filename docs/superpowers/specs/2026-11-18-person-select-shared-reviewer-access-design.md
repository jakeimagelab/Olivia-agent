# 공유 셀렉 검토자 식별·권한·PIN·메모 설계

## 목표

기존 행사 공용 토큰과 검토자별 토큰, 자동 저장, 최종 제출, 대화 기능을 그대로 유지하면서 다음 문제를 해결한다.

- 공용 링크를 끌 수 있고, 개인 검토자 링크는 계속 사용할 수 있어야 한다.
- 누가 어떤 기기에서 접속했는지 개인정보를 과도하게 저장하지 않고 확인할 수 있어야 한다.
- 행사별 선택 옵션으로 공유 링크 입장 시 4자리 PIN을 확인할 수 있어야 한다.
- 사진별 메모의 작성자와 수정 시각을 확인하고 관리자가 보정 반영 여부를 관리할 수 있어야 한다.

운영 DB에는 이 작업에서 직접 적용하지 않는다. 기존 마이그레이션은 수정하지 않고 새 마이그레이션만 추가한다.

## 확정한 접근

기존 API와 `resolveSharedPersonSelectAccess`를 중심으로 기능을 추가하는 서버 경계 방식을 사용한다. DB RPC에 전체 흐름을 옮기는 방식은 회귀 범위가 크고, 프런트만으로 PIN과 로그를 처리하는 방식은 보안 요구를 충족하지 못하므로 사용하지 않는다.

`person_select_events.shared_link_active`를 공용 legacy 토큰의 활성 여부로 재사용한다. 이 값은 검토자별 토큰의 접속을 막지 않는다. 현재 `validateSharedEvent`가 모든 토큰에 이 값을 적용하는 동작은 공용 토큰 여부를 판별한 뒤 검사하도록 분리한다.

## 데이터 모델

Supabase CLI로 새 마이그레이션 하나를 생성하고 다음 변경을 넣는다.

### 행사와 검토자

- `person_select_events.shared_pin_required boolean not null default false`
- `person_select_shared_reviewers.pin_hash text null`
- `person_select_shared_reviewers.pin_version integer not null default 1`

PIN 원문은 저장하지 않는다. Node의 `scrypt`와 임의 salt로 만든 버전 포함 문자열만 `pin_hash`에 저장한다. PIN을 재발급하면 `pin_version`을 올려 기존 PIN 쿠키를 즉시 무효화한다.

### 접속 기록

`person_select_reviewer_access_logs`를 추가한다.

- 요청 필드: `id`, `event_id`, `reviewer_id`, `accessed_at`, `ip_hash`, `user_agent`, `device_id`
- 실패 기록을 위해 `outcome`(`success` 또는 `pin_failed`)과 `failure_reason`을 추가한다.
- `event_id`, `reviewer_id`, `accessed_at desc` 인덱스를 둔다.
- RLS를 활성화하고 `anon`, `authenticated` 권한을 회수한다. 서비스 역할 서버 코드만 읽고 쓴다.

IP는 원문을 저장하지 않는다. `PERSON_SELECT_SESSION_SECRET`를 이름 공간 salt와 함께 사용해 SHA-256으로 해시한다. User-Agent는 원문 대신 브라우저·OS·기기 종류의 짧은 요약만 저장한다.

성공 접속은 같은 `reviewer_id + device_id`의 최근 성공 기록이 30분 안에 있으면 다시 적지 않는다. PIN 실패는 보안 확인을 위해 매회 기록한다.

### PIN 실패 제한

전역 검토자 잠금으로 제3자가 링크를 고의로 막는 일을 피하기 위해 `person_select_reviewer_pin_attempts`를 추가한다.

- 키 범위: `reviewer_id + device_id + ip_hash`
- 필드: 실패 횟수, 첫/마지막 실패 시각, `locked_until`
- 5회 실패 시 해당 기기·IP 조합만 15분 잠근다.
- 성공하면 해당 조합의 실패 상태를 초기화한다.
- 이 테이블도 서비스 역할 전용 RLS로 제한한다.

### 메모 반영 상태

기존 메모 원문은 `person_select_shared_selection_item_state`와 기존 제출 테이블에 그대로 둔다. 관리자의 보정 반영 체크만 `person_select_reviewer_note_reviews`에 별도로 저장한다.

- `event_id`, `reviewer_id`, `image_id`를 고유 키로 사용한다.
- `completed_at`, `completed_by`를 저장한다.
- 메모가 수정된 뒤의 `memo_changed_at`이 `completed_at`보다 새로우면 UI에서 다시 미완료로 표시한다.
- 서비스 역할 전용 RLS를 적용한다.

## 공용 링크와 권한

### 토큰 판정

1. 검토자 토큰 해시가 맞으면 검토자별 링크로 처리한다.
2. 검토자 토큰이 아니고 `person_select_events.shared_token`이 맞으면 legacy 공용 링크로 처리한다.
3. `shared_link_active=false`는 2번만 403으로 막고 `담당자에게 개인 링크를 요청해 주세요`를 반환한다.
4. 검토자별 링크는 자신의 `active` 값과 토큰 버전만 검사한다.

### legacy 검토자 보호

legacy 검토자의 `active=false` 또는 `can_finalize=false` 요청과 공용 링크 끄기 요청은 현재 legacy 검토자를 제외한 활성 검토자 중 `can_finalize=true`인 사람이 한 명 이상일 때만 허용한다. 없으면 409와 `공용 링크를 끄기 전에 다른 검토자에게 최종 확정 권한을 주세요.`를 반환한다.

관리자 설정의 legacy 행에는 `공용 링크 — 접속자 구분 불가` 경고 배지와 `공용 링크 끄기/켜기` 버튼을 둔다. 공용 링크를 꺼도 기존 검토자별 링크, 드래프트, 제출, 대화 데이터는 유지한다.

## 접속 기록 흐름

브라우저는 첫 진입 때 `crypto.randomUUID()`로 `device_id`를 만들고 localStorage에 저장한다. 공유 셀렉 전용 fetch 래퍼가 모든 `/api/pick/shared/...` 요청에 `x-person-select-device` 헤더를 붙인다.

서버는 다음을 한 곳에서 처리한다.

- device ID 형식과 길이 검증
- 프록시 헤더에서 IP 추출 후 salt 해시
- User-Agent 요약
- 30분 중복 확인 후 접속 로그 기록
- PIN 쿠키 검증

SSR 첫 화면은 기기 ID를 알 수 없으므로 접속 로그를 만들지 않는다. 클라이언트가 초기화되며 호출하는 공유 접근 확인 API가 `resolveSharedPersonSelectAccess(..., { touch: true })`에 요청 컨텍스트를 전달하고 그때 `last_seen_at`과 접속 로그를 갱신한다.

관리자 API `GET /api/person-select/[eventId]/reviewers/[reviewerId]/access-logs`는 최근 기록, 성공 기기 수, 마지막 접속 시각을 반환한다. 설정 화면의 `접속 기록` 버튼은 밝은 Olivia 모달에서 시각·기기 요약을 보여준다. 서로 다른 성공 `device_id`가 세 개 이상이면 `여러 기기에서 접속됨` 경고를 표시한다.

## PIN 흐름

`shared_pin_required=false`가 기본값이며 기존 링크 동작은 달라지지 않는다.

### 발급

- 검토자를 만들거나 링크를 재발급할 때 4자리 PIN도 새로 생성한다.
- API 응답은 토큰과 PIN 원문을 발급 직후 한 번만 반환한다.
- 설정 화면은 링크와 PIN을 함께 한 번만 보여주고 복사할 수 있게 한다.
- PIN 옵션을 켤 때 활성 검토자 중 PIN이 없는 검토자는 일괄 발급하며, 그 응답에서만 발급 목록을 보여준다.
- legacy 공용 링크를 재발급할 때도 legacy 검토자의 PIN을 새로 발급한다.

### 확인

공유 페이지는 행사 정보와 토큰 유효성만 확인한 뒤, PIN이 필요하고 유효한 쿠키가 없으면 기존 `PersonSelectLogin`의 입력 카드와 스타일을 재사용한 PIN 전용 화면을 보여준다.

PIN 성공 시 서버가 HMAC으로 서명한 httpOnly, secure, sameSite=lax 쿠키를 30일간 발급한다. 쿠키에는 event ID, reviewer ID, PIN 버전, 만료 시각만 넣으며 PIN과 토큰은 넣지 않는다. API 요청 때 서명, 만료, reviewer ID, `pin_version`을 확인한다.

5회 실패 시 해당 기기·IP 조합을 15분 잠그고 남은 잠금 시간을 안내한다. 실패도 접속 로그에 남긴다.

## 메모와 피드백

### 고객 화면

Bridge 썸네일과 리뷰 목록은 현재 검토자의 사진별 메모가 있으면 메모 아이콘을 표시한다. 읽기 전용 제출 화면에서도 아이콘은 유지한다.

사진 상세의 메모에는 작성자 `display_name · role_label`과 `memo_changed_at`을 표시한다. 작성자는 현재 검토자이며, 제출본과 드래프트 모두 같은 표시 모델을 쓴다.

### 관리자 화면

관리자 Bridge 오른쪽 패널의 2단계 밑줄 탭을 `고객 | 미리보기 | 메모 모아보기`로 확장한다.

`메모 모아보기`는 탭을 열 때 지연 조회하며 다음을 제공한다.

- 검토자 필터
- `메모 있는 사진만` 필터
- 사진 썸네일과 파일명
- 모든 검토자의 메모, 역할, 마지막 수정 시각
- 관리자 전용 `보정 반영 완료` 체크

새 메모가 작성되거나 기존 메모가 수정되면 이전 완료 체크보다 새 시각이므로 자동으로 다시 미완료 상태로 보인다.

API는 `GET /api/person-select/[eventId]/reviewer-notes`와 관리자 전용 `PATCH`를 사용한다. 응답은 기존 관리자 프로젝트 응답에 큰 메모 목록을 추가하지 않아 기본 화면 로딩을 느리게 하지 않는다.

## UI 원칙

기존 Olivia Bridge의 밝은 설정 패널, 2단계 밑줄 탭, 경고 배지, 모달, 약한 버튼을 재사용한다. 새 화면의 채운 주 실행 버튼은 만들지 않는다. 링크/PIN의 일회성 노출과 비활성 이유를 텍스트로 명확히 표시한다.

## 오류 처리

- 공용 링크 비활성: 403, 개인 링크 요청 안내
- 대체 최종 확정자 없음: 409, 먼저 권한을 줄 검토자 안내
- PIN 불일치: 일반적인 불일치 문구만 반환하고 해시·토큰 정보는 노출하지 않음
- PIN 잠금: 429와 재시도 가능 시각 반환
- 접속 로그 쓰기 실패: 인증된 작업 자체를 막지 않고 서버 오류 로그에 구조화 기록
- PIN 상태 읽기 또는 검증 실패: 접속을 허용하지 않고 일반 오류 화면 표시
- 메모 완료 체크 실패: 기존 메모는 유지하고 체크만 원래 상태로 되돌림

## 테스트

### 권한과 링크

- 공용 링크를 끄면 legacy 토큰은 403과 개인 링크 요청 안내를 받는다.
- 같은 행사 검토자별 토큰은 공용 링크가 꺼져도 정상 동작한다.
- 다른 활성 finalizer가 없으면 legacy 비활성화, finalize 끄기, 공용 링크 끄기가 409다.
- 다른 활성 finalizer가 있으면 세 동작이 허용된다.
- 기존 공용 토큰, 검토자 토큰, 드래프트 저장, 제출, 대화 회귀 테스트가 통과한다.

### 접속 기록과 PIN

- 같은 reviewer/device는 30분 안에 성공 로그가 한 번만 생긴다.
- 다른 device ID 세 개면 관리자 응답에 다중 기기 경고가 포함된다.
- 저장된 IP 값이 원문을 포함하지 않고 salt가 다르면 해시도 달라진다.
- PIN 원문은 DB에 저장되지 않는다.
- PIN 쿠키는 30일, httpOnly이며 재발급 후 이전 쿠키가 무효다.
- 5회 실패하면 15분 잠기고 실패 로그가 남는다.
- PIN 옵션이 꺼져 있으면 기존 고객 흐름에 추가 단계가 없다.

### 메모

- 메모 응답에 검토자 이름·역할·수정 시각이 포함된다.
- 검토자 필터와 메모 있음 필터가 정확히 동작한다.
- 완료 체크 후 메모가 수정되면 다시 미완료로 계산된다.
- 고객 Bridge의 메모 있는 사진에 아이콘이 표시된다.

마지막으로 `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`과 관련 Vitest를 실행한다.

## 범위 밖

- 기존 공용 토큰 삭제
- 기존 선택·제출·대화 데이터 마이그레이션
- IP 원문 저장
- 접속 기기를 강제로 차단하는 기능
- 개인별 셀렉의 이름/PIN 로그인 변경
