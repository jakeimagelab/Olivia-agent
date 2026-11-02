# 브릿지 ↔ 개인별 사진 셀렉 연동 설계

작성일: 2026-11-02

## 목표

개인별 사진 셀렉에서 고객이 고른 JPG 파일명을 Olivia Bridge로 불러와 현재 폴더의 사진을 선택 상태로 표시하고, 기존 `selectedJpgNames` 통로를 통해 사진작업실 RAW 매칭으로 그대로 넘긴다. 동시에 Bridge의 원격 폴더 선택과 썸네일·Adobe 별점 읽기가 개인별 셀렉과 동일한 다중 허용 루트를 사용하게 한다.

## 범위와 순서

1. 다중 디스크 경로 지원
   - `lib/person-select/sourceRoots.ts`에 사진 작업 러너용 `resolvePhotoWorkPath`를 추가한다.
   - `root-N/...` 경로는 기존 `resolvePersonSelectSourcePath`를 사용한다.
   - 그 밖의 경로는 기존 `SOURCE_ROOT` 또는 `OLIVIA_PHOTO_SOURCE_ROOT` 기준으로 해석한다.
   - 두 경우 모두 `lstat`, `realpath`, 루트 내부 검사와 기존 사용자용 오류 문구를 유지한다.
   - 썸네일과 XMP 별점 러너만 공용 해석기로 전환한다.
   - Bridge의 `PhotoSourcePicker`에 `sourceScope="person-select"`를 전달하고 화면 경로는 `selection.displayPath`를 사용한다.

2. 선택 파일명 읽기 API
   - 기존 관리자 인증과 행사 export 라우트 안에 `selected` JSON 응답을 추가한다.
   - `fileNames`는 중복 없는 파일명 목록, `rows`는 사람·그룹·항목·상대 경로를 포함한다.
   - 기존 `pins`, `orders`, `retouch` 응답은 변경하지 않는다.

3. Bridge 불러오기 UI
   - 기존 하단 도구 줄에 `Users` 아이콘의 `고객 선택 불러오기` 보조 동작을 추가한다.
   - 폴더가 열리지 않았으면 비활성 상태와 이유를 표시한다.
   - 행사 목록은 기존 `GET /api/person-select`에서 읽고 최근 순서의 가로 목록 행으로 표시한다.
   - 행사 선택 시 `GET /api/person-select/<eventId>/exports/selected`를 호출한다.
   - 수동 선택이 있으면 덮어쓰기 확인을 거친다.
   - 받은 파일명을 `setSelectedJpgNames`에 넣고, 현재 폴더에서 찾은 수와 못 찾은 파일명 목록을 별도 결과 상태로 표시한다.
   - 기존 `commitSelectedIds`, 선택 동기화 효과, 별점 상태와 RAW 매칭 로직은 변경하지 않는다.

## 오류와 보안

- 절대 경로는 UI와 API에 노출하지 않는다. 가상 경로와 `displayPath`만 사용한다.
- `..`, 심볼릭 링크, 허용 루트 밖의 realpath는 계속 거부한다.
- 분리되거나 권한이 없는 드라이브는 기존 사용자용 문구로 안내한다.
- 행사 목록·선택 목록 요청 실패는 선택 대화상자 안에 남겨 재시도할 수 있게 한다.
- 못 찾은 파일명은 버리지 않고 결과 목록으로 보여준다.

## UI 원칙

- 기존 Bridge의 밝은 세이지 토큰과 하단 도구 모양을 재사용한다.
- 새 채운 주 실행 버튼을 만들지 않는다. `고객 선택 불러오기`는 보조 동작이다.
- 행사 선택은 카드 그리드 대신 가로 목록 행을 사용한다.
- 새 작업실 탭이나 세 번째 탭 모양을 만들지 않는다.

## 검증

- 경로 해석: legacy `SOURCE_ROOT`, `root-N`, traversal, symlink, 분리된 드라이브 오류를 테스트한다.
- 러너: 다중 루트의 `JPG전체` 썸네일과 XMP 별점 경로를 테스트한다.
- export: 관리자 인증, 중복 제거, rows 구성, 기존 종류 보존을 테스트한다.
- Bridge: 폴더 없을 때 비활성, 기존 선택 확인, 찾음/못 찾음 계산, `selectedJpgNames` 전달을 테스트한다.
- `npm run typecheck`와 관련 Vitest를 실행한다.
- 화면 확인 환경이 되면 넓은 폭과 좁은 폭에서 대화상자와 결과 상태를 확인한다.

## 배포

- 코드를 `main`에 커밋·푸시한다.
- Mac Studio에서 `/Volumes`의 실제 마운트 이름을 확인한다.
- `nano`로 `~/OliviaWorker/config/worker.env`의 `OLIVIA_PERSON_SELECT_ROOTS`에 Agentstation 루트를 추가한다.
- Mac Studio 저장소에서 `git pull --ff-only origin main` 후 `./ops/mac-studio/install-worker-bin.sh --restart`를 실행한다.
