"use client";

import type { OliviaChatWorkItem, OliviaChatWorkItemAction } from "@/lib/olivia/chatTypes";
import { C } from "@/lib/theme";

const ACTION_LABEL: Record<OliviaChatWorkItemAction, string> = {
  view: "내용 확인",
  prepare: "초안 준비",
  approve: "승인",
  run: "실행",
  complete: "완료",
  acknowledge: "확인",
  snooze: "내일 알림",
  dismiss: "무시",
};

const KIND_LABEL: Record<OliviaChatWorkItem["kind"], string> = {
  insight: "인사이트",
  action: "준비된 행동",
  approval: "승인 대기",
  commitment: "약속",
  project: "프로젝트",
  event: "고객 반응",
};

function priorityLabel(score = 0) {
  if (score >= 80) return "긴급";
  if (score >= 60) return "중요";
  if (score >= 40) return "확인";
  return "정보";
}

export default function OliviaChatWorkItemCard({
  item,
  busy,
  onAction,
}: {
  item: OliviaChatWorkItem;
  busy?: boolean;
  onAction: (item: OliviaChatWorkItem, action: OliviaChatWorkItemAction) => void;
}) {
  const score = item.priorityScore ?? 0;
  return (
    <article style={{
      border: `1px solid ${score >= 80 ? "rgba(232,93,44,.35)" : C.border}`,
      borderRadius: 12,
      background: score >= 80 ? "#FFF8F5" : C.surface,
      padding: "11px 12px",
      marginTop: 7,
      boxShadow: "0 4px 14px rgba(21,88,85,.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{
          borderRadius: 999,
          background: score >= 80 ? C.orange : C.mint,
          color: score >= 80 ? "#fff" : C.teal,
          padding: "3px 7px",
          fontSize: 9,
          fontWeight: 900,
        }}>{score ? `${priorityLabel(score)} ${score}` : KIND_LABEL[item.kind]}</span>
        <span style={{ color: C.muted, fontSize: 9 }}>{KIND_LABEL[item.kind]}</span>
        {item.status ? <span style={{ marginLeft: "auto", color: C.hint, fontSize: 9 }}>{item.status}</span> : null}
      </div>
      <strong style={{ display: "block", color: C.teal, fontSize: 12, lineHeight: 1.45 }}>{item.title}</strong>
      {(item.clientName || item.projectName) ? (
        <div style={{ color: C.orange, fontSize: 10, fontWeight: 800, marginTop: 3 }}>
          {[item.clientName, item.projectName].filter(Boolean).join(" · ")}
        </div>
      ) : null}
      <p style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.55, margin: "5px 0 0" }}>{item.summary}</p>
      {item.reason ? <p style={{ color: C.hint, fontSize: 9.5, lineHeight: 1.5, margin: "4px 0 0" }}>중요한 이유: {item.reason}</p> : null}
      {item.dueAt ? <div style={{ color: C.muted, fontSize: 9, marginTop: 6 }}>기한 {new Date(item.dueAt).toLocaleString("ko-KR")}</div> : null}
      {item.availableActions.length ? (
        <div style={{ display: "grid", gridTemplateColumns: item.availableActions.length === 1 ? "1fr" : "repeat(2,minmax(0,1fr))", gap: 6, marginTop: 9 }}>
          {item.availableActions.slice(0, 6).map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => onAction(item, action)}
              style={{
                minHeight: 31,
                borderRadius: 8,
                border: action === "approve" || action === "run" || action === "prepare" ? "none" : `1px solid ${C.border}`,
                background: action === "approve" || action === "run" ? C.orange : action === "prepare" ? C.teal : C.surface,
                color: action === "approve" || action === "run" || action === "prepare" ? "#fff" : C.muted,
                fontFamily: "inherit",
                fontSize: 10,
                fontWeight: 800,
                cursor: busy ? "wait" : "pointer",
              }}
            >{ACTION_LABEL[action]}</button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
