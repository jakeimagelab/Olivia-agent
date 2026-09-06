# Olivia Desktop UI 롤아웃 — 진행 로그

취침 중 자동 진행. 계획 원본: `.claude/plans/elegant-floating-charm.md` (세션 트랜스크립트에서
복구한 원본 제안서 전문 포함).

## Vercel 배포 파이프라인 — 복구됨

어젯밤 GitHub 푸시는 정상인데 Vercel이 몇 시간째 새 배포를 아예 안 만드는 상태였다(원인 불명,
`create_git_project` 강제 트리거는 안전장치가 막아서 시도 못 함). 이번 pass 작업 중간에 다시
정상적으로 배포가 큐에 잡히기 시작했다 — 정확히 왜 풀렸는지는 모른다(사용자가 대시보드에서
직접 조치했을 수도 있음). 이번 pass의 커밋들은 대부분 빠른 연속 커밋이라 서로 취소(CANCELED)
시키면서 마지막 것만 실제로 READY까지 갔다 — 이건 정상 동작(Vercel의 기존 배포 취소 정책)이라
문제 아님. 아침에 olivia.photoclinic.kr이 최신 상태인지 한 번만 확인해주면 된다.

**최종 확인**: `dpl_DNTvDQ4zsiD25Rh8rfvVFV1MFVxV`, 커밋 `9c28f6e1`(이번 pass의 마지막 커밋) 기준
`readyState: READY`, `olivia.photoclinic.kr` alias 정상 연결 확인함. 배포 정상 복구됨.

## 완료

### 탭 버튼 통일 — 1차 배치 (state 기반, 검증 완료: tsc/eslint/vitest 735개 전부 통과)

- `components/ui/SegmentedTabs.tsx` — `href?: string` 옵션 추가(라우팅 탭용, 하위호환).
- `components/conti/ContiBuilder.tsx` — 하단 필드뷰 탭(콘티/체크/일정)의 활성 표시 오렌지→틸로
  교체. (SegmentedTabs로 완전 전환은 안 함 — 이건 데스크톱 alt-top 탭이 아니라 모바일 하단
  아이콘형 탭바라 구조가 다름. 색 규칙 위반만 고침.)
- `app/daily-ideas/page.tsx` — 모바일 탭 SegmentedTabs 전환.
- `app/library/page.tsx` — 카테고리 탭 SegmentedTabs 전환 + 중복 설명 문단 제거(GlobalHeader의
  description과 완전히 같은 텍스트가 본문에도 있었음, 1.1 위반).
- `app/image-generator/page.tsx` — 모드 탭 SegmentedTabs 전환.
- `app/portal-admin/page.tsx` — 탭 SegmentedTabs 전환.
- `app/mailing/page.tsx` — 6개 탭 SegmentedTabs 전환.
- `app/sns-manager/page.tsx` — 유튜브 탭 딥링크(`?tab=youtube`)와 캘린더 탭 "준비중" 배지가
  있어서 SegmentedTabs 프리미티브로 안 바꾸고, 같은 시각 스타일을 인라인으로 재현(기능 보존).
- `components/team-workspace/WorkspacePage.tsx` — 할 일/팀채팅 탭 SegmentedTabs 전환.
- `components/memo/MemoWorkspace.tsx` — 모드 탭(일반/태블릿/음성) SegmentedTabs 전환.

### 탭 버튼 통일 — 2차 배치 (라우팅 탭, `npm run build` 전체 통과 확인)

- `app/(photo-studio)/layout.tsx`, `app/(conti-studio)/layout.tsx` — 6개/2개 라우트 전환 탭을
  SegmentedTabs(href 옵션)로 교체.
- `app/marketing/page.tsx`, `app/marketing/strategy/page.tsx`,
  `app/marketing/strategy/[id]/page.tsx` — 홈/전략 탭 동일 패턴 적용.

## 구조 재설계 필요 — 이번 pass에서 손 안 댐 (다음 세션, 사용자 확인 필요)

- `video-conti` (`app/(conti-studio)/video-conti/page.tsx`) — 4단계 스텝 위저드 구조. 유형 B의
  아코디언+A4+우측패널 스펙과 근본적으로 다른 패턴. 스텝 구조를 유지할지 아코디언으로 바꿀지
  사용자 판단 필요.
- `content-writer`, `sns-design` (`app/content-writer/page.tsx`, `app/sns-design/page.tsx`) —
  ops-shell 레이아웃(다른 유형에 가까움). 유형 B로 강제 전환하지 않음.
- `image-generator` (`app/image-generator/page.tsx`, 1195줄) — 2열 폼+결과 그리드, 우측 sticky
  패널은 있으나 좌측이 flat form. 아코디언화는 별도 세션.
- `youtube-editing-conti` (`app/youtube-editing-conti/page.tsx`, 864줄) — 손글�씨 캔버스 자유
  크기 편집기라 A4 고정 비율이 안 맞음. 우측 221px 패널은 이미 있음.
- `broll-prompt` — 우측 패널은 있으나 좌측이 번호 배지 나열이지 접히는 아코디언은 아님. 저위험
  개선(아코디언화)은 가능하나 이번 pass 스코프 밖.

## 유형 C — ScoreCard 통일 조사 결과 (대부분 보류)

`channel-analyzer`를 직접 열어본 결과, 이미 `good`/`normal`/`risk` 톤 계산 로직이 있고
`.channel-score.good/normal/risk` CSS 클래스로 색을 입히고 있었다. 그런데 이 점수가 **틸 배경
카드(`--teal`) 위에** 떠 있어서, 색이 흰 배경 기준으로 설계된 `--score-good/normal/risk`
토큰(#4C9A5C/#E9A227/#C0473F)으로 그대로 바꾸면 어두운 배경 위에서 대비가 떨어질 위험이 있다
(지금 색은 `#75d6bb`/`#f6b23c`/`#ff8562` — 어두운 배경에서 잘 보이도록 이미 밝게 조정된 값으로
보임). 브라우저로 대비를 직접 확인할 방법이 이번 세션엔 없어서(Playwright 미연결), **색 교체는
보류**하고 안전한 것만 했다: "PHOTO CLINIC BRAND REPORT" 영문 이터브로우 제거(1.1 위반, 콘티의
"Conti setup" 사례와 동일 패턴).

나머지 12개 라우트(`channel-audit`, `ai-trust-gap`, `monthly-report`, `hospital-brand-image-
diagnosis`, `report`, `diagnosis`, `trend-dashboard`, `review`, `review-studio`, `color-check`,
`clients/reports`, `brand-analysis`)는 각각 점수를 어떤 배경 위에 어떤 방식으로 보여주는지
개별 확인이 필요해서 이번 pass에서 손 안 댐 — 브라우저로 대비 확인 가능한 다음 세션에서 진행.

## ScoreCard 미적용 (점수 표시 자체가 없음, 제품 결정 필요)

`brand-analysis`, `diagnosis`, `trend-dashboard`, `review`, `color-check`, `review-studio`,
`clients/reports` — 점수 UI를 새로 만드는 건 리스타일이 아니라 화면 설계라 이번 pass에서 제외.

## 확인 필요 (애매해서 그대로 둔 것)

- `components/PageHeader.tsx` — `pc-tabs`를 쓰는 탭 기능이 있지만 레포 전체에서 **어디서도 import
  안 함**(완전히 죽은 컴포넌트). 탭 마이그레이션 대상에서 제외(고칠 실사용처가 없음). 삭제 여부는
  이번 pass 범위 밖이라 판단 안 하고 그대로 둠.

- **유형 B 나머지 15개 라우트의 "오렌지 1개" 규칙 감사** — 직접 열어서 확인한 결과, 대부분의
  다중 오렌지 사용은 "같은 생성 버튼이 반응형 분기(모바일/데스크톱)마다 따로 렌더되는 것"이라
  실제 위반이 아니었다. 다만 **`app/daily-ideas/page.tsx`에서 오렌지가 뱃지("오늘" 표시,
  플랫폼 태그, 인용구 강조)에도 쓰이고 있어 1.2 위반("오렌지는 탭·뱃지·아이콘 장식에 쓰면
  안 됨")**이 실제로 있다. 이걸 고치려면 뱃지 색을 무엇으로 바꿀지(골드? 세이지? 틸?) 결정해야
  하는데 이건 리스타일이 아니라 색 배정 정책 결정이라 이번 pass에서 임의로 정하지 않았다.
  다른 14개 파일도 비슷한 뱃지-오렌지 패턴이 있을 수 있으나 전부 열어서 확인은 못 했다.
- **색 토큰화(hex→var) 보류** — `website-builder`의 COLOR_PRESETS/COLOR_THEMES, `prompter`의
  SPEAKER_PALETTE 등은 "우리 UI 크롬 색"이 아니라 **사용자가 만드는 결과물(웹사이트/화자
  구분색)의 데이터**라서, 이런 파일들은 hex 값이 곧 콘텐츠다 — 기계적으로 토큰 치환하면 안
  된다. 파일마다 "이 hex가 크롬인지 데이터인지" 구분하는 데 판단이 필요해서, 이번 pass에서는
  안전하게 보류했다(잘못 건드리면 사용자가 만드는 결과물 색상이 깨질 위험).

## 다음 세션에서 이어갈 것

1. 위 "구조 재설계 필요" 5개 라우트 — 사용자와 방향(스텝 유지 vs 아코디언) 상의 후 진행.
2. 유형 C 나머지 8개 — 점수 UI 신규 설계 여부 결정.
3. Stage 7 (유형 A, 34개 — 고객관리 마스터-디테일 패턴 복사).
4. Stage 8 (유형 E·F·G·H, 31개).
5. Stage 9 (유형 I, 21개 — 외부 공개 페이지, 내부 CSS와 분리).
