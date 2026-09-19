# Olivia 사진작업실 채팅 실행 PHASE 1 설계

작성일: 2026-09-20

## 범위

이번 단계는 기존 사진 파이프라인의 채팅 진입점만 추가한다. 새 파일 처리 엔진이나 세 번째 상태 머신을 만들지 않는다.

- 폴더 이름 검색
- SSD1 JPG 통합 시작
- JPG 통합부터 SSD2 복사와 기존 Scene 분류까지 이어지는 전체 작업 시작
- 기존 `nas_backup_start_sort`와 알림 버튼의 누락된 JPG 통합 → SSD2 복사 전이 수정

RAW 매칭, 리사이즈, AI 셀렉, 보정은 포함하지 않는다.

## 폴더 검색과 선택

`find_photo_folder`는 Mac Studio의 기존 `LIST_FOLDER` 경로를 사용해 Workstation 최상위 프로젝트 폴더를 부분 일치로 검색한다. 후보에는 다음 정보를 반환한다.

- 원본 상대경로와 표시용 이름
- 파일 수, JPG 수, RAW 수, 총용량
- 마지막 수정시각
- `photo_storage_projects`의 현재 상태 또는 `UNREGISTERED`

검색은 읽기 전용이다. 검색만으로 프로젝트 행이나 원격 작업을 만들지 않는다.

후보가 여러 개면 mutation을 실행하지 않고 후보를 반환한다. 시작 도구도 폴더 이름을 다시 확인해 정확한 후보가 하나가 아닐 경우 `AMBIGUOUS_FOLDER`로 중단한다. 모델이 임의로 후보를 고르는 우회 경로를 허용하지 않는다.

## BASELINE / SEEN_EXISTING 정책

Watcher의 local 상태가 `BASELINE` 또는 `SEEN_EXISTING`이고 서버에 프로젝트 행이 없는 옛날 폴더도 작업할 수 있다.

정책은 다음과 같다.

1. 조회만으로 행을 만들지 않는다.
2. 정확한 폴더가 하나로 확정되어야 한다.
3. 사용자가 작업을 명시적으로 요청한 시점에 `photo_storage_projects` 행을 생성한다.
4. 행은 서버 상태 머신의 최초 실행 상태로 생성하고, 검색에서 계산한 개수와 용량을 함께 저장한다.
5. 모호하거나 존재하지 않는 폴더에는 행과 job을 만들지 않는다.

이 정책은 옛날 폴더를 영구 차단하지 않으면서도 자동 등록으로 DB가 오염되는 것을 막는다.

## 채팅 도구

### `find_photo_folder`

부분 이름으로 폴더 후보를 찾는 읽기 전용 도구다. 장수, 용량, 수정일과 현재 파이프라인 상태를 반환한다.

### `start_photo_source_prep`

정확히 선택된 폴더의 기존 `PHOTO_PREPARE_SOURCE` 파이프라인만 승인한다.

- 프로젝트 행이 없으면 명시적 실행 시 생성한다.
- 상태는 `MERGE_APPROVED`로 전환한다.
- 완료 지점은 `MERGE_COMPLETED`다.
- SSD2 복사나 Scene 분류 승인을 기록하지 않는다.

### `start_photo_scene_sort`

사용자 한 번의 명시적 승인을 JPG 통합, SSD2 복사, Scene 분류 전체 workflow 승인으로 기록한다.

- 진료과와 촬영모드는 추측하지 않고 필수 입력으로 받는다.
- 프로젝트 행이 없으면 명시적 실행 시 생성한다.
- 통합이 필요하면 `MERGE_APPROVED`로 시작한다.
- 통합이 이미 끝났으면 `CLASSIFY_APPROVED`로 시작한다.
- 기존 `nas_backup_start_sort`와 같은 공통 helper를 사용한다.

각 도구는 한 프로젝트만 실행한다. 여러 폴더 요청은 모델이 도구를 폴더별로 호출하며, 한 건의 실패가 다른 건을 취소하지 않는다.

## 전체 파이프라인 전이

전체 분류 승인은 기존 `classify_approved_at`에 미리 기록한다. 별도 DB 컬럼이나 새 상태 머신을 추가하지 않는다.

```text
명시적 전체 분류 승인
→ MERGE_APPROVED
→ PHOTO_PREPARE_SOURCE
→ 통합 완료 처리기가 classify_approved_at 확인
→ CLASSIFY_APPROVED
→ PHOTO_STAGE_JPG
→ COPY_COMPLETED
→ 기존 claim_nas_classify_photo_project
→ PHOTO_CLASSIFY_WORK
→ CLASSIFY_COMPLETED
```

통합 완료 후 `classify_approved_at`이 없으면 기존처럼 `MERGE_COMPLETED`에서 멈춘다. 따라서 `start_photo_source_prep`는 전체 분류를 자동으로 시작하지 않는다.

## 채팅과 알림 버튼의 단일 경로

다음 세 진입점은 동일한 full-workflow helper를 사용한다.

- `start_photo_scene_sort`
- 기존 `nas_backup_start_sort`
- `BackupReadyNotifications`가 호출하는 `/api/worker/events/:id/start-classification`

진입점별로 상태를 직접 조립하지 않는다. 공통 helper가 폴더 검증, 기존 프로젝트 확인, 재실행 정책, 승인 시각과 분류 설정 저장을 담당한다.

## 재실행과 기존 상태

- 진행 중 또는 완료 상태는 새 job을 중복 생성하지 않는다.
- 이미 원본 통합이 끝난 폴더는 다시 통합하지 않고 다음 승인 상태로 전환한다.
- 이미 전체 분류가 완료된 폴더는 완료 사실을 반환한다.
- 실패 또는 `REVIEW_REQUIRED` 상태를 다시 실행하려면 명시적인 재시도 확인값이 필요하다.
- 목적지 충돌, RAW 보호, symlink, EXDEV, 용량 검사 등 기존 코드 안전장치는 그대로 유지한다.

## 모델 선택 규칙

사진 원본 분리, JPG 통합, Scene 분류, 폴더 검색 요청이 들어오면 새 사진 스토리지 도구가 Hermes 선택 목록에 포함된다.

- 부분 이름만 있으면 먼저 `find_photo_folder`
- 후보가 둘 이상이면 채팅에서 선택 요청
- Scene 분류는 진료과와 촬영모드가 없으면 질문
- 이미 처리된 상태면 현재 상태를 알리고 재실행 여부 확인
- 완료를 주장하기 전에 서버 프로젝트 상태를 확인

## 오류 처리

- NAS 또는 Worker가 오프라인이면 행이나 job을 만들지 않는다.
- 폴더가 없거나 모호하면 읽기 결과만 반환한다.
- 한 프로젝트 작업 실패가 다른 프로젝트 실행을 롤백하지 않는다.
- 원격 job은 기존 진행률과 알림 경로를 사용한다.
- 파일 작업 실패 시 기존 프로젝트 상태와 오류 필드가 source of truth다.

## 테스트

다음을 회귀 테스트로 고정한다.

1. 부분 이름 후보가 여러 개면 mutation 0건
2. 단일 후보는 장수, 용량, 수정일, 상태 반환
3. 행 없는 옛날 폴더는 조회만으로 행이 생기지 않음
4. 행 없는 옛날 폴더에 명시적 시작 시 행 1개만 생성
5. 원본 분리는 `MERGE_COMPLETED`에서 정지
6. 전체 분류 승인은 통합 완료 후 `CLASSIFY_APPROVED`로 전환
7. `nas_backup_start_sort`와 알림 API가 같은 helper와 전이를 사용
8. 이미 진행 중 또는 완료된 프로젝트에 중복 job 없음
9. 진료과 또는 촬영모드 누락 시 전체 분류 시작 금지
10. RAW 보호와 기존 사진 파이프라인 테스트 전체 통과

검증 명령은 `npm run typecheck`, `npm test`, `npm run build`다.
