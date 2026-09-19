# 상단바 상태표시 팝업 — 설계

작성일: 2026-09-19. 데스크탑 top bar(`OliviaDesktop`) 오른쪽에 시스템 상태를 한눈에 보는 팝업
버튼을 추가한다.

## 배경

지금 상단바 오른쪽(`DesktopTopBar.tsx`의 `topBarRight`)에는 온라인/오프라인 점과 시계만 있다.
Mac Studio·NAS·백업 감지·원격 작업 상태를 보려면 여러 화면을 따로 열어야 한다. 이걸 한 번의
클릭으로 볼 수 있는 팝업 패널을 추가한다.

사용자가 참고로 보여준 시놀로지 NAS DSM 모바일 앱 스크린샷은 **디자인(카드 구성, 체크 아이콘 +
상태 문구 스타일)만** 참고한다 — 그 앱의 CPU/RAM/스토리지 사용량이나 SMB/HTTPS 접속 로그
같은 NAS 자체 OS 데이터는 우리 앱이 NAS API에 붙어있지 않아 가져올 수 없고, 이 기능의 범위도
아니다.

## 범위

- **데스크탑 `OliviaDesktop` 상단바에만** 적용한다. 모바일/태블릿 셸에는 전체 화면을 가로지르는
  상단바 개념이 없어서(화면마다 자체 헤더) 이번 범위에서 제외한다.
- 새 DB 테이블/컬럼을 만들지 않는다. 이미 있는 `remote_workers`(Mac Studio 워커 하트비트),
  `worker_events`(NAS 백업 감지), `remote_jobs`(원격 작업 큐/기록) 세 테이블을 읽기만 한다.
- "watcher 상태"는 별도 헬스체크를 만들지 않는다. `nas-backup-watcher.ts` 자체는 하트비트를
  보내지 않으므로, "맥스튜디오 연결" 하나가 워커(worker.sh)와 그 위에서 도는 와쳐를 함께
  대표하는 것으로 충분하다(사용자 확인 완료) — Mac Studio가 온라인이면 그 안의 프로세스들도
  도는 것으로 본다.

## 데이터 소스 (전부 기존 테이블, 읽기 전용)

| 섹션 | 테이블 | 주요 컬럼 |
|---|---|---|
| 맥스튜디오 연결 | `remote_workers` | `worker_status`, `last_seen_at` |
| 나스 연결 | `remote_workers` | `nas_connected` |
| 최근 백업된 폴더 | `worker_events` | `folder_name`, `status`, `created_at` |
| 최근 파일 작업 | `remote_jobs` | `action`, `status`, `created_at`, `completed_at` |

`remote_jobs`의 `action`이 `PING`이면 목록에서 제외한다(진단용, 사용자에게 의미 없음).

## API — `GET /api/olivia-os/status-panel`

새 라우트 하나를 추가한다. 관리자 세션 필요(`isAdminSession`, 기존 `/api/remote-workers/status`와
동일한 인증 패턴). 서버에서 세 테이블을 한 번에 조회해 아래 모양으로 응답한다:

```ts
{
  ok: true,
  worker: { id: string, online: boolean | null, worker_status: string | null, last_seen_at: string | null, nas_connected: boolean | null },
  recentBackups: Array<{ id: string, folder_name: string, status: string, created_at: string }>, // 최근 5개
  recentJobs: Array<{ id: string, action: string, status: string, created_at: string, completed_at: string | null }>, // 최근 5개, PING 제외
}
```

`worker` 필드는 `/api/remote-workers/status`가 이미 쓰는 `isRemoteWorkerOnline()` 판정 로직을
그대로 가져다 쓴다(새로 만들지 않음). 개별 쿼리 중 하나가 실패해도(예: 마이그레이션 미적용으로
테이블 없음) 그 섹션만 빈 배열/null로 응답하고 전체 요청을 500으로 죽이지 않는다 — 기존
`/api/remote-workers/status`/`/api/worker/events`가 이미 따르는 "일부 실패해도 나머지는
보여준다" 원칙과 동일하다.

## UI

### 버튼

`DesktopTopBar.tsx`의 `topBarRight`, 기존 온라인 점 왼쪽에 아이콘 버튼을 추가한다
(`components/olivia-os/StatusPanelButton.tsx`, 새 파일). Mac Studio가 오프라인이거나 NAS가
미연결이면 버튼 위에 작은 경고 점을 얹는다 — 패널을 열지 않아도 문제를 감지할 수 있게.
이 경고 판정을 위해 버튼은 패널이 닫혀 있어도 낮은 빈도(예: 60초)로 상태를 폴링한다.

### 패널

버튼 클릭 시 드롭다운 패널이 열린다. 기존 `.menuDropdown`(메뉴바 드롭다운)과 같은 위치 규칙
(버튼 아래, 바깥 클릭/Esc로 닫힘, `pointerdown`/`keydown` 리스너 패턴)을 재사용하되, 내용은
메뉴 버튼 목록이 아니라 섹션 카드 4개다.

1. **맥스튜디오 연결** — 최상단, 카드 안에서 가장 크게. "정상 작동 중" / "오프라인" +
   `last_seen_at`의 상대 시각("2분 전"). `worker_status`가 `online`/`busy`/`idle`이면 정상,
   `error`거나 값이 없으면(또는 `online:false`) 문제로 표시.
2. **나스 연결** — 같은 카드 하단에 보조 줄로. `nas_connected`가 `true`→"연결됨",
   `false`→"연결 안 됨", `null`→"확인 안 됨"(회색, 경고 아님 — 마이그레이션 이전 버전
   워커거나 아직 보고 전).
3. **최근 백업된 폴더** — 리스트 최대 5줄. 폴더명 + 상대 시각 + 상태 배지(대기/시작함/완료 —
   `worker_events.status`를 한글 라벨로 매핑). 비어있으면 "최근 감지된 백업이 없어요."
4. **최근 파일 작업** — 리스트 최대 5줄. `action`을 한글 라벨로 매핑(`PHOTO_SORT`→"사진 분류",
   `LIST_FOLDER`→"폴더 조회", `PHOTO_PREPARE_SOURCE`→"JPG 통합", `PHOTO_STAGE_JPG`→"JPG 복사",
   `PHOTO_CLASSIFY_WORK`→"씬별 분류", `COPY_TEST`→"복사 테스트") + 상대 시각 + 상태(진행중/
   완료/실패, `remote_jobs.status`의 QUEUED·RUNNING→진행중, COMPLETED→완료, FAILED→실패).
   비어있으면 "최근 작업이 없어요."

### 동작

- 패널이 열리는 시점에 `/api/olivia-os/status-panel`을 호출하고, 열려있는 동안 25초 간격으로
  자동 갱신한다(패널 닫히면 이 타이머는 멈추고, 버튼의 60초 배지-폴링만 계속된다).
  `BackupReadyNotifications`(45초)·`PhotoStudioExecutionContext`(10초)가 이미 쓰는 setInterval
  폴링 패턴과 동일한 방식이다 — 새 폴링 메커니즘을 만들지 않는다.
- 패널 안에 수동 새로고침 아이콘 버튼.
- 로딩 중에는 카드별 스켈레톤(간단한 회색 블록), 최초 호출 실패 시 패널 전체에 "상태를
  불러오지 못했어요" + 재시도 버튼.

## 건드리지 않는 것

- `remote_workers`/`worker_events`/`remote_jobs` 스키마 — 전부 읽기만 한다.
- `nas-backup-watcher.ts`/worker.sh 자체 — 새 하트비트 안 만든다.
- 모바일/태블릿 셸 — 이번 범위 아님.

## 테스트

- `GET /api/olivia-os/status-panel` — 관리자 세션 아니면 401, 세 테이블 정상 조회 시 응답 모양
  검증, 개별 테이블 조회 실패 시에도 나머지 섹션은 정상 반환되는지(부분 실패 허용) 검증,
  `PING` action이 `recentJobs`에서 제외되는지 검증.
- 컴포넌트 자체는 이 저장소의 기존 관례상 단위 테스트 대상이 아니다(다른 top bar/드롭다운
  컴포넌트들도 테스트 없음) — dev 서버 + 실제 클릭으로 시각 확인한다.
