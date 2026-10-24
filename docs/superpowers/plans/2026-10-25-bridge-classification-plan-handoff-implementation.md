# Bridge Scene 계획 → 사진 분류 연결 구현 계획

설계 기준: `docs/superpowers/specs/2026-10-25-bridge-classification-plan-handoff-design.md`

## 목표

Bridge에서 승인한 Scene 분석 결과를 기존 사진 분류의 Scene 검토 상태로 한 번만 전달한다. 같은 사진의 특징 추출과 경계 계산을 반복하지 않고, 최종 정리 승인 전에는 파일 시스템을 변경하지 않는다.

## 단계

1. Bridge 분류 계획 계약
   - `lib/photo-bridge/classificationPlan.ts`에 버전이 있는 계획 타입, 생성 함수, 구조 검증 함수를 추가한다.
   - 정렬된 파일과 안정화 경계로 기존 `FieldScene`을 만드는 변환 함수를 둔다.
   - 잘못된 범위, 파일 변경, 폴더 불일치 테스트를 먼저 추가한다.

2. Scene 분석 결과 확장
   - `analyzeBridgeScenes`가 표시용 Scene뿐 아니라 정렬 파일, 특징값, 경계 결정을 반환하게 한다.
   - 기존 Bridge Scene 표시는 같은 결과를 사용하도록 바꾼다.
   - 빈 폴더와 취소 동작을 유지한다.

3. 공유 실행 컨텍스트 연결
   - `PhotoStudioExecutionContext`에 보류 계획 등록, 원자적 일회 소비, 폐기 API를 추가한다.
   - 로컬 폴더 변경 시 기존 계획을 폐기한다.
   - localStorage나 서버에는 저장하지 않는다.

4. Bridge 승인 동작 연결
   - 완료된 최신 분석만 계획으로 등록한다.
   - CTA를 `계획 적용하고 Scene 검토`로 바꾸고 비활성 이유를 유지한다.
   - 등록 후 기존 임베디드 사진 분류 창을 연다.

5. 사진 분류 계획 적용
   - 임베디드 사진 분류가 보류 계획을 한 번 소비한다.
   - 폴더와 JPG 서명을 검증하고 RAW 핸들을 수집한다.
   - 성공 시 기존 `FieldScene`, 경계, 통계, `WAITING_REVIEW`, Scene 검토 단계로 초기화한다.
   - Bridge 계획 적용 중에는 폴더 사전 분석과 `handleFieldSort`를 자동 실행하지 않는다.
   - 실패 시 파일을 변경하지 않고 설정 단계에 오류와 복구 방법을 표시한다.

6. 상태 안내 UI
   - 기존 중성 다크 토큰으로 `Bridge 계획 적용됨 · Scene N개 · JPG N장` 안내를 표시한다.
   - 새 탭이나 두 번째 채운 CTA를 만들지 않는다.
   - 기존 Scene 이름 변경·합치기·나누기·최종 정리 UI를 재사용한다.

7. 검증
   - 신규 계획 단위 테스트
   - Bridge 기존 테스트와 사진 분류 관련 회귀 테스트
   - `npm run typecheck`, 변경 파일 ESLint, 프로덕션 빌드
   - File System Access가 가능한 Chromium에서 넓은 화면과 좁은 창의 승인→Scene 검토 흐름 확인
   - 최종 `git diff --check`와 변경 파일 범위 확인

## 변경 예상 파일

- `lib/photo-bridge/bridgeFiles.ts`
- `lib/photo-bridge/classificationPlan.ts`
- `components/photo-workspace/PhotoStudioExecutionContext.tsx`
- `components/olivia-bridge/OliviaBridgeWorkspace.tsx`
- `components/photo-classifier/PhotoSortingWorkspace.tsx`
- 관련 테스트 파일

## 보존 조건

- 최종 정리 승인 전 파일 이동·이름 변경·폴더 생성 금지
- 기존 분류 알고리즘과 최종 정리 함수 수정 금지
- 원격 분류 경로 변경 금지
- 다른 Bridge 도구의 폴더·선택·별점 공유 동작 유지
- 기존 미추적 파일을 커밋하거나 정리하지 않음

