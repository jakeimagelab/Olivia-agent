# 레거시 콘티 필드뷰 카드 다듬기 + 현장뷰 공유 페이지 카드 전환

## 배경

사용자가 실제로 매일 쓰는 화면은 새 conti-v2가 아니라 레거시 `components/conti/ContiBuilder.tsx`의 "필드뷰" 탭이다(번호 뱃지, 카테고리별 파스텔 헤더, 📍장소/📷구도/👥필요인원 3분할 카드). conti-v2에는 별도의 `ContiFieldView.tsx`(다른 카드 스타일, "구도" 필드 없음, 2026-09-08 스펙에서 이미 다룸)가 있지만 이번 작업 대상이 아니다.

실제 공유 가능한 페이지 `app/conti/view/[token]/page.tsx`(레거시, `conti_shares` 테이블 기반)는 3개 섹션(촬영 콘티/체크리스트/타임테이블)이 전부 표이고, 공유 링크를 다시 복사할 방법이 페이지 자체에는 없다.

## 목표

1. 필드뷰 카드의 시각적 완성도를 다듬는다(레이아웃/색상 팔레트는 유지).
2. `/conti/view/[token]` 페이지를 표에서 카드/리스트 스타일로 바꿔서 필드뷰와 톤을 맞춘다.
3. 그 페이지 자체에서 링크를 복사할 수 있는 공유 버튼을 추가한다.

## 컴포넌트 구조

`components/conti/ContiSceneCard.tsx`(신규) — 순수 표시용 컴포넌트. 드래그/체크 로직을 갖지 않는다.

```ts
type ContiSceneCardProps = {
  index: number;           // "N순위" 배지에 쓸 순번
  category: string;
  duration?: string;
  keyword?: string;
  description?: string;
  location?: string;
  cameraAngle?: string;
  personnel?: string;
  color: { bg: string; text: string };
  completed?: boolean;
  headerRight?: React.ReactNode;  // 체크박스 등 편집 화면 전용 컨트롤을 끼워 넣는 슬롯
};
```

- **ContiBuilder 필드뷰**: 이 카드를 드래그 핸들·완료 체크박스와 함께 감싸서 쓴다(기존 순서변경/완료 API 그대로 유지, `headerRight`에 체크박스 전달).
- **`/conti/view/[token]` 공유 페이지**: `headerRight` 없이, 아무 핸들러 없이 그대로 렌더링만 한다(읽기 전용).

체크리스트/타임테이블도 같은 원칙으로 각각 `ContiChecklistRow.tsx`, `ContiScheduleBlock.tsx`(신규, 둘 다 순수 표시용)로 뽑아서 필드뷰의 체크박스 리스트·시간 블록 스타일을 공유 페이지에도 그대로 쓴다.

## 시각적 다듬기 방향

레이아웃 구조와 카테고리별 파스텔 색상 팔레트는 그대로 유지하고, 아래 방향으로 다듬는다(정확한 값은 구현 중 판단):

- 헤더-본문 사이 여백/줄간격을 넉넉하게(현재 다소 빽빽함)
- "N순위" 텍스트 배지 → 원형 숫자 배지
- 장소/구도/필요인원 3분할 박스 모서리 반경을 카드 바깥 반경과 통일
- 헤더 색상 대비를 살짝 높여 카테고리 구분 강화
- 아이콘·라벨 크기 일관화

## 공유 페이지(`/conti/view/[token]`) 전환

3개 섹션 전부 표에서 아래로 바꾼다:
- 촬영 콘티 → `ContiSceneCard` 그리드(반응형: 넓은 화면 2~3열, 좁은 화면 1열)
- 체크리스트 → `ContiChecklistRow` 리스트(체크 UI는 시각적 표시만, 실제 체크 상태 저장은 안 함 — 이 페이지는 읽기 전용)
- 타임테이블 → `ContiScheduleBlock` 리스트

## 공유 버튼

`components/conti/ShareLinkCopyButton.tsx`(신규, 기존 `ShareViewPrintButton.tsx`와 같은 "use client" 아일랜드 패턴) — 페이지 상단 고정 헤더에 배치. 클릭 시 `navigator.clipboard.writeText(window.location.href)`, "복사됨!" 텍스트를 잠깐 표시. 새 백엔드/토큰 로직 불필요(이 페이지 자체가 이미 공유 URL).

## 비범위

- conti-v2 시스템(`ContiFieldView.tsx`, `ContiResultTable.tsx`, `/conti-v2/*`)은 건드리지 않는다 — 이미 별도 스펙(2026-09-08)이 있다.
- `conti_shares` 테이블 스키마, 공유 링크 발급 API(`/api/conti/share`)는 변경하지 않는다.
- 콘티 데이터/저장 로직, taxonomy는 변경하지 않는다.

## 검증

- 타입 검사, 프로덕션 빌드
- 브라우저에서 ContiBuilder 필드뷰 카드 확인(드래그·완료 체크 정상 동작)
- 실제 공유 토큰으로 `/conti/view/[token]` 열어서 카드/리스트 렌더링과 링크 복사 버튼 확인
