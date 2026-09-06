# Olivia Desktop UI 롤아웃 — 진행 로그

취침 중 자동 진행. 계획 원본: `.claude/plans/elegant-floating-charm.md` (세션 트랜스크립트에서
복구한 원본 제안서 전문 포함).

## ⚠️ 먼저 확인할 것 — Vercel 배포 파이프라인

어젯밤부터 GitHub에는 커밋이 정상적으로 올라가는데 Vercel이 새 배포를 아예 시작하지 않는 상태였다
(`create_git_project`로 강제 트리거 시도 → Claude Code 안전장치가 "요청 안 된 인프라 변경"으로 막음).
이번 세션에서 만든 커밋들도 실제 프로덕션(olivia.photoclinic.kr)에 반영 안 됐을 수 있다.
**Vercel 대시보드 → Deployments에서 최신 커밋에 수동 Redeploy 확인 필요.**

## 완료

(작업하면서 아래에 추가)

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

## ScoreCard 미적용 (점수 표시 자체가 없음, 제품 결정 필요)

`brand-analysis`, `diagnosis`, `trend-dashboard`, `review`, `color-check`, `review-studio`,
`clients/reports` — 점수 UI를 새로 만드는 건 리스타일이 아니라 화면 설계라 이번 pass에서 제외.

## 확인 필요 (애매해서 그대로 둔 것)

(작업하면서 발견하면 추가)

## 다음 세션에서 이어갈 것

1. 위 "구조 재설계 필요" 5개 라우트 — 사용자와 방향(스텝 유지 vs 아코디언) 상의 후 진행.
2. 유형 C 나머지 8개 — 점수 UI 신규 설계 여부 결정.
3. Stage 7 (유형 A, 34개 — 고객관리 마스터-디테일 패턴 복사).
4. Stage 8 (유형 E·F·G·H, 31개).
5. Stage 9 (유형 I, 21개 — 외부 공개 페이지, 내부 CSS와 분리).
