# 고객 mutation 안전 패치 설계

작성일: 2026-09-27  
기준 커밋: `3c12621174be4bca1d90fb8fe0f56cab0a577780`

## 1. 목적

사용자가 `여의도기통찬의원 고객등록에서 삭제해줘`라고 요청했을 때 `client_create`가 강제 실행되어 반대 mutation이 발생한 사고를 막는다.

이번 변경의 완료 조건은 다음과 같다.

- 삭제 의도가 포함된 요청은 어떤 경로에서도 고객 생성이나 수정을 실행하지 않는다.
- 고객 생성과 보관은 사용자 승인을 받은 뒤에만 실행한다.
- 채팅에서 고객의 물리 삭제와 워크플로 취소는 허용하지 않는다.
- 고객 보관은 목록과 검색에서만 숨기며 프로젝트와 문서는 유지한다.
- 별칭 치환은 이미 완성된 정식명이나 중복 접미사를 더 늘리지 않는다.
- Hermes와 legacy 어느 엔진이 잘못된 도구를 선택해도 실행 직전 가드가 DB 변경을 차단한다.

## 2. 범위

### 포함

- 고객 생성·보관 intent 판정과 도구 강제 선택 규칙
- 고객 생성·보관 승인 흐름
- 고객 보관 상태 저장 및 목록·검색 제외
- 별칭 치환 중복 방지
- Hermes catalog와 approval policy
- 실제 사고 문장 및 승인 흐름 회귀 테스트

### 제외

- 채팅용 `client_delete` 도구
- 기존 `DELETE /api/clients/[id]` 변경
- 잘못 생성된 운영 DB 행의 자동 삭제
- 고객관리 화면 재설계
- 별칭 기능 자체 제거

## 3. 데이터 모델

`clients`에 다음 컬럼을 추가한다.

```sql
archived_at timestamptz null
```

`lead_status`는 `lead`, `prospect`, `contracted`, `active_client`만 허용하며 영업 단계 의미를 가진다. 보관 상태로 재사용하지 않는다.

보관은 해당 고객 행의 `archived_at`만 현재 시각으로 설정한다. 다음 데이터는 변경하지 않는다.

- `workflow_runs`
- 견적서·계약서·콘티·갤러리 등 연결 문서
- 포털 및 활동 기록

고객 목록과 고객 검색은 `archived_at is null`인 행만 반환한다. ID로 기존 문서와 프로젝트를 해석하는 조회는 보관 행을 계속 읽을 수 있어야 한다.

## 4. 도구 구조

### 공개 도구

#### `client_create`

기존 이름을 유지하지만 역할을 승인 요청으로 제한한다. 입력을 검증하고 중복 고객을 확인한 뒤 `REQUEST_APPROVAL`을 생성하며 DB에는 쓰지 않는다.

승인 문구 예:

> 여의도기통찬의원을 신규 고객으로 등록할까요?

#### `client_archive`

정확한 고객을 찾고 목록에서 숨길 것인지 승인만 요청한다. 이 단계에서는 `archived_at`을 변경하지 않는다.

승인 문구 예:

> 여의도기통찬의원을 고객 목록에서 숨길까요? 프로젝트와 문서는 그대로 유지됩니다.

정확한 이름 일치를 우선한다. 부분 검색 결과가 여러 개면 `AMBIGUOUS`, 없으면 `NOT_FOUND`로 종료한다. 메시지에 병원명이 명시된 경우 현재 활성 고객을 대체 대상으로 사용하지 않는다.

### 내부 실행 도구

#### `apply_client_create`

승인된 입력으로 기존 고객 생성 로직을 호출하고 생성 결과를 재조회해 검증한다. Hermes catalog에는 노출하지 않는다.

#### `apply_client_archive`

승인 시 고객 ID와 예상 병원명을 다시 조회한다. 이름이 달라졌으면 `TARGET_CHANGED`로 중단한다. 일치하면 `archived_at`을 기록하고 다시 조회하여 persisted 상태를 검증한다. Hermes catalog에는 노출하지 않는다.

### 완전 삭제

`완전히 삭제`, `영구 삭제`, `DB에서 지워`처럼 물리 삭제 의도가 명시되면 어떤 도구도 실행하지 않는다. 다음 취지로 안내한다.

> 완전 삭제는 연결된 프로젝트에 영향을 줄 수 있어 채팅에서 실행하지 않습니다. 고객관리 화면에서 확인 후 삭제하세요.

기존 화면의 `DELETE /api/clients/[id]`는 그대로 유지한다.

## 5. Intent와 강제 선택

고객 mutation intent 판정을 한 모듈에 둔다.

- 생성: 신규 등록, 고객으로 등록, 거래처 등록 등
- 보관: 삭제, 지워, 제거, 없애, 고객에서 빼, 등록 취소 등
- 완전 삭제: 완전히/영구/DB에서 + 삭제 계열 표현
- 일반 부정: 취소, 해지, 되돌려, 롤백, 중단, 하지 마, 안 할래 등

`resolveRequiredFollowupTool()`은 destructive/negative intent를 생성 후보보다 먼저 검사한다.

- destructive/negative intent가 있으면 `client_create`를 절대 반환하지 않는다.
- 실제 사고 문장은 반드시 `undefined`를 반환한다.
- 명시적인 생성 동사와 고객 대상이 함께 있는 경우에만 `client_create`를 반환할 수 있다.
- 반환된 `client_create`는 승인 요청만 만들기 때문에 즉시 DB mutation을 일으키지 않는다.
- 보관 요청의 `client_archive` 선택은 모델의 도구 선택에 맡기고 실행 직전 안전 가드로 보호한다.

legacy의 `tool_choice`는 문장의 동사와 도구 목적이 일치할 때만 적용한다. 삭제·취소·부정 표현과 생성 도구가 충돌하면 강제 선택을 제거한다.

## 6. 실행 직전 Mutation Intent Guard

모든 도구 실행은 Hermes와 legacy 공통으로 `validateMutationIntent()`를 통과한다.

최소 차단 규칙:

| 사용자 원문 | 차단 도구 |
|---|---|
| 고객 삭제·보관 의도 | `client_create`, `apply_client_create`, `client_update` |
| 신규 고객 등록 의도 | `client_archive`, `apply_client_archive` |
| 완전 삭제 의도 | 모든 고객 mutation 도구 |

차단 결과:

```ts
{
  success: false,
  code: "MUTATION_INTENT_CONFLICT",
  verification: { executed: false }
}
```

기능이 없거나 의도가 불명확할 때 반대 작업으로 대체하지 않는다.

## 7. 별칭 치환

별칭 매치 위치에서 원문이 이미 `ref.name`으로 시작하면 치환하지 않는다.

예:

- 별칭 `여의도기통찬`, 정식명 `여의도기통찬의원`
- 입력 `여의도기통찬의원 삭제`
- 결과 `여의도기통찬의원 삭제`

짧은 별칭만 입력한 경우는 기존처럼 치환한다.

- 입력 `여의도기통찬 삭제`
- 결과 `여의도기통찬의원 삭제`

치환 후보를 적용한 결과 정식명의 접미사가 중복되거나 기존 문자열보다 canonical-name 반복이 늘어나면 해당 치환을 취소한다. 이미 손상된 `여의도기통찬의원의원` 입력은 자동 교정 범위에 포함하지 않지만 더 늘어나지는 않아야 한다.

## 8. 승인 상태

`REQUEST_APPROVAL`에 사용자가 확인할 수 있는 대상 이름과 동작을 명확히 넣는다.

- 생성 확인 버튼: `등록`
- 보관 확인 버튼: `목록에서 숨기기`
- 취소 시 mutation 없음
- 승인 시에만 내부 `apply_*` 도구 실행

승인 요청과 승인 실행 사이에 대상이 변경되는 상황을 막기 위해 `clientId`와 `expectedHospitalName`을 내부 입력으로 유지하고 실행 직전에 재검증한다.

## 9. Hermes 노출 정책

- `client_create`: catalog 노출, approval policy
- `client_archive`: catalog 노출, approval policy
- `apply_client_create`: catalog 미노출
- `apply_client_archive`: catalog 미노출
- `client_delete`: 정의 및 catalog 노출 없음

삭제 요청에서 Hermes가 도구를 호출하지 않아 legacy fallback으로 넘어가더라도 mutation guard가 생성·수정을 차단한다.

## 10. 기존 미완성 초안 처리

현재 작업 트리에만 존재하는 `request_client_delete`와 `client_delete` 초안은 커밋되지 않은 상태다. 이를 최종 구조로 간주하지 않고 다음처럼 교체한다.

- `request_client_delete` 제거
- `client_delete` 제거
- 삭제 API 호출 및 post-delete workflow 검증 코드 제거
- 관련 테스트를 보관 승인 테스트로 교체

기존 사용자 변경이나 이 작업과 무관한 untracked 파일은 건드리지 않는다.

## 11. 테스트

### Tool selection

- `여의도기통찬의원 고객등록에서 삭제해줘` → `undefined`
- 위 문장에서 `client_create`, `client_update` 선택 불가
- `여의도기통찬의원 신규 고객으로 등록해줘` → 승인 요청용 `client_create`

### Mutation guard

- 삭제 원문 + `client_create` → `MUTATION_INTENT_CONFLICT`
- 삭제 원문 + `apply_client_create` → 차단
- 등록 원문 + `client_archive`/`apply_client_archive` → 차단
- 완전 삭제 원문 + 고객 mutation → 차단

### Approval

- `client_create` 호출만으로 DB 생성 없음
- 생성 승인 후 정확한 고객 한 건 생성 및 재조회 성공
- `client_archive` 호출만으로 `archived_at` 변경 없음
- 보관 승인 후 정확한 고객 한 건만 보관
- 대상 이름 변경 시 `TARGET_CHANGED`
- 부분 검색 복수 결과는 `AMBIGUOUS`, mutation 없음

### Alias

- 정식명이 이미 포함된 입력은 그대로
- 짧은 별칭은 한 번만 정식명으로 치환
- 이미 접미사가 반복된 입력은 더 늘어나지 않음

### Catalog

- `client_create`, `client_archive` 존재 및 approval policy
- `apply_client_create`, `apply_client_archive`, `client_delete` 미노출

### 전체 검증

- `npm run typecheck`
- `npm test`
- `npm run build`

## 12. 운영 데이터 정리

코드 배포와 운영 DB 정리를 분리한다. 잘못 생성된 고객은 고객관리 화면에서 정확한 행을 확인한 뒤 수동 삭제한다.

- 삭제 대상: `여의도기통찬의원의원`, `여의도기통찬의원의원의원`
- 보존 대상: `여의도기통찬의원`
- `olivia_events`의 `customer.created`를 조회해 같은 사고로 추가 생성된 고객이 없는지 확인

코드 변경 과정에서 이름만으로 운영 DB 행을 자동 삭제하지 않는다.
