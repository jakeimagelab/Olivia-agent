"use client";

// 견적/계약, 콘티 스튜디오, 문서함은 Phase 1에서 실제 기능을 연결하지 않는다(스펙 1-12) —
// 하지만 Registry/Shortcut/Dock에는 그대로 노출해야 하므로(스펙 1-4/1-5), 창 자체는 진짜로
// 열리고 drag/resize/close가 다 되는 진짜 AppWindow를 쓰되 내용만 "준비 중"으로 채운다.
export function ComingSoonPlaceholder({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, height: "100%", padding: 24, textAlign: "center", color: "#5A7470" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2B28" }}>{title}은(는) 곧 지원됩니다</div>
      <div style={{ fontSize: 11.5 }}>이 창은 준비 중인 기능의 자리표시자입니다.</div>
    </div>
  );
}
