"use client";

import { useState } from "react";
import { Card, Btn, C } from "../PhotoSortingWorkspace";

const QUICK_CHIPS = ["시간차 우선", "모델 변경 감지", "장소 변화 감지"];

export default function ClassificationPrompt({ onSubmit, busy, history }: { onSubmit: (message: string) => void; busy: boolean; history: string[] }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
    setValue("");
  };
  return (
    <Card>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>AI에게 요청</div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }}
          placeholder={"예) 같은 장소라도 모델이 바뀌면 새 장면으로 나눠줘"}
          rows={3}
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 10, fontFamily: "inherit", fontSize: 12, resize: "vertical", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setValue((current) => (current ? `${current} ${chip}` : chip))}
              style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.light, color: C.teal, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              {chip}
            </button>
          ))}
        </div>
        <Btn onClick={submit} disabled={busy || !value.trim()} style={{ width: "100%" }}>{busy ? "적용 중…" : "요청 반영"}</Btn>
        {history.length > 0 && (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.hint }}>이전 요청</div>
            {history.map((item, index) => (
              <div key={index} style={{ fontSize: 10.5, color: C.muted, background: C.bg, borderRadius: 6, padding: "5px 8px" }}>{item}</div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
