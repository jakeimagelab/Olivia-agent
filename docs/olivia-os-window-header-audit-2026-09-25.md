# OLIVIA OS 창 내부 헤더 감사

작성일: 2026-09-25

## 공통 규칙

새 기능을 OLIVIA OS 창에 연결할 때는 다음 한 가지 방식을 사용한다.

1. route `page.tsx`에서 실제 기능 UI를 분리해 재사용 가능한 Workspace 컴포넌트로 만든다.
2. 네이티브 창 어댑터가 Workspace를 `DesktopWindowProvider value={true}`로 감싼다.
3. Workspace는 `useDesktopWindowMode()`만 보고 `GlobalHeader`와 standalone 바깥 여백을 표시하거나 숨긴다.
4. `pathname`, 검색 파라미터, 화면 폭으로 창 내부 여부를 추측하지 않는다.
5. `oliviaEmbedded=1`은 아직 네이티브 어댑터가 없는 `LegacyRouteWindowContent` iframe의 호환 신호로만 사용한다.

메타데이터 셀렉은 이번 변경에서 이 규칙으로 전환했다. 직접 `/metadata-select`로 들어가면 헤더가 보이고, OLIVIA OS 창 또는 사진작업실 탭 안에서는 헤더가 숨겨진다.

## 네이티브 어댑터 확인

| 화면 | 창 내부 처리 | 자체 헤더 상태 |
|---|---|---|
| 오늘 | 전용 어댑터 | 자체 전역 헤더 없음 |
| 고객관리 | `DesktopWindowProvider` + `ClientsWorkspace` | `ClientsWorkspace`는 `GlobalHeader`를 렌더하지 않음 |
| 캘린더 | `CalendarEmbedProvider` | standalone에서만 `GlobalHeader` 표시 |
| 사진작업실 | `DesktopWindowProvider` + 전용 Workspace | 자체 전역 헤더 없음 |
| 메타데이터 셀렉 | `DesktopWindowProvider` + `MetadataSelectWorkspace` | 창에서는 숨김, 직접 URL에서 표시 |
| 견적서 | `DesktopWindowProvider`, `mode="modal"` | 빌더 헤더만 사용 |
| 계약서 | `DesktopWindowProvider`, `mode="modal"` | 빌더 헤더만 사용 |
| 콘티 | `DesktopWindowProvider` + Workspace | 자체 전역 헤더 없음 |
| 초상권 동의서 | `DesktopWindowProvider` + 앱 본문 | route의 `GlobalHeader`를 마운트하지 않음 |
| 문서함 | 전용 앱 | 자체 전역 헤더 없음 |
| 리뷰콘텐츠 | `DesktopWindowProvider` + Workspace | route/layout을 마운트하지 않음 |
| 메모 | `embedded` Workspace | embedded에서 페이지 크롬 숨김 |
| 홈페이지 브랜드 분석 | 전용 Workspace/host provider | route의 전역 헤더를 마운트하지 않음 |
| 병원 트렌드 분석 | 전용 Workspace/host provider | route의 전역 헤더를 마운트하지 않음 |
| 병원 브랜드 이미지 진단 | 전용 Workspace/host provider | route의 전역 헤더를 마운트하지 않음 |
| 병원 채널 분석 | 전용 Workspace/host provider | route의 전역 헤더를 마운트하지 않음 |
| Olivia 채팅 | 전용 앱 | 자체 전역 헤더 없음 |
| 모든 앱 | 전용 앱 | 자체 전역 헤더 없음 |

캘린더의 `CalendarEmbedProvider`, 메모의 `embedded`, 일부 분석 화면의 host provider는 기존 호환 구조다. 동작을 바꾸지 않았으며 새 어댑터에는 위의 `DesktopWindowProvider` 규칙을 적용한다.

## iframe으로 열리며 자체 `GlobalHeader`가 있는 도달 가능 화면

앱 그리드·도구 검색에서 도달 가능하고 아직 `LegacyRouteWindowContent` iframe을 사용하는 화면 가운데 자체 `GlobalHeader`를 직접 그리는 화면은 다음과 같다.

- `/work-journal`
- `/marketing`
- `/portal-admin`
- `/mailing`
- `/broll-prompt`
- `/report`
- `/link-generator`
- `/trash`
- `/daily-ideas`
- `/sns-manager`
- `/ai-trust-gap`
- `/image-generator`
- `/website-builder`
- `/seo-delivery`
- `/library`

이 목록은 중복 헤더가 생길 가능성이 있는 **후속 네이티브 전환 후보**다. 이번 변경에서는 확인 없이 일괄 변환하지 않았다. 레거시 iframe은 15초 로딩 타임아웃과 실패·재시도 화면을 계속 제공한다.

`/diagnosis`, `/select-match`, `/raw-select`, `/photo-retouching` 같은 별칭은 registry의 canonical route 해석을 통해 기존 네이티브 Workspace로 연결되므로 위 목록에서 제외했다.

앱 그리드에서 도달하지만 route 자체에서 `GlobalHeader`를 직접 찾지 못한 legacy iframe 화면은 `/voice-recorder`, `/team-chat`, `/team`, `/select-galleries`, `/per`, `/video-sorting`, `/youtube-editing-conti`, `/prompter`다. 이 화면들도 네이티브 어댑터가 생기기 전까지는 `LegacyRouteWindowContent`를 사용하지만, 이번 감사 기준의 헤더 중복은 확인되지 않았다.

앱 그리드 외의 내부 링크나 직접 기능 실행으로 generic legacy 창에 전달될 수 있고 자체 `GlobalHeader`가 확인된 route는 다음과 같다.

- `/color-check`
- `/consultation`
- `/conti-library`, `/conti-library/[id]`
- `/delivery-mail`
- `/gallery`
- `/instagram-promo-design`
- `/marketing/knowledge`, `/marketing/strategy`, `/marketing/strategy/[id]`
- `/original-delivery`
- `/shooting`
- `/variation`

이 route 역시 일괄 변경하지 않고 후속 전환 후보로 기록했다. `/portrait-consent`는 route 페이지 자체에는 `GlobalHeader`가 있지만 registry가 전용 `PortraitConsentWindowContent`를 먼저 선택하므로 OS 창에서는 중복되지 않는다.

## 고객관리 경로 확인

- OLIVIA OS 고객관리는 `ClientsWindowContent → ClientsWorkspace`로 직접 렌더되며 iframe이 아니다.
- 목록에서 `프로젝트 상세 보기`를 누르면 `detailTarget` 로컬 상태가 바뀌어 같은 창 안에서 `DetailView`를 렌더한다.
- 상세 화면의 견적서·계약서·콘티는 Workspace 모달 또는 `useDesktopAppLauncher()`를 사용한다.
- embedded 상태에서는 `/clients?id=...`로 이동하는 상세 링크를 노출하지 않는다.
- 갤러리 탭의 `갤러리 앱 →` 링크는 별도 standalone `/gallery`로 이동하는 명시적 링크다. 고객관리 창 안에 iframe을 삽입하는 경로는 아니다.

따라서 현재 고객관리의 목록·프로젝트 상세 핵심 경로에서는 자체 전역 헤더나 legacy iframe 이탈이 확인되지 않았다. 별도 앱 링크는 사용자가 명시적으로 누르는 경우에만 standalone route로 이동한다.

## 브라우저 파일 작업 한계

메타데이터 셀렉의 JPG 이동은 `복사 → 파일 크기 검증 → 원본 삭제` 순서와 API 오류 롤백을 사용한다. File System Access API에는 트랜잭션이 없으므로 브라우저 프로세스 강제 종료나 전원 차단까지 원자성을 보장할 수는 없다. 정상적으로 반환되는 복사·검증·삭제 오류는 롤백하며, 롤백 실패 파일은 화면에 이름을 표시한다.
