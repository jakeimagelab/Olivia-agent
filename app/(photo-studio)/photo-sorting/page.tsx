import { Suspense } from "react";
import PhotoWorkspace from "@/components/photo-workspace/PhotoWorkspace";
import OliviaWorkspaceRouteBridge from "@/components/olivia/OliviaWorkspaceRouteBridge";

// photo-sort는 PhotoWorkspace가 이미 자체 탭/URL 체계(mode=select|raw-match|classification|
// conversion)를 갖고 있어 다른 세 워크스페이스처럼 70/30 스플릿을 얹지 않는다(known
// limitation, docs/superpowers/specs/2026-09-01-olivia-2-persistent-workspace-design.md 참고).
// route bridge는 sync 전용(renderSplitView=false)으로만 붙여서, 채팅에서 "사진 분류로
// 넘어가자"처럼 다른 라우트에서 여기로 전환할 때 워크스페이스 store/URL이 맞게 동기화되게만 한다.
export default function PhotoSortingPage() {
  return (
    <>
      <Suspense fallback={null}>
        <OliviaWorkspaceRouteBridge workspaceType="photo-sort" renderSplitView={false} />
      </Suspense>
      <PhotoWorkspace />
    </>
  );
}
