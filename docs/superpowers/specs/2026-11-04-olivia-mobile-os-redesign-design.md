# Olivia OS 모바일 UI 전면 개편 설계

작성일: 2026-11-04  
대상 저장소: `jakeimagelab/Olivia-agent`  
상태: 사용자 방향 승인 완료

## 1. 목표와 범위

모바일 Olivia OS를 데스크톱 OS의 축소판이 아니라 다음 역할에 맞는 독립 UI로 재구성한다.

- 직접 관리: 고객관리, 일정, 개인별 사진 셀렉 관리자
- 확인 중심: 견적서, 계약서, 촬영 콘티, Bridge, 사진작업실, 영상작업실
- Olivia 실행: 문서 수정 요청, Bridge 원격 작업, 사진·영상 작업 요청

모바일은 기존 API와 비즈니스 로직을 공유하지만 데스크톱 편집기 DOM을 그대로 마운트하지 않는다. 데스크톱 Dock, 창 관리자, 우측 정보 패널과 편집 UI는 변경하지 않는다.

## 2. 조사 결과

저장소에는 이미 별도 모바일 surface가 있다.

- `OliviaAdaptiveRoot`가 mobile/tablet/desktop을 분기한다.
- `OliviaMobileShell`은 URL 기반 모바일 내비게이션과 하단 메뉴를 제공한다.
- 모바일 홈, 일정, 고객, 문서 목록, 문서 미리보기, Olivia 채팅, 현장 콘티가 존재한다.
- 견적·계약 미리보기는 실제 API, PDF, pinch zoom을 이미 사용한다.
- 현재 하단 메뉴는 `홈 / 캘린더 / 메모 / 문서 / 올리비아 채팅`이다.
- 현재 모바일 고객관리는 조회 전용이며 문서 연결과 정보 수정이 없다.
- 현재 모바일 사진작업실은 데스크톱 `PhotoWorkspace`를 그대로 마운트한다.
- 모바일 Bridge 상태 화면과 개인별 사진 셀렉 관리자 화면은 없다.
- 앱별 모바일 제공 수준을 중앙에서 관리하는 정책이 없다.

따라서 새 모바일 앱을 다시 만드는 대신 기존 mobile surface를 확장하고, 데스크톱 컴포넌트 직접 마운트를 Viewer/관리 화면으로 교체한다.

## 3. 디자인 원칙

### 3.1 시각 언어

- 전체 배경: 현재 승인된 옅은 세이지 그린
- 카드: 밝은 바탕, 얇은 녹색 계열 경계, 중간 정도의 둥근 모서리
- 주 강조색: 브랜드 그린 `#155855`
- 주요 실행: 오렌지 `#E85D2C`
- 브랜드: 기존 포토클리닉 로고 에셋 재사용
- 글꼴과 아이콘: 현재 Olivia OS 체계 유지
- 상태는 색상과 텍스트 배지를 함께 사용
- 터치 영역은 최소 44px
- 모바일 입력 글자는 최소 16px
- 배경 blur는 사용하지 않음

### 3.2 모바일 전환

`OliviaAdaptiveRoot`의 별도 surface 분기를 유지한다. 최상위 OS는 전체 viewport를 차지하므로 기존 surface 판정은 유지하되 모바일 화면 내부의 열·카드·도구 배치는 `ResizeObserver` 또는 container query를 사용해 실제 가용 폭을 기준으로 조절한다.

- 기준 시작 폭: 약 768px 이하
- 휴대폰 landscape와 설치형 PWA의 visual viewport 반영
- iPad/태블릿은 기존 tablet surface를 유지
- 데스크톱 DOM을 media query로 대량 숨기는 방식은 사용하지 않음

## 4. 전체 아키텍처

### 4.1 유지하는 구조

- `OliviaAdaptiveRoot`: surface 선택
- `OliviaMobileShell`: 모바일 내비게이션과 화면 수명
- `MobileResourcePreview`: 견적·계약·일반 문서 Viewer 기반
- `MobileOliviaChat`: 전체화면 채팅과 visual viewport 처리
- 기존 Calendar, Client, Person Select, Remote Job, Document API

### 4.2 새 모바일 화면 계층

모바일 Shell 아래에 기능별 전용 화면을 둔다.

```text
OliviaMobileShell
├─ MobileHomeDashboard
├─ MobileClients
│  ├─ MobileClientList
│  └─ MobileClientDetail
├─ MobileCalendar
├─ MobilePersonSelect
│  ├─ MobilePersonSelectList
│  └─ MobilePersonSelectDetail
├─ MobileAllApps
├─ MobileDocumentViewer
│  ├─ Quote
│  ├─ Contract
│  └─ Conti
├─ MobileBridgeStatusView
├─ MobilePhotoWorkspaceStatus
├─ MobileVideoWorkspaceStatus
├─ MobilePrompter
└─ MobileOliviaView
```

각 화면은 desktop adapter가 아니라 필요한 API·store·도메인 helper만 재사용한다.

### 4.3 중앙 모바일 capability 정책

데스크톱 registry와 독립적으로 중복 앱 목록을 만드는 대신 `lib/olivia/mobile/appCapabilities.ts`에 직렬화 가능한 정책을 둔다. 정책의 앱 ID는 데스크톱 registry ID와 일치해야 하며 테스트에서 누락·중복을 검증한다.

```ts
type MobileMode = "manage" | "viewer" | "request" | "full" | "status" | "hidden";

type MobileAppCapability = {
  appId: string;
  group: "manage" | "photo" | "document" | "video" | "other";
  modes: MobileMode[];
  mobileView?: MobilePrimaryView;
};
```

기본 정책:

| 앱 | 모바일 모드 |
|---|---|
| 홈 | full |
| 고객관리 | manage, full |
| 일정 | manage, full |
| 개인별 사진 셀렉 | manage, full |
| 견적서 | viewer, request |
| 계약서 | viewer, request |
| 콘티 | viewer, request |
| Olivia Bridge | status, request |
| 사진작업실 | status, request |
| 영상작업실 | status |
| 프롬프터 | full |
| 업무일지 | manage |
| 미지원 앱 | hidden 또는 request |

정책은 모바일 전체 기능 화면, 빠른 작업, 딥링크 해석에 공통으로 사용한다. 각 화면 CSS에 모바일 제공 수준을 흩어놓지 않는다.

## 5. 모바일 공통 Shell

### 5.1 공통 헤더

`MobileScreenHeader`를 만든다.

- 홈: 포토클리닉 로고, 화면명, Olivia 진입
- 하위 화면: 뒤로가기, 화면 제목, Olivia 진입 또는 더보기
- 현재 대상을 제목에 반복 표시하지 않음
- 이전 고객명을 fallback으로 사용하지 않음

### 5.2 하단 내비게이션

고정 메뉴를 다음 다섯 개로 교체한다.

1. 홈
2. 고객
3. 일정
4. 사진선택
5. Olivia

Bridge, 견적서, 콘티, 메모, 문서는 하단 메뉴에 두지 않고 홈 빠른 작업 또는 전체 기능에서 연다.

- `env(safe-area-inset-bottom)` 반영
- 모든 스크롤 화면은 nav 높이만큼 하단 여백 확보
- 채팅, 문서 전체화면, 프롬프터 실행 화면에서는 필요에 따라 숨김
- 현재 화면을 `aria-current`로 표시

### 5.3 내비게이션 상태

기존 `mobileView` URL 방식을 확장한다. 문서, 행사, 고객, Bridge 폴더는 이름이 아닌 ID로 표현한다.

```ts
type MobileTarget =
  | { scope: "none" }
  | { scope: "client"; clientId: string }
  | { scope: "document"; documentType: string; documentId: string }
  | { scope: "event"; eventId: string }
  | { scope: "bridge"; selectionId: string };
```

화면 전환 시 `returnTo`를 Shell의 내비게이션 스택에 보존하여 Olivia 닫기 후 호출 화면으로 돌아간다. URL에는 필요한 식별자만 넣고 민감한 절대 파일 경로나 전체 데이터는 넣지 않는다.

## 6. 공통 작업 문맥

### 6.1 원칙

현재 화면의 검증된 실제 대상만 문맥으로 인정한다.

- 일반 진입: `contextScope: "none"`
- 고객 상세 진입: 실제 `clientId`
- 문서 Viewer: 서버에서 불러온 문서 UUID와 소유 `clientId`, `workflowRunId`
- 사진 셀렉: 실제 행사 ID
- Bridge: 실제 선택 identifier와 worker 상태

전역 마지막 고객, projectName, 창 제목, 과거 selection은 fallback으로 사용하지 않는다.

### 6.2 Olivia 요청 문맥

모든 Viewer/상태 화면은 `MobileOliviaTarget`을 명시적으로 만들어 채팅을 연다.

```ts
type MobileOliviaTarget = {
  source: "quote" | "contract" | "conti" | "bridge" | "photo" | "video" | "screen";
  title: string;
  documentId?: string;
  documentType?: string;
  documentNumber?: string;
  sceneId?: string;
  clientId?: string;
  workflowRunId?: string;
  eventId?: string;
  bridgeSelectionId?: string;
};
```

필수 ID가 없는 문서는 과거 고객 문맥으로 대상을 추측하지 않는다. 버튼을 비활성화하고 이유를 표시한다. 채팅 헤더에는 `현재 대상`과 검증된 문서·폴더명만 표시한다.

## 7. 모바일 홈

기존 홈의 API 연결은 재사용하되 섹션을 다음 순서로 재구성한다.

1. 오늘: 서울 기준 날짜, 오늘 일정과 예정 촬영
2. 진행 중 작업: 고객명, 현재 단계, 진행률, 다음 작업
3. 사진선택: 진행 중 행사, 제출 수, 마감 임박
4. 빠른 작업: 고객, 사진선택, Bridge 상태, 전체 기능

진행 중 작업은 검증된 workflow run 데이터만 사용한다. 현재 대상이 없는 홈에서 전역 마지막 고객을 노출하지 않는다. 데이터가 없으면 빈 상태를 명확히 표시하며 임의의 최근 고객을 현재 작업으로 승격하지 않는다.

## 8. 고객관리

### 8.1 목록

- `/api/clients?scope=list` 재사용
- 검색
- 전체 / 진행 중 / 촬영 예정 / 완료 필터
- 병원명, 진료과, 상태, 다음 작업 카드

### 8.2 상세

- 실제 고객 ID로 `/api/clients/{id}` 조회
- 고객 기본 정보와 현재 촬영 건
- 연결된 견적, 계약, 콘티, 사진 선택
- `고객 정보 수정`은 기존 `ClientFormModal mode="edit"`와 PATCH API 재사용
- 저장 성공 시 목록·상세만 갱신하고 열린 Viewer와 내비게이션 상태 유지
- 고객만 선택했을 때 촬영 건을 임의 선택하지 않음

연결 문서를 누르면 모바일 Viewer로 이동한다. 문서 응답의 고객 ID가 현재 고객과 맞지 않으면 오류를 표시하고 열지 않는다.

## 9. 견적서와 계약서 Viewer

`MobileResourcePreview`와 기존 canonical document renderer를 재사용한다.

- 고객명, 문서번호, 상태
- 화면 폭 맞춤 문서 미리보기
- pinch zoom과 전체화면
- 총액, 촬영 예정, 생성·수정일
- PDF 보기/다운로드
- 계약서 서명·공개 상태
- Olivia에게 수정 요청

모바일에서는 QuoteBuilder와 ContractBuilder 편집 폼을 마운트하지 않는다. 실제 고객용 서명 화면은 기존 서명 기능을 유지한다.

Olivia 요청 전 문서를 다시 조회하여 UUID와 실제 소유 관계를 확인한다. `documentId`, `documentType`, 문서번호, `clientId`, 존재할 경우 `workflowRunId`, 문서 제목을 전달한다.

## 10. 촬영 콘티 Viewer

기존 `/api/conti/runs`와 `/api/conti/runs/{id}`를 사용한다.

- 고객명, 장면 수, 예상 촬영시간
- 장면 번호와 이름 목록
- 장면 상세: 위치, 설명, 필요 컷, 인원, 대상자, 메모
- 장면별 `이 장면 수정 요청`
- 전체 `Olivia에게 콘티 수정 요청`

수정 요청에는 run/document UUID, 장면 ID, 실제 `clientId`, `workflowRunId`를 포함한다. 현재 존재하는 모바일 현장 콘티의 완료 체크·wake lock·1/4/8 보기 기능은 삭제하지 않고 `현장 모드` 보조 진입으로 유지한다. 제작용 drag/drop과 복잡한 편집 폼은 노출하지 않는다.

## 11. 개인별 사진 셀렉 관리자

### 11.1 목록

`/api/person-select`를 재사용한다.

- 전체 / 진행 중 / 마감 임박 / 완료 필터
- 제목, 전체 인원, 제출 수, 마감, 상태 배지
- 진행률 bar
- 새 행사 버튼은 기존 행사 생성 API와 최소 폼 재사용

### 11.2 상세

`/api/person-select/{eventId}`를 재사용한다.

- 전체/제출/미제출 집계
- 제출률과 마감
- 선택 링크 복사
- 참가자 필터와 개인별 선택 결과
- 전체 선택 결과와 미제출자 목록
- 마감 시간, 행사 상태 변경
- 기존 API가 제공하는 범위에서 PIN 재발급, 개인 결과 수정, 재선택 지원
- 행사 종료는 확인 후 기존 PATCH 경로 사용

알림 발송은 실제 발송 API가 확인될 때만 활성화한다. 가짜 성공 상태를 만들지 않는다. 관리자 상세의 대표 사진, 선택 사진, 메모, 추가 주문은 기존 서명 URL과 가격 계산 결과를 사용한다.

## 12. Bridge 모바일 상태

`MobileBridgeStatusView`는 `OliviaBridgeWorkspace`를 마운트하지 않는다.

- Mac Studio와 NAS 연결 상태
- 실제 선택 폴더 또는 최근 활성 작업
- JPG/RAW/선택/제외 수
- 현재 단계별 상태
- 결과 보기
- Olivia에게 작업 요청

데이터는 기존 worker status, remote job, Bridge 선택/실행 context에서 읽는다. 활성 폴더가 없으면 `현재 작업 없음`을 표시하고 최근 고객명을 대신 사용하지 않는다. 절대 경로는 화면과 API 응답에 노출하지 않고 display path 또는 selection ID만 사용한다.

작업 요청에는 source, selection identifier, file counts, 선택 수, 완료 단계, 검증된 진료과, worker 상태를 포함한다. 채팅 요청 이후에는 remote job/API 상태가 바뀔 때만 완료 상태를 갱신한다.

## 13. 일정

기존 `MobileCalendar`와 Calendar API를 정리한다.

- 주간 strip + 선택 날짜 일정
- 일정 및 할 일 목록
- 추가, 수정, 삭제, 완료
- 월간 등 확장 보기는 별도 전환으로 제공하되 한 화면에 전부 노출하지 않음
- 입력 중 하단 nav와 키보드가 버튼을 가리지 않음

## 14. Olivia 전체화면 채팅

기존 `MobileOliviaChat`과 `OliviaConversation`을 재사용한다.

- 우측 패널 대신 전체화면
- 상단에 호출 화면과 검증된 현재 대상 표시
- visual viewport 기반 키보드 대응 유지
- 문서 도구 실행과 결과 미리보기 유지
- 닫기 시 `returnTo` 화면으로 복귀
- 대상 없음은 `현재 화면 · 홈`로 표시

전역 마지막 고객은 fallback으로 쓰지 않는다. 비활성 화면의 늦은 응답은 현재 채팅 target을 바꾸지 못한다.

## 15. 작업 정보 Bottom Sheet

모바일에서 데스크톱 우측 정보 패널을 렌더링하지 않는다. 헤더의 정보/더보기 버튼으로 `MobileWorkInfoSheet`를 연다.

- 검증된 고객, 촬영 건, 문서, 행사, Bridge 대상만 표시
- 고객/촬영 건 보기 링크
- 닫기 버튼, Escape, backdrop click, swipe down
- focus trap과 닫은 후 trigger로 focus 복귀
- body scroll lock
- 배경 blur 없음

대상이 없으면 과거 정보를 표시하지 않고 `연결된 작업 정보가 없습니다`를 표시한다.

## 16. 사진·영상 작업실과 프롬프터

### 16.1 사진작업실

현재 모바일에서 전체 `PhotoWorkspace`를 마운트하는 경로를 제거하고 상태 Viewer로 교체한다.

- 현재 작업, 실행 기기, 상태, 처리 파일 수, 최근 결과
- 결과 미리보기
- Olivia 요청
- pending photo project의 실제 승인/보류 흐름은 유지

### 16.2 영상작업실

- 현재 프로젝트
- 분석/변환/제작 단계
- worker 상태와 최근 결과
- 결과 확인

### 16.3 프롬프터

프롬프터는 `full` 모드로 유지한다.

- 전체화면
- 재생/일시정지 상시 노출
- 텍스트 크기, 속도, 반전, 처음으로, 종료
- iOS safe area와 화면 회전 대응
- 입력/IME 중 단축키 오작동 방지

## 17. 모바일 전체 기능

홈 빠른 작업의 `전체 기능`에서 중앙 capability 정책을 그룹별 카드 grid로 렌더링한다.

- 관리: 고객관리, 일정, 업무일지
- 사진: 사진선택, Bridge 상태, 사진작업실 상태
- 문서: 견적서, 계약서, 콘티
- 영상: 영상작업실, 프롬프터
- 기타: registry에 등록되고 모바일 정책이 hidden이 아닌 앱

viewer/request 앱은 목록 또는 상태 화면으로 이동하며 데스크톱 편집기를 열지 않는다.

## 18. 로딩·오류·비동기 보호

- 모든 ID 기반 조회는 AbortController 또는 request token을 사용한다.
- A 대상을 불러오는 중 B로 이동하면 A 응답을 무시한다.
- Viewer 로딩 중 이전 대상의 제목·고객·진행 상태를 표시하지 않는다.
- API 실패 시 retry와 구체적 오류를 제공한다.
- 작업 요청은 enqueue 성공과 실제 완료를 구분한다.
- 새로고침 복원 시 ID가 없는 과거 고객 문맥은 폐기한다.
- 문서 UUID가 있는데 소유 확인이 실패하면 과거 고객을 채우지 않고 오류 상태로 둔다.

## 19. 접근성과 모바일 동작

- 모든 icon-only 버튼에 접근 가능한 이름 제공
- 상태 text 병기
- 44px touch target
- 입력 16px 이상
- focus-visible 유지
- Bottom Sheet focus trap
- Escape 지원 환경에서 닫기
- 화면 전환 후 의미 있는 제목 또는 첫 콘텐츠로 focus 이동
- safe-area top/bottom/left/right 반영
- 마지막 콘텐츠가 하단 nav 뒤에 숨지 않도록 공통 padding 사용

## 20. 구현 단계

### 단계 1: 기반

- capability 정책
- 내비게이션 타입과 target
- 공통 헤더, 하단 nav, Bottom Sheet
- 명시적 Olivia target/returnTo

### 단계 2: 핵심 관리

- 홈 대시보드
- 고객 목록·상세·수정·연결 문서
- 일정 정리
- 개인별 사진 셀렉 목록·상세
- 전체 기능

### 단계 3: 문서 Viewer

- 견적·계약 메타데이터와 정확한 Olivia 요청
- 콘티 Viewer와 장면 요청
- 기존 현장 모드 보존

### 단계 4: 상태 Viewer

- Bridge
- 사진작업실
- 영상작업실
- 프롬프터 모바일 실행

### 단계 5: 검증과 회귀

- API·state 전환 테스트
- 모바일 Playwright
- 데스크톱 회귀 캡처

각 단계는 같은 모바일 Shell 위에서 연결되며 임시 가짜 데이터나 비활성 더미 버튼을 만들지 않는다.

## 21. 테스트 전략

### 21.1 단위·동작 테스트

- capability와 desktop registry ID 정합성
- 모바일 URL parse/build와 뒤로가기
- 문서/행사/Bridge target 생성
- context scope none에서 이전 고객 제거
- 늦은 응답 무시
- 문서 UUID 없는 수정 요청 차단
- 사진 셀렉 필터·집계·PATCH payload
- Bridge 작업 요청 payload와 remote job 상태 전환
- Bottom Sheet focus 복귀

소스 문자열 존재 검사만으로 완료하지 않고 렌더링된 상태와 이벤트·fetch payload를 검증한다.

### 21.2 모바일 E2E

viewport:

- 360×800
- 390×844
- 393×852
- 412×915
- 430×932

흐름:

1. 홈 → 고객 → 뒤로
2. 고객 → 견적 → Olivia 수정 요청 → 원래 화면
3. 고객 → 콘티 → 장면 수정 요청
4. 사진선택 → 행사 → 미제출 명단
5. 사진선택 → 마감 변경
6. Bridge → 상태 → 작업 요청
7. 일정 추가·수정
8. 새로고침 후 문맥 오염 없음
9. 과거 고객 작업 후 일반 견적 목록에 고객 fallback 없음
10. 키보드와 하단 nav가 입력·버튼을 가리지 않음

### 21.3 데스크톱 회귀

- 1440×900
- 1920×1080

Dock, 창 관리자, 우측 정보 패널, QuoteBuilder, ContractBuilder, Conti, Bridge, 사진·영상 작업실을 확인한다. 모바일 코드 경로가 desktop surface에서 마운트되지 않는지 확인한다.

## 22. 완료 기준

- 모바일 하단 메뉴가 `홈 / 고객 / 일정 / 사진선택 / Olivia`로 동작한다.
- 고객과 사진선택 관리 동작이 실제 API에 연결된다.
- 견적·계약·콘티는 Viewer와 정확한 대상의 Olivia 요청을 제공한다.
- Bridge·사진·영상 화면은 실제 상태를 표시하고 데스크톱 편집기를 축소 렌더링하지 않는다.
- 현재 대상이 없는 화면에 이전 고객명이 나타나지 않는다.
- 지정 모바일 viewport에서 마지막 항목과 주요 버튼에 접근할 수 있다.
- 지정 데스크톱 viewport에서 기존 OS 기능과 레이아웃이 유지된다.
- 실제 화면 캡처, 실행 테스트, 확인하지 못한 환경 제약을 완료 보고에 포함한다.

## 23. 비범위

- 새로운 고객·문서·사진 셀렉 DB 구축
- 모바일에서 수백 장 Bridge 썸네일 편집
- 모바일 QuoteBuilder/ContractBuilder 전체 편집
- 모바일 콘티 drag/drop 제작
- 기존 데스크톱 Dock 또는 창 시스템 재설계
- 실제 전송 API가 없는 미제출 알림 기능
- 과거 고객을 추측해 현재 target으로 채우는 동작
