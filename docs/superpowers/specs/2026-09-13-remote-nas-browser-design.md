# Olivia Remote NAS Browser 설계

## 목적

Olivia OS에서 Mac Studio에 연결된 NAS `Workstation(M.2SSD)`의 폴더와 파일 메타데이터를 읽기 전용으로 탐색하고, 이후 원격 사진 작업에 사용할 폴더의 상대 경로를 선택할 수 있게 한다.

이번 단계는 UI/UX와 데이터 연결 경계를 완성하는 작업이다. 실제 Mac Studio `LIST_FOLDER` 호출, 파일 다운로드, 업로드, 변경 작업은 구현하지 않는다.

## 범위

- 공통 반응형 `RemoteNasBrowser` 컴포넌트
- Mock 기반 비동기 폴더 조회 계층
- `/remote-files` 독립 테스트 페이지
- NAS Root 이탈을 차단하는 상대 경로 유틸리티
- macOS SMB의 NFD 이름을 NFC로 표시하는 경로 모델
- 향후 `LIST_FOLDER` 공급자로 교체 가능한 인터페이스
- 경로와 표시 이름 유틸리티 단위 테스트

기존 `PhotoSortingWorkspace`의 `showDirectoryPicker`, `FileSystemDirectoryHandle`, `rootDir` 흐름은 변경하지 않는다.

## 선택한 접근

UI와 데이터 조회를 공급자 인터페이스로 분리한다.

```text
/remote-files
    └─ RemoteNasBrowser
         ├─ navigation/search/selection state
         └─ RemoteNasDataSource.listFolder(relativePath)
              ├─ MockRemoteNasDataSource (이번 구현)
              └─ WorkerRemoteNasDataSource (후속 구현)
```

Mock 데이터를 컴포넌트 안에 넣지 않는다. 실제 Worker 연결 시 브라우저 UI와 상호작용 코드는 유지하고 공급자만 교체한다.

## 데이터 모델

### 항목

각 NAS 항목은 다음 값을 갖는다.

- `kind`: `directory` 또는 `file`
- `name`: Mac Studio가 반환한 원본 이름
- `path`: Root 기준 원본 상대 경로
- `displayName`: `name.normalize("NFC")` 결과
- `displayPath`: 각 경로 segment를 NFC로 정규화한 표시 경로
- `size`: 파일 크기. 폴더는 `null`
- `modifiedAt`: 선택적 ISO 날짜 문자열
- `mimeType`: 선택적 파일 MIME type

서버로 돌려보낼 선택값은 `path`이며, 화면에는 `displayName`과 `displayPath`만 표시한다. 따라서 NFD 경로를 보존하면서 한글을 정상적으로 보여줄 수 있다.

### 폴더 조회 결과

- `rootName`: `Workstation(M.2SSD)`
- `path`: 현재 원본 상대 경로
- `displayPath`: 현재 표시 경로
- `entries`: 현재 폴더의 직계 항목
- `connection`: Mac Studio와 NAS의 표시 상태
- `readOnly`: 항상 `true`

## 경로 보안

브라우저와 공급자 경계에서 다음 규칙을 적용한다.

- 절대 경로를 받지 않는다.
- 빈 문자열은 NAS Root를 뜻한다.
- `.` 및 `..` segment를 거부한다.
- 역슬래시와 NUL 문자를 거부한다.
- 중복 `/`와 뒤쪽 `/`를 정규화하며, 절대경로로 해석될 수 있는 앞쪽 `/`는 거부한다.
- Mock 트리에 없는 폴더는 오류로 처리한다.
- UI에는 `/Volumes/Workstation(M.2SSD)` 절대 경로를 노출하거나 전달하지 않는다.

실제 Worker 공급자도 검증된 상대 경로만 `LIST_FOLDER` payload에 넣어야 한다. Worker의 고정 `SOURCE_ROOT`가 최종 방어선이고, Web 앱 검증은 조기 차단을 담당한다.

## UI 구조

### Header

- Olivia Remote Files
- NAS 이름 `Workstation(M.2SSD)`
- Mac Studio Online 상태
- NAS Connected 상태
- 읽기 전용 badge
- Mobile에서는 명확한 뒤로가기/닫기 버튼

상태는 이번 Mock 단계에서 `mock/online/connected`로 표시하며 실제 연결 성공처럼 오해하지 않도록 테스트 데이터임을 접근 가능한 설명에 포함한다.

### Navigation

- Root부터 현재 위치까지 Breadcrumb
- 현재 폴더가 Root가 아니면 상위 폴더 버튼 활성화
- Breadcrumb는 좁은 화면에서 가로 스크롤
- 폴더 행을 클릭하거나 Enter 키로 하위 폴더 이동
- 검색은 현재 폴더의 항목만 필터링
- 검색은 NFC 정규화 후 대소문자 구분 없이 수행

### 목록

Desktop/Tablet 컬럼:

- 이름
- 종류
- 크기
- 수정일

폴더를 먼저, 파일을 다음에 두고 각각 이름순으로 정렬한다. 파일 크기는 사람이 읽기 쉬운 단위로 표시한다.

Mobile에서는 파일명을 첫 줄에, 종류·크기·수정일을 두 번째 줄에 배치한다. 행 전체가 최소 56px 이상의 터치 영역이 된다.

### Footer

- 현재 검색 결과 항목 수와 전체 항목 수
- 읽기 전용 상태
- 취소
- 이 폴더 선택

`이 폴더 선택`은 현재 보고 있는 폴더의 원본 상대 경로를 `onSelect(path)`로 반환한다. Root 선택 시 반환값은 빈 문자열이다.

## 반응형 동작

### Desktop / MacBook

- 페이지 중앙의 약 1040px Finder형 패널
- 최대 높이를 viewport에 맞추고 목록만 내부 스크롤
- 모든 메타데이터 컬럼 노출

### Tablet / iPad

- 안전 영역을 제외한 화면 대부분 사용
- 버튼과 행을 최소 48~56px로 확대
- Breadcrumb 가로 스크롤
- Footer는 패널 하단에 유지

### Mobile / iPhone

- `100dvh` 전체 화면
- 외곽 radius와 장식용 shadow 제거
- 파일 정보는 2줄 행
- 하단 선택 영역은 safe area를 포함해 고정
- 목록만 스크롤하고 Header/Footer는 유지

## 상태와 오류 처리

- `loading`: 기존 목록을 비우지 않고 상단에 진행 상태 표시
- `empty`: 검색 결과 없음과 빈 폴더를 구분
- `error`: 읽기 실패 메시지와 다시 시도 버튼
- `disconnected`: 목록을 임의로 성공 처리하지 않고 상태 badge와 오류 안내
- 오래된 비동기 응답이 새 경로 결과를 덮지 않도록 요청 sequence를 비교

Mock 단계에서도 공급자 메서드는 `Promise`를 반환해 실제 네트워크 지연과 같은 상태 흐름을 검증한다.

## Mock 데이터

Root에는 다음 폴더를 제공한다.

- `0623_라셀의원`
- `0702_페이버요양병원`
- `0714_브랜딩더코어`
- `0811_세무사회`
- `0819_진보형교수님`
- `0825_제주관광공사`
- `0907_더힐피부과`
- `0911_WINF`
- `AI`

`0819_진보형교수님`에는 `RAW`, `JPG`, `SELECT`, `REPORT` 폴더와 테스트용 JPG/CR2 메타데이터를 둔다. Binary 파일이나 preview 이미지는 포함하지 않는다.

## 향후 LIST_FOLDER 연결

후속 구현에서 `lib/remote-nas/remoteNasDataSource.ts`의 `RemoteNasDataSource` 계약을 구현하는 Worker 공급자를 추가한다.

예상 흐름:

```text
RemoteNasBrowser
  → app/api/remote-files/list (관리자 세션 검증)
  → remote job action: LIST_FOLDER
  → Mac Studio Worker
  → SOURCE_ROOT 아래 항목만 반환
  → API가 응답 schema/path 재검증
  → RemoteNasFolderResult
```

이번 단계에서는 이 API route와 원격 job을 만들지 않는다. 기존 untracked 원격 작업 초안도 수정하지 않는다.

## 사진분류 후속 연동

향후 `PhotoSortingWorkspace`에 폴더 source mode가 추가될 때만 다음처럼 분기한다.

```text
LOCAL_DIRECT
  → 현재 rootDir / showDirectoryPicker 흐름

REMOTE_WORKER
  → RemoteNasBrowser onSelect(path)
  → remotePath state
  → Worker 작업 요청
```

`FileSystemDirectoryHandle`과 `remotePath`를 같은 타입이나 상태에 섞지 않는다. 이번 구현에서는 `PhotoSortingWorkspace`를 수정하지 않는다.

## 접근성

- 모든 버튼에 명확한 한국어 accessible name 제공
- 폴더 탐색을 버튼 기반으로 구현해 키보드 Enter/Space 지원
- 현재 Breadcrumb에 `aria-current="page"` 적용
- 연결 상태는 색상만으로 구분하지 않고 텍스트 병기
- focus-visible outline 유지
- icon은 장식용이면 `aria-hidden`

## 테스트

### 단위 테스트

- 상대 경로 정규화
- `..`, 절대 경로, 역슬래시, NUL 거부
- NFD 원본 이름 보존과 NFC 표시 변환
- Mock Root 및 하위 폴더 조회
- 폴더 우선 정렬

### 정적 검증

- `npm run typecheck`
- 대상 파일 ESLint
- `npm run build`
- `git diff --check`

### 브라우저 검증

- Desktop 1440px
- Tablet 1024px
- Mobile 390px
- Root → `0819_진보형교수님` → `JPG` 탐색
- 검색, 상위 이동, Breadcrumb 이동, 폴더 선택
- 모바일에서 목록과 고정 Footer가 겹치지 않는지 확인

## 비범위

- Worker `LIST_FOLDER` 실제 호출
- NAS 파일 binary 전송 및 preview
- 다운로드, 업로드, 삭제, 이동, 이름 변경
- 사진분류 source mode UI
- Desktop/Mobile/Tablet Olivia Shell 변경
- 기존 원격 작업 API나 DB schema 변경
