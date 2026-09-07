import GlobalHeader from "@/components/GlobalHeader";
import PortraitConsentApp from "@/components/portrait-consent/PortraitConsentApp";

export default function PortraitConsentPage() {
  return <><GlobalHeader title="초상권 동의서" description="촬영 대상자의 사진·영상 촬영 및 활용 동의서를 작성하고 서명을 받습니다." /><PortraitConsentApp /></>;
}
