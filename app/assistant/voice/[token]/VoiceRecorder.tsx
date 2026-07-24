"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { C, R } from "@/lib/theme";

export default function VoiceRecorder({ token }: { token: string }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [valid, setValid] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{
    transcript?: string;
    text?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/assistant/voice/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then((response) => setValid(response.ok))
      .catch(() => setValid(false));
  }, [token]);

  useEffect(() => {
    if (!audio) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  const start = async () => {
    setResult(null);
    setAudio(null);
    setStatus("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setAudio(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch {
      setStatus("마이크 권한을 허용해 주세요.");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const submit = async () => {
    if (!audio) return;
    setStatus("음성을 이해하고 업무를 확인하고 있어요.");
    const form = new FormData();
    form.append("audio", new File([audio], "olivia-voice.webm", { type: audio.type }));
    try {
      const response = await fetch(
        `/api/assistant/voice/${encodeURIComponent(token)}`,
        { method: "POST", body: form },
      );
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setResult({ transcript: data.transcript, text: data.text });
      setStatus("");
      setValid(false);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "음성 요청 처리에 실패했습니다.",
      );
    }
  };

  if (valid === null) return <p style={{ color: C.muted }}>링크를 확인하고 있습니다.</p>;
  if (!valid && !result) {
    return <p style={{ color: C.danger }}>만료되었거나 이미 사용한 음성 입력 링크입니다.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {!result ? (
        <>
          <button
            type="button"
            onClick={recording ? stop : start}
            style={{
              border: 0,
              borderRadius: R.xl,
              minHeight: 112,
              background: recording ? C.orange : C.teal,
              color: C.white,
              font: "inherit",
              fontSize: 16,
              fontWeight: 850,
              display: "grid",
              placeItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            {recording ? <Square size={28} /> : <Mic size={32} />}
            {recording ? "녹음 멈추기" : "눌러서 말하기"}
          </button>
          {audio && !recording ? (
            <>
              <audio controls src={audioUrl} style={{ width: "100%" }} />
              <button
                type="button"
                onClick={() => void submit()}
                style={{
                  border: 0,
                  borderRadius: R.md,
                  padding: 12,
                  background: C.orange,
                  color: C.white,
                  font: "inherit",
                  fontWeight: 850,
                  cursor: "pointer",
                }}
              >
                <Upload size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
                Olivia에게 보내기
              </button>
            </>
          ) : null}
        </>
      ) : (
        <div
          style={{
            padding: 16,
            borderRadius: R.xl,
            background: C.mint,
            lineHeight: 1.65,
          }}
        >
          <small style={{ color: C.muted }}>인식한 내용</small>
          <p style={{ margin: "4px 0 14px", fontWeight: 750 }}>{result.transcript}</p>
          <small style={{ color: C.muted }}>Olivia</small>
          <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{result.text}</p>
        </div>
      )}
      {status ? (
        <p role="status" style={{ margin: 0, color: C.muted, fontSize: 12 }}>
          {status}
        </p>
      ) : null}
    </div>
  );
}
