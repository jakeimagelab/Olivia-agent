# 개인별·공동 셀렉 RAW 매칭 및 관리자 동선 개선 설계

## 목표

개인별 사진선택과 프로젝트 공동 셀렉에서 고객이 최종 제출하지 않았더라도 현재 자동 저장된 선택을 관리자 RAW 매칭 대상으로 사용할 수 있게 한다. 기존 제출본 기준 동작은 기본 호환으로 유지하고, 관리자 버튼 배치와 공동 셀렉의 최종 제출 권한 표시를 Olivia OS 작업실 규칙에 맞게 정리한다.

DB 스키마는 변경하지 않는다. 기존 `person_select_choices`, `person_select_shared_drafts`, `person_select_shared_selections`, `person_select_shared_selection_items`, `person_select_shared_reviewers`를 그대로 사용한다.

## 선택한 접근 방식

기존 `PERSON_SELECT_RAW_MATCH` 원격 작업을 확장하고, RAW 매칭 대상 계산을 공통 순수 함수로 분리한다.

- 브라우저는 실행 옵션과 예상 수량을 보여주지만 최종 대상 imageId를 신뢰 경계 밖에서 확정하지 않는다.
- API가 `source`와 `reviewerIds` 형식을 검증하고 워커가 운영 DB에서 대상을 다시 조회한다.
- 기존 action과 스크립트를 유지해 배포·모니터링·결과 표시가 갈라지지 않게 한다.
- payload에 `source`가 없으면 `submitted`로 처리해 기존 호출과 호환한다.

브라우저가 imageId 목록을 직접 전달하는 방식은 화면과 DB가 어긋날 가능성이 있고, 별도 원격 action을 만드는 방식은 RAW 탐색·복사 로직이 중복되므로 사용하지 않는다.

## RAW 매칭 대상 규칙

### 공통 입력

```ts
type PersonSelectRawMatchSource = "submitted" | "current";

type PersonSelectRawMatchRequest = {
  event_id: string;
  source?: PersonSelectRawMatchSource;
  reviewerIds?: string[];
};
```

`reviewerIds`는 공동 셀렉에서만 허용한다. 생략하면 활성 검토자 전체를 의미한다. 이벤트에 속하지 않거나 비활성인 검토자 ID는 서버에서 거부한다.

### 개인별 모드

- `submitted`: `submitted_at`이 있는 사람의 `person_select_choices`만 사용한다.
- `current`: 제출 여부와 무관하게 현재 `person_select_choices`를 사용한다.
- 동일 imageId는 한 번만 처리한다.
- 결과 집계는 사진 장수 기준으로 `submittedSelectedCount`와 `currentUnsubmittedCount`를 분리한다.

### 공동 모드

- `submitted`: 선택한 검토자들의 최신 유효 제출본을 합집합으로 사용한다.
- `current`: 선택한 검토자별 `person_select_shared_drafts.items`를 우선 사용한다. 초안이 없는 검토자는 최신 제출본을 대체 입력으로 사용한다.
- 기본 검토자 범위는 활성 검토자 전체의 합집합이다.
- 관리자는 특정 검토자 한 명 또는 여러 명으로 범위를 좁힐 수 있다.
- 검토자 간 중복은 imageId 기준으로 제거한다.
- `submittedSelectedCount`는 제출본에서 온 고유 사진 수, `currentUnsubmittedCount`는 초안 때문에 새로 포함된 고유 사진 수로 계산한다.

### 대상 미리보기

관리자 화면과 워커가 같은 순수 대상 계산 규칙을 사용한다. 관리자 API 응답에 이미 들어 있는 개인 선택·공동 초안·제출 요약으로 즉시 예상 수량을 표시하고, 실행 시 워커가 DB에서 다시 계산한다. 실행 결과의 대상 수가 화면 예상과 달라도 워커 결과를 진실값으로 사용하고 결과 줄에서 갱신한다.

## RAW 안전 매칭과 복사

기존 `lib/selectMatch/captureTime.ts`와 촬영시각 후보 판정 규칙을 Node 경로 기반 워커에서 재사용한다.

- JPG와 RAW의 확장자를 제외한 파일명이 같아야 한다.
- 양쪽 `DateTimeOriginal` 차이가 2초 이내여야 한다.
- 양쪽에 소수초가 있으면 가장 가까운 유일 후보를 선택한다.
- 같은 촬영시각과 같은 파일 크기의 RAW가 여러 폴더에 있으면 동일 파일 복사본으로 보고 한 개를 사용한다.
- 시간이 다르거나, 촬영시각을 읽지 못하거나, 후보가 여전히 여러 개면 복사하지 않고 `reviewRequired`에 남긴다.
- 복사는 macOS `/usr/bin/ditto`를 사용해 생성일·수정일·확장속성을 보존한다.
- 대상 파일이 이미 있으면 덮어쓰지 않는다. 동일 파일이면 `alreadyCopied`, 다른 파일이면 충돌로 기록한다.
- 원본 RAW는 이동하거나 삭제하지 않는다.

결과는 기존 `raw_match_result`에 다음 호환 확장 필드를 저장한다.

```ts
{
  source: "submitted" | "current";
  reviewerIds: string[];
  submittedSelectedCount: number;
  currentUnsubmittedCount: number;
  selectedCount: number;
  matchedCount: number;
  alreadyCopiedCount: number;
  reviewRequired: Array<{
    owner: string;
    jpg: string;
    reason: "time_mismatch" | "multiple_candidates" | "missing_time" | "raw_missing" | "conflict";
    candidates?: string[];
  }>;
}
```

기존 `missing`, `ambiguous`, `conflicts`, `submittedPeople`, `notSubmitted` 필드는 기존 화면·호환 테스트를 위해 유지한다.

## 관리자 UI

### 공통 RAW 매칭 확인창

실행 전에 다음을 표시한다.

- 매칭할 셀렉: `최종 제출본만` / `지금 고른 상태(제출 전 포함)`
- 제출본이 하나도 없고 현재 선택이 있으면 `current`가 기본이다. 그 외에는 `submitted`가 기본이다.
- 공동 모드 검토자: `전체 합집합` 또는 검토자별 선택
- `매칭할 사진 N장 (제출본 a장 · 제출 전 b장)`
- 실행 취소와 실행 버튼

선택 장수가 0이면 실행 버튼을 끄고 이유를 보인다. 원본 경로 미연결 또는 Mac Studio 오프라인도 버튼 툴팁과 버튼 아래 설명으로 동시에 안내한다.

### 버튼 배치

- 제목 줄에는 제목과 부제만 남긴다.
- 탭 줄 오른쪽에 `안내 문구 복사`를 둔다.
- 개인별 모드는 `비밀번호 목록`, `보정 목록 CSV`, `주문 CSV`도 같은 줄 오른쪽에 배치한다.
- 가로 공간이 부족하면 보조 작업을 `더보기 ⋯` 메뉴에 넣는다. 활성 탭은 항상 직접 보인다.
- 공동 모드의 RAW 매칭 버튼은 읽기 전용 관리자 `CustomerBridgeSelect` 툴바에서 `리뷰` 바로 앞에 둔다.
- 공동 Bridge에 전용 관리자 툴바 슬롯을 추가하되 고객 Bridge에는 렌더하지 않는다.
- 개인별 모드는 고객 셀렉 표 위 툴바 오른쪽에 RAW 매칭 버튼을 둔다.
- RAW 매칭은 해당 툴바의 유일한 채움(primary) 버튼이다.
- 최근 결과 줄과 진행 결과는 버튼 바로 아래에 표시한다.

## 공동 셀렉 최종 제출 권한

- 레거시 검토자의 `can_finalize`가 `null` 또는 누락이면 `true`로 정규화한다.
- 공개 페이지 응답, 고객 컴포넌트 props, 제출 API 권한 검사에서 같은 정규화 함수를 사용한다.
- 검토자 0명 상태에서도 레거시 공용 토큰으로 연결된 호환 검토자가 최종 제출할 수 있어야 한다.
- 명시적으로 `can_finalize = false`인 일반 검토자는 자동 저장만 가능하고 제출 API도 계속 거부한다.
- 프로젝트 설정 검토자 목록에 `최종 확정` 토글을 유지하며, 활성 상태이고 최종 확정 가능한 검토자가 0명이면 경고를 표시한다.
- 모바일 하단 바는 `padding-bottom: env(safe-area-inset-bottom)`을 포함하고 `셀렉 초기화 · 리뷰 · 최종 제출`이 가려지지 않게 한다.

## 오류 처리

- API는 잘못된 source, 다른 이벤트 검토자, 비활성 검토자를 400 또는 409로 거부한다.
- 화면 예상 수량이 0이거나 원본 경로·워커 조건을 만족하지 않으면 job을 만들지 않는다.
- 워커는 최종 DB 상태를 다시 읽으므로 관리자 화면을 연 뒤 선택이 바뀌어도 최신 데이터로 실행한다.
- 부분 성공은 실패 처리로 숨기지 않고 복사 수와 확인 필요 수를 함께 저장한다.
- `raw_match_result` 저장 실패는 원격 작업 성공으로 처리하지 않는다.

## 테스트

### 순수 함수

- 제출본 없음, 개인별 제출 전 선택 52장: `current` 대상 52장.
- 공동 검토자 두 명의 합집합: 중복 imageId 제거.
- payload source 미지정: `submitted`.
- 공동 `current`: 초안 우선, 초안 없음은 최신 제출본 대체.
- 레거시 `can_finalize = null`: 최종 제출 가능.

### RAW 매칭

- 같은 이름 RAW 두 개 중 촬영시각이 맞는 한 개만 확정.
- 같은 이름·같은 촬영시각·같은 크기 복사본은 한 후보로 확정.
- 시간 불일치, 촬영시각 없음, 서로 다른 후보가 남으면 `reviewRequired`.
- `ditto` 복사와 기존 파일 비덮어쓰기.

### API·UI

- 원격 작업 payload가 source와 reviewerIds를 검증·전달한다.
- 제목 줄에 작업 버튼이 없다.
- 탭 줄 오른쪽에 안내 문구 복사가 있다.
- 공동 관리자 Bridge 툴바에서 RAW 매칭이 리뷰 앞에 있다.
- 개인별 고객 셀렉 표 위에 RAW 매칭과 비활성 사유가 있다.
- 레거시 공동 링크의 고객 화면에 최종 제출 버튼이 보이고 제출 API가 허용한다.
- 명시적으로 권한이 없는 검토자는 제출할 수 없다.
- 390px 모바일에서 하단 작업 바와 safe area가 겹치지 않는다.

## 검증 및 배포

1. 관련 Vitest와 `npx tsc --noEmit`을 실행한다.
2. 실제 UI에서 개인별·공동 모드의 버튼 위치, 확인창, 결과 줄을 확인한다.
3. 관련 파일만 커밋하고 `main`에 푸시한다.
4. Mac Studio에서 최신 `main`을 받은 뒤 기존 remote bridge worker를 재시작한다.
5. worker 상태가 online이고 새 payload를 받은 작업 결과에 `source`와 대상 집계가 포함되는지 확인한다.
