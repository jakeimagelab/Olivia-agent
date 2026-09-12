# Review Content Studio V2 P0 Renderer 구현 계획

1. Canonical document의 geometry와 공용 이미지·텍스트·도형 출력을 담당하는 `ReviewCanvasRenderer`를 추가하고 레이어 스타일 회귀 테스트를 작성한다.
2. `ReviewStoryCanvas`를 1080×1350 Renderer + 외부 visual-scale wrapper 구조로 바꾸고 기존 선택·이동·크롭·텍스트 편집 동작을 연결한다.
3. 폰트와 이미지 `decode()`를 기다리는 resource-ready helper와 동일 Renderer를 캡처하는 `ReviewCanvasExportHost`를 추가한다.
4. 저장 PNG, 기본 PNG, 2× PNG, PDF가 모두 Export Host의 동일 snapshot 함수를 사용하도록 Workspace를 변경하고 결과 dimensions를 검증한다.
5. Page Strip thumbnail을 저장 PNG 대신 공용 Renderer의 축소 표현으로 바꿔 unsaved 문서와 기존 문서를 동일하게 표시한다.
6. 운영 DB의 기존 `image_storage_path NOT NULL` 제약을 유지하면서 pending sentinel 경로를 사용하고, Canonical PNG가 저장되기 전에는 서명·승인을 차단한다.
7. `generate-variants`와 Olivia 자동 캠페인에서 SVG/Sharp 이미지 조립을 제거하고 `editorDocument` 중심 variant를 생성하도록 전환한다.
8. 별도 Canvas 2D client renderer를 제거하고 서버 SVG renderer가 Review Studio 출력 경로에서 더 이상 사용되지 않는지 정적 검사한다.
9. 단위 테스트, 타입 검사, 전체 테스트, 프로덕션 빌드를 실행한다.
10. 실제 Review Studio에서 긴 한글 본문, 이미지 crop, URL, zoom, 기본/2× PNG와 PDF를 브라우저로 검증한다.
