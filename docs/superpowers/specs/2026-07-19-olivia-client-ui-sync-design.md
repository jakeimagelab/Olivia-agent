# Olivia 고객 생성 후 UI 동기화 설계

작성일: 2026-07-19

## 문제

올리비아의 `create_feature_record(domain: client)`는 Supabase `clients`에 정상 저장하지만, 이미 열린 고객 목록은 최초 마운트 때 한 번만 데이터를 조회한다. 생성 성공 이후 목록에 변경을 알리는 이벤트가 없고 결과가 상세 페이지 이동 정보를 반환하지 않아 새 고객이 즉시 표시되지 않는다.

고객 목록 API와 올리비아 실행기는 모두 서버의 service-role Supabase 클라이언트를 사용한다. 고객 목록 API에는 status 필터가 없으므로 RLS와 status 필터는 이 현상의 원인이 아니다.

## 변경

### 실행 결과 계약

기능별 CRUD 결과에 다음 필드를 유지한다.

```ts
{
  action: "done" | "navigate";
  domain: OliviaCrudDomain;
  operation: "create" | "update";
  recordId: string;
  url?: string;
}
```

고객 생성 성공은 `action: "navigate"`, `url: "/clients?id={recordId}"`를 반환한다. 다른 도메인은 기존 `done` 동작을 유지한다.

### 브라우저 갱신 이벤트

채팅 UI는 기능별 CRUD 성공 결과를 받으면 다음 이벤트를 발생시킨다.

```ts
window.dispatchEvent(new CustomEvent("olivia-data-changed", {
  detail: { domain, operation, recordId }
}));
```

이 이벤트는 생성과 수정 모두에 사용한다. 실행 결과가 이동을 요청하면 이벤트를 먼저 발생시킨 후 이동한다.

### 고객 목록

고객 목록은 다음 시점에 `/api/clients`를 다시 호출한다.

- 최초 마운트
- `olivia-data-changed` 이벤트의 domain이 `client` 또는 `workflow`
- 브라우저 탭이 다시 활성화될 때

중복 요청과 언마운트 후 상태 업데이트를 막기 위해 요청 취소 또는 활성 상태 검사를 적용한다. 목록 요청은 `cache: "no-store"`를 사용한다.

### API 캐시

`GET /api/clients` 응답에 다음 헤더를 추가한다.

```text
Cache-Control: private, no-store, max-age=0
```

## RLS

생성과 조회 모두 `getSupabaseAdmin()`을 사용하므로 service role이 RLS를 우회한다. 브라우저에서 anon 키로 `clients`를 직접 읽는 방식으로 변경하지 않는다. 기존 service-role 전용 정책을 유지한다.

## 오류 처리

- 고객 목록 재조회 실패 시 기존 목록을 지우지 않는다.
- 상세 이동은 생성된 고객 ID가 있을 때만 수행한다.
- 이벤트 payload가 잘못됐거나 다른 도메인이면 고객 목록은 반응하지 않는다.
- 고객 생성은 성공했지만 워크플로우 생성이 실패한 경우에도 고객 상세 페이지는 열 수 있어야 한다.

## 테스트

- 고객 생성 결과가 상세 URL을 반환한다.
- 고객 수정 결과는 `done`을 유지한다.
- 채팅 성공 처리에서 CRUD 이벤트가 발생한다.
- 고객 목록 요청이 no-store를 사용한다.
- 고객 API 응답이 no-store 헤더를 포함한다.
- 타입 검사, 전체 테스트, 프로덕션 빌드가 성공한다.

## 완료 기준

- 올리비아로 고객을 생성하면 고객 상세 페이지로 즉시 이동한다.
- 고객 목록을 다시 열면 새 고객이 표시된다.
- 고객 목록이 열린 상태에서도 생성·수정 이벤트를 받으면 자동으로 갱신된다.
- RLS 권한을 넓히지 않는다.
