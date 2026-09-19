# NAS 감지기 단일화 — 비교 판단 문서 (작업 D)

코드 요청서(2026-09-18) 작업 D. `scripts/photo-storage-watcher.ts`와
`scripts/nas-backup-watcher.ts`를 비교하고, 어느 쪽을 유지할지 · 무엇을 이관할지 정한다.

## 1. 두 스크립트의 실제 구조

두 스크립트는 이미 같은 엔진(`lib/photo-classifier/node/photoWatcher.ts`의
`PhotoStorageWatcher`)을 감지 로직으로 공유한다 — 새로 만든 게 아니라 "다른 report 대상"으로
재사용만 다르게 한 것이다(`nas-backup-watcher.ts` 상단 주석에 이미 명시돼 있음).

| | photo-storage-watcher.ts (`photo:watch`) | nas-backup-watcher.ts (`nas:watch`) |
|---|---|---|
| 감지 엔진 | PhotoStorageWatcher (동일) | PhotoStorageWatcher (동일) |
| report 대상 | `photo_storage_projects` (DB row 직접 upsert) | `worker_events` (BACKUP_READY 카드) |
| 알림 UI | `PhotoProjectNotification.tsx` — 프로젝트 리스트 + 2단계 승인 | `BackupReadyNotifications.tsx` — 작은 토스트 카드 |
| "분류 시작" 클릭 시 | 승인 상태(MERGE_APPROVED→...→CLASSIFY_APPROVED)를 거쳐 PHASE 6 파이프라인(`PHOTO_PREPARE_SOURCE`→`PHOTO_STAGE_JPG`→`PHOTO_CLASSIFY_WORK`) 실행 → **씬별분류/** 구조 | `/photo-sorting?mode=classification`으로 딥링크 → 레거시 수동 화면의 "AI 자동 분류 시작" → 단일 `PHOTO_SORT` job → **구식 RAW/JPG/SELECT** 구조 |
| department/shooting_mode | 화면에서 사람이 입력(레거시 화면과 동일 패턴) | `nas_backup_start_sort` 도구는 이미 필수값으로 요구(추측 금지, 건드리지 말 것 목록) — 하지만 실제로 이 값이 쓰이는 곳은 여전히 구식 `PHOTO_SORT` |
| state/lock 파일 | 기본값(`OLIVIA_PHOTO_WATCH_STATE_PATH` 또는 기본 경로) | `.olivia/nas-watcher-state.json` (분리돼 있어 서로 baseline을 덮어쓰지 않음) |

둘 다 **같은 NAS root**를 감시하도록 운영되고 있어(요청서 전제), 같은 폴더가 두 번 감지되어
카드가 중복으로 뜨고, "분류 시작"을 눌렀을 때 나오는 산출물 구조도 어느 알림을 눌렀는지에 따라
달라지는 것이 현재 문제다.

## 2. 결정 — nas-backup-watcher + worker_events를 유지

요청서의 기본 방향대로 **`nas-backup-watcher.ts`/`worker_events`/`BackupReadyNotifications.tsx`를
유일한 감지·알림 경로로 유지**한다. `photo-storage-watcher.ts`는 `package.json`에서 실행
스크립트(`photo:watch`)만 제거한다(파일은 남겨 롤백 가능하게 함).

**이유**: 감지 엔진 자체는 이미 동일하므로 "잃는" 감지 능력이 없다. NAS 백업처럼 사람이
관여하지 않는 백그라운드 이벤트에는 `BackupReadyNotifications.tsx`의 작은 토스트 카드가
`PhotoProjectNotification.tsx`의 풀 프로젝트 리스트 UI보다 적합하다(§10 "너무 큰 모달 금지"
원칙과도 맞음). 반대로 유지하면(photo-storage-watcher 유지) 알림 UI를 새로 설계해야 하고,
기존에 잘 동작하는 `worker_events` 스키마·인증·중복방지(event_key) 구현을 버리게 된다.

## 3. "분류 시작"을 PHASE 6로 연결하는 방법

PHASE 6 파이프라인은 `photo_storage_projects.status`를 3개의 Postgres RPC
(`claim_merge_approved_photo_project` → `claim_approved_photo_project` →
`claim_copy_completed_photo_project`)가 순서대로 claim해서 `remote_jobs`에
`PHOTO_PREPARE_SOURCE`→`PHOTO_STAGE_JPG`→`PHOTO_CLASSIFY_WORK`를 큐잉하는 구조다(모두
`app/api/worker/next/route.ts`에서 폴링마다 호출). **이 RPC들과 실행 스크립트
(`photoClassifyWork.ts` 등 §PHASE 6 안전장치)는 건드리지 않는다.**

문제 하나를 발견했다: `claim_copy_completed_photo_project`는 `PHOTO_CLASSIFY_WORK`의
department/shooting_mode를 `'dermatology'`/`'field'`로 **하드코딩**하고 있고(스키마에도 해당
컬럼이 없음), `OLIVIA_ENABLE_PHOTO_CLASSIFICATION_AUTOMATION=1`일 때만 동작한다. 이건 기존
카메라 임포트 경로의 기존 동작이라 그대로 둔다(요청 범위 밖) — 대신 NAS 경로 전용으로 별도
컬럼 + 별도 RPC를 추가해서 "절대 추측하지 않는다" 요구를 만족시킨다:

- `photo_storage_projects`에 `nas_department`, `nas_shooting_mode` 컬럼 추가(nullable, 추가적 —
  기존 row/경로에는 영향 없음).
- 새 RPC `claim_nas_classify_photo_project`: `claim_copy_completed_photo_project`와 같은 모양이지만
  (a) `nas_department is not null`인 row만 대상으로 하고 (b) 하드코딩 대신 그 컬럼값을 그대로 쓰며
  (c) automation 플래그와 무관하게 항상 동작한다(NAS 분류는 이미 사람이 "분류 시작"을 눌러야
  발생하는 명시적 승인이라 별도 플래그가 필요 없음). 기존 `claim_copy_completed_photo_project`는
  1바이트도 수정하지 않는다.
- 공용 헬�퍼(`lib/photo-storage/nasClassifyHandoff.ts`)가 `photo_storage_projects` row를
  `status: 'MERGE_APPROVED'` + `nas_department`/`nas_shooting_mode`로 upsert한다 — 이후는 기존
  MERGE→COPY→CLASSIFY 체인이 그대로(무수정) 진행한다.

**두 진입점 모두** 이 헬퍼로 연결한다:
1. `nas_backup_start_sort`(Hermes 도구, `lib/olivia/v2/toolExecutors/nasBackup.ts`) — 기존
   "department/shootingMode 필수, 추측 금지" 가드는 그대로 두고, 가드 통과 후 호출하는 함수만
   `createRemotePhotoSortJob`(구식 PHOTO_SORT)에서 새 헬퍼로 교체한다.
2. 알림 카드의 "[분류 시작]" 버튼(`BackupReadyNotifications.tsx`) — 현재는
   `/photo-sorting?mode=classification`으로 딥링크해서 레거시 수동 화면(3000줄 이상, 자체 로컬
   AI 씬분석/체크포인트/품질분석을 갖춘 완전히 별개의 도구)의 "AI 자동 분류 시작" 버튼을 사람이
   누르게 하는 구조다. 그 화면 자체(`PhotoSortingWorkspace.tsx`)는 이번 작업 범위가 아니다(건드리지
   않음, 위험도 대비 이득이 낮음). 대신 카드에 department/shootingMode 인라인 선택 UI를 작게
   추가하고, 새 경량 API(`POST /api/worker/events/[id]/start-classification`)로 같은 헬퍼를
   직접 호출하도록 바꾼다 — "새 분류 엔진을 만들지 말 것"은 여전히 지킨다(PHASE 6는 이미 존재하는
   엔진, 새로 만드는 게 아니라 올바른 기존 엔진으로 연결을 바꾸는 것).

## 4. 이중 실행 경고

`nas-backup-watcher.ts` 시작 시 + 매 스캔마다, `photo-storage-watcher.ts`의 기본 lock 파일
경로(`OLIVIA_PHOTO_WATCH_STATE_PATH` 또는 기본 경로 + `.lock`) 존재 여부를 확인해서 있으면
`console.warn`으로 남긴다. 차단은 하지 않는다(요청서: "경고 로그"만 요구).

## 5. 범위 밖으로 남기는 것 (명시적 보류)

- `PhotoSortingWorkspace.tsx`의 로컬 AI 처리 파이프라인(수동으로 폴더를 골라 들어가는 기존
  경로) — 이번 요청은 "두 NAS 감지기의 중복" 문제이지, 수동 화면의 분류 엔진 교체가 아니다.
- `claim_copy_completed_photo_project`(카메라 임포트 경로)의 department/shooting_mode 하드코딩 —
  기존 동작 그대로 유지, 이번 변경과 무관.
