# Olivia OS 모바일 전면 재구성 설계

## 목표

Olivia OS의 모바일 표면을 데스크톱 창 UI의 축소판이 아니라 확인·관리·승인·요청에 맞는 별도 presentation layer로 유지한다. 비즈니스 로직과 API는 공유하지만 데스크톱 Dock, 창 관리자, 우측 inspector, QuoteBuilder/ContiV2/Bridge 전체 편집기는 모바일 DOM에 올리지 않는다.

## 확정된 구조

- `OliviaAdaptiveRoot`가 실제 viewport와 coarse pointer를 보고 모바일/태블릿/데스크톱 표면을 분리한다.
- `OliviaMobileShell`은 문서 스크롤을 허용하는 일반 흐름으로 렌더한다. `position: fixed`, 전역 `overflow: hidden`, 앱 간 swipe 복제 렌더는 사용하지 않는다.
- 모바일 공통 구조는 `MobileHeader`, `MobileContent`, `MobileBottomNavigation`, 전체화면 `MobileOliviaView`, 공통 `MobileBottomSheet`로 구성한다.
- 하단 내비게이션은 홈·고객·일정·사진선택·Olivia 다섯 개만 고정하며 safe area를 포함한다.
- 입력·채팅 화면은 `visualViewport` 높이를 반영하고 모든 입력 글자 크기를 16px 이상으로 유지한다.

## 디자인 기준

데스크톱 Olivia OS의 승인된 토큰을 모바일 루트에 그대로 사용한다.

- 배경 `#E3EBE2`, sunk `#EAF0E7`, 카드 `#F1F5EE`
- soft green `#D5E3D4`, 선 `#C8D5C8`
- 본문 `#293E34`, 보조 `#617565`, green `#155855`
- 실행·Olivia 강조만 `#E85D2C`

큰 그림자, 유리 블러, 과도한 흰 카드, 큰 아이콘을 제거한다. 카드 반경은 10~12px, 터치 영역은 최소 44px로 맞춘다. 문서 미리보기의 실제 종이만 흰색을 유지한다.

## 기능별 presentation

- 고객관리: 목록·검색·등록·정보 수정·촬영 건 선택·연결 문서 이동을 실제 `/api/clients` 데이터로 제공한다.
- 견적/계약: UUID 기반 canonical viewer와 PDF, Olivia 수정 요청만 제공한다. 모바일에서 편집 폼은 렌더하지 않는다.
- 콘티: run/scene UUID 기반 장면 viewer와 장면/전체 수정 요청을 제공한다.
- 사진선택: 실제 행사 API로 목록, 제출 현황, 참가자 결과, 마감/상태 변경, 링크 복사를 제공한다.
- Bridge: worker/job API에서 확인되는 상태만 보여주고 지원 데이터가 없는 단계는 `상태 연동 없음`으로 구분한다. 대량 썸네일 편집기는 렌더하지 않는다.
- 일정: 기존 모바일 일정 CRUD를 유지한다.
- Olivia: 전체화면 채팅으로 열고 호출 화면에서 검증된 UUID/scene/event/folder 식별자만 전달한다.

## 문맥 규칙

일반 기능 진입은 이전 고객·촬영 건을 상속하지 않는다. 고객, 촬영 건, 문서, 행사, Bridge 폴더는 사용자가 명시적으로 선택했거나 서버에서 UUID 소유관계를 검증한 경우에만 현재 대상으로 등록한다. 목록 화면으로 돌아가면 해당 링크를 지운다.

## 모바일 capability

데스크톱 registry의 모든 app id를 중앙 mobile capability registry에서 `full`, `manage`, `viewer`, `request`, `status`, `desktop-only`로 분류한다. 실제 모바일 화면이나 API 연결이 없는 기능은 generic 문서함으로 위장하지 않고 desktop-only 또는 Olivia request로 표시한다. 프롬프터처럼 데스크톱 registry의 하위 기능은 supplemental 항목으로 구분한다.

## 검증

- 단위/동작 테스트: adaptive surface, navigation round-trip, capability registry 완전성, 문맥 초기화, Bridge 단계 상태, exact resource id.
- 브라우저: 360×800, 390×844, 393×852, 412×915, 430×932 및 coarse pointer/touch.
- 모바일 흐름: 홈→고객→문서→Olivia, 사진선택 행사/참가자/마감, Bridge 상태/요청, 일정 CRUD, 키보드와 마지막 버튼 접근.
- 데스크톱: 1440×900, 1920×1080에서 기존 Dock·창·편집기 회귀 여부 확인.
