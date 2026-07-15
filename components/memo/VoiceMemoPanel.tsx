"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  memoId: string | null;
  existingUrl?: string | null;
  transcript: string;
  summary: string;
  ensureSaved: () => Promise<string>;
  onProcessed: (values: { audioUrl: string | null; duration: number; transcript: string; summary: string }) => void;
  onTranscriptChange: (value: string) => void;
};

const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export default function VoiceMemoPanel({ memoId, existingUrl, transcript, summary, ensureSaved, onProcessed, onTranscriptChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: type });
      streamRef.current = stream; chunksRef.current = []; blobRef.current = null;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        setLocalUrl(current => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
        stream.getTracks().forEach(track => track.stop()); streamRef.current = null;
      };
      recorder.start(1000); recorderRef.current = recorder;
      setSeconds(0); setPaused(false); setRecording(true);
      timerRef.current = setInterval(() => setSeconds(value => value + 1), 1000);
    } catch { setError("마이크 권한을 허용해주세요."); }
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") { recorder.pause(); setPaused(true); if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; }
    else if (recorder.state === "paused") { recorder.resume(); setPaused(false); timerRef.current = setInterval(() => setSeconds(value => value + 1), 1000); }
  };

  const stop = () => {
    recorderRef.current?.stop(); setRecording(false); setPaused(false);
    if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null;
  };

  const process = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setBusy(true); setError("");
    try {
      const id = memoId || await ensureSaved();
      const audio = new File([blob], "consultation.webm", { type: blob.type || "audio/webm" });
      const upload = new FormData(); upload.append("file", audio); upload.append("memo_id", id); upload.append("kind", "audio"); upload.append("duration_seconds", String(seconds));
      const uploadResponse = await fetch("/api/memo/assets", { method: "POST", body: upload });
      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadData.ok) throw new Error(uploadData.error || "음성 저장 실패");
      const transcription = new FormData(); transcription.append("audio", audio); transcription.append("memo_id", id);
      const response = await fetch("/api/memo/transcribe", { method: "POST", body: transcription });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "음성 분석 실패");
      onProcessed({ audioUrl: uploadData.url, duration: seconds, transcript: data.transcript, summary: data.summary });
    } catch (error) { setError(error instanceof Error ? error.message : "음성 처리 실패"); }
    finally { setBusy(false); }
  };

  const audioUrl = localUrl || existingUrl;
  return (
    <section style={{ padding: 6, borderRadius: 22, background: "rgba(21,88,85,.06)" }}>
      <div style={{ padding: 18, borderRadius: 16, background: "#fff" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!recording ? <button onClick={() => void start()} disabled={busy} style={{ minHeight: 42, border: "none", borderRadius: 99, padding: "0 17px", background: "#155855", color: "#fff", font: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>● 녹음 시작</button> : <>
            <button onClick={togglePause} style={{ minHeight: 42, border: "none", borderRadius: 99, padding: "0 15px", background: "#F4E8C8", color: "#6F5010", font: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>{paused ? "▶ 이어 녹음" : "Ⅱ 일시정지"}</button>
            <button onClick={stop} style={{ minHeight: 42, border: "none", borderRadius: 99, padding: "0 15px", background: "#E85D2C", color: "#fff", font: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>■ 종료 · {formatTime(seconds)}</button>
          </>}
          {audioUrl && !recording ? <audio controls src={audioUrl} style={{ height: 38, flex: "1 1 220px" }} /> : null}
          {localUrl && !recording ? <button onClick={() => void process()} disabled={busy} style={{ minHeight: 42, border: "none", borderRadius: 99, padding: "0 17px", background: "#E85D2C", color: "#fff", font: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>{busy ? "저장·분석 중…" : "저장 + AI 요약"}</button> : null}
        </div>
        {error ? <div role="alert" style={{ marginTop: 10, color: "#B42318", fontSize: 12, fontWeight: 800 }}>{error}</div> : null}
        {transcript || summary ? <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <label><span style={{ display: "block", color: "#607873", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", marginBottom: 6 }}>TRANSCRIPT</span><textarea value={transcript} onChange={event => onTranscriptChange(event.target.value)} rows={5} style={{ width: "100%", border: "none", borderRadius: 12, padding: 12, background: "#EDF5F3", boxSizing: "border-box", resize: "vertical", font: "inherit", fontSize: 12, lineHeight: 1.7, outline: "none" }} /></label>
          {summary ? <div><span style={{ display: "block", color: "#E85D2C", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", marginBottom: 6 }}>AI SUMMARY</span><div style={{ whiteSpace: "pre-wrap", padding: 13, borderRadius: 12, background: "#FFF7F3", color: "#4A3931", fontSize: 12, lineHeight: 1.7 }}>{summary}</div></div> : null}
        </div> : null}
      </div>
    </section>
  );
}
