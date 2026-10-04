import GlobalHeader from "@/components/GlobalHeader";
import contiStyles from "@/components/conti/v2/ContiV2.module.css";

const MESH_BG = "#edf7f1";

export default function ContiStudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "var(--font-sans)" }}>
      <GlobalHeader title="콘티" description="진료과와 촬영 항목을 선택하면 실제 촬영 가능한 콘티를 자동으로 구성합니다." />
      <div className={`pc-page-content ${contiStyles.routeStyleAnchor}`}>
        {children}
      </div>
    </div>
  );
}
