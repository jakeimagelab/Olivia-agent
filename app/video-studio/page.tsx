"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import VideoStudio from "@/components/video-studio/VideoStudio";

function VideoStudioRoute() {
  const searchParams = useSearchParams();
  return <VideoStudio initialTab={searchParams.get("tab")} />;
}

export default function VideoStudioPage() {
  return (
    <PhotoStudioExecutionProvider>
      <PhotoStudioExecutionBar />
      <Suspense fallback={null}>
        <VideoStudioRoute />
      </Suspense>
    </PhotoStudioExecutionProvider>
  );
}
