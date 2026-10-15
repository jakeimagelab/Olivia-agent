# 사진작업실 JPG정리 및 탭 정리 설계

작성일: 2026-10-15

## 1. 목표와 범위

사진작업실의 상위 탭을 다음 7개로 정리한다.

1. 기획
2. JPG정리
3. 사진 셀렉
4. RAW 매칭
5. 사진 분류
6. 파일 정리
7. 사진 보정

JPG정리는 RAW와 JPG가 섞인 로컬 또는 Mac Studio 촬영 폴더에서 JPG/JPEG만 `JPG전체`로 모으는 기능이다. RAW는 개수만 확인하며 이동·복사·삭제하지 않는다. T컷 정리는 사진 셀렉의 네 번째 서브탭으로, 사진 리사이즈와 이름변경은 파일 정리의 두 서브탭으로 이동한다. 각 기존 기능의 내부 동작은 유지한다.

이 변경은 Supabase 스키마를 바꾸지 않는다. 원격 JPG정리는 현재 `photo_storage_projects` 상태 머신과 `PHOTO_PREPARE_SOURCE` 워커 액션을 재사용한다.

## 2. 불변 조건

- RAW 파일에는 쓰기 작업을 하지 않는다. RAW 핸들은 개수 계산 외에는 이동·복사·삭제 코드에 전달하지 않는다.
- `lib/photo-classifier/node/`, `lib/photo-classifier/file-move.ts`, `lib/photo-storage/executionVerdict.ts`를 수정하지 않는다.
- `PhotoSortingWorkspace.tsx`는 분리하지 않는다. 두 스캔 블록을 파일 내부 함수 하나로 합치는 변경만 한다.
- `PhotoTcutWorkspace`, `PhotoResizeWorkspace`, `PhotoRenameWorkspace` 내부 동작은 바꾸지 않는다. 폴더 선택 훅 도입은 요청된 picker 교체 범위로만 제한한다.
- 사진 분류 알고리즘과 정렬 순서를 바꾸지 않는다.
- 채팅 도구의 이름과 동작은 바꾸지 않는다.
- 작업실 UI는 `olivia-workspace-ui` 규칙을 따른다. 이미지 판단 화면은 `#2A2A2A` 중성 다크, 상위 탭은 알약형, 서브탭은 밑줄형, 채운 주 실행 버튼은 화면당 하나만 둔다.

## 3. 확장자 단일 소스

`lib/photo/extensions.ts`를 만들고 다음 세 상수를 선언한다.

- `RAW_PHOTO_EXTENSIONS`: `arw cr3 cr2 nef raf dng orf rw2`
- `CAMERA_JPG_EXTENSIONS`: `jpg jpeg`
- `SELECTABLE_IMAGE_EXTENSIONS`: `jpg jpeg heic heif tif tiff webp png`

`lib/photo-classifier/constants.ts`는 RAW와 JPG 상수를 새 파일에서 다시 내보낸다. 기존 `JPG_PHOTO_EXTENSIONS` 사용처의 호환성을 위해 이 이름은 `CAMERA_JPG_EXTENSIONS`의 별칭으로 re-export하되 별도 Set을 만들지 않는다. `PROFILE_EXCLUDED_SCENE_TYPES`는 그대로 둔다.

다음 생산 코드의 지역 확장자 Set을 제거한다.

- `lib/selectMatch/folderScanner.ts`
- `lib/photo-classifier/countJpgFiles.ts`
- `lib/selectMatch/nameParsing.ts`
- `app/(client-hub)/select-galleries/[id]/page.tsx`

사진 셀렉은 `SELECTABLE_IMAGE_EXTENSIONS`, JPG정리·사진 분류·RAW 매칭 계열은 `CAMERA_JPG_EXTENSIONS`와 `RAW_PHOTO_EXTENSIONS`를 사용한다. 테스트 안의 독립 fixture Set은 제품 확장자 선언 개수에서 제외한다.

## 4. 공용 폴더 선택 훅

`lib/photo/useFolderPicker.ts`에 `usePhotoFolderPicker()`를 만든다.

반환값:

- `supported`: File System Access API 지원 여부
- `pick(mode)`: `read` 또는 `readwrite` 폴더 선택
- `error`: 사용자가 취소한 경우를 제외한 오류 문구

`pick()`은 클릭 핸들러에서 첫 번째 await로 `showDirectoryPicker`를 호출한다. `AbortError`는 결과와 오류를 남기지 않고 종료하고, 다른 오류만 `error`에 남긴다.

적용 컴포넌트는 정확히 다섯 곳이다.

1. `AiPhotoSelectPanel.tsx`
2. `PhotoTcutWorkspace.tsx`
3. `PhotoResizeWorkspace.tsx`
4. `PhotoSortingWorkspace.tsx`
5. `PhotoJpgPrepWorkspace.tsx`

`PhotoSortingWorkspace.tsx`의 복원용 picker와 신규 폴더 picker 두 호출은 같은 훅 인스턴스를 사용한다. 작업실 밖 picker와 `SelectMatchWorkspace`, `MetadataSelectWorkspace`, 채팅 카드, 영상 분류는 수정하지 않는다.

## 5. 사진 분류 스캔 중복 제거

`PhotoSortingWorkspace.tsx` 안에 `splitRawAndJpg(dir)`를 둔다. 반환값은 다음을 모두 포함한다.

- `rawFiles`: 이름과 파일 핸들
- `jpgFiles`: 이름, 파일 핸들, 수정시각, 파일 크기

병원 현장촬영과 스튜디오 프로필촬영의 기존 스캔 블록 두 곳만 이 함수를 호출한다. 각 `setFieldRawCount`, `setFieldRawHandles`, `setStudioRawCount` 호출 위치와 실행 시점은 유지한다. 스튜디오 JPG의 `mtime` 오름차순 정렬도 기존 위치에서 그대로 수행한다.

## 6. 상위 탭과 서브탭

### 6.1 타입과 URL

정규 상위 모드는 `plan | jpg-prep | select | raw-match | classification | file-ops | retouch`로 한다.

사진 셀렉 서브모드는 `ai | manual | client | tcut`, 파일 정리 서브모드는 `resize | rename`으로 한다. URL은 각각 `selectMode`와 `fileMode`에 동기화한다.

기존 URL은 화면을 비우지 않고 다음 정규 URL로 `replace`한다.

- `?mode=t-cut` 또는 `?tool=t-cut`, `?tool=ai-cull` → `?mode=select&selectMode=tcut`
- `?mode=resize` 또는 `?tool=resize` → `?mode=file-ops&fileMode=resize`
- `?mode=rename` 또는 `?tool=rename` → `?mode=file-ops&fileMode=rename`

브라우저 뒤로가기에서 중복 기록이 생기지 않도록 호환 정규화에는 `router.replace`를 사용한다.

### 6.2 사진 셀렉

`PhotoSelectWorkspace`의 네 번째 밑줄형 서브탭에 `T컷 정리`와 Lucide `Scissors`를 추가하고 기존 `PhotoTcutWorkspace`를 그대로 렌더한다. 로컬 현재 작업 폴더를 `rootDir`로 전달한다.

원격 모드에서 기존 T컷 제한을 유지한다. T컷 서브탭을 선택한 경우 원격 미지원 안내를 표시하고, 기존 원격 사진 셀렉 화면은 나머지 세 서브탭에서만 사용한다.

가이드 키 `t_cut`은 `select_tcut`으로 바꾸고 내용은 유지한다.

### 6.3 파일 정리

`PhotoFileOpsWorkspace.tsx`는 `SegmentedTabs`로 `사진 리사이즈`와 `이름변경`을 선택하고 기존 컴포넌트를 그대로 렌더하는 껍데기다. 해당 서브탭에 맞춰 기존 `resize` 또는 `rename` 가이드를 선택한다.

### 6.4 작업실 연결

`PhotoWorkspaceTabs`, `PhotoWorkspace`, `photoWorkspaceToolState`, `workspaceGroups`, 링크 생성기의 기존 진입점을 새 구조에 맞춘다. 검색어와 Olivia 명령의 `T컷 정리`, `사진 리사이즈`, `이름변경`은 각각 정확한 새 서브탭으로 연결한다.

## 7. JPG정리 로컬 설계

`components/photo-workspace/PhotoJpgPrepWorkspace.tsx`는 `WorkspaceSurface.module.css`의 이름변경형 뼈대를 사용한다.

### 7.1 화면 구조

- 헤더: 아이콘, `JPG정리`, `RAW는 그대로 두고 JPG만 모읍니다`, 현재 작업 폴더 chip
- 좌측 controls:
  1. 혼합 폴더 선택
  2. 하위 폴더 처리와 상대경로 유지 옵션(둘 다 기본 켬)
- 우측 preview:
  3. `옮김 / 건너뜀 / RAW 그대로 / 충돌` 숫자 타일과 파일명·목적지·상태 표
- 하단 actions: 좌측 상태 한 줄, 우측 `미리보기` 보조 버튼과 `JPG정리 실행` 주 실행 버튼
- 완료 후 `사진 셀렉으로 이동`을 제공한다.

가이드 `jpg_prep`은 `폴더 선택 / JPG·RAW 확인 / JPG정리 실행 / 사진 셀렉으로` 네 단계로 만든다.

### 7.2 미리보기

미리보기는 파일을 변경하지 않는 dry-run이다. 선택한 폴더에서 최대 깊이 5까지 순회하며 대상 `JPG전체` 하위는 다시 탐색하지 않는다.

- RAW: `RAW_PHOTO_EXTENSIONS`로 세기만 한다.
- JPG: `CAMERA_JPG_EXTENSIONS`로 이동 계획을 만든다.
- 그 밖의 파일: 결과에서 제외한다.
- 상대경로 유지가 켜져 있으면 `JPG전체/<원래 상대경로>`를 목적지로 한다.
- 꺼져 있으면 `JPG전체/<파일명>`으로 평면화한다.
- 목적지 파일의 크기와 수정시각이 원본과 모두 같으면 `건너뜀`이다.
- 둘 중 하나라도 다르면 `충돌`이며 실행 대상에서 제외한다.
- 목적지가 없으면 `이동 예정`이다.

### 7.3 실행과 안전성

목적지 폴더명은 `JPG_INTEGRATED_DIRECTORY`를 import해서 사용한다. 문자열 `JPG전체`를 새 컴포넌트 안에 선언하지 않는다.

각 JPG는 `moveFileFast`로 이동한다.

- `native-move`: 완료로 기록한다.
- `copy-delete`: 현재 helper가 복사까지만 수행하므로, 새 워크스페이스가 목적지 파일의 크기를 확인한 뒤 원본 JPG의 부모 디렉터리에서 해당 JPG만 삭제한다.
- 원본 JPG 삭제가 실패하면 방금 만든 목적지 복사본을 제거해 rollback하고 오류로 멈춘다.
- 소스 항목에는 확장자 판정이 끝난 JPG만 들어가므로 RAW 핸들은 `moveFileFast`와 `removeEntry`에 전달될 수 없다.

같은 파일 재실행은 건너뛰고, 다른 파일 충돌은 이동하지 않는다. 실행 전 충돌이 하나라도 있어도 충돌이 아닌 이동 예정 행은 실행할 수 있으며, 충돌 행은 결과표에 남긴다.

완료 후 생성된 `JPG전체` 디렉터리 핸들을 `PhotoStudioExecutionContext.currentLocalFolder`에 저장하고 `사진 셀렉 › 직접 셀렉`으로 이동한다. 이 핸들은 직렬화하지 않고 현재 작업실 세션에서만 유지한다.

## 8. JPG정리 원격 설계

원격 모드에서는 로컬 File System picker 대신 기존 `PhotoSourcePicker`로 NAS 상대경로를 고른다.

브라우저에서 직접 `PHOTO_PREPARE_SOURCE`를 만들려면 등록된 `project_id`가 필요하므로, 최소 어댑터 API `app/api/photo-operations/source-prep/route.ts`를 추가한다. 이 라우트는 관리자 세션을 확인하고 선택 경로를 기존 `startPhotoSourcePreparation`에 전달한다. 신규 또는 기존 `photo_storage_projects` 행은 기존 함수가 처리한다.

이후 Mac Studio의 기존 claim 흐름이 `PHOTO_PREPARE_SOURCE`를 생성한다. Worker runner와 `sourceProjectPrep.ts`는 수정하지 않는다. 진행 상황은 기존 원격 작업 상태 표시줄과 프로젝트 상태를 사용하며, 재실행 확인이 필요한 기존 상태는 기존 오류 코드와 문구를 그대로 화면에 올린다.

원격 미리보기는 NAS 폴더 선택 결과만 표시하고 파일 이동 dry-run을 브라우저에서 재구현하지 않는다. 실제 RAW/JPG 확인과 충돌 판정은 기존 Worker가 수행한다.

## 9. 오류 처리

- 폴더 선택 취소: 조용히 종료
- 브라우저 미지원: `Chrome 또는 Edge에서 작업 폴더를 선택할 수 있습니다.`
- 권한·스캔 실패: 원본 오류 문구를 작업 상태에 표시
- 목적지 충돌: 파일별 이유 표시, 해당 파일 미이동
- 이동 중 오류: 완료된 행과 실패 지점을 유지하고 재실행 가능
- 원격 Worker 실패: 기존 Worker 오류 메시지를 그대로 표시
- RAW 변경 시도: 타입과 확장자 guard로 실행 경로에 진입하지 못하게 하고 테스트로 보장

## 10. 테스트와 검증

단위 테스트:

- 세 확장자 Set의 정확한 값과 re-export 동일성
- 폴더 picker의 지원 여부, 취소 무시, 오류 전달
- `splitRawAndJpg` 두 호출과 JPG 정렬 유지
- 기존 tool/mode URL의 새 상위·서브탭 매핑
- JPG정리 dry-run의 최대 깊이, 대상 폴더 제외, 상대경로 유지/평면화
- 동일 파일 건너뜀, 크기/mtime 충돌, JPG만 이동, RAW untouched
- remote source-prep API가 기존 상태 머신을 통해 `PHOTO_PREPARE_SOURCE` 경로를 사용함

브라우저 검증:

- 1280px 이상: 7개 상위 탭, JPG정리 2열, 가이드, 버튼 역할
- 760px: 상위 탭 스크롤/아이콘, 작업 패널 세로 배치, 가이드 접기
- 사진 셀렉 T컷 서브탭과 파일 정리 두 서브탭
- 기존 URL 세 종류의 정규화
- 완료 후 JPG전체 핸드오프와 사진 셀렉 진입

검증 명령:

- `npm run typecheck`
- 변경 파일 ESLint
- 관련 Vitest
- `npx vitest run`

## 11. 완료 보고

요청서 6장의 모든 항목을 실제 경로·상수명·호출 개수·탭 개수로 채운다. 별도로 수정 파일 목록을 `git diff` 기준으로 대조해 금지된 파일 수정이 0개인지 보고한다. RAW 이동·복사·삭제 호출은 새 탭 코드에서 0개여야 한다.
