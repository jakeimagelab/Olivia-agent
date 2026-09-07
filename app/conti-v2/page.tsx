import GlobalHeader from "@/components/GlobalHeader";
import ContiV2App from "@/components/conti/v2/ContiV2App";

// 신규 결정론적 콘티 생성 시스템. 주소를 직접 치고 들어오는 경우(북마크 등)를 위한 독립
// 페이지 — 평소에는 OLIVIA OS 데스크탑에서 "모든 앱 → 콘티 (신규)"로 창을 띄워서 쓴다
// (components/olivia-os/adapters/ContiV2WindowContent.tsx). 기존 /conti(ContiBuilder,
// 자유생성 GPT)는 그대로 둔 채 검증한다 — 확인되면 이 화면이 /conti를 대체한다.
export default function ContiV2Page() {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F1EB" }}>
      <GlobalHeader title="콘티 (신규)" description="체크 → AI 초안 → 사람이 마무리하는 콘티 생성 — 검증용입니다." />
      <ContiV2App />
    </div>
  );
}
