# Olivia Mobile OS 시각·문서·채팅 개선 설계

## 목표

현재 Olivia Mobile OS의 밝고 단순한 Command & Control 구조는 유지하면서 브랜드 헤더, Desktop OS 아이콘, 원본 문서 Preview, 대화 기록 Navigator와 텍스트 복사를 개선한다.

## 범위

이번 작업에는 다음 항목만 포함한다.

1. 포토클리닉 브랜드 헤더
2. Desktop과 동일한 문서 Preview
3. Desktop OS 아이콘 재사용
4. 기능 헤더 타이포그래피와 설명 문구
5. 모바일 대화 기록 Navigator
6. 기존 밝은 하단 메뉴 유지
7. 채팅 메시지 드래그·길게 누르기 복사 복구

고객관리, 병원브랜드진단, 병원채널분석은 추가하지 않는다.

## 브랜드 헤더

- 모바일의 상단 헤더 배경은 Olivia Deep Green을 사용한다.
- 브랜드 이미지는 Desktop Top Bar와 같은 `/assets/photoclinic-mark.png`를 사용한다.
- 마크 옆에는 `PHOTO CLINIC`을 표시한다. 배경과 대비가 약한 전체 로고 이미지를 억지로 축소하지 않는다.
- 포토클리닉 로고는 Home Header에만 표시한다. 기능별 Header에는 반복해서 넣지 않는다.
- Home의 기존 Olivia Sparkle 배지는 포토클리닉 마크로 교체한다.
- 기능별 Header의 뒤로가기·추가·더보기 아이콘은 흰색 계열로 표시한다.

## 기능 헤더

- 현재 19px 제목을 약 15% 줄인 16px로 조정한다.
- 제목 아래에 10~11px의 짧은 설명을 둔다.
- 기본 설명은 다음과 같다.
  - 캘린더: `일정을 빠르게 확인하고 정리하세요.`
  - 메모: `아이디어와 업무 기록을 모아보세요.`
  - 문서: `견적·계약과 파일을 한곳에서 확인하세요.`
  - 올리비아 채팅: `Olivia에게 업무를 지시하세요.`
  - 미리보기: `현재 문서의 최신 내용입니다.`

## Desktop OS 아이콘 공유

- 새 모바일 아이콘 세트를 만들지 않는다.
- `components/AppIcon.tsx`와 `components/olivia-os/CalendarAppIcon.tsx`를 재사용한다.
- 빠른 메뉴 매핑:
  - 캘린더: `CalendarAppIcon`
  - 메모: `memo`
  - 견적/계약: `quote`와 `contract` 아이콘을 겹쳐 표시
  - 문서함: `library`
  - 올리비아 채팅: `olivia`
  - 미리보기: 활성 문서가 있으면 해당 Resource 아이콘, 없으면 기존 눈 아이콘
- 하단 메뉴 매핑:
  - 홈: `today`
  - 캘린더: `CalendarAppIcon`
  - 메모: `memo`
  - 문서: `library`
  - 올리비아 채팅: `olivia`

## 하단 메뉴

- 메뉴 개수와 순서는 `홈 · 캘린더 · 메모 · 문서 · 올리비아 채팅` 5개를 유지한다.
- 오렌지 배경은 제거하고 기존의 반투명 White Surface로 복원한다.
- 아이콘은 새로 적용한 Desktop OS 아이콘을 그대로 유지한다.
- 기본 라벨은 기존 Muted Gray, 활성 메뉴는 기존 Olivia Mint Surface와 Deep Green 라벨로 표시한다.
- 기존의 연한 상단 Border와 약한 그림자를 복원한다.
- Safe Area와 44px 이상의 터치 영역을 유지한다.

## 동일 문서 Preview

현재 모바일의 `MobileQuoteDocument`와 `MobileContractDocument`는 Desktop 문서를 단순화해 다시 만든 화면이라 모양이 다르다. 이를 제거하고 동일한 원본 렌더러를 공유한다.

### 견적서

- `QuoteBuilder.tsx` 안의 실제 `.quote-page` 문서 노드를 데이터 입력만 받는 공용 Renderer로 추출한다.
- Desktop Quote Builder는 기존 편집기와 제어 UI를 유지하면서 공용 Renderer를 사용한다.
- Mobile Preview도 같은 Renderer를 사용한다.
- 문서의 기준 크기와 비율은 Desktop을 유지하고, 모바일 Container 폭에 맞춰 균일하게 축소한다.
- `transform-origin: top left`와 측정된 문서 높이를 사용해 잘림이나 빈 공간을 방지한다.

### 계약서와 기타 문서

- Contract Builder의 기존 HTML 생성기를 공용 모듈로 추출해 Desktop iframe과 Mobile Preview가 같은 HTML을 사용한다.
- 다른 Resource도 기존 canonical Renderer 또는 저장된 원본 파일·HTML이 있으면 그것을 우선한다.
- 원본 Renderer가 없는 Resource에 새로운 임의 디자인을 만들지 않고 현재 canonical 내용을 읽기 전용으로 표시한다.
- Preview의 Resource ID, 실시간 갱신, 공유·다운로드·수정 요청 흐름은 변경하지 않는다.

## 모바일 대화 기록 Navigator

- 기존 `OliviaConversationGuide`와 현재 대화 Store를 재사용한다.
- 대화가 충분히 쌓이면 채팅 오른쪽에 Desktop과 같은 Topic Rail을 표시한다.
- 모바일에서는 hover와 휠 안내를 사용하지 않는다.
- 44px 터치 영역을 제공하고, 탭하면 해당 대화 요약을 하단 패널로 표시한다.
- 패널의 `이 대화로 이동`을 누르면 현재 `scrollToMessage`를 이용해 이동한다.
- 별도 Navigator Store나 모바일 대화 데이터를 만들지 않는다.

## 채팅 텍스트 선택

- 사용자와 Olivia 메시지 본문에 `user-select: text`, `-webkit-user-select: text`를 명시한다.
- Resource Card, 승인 버튼 등 조작 요소는 선택되지 않게 유지한다.
- Desktop 창 이동·크기 조절 정리는 `pointerup`, `pointercancel`뿐 아니라 `lostpointercapture`, 브라우저 `blur`, 문서 visibility 변경에서도 실행한다.
- 창 제목 영역과 Dock·자석 결합 동작은 변경하지 않는다.

## 데이터와 오류 처리

- Desktop과 Mobile은 동일한 Quote, Contract, Document, Conversation Store와 API를 사용한다.
- 모바일용 복제 Resource나 별도 Agent를 만들지 않는다.
- 원본 문서를 불러오지 못하면 기존 오류 상태와 다시 시도 동작을 제공한다.
- Navigator는 대화 수가 기준보다 적으면 Rail을 숨겨 빈 UI를 만들지 않는다.

## 테스트

- 375×812, 390×844, 393×852, 430×932에서 Header, Quick Menu, Bottom Navigation과 Preview를 확인한다.
- 1440px 이상에서 Desktop Header, Dock, Window, Quote Builder, Contract Builder가 기존과 동일한지 확인한다.
- 동일 Quote ID와 Contract ID를 Desktop과 Mobile에서 열어 문서 구조와 내용이 같은지 비교한다.
- 모바일 Navigator의 탭, 패널, 대화 이동을 확인한다.
- Desktop과 Mobile 채팅에서 메시지 Selection 문자열이 생성되는지 확인한다.
- 창 이동 도중 포커스가 사라져도 전역 `userSelect`가 복구되는지 확인한다.
- TypeScript, 대상 ESLint, 관련 단위 테스트, 전체 테스트와 프로덕션 빌드를 실행한다.

## 제외 범위

- 고객관리 모바일 화면
- 병원브랜드진단 모바일 화면
- 병원채널분석 모바일 화면
- 하단 메뉴 항목 추가
- 모바일 전용 문서 데이터나 Agent
- 메시지별 복사 버튼
- Desktop OS 시각 개편
