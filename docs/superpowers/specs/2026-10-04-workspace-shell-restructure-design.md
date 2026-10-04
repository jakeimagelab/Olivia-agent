# 작업실 재구성 및 공통 UI 설계

작성일: 2026-10-04
기준 브랜치: `main` (`video-studio-v2` 및 다중 Worker 지원 포함)
구현 브랜치: `feature/workspace-shell-restructure`

## 1. 목표와 범위

사진작업실과 영상작업실을 같은 구조와 시각 언어로 정리한다. 기존 생성·분석·녹화·서명·저장 API와 데이터 모델은 유지하고, 기능의 위치·진입점·창 내부 레이아웃만 바꾼다.

기준은 사용자가 제공한 다섯 장의 시안이다.

- 공통 순서: 창 제목 표시줄 → 필요한 탭에서만 작업 위치 막대 → 상위 탭 → 작업 패널과 사용 가이드
- 상위 탭은 선형 `lucide-react` 아이콘과 텍스트를 쓰며 이모지를 사용하지 않는다.
- 세부 탭은 작업 패널 상단의 밑줄형 탭으로 표시한다.
- 사진·영상의 색과 결과를 보는 화면은 중성 다크 패널, 글과 설정을 쓰는 화면은 밝은 패널을 쓴다.
- 900px 미만에서는 가이드 패널을 접고 `사용 가이드 보기` 버튼으로 연다.

이번 범위에는 매거진 원고 생성 로직과 의료광고 체커가 포함되지 않는다. 기존 웹진 초안 화면을 `매거진 원고` 탭으로 이름만 바꾸고 그대로 재사용한다.

## 2. 선택한 구현 방식

공통 Workspace Shell과 기존 기능 어댑터를 조합한다. 레거시 페이지를 iframe으로 감싸거나 기능을 새로 작성하지 않는다.

각 기존 route의 실제 화면을 재사용 가능한 Workspace 컴포넌트로 분리한다. 독립 route와 작업실 탭은 같은 Workspace를 사용하며, 작업실 안에서는 `DesktopWindowProvider value={true}`를 통해 `GlobalHeader`를 렌더하지 않는다. 공개 공유·토큰 route는 독립 화면으로 유지한다.

이 방식은 다음을 보장한다.

- 기존 API, 저장 데이터, 분석 로직, 프롬프터 녹화 및 서명 흐름 보존
- 작업실 내부 `LegacyRouteWindowContent` 제거
- URL 딥링크, 뒤로가기, Olivia 명령과 앱 실행기의 단일 canonical 목적지
- 모바일·태블릿 전용 화면의 기능 보존

## 3. 최종 정보 구조

### 3.1 영상작업실

Canonical 앱은 `/video-studio`, registry id는 `video-studio`다.

| 상위 탭 | 세부 탭 | canonical URL | 기존 출처 |
|---|---|---|---|
| 기획 `plan` | 영상 콘티 `video-conti` | `/video-studio?tab=plan&tool=video-conti` | `/video-conti` |
| 기획 `plan` | 유튜브 편집 콘티 `youtube-conti` | `/video-studio?tab=plan&tool=youtube-conti` | `/youtube-editing-conti` |
| 기획 `plan` | B-roll 프롬프트 `broll` | `/video-studio?tab=plan&tool=broll` | `/broll-prompt` |
| 촬영 `shoot` | 프롬프터 `prompter` | `/video-studio?tab=shoot&tool=prompter` | `/prompter` |
| 후반 `post` | 인터뷰 분석 `interview` | `/video-studio?tab=post&tool=interview` | v2 |
| 후반 `post` | 릴스 `reels` | `/video-studio?tab=post&tool=reels` | v2 |
| 후반 `post` | 영상 분류 `sorting` | `/video-studio?tab=post&tool=sorting` | `/video-sorting` |
| 후반 `post` | 음성 분리 `audio` | `/video-studio?tab=post&tool=audio` | v2 |
| 제작·발행 `publish` | 매거진 원고 `magazine` | `/video-studio?tab=publish&tool=magazine` | 기존 웹진 초안 |
| 제작·발행 `publish` | AI 영상제작 `ai-video` | `/video-studio?tab=publish&tool=ai-video` | `/video-production` |

기존 평면 딥링크는 아래처럼 정규화한다.

- `?tab=interview` → `?tab=post&tool=interview`
- `?tab=reels` → `?tab=post&tool=reels`
- `?tab=sorting` → `?tab=post&tool=sorting`
- `?tab=audio` → `?tab=post&tool=audio`
- `?tab=webzine` → `?tab=publish&tool=magazine`

작업 위치 막대는 인터뷰 분석과 음성 분리에서 원격 Worker 선택을, 영상 분류에서 로컬 작업을 표시한다. 나머지 탭에서는 막대를 숨긴다. 기존 Mac Studio/MacBook Worker 상태와 실행 선택 로직을 그대로 재사용한다.

### 3.2 사진작업실

Canonical 앱은 `/photo-sorting`, registry id는 `photo-workspace`다.

기존 상위 탭 앞에 `기획`을 추가하며 canonical URL은 `/photo-sorting?tab=plan&tool=shooting-conti`다. 해당 탭은 `components/conti/v2` Workspace를 재사용한다. 사진 셀렉·RAW 매칭·사진 분류·T컷·리사이즈·이름변경·사진 보정의 동작과 URL 하위 호환은 유지한다.

### 3.3 고객관리

초상권 동의서는 촬영 프로젝트 상세의 문서 영역에 추가한다. `PortraitConsentApp`에 현재 `clientId`와 `workflowRunId`를 전달한다. 독립 앱 아이콘은 제거하고 `/portrait-consent`는 고객관리 문서 진입점 `/clients?tab=documents&tool=portrait-consent`로 정규화한다.

고객 서명 링크 `/portrait-consent/[token]`과 관련 API는 유지한다.

## 4. 공통 컴포넌트

`components/workspace-shell/` 아래에 다음 경계를 둔다.

- `WorkspaceShell`: 페이지 배경, 최대 폭, 바깥 여백, 창 내부 높이
- `WorkspaceTabs`: `SegmentedTabs` 기반 상위 탭, 폭 부족 시 아이콘만 표시
- `WorkspaceSubTabs`: 패널 상단 밑줄형 세부 탭
- `WorkspaceGrid`: 작업 패널/가이드 2열과 900px 접기 동작
- `WorkPanel`: `dark`와 `light` 톤
- `GuidePanel`: 번호, 아이콘, 설명, 선택적 TIP
- `ExecutionBar`: 기존 `PhotoStudioExecutionBar`를 탭 요구사항에 맞춰 표시하는 어댑터
- `Stepper`: 영상 콘티 4단계, 영상 분류 단계, 인터뷰 진행 상태가 공유하는 표시 부품
- `EmptyState`, `ProgressCard`, `Toast`, `ConfirmDialog`: 공통 피드백 표현

컴포넌트는 기능 상태를 소유하지 않는다. 활성 탭, 단계, 가이드 내용, tone과 callback을 props로 받고 렌더링만 담당한다. 사진·영상 도메인의 실행 컨텍스트와 API 호출은 기존 Workspace가 계속 소유한다.

## 5. 시각 규칙

### 5.1 패널 톤

- 다크: 사진 셀렉·분류·T컷·보정, 영상 분류, 인터뷰 분석 결과, 릴스, AI 영상제작 결과
- 라이트: 촬영 콘티, 영상 콘티, 유튜브 편집 콘티, B-roll 프롬프트, 프롬프터 설정, 매거진 원고, 음성 분리

다크 패널은 `#2a2a2a`, 내부 입력과 데이터 카드는 `#fbfcfc`를 사용한다. 라이트 패널은 기존 사진작업실 가이드 패널의 경계·그림자·흰색 배경을 따른다.

### 5.2 버튼과 색

- 기본 실행 버튼은 `var(--deep-green)`을 사용한다.
- 주황 버튼은 되돌리기 어려운 실행에만 화면당 하나까지 사용한다.
- 수정하는 화면의 로컬 `const C = {...}` 색 객체는 CSS 변수와 공통 클래스/모듈로 교체한다.
- 탭 라벨과 작업실 제목의 이모지를 제거한다.

### 5.3 예외

- 프롬프터 읽기 화면과 모바일 리모컨은 현재 전체화면 다크 동작을 유지한다.
- 유튜브 편집 콘티의 손글씨 캔버스 크기·제스처는 유지한다.
- 영상 콘티는 기존 4단계 로직을 유지하고 단계 표시만 `Stepper`로 교체한다.

## 6. 경로와 앱 마이그레이션

관리자 내부에서 옛 경로로 진입하면 canonical 작업실 URL로 redirect하거나 앱 실행기에서 직접 같은 native Workspace를 연다. 다만 link-generator가 발급한 공유 세션으로 `/video-conti`, `/prompter` 등 기능 route 자체에 진입한 경우에는 기존 공유 범위와 단독 Workspace 렌더링을 유지한다. 따라서 같은 pathname이라도 관리자 세션은 작업실로 이동하고, 유효한 공유 세션은 기존 기능만 보이는 독립 화면에 남는다.

| 옛 경로 | 새 목적지 |
|---|---|
| `/conti` | `/photo-sorting?tab=plan&tool=shooting-conti` |
| `/video-conti` | `/video-studio?tab=plan&tool=video-conti` |
| `/youtube-editing-conti` | `/video-studio?tab=plan&tool=youtube-conti` |
| `/broll-prompt` | `/video-studio?tab=plan&tool=broll` |
| `/prompter` | `/video-studio?tab=shoot&tool=prompter` |
| `/video-production` | `/video-studio?tab=publish&tool=ai-video` |
| `/portrait-consent` | `/clients?tab=documents&tool=portrait-consent` |

아래 공개/현장 경로는 단독 페이지로 남긴다.

- `/video-conti/view/[token]`
- `/conti/view/[token]`
- `/conti/share/[token]`
- `/conti-v2/share/[token]`
- `/prompter/remote/[code]`
- `/portrait-consent/[token]`

`FEATURE_API_SCOPE`와 link-generator의 경로·API 허용 범위는 변경하지 않는다. 공유 세션 화면에는 다른 작업실 탭이나 내부 앱 탐색을 추가하지 않는다.

## 7. 레지스트리와 저장 상태 마이그레이션

- `workspaceGroups`에서 `conti` 그룹을 제거하고 별칭을 photo/video/customer 항목으로 이전한다.
- `oliviaAppRegistry`에서 `conti`, `video-production`, `portrait-consent` 단독 앱을 제거한다.
- 기존 app id를 여는 호출은 `photo-workspace`, `video-studio`, `customer`와 정확한 `routeHref`로 변환한다.
- All Apps, toolNav, 검색, Olivia feature resolver에는 단독 카드 없이 별칭만 남긴다.
- 저장된 즐겨찾기·Dock의 옛 key/id는 로드 시 canonical 앱으로 치환하고 중복을 제거한다.
- 태블릿과 모바일의 `conti` 기능은 화면 자체를 삭제하지 않고 사진작업실 기획/촬영 콘티 진입으로 연결한다.
- 문서 workflow의 내부 `conti` 타입과 DB 리소스명은 변경하지 않는다.

## 8. URL 및 상태 흐름

상위/세부 탭은 URL을 단일 진실 공급원으로 사용한다. 탭 선택 시 `router.push`로 `tab`과 `tool`을 갱신하고 다른 문맥 파라미터(`clientId`, `workflowRunId`, `resourceId`, `project`)는 보존한다. 잘못되거나 과거 형식인 파라미터는 결정된 canonical 조합으로 교정한다.

Workspace Shell은 URL과 레이아웃만 담당한다. 각 기능 Workspace의 현재 문서, 생성 상태, 로컬 폴더, Worker 작업, 녹화 상태는 기존 상태 소유자를 유지한다. 탭을 이동할 때 기능이 요구하는 기존 저장·정리 동작 외에 API 호출이나 데이터 복제를 추가하지 않는다.

## 9. 오류와 접근성

- 잘못된 탭/도구 조합은 해당 상위 탭의 첫 도구로 복구한다.
- 지원하지 않는 실행 위치는 기존 안내와 전환 버튼을 유지한다.
- Workspace 공통 오류는 `Toast` 또는 `EmptyState`로 이유를 표시한다.
- 탭은 올바른 `tablist/tab/tabpanel`, `aria-selected`, `aria-controls`를 사용한다.
- 가이드 토글은 `aria-expanded`와 대상 id를 연결한다.
- 모달은 `ConfirmDialog`로 포커스를 가두고 Escape/취소를 지원한다.

## 10. 구현 및 커밋 순서

1. 공통 부품 신설 및 사진작업실 전환
2. 영상작업실 2단 탭 및 딥링크 호환
3. 영상 콘티, 유튜브 편집 콘티, B-roll, 프롬프터, AI 영상제작 Workspace 이동
4. 사진작업실 촬영 콘티와 고객관리 초상권 동의서
5. 레지스트리·검색·명령·모바일·태블릿·즐겨찾기·Dock 연결 정리
6. 이모지·로컬 색 객체·tone·Stepper 통일
7. 옛 사진/콘티 레이아웃 제거 또는 redirect 전환과 호환 화면 제거

각 단계는 독립 커밋으로 남긴다. 최종 결과는 새 PR로 제출하며 `main`에는 병합하지 않는다.

## 11. 검증

- `tests/workspaceGroups.test.ts`, `tests/olivia/featureResolver.test.ts`, `tests/actionRouterOliviaOs.test.ts`에 옛 경로와 명령 매핑을 추가한다.
- 앱 registry, 즐겨찾기/Dock 마이그레이션, 모바일·태블릿 conti 진입, URL 하위 호환을 단위 테스트한다.
- 공개 토큰 route와 link-generator 경로가 유지되는지 확인한다.
- `npm run typecheck`, 변경 파일 ESLint, `npx vitest run`을 실행한다.
- 1280px와 760px에서 사진작업실 전후 및 영상작업실의 각 상위 탭을 캡처한다.
- 다크/라이트 대비, 가이드 접힘, 중복 GlobalHeader, LegacyRouteWindowContent 사용 여부를 시각·코드 양쪽에서 확인한다.

## 12. 비범위와 데이터 안전

- Supabase 스키마와 마이그레이션을 변경하지 않는다.
- 콘티 생성, 영상 분석, 프롬프터 녹화, Higgsfield 호출, 초상권 서명 API를 변경하지 않는다.
- 매거진 생성과 의료광고 체커를 구현하지 않는다.
- 공개 공유 토큰과 기존 저장 기록을 이동·삭제하지 않는다.
