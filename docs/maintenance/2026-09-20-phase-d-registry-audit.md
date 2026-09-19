# PHASE D — Olivia OS 레지스트리 및 iframe 감사

- 분석일: 2026-09-20
- 기준 커밋: `0377a781`
- 범위: Desktop 앱 그리드·검색·Dock 및 `WORKSPACE_GROUPS`에서 실제 진입 가능한 화면

## 현재 실행 구조

`useDesktopAppLauncher()`는 route가 `oliviaAppRegistry`에 있으면 전용 React 어댑터를 열고, 없으면 `legacy-route`의 `LegacyRouteWindowContent`를 연다. 레거시 화면은 동일 origin의 기존 페이지를 iframe으로 표시한다.

PHASE D에서는 레거시 실행 경로 자체를 제거하지 않았다. 대신 iframe에 로딩 상태, 15초 지연 실패 안내, 재시도, 창 크기 기준 스크롤을 추가했다. 개별 API와 페이지 로직은 변경하지 않았다.

## 전환 대상

사용 빈도와 기존 요청 우선순위를 기준으로 아래 네 화면을 PHASE E 네이티브 어댑터 전환 대상으로 확정했다.

| 경로 | 앱 | 전환 이유 |
|---|---|---|
| `/brand-analysis` | 홈페이지 브랜드 분석 | 브랜드 진단센터의 주 진입점 |
| `/trend-dashboard` | 병원 트렌드 분석 | 리포트·브랜드 그룹 양쪽에서 사용 |
| `/hospital-brand-image-diagnosis` | 병원 브랜드 이미지 진단 | Tablet에서도 직접 진입 |
| `/channel-analyzer` | 병원 채널 분석 | Desktop·Tablet·고객 컨텍스트에서 사용 |

## iframe 유지

현재 앱 그리드 또는 통합 작업실에서 진입 가능하지만 이번 전환 범위가 아닌 화면이다.

- 업무/관리: `/voice-recorder`, `/team-chat`, `/work-journal`, `/team`, `/marketing`, `/select-galleries`, `/per`, `/portal-admin`, `/mailing`, `/report`, `/link-generator`, `/trash`
- 사진/영상: `/select-match`, `/metadata-select`, `/raw-select`, `/video-sorting`, `/photo-retouching`, `/prompter`, `/youtube-editing-conti`, `/broll-prompt`
- 콘텐츠/분석: `/daily-ideas`, `/sns-manager`, `/ai-trust-gap`, `/diagnosis`, `/image-generator`, `/website-builder`, `/seo-delivery`, `/library`
- 통합 작업실 보조 경로: `/video-conti`, `/clients/reviews`, `/monthly-report`

이 목록은 기능 제거 후보가 아니다. 전용 어댑터가 생길 때까지 개선된 compatibility iframe을 사용한다.

## 제거 판정

이번 PHASE에서 제거할 페이지는 없다. PHASE C에서 mock 전용 `/select/demo`만 별도 승인 후 삭제했으며, 외부 공유·webhook·직접 URL 가능성이 있는 페이지와 API는 정적 참조만으로 삭제하지 않는다.

## 실패 처리

- 최초 표시: `화면을 불러오는 중입니다`
- 15초 내 load 완료: iframe 표시
- load error 또는 timeout: 실패 안내와 `다시 시도` 제공
- 한 iframe의 실패는 해당 Olivia 창에만 격리
- 직접 URL, 인증, API, navigation 구조는 그대로 유지
