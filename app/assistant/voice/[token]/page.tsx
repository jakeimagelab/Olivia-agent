import VoiceRecorder from "@/app/assistant/voice/[token]/VoiceRecorder";
import { C, R } from "@/lib/theme";

export default async function AssistantVoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: C.bg,
        color: C.ink,
        fontFamily: "inherit",
      }}
    >
      <section
        style={{
          width: "min(440px, 100%)",
          padding: 22,
          borderRadius: R.xl,
          background: C.white,
          border: `1px solid ${C.border}`,
        }}
      >
        <p
          style={{
            margin: "0 0 6px",
            color: C.orange,
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          OLIVIA VOICE
        </p>
        <h1 style={{ margin: 0, fontSize: 23 }}>음성으로 업무 요청</h1>
        <p
          style={{
            margin: "8px 0 18px",
            color: C.muted,
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          녹음은 명령을 텍스트로 바꾼 뒤 보관하지 않습니다.
        </p>
        <VoiceRecorder token={token} />
      </section>
    </main>
  );
}
