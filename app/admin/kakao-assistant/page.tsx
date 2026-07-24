import KakaoAssistantSettings from "@/components/olivia/kakao/KakaoAssistantSettings";
import { C } from "@/lib/theme";

export default function KakaoAssistantPage() {
  return (
    <main
      style={{
        width: "min(1180px, 100%)",
        margin: "0 auto",
        padding: "28px clamp(16px, 3vw, 32px) 56px",
        color: C.ink,
        fontFamily: "inherit",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <p
          style={{
            margin: "0 0 7px",
            color: C.orange,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.08em",
          }}
        >
          OLIVIA EXTERNAL CHANNEL
        </p>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.03em" }}>
          카카오 AI 비서
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            color: C.muted,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          대표자 계정 연결, 브리핑 수신 시간, 공통 Olivia Core 명령을
          관리합니다.
        </p>
      </header>
      <KakaoAssistantSettings />
    </main>
  );
}
