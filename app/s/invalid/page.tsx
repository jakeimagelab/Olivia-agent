export default function InvalidSharePage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", background: "#EDF5F3", fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1C2B28", margin: "0 0 8px" }}>이 링크는 더 이상 유효하지 않습니다</h2>
      <p style={{ fontSize: 13, color: "#5A7470", lineHeight: 1.7, margin: 0, maxWidth: 320 }}>
        만료되었거나 취소된 링크입니다. 담당자에게 새 링크를 요청해주세요.
      </p>
    </div>
  );
}
