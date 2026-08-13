// DynamicWorkspace의 실제 데이터가 오기 전, 같은 위치에 먼저 보여주는 상태 카드.
// DynamicWorkspace.tsx의 헤더/바디 셸 구조를 그대로 흉내내서 실제 화면으로 크로스페이드될 때
// 레이아웃이 튀지 않게 한다.
export default function OliviaWorkspaceSkeleton({ label }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
        borderRadius: 22, background: "#fff", border: "1px solid rgba(21,88,85,0.08)",
        boxShadow: "0 12px 40px rgba(20,60,55,0.06)", overflow: "hidden",
      }}
    >
      <header style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
        padding: "12px 18px", borderBottom: "1px solid rgba(21,88,85,0.1)",
      }}>
        <span className="olivia-workspace-skeleton__pulse" style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 800, color: "#155855", letterSpacing: ".04em", marginBottom: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22876A", flexShrink: 0 }} />
            OLIVIA CONTEXT ACTIVE
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1C2B28" }}>{label || "화면을 준비하는 중…"}</div>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="olivia-workspace-skeleton__pulse" style={{ height: 34, borderRadius: 12, width: "60%" }} />
        <span className="olivia-workspace-skeleton__pulse" style={{ height: 84, borderRadius: 14 }} />
        <span className="olivia-workspace-skeleton__pulse" style={{ height: 84, borderRadius: 14 }} />
        <span className="olivia-workspace-skeleton__pulse" style={{ height: 84, borderRadius: 14, width: "80%" }} />
      </div>
    </div>
  );
}
