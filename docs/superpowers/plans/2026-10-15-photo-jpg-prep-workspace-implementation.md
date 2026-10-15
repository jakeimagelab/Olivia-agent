# 사진작업실 JPG정리 구현 계획

## 목표

사진작업실을 7개 상위 탭으로 정리하고, RAW를 변경하지 않는 JPG정리 기능을 로컬·Mac Studio 양쪽에 연결한다.

## 단계

1. 확장자 상수 통합
   - `lib/photo/extensions.ts` 신설
   - 기존 생산 코드 5곳을 공용 상수로 전환
   - 상수 단위 테스트

2. 폴더 선택 훅
   - `lib/photo/useFolderPicker.ts` 신설
   - 지정된 작업실 컴포넌트 4곳과 신규 JPG정리에서 사용
   - 취소·미지원·일반 오류 테스트

3. 사진 분류 중복 제거
   - `PhotoSortingWorkspace.tsx` 내부 `splitRawAndJpg` 함수 신설
   - 기존 두 스캔 경로만 함수 호출로 교체
   - state setter 위치와 mtime 정렬 유지 확인

4. 탭 재구성
   - 사진 셀렉에 T컷 서브탭 추가
   - 파일 정리 껍데기와 resize/rename 서브탭 추가
   - 7개 상위 탭, 가이드, workspace group, tool alias 갱신
   - 옛 mode/tool URL을 새 mode/submode로 정규화

5. JPG정리 신설
   - 로컬 dry-run과 안전한 JPG 이동
   - RAW count-only 보장
   - 동일 파일 skip, 다른 파일 conflict
   - 완료 후 JPG전체 핸들을 사진 셀렉으로 전달
   - 원격 NAS picker와 기존 `PHOTO_PREPARE_SOURCE` 상태 머신 연결

6. 검증
   - 변경 파일 ESLint
   - `npm run typecheck`
   - 관련 Vitest와 전체 Vitest
   - 1280px·760px 실제 브라우저 스크린샷
   - 요청서 6장 체크리스트 실제 값 보고

## 금지 파일 확인

최종 `git diff --name-only`에서 다음이 수정되지 않았는지 확인한다.

- `lib/photo-classifier/node/**`
- `lib/photo-classifier/file-move.ts`
- `lib/photo-storage/executionVerdict.ts`
- `components/photo-workspace/SelectMatchWorkspace.tsx`
- 채팅 도구 구현

