import GlobalHeader from "@/components/GlobalHeader";
import { VideoProductionWorkspace } from "@/components/video-production/VideoProductionWorkspace";

export default function VideoProductionPage() {
  return (
    <>
      <GlobalHeader title="영상제작" description="AI 이미지·영상 모델을 이용해 촬영 이미지와 아이디어를 영상으로 제작합니다." />
      <VideoProductionWorkspace />
    </>
  );
}
