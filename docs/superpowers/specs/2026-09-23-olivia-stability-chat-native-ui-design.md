# Olivia 안정화: 채팅 문맥, 네이티브 UI, 모바일 사진 대기, 폴링

작성일: 2026-09-23  
대상 저장소: `jakeimagelab/Olivia-agent`

## 1. 목표

이번 작업은 네 가지 운영 문제를 하나의 안정화 작업으로 해결한다.

1. 한 대화 안에서 직전 발화와 실행 결과가 다음 답변에 일관되게 이어지게 한다.
2. 사용자가 실제로 접근할 수 있는 기능이 `legacy-route` iframe의 예전 UI로 열리지 않게 한다.
3. 모바일 홈의 `파일 분류 대기`에서 대기 폴더와 상태를 먼저 확인한 뒤 해당 작업으로 들어가게 한다.
4. 중복 폴링과 중복 provider를 줄여 Vercel Fluid Active CPU와 브라우저 부하를 낮춘다.

기존 사진 파이프라인, RAW 안전장치, Hermes MCP 전체 catalog, 문서 저장 로직은 변경하지 않는다.

## 2. 확인된 원인

### 2.1 채팅 문맥

현재 `engineRouting.ts`는 일반 대화를 Hermes로 보내고 `TOOL_ACTION`, `FAST_COMMAND`, UI 실행 요청을 legacy로 보낸다. 따라서 하나의 사용자 작업이 메시지마다 서로 다른 엔진으로 갈라진다. DB 대화 기록은 공유하지만 각 엔진의 세션 상태와 실행 방식이 달라 짧은 후속 발화가 직전 의도와 분리될 수 있다.

### 2.2 예전 UI

`getOliviaAppByRoute()`는 registry의 `route`와 pathname이 정확히 같을 때만 네이티브 어댑터를 반환한다. 등록되지 않은 경로나 기존 별칭 경로는 모두 `LegacyRouteWindowContent` iframe으로 떨어진다.

### 2.3 모바일 파일 분류 대기

`MobileHome`은 대기 프로젝트 수를 계산하지만 카드 클릭 시 프로젝트 정보를 전달하지 않고 일반 `photo-workspace` 화면만 연다. 어떤 폴더가 왜 대기인지 볼 수 없다.

### 2.4 폴링 부하

전역 bridge, 사진 작업실 provider, 알림 provider가 같은 remote job과 프로젝트 상태를 각각 조회한다. 전역 bridge는 활성 작업이 없어도 전체 job 목록을 계속 조회한다. 여러 창이나 legacy shell이 겹치면 같은 종류의 polling loop가 중복된다.

## 3. 설계

### 3.1 폴링과 상태 소유권

`PhotoProjectNotificationProvider`를 사진 프로젝트 목록의 단일 소유자로 사용한다.

- 활성 작업이 있으면 약 3초 간격으로 갱신한다.
- 사용자의 확인이 필요한 대기 상태만 있으면 약 15초 간격으로 갱신한다.
- 문서가 숨겨져 있으면 약 60초로 낮춘다.
- 활성·대기 작업이 모두 없으면 반복 polling을 멈추고 `focus`, `online`, 수동 `refresh`에서만 갱신한다.
- interval과 focus/visibility가 동시에 실행돼도 요청은 하나만 유지한다.

Remote job은 하나의 공유 watcher/store가 추적한다.

- 전역 `PhotoStudioBackgroundJobBridge`가 활성 job을 추적하고 background job store에 반영한다.
- `PhotoStudioExecutionProvider`는 같은 job ID를 별도로 1초마다 조회하지 않고 공유 상태를 구독한다.
- worker presence는 사진작업실이 실제로 열렸을 때만 조회하며, 숨김 상태에서는 주기를 낮춘다.
- `LegacyAppChrome`과 `OliviaAdaptiveRoot`가 같은 트리에서 전역 bridge를 중복 마운트하지 않게 한다.

### 3.2 채팅 문맥 연속성

한 conversation의 기본 엔진은 Hermes로 고정한다.

- `classifyOliviaRequest()`는 모델 선택, 로그, 스트림 보류, 실행 안전 가드에만 사용한다.
- 정규식 결과만으로 Hermes와 legacy를 메시지마다 전환하지 않는다.
- Hermes 연결 실패, 타임아웃, MCP stale, 검증된 tool miss에서만 legacy를 한 번 사용한다.
- 사진 직접 실행은 `OLIVIA_PHOTO_DIRECT_EXECUTION` 단독 플래그로 유지하고 반드시 사용자 원문만 판정한다.
- Hermes에는 같은 `conversationId`, canonical recent history, pending action, 마지막 실행 결과를 전달한다.
- 짧은 후속 발화는 직전 사용자 발화뿐 아니라 직전 assistant 응답과 검증된 tool result를 포함한 canonical history로 해석한다.
- 실행하지 않았는데 약속형 문구만 생성된 응답은 기존 completion guard와 tool-miss fallback을 거친다.

대화 저장 실패가 있더라도 이미 존재하는 화면 메시지를 다른 conversation에 합치지 않는다. conversation ID가 달라지면 해당 conversation의 persisted messages로 명시적으로 교체한다.

### 3.3 네이티브 route 정규화

사용자 노출 경로를 다음 진입점 기준으로 수집한다.

- Desktop Dock 및 바탕화면
- 모든 앱 목록과 즐겨찾기
- 문서함
- 전역 검색
- 채팅의 `OPEN_FEATURE` 및 문서 열기 액션

각 href는 창을 열기 전에 canonical route로 변환한다.

- 기존 workspace 별칭은 `getCanonicalWorkspaceHref()`를 재사용한다.
- query string은 보존한다.
- canonical pathname을 네이티브 registry route에 연결한다.
- 이미 있는 네이티브 어댑터를 우선 재사용한다.
- 별도 어댑터가 필요한 사용 경로만 얇은 어댑터를 추가한다. 기존 페이지 API와 store를 재작성하지 않는다.
- 관리자 전용·미사용 route는 이번 범위에서 제외한다.

개발·테스트 환경에서는 사용자 노출 목록의 경로가 `legacy-route`로 해석되면 테스트가 실패한다. 예기치 않은 외부/관리자 경로에 대한 compatibility fallback 자체는 유지한다.

### 3.4 모바일 파일 분류 대기

모바일 navigation에 `photo-pending` 화면을 추가한다.

- 홈 카드와 알림 bell은 대기 프로젝트가 있으면 `photo-pending`으로 이동한다.
- 별도 API 없이 `PhotoProjectNotificationProvider.projects`를 사용한다.
- 목록에는 프로젝트/폴더명, 상태, JPG 수, 최근 갱신 시각, 사용자에게 필요한 다음 행동을 표시한다.
- 상태는 기존 photo pipeline의 사용자 행동 필요 상태만 포함한다: `READY`, `MERGE_COMPLETED`, `REVIEW_REQUIRED`, `MERGE_FAILED`, `COPY_FAILED`, `CLASSIFY_FAILED`.
- 실패 상태는 오류 메시지를 함께 표시하고, 진행 중 상태와 구분한다.
- 항목을 누르면 선택 프로젝트 ID를 포함해 사진작업실의 classification 화면으로 이동한다.
- 사진작업실은 전달된 프로젝트를 초기 선택하거나 해당 승인/재시도 카드가 보이는 위치로 이동한다.
- 프로젝트가 0건이 되면 빈 목록을 보여주지 않고 홈으로 돌아갈 수 있는 명확한 상태를 표시한다.

## 4. 오류 처리

- polling 실패는 기존 데이터와 마지막 성공 시각을 유지하며 지수형 backoff를 적용한다. 실패할 때마다 즉시 재시도하지 않는다.
- 여러 refresh trigger는 in-flight 요청을 공유하거나 취소 후 하나만 실행한다.
- 채팅 엔진 fallback은 한 턴당 한 번만 허용해 이중 실행을 막는다.
- 네이티브 route를 찾지 못한 경우 iframe을 조용히 열지 않고 개발 로그에 원래 href와 canonical href를 남긴다.
- 모바일 목록의 특정 프로젝트 데이터가 불완전해도 나머지 항목은 표시한다.

## 5. 테스트

### 5.1 채팅

- 일반 발화 → 도구 요청 → 짧은 후속 답변이 같은 Hermes conversation에서 이어진다.
- `팝업 닫아줘`, `종일로 잡아 줘`, `그걸로 해줘`가 직전 문맥을 유지한다.
- Hermes 장애 시 legacy fallback은 최대 1회이며 도구가 중복 실행되지 않는다.
- 사진 직접 실행은 일반 direct execution 플래그와 독립적이다.
- 기존 completion claim guard 테스트가 통과한다.

### 5.2 네이티브 UI

- Dock, 모든 앱, 즐겨찾기, 검색, 문서함, 채팅이 생성하는 href fixture를 순회한다.
- 사용자 노출 경로는 `legacy-route`가 아닌 예상 앱으로 해석된다.
- query string과 resource context가 보존된다.
- 관리자/미사용 경로의 compatibility fallback은 유지된다.

### 5.3 모바일 사진 대기

- 대기 0건이면 홈 카드가 없다.
- 대기 1건 이상이면 목록에 폴더명과 상태가 표시된다.
- 홈 카드와 bell이 목록을 연다.
- 항목 선택 시 동일 프로젝트가 사진작업실에 전달된다.
- 실패 프로젝트와 승인 대기 프로젝트의 안내가 구분된다.

### 5.4 폴링

- 활성 작업이 없을 때 반복 `/api/remote-jobs` 호출이 없다.
- 동일 remote job에 watcher가 하나만 존재한다.
- visibility 변화, focus, online 이벤트가 요청 폭주를 만들지 않는다.
- 활성/대기/idle 상태별 polling 주기가 적용된다.
- provider unmount 시 timer와 AbortController가 정리된다.

### 5.5 전체 회귀

- `npx tsc --noEmit`
- 관련 단위 테스트
- `npm test`
- `npm run build`
- 모바일 홈 → 대기 목록 → 프로젝트 작업 화면 브라우저 검증
- Desktop Dock/모든 앱/문서함/검색/채팅에서 대표 경로 브라우저 검증

## 6. 범위 제외

- 사진 파이프라인 상태 머신과 파일 안전장치 변경
- Scene Engine 변경
- Hermes MCP catalog 축소
- 관리자 전용 140개 route의 전면 네이티브 전환
- Desktop OS의 시각 디자인 전면 개편
- 새로운 사진 프로젝트 API 또는 별도 알림 체계 추가

## 7. 구현 순서

1. polling ownership 통합 및 호출량 테스트
2. Hermes-first conversation routing과 history/fallback 회귀 테스트
3. 모바일 `photo-pending` 목록 및 선택 프로젝트 전달
4. 사용자 노출 href inventory와 canonical native route 매핑
5. typecheck, 관련 테스트, 전체 테스트, build, 브라우저 회귀 검증

