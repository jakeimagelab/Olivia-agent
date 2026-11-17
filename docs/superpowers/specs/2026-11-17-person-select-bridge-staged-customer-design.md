# 개인별·공동 사진 셀렉 관리자 브릿지·고객 단계 화면 설계

## 목표

- 관리자는 한 작업실에서 고객별 원본, 선택분, 보정본, RAW 상태, 수정 요청과 주문을 확인하고 처리한다.
- 고객은 현재 해야 할 한 단계만 보고, 완료한 단계는 읽기 전용으로 다시 확인한다.
- 기존 `person_select_*`, delivery, 선택 동기화, RAW 매칭, 로우 셀렉 및 주문 저장 방식을 보존한다.
- DB 변경은 `person_select_events.offers_open` 추가만 허용한다.

## 선택한 접근

전용 `PersonSelectAdminBridgeWorkspace`를 만들고 기존 Olivia Bridge의 검색·필터·키보드 규칙을 공용 유틸리티로 재사용한다. 파일 시스템과 Bridge 전용 상태가 결합된 `OliviaBridgeWorkspace` 전체를 포함하지 않는다.

기존 진행·업로드·설정 패널을 CSS만 바꿔 한 화면에 쌓는 방식은 정보 중복과 서랍 상태를 남기므로 사용하지 않는다. 전체 Olivia Bridge를 그대로 삽입하는 방식도 개인별 고객·delivery 모델과 파일 시스템 모델이 충돌하므로 사용하지 않는다.

## 관리자 구조

`app/(client-hub)/person-select/[id]/page.tsx`는 데이터와 기존 컨트롤러를 조립하는 얇은 페이지로 유지한다. 실제 화면은 다음 경계를 갖는다.

- `PersonSelectAdminBridgeWorkspace`: 3칸 레이아웃과 선택 상태를 소유한다.
- `PersonSelectCustomerTree`: 고객·그룹, 가상 폴더, 상태 필터와 고객 검색을 담당한다.
- `PersonSelectAdminGrid`: 현재 노드의 원본, 선택분, 보정본 슬롯을 렌더한다.
- `PersonSelectAdminInspector`: 고객 또는 사진의 상세와 기존 `PersonDetailDrawer` 동작을 담당한다.
- `PersonSelectAdminToolbar`: 검색, 별점·컬러 필터, RAW 매칭, 로우 셀렉, 보정본 올리기와 설정을 연다.
- `PersonSelectAdminStatusBar`: 전체 인원과 단계별 집계를 표시한다.

사진을 판단하는 3칸 작업 영역은 중성 다크 `#2A2A2A`, 선택은 `#4FD8B8`, 어두운 화면의 주 실행은 `#37C39D`를 쓴다. 설정 모달과 설명은 밝은 화면을 유지한다. 채운 주 실행 버튼은 현재 문맥에서 하나만 둔다.

기존 `RawMatchDialog`, `RawMatchControls`, 선택 동기화, import 컨트롤러와 설정 저장 로직은 교체하지 않고 새 툴바·모달에 연결한다.

## 관리자 데이터 모델

화면 전용 순수 모델을 `lib/person-select/` 아래에 둔다.

- `resolvePersonSelectAdminStatus`: `selecting | submitted | retouch_pending | approval_pending | revision_requested | approved`
- `buildPersonSelectAdminTree`: 개인·공동 프로젝트의 고객/그룹과 `선택분`, `보정본` 가상 폴더를 만든다.
- `pairSelectedImagesWithDeliveries`: 선택 원본을 기준으로 보정본 슬롯을 만든다. `linked_image_id`를 우선하고, 연결되지 않은 보정본은 별도 미연결 목록으로 남긴다.
- `resolvePersonSelectCustomerStage`: 고객의 서버 상태를 기준으로 1·2·3단계를 결정한다.

개인별 관리자 GET은 DB에서 이미 모든 `person_select_images`를 읽지만 응답에서 제외한다. 새 endpoint를 만들지 않고 기존 관리자 GET 응답에 기존 행의 최소 메타데이터를 가산한다. 이미지 URL은 기존 서명 URL API로 현재 화면에 필요한 묶음만 지연 요청한다. 응답의 기존 필드는 바꾸지 않는다.

## 관리자 상호작용

- 왼쪽 트리는 `전체 / 보정 대기 / 수정 요청 / 미제출`을 지원하고 `↑/↓`로 고객을 이동한다.
- 가운데 검색은 `⌘F`, 별점·컬러 필터는 기존 Bridge의 공용 명령과 `⌥⌘` 단축키를 사용한다. 입력 중에는 사진 단축키를 실행하지 않는다.
- 고객 노드는 원본 전체, 선택분 노드는 서버에 저장된 고객 선택만 고른 순서로 표시한다.
- 보정본 노드는 선택 원본마다 슬롯을 하나 만들고 현재 버전과 상태를 표시한다.
- 보정본 source 폴더가 Mac Studio에 연결되어 있을 때 파일 드롭은 드롭 대상 슬롯을 기억하고 기존 worker import를 실행한 뒤 해당 원본에 연결한다. source 폴더가 없으면 업로드를 시작하지 않고 `보정본 폴더를 먼저 연결하세요.`를 표시한다. 브라우저 파일을 Vercel로 전송하는 새 경로는 만들지 않는다.
- 여러 파일을 빈 영역에 놓으면 기존 EXIF·파일명·폴더 자동 연결 규칙을 사용한다.
- 오른쪽 패널은 고객 상세, 주문, RAW 상태, 선택 재개, 링크·비밀번호 복사와 사진별 버전·수정 요청·관리자 삭제를 흡수한다.
- 삭제·재개처럼 복구 영향이 있는 동작은 기존 확인 절차를 유지한다.

## 고객 단계 모델

단계는 서버 값만으로 결정한다.

1. 제출 전이면 `사진 고르기`.
2. 제출 후 보정본이 없으면 `보정본 준비 중`, 한 장 이상 있으면 `보정본 확인`.
3. 선택분에 필요한 보정본이 모두 승인되고 최종 확인되면 `다운로드`.

수정 요청 후 새 버전이 올라오면 그 delivery는 다시 확인 대상으로 분류되어 2단계로 돌아간다. 완료한 단계는 진행 막대에서 읽기 전용으로 열 수 있다. 자동 단계 결정과 충돌하는 기존 수동 `customer_stage` 값은 데이터 호환을 위해 삭제하지 않지만 새 고객 내비게이션의 기준으로 사용하지 않는다.

개인·공동 화면은 같은 `PersonSelectCustomerStageHeader`와 순수 단계 함수를 사용한다. PC 고객 브릿지는 현재 3칸 레이아웃을 유지하고 위쪽 진행 막대와 단계별 데이터 제한만 적용한다.

## 고객 화면

- 공통 헤더: `행사명 · 고객명`, 현재 단계, 안내 한 줄, 3단계 진행 막대.
- 1단계: 모바일 3열 그리드, 선택 순서 번호, 전체/선택 필터, 길게 눌러 메모, 저장 상태, 단일 `선택 제출` 주 실행.
- 2단계: 현재 보정본 한 장을 큰 카드로 표시하고 `원본과 비교`, `수정 요청`, `좋아요`를 제공한다. 하단 필름 줄에 승인·현재·준비 중 상태를 표시한다.
- 3단계: 2열 보정본 그리드, 사진별 저장과 기존 전체 ZIP 다운로드, 기존 보관 기간 안내.

`PersonSelectCustomerTabs`의 원본/보정본 탭은 제거한다. `PersonSelectDeliveryReview`, `PersonSelectOrder`, `CustomerBridgeSelect`의 저장·다운로드 동작은 유지하고 단계 셸 안으로 이동한다.

## 액자·앨범 공개 설정

마이그레이션은 다음 한 컬럼만 추가한다.

```sql
alter table public.person_select_events
  add column if not exists offers_open boolean not null default false;
```

기존 `person_select_people.orders`에 한 건 이상 주문이 저장된 event만 `offers_open = true`로 백필한다. 주문 데이터는 공개를 끄더라도 삭제하지 않는다.

- 관리자 `OfferSettings` 맨 위와 툴바 상태 칩이 같은 값을 갱신한다.
- 개인별·공동 공개 응답에 `offers_open`을 가산한다.
- `false`이면 고객 버튼과 상품 목록을 렌더하지 않는다.
- 주문 저장 route는 서버에서 다시 확인해 `403`과 `지금은 신청을 받지 않아요`를 반환한다.
- 공개 중이면 단계와 무관하게 헤더의 `액자·앨범` 버튼으로 기존 주문 화면을 연다.

## 오류와 빈 상태

- 보정본 source 미연결, worker 오프라인, 선택분 없음, 권한 없음은 비활성 버튼 옆에 이유를 표시한다.
- delivery 연결 실패는 숨기지 않고 가운데 `연결 안 됨` 목록과 오른쪽 수동 연결 동작으로 남긴다.
- 보정본이 아직 없으면 고객에게 `보정본을 준비 중입니다.`를 표시한다.
- 저장·업로드·삭제 실패는 기존 사라지지 않는 결과 박스와 재시도를 유지한다.

## 충돌 사본 처리

`components/olivia-bridge/useOliviaBridgeKeyboard.sync-conflict-20261116-022020-37M3FPY.ts`는 원본과 다르며, 원본의 최근 `Cmd+A` Scene 검토 수정이 없는 오래된 충돌 사본이다. 요청대로 자동 삭제하지 않고 결과 보고에 차이를 기록한다.

## 테스트와 실제 검증

단위 테스트:

- 여섯 가지 관리자 고객 상태 계산.
- 고객 단계 1·2·3과 수정본 재확인 전환.
- 선택 원본과 delivery의 빈 슬롯, 여러 버전, 수정 요청 연결.
- `offers_open = false`인 주문 저장의 403.
- 관리자 검색·필터·고객 키보드 이동의 순수 명령.

정적 검증:

- `npx tsc --noEmit`
- 관련 Vitest와 회귀 테스트.
- 쓰지 않는 이전 화면 컴포넌트는 전체 참조 검색 후에만 삭제.

실제 화면 검증은 벨라비타 프로젝트를 사용한다.

- 관리자: 고객 → 선택분/보정본 → worker 업로드 연결 → 오른쪽 상태 변화.
- 고객 390px: 1단계, 2단계 수정 요청과 새 버전, 3단계 다운로드.
- 액자·앨범 공개 전후 고객 화면.

실제 데이터나 권한 때문에 전체 흐름을 완료하지 못한 경우 완료로 보고하지 않고 막힌 단계와 확보한 화면을 명시한다.

