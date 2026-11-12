# 사진선택 모듈화·로딩 성능 리팩터링 설계

작성일: 2026-11-12  
대상: 관리자 사진선택, 개인별 classic, 프로젝트 공동 classic/고객 Bridge, 저장 동기화, 보정본 전달, RAW 연동

## 1. 목적

사진선택 기능은 짧은 기간에 개인별 셀렉, 공동 검토자, 고객 Bridge, 실시간 저장, RAW 매칭, 보정본 전달까지 확장되었다. 기능은 동작하지만 큰 화면 컴포넌트와 API 한 곳에 상태·쿼리·표현 로직이 섞여 있어 작은 수정도 영향 범위를 예측하기 어렵고, 1,645장 이상 프로젝트에서는 첫 진입과 폴더 전환이 느리다.

이번 작업은 기존 동작과 UI를 바꾸지 않고 다음을 달성한다.

- 서버 저장값을 셀렉의 단일 기준으로 유지한다.
- 관리자·고객·RAW 매칭이 동일한 선택 계산 규칙을 사용한다.
- 큰 파일을 역할별 모듈로 분리해 수정 범위와 회귀 위험을 줄인다.
- 전체 사진 메타데이터와 서명 URL을 첫 화면에 한 번에 읽지 않는다.
- 기능별 작은 커밋과 테스트 게이트를 두어 단계별 되돌리기가 가능하게 한다.

## 2. 보존 조건

다음은 이번 리팩터링에서 변경하지 않는다.

- 기존 프로젝트·참가자·사진·선택·제출·주문·보정본·RAW 기록
- 개인별 PIN 로그인과 프로젝트 공유 링크 인증 방식
- classic 고객 화면과 고객 Bridge의 화면 구조·단축키·리뷰·전체화면
- 관리자 Olivia Bridge 내부 구현. 사진선택과 연결되는 adapter 경계만 정리한다.
- 공개 API의 기존 응답 필드와 구버전 클라이언트 호환성
- 운영 DB 스키마와 데이터. 필요한 성능 인덱스는 별도 migration으로만 제안한다.
- 사진 파일·썸네일·원본 RAW의 저장 위치와 파일 속성

새 디자인이나 기능을 추가하지 않는다. UI 분리는 기존 DOM 구조와 CSS class를 유지하는 것을 기본으로 한다.

## 3. 현재 기준선

### 3.1 큰 파일

- `components/select-gallery/CustomerBridgeSelect.tsx`: 약 1,472행
- `app/(client-hub)/person-select/[id]/page.tsx`: 약 1,128행
- `app/api/person-select/[eventId]/route.ts`: 약 431행
- `components/olivia-bridge/OliviaBridgeWorkspace.tsx`: 약 2,951행이나 이번 범위에서는 내부 재작성하지 않는다.

### 3.2 테스트 기준선

- 사진선택 전용: 24개 파일, 116개 테스트 통과
- 전체: 366개 파일 중 360개 통과, 2,508개 테스트 중 2,502개 통과
- 전체 실패 6개는 리팩터링 시작 전부터 존재하며 사진선택과 무관하다.
  - 데스크톱 셸 기대문자 2개
  - 모바일 앱 등록 기대값 2개
  - 견적 촬영일 연도 기대값 2개

각 기능 커밋은 사진선택 전용 테스트를 모두 통과해야 하며, 전체 기준선에서 새 실패를 만들면 안 된다.

## 4. 성능 완료 기준

실제 1,645장 프로젝트를 기준으로 다음을 목표로 한다.

- 작업 화면 골격과 폴더 목록: 2초 이내
- 첫 화면 썸네일: 3초 이내
- 이미 읽은 폴더 전환: 300ms 이내
- 캐시된 이전·다음 미리보기: 200ms 이내
- 끝까지 스크롤할 때 빈 화면이나 추가 로딩 정지 없음
- 첫 진입에서 1,645장의 서명 URL이나 원본 이미지를 한 번에 요청하지 않음
- 화면에 마운트된 사진 카드 수는 viewport와 overscan 범위로 제한

측정은 브라우저 `performance.mark`와 개발용 진단 카운터로 한다. 운영 사용자에게 디버그 UI를 노출하지 않는다.

## 5. 선택한 접근

전면 재작성 대신 단계적 모듈화를 사용한다.

1. 현재 동작을 순수 함수와 contract 테스트로 고정한다.
2. 데이터 조회와 응답 조립을 route에서 service/repository로 옮긴다.
3. 관리자 페이지와 고객 Bridge의 상태를 역할별 hook으로 분리한다.
4. UI는 기존 구조를 유지한 채 panel 컴포넌트로 나눈다.
5. 마지막으로 메타데이터 페이지 조회, URL 분리, 가상화를 순차 적용한다.

각 단계는 독립 커밋이고 되돌려도 앞 단계가 동작하도록 한다. 성능 변경과 UI 구조 분리는 같은 커밋에 섞지 않는다.

## 6. 목표 모듈 구조

기존 import 경로를 한꺼번에 옮기지 않고 현재 폴더 아래에 책임별 하위 모듈을 추가한다.

```text
lib/person-select/
  domain/
    selectionSnapshot.ts
    selectionActor.ts
    projectCapabilities.ts
    statusLabels.ts
  server/
    eventRepository.ts
    imageRepository.ts
    selectionRepository.ts
    deliveryRepository.ts
    adminProjectService.ts
    publicProjectService.ts
    mediaUrlService.ts
  contracts/
    adminProject.ts
    publicProject.ts
    media.ts

components/person-select/admin/
  PersonSelectAdminShell.tsx
  AdminProjectHeader.tsx
  PhotoReviewTab.tsx
  CustomerProgressTab.tsx
  UploadTab.tsx
  ProjectSettingsTab.tsx
  RawMatchDialog.tsx
  hooks/
    useAdminProject.ts
    useRemoteJobPoller.ts
    useRawMatchController.ts
    useDeliveryImport.ts

components/select-gallery/customer-bridge/
  CustomerBridgeShell.tsx
  BridgeFolderPanel.tsx
  BridgePhotoGrid.tsx
  BridgePreviewPanel.tsx
  BridgeReviewOverlay.tsx
  BridgeFullscreen.tsx
  BridgeBottomBar.tsx
  hooks/
    useBridgeNavigation.ts
    useBridgeSelection.ts
    useBridgeReview.ts
    useBridgeMedia.ts
    useBridgeKeyboard.ts
```

기존 진입 파일은 조립만 담당하는 얇은 shell로 남긴다. 모든 파일을 강제로 1회에 이동하지 않고 관련 기능을 수정하는 단계에서 옮긴다.

### 6.1 파일 크기 가이드

- page/route shell: 250행 안팎
- UI 컴포넌트: 250행 이하 권장
- hook/service/repository: 300행 이하 권장
- 순수 함수: 한 책임, 명시적 입출력

예외가 필요하면 파일 상단 주석에 결합 이유를 적는다. 줄 수를 줄이기 위해 여러 책임을 한 줄에 압축하지 않는다.

## 7. 공통 도메인 모델

### 7.1 SelectionSnapshot

관리자, 고객, RAW 연동이 같은 형식으로 읽는 서버 확정 스냅샷을 둔다.

```ts
type SelectionActor =
  | { kind: "person"; id: string; name: string }
  | { kind: "reviewer"; id: string; name: string };

type SelectionMark = {
  imageId: string;
  selected: boolean;
  rating: number;
  colorLabel: number;
  memo: string;
  updatedAt: string | null;
};

type SelectionSnapshot = {
  eventId: string;
  actor: SelectionActor;
  revision: number | null;
  marks: SelectionMark[];
  savedAt: string | null;
};
```

기존 응답을 바로 바꾸지 않는다. adapter가 현재 DB/JSON 응답과 `SelectionSnapshot` 사이를 변환한다.

### 7.2 공통 계산 규칙

다음은 한 모듈에서만 정의한다.

- 사진이 고객 셀렉인지 판단
- 셀렉 장수 집계
- 별점·컬러·메모 diff 병합
- 공동 검토자 합집합·교집합
- 제출본과 현재 저장 상태 구분
- RAW 대상 이름 계산

UI 컴포넌트가 별도 조건식을 만들지 못하도록 순수 함수와 테스트를 먼저 둔다.

## 8. 서버 경계

### 8.1 route 역할

API route는 다음만 담당한다.

1. 인증·토큰·권한 검증
2. 요청 payload 파싱
3. service 호출
4. 기존 응답 contract로 직렬화
5. 알려진 오류를 HTTP 상태와 사용자 메시지로 변환

Supabase 쿼리, 사람별 grouping, 서명 URL 발급, 진행 현황 조립은 route에서 제거한다.

### 8.2 repository 역할

- `eventRepository`: 프로젝트 기본 설정과 권한
- `imageRepository`: 이미지 메타데이터, 폴더 manifest, cursor page
- `selectionRepository`: 사람/검토자별 서버 저장 상태와 제출
- `deliveryRepository`: 보정본·버전·승인 상태

repository는 UI 문구를 만들지 않고 DB row를 명시적 타입으로 반환한다.

### 8.3 service 역할

- 여러 repository 결과를 병렬 조회한다.
- 사람/검토자별 map을 한 번만 만든다.
- 현재 공개/관리자 응답과 동일한 형태를 조립한다.
- signed URL의 용도와 개수를 제한한다.

기존 응답을 fixture로 저장한 contract 테스트를 두어 필드 누락과 의미 변경을 막는다.

## 9. 고객 Bridge 상태 분리

현재 한 컴포넌트 안의 상태를 다음 controller로 분리한다.

- 탐색: 루트/전체/개별 폴더, breadcrumb, 검색, 필터
- 작업 대상: focused image와 active image 집합
- 고객 데이터: 서버 확정 rating/color/memo와 미저장 diff
- 미디어: thumbnail/preview URL, 만료, 캐시, 요청 중복 제거
- 리뷰: single/grid/deck, 제외/복원 stack
- 전체화면: 현재 index, swipe, zoom
- 대화·AI·다운로드: 각각 독립 panel controller

클릭은 작업 대상만 바꾸고 별점·컬러는 숫자 동작에서만 바뀌는 기존 규칙을 그대로 유지한다.

큰 grid, 폴더 panel, 미리보기 panel은 `memo` 경계를 두어 미리보기 변경이 폴더 전체와 모든 카드의 재렌더를 만들지 않게 한다.

## 10. 관리자 페이지 상태 분리

관리자 page는 다음만 유지한다.

- URL/event ID
- 활성 탭
- 프로젝트 전체 조회 hook
- 탭 컴포넌트 조립

프로젝트 설정, 업로드, 보정본 import, RAW 매칭, 검토자 관리, 진행 현황을 독립 hook과 탭으로 분리한다. 공통 fetch wrapper는 JSON이 비어 있거나 HTML 오류 페이지가 와도 `Unexpected end of JSON input` 대신 상태·본문 일부·재시도 가능 여부를 구조화해 반환한다.

탭 전환 시 필요하지 않은 데이터는 지연 조회하되, 이미 읽은 데이터는 invalidate 전까지 재사용한다.

## 11. 사진 로딩 구조

### 11.1 초기 bootstrap

첫 응답에는 다음만 포함한다.

- 프로젝트/검토자/권한
- 폴더 manifest와 각 폴더 사진 수
- 서버 확정 선택 mark 전체 또는 압축된 map
- 현재 폴더의 첫 메타데이터 page

모든 사진의 `thumbnail_url`, `image_url`은 포함하지 않는다. 전체 사진 메타데이터도 첫 진입을 막지 않는다.

### 11.2 메타데이터 page

이미지는 `(sort_order, id)` cursor로 페이지 조회한다.

- 기본 page: 72장
- 폴더·검색·정렬 조건을 서버에 전달
- 응답: items, nextCursor, totalCount
- 전달 폴더와 숨김/제외 규칙을 서버와 고객이 공유

전체 사진 보기에서도 DOM에는 현재 viewport 주변만 남긴다.

### 11.3 media URL 분리

썸네일과 미리보기 URL을 분리한다.

- thumbnail batch: 현재 viewport+overscan에 필요한 ID만, 요청당 최대 72개
- preview: focused/review/fullscreen 사진 1장과 인접 1~2장만
- 같은 key 요청은 진행 중 promise를 재사용
- URL 만료시 필요한 항목만 갱신
- 모바일은 더 작은 bounded cache를 사용

현재처럼 240장의 thumbnail과 preview를 동시에 서명하는 경로는 호환 기간 후 제거한다.

### 11.4 가상화

grid scroll container의 실제 크기와 thumbnail cell 크기로 보이는 row 범위를 계산한다.

- 위·아래 spacer로 전체 스크롤 높이를 보존
- viewport 앞뒤 2~3 row overscan
- 폴더 변경 시 scroll과 focus 정책은 기존 동작 유지
- Shift 범위 선택은 렌더 여부와 무관하게 전체 정렬 ID 배열을 사용
- IntersectionObserver는 다음 metadata page를 가져오는 sentinel에만 사용

## 12. 비동기 오류와 경쟁 상태

- 폴더 변경과 검색 변경은 이전 metadata/media 요청을 `AbortController`로 취소한다.
- preview 요청에 sequence를 두어 늦은 이전 응답이 최신 사진을 덮지 못하게 한다.
- 실패한 thumbnail 묶음만 재시도하고 선택 상태는 유지한다.
- 이미지 로딩 중에는 이전 preview 또는 고정 크기 skeleton을 유지해 레이아웃이 흔들리지 않게 한다.
- 인증·권한 오류는 자동 무한 재시도하지 않는다.
- 429/5xx/네트워크 오류만 bounded backoff를 적용한다.

## 13. 테스트 전략

### 13.1 순수 단위 테스트

- SelectionSnapshot 변환
- 셀렉 장수와 공동 합집합/교집합
- diff 병합과 서버 확정값 위 임시값 overlay
- 폴더 manifest, cursor, 전달 폴더 제외
- media cache key, 만료, 중복 요청 제거
- 가상 grid visible range

### 13.2 service/contract 테스트

- 기존 관리자 API 응답 필드 유지
- 기존 공개 API 응답 필드 유지
- 사람·검토자·공동 호환 reviewer grouping
- 2,500장에서도 누락 없는 page/cursor
- 첫 bootstrap에 전체 signed URL이 포함되지 않음
- thumbnail 요청과 preview 요청 분리

### 13.3 컴포넌트 테스트

- 마우스 포커스와 고객 셀렉 분리
- 저장 중/저장 실패/저장 완료 상태
- 리뷰 제외·복원
- 폴더 이동 후 별점 유지
- admin tab과 raw/delivery 결과 유지

### 13.4 성능 회귀 테스트

1,645장 fixture에서 다음 상한을 검증한다.

- 첫 thumbnail URL 요청 72개 이하
- 첫 preview URL 요청 3개 이하
- 마운트된 카드 수 150개 이하
- 폴더 전환 중 이전 요청 취소
- 끝까지 scroll 시 모든 metadata page 도달

### 13.5 실제 브라우저 검증

- 데스크톱 1440/1920
- 모바일 360/390/430
- 공동 classic/Bridge, 개인 PIN/classic
- 1,645장 프로젝트 루트·폴더·전체보기·리뷰·전체화면
- 관리자 진행 현황·RAW 연동·보정본 전달

## 14. 커밋 및 롤백 단위

1. 시작 전 전체 상태 checkpoint — 완료: `f61430d6`
2. 설계·기준선 문서
3. 공통 selection domain과 단위 테스트
4. 관리자 API repository/service 추출과 contract 테스트
5. 관리자 page 데이터 hook 및 탭별 UI 추출
6. 고객 Bridge navigation/selection/review hook 추출
7. 사진 metadata bootstrap/page API
8. thumbnail/preview URL 분리와 bounded cache
9. grid 가상화와 렌더 경계
10. 실제 브라우저·성능 회귀 및 문서

각 커밋 전후에 관련 Vitest와 `npx tsc --noEmit`을 실행한다. UI 구조를 건드린 커밋은 데스크톱과 모바일 스크린샷까지 확인한다. 문제가 생기면 해당 기능 커밋만 revert할 수 있도록 서로 다른 단계의 변경을 섞지 않는다.

## 15. 완료 조건

- 관리자 page와 고객 Bridge가 얇은 shell과 역할별 모듈로 분리됨
- 공통 셀렉 계산을 관리자·고객·RAW가 함께 사용함
- 공개/관리자 API 기존 응답과 기존 데이터가 유지됨
- 24개 사진선택 테스트와 새 테스트가 모두 통과함
- 전체 테스트 기준선보다 실패가 늘지 않음
- `npx tsc --noEmit`, 관련 lint, build 통과
- 1,645장 성능 목표를 실제 브라우저에서 측정하고 보고함
- classic/PIN/공동/Bridge/RAW/보정본 전달 회귀가 없음

