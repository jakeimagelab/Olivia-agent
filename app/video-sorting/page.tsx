"use client";

import GlobalHeader from "@/components/GlobalHeader";
import VideoSortingWorkspace from "@/components/video-studio/VideoSortingWorkspace";

// 영상 분류는 영상작업실의 탭으로 옮겼다. Olivia OS에서는 /video-sorting이 영상작업실 › 영상 분류로
// 열리고(workspaceGroups의 sourceHrefs), 이 단독 페이지는 외부 공유 링크(pc_share_scope=/video-sorting)
// 호환용으로만 남긴다. 사진작업실 탭 묶음((photo-studio) 레이아웃)에서는 빠진다.
export default function VideoSortingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f2" }}>
      <GlobalHeader title="영상 분류" description="영상 파일을 AI가 카테고리별로 자동 분류하거나 촬영 시간 간격으로 Scene 폴더로 나누어 정리합니다." />
      <div className="pc-page-content">
        <VideoSortingWorkspace />
      </div>
    </div>
  );
}
