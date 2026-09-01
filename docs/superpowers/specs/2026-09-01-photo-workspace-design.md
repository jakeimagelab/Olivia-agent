# 사진작업실 통합 UI 설계

## 목표

기존 사진 셀렉, RAW 매칭, 사진 분류, 영상 변환 기능을 새로 구현하지 않고 하나의 작업실 화면에서 선택하고 실행할 수 있도록 재배치한다. 대표 진입점은 기존 `/photo-sorting`을 유지하며, 기존 개별 기능 URL과 matcher/classification/conversion 로직도 보존한다.

## 범위

### 포함

- `/photo-sorting`에 사진작업실 통합 Shell 제공
- 상단 작업 카드: 사진 셀렉, RAW 매칭, 사진 분류, 파일 변환
- 사진 셀렉 하위 탭: AI 사진 셀렉, 직접 셀렉, 고객 선택 불러오기
- 작업 영역과 mode별 사용 가이드의 70/30 레이아웃
- URL query 기반 작업 상태와 브라우저 뒤로/앞으로 이동 복원
- 기존 셀렉, RAW matcher, classification, 4K→FHD 변환 컴포넌트 재사용
- 반응형 및 키보드 접근성

### 제외

- AI semantic photo search 엔진 구현
- 새로운 matcher 또는 classification 알고리즘
- 기존에 없는 사진 resize/format conversion 기능
- 최근 작업, 통계 카드, 신규 progress system
- 기존 개별 기능 URL 제거

## 조사 결과

- `app/(photo-studio)/layout.tsx`가 사진 관련 개별 페이지의 공통 헤더와 링크 탭을 제공한다.
- `/photo-sorting`은 여러 곳에서 사진작업실 대표 진입점으로 사용된다.
- `components/photo-classifier/PhotoSortingWorkspace.tsx`는 이미 page/modal 재사용 구조를 갖는다.
- `app/(photo-studio)/select-match/page.tsx`에는 직접 셀렉, 고객 파일명·업로드 입력, RAW 인덱싱·복사, 파일명 찾기와 순서 검토가 함께 있다.
- `app/(photo-studio)/raw-select/page.tsx`에는 품질·중복 필터링과 RAW 복사 워크플로우가 있다.
- `app/(photo-studio)/video-convert/page.tsx`가 실제 지원하는 변환은 브라우저 기반 4K·고해상도 영상의 FHD MP4 변환이다.
- 순수 matcher는 `lib/selectMatch/*`, metadata matcher는 `lib/metadataSelect/*`에 존재하며 그대로 사용한다.

## 선택한 접근

통합 Shell에서 기존 기능 컴포넌트를 활성 mode에 따라 마운트한다. 기존 페이지 파일에 강하게 결합된 UI는 로직을 다시 작성하지 않고 재사용 가능한 component export와 thin page wrapper 구조로 조정한다. classification과 FFmpeg 같은 무거운 모듈은 `next/dynamic`으로 해당 mode가 선택됐을 때만 로드한다.

iframe 삽입은 중복 헤더, 폴더 권한 UX, 반응형과 접근성 문제로 제외한다. matcher와 classification 전체를 service로 다시 작성하는 접근은 이번 범위를 넘어가므로 제외한다.

## URL 및 상태

대표 URL은 `/photo-sorting`이다.

- `mode=select|raw-match|classification|conversion`
- `selectMode=ai|manual|client`
- query가 없거나 잘못되면 `mode=select`, `selectMode=ai`
- 작업 카드 및 하위 탭 클릭은 같은 page에서 query만 갱신한다.
- 브라우저 back/forward는 `useSearchParams` 값으로 UI를 복원한다.
- 기존 CRM query인 `clientId`, `client_id`, `workflowRunId` 등은 보존한다.
- 기존 `/select-match`, `/raw-select`, `/video-convert` URL은 계속 독립 실행 가능하다.

## 컴포넌트 구조

```text
PhotoWorkspace
├─ PhotoWorkspaceHeader
├─ PhotoWorkspaceTabs
├─ PhotoSelectWorkspace
│  ├─ PhotoSelectTabs
│  ├─ AiPhotoSelectPanel
│  └─ 기존 SelectMatch UI (manual/client embedded mode)
├─ 기존 RAW matching UI
├─ 기존 PhotoSortingWorkspace
├─ 기존 VideoConvert UI
└─ PhotoGuidePanel
```

파일은 `components/photo-workspace/` 아래에 배치한다. 한 번만 쓰는 작은 마크업까지 과도하게 분리하지 않는다.

## 통합 Shell

- 기존 Olivia Admin sidebar와 전역 header/spacing은 유지한다.
- `/photo-sorting`에서는 기존 사진 기능 링크 탭 대신 통합 사진작업실 본문을 표시한다.
- 제목은 `사진작업실`, 설명은 `사진 셀렉부터 RAW 매칭, 분류, 변환까지 한 곳에서 작업합니다.`로 고정한다.
- 작업 카드는 desktop 4열, tablet 2열, 좁은 mobile 1열이다.
- 카드 높이는 약 100~110px이며 Lucide line icon, 기능명, 설명을 표시한다.
- 활성 카드는 very light mint 배경과 deep green 경계로 표시한다.
- 최근 작업과 통계 카드는 렌더링하지 않는다.

## 작업 영역

desktop은 작업 영역 68~72%, guide 28~32%의 grid다. tablet 이하에서는 guide가 아래로 이동한다.

### AI 사진 셀렉

이번 단계에서는 UI Shell과 callback 경계만 제공한다.

- 자연어 안내, 입력, 찾기 버튼
- 폴더 선택 상태
- 후보 사진 empty state
- 선택 초기화, 선택 완료, RAW 매칭 이동 버튼
- callback interface: `onSelectFolder`, `onSearch`, `onSelectCandidate`, `onConfirmSelection`, `onStartRawMatch`
- 검색 엔진이 없으므로 찾기와 후보 결과를 성공한 것처럼 표시하지 않는다.

### 직접 셀렉

기존 `SelectMatchPage`의 폴더 직접 선택과 thumbnail 선택, RAW 매칭 흐름을 재사용한다. 통합 Shell 안에서는 자체 기능 탭과 중복되는 상단 소개만 숨기는 embedded variant를 사용한다.

### 고객 선택 불러오기

기존 텍스트 붙여넣기, 파일 업로드, 파일명 추출, RAW 폴더 선택, preflight, 복사와 결과 기능을 재사용한다. 신규 filename matching 로직은 만들지 않는다.

### RAW 매칭

기존 `lib/selectMatch/folderScanner`, `nameParsing`, `rawIndex` 및 page workflow를 사용한다. 셀렉 JPG, RAW 원본, 자동 매칭과 결과 단계를 compact shell 안에 표시하되, 실제 스캔·복사·검증 동작은 기존 함수를 호출한다. 기존 metadata matcher 진입점도 유지한다.

### 사진 분류

기존 `PhotoSortingWorkspace`를 embedded variant로 마운트한다. field/studio mode, Scene 분류, 분류 설정, 분석, 파일 이동, 결과 및 export 기능은 변경하지 않는다.

### 파일 변환

현재 실제 지원 기능인 4K·고해상도 영상 → FHD MP4 변환만 노출한다. 기존 FFmpeg lazy import, folder picker, quality preset, progress, 결과 저장과 오류 처리를 재사용한다. 사진 resize나 임의 format conversion은 표시하지 않는다.

## Guide 구조

`GUIDES` config는 다음 key를 가진다.

- `select_ai`
- `select_manual`
- `select_client`
- `raw_match`
- `classification`
- `conversion`

각 항목은 icon, title, description을 가진 4개 step이다. `PhotoGuidePanel`이 vertical connector와 numbered step을 공통 렌더링한다. AI 셀렉에서만 mint TIP box를 표시한다.

## 스타일 및 접근성

- 기존 Pretendard/NanumSquare typography와 deep green, mint, white palette를 사용한다.
- 오렌지는 경고 또는 작은 강조에만 사용한다.
- 강한 파란색, 큰 hero, 무거운 그림자, 큰 illustration은 사용하지 않는다.
- 얇은 green-tinted hairline과 14~16px radius를 사용한다.
- 전환은 짧은 custom cubic-bezier를 사용하고 layout 크기를 애니메이션하지 않는다.
- 작업 카드와 탭은 button으로 구현한다.
- tab에는 `role=tab`, `aria-selected`, 연결된 panel id를 제공한다.
- `focus-visible`을 유지하고 disabled action은 실제 `disabled` 속성을 사용한다.

## 성능

- classification과 conversion은 mode별 dynamic import로 초기 bundle에서 제외한다.
- inactive heavy workspace는 숨겨 둔 채 유지하지 않고 unmount한다.
- 상수 tab/guide config는 module scope에 둔다.
- 단순 파생값은 별도 effect state로 복제하지 않는다.
- 기존 matcher 작업과 progress state는 원래 소유 컴포넌트가 계속 관리한다.

## 오류 처리

- File System Access API 미지원 안내는 기존 동작을 유지한다.
- 사용자가 folder picker를 취소한 경우 기존처럼 오류로 취급하지 않는다.
- matcher/classification/conversion 오류는 기존 작업 영역 안에 표시한다.
- AI semantic engine 미연결 상태는 비활성 또는 준비 안내로 표현하며 가짜 결과를 생성하지 않는다.

## 검증

- 기본 진입 시 사진 셀렉/AI 사진 셀렉 활성
- 4개 작업 mode 전환 및 mode별 guide 변경
- AI/직접/고객 하위 탭 전환
- query 직접 진입과 browser back/forward 복원
- 기존 query context 보존
- folder picker 정상 호출
- 기존 RAW filename/metadata matcher unit test
- classification 관련 기존 test 및 주요 UI flow
- 4K→FHD 설정, scan, FFmpeg lazy loading UI regression
- desktop/tablet/mobile responsive browser 확인
- keyboard tab, aria-selected, focus-visible 확인
- `npm run typecheck`
- `npm test`
- `npm run build`
- 가능하면 `npm run lint`

## 완료 조건

`/photo-sorting`에서 통합 제목, 네 작업 카드, 사진 셀렉의 세 하위 탭, 좌측 작업 영역, 우측 mode별 가이드가 표시되고 page reload 없이 전환된다. 기존 route와 business logic은 유지되며 최근 작업과 통계 카드는 없다.
