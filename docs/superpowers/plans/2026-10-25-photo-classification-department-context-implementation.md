# 사진 분류 진료과 자동 연결 구현 계획

작성일: 2026-10-25
기준 설계: `docs/superpowers/specs/2026-10-25-photo-classification-department-context-design.md`

## 목표

등록 고객·프로젝트·폴더에서 진료과를 확인할 수 있으면 사진 분류가 그 값을 자동 적용한다. 정형외과·신경외과·마취통증의학과·재활의학과는 기존 내부 키 `orthopedics_neurosurgery`를 사용하는 `근골격·통증계`로 통합하고, 진료과가 없거나 충돌할 때만 사용자 선택을 요청한다.

## 1. 공통 진료과 해석 계약

대상 파일:

- `lib/photo-classifier/departmentResolver.ts`
- `lib/photo-classifier/types.ts`
- 신규 또는 기존 진료과 resolver 테스트

작업:

1. 진료과 후보의 출처와 `resolved`/`unknown`/`conflict` 상태를 표현하는 타입을 추가한다.
2. 기존 `departmentFromPhotoText`를 유지하면서 긴 표현 우선, 오탐 방지, 재활의학과 및 근골격·통증계 별칭을 지원한다.
3. 여러 후보를 하나의 해석 결과로 합치는 순수 함수를 추가한다.
4. 사용자 직접 선택은 자동 출처보다 우선하도록 별도 source로 표현한다.
5. `DEPARTMENT_DISPLAY.orthopedics_neurosurgery`를 `근골격·통증계`로 변경하고 네 과 설명 문자열을 단일 상수로 제공한다.

검증:

- 네 과와 대표 축약어가 같은 내부 키로 해석된다.
- `성형외과`, `신경과`는 근골격·통증계로 오인되지 않는다.
- 같은 그룹의 복수 근거는 resolved, 다른 그룹은 conflict가 된다.
- 근거가 없으면 기본 진료과 없이 unknown이 된다.

## 2. 등록 데이터 기반 진료과 컨텍스트 API

대상 파일:

- 신규 `app/api/photo-classification/department-context/route.ts`
- 신규 API/service 테스트

작업:

1. `clientId`, `workflowRunId`, `folderName`을 입력받는 읽기 전용 API를 추가한다.
2. workflow run이 있으면 연결된 client id를 확인하고, 연결 고객의 `specialty`/`department`를 읽는다.
3. 연결 고객이 없을 때 날짜 접두어를 제거하고 Unicode를 정규화한 폴더명으로 등록 고객을 정확히 조회한다.
4. 폴더 자체의 진료과 표현도 후보로 추가한다.
5. 공통 순수 해석기로 결과와 근거를 반환한다.
6. 조회 실패를 피부과나 기타로 대체하지 않는다.

검증:

- 연결 고객, workflow 연결 고객, 정확한 폴더 고객, 폴더 키워드 순서가 지켜진다.
- 같은 그룹 원문은 충돌하지 않는다.
- 다른 그룹 근거는 conflict로 반환된다.
- 알 수 없는 진료과는 unknown이다.

## 3. 사진작업실 컨텍스트 전달

대상 파일:

- `components/photo-workspace/PhotoWorkspace.tsx`
- `components/photo-workspace/PhotoStudioExecutionContext.tsx`
- `components/olivia-os/adapters/OliviaBridgeWindowContent.tsx`
- `components/olivia-bridge/OliviaBridgeWorkspace.tsx`

작업:

1. `PhotoWorkspaceContent`가 이미 받은 `clientId`/`workflowRunId`를 버리지 않고 사진 분류에 전달한다.
2. 사진 작업 실행 컨텍스트에 현재 고객·프로젝트 식별자와 진료과 해석 결과를 보관한다.
3. Bridge 창도 `WindowContext`를 받아 고객·프로젝트 식별자를 실행 컨텍스트에 제공한다.
4. 폴더가 바뀌면 폴더에서 파생된 이전 진료과 결과를 폐기하고 다시 해석한다.
5. 사용자 직접 변경 결과는 같은 폴더 세션에서 자동 해석이 덮어쓰지 않게 한다.

검증:

- 사진작업실과 Bridge 창 컨텍스트가 동일하게 전달된다.
- 폴더 변경 시 오래된 자동 해석값이 남지 않는다.
- 수동 선택은 자동 재조회 후에도 유지된다.

## 4. Bridge 계획에 진료과 포함

대상 파일:

- `lib/photo-bridge/classificationPlan.ts`
- `components/olivia-bridge/OliviaBridgeWorkspace.tsx`
- `components/photo-classifier/PhotoSortingWorkspace.tsx`
- `tests/oliviaBridgeClassificationPlan.test.ts`

작업:

1. Bridge 계획 버전을 올리고 진료과 해석 결과를 포함한다.
2. 해결된 진료과는 Scene 계획 승인 시 함께 stage한다.
3. unknown/conflict이면 Scene 분석 결과를 유지한 채 Bridge 검토 창에서 진료과 확인 UI를 표시한다.
4. 사진 분류는 Bridge 계획을 소비할 때 Scene과 진료과를 함께 복원한다.
5. 현재 컨텍스트와 계획 진료과가 충돌하면 자동 적용하지 않고 확인 상태로 전환한다.
6. 진료과를 확인하더라도 Bridge 특징 추출과 Scene 경계 분석은 반복하지 않는다.

검증:

- 계획 round-trip에서 진료과·원문·출처가 보존된다.
- 지원하지 않는 계획 버전은 거부된다.
- Bridge 계획 적용 후 기본 피부과 값이 나타나지 않는다.

## 5. 사진 분류 자동 적용 UI

대상 파일:

- `components/photo-classifier/PhotoSortingWorkspace.tsx`
- 관련 스타일 또는 컴포넌트 테스트

작업:

1. 초기 폴더·고객·프로젝트 컨텍스트가 바뀌면 공통 API로 진료과를 해석한다.
2. resolved이면 `department`를 초기화하고 큰 진료과 그리드를 접는다.
3. `근골격·통증계 적용됨 · <출처>`와 약한 `변경` 동작을 표시한다.
4. 원문이 네 과 중 하나이면 `<원문> → 근골격·통증계 규칙`을 보조 설명으로 표시한다.
5. unknown/conflict이면 이유를 보여주고 선택 그리드를 펼친다.
6. 진료과 확정 전에는 진료과 로직이 필요한 분류 실행을 비활성화하고 다음 행동을 한 줄로 설명한다.
7. 기존 고급 설정, Scene 검토, 최종 파일 정리 UI와 기능은 보존한다.

검증:

- resolved/unknown/conflict/수동 변경 네 상태의 렌더링과 실행 조건을 확인한다.
- 자동 적용 화면에 새 탭이나 두 번째 채운 CTA가 생기지 않는다.
- 넓은 화면과 좁은 창에서 출처·변경 동작을 확인한다.

## 6. 채팅형 사진 분류의 조건부 질문

대상 파일:

- `lib/store/usePhotoClassificationChatStore.ts`
- `components/olivia/PhotoClassificationChatCard.tsx`
- 관련 채팅 흐름 테스트

작업:

1. 병원 현장촬영 선택 직후 무조건 `choose_department`로 가지 않게 한다.
2. 연결 고객·프로젝트로 해결되면 진료과를 적용하고 폴더 선택으로 이동한다.
3. 연결 정보가 없으면 폴더를 먼저 선택한 뒤 컨텍스트 API를 호출한다.
4. resolved이면 `choose_department`를 건너뛰고 다음 설정 단계로 이동한다.
5. unknown/conflict일 때만 진료과 선택을 노출한다.
6. handoff에는 최종 확정 진료과와 출처를 전달한다.

검증:

- 알려진 고객과 재활의학과 폴더는 진료과 질문을 생략한다.
- 모르는 폴더와 충돌 데이터는 질문한다.
- 기존 경계시간·분류 방식·옵션·시작 handoff가 유지된다.

## 7. NAS/원격 경로 통일

대상 파일:

- `lib/olivia/v2/toolExecutors/nasBackup.ts`
- `app/api/worker/events/[id]/start-classification/route.ts`
- `tests/nasBackupTools.test.ts`

작업:

1. 두 경로가 확장된 공통 진료과 표현 해석기를 사용하게 한다.
2. 재활의학과와 네 과의 별칭을 근골격·통증계로 전달한다.
3. 알 수 없는 진료과에서 기존처럼 작업 생성을 중단한다.
4. worker event 경로의 `general` 임의 기본값을 제거하고 등록 고객 보완 또는 명시적 오류로 맞춘다.

검증:

- 재활의학과 폴더가 `orthopedics_neurosurgery`로 시작된다.
- unknown은 `PHOTO_DEPARTMENT_REQUIRED`에 해당하는 오류를 반환한다.
- 기존 RAW 보호와 작업 중복 방지는 그대로 동작한다.

## 8. 최종 검증과 커밋

1. 변경 파일 ESLint 실행
2. `npm run typecheck`
3. 진료과 resolver, Bridge, 사진 분류, NAS 관련 테스트 실행
4. 전체 `npm test`
5. `npm run build`
6. 로컬 브라우저에서 넓은 화면과 좁은 창 검증
7. 변경 파일만 stage해 기능 커밋
8. 기존 추적되지 않은 파일과 사용자 작업은 건드리지 않음

## 완료 기준

- 네 과가 `근골격·통증계`로 자동 적용된다.
- 등록 정보가 있으면 진료과 선택이 반복되지 않는다.
- Bridge 계획이 진료과를 잃지 않는다.
- unknown/conflict에서만 사용자가 선택한다.
- 피부과 기본값으로 조용히 폴백하지 않는다.
- 기존 파일 분류와 최종 정리 기능이 회귀하지 않는다.
