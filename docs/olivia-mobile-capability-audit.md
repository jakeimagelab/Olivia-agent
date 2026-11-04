# Olivia OS 모바일 기능 감사

기준: 2026-11-05 현재 `oliviaAppRegistry` 전 항목. 실제 정책의 단일 진실 공급원은 `lib/olivia/mobile/appCapabilities.ts`이며, 테스트가 데스크톱 registry 누락을 검사한다.

| 기능 | mobile capability | 상태 | 모바일 제공 범위 / 제한 |
|---|---|---|---|
| 홈 | full | 정상 | 오늘 일정·현재 작업·사진선택·빠른 작업 |
| 고객관리 | manage, full | 정상 | 검색·등록·정보 수정·촬영 건 명시 선택·연결 문서 |
| 일정 | manage, full | 정상 | 주간 strip·일/월 보기·일정 CRUD·할 일 |
| 사진작업실 | status, request | 정상 | 실제 작업 상태·결과·Olivia 요청 |
| Olivia Bridge | status, request | 정상 | worker/NAS/job 상태·안전한 폴더 표시·Olivia 요청 |
| 메타데이터 셀렉 | desktop-only | 제한 | 대량 메타데이터 편집은 데스크톱 전용 |
| 고객 셀렉 갤러리 | desktop-only | 제한 | 전용 모바일 결과 viewer 미구현 |
| 개인별 사진 셀렉 | manage, full | 정상 | 행사·제출·참가자 선택 결과·마감·상태·링크 |
| AI 검색 최적화 납품 | desktop-only | 제한 | 모바일 상태 API 미연결 |
| 통합 메일링 | request | 제한 | Olivia 요청, 직접 발송은 데스크톱 전용 |
| 업무일지 | request | 제한 | Olivia 요청, 직접 편집은 데스크톱 전용 |
| 업무 리포트 | desktop-only | 제한 | 전용 모바일 viewer 미구현 |
| 영상작업실 | status, request | 정상 | worker/job 상태·결과·Olivia 요청 |
| 견적서 | viewer, request | 정상 | UUID viewer·PDF·Olivia 수정 요청 |
| 계약서 | viewer, request | 정상 | UUID viewer·PDF·상태·Olivia 수정 요청 |
| 콘티 | viewer, request | 정상 | run/scene viewer·장면/전체 수정 요청 |
| 스텝 가이드 | desktop-only | 제한 | Olivia shell 전용 모바일 화면 없음 |
| 초상권 동의서 | desktop-only | 제한 | 공개 서명 경로는 별도, 관리자 viewer 미구현 |
| 문서함 | viewer | 정상 | 최근 canonical 문서 조회 |
| 리뷰콘텐츠 | request | 제한 | Olivia 요청, 전용 결과 viewer 미구현 |
| 메모 | full | 정상 | 조회·작성 |
| Olivia | full | 정상 | 전체화면 대화·검증된 대상 전달 |
| 전체 기능 | full | 정상 | 모바일 제공 기능 중앙 목록 |
| 홈페이지 브랜드 분석 | request | 제한 | Olivia 요청, 입력 화면은 데스크톱 전용 |
| 병원 트렌드 분석 | desktop-only | 제한 | 전용 모바일 viewer 미구현 |
| 병원 브랜드 이미지 진단 | desktop-only | 제한 | 전용 모바일 viewer 미구현 |
| 병원 채널 분석 | desktop-only | 제한 | 전용 모바일 viewer 미구현 |
| 기존 기능창 | desktop-only | 제한 | iframe 호환 화면 모바일 미지원 |
| 프롬프터(영상작업실 하위 기능) | full | 정상 | 모바일 전체화면 실행 |

## 공통 감사 항목

- route: `mobileView`/정확한 UUID를 URL에 보존하며 일반 진입은 대상 ID를 지운다.
- scroll: shell이 전역 overflow를 잠그지 않고 페이지 단위로 스크롤한다.
- touch: 주요 버튼 44px 이상, hover Dock 미사용, 하단 내비게이션 상시 표시.
- fixed footer: safe-area 높이만큼 각 화면의 하단 여백을 둔다.
- keyboard: 입력 16px 이상, Olivia 채팅은 `visualViewport`를 반영한다.
- modal/sheet: Escape, backdrop, swipe down, 포커스 trap과 호출 버튼 복귀.
- context: 목록·일반 기능에서 마지막 고객 fallback 없음. 문서/장면/행사/폴더는 명시 식별자만 전달.
- Bridge: 서버가 제공하지 않는 T컷·이름변경 상태는 `대기`로 위장하지 않고 `상태 연동 없음` 표시.
