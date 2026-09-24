# 원격 사진 셀렉 → RAW 매칭 설계

작성일: 2026-09-24  
대상: `jakeimagelab/Olivia-agent`

## 목표

외부 컴퓨터나 모바일에서 JPG를 직접 보고 선택한 뒤, 선택된 파일명만 Olivia에 전달한다. Mac Studio 워커는 그 파일명과 같은 Workstation RAW를 찾아 Agentstation의 해당 프로젝트 아래 `Selected_RAW/`로 복사한다.

Workstation RAW 원본은 이동·삭제·이름 변경하지 않는다.

## 선택한 접근

기존 로컬 `사진 셀렉` UI와 기존 `PHOTO_RAW_MATCH` 워커 작업을 연결한다.

- 브라우저는 외부 기기에 있는 JPG만 읽고 썸네일과 선택 상태를 표시한다.
- JPG 파일 자체는 Olivia 서버나 Vercel로 업로드하지 않는다.
- 서버로 보내는 값은 선택된 원본 파일명, 선택한 NAS 프로젝트, 재실행 확인 여부뿐이다.
- RAW 탐색과 복사는 Mac Studio에서 기존 `runPhotoRawMatch()`로 수행한다.
- 결과 위치는 `Agentstation/<projectRelativePath>/Selected_RAW/`이다.

이 방식은 수천 장의 JPG를 Supabase Storage에 다시 올리는 서버 갤러리 방식보다 전송량과 Vercel CPU 사용량이 작고, 파일명 목록만 붙여넣는 방식보다 현재 셀렉 UX를 그대로 유지한다.

## 사용자 흐름

1. 사진작업실을 원격 실행 모드로 전환한다.
2. `사진 셀렉 > 직접 셀렉`을 연다.
3. 외부 기기의 JPG 폴더 또는 JPG 파일들을 선택한다.
4. 기존 썸네일 화면에서 필요한 사진을 선택한다.
5. Workstation의 촬영 프로젝트를 선택한다.
   - JPG 폴더명과 NAS 프로젝트가 정확히 하나 일치하면 자동 제안한다.
   - 없거나 여러 개면 원격 NAS 폴더 선택기를 표시하고 사용자가 확정한다.
6. 실행 전 선택 JPG 장수, NAS 프로젝트, Agentstation 목적지를 표시한다.
7. `RAW 매칭 시작`을 누르면 원격 작업을 생성한다.
8. 화면과 우측 상단 작업 상태에 진행률을 표시한다.
9. 완료 시 선택 장수, 매칭/누락 장수, 이미 복사된 장수, 원본 보존 검증 결과와 목적지를 보여준다.

## UI 구조

### 원격 모드 허용 범위

`PhotoWorkspace`의 원격 차단을 기능별로 바꾼다.

- 허용: `select`의 직접 셀렉, 고객 선택 불러오기, 그 결과의 RAW 매칭
- 기존 동작 유지: `classification`
- 이번 범위 밖: AI 사진 검색, 메타데이터 셀렉, 보정, 리사이즈의 원격 UI 전환

원격 모드에서 로컬 RAW 폴더를 고르게 하지 않는다. RAW 위치는 Workstation 프로젝트로 결정되고 실행은 워커가 담당한다.

### JPG 입력

- File System Access API 지원 환경: 기존 디렉터리 선택과 재귀 JPG 스캔을 유지한다.
- 미지원 환경(특히 iOS): `input[type=file][multiple]` 폴백을 제공한다.
- 폴백도 파일 내용은 브라우저에서 썸네일을 만드는 데만 사용하고 서버에는 업로드하지 않는다.
- 선택 키는 확장자를 포함한 원본 파일명으로 보관한다. RAW 매칭 시 기존 코드가 basename을 안전하게 정규화한다.

### NAS 프로젝트 선택

기존 `RemoteNasBrowser`/`PhotoSourcePicker`를 재사용한다. 선택값은 NAS Root 기준 안전한 상대경로만 서버에 전달한다. 절대경로는 브라우저 응답과 로그에 노출하지 않는다.

## 서버 경계

원격 셀렉 전용 API를 얇게 추가하고, 작업 생성 로직은 사진 작업 서비스로 공통화한다.

입력:

```ts
{
  projectRelativePath: string;
  selectedFileNames: string[];
  confirmRestart: boolean;
}
```

검증:

- 관리자 세션 필수
- 프로젝트 상대경로는 기존 `validatePhotoProjectRelativePath()` 사용
- 파일명은 기존 `safeFileNames()`와 동일한 규칙 사용
- 최대 10,000개
- 경로 구분자, NUL, 빈 파일명 거부
- 정확한 프로젝트를 `photo_storage_projects`에서 확인하거나 안전하게 생성
- 활성 작업이 있으면 중복 생성하지 않고 기존 작업 반환
- 완료/실패 작업 재실행은 기존 확인 규칙 유지

생성하는 잡:

```ts
{
  action: "PHOTO_RAW_MATCH",
  payload: {
    project_id: string,
    project_relative_path: string,
    selected_file_names: string[]
  }
}
```

## 워커와 파일 안전

기존 `photoRawMatch.ts`를 재사용한다.

- 입력 RAW: `OLIVIA_PHOTO_SOURCE_ROOT` = Workstation
- 출력: `OLIVIA_PHOTO_WORK_ROOT` = Agentstation
- 출력 폴더: `<project>/Selected_RAW`
- 복사는 `.olivia-part` 임시파일 → 크기 검증 → 원자적 rename 순서
- 같은 이름 결과가 이미 있으면 크기와 SHA-256이 일치할 때만 완료된 파일로 인정
- 다른 파일이면 전체 작업을 `REVIEW_REQUIRED`로 중단
- 중복 basename RAW가 있으면 임의 선택하지 않고 중단
- 완료 후 Workstation RAW의 경로·크기·수정시각 스냅샷이 같은지 검증

추가로 실행 전에 매칭 대상 RAW 전체 크기와 Agentstation 여유 공간을 비교한다. 공간이 부족하면 파일을 하나도 복사하기 전에 중단한다.

Agentstation에 프로젝트 폴더가 없을 경우에는 Work Root 내부인지 검증한 뒤 프로젝트 폴더와 `Selected_RAW`만 생성할 수 있다. Workstation 프로젝트는 반드시 이미 존재해야 한다.

## 상태 표시

기존 `remote_jobs`와 `PhotoStudioBackgroundJobBridge`를 재사용한다.

- `QUEUED`: RAW 매칭 대기 중
- `RUNNING`: 현재/전체 장수와 워커 메시지
- `COMPLETED`: 선택, 매칭, 누락, 기존 파일, 원본 보존 결과
- `FAILED`/`REVIEW_REQUIRED`: 중단 단계와 실제 오류

창을 닫아도 우측 상단 상태표시에서 계속 추적한다.

## 데이터 저장

원격 직접 셀렉은 선택 JPG 파일명을 `remote_jobs.payload.selected_file_names`에 저장한다. 기존 고객 포털 선택은 계속 `client_photo_selections`를 사용한다. 두 경로 모두 같은 `PHOTO_RAW_MATCH` 워커 작업으로 합쳐진다.

작업 완료 후 기존 워커 리포트 경로가 프로젝트 상태와 워크플로 `raw_matching → retouching` 자동 진행을 처리한다. 갤러리와 연결된 작업이면 기존 선택 제출 ID도 함께 유지한다.

## 실패 처리

- JPG가 0장: 실행 버튼 비활성
- NAS 프로젝트 미선택: 실행 버튼 비활성
- Worker 오프라인: 잡을 만들기 전에 안내
- RAW 누락: 찾은 RAW는 복사하고 누락 목록을 결과에 남김
- RAW basename 중복: 전체 중단, 후보 목록 표시
- Agentstation 공간 부족: 복사 전 전체 중단
- 네트워크가 끊겨도 생성된 잡은 서버/워커에서 계속 실행하고 재접속 후 상태 복구

## 변경하지 않는 것

- Workstation RAW 원본
- 사진 분류 상태 머신과 기존 잡 액션 이름
- 고객 포털 셀렉 제출 구조
- 로컬 직접 실행 모드
- 헤르메스/MCP 경로
- AI 사진 검색 구현

## 검증

1. 원격 모드에서 직접 셀렉 화면이 열린다.
2. 외부 JPG 폴더를 선택해 기존 썸네일 화면에서 여러 장을 고를 수 있다.
3. 선택 파일 자체가 서버로 업로드되지 않고 파일명만 요청에 포함된다.
4. NAS 프로젝트를 지정하면 `PHOTO_RAW_MATCH` 잡이 한 번만 생성된다.
5. Workstation RAW 원본의 경로·크기·수정시각이 작업 전후 동일하다.
6. 매칭 RAW만 Agentstation `<project>/Selected_RAW`에 복사된다.
7. 같은 작업을 다시 실행해도 동일 파일을 중복 복사하지 않는다.
8. 누락과 basename 중복이 정확히 보고된다.
9. Agentstation 공간 부족 시 부분 결과 없이 중단된다.
10. iOS 파일 입력 폴백에서도 선택 파일명이 유지된다.
11. 로컬 셀렉/RAW 매칭과 기존 고객 포털 셀렉이 깨지지 않는다.
12. typecheck, 관련 테스트, 전체 테스트, build가 통과한다.
