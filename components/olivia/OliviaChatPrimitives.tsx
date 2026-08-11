"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";

// components/OliviaChat.tsx(플로팅 위젯)와 components/home/OliviaHeroChat.tsx(홈 임베드 채팅)가
// 공유하는 순수 렌더링 프리미티브 — 상태를 외부에 의존하지 않아서 안전하게 분리했다.

// ── 코드 블록 (복사 버튼 포함, 개발요청 스펙 등을 그대로 복사해 전달할 때 사용) ──
export function CodeBlock({ code, bg, border, color }: { code: string; bg: string; border: string; color: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div style={{ position: "relative", margin: "6px 0" }}>
      <pre style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", paddingTop: 30, overflowX: "auto", margin: 0, fontSize: "11px", lineHeight: 1.6 }}>
        <code style={{ fontFamily: "monospace", color }}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        style={{ position: "absolute", top: 6, right: 6, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${border}`, background: bg, color, cursor: "pointer" }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

// ── 마크다운 렌더러 (외부 패키지 없이 직접 구현) ─────────────
export function MarkdownText({ text, isUser }: { text: string; isUser: boolean }) {
  const color = isUser ? "#fff" : "#1C2B28";
  const mutedColor = isUser ? "rgba(255,255,255,0.75)" : "#5A7470";
  const borderColor = isUser ? "rgba(255,255,255,0.3)" : "#C8DDD9";
  const codeBg = isUser ? "rgba(255,255,255,0.15)" : "#EDF5F3";
  const linkColor = isUser ? "#fff" : "#155855";

  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let i = 0;

  const parseInline = (line: string, key: string | number): React.ReactNode => {
    // bold + italic, bold, italic, inline code, link
    const parts = line.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
    return (
      <span key={key}>
        {parts.map((p, pi) => {
          if (p.startsWith("***") && p.endsWith("***"))
            return <strong key={pi}><em>{p.slice(3, -3)}</em></strong>;
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={pi} style={{ fontWeight: 900 }}>{p.slice(2, -2)}</strong>;
          if (p.startsWith("*") && p.endsWith("*"))
            return <em key={pi}>{p.slice(1, -1)}</em>;
          if (p.startsWith("`") && p.endsWith("`"))
            return <code key={pi} style={{ background: codeBg, padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: "0.9em" }}>{p.slice(1, -1)}</code>;
          const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch)
            return <a key={pi} href={linkMatch[2]} target="_blank" rel="noreferrer" style={{ color: linkColor, textDecoration: "underline" }}>{linkMatch[1]}</a>;
          return p;
        })}
      </span>
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    // 빈 줄
    if (line.trim() === "") { result.push(<div key={i} style={{ height: 6 }} />); i++; continue; }

    // 코드 블록
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      result.push(
        <CodeBlock key={i} code={codeLines.join("\n")} bg={codeBg} border={borderColor} color={color} />
      );
      i++; continue;
    }

    // 구분선
    if (/^---+$/.test(line.trim())) {
      result.push(<hr key={i} style={{ border: "none", borderTop: `1px solid ${borderColor}`, margin: "8px 0" }} />);
      i++; continue;
    }

    // 제목 h1~h3
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) { result.push(<div key={i} style={{ fontSize: "15px", fontWeight: 900, color, margin: "8px 0 4px" }}>{parseInline(h1[1], "t")}</div>); i++; continue; }
    if (h2) { result.push(<div key={i} style={{ fontSize: "13px", fontWeight: 900, color, margin: "6px 0 3px" }}>{parseInline(h2[1], "t")}</div>); i++; continue; }
    if (h3) { result.push(<div key={i} style={{ fontSize: "12px", fontWeight: 800, color: mutedColor, margin: "5px 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{parseInline(h3[1], "t")}</div>); i++; continue; }

    // 순서 있는 목록
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      result.push(
        <ol key={i} style={{ paddingLeft: 18, margin: "4px 0" }}>
          {items.map((item, idx) => <li key={idx} style={{ fontSize: "12px", lineHeight: 1.7, color }}>{parseInline(item, idx)}</li>)}
        </ol>
      );
      continue;
    }

    // 순서 없는 목록
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
      result.push(
        <ul key={i} style={{ paddingLeft: 16, margin: "4px 0", listStyle: "none" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ fontSize: "12px", lineHeight: 1.7, color, display: "flex", gap: 6 }}>
              <span style={{ color: "#E85D2C", flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{parseInline(item, idx)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 인용문
    if (line.startsWith(">")) {
      result.push(
        <div key={i} style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 10, margin: "4px 0", color: mutedColor, fontSize: "12px", fontStyle: "italic" }}>
          {parseInline(line.slice(1).trim(), i)}
        </div>
      );
      i++; continue;
    }

    // 일반 텍스트
    result.push(<div key={i} style={{ fontSize: "12px", lineHeight: 1.7, color }}>{parseInline(line, i)}</div>);
    i++;
  }

  return <>{result}</>;
}

// ── 올리비아 아이콘 — 오렌지 그라디언트 배지 위 흰색 스파클 ──
export function OliviaIcon({ size = 20 }: { size?: number }) {
  return <Sparkles size={size} color="#fff" fill="#fff" strokeWidth={1} />;
}
