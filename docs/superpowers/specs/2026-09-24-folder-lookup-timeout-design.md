# 폴더 찾기 회귀·응답 멈춤·에러 증폭 차단 설계

## 목표

Workstation 최상위 폴더 조회 계약을 서버와 Mac Studio Worker에서 동일하게 만들고, 채팅이 폴더명만 검색하도록 보장하며, 외부 응답 지연이 Vercel 60초 제한에 도달하기 전에 단계가 표시된 실패 응답으로 종료되게 한다.

사진 파일 이동 코드, 사진 프로젝트 상태 머신, Hermes MCP 연결, 모바일 셸과 Scene Engine은 변경하지 않는다.

## 확인된 원인

1. 저장소 최신 `scripts/mac-studio-remote-bridge.ts`는 빈 `remote_path`를 ROOT로 처리하지만, Mac Studio에 설치된 Worker가 수정 전 버전이면 빈 값을 필수값 누락으로 거부한다. 서버 배포와 Worker 설치가 분리되어 생긴 실행 버전 불일치다.
2. 직접 사진 명령 파서는 `JPG만`과 `해줄래`를 완전한 원본 분리 표현으로 인식하지 못한다. 직접 실행 guard를 통과하지 못하면 Hermes가 최근 대화 문맥을 이용하며, 요청 문장이 `find_photo_folder.query`에 섞일 수 있다.
3. `remoteNasDataSource`의 20초 반복 제한은 개별 `fetch()`가 반환된다는 전제다. 생성 또는 polling fetch 자체가 멈추면 deadline을 검사할 수 없다.
4. Hermes timeout과 Vercel 함수 `maxDuration`이 모두 60초다. 서버가 자체 오류 이벤트를 보내고 스트림을 닫을 여유가 없다.
5. 브라우저에는 스트림 전체 watchdog이 없어 서버 연결이 비정상적으로 열린 채 남으면 로딩 표시도 유지된다.
6. 동일 App Window 오류 3회 차단은 커밋 `3f7a18e7`에 이미 구현·배포됐다. 이번 작업은 그 동작을 유지하고 재작성하지 않는다.

## ROOT 조회 프로토콜

최상위 조회를 빈 문자열의 암묵적 의미에만 의존하지 않는다.

```json
{
  "action": "LIST_FOLDER",
  "payload": {
    "root": true,
    "folders_only": true
  }
}
```

하위 폴더 조회는 기존처럼 실제 상대경로를 쓴다.

```json
{
  "action": "LIST_FOLDER",
  "payload": {
    "remote_path": "0911_WINF"
  }
}
```

서버와 Worker는 다음 계약을 함께 적용한다.

- `root: true`이면 `remote_path` 생략 또는 빈 문자열만 허용한다.
- `root: true`와 non-empty `remote_path`가 같이 오면 요청을 거부한다.
- `root`가 없으면 기존 `remote_path` 하위 조회를 유지한다.
- 과거 서버/테스트 호환을 위해 `remote_path`가 생략·null·빈 문자열인 요청도 ROOT로 계속 허용한다.
- 절대경로, `.`/`..`, 역슬래시와 NUL 거부는 유지한다.
- Worker 성공 로그에는 최상위일 때 `LIST_FOLDER completed: ROOT`를 기록한다.

이 호환 규칙 덕분에 서버와 Worker를 같은 날 설치할 수 있고 기존 원격 Finder 호출도 깨지지 않는다.

## 폴더명 추출

폴더 검색 query는 사용자 원문의 폴더명 부분에서만 만든다.

### 최초 명령

1. 문장 앞의 `올리비아`, `올리비아야`와 쉼표를 제거한다.
2. `>`가 있으면 왼쪽 부분만 폴더 후보로 사용한다.
3. `원본 분리`, `JPG만 분리`, `JPG만 줄래`, `JPG 통합`, `RAW/JPG 분리`, `1차 분류` 표현과 `해줘`, `해줄래`, `줄래`, `부탁해` 같은 요청 어미를 제거한다.
4. NAS, Workstation, 촬영 폴더 같은 위치 설명을 제거한다.
5. 남은 문자열을 공백 정리한 뒤 query로 쓴다.

`0911_WINF`의 밑줄과 원문 Unicode form은 검색 비교 단계 외에는 바꾸지 않는다.

### 되묻기 후 답변

`folder_retry`와 `choose_folder` 상태에서는 현재 사용자 원문만 해석한다. 이전 사용자 문장, `recentUserText`, alias/referent rewrite 또는 Hermes 답변을 query에 합치지 않는다.

- `0911_WINF`
- `폴더명은 0911_WINF야`
- `2번`

위 입력만 현재 대기 상태의 선택·재검색에 사용한다. 대기 상태가 없을 때 단독 고유명사를 파일 mutation 명령으로 승격하지 않는다.

`find_photo_folder` 도구 설명에는 `query에는 폴더 이름만 넣고 호칭·요청 문장·작업 표현을 넣지 않는다`를 명시한다.

## 단계별 timeout

Vercel 제한보다 먼저 종료할 수 있도록 바깥쪽 제한이 안쪽 제한보다 길게 구성한다.

| 단계 | 제한 | 사용자 표시 |
|---|---:|---|
| LIST_FOLDER 생성/Worker polling | 총 15초 | `폴더 조회 단계에서 Worker 응답 시간이 초과되었습니다.` |
| 직접 사진 도구 턴 | 총 35초 | 실제 멈춘 하위 단계 표시 |
| Hermes 응답 생성 | 45초 | `응답 생성 단계에서 시간이 초과되었습니다.` |
| 브라우저 전체 채팅 요청 | 50초 | 요청 abort 후 로딩 종료 및 재시도 안내 |
| Vercel 함수 | 기존 60초 | 최후 안전 한도 |

### Remote NAS 조회

`remoteNasDataSource`는 하나의 deadline과 AbortController를 사용한다. job 생성 fetch, 각 polling fetch, polling interval 모두 남은 시간을 공유한다. 외부 signal과 내부 deadline 중 하나가 abort되면 요청을 종료한다.

오류 단계는 다음처럼 구분한다.

- `folder_lookup_job_creation`: LIST_FOLDER job 생성 실패
- `folder_lookup_worker_wait`: Worker 결과 대기 timeout 또는 실패
- `folder_lookup_result`: Worker 결과 형식·경로 검증 실패

### 직접 사진 명령

`executePhotoDirectTurn`의 각 도구 호출에 단계 이름을 부여한다.

- `find_photo_folder`: 폴더 조회
- `start_photo_source_prep`/`start_photo_scene_sort`: 잡 생성

읽기 조회 timeout은 안전하게 실패한다. mutation 도구가 timeout되면 실제 job 생성 여부를 단정하지 않고 `잡 생성 응답이 지연됐습니다. 사진 작업 상태에서 실행 여부를 확인해주세요.`라고 표시한다.

### Hermes와 서버 스트림

Hermes의 자체 timeout을 45초로 줄인다. timeout 오류는 서버 stream catch가 `error` 이벤트로 보내고 `finally`에서 stream을 닫는다. 서버가 timeout 전에 이미 보낸 일반 텍스트를 완료 응답으로 오인하지 않도록 오류 상태를 유지한다.

### 브라우저

채팅 store는 요청마다 50초 watchdog을 시작한다. 시간이 지나면 현재 AbortController를 abort하고 assistant 메시지를 오류 상태로 바꾸며 `응답 생성 시간이 초과되었습니다. 멈춘 단계: <마지막 agent_status>`를 표시한다. `finally`에서 watchdog을 항상 해제하고 `isSending`, `isStreaming`, `agentStatus`를 초기화한다.

## 에러 증폭 차단

현재 구현을 유지한다.

- 동일 창·동일 fingerprint 3회부터 retry lock
- lock 후 resetKey 변경으로 자동 재시도하지 않음
- 오류 원문과 `appId · windowId` 위치 표시
- 다른 창, Dock, 메뉴바는 유지

이번 수정은 고객관리 렌더 루프 원인을 다루지 않는다. 기존 error recovery 단위 테스트와 고객 전환 회귀 테스트를 함께 실행한다.

## Mac Studio 설치

저장소의 `ops/mac-studio/install-worker-bin.sh`는 기존 `~/OliviaWorker/bin`을 timestamp 백업한 뒤 새 스크립트를 설치한다. 이번 변경에서는 설치 후 Worker LaunchAgent를 안전하게 재시작하는 선택적 명령 또는 별도 설치 wrapper를 제공한다.

최종 운영 절차는 한 번의 pull과 설치로 끝나야 한다.

```bash
cd ~/olivia-worker
git pull --ff-only origin main
./ops/mac-studio/install-worker-bin.sh
# 제공되는 restart 명령 실행
```

검증 명령은 다음 사실을 확인한다.

1. 설치된 `remote-bridge.sh`가 git clone 경로의 runner를 사용한다.
2. Worker가 재시작됐다.
3. ROOT `LIST_FOLDER`가 성공했다.
4. 로그에 `LIST_FOLDER completed: ROOT`가 남았다.

설정 파일, Worker state와 기존 로그는 변경하지 않는다.

## 테스트

1. ROOT payload의 명시형·기존 빈 값 호환형 성공
2. ROOT와 non-empty path 혼합 요청 거부
3. NFD 폴더명 원문 보존
4. `올리비아, 0911_WINF > JPG만 분리해줄래` → query `0911_WINF`
5. `0911_WINF JPG만 줄래` → query `0911_WINF`
6. 첫 검색 실패 후 `0911_WINF` → 현재 입력만으로 재검색
7. `르셀청담` → 복수 후보와 장수 표시
8. Worker down 시 15초 이내 단계별 오류
9. Hermes 지연 시 45초 이내 오류 이벤트와 stream 종료
10. 서버 stream 미종료 시 브라우저 50초 watchdog이 로딩 종료
11. mutation timeout 시 실행 여부를 거짓으로 단정하지 않음
12. App Window 동일 오류 3회 lock 회귀 테스트

## 범위 제외

- 사진 파이프라인 파일 이동·복사·검증 로직
- remote job action과 프로젝트 상태 머신
- Hermes MCP 설정·터널
- 고객관리 무한 렌더 원인 추가 수정
- 모바일 셸
- Scene Engine
- 카메라별 JPG 분리
