"use client";

import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import VideoStudio from "@/components/video-studio/VideoStudio";

export default function VideoStudioPage() {
  return (
    <PhotoStudioExecutionProvider>
      <PhotoStudioExecutionBar />
      <VideoStudio />
    </PhotoStudioExecutionProvider>
  );
}
