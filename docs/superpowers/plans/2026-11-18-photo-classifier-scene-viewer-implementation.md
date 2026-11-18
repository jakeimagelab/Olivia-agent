# 사진 분류 장면 이미지 뷰어 구현 계획

1. 행 시작·끝 썸네일을 96×64px로 확대하고 라벨과 클릭 콜백을 추가한다.
2. 브라우저 사진 분류의 행 썸네일 생성 크기를 160px에서 320px로 변경한다.
3. 원본 Object URL 수명, 키보드 이동, 바깥 클릭 닫기, 필름스트립 지연 로딩을 담당하는 `SceneImageViewer`를 만든다.
4. `FieldSceneReviewList`에 단일 뷰어 상태를 두고 행 클릭과 기존 `onSplitScene`을 연결한다.
5. Object URL 해제, 분할 offset, 충돌 사본 차이를 검증하는 테스트를 추가한다.
6. `npx tsc --noEmit`, 관련 Vitest, 실제 UI 캡처를 실행한다.
