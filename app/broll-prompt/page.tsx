"use client";

import { useRef, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { C, R } from "@/lib/theme";

const FIXED_STYLE_SUFFIX =
  "flat illustration, sky blue and charcoal color palette, minimal medical diagram style, no text, no watermark, " +
  "anatomically simplified, educational tone, non-graphic, no real identifiable people";

type GeneratedPrompt = { id: string; snippet: string; prompt: string; createdAt: number };

function relativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 10) return "방금 전";
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}시간 전`;
}

function Panel({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="pc-card pc-card--padded" style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 26, height: 26, borderRadius: "50%", background: C.teal, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>{number}</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function BrollPromptPage() {
  const [fullScript, setFullScript] = useState("");
  const [targetSnippet, setTargetSnippet] = useState("");
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scriptRef = useRef<HTMLTextAreaElement>(null);

  const handleScriptSelect = () => {
    const el = scriptRef.current;
    if (!el) return;
    const selected = el.value.slice(el.selectionStart, el.selectionEnd).trim();
    if (selected) setTargetSnippet(selected);
  };

  const generate = async () => {
    if (!targetSnippet.trim() || generating) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/broll-prompt-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullScript, targetSnippet }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setPrompts((prev) => [{ id: crypto.randomUUID(), snippet: targetSnippet, prompt: data.prompt, createdAt: Date.now() }, ...prev]);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "프롬프트 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const regenerate = async (snippet: string) => {
    if (generating) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/broll-prompt-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullScript, targetSnippet: snippet }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setPrompts((prev) => [{ id: crypto.randomUUID(), snippet, prompt: data.prompt, createdAt: Date.now() }, ...prev]);
    } catch (regenerateError) {
      setError(regenerateError instanceof Error ? regenerateError.message : "재생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (item: GeneratedPrompt) => {
    await navigator.clipboard.writeText(item.prompt).catch(() => {});
    setCopiedId(item.id);
    setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1500);
  };

  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <PageHeader title="B롤 이미지 프롬프트 생성기" />
      <div className="pc-content pc-content--wide">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
          유튜브 대본에서 이미지화할 구간을 골라, 이미지 생성 AI에 바로 붙여넣을 영문 프롬프트를 만듭니다. 이미지 생성 자체는 하지 않습니다.
        </p>

        <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ flex: "0.54 1 340px", minWidth: 0 }}>
            <Panel number={1} title="전체 대본">
              <textarea
                ref={scriptRef}
                value={fullScript}
                onChange={(e) => setFullScript(e.target.value)}
                onMouseUp={handleScriptSelect}
                onKeyUp={handleScriptSelect}
                placeholder="유튜브 대본 전체를 붙여넣으세요. 텍스트를 드래그해서 선택하면 ②번에 자동으로 채워져요."
                style={{
                  flex: 1, minHeight: 420, width: "100%", resize: "vertical", boxSizing: "border-box",
                  border: `1px solid ${C.border}`, borderRadius: R.sm, padding: 12,
                  fontSize: 13, lineHeight: 1.7, color: C.ink, background: C.bg, outline: "none", fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: C.hint }}>
                <span>텍스트를 드래그해서 선택하면 ②번에 자동으로 채워져요.</span>
                <span>{fullScript.length.toLocaleString()}자</span>
              </div>
            </Panel>
          </div>

          <div style={{ flex: "0 0 420px", minWidth: 0 }}>
            <Panel number={2} title="이미지화할 구간">
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 700 }}>드래그 선택 또는 직접 입력</div>
              <textarea
                value={targetSnippet}
                onChange={(e) => setTargetSnippet(e.target.value)}
                placeholder="① 대본에서 드래그로 구간을 선택하거나, 여기에 직접 입력/붙여넣기 하세요."
                style={{
                  minHeight: 180, width: "100%", resize: "vertical", boxSizing: "border-box",
                  border: `1px solid ${C.sage}`, borderRadius: R.sm, padding: 12,
                  fontSize: 13, lineHeight: 1.7, color: C.ink, background: C.mint, outline: "none", fontFamily: "inherit",
                }}
              />

              <button
                type="button"
                onClick={generate}
                disabled={!targetSnippet.trim() || generating}
                style={{
                  marginTop: 14, width: "100%", height: 42, border: 0, borderRadius: R.md,
                  background: C.orange, color: "#fff", fontSize: 13, fontWeight: 800,
                  cursor: !targetSnippet.trim() || generating ? "not-allowed" : "pointer",
                  opacity: !targetSnippet.trim() || generating ? 0.55 : 1,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Sparkles size={15} />{generating ? "생성 중..." : "프롬프트 생성"}
              </button>
              {error ? <p style={{ marginTop: 8, fontSize: 11.5, color: C.danger, fontWeight: 700 }}>{error}</p> : null}

              <div style={{ marginTop: 14, padding: 12, borderRadius: R.sm, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginBottom: 6 }}>고정 스타일 (자동 적용)</div>
                <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6, color: C.hint, fontFamily: "monospace" }}>{FIXED_STYLE_SUFFIX}</p>
              </div>
            </Panel>
          </div>

          <div style={{ flex: "0 0 600px", minWidth: 0 }}>
            <Panel number={3} title="생성된 프롬프트">
              {prompts.length === 0 ? (
                <p style={{ fontSize: 12.5, color: C.hint }}>아직 생성된 프롬프트가 없습니다. ②번에서 구간을 고르고 프롬프트를 생성해보세요.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", maxHeight: 560 }}>
                  {prompts.map((item) => (
                    <div key={item.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.lg, padding: 14 }}>
                      <span style={{
                        display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontSize: 10.5, fontWeight: 700, color: C.teal, background: C.mint, borderRadius: R.full, padding: "3px 10px", marginBottom: 10,
                      }}>
                        {item.snippet.length > 40 ? `${item.snippet.slice(0, 40)}…` : item.snippet}
                      </span>
                      <pre style={{
                        margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace",
                        fontSize: 11.5, lineHeight: 1.7, color: "#EAF4F2", background: C.ink, borderRadius: R.sm, padding: 12,
                      }}>{item.prompt}</pre>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => copy(item)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5, border: 0, borderRadius: R.sm,
                            background: C.mint, color: C.teal, fontSize: 11.5, fontWeight: 800, padding: "7px 12px", cursor: "pointer",
                          }}
                        >
                          {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                          {copiedId === item.id ? "복사됨" : "복사"}
                        </button>
                        <button
                          type="button"
                          disabled={generating}
                          onClick={() => regenerate(item.snippet)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5, borderRadius: R.sm,
                            border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 11.5, fontWeight: 800,
                            padding: "7px 12px", cursor: generating ? "not-allowed" : "pointer", opacity: generating ? 0.6 : 1,
                          }}
                        >
                          <RefreshCw size={13} />재생성
                        </button>
                        <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.hint }}>{relativeTime(item.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {prompts.length > 0 ? (
                <p style={{ marginTop: 12, fontSize: 10.5, color: C.hint }}>{prompts.length}개 생성됨 · 스크롤해서 이전 결과 더 보기</p>
              ) : null}
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}
