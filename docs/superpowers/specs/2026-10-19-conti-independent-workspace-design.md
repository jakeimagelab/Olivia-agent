# 촬영 콘티 독립 화면 및 병원 협업 설계

작성일: 2026-10-19  
기준: `Olivia-agent-main_23` 계열 현재 저장소  
디자인 기준: `촬영 콘티 독립 화면 UI.pdf` 1~7면, `.agents/skills/olivia-workspace-ui/SKILL.md`

## 1. 목적과 범위

촬영 콘티를 사진작업실의 `기획` 탭에서 분리해 독립 `/conti` 앱으로 만든다. 콘티 장면은 의료진 수와 무관하게 한 벌만 저장하고, 실제 촬영 순서와 의료진별 반복은 타임테이블에서 전개한다. 병원 작성용 공유 링크에서는 준비사항·담당자·의료진 이름·촬영일·촬영 순서만 수정할 수 있게 한다.

구현은 다음 순서를 지킨다.

1. A — 독립 앱 연결과 기존 링크 호환
2. B — 장면 정의와 타임테이블 모델 분리, 편집·현장·Excel 화면 개편
3. C — 병원 작성용 공유 링크와 제한된 쓰기 API

각 단계는 별도 검증 가능한 커밋 경계로 유지한다. 운영 배포는 A/B/C 전체 검증 후 한 번 수행한다.

## 2. 보존 조건

- `conti_saves`를 읽는 대시보드·고객포털·워크플로·휴지통·구 Olivia 도구를 유지한다.
- `components/conti/ContiBuilder.tsx`, `app/api/conti/route.ts`, `OLIVIA_CONTI_SERVICE_ENGINE === "legacy"` 분기를 유지한다.
- 영상 콘티 데이터와 `/video-conti` 내부 동작은 변경하지 않는다.
- 기존 `customer`·`staff` 공유 토큰은 읽기 전용으로 그대로 동작한다.
- 기존 `conti_runs`와 `studio_state`는 신규 정규화 함수가 호환해서 읽는다.
- 공유 토큰 원문은 UI와 로그에 노출하지 않는다. 사용자는 완성된 링크만 복사한다.

## 3. UI 원칙

모든 촬영 콘티 화면은 밝은 문서형 화면이다.

- 바탕 `#FDFCFA`, 주조 `#155855`, 주 실행 `#C94A1E`, 흐린 글자 `#5A7470`, 선택 바탕 `#EDF5F3`
- 1단계: 회색 알약 바 안의 흰 알약 `촬영 콘티 / 영상 콘티`
- 2단계: 밑줄형 `콘티 / 준비사항 / 타임테이블 / 현장뷰` 또는 병원 공유 탭
- 화면당 채운 주 실행 버튼은 하나만 둔다.
- 글자 굵기는 600 이하이며 단계 번호는 한 자리 원형으로 쓴다.
- `lucide-react` 선 아이콘만 쓰고 이모지는 쓰지 않는다.
- 독립 콘티 본문은 1920px 화면에서 약 1384px을 사용하며 `.resultTable { min-width: 1380px }`를 유지한다.

## 4. A — 독립 앱과 연결

### 4.1 라우팅

- `WorkspaceType = "conti"`는 데스크톱 앱 id `conti`로 열린다.
- 앱 레지스트리에 기존 `ContiWindowContent`를 쓰는 독립 `conti` 앱을 등록하고 `conti -> photo-workspace` 별칭을 제거한다.
- `workspaceRegistry.conti`의 canonical route와 direct route를 `/conti`로 바꾼다.
- `workspaceGroups.ts`에서 촬영 콘티를 사진작업실 도구로 취급하지 않고 `/conti`를 독립 경로로 유지한다. 기능 검색의 `콘티`, `촬영 콘티`, `사진 콘티` 별칭은 독립 `/conti`로 연결한다.
- `/conti-v2`는 `/conti`로 이동한다.
- 즐겨찾기 정규화에서 `/conti`와 `app:conti`를 사진작업실로 바꾸지 않는다.

### 4.2 사진작업실

- `PhotoWorkspaceMode`와 탭 목록에서 `plan`을 제거한다.
- 콘티 dynamic import, 마운트 분기, 밝은 패널 조건, 원격 예외를 제거한다.
- 기본 모드는 `jpg-prep`으로 정한다.
- 사진 가이드의 `plan` 안내를 제거한다.
- 옛 `/photo-sorting?tab=plan&tool=conti` 진입은 클라이언트 리다이렉트 컴포넌트에서 `/conti`로 전환한다. `clientId`, `workflowRunId`, `resourceId`와 그 밖의 쿼리 값을 그대로 보존한다.

### 4.3 독립 셸

- `(conti-studio)/layout.tsx`는 제목 `콘티`와 1단계 탭을 제공한다.
- `/conti`와 Olivia OS 창 모두 `ContiWorkspaceAdapter`를 통해 `surface="workspace"`를 사용한다. 기존 마케팅 히어로를 되살리지 않는다.

## 5. B — 데이터 모델

### 5.1 마이그레이션

신규 마이그레이션은 기존 행을 수정하지 않고 nullable/default 컬럼만 추가한다.

- `conti_runs.doctors jsonb not null default '[]'::jsonb`
- `conti_scenes.scene_code text`
- `conti_scenes.repeat_scope text not null default 'once'`
- `conti_scenes.media text not null default 'photo'`

`repeat_scope` 허용값은 `once`, `per_doctor`, `per_doctor_pair`이고 `media` 허용값은 `photo`, `photo_video`, `none`이다. 구 행은 기본값으로 정상 표시한다.

### 5.2 의료진

의료진은 `conti_runs.doctors`에 다음 형태로 저장한다.

```json
[{"id":"d1","name":"정연호","surgeries":["cataract"],"note":"백내장 협진 가능","day":null}]
```

`doctor_count`는 배열 길이로 함께 저장해 기존 소비자와 호환한다. 진료과별 기본 수술 종류는 taxonomy에서 제공하고, 사용자가 추가한 종류는 해당 run 입력에 포함한다.

### 5.3 장면 정의

개인 의료진 공통 장면은 한 벌만 저장한다.

1. 메이크업·준비 — 10분, `media=none`, `repeat_scope=per_doctor`
2. 프로필 — 15분, `media=photo`, `repeat_scope=per_doctor`
3. 진료 연출 — 20분, `media=photo_video`, `repeat_scope=per_doctor`
4. 수술 연출 — 15분, `media=photo_video`, `repeat_scope=per_doctor`

정리·이동 10분은 `conti_scenes`에 저장하지 않고 전개된 타임테이블에만 넣는다. 소아·드림렌즈는 `once`다. 장면 이름에 `원장1` 같은 접두어를 만들지 않는다.

### 5.4 안정적인 식별자

- 콘티 장면 번호는 `scene_code`(`S1`, `S2`…)이며 화면 순서는 `sort`로 관리한다.
- 전개 행 id는 장면과 의료진/구간을 조합한 안정적인 값이다. 예: `sceneId:doctorId`, `sceneId:once`, `break:blockId`.
- 완료 상태와 타임 순서는 이 행 id를 키로 사용한다. 장면 순서를 바꿔도 완료 대상이 다른 의료진으로 옮겨가지 않는다.

## 6. B — 타임테이블 상태와 계산

`studio_state`는 버전 2로 정규화한다.

- `scheduleSegments`: 날짜/요일, 시작·종료 시각을 가진 구간 배열
- `scheduleBlocks`: 휴식 또는 고정 시각 장면
- `timelineOrder`: 전개 행 id 배열
- `timelineCompleted`: 전개 행 id별 완료 상태
- 기존 체크리스트·카드 크기·장면 시각 자료 유지

옛 `scheduleStartTime`만 있으면 하루짜리 구간 하나로 변환한다. 값이 없으면 시간 없는 순서표를 유지한다.

계산 규칙:

1. `once` 장면은 한 번 배치한다.
2. `per_doctor` 묶음은 의료진 명단 순서로 반복한다.
3. 각 의료진 묶음 뒤에 정리·이동 10분을 둔다.
4. 휴식은 촬영하지 않는 잠금 행이다.
5. 고정 시각 장면은 지정 시각을 지키고 다른 유동 장면만 앞뒤로 계산한다.
6. 구간 종료까지 남은 시간을 계산하고 0분 이하면 경고한다.

드래그는 `timelineOrder`만 바꾸며 잠긴 고정 시각·휴식 행은 이동시키지 않는다.

## 7. B — 화면

### 7.1 생성

- 의료진 수 스테퍼를 의료진 표로 교체한다.
- 이름, 진료과 기본 수술 체크, 사용자 추가 수술, 메모를 입력한다.
- 촬영일은 받지 않는다.
- 안과 선택 항목은 PDF의 9개 단순 목록으로 제공한다.
- 목록·병원 프로필 조회 실패, 공간 매칭 수, AI 보강 생략, DB 마이그레이션 필요 상태를 화면에 표시한다.

### 7.2 편집 표

최종 열은 다음 12개다.

`No · 구분 · 장면 · 촬영시간 · 분 · 사진/영상 · 키워드 · 설명 · 장소 · 인물 · 환자 역할 · 준비사항(병원요청)`

구도와 완료는 제거한다. 의료진 장면 묶음 위에 `× N명 · 타임테이블에서 전개` 띠를 표시하고 수술 준비사항에는 의료진별 배정을 자동 요약한다.

### 7.3 현장뷰

- `controller.schedule`의 전개 행을 카드로 만든다.
- 의료진 카드에는 메이크업·프로필·진료·수술 단계를 줄별로 표시한다.
- 완료는 `timelineCompleted[rowId]`에 저장하고 진행률도 행 기준으로 계산한다.
- 카드 크기 조절과 드래그를 유지하되 고정 시각·휴식에는 잠금 표시를 둔다.
- 카드에서 구도를 제거하고 환자 역할과 사진/영상을 표시한다.

### 7.4 Excel

`xlsx`의 기존 내보내기를 재사용해 네 시트를 만든다.

- 콘티: 12열
- 현장뷰(카드): 장면당 8행 블록
- 준비사항: 완료, 구분, 항목, 비고, 담당
- 타임테이블: 요일, 순서, 시작, 종료, 분, 장면, 내용, 등장인물·담당, 장소, 비고와 1인 70분 합계 수식

병합 셀은 만들지 않는다. 헤더 자동 필터와 틀 고정을 넣고 분은 숫자로 저장한다.

## 8. 공통 표시 함수

- `departmentTaxonomy.ts`가 `getDepartmentLabel(value)`를 제공한다.
- 편집 화면, 현장뷰, 공유 화면은 복사된 이름표 대신 이 함수를 사용한다.
- `imported`는 `가져온 촬영 콘티`로 표시한다.
- 그룹 색상은 한 파일에서 관리하며 파란색을 제외한다.

## 9. C — 공유 권한과 API

### 9.1 마이그레이션

`conti_run_shares`에 다음을 추가한다.

- `can_edit boolean not null default false`
- `edited_at timestamptz`
- `submitted_at timestamptz`
- audience check에 `hospital` 추가

`hospital` 링크만 `can_edit=true`로 발급한다. 기존 `customer`와 `staff` 행은 변경하지 않는다.

### 9.2 PATCH 허용 목록

`PATCH /api/conti/shares/[token]`은 토큰, 취소 여부, 편집 권한을 먼저 검증한다. 허용 입력만 받는다.

- 준비사항 완료와 담당자
- 의료진 이름과 촬영일
- 타임테이블 순서
- 병원 메모
- 제출 동작

담당 수술, 장면 이름/설명, 촬영 시간/분, 장면 추가·삭제 등 허용되지 않은 키가 하나라도 있으면 400을 반환한다.

### 9.3 병원 편집 화면

- 서버 페이지는 토큰을 검증하고, 편집 링크일 때 전용 클라이언트 편집 화면에 최소 데이터만 넘긴다.
- 점선 테두리는 수정 가능, 회색 잠금 면은 읽기 전용이다.
- 2단계 탭은 준비사항·콘티·타임테이블이다.
- 900ms 지연 자동저장과 마지막 저장 시각을 제공한다.
- `작성 완료 보내기`는 `submitted_at`을 기록하고 기존 Olivia 알림 저장 경로로 대시보드 알림을 만든다. 제출 후에도 편집 가능하다.
- 포토클리닉 편집 화면은 `edited_at`을 읽고 `병원이 N분 전에 수정했습니다`와 새로고침 버튼을 표시한다.

## 10. 오류 처리

- API 오류는 서버 메시지를 화면에 그대로 표시한다.
- 공간 매칭은 `matched / total`을 생성 결과에 표시한다.
- `preparation_text` 등 필수 신규 스키마 누락은 fallback 저장으로 감추지 않고 `DB 마이그레이션이 필요합니다`를 표시한다.
- AI 보강 실패 시 결정론적 골격은 유지하고 `AI 보강 없이 기본 구성으로 만들었습니다`를 표시한다.
- 병원 목록·프로필 실패는 생성 화면에 각각 표시한다.
- 취소된 공유 토큰은 데이터 존재 여부를 노출하지 않고 404로 처리한다.

## 11. 검증 전략

### A

- 사진작업실 탭 6개와 `plan` 제거
- 구 링크의 `/conti` 이동 및 쿼리 보존
- 채팅/기능 검색/즐겨찾기/OS 창이 독립 `conti` 앱을 사용
- 공유 링크 회귀 테스트

### B

- 안과, 의료진 7명, 선택 9개에서 콘티 13행과 타임테이블 15행 검증
- 소아·드림렌즈 1회 검증
- 의사 이름·수술 배정, 70분 구성, 0분 여유 경고 검증
- 구 `studio_state` 정규화 검증
- 12열 표와 4시트 Excel 구조 검증
- 모든 진료과 한글 라벨 검증

### C

- hospital 공유만 쓰기 허용
- 잠긴 필드 직접 PATCH 400
- 체크·담당자·의료진 이름·촬영일·순서 저장
- 제출 후 계속 수정 가능
- 취소 토큰 404
- customer/staff 링크 회귀

전체적으로 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`를 실행한다. 실제 브라우저에서는 1920px, 태블릿, Olivia OS 창을 확인하고 Excel 파일은 워크북 시트 수·병합 셀 없음·숫자 셀·수식을 프로그램으로 다시 읽어 검증한다.

## 12. 구현 접근 선택

선택한 접근은 호환성 우선 단계식 전환이다.

- 한 번에 스키마와 화면을 교체하는 원자적 전환은 롤백 범위가 너무 크다.
- 새 V3 테이블을 병렬로 만드는 방식은 기존 canonical 모델과 중복 상태를 만든다.
- 기존 canonical 테이블에 nullable/default 컬럼을 추가하고 정규화 계층에서 구 데이터를 읽는 방식이 요청 범위를 지키면서 가장 작은 변경이다.
