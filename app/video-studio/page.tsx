"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import VideoStudio from "@/components/video-studio/VideoStudio";

function VideoStudioRoute() {
  const searchParams = useSearchParams();
  return <VideoStudio initialTab={searchParams.get("tab")} initialTool={searchParams.get("tool")} />;
}

export default function VideoStudioPage() {
  return (
    <PhotoStudioExecutionProvider>
      <Suspense fallback={null}>
        <VideoStudioRoute />
      </Suspense>
    </PhotoStudioExecutionProvider>
  );
}
