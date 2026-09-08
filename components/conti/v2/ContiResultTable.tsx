"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, GripVertical, Plus, Share2, Trash2, Users } from "lucide-react";
import styles from "@/components/conti/v2/ContiV2.module.css";

interface SceneRow {
  id: string;
  run_id: string;
  group_id: string | null;
  sort: number;
  name: string;
  space_text: string;
  minutes: number | null;
  keyword: string;
  description: string;
  procedures: string[];
  people_text: string;
  patient_role_text: string;
  preparation_text: string;
  note: string;
  template_id: string | null;
  field_sources: Record<string, string>;
}

interface GroupRow {
  id: string;
  run_id: string;
  name: string;
  color: string | null;
  sort: number;
}

const EDITABLE_KEYS = [
  "name", "space_text", "minutes", "keyword", "description",
  "people_text", "patient_role_text", "preparation_text", "note",
] as const;
type EditableKey = (typeof EDITABLE_KEYS)[number];

const SOURCE_COLORS: Record<string, string> = {
  template: "rgba(34,197,94,.12)",
  hospital: "rgba(59,130,246,.12)",
  ai: "rgba(168,85,247,.12)",
  user: "rgba(234,179,8,.16)",
};

const GROUP_COLORS = ["#155855", "#E85D2C", "#3B6FB4", "#8A5EC2", "#B4823B", "#4C9E6E", "#B1477D", "#5C7CBE"];

const PLACEHOLDERS: Record<EditableKey, string> = {
  name: "장면 이름",
  space_text: "장소 미정",
  minutes: "시간",
  keyword: "키워드 없음",
  description: "장면 설명을 입력해 주세요",
  people_text: "필요 인원 미정",
  patient_role_text: "환자 역할",
  preparation_text: "준비사항",
  note: "비고",
};

export interface ContiResultTableProps {
  runId: string;
  onBack: () => void;
  onOpenField?: () => void;
}

export default function ContiResultTable({ runId, onBack, onOpenField }: ContiResultTableProps) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [error, setError] = useState("");
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  const draggedId = useRef<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLTextAreaElement>>(new Map());
  const blankCursor = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/conti/runs/${runId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error ?? "불러오기 실패");
        setGroups(data.groups ?? []);
        setScenes(data.scenes ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  const groupColorByName = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g, i) => map.set(g.name, GROUP_COLORS[i % GROUP_COLORS.length]));
    return map;
  }, [groups]);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const orderedScenes = useMemo(() => [...scenes].sort((a, b) => a.sort - b.sort), [scenes]);

  const groupSpans = useMemo(() => {
    const spans: { groupName: string; startIndex: number; span: number }[] = [];
    let current: { groupName: string; startIndex: number; span: number } | null = null;
    orderedScenes.forEach((s, i) => {
      const gName = (s.group_id && groupNameById.get(s.group_id)) || "미지정";
      if (!current || current.groupName !== gName) {
        if (current) spans.push(current);
        current = { groupName: gName, startIndex: i, span: 1 };
      } else {
        current.span += 1;
      }
    });
    if (current) spans.push(current);
    return spans;
  }, [orderedScenes, groupNameById]);

  const spanStartSet = useMemo(() => {
    const map = new Map<number, { groupName: string; span: number }>();
    groupSpans.forEach((s) => map.set(s.startIndex, { groupName: s.groupName, span: s.span }));
    return map;
  }, [groupSpans]);

  const blankCells = useMemo(() => {
    const list: { sceneId: string; field: EditableKey }[] = [];
    orderedScenes.forEach((s) => {
      EDITABLE_KEYS.forEach((k) => {
        if (s.field_sources?.[k] === "blank") list.push({ sceneId: s.id, field: k });
      });
    });
    return list;
  }, [orderedScenes]);

  const totalMinutes = orderedScenes.reduce((sum, s) => sum + (s.minutes ?? 0), 0);

  async function patchScene(sceneId: string, body: Record<string, unknown>) {
    await fetch(`/api/conti/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  function updateField(sceneId: string, field: EditableKey, rawValue: string) {
    const value: string | number | null = field === "minutes" ? (rawValue.trim() === "" ? null : Number(rawValue)) : rawValue;
    setScenes((prev) => prev.map((s) => (
      s.id === sceneId ? { ...s, [field]: value, field_sources: { ...s.field_sources, [field]: "user" } } : s
    )));
    patchScene(sceneId, { fields: { [field]: value } });
  }

  function focusNextBlank() {
    if (blankCells.length === 0) return;
    const target = blankCells[blankCursor.current % blankCells.length];
    blankCursor.current += 1;
    const el = cellRefs.current.get(`${target.sceneId}:${target.field}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  }

  function handleDrop(targetId: string) {
    const fromId = draggedId.current;
    draggedId.current = null;
    if (!fromId || fromId === targetId) return;
    setScenes((prev) => {
      const ordered = [...prev].sort((a, b) => a.sort - b.sort);
      const fromIdx = ordered.findIndex((s) => s.id === fromId);
      const toIdx = ordered.findIndex((s) => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const targetGroupId = ordered[toIdx].group_id;
      const [moved] = ordered.splice(fromIdx, 1);
      moved.group_id = targetGroupId;
      ordered.splice(toIdx, 0, moved);
      const reindexed = ordered.map((s, i) => ({ ...s, sort: i }));
      reindexed.forEach((s) => patchScene(s.id, { sort: s.sort, group_id: s.group_id }));
      return reindexed;
    });
  }

  async function addScene() {
    const lastGroupId = orderedScenes.length > 0 ? orderedScenes[orderedScenes.length - 1].group_id : null;
    const res = await fetch("/api/conti/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, groupId: lastGroupId }),
    });
    const data = await res.json();
    if (data.ok) setScenes((prev) => [...prev, data.scene]);
  }

  async function deleteScene(sceneId: string) {
    if (!window.confirm("이 장면을 삭제할까요?")) return;
    const snapshot = scenes;
    setScenes((prev) => prev.filter((scene) => scene.id !== sceneId).map((scene, index) => ({ ...scene, sort: index })));
    const res = await fetch(`/api/conti/scenes/${sceneId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setScenes(snapshot);
  }

  async function createShareLink(audience: "customer" | "staff") {
    setShareStatus("생성 중…");
    try {
      const res = await fetch(`/api/conti/runs/${runId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "링크 생성 실패");
      const url = `${window.location.origin}/conti/share/${data.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareStatus(`${audience === "staff" ? "현장팀용" : "고객용"} 링크가 복사되었습니다`);
    } catch (e) {
      setShareStatus(e instanceof Error ? e.message : "링크 생성 실패");
    }
    setTimeout(() => setShareStatus(""), 3500);
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#7c9a95" }}>불러오는 중…</div>;
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: "center", color: "#DC2626" }}>⚠ {error}</div>;
  }

  const canShare = orderedScenes.length > 0;

  return (
    <div className={styles.resultShell}>
      <div className={styles.resultPanel}>
      <div className={styles.resultSummary}>
        <div className={styles.resultSummaryCopy}><span>AI 촬영 콘티</span><h2>촬영 콘티가 준비되었습니다.</h2></div>
        <div className={styles.resultMetrics}>
          <div className={styles.resultMetric}><small>전체 장면</small><strong>{orderedScenes.length}개</strong></div>
          <div className={styles.resultMetric}><small>예상 촬영 시간</small><strong>{formatMinutes(totalMinutes)}</strong></div>
        </div>
      </div>
      {/* 상단 바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", borderBottom: "1px solid rgba(21,88,85,.1)", background: "#fff", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={onBack} style={ghostButtonStyle}><ArrowLeft aria-hidden="true" size={13} /> 입력 다시하기</button>
          {blankCells.length > 0 ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#B64B2A" }}>채워야 할 칸 {blankCells.length}개</span>
              <button type="button" onClick={focusNextBlank} style={ghostButtonStyle}>
                다음 빈칸으로 <ArrowRight aria-hidden="true" size={13} />
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 800, color: "#2E7D4F" }}>모든 칸이 채워졌습니다</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onOpenField ? <button type="button" onClick={onOpenField} style={ghostButtonStyle}>현장 모드</button> : null}
          <button type="button" onClick={() => window.print()} style={ghostButtonStyle}><Download aria-hidden="true" size={13} /> PDF 저장</button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#5A7470", cursor: "pointer" }}>
            <input type="checkbox" checked={showSources} onChange={(e) => setShowSources(e.target.checked)} />
            작성 출처 표시
          </label>
        </div>
      </div>

      {/* 표 */}
      <div className={styles.tableViewport}>
        <table className={styles.resultTable}>
          <thead>
            <tr style={{ background: "#F0ECE3", textAlign: "left" }}>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
              <th style={thStyle}>#</th>
              <th style={thStyle}>구분</th>
              <th style={{ ...thStyle, minWidth: 140 }}>장면</th>
              <th style={{ ...thStyle, minWidth: 110 }}>장소</th>
              <th style={{ ...thStyle, width: 60 }}>시간</th>
              <th style={{ ...thStyle, minWidth: 110 }}>키워드</th>
              <th style={{ ...thStyle, minWidth: 220 }}>장면 설명·세부 항목</th>
              <th style={{ ...thStyle, minWidth: 110 }}>필요인원</th>
              <th style={{ ...thStyle, minWidth: 100 }}>환자 역할</th>
              <th style={{ ...thStyle, minWidth: 150 }}>준비사항</th>
              <th style={{ ...thStyle, minWidth: 100 }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {orderedScenes.map((scene, i) => {
              const span = spanStartSet.get(i);
              const groupName = span?.groupName ?? ((scene.group_id && groupNameById.get(scene.group_id)) || "미지정");
              const accent = groupColorByName.get(groupName) ?? "#9aa8a4";
              return (
                <tr
                  key={scene.id}
                  draggable
                  onDragStart={() => { draggedId.current = scene.id; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(scene.id)}
                  style={{ background: i % 2 === 0 ? "#fff" : "#FCFAF6" }}
                >
                  <td style={{ ...tdStyle, cursor: "grab", color: "#c3b8a8", width: 26 }}><GripVertical size={13} /></td>
                  <td style={{ ...tdStyle, width: 26 }}>
                    <button type="button" aria-label={`${scene.name || "장면"} 삭제`} onClick={() => deleteScene(scene.id)} style={{ border: 0, background: "transparent", color: "#b9aaa0", padding: 0, cursor: "pointer" }}><Trash2 size={13} /></button>
                  </td>
                  <td style={{ ...tdStyle, color: "#a9998a", fontWeight: 700, width: 28 }}>{i + 1}</td>
                  {span ? (
                    <td rowSpan={span.span} style={{ ...tdStyle, background: `${accent}14`, borderLeft: `3px solid ${accent}`, color: accent, fontWeight: 800, verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {groupName}
                    </td>
                  ) : null}
                  <EditCell scene={scene} field="name" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} />
                  <EditCell scene={scene} field="space_text" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} />
                  <EditCell scene={scene} field="minutes" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} numeric />
                  <EditCell scene={scene} field="keyword" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} />
                  <td style={{ ...tdCellBase(scene.field_sources.description, showSources), minWidth: 220 }}>
                    <textarea
                      ref={(el) => { if (el) cellRefs.current.set(`${scene.id}:description`, el); }}
                      defaultValue={scene.description}
                      placeholder={PLACEHOLDERS.description}
                      onBlur={(e) => updateField(scene.id, "description", e.target.value)}
                      style={textareaStyle}
                      rows={2}
                    />
                    {scene.procedures.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {scene.procedures.map((p) => (
                          <span key={p} style={tagStyle}>{p}</span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <EditCell scene={scene} field="people_text" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} />
                  <EditCell scene={scene} field="patient_role_text" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} />
                  <EditCell scene={scene} field="preparation_text" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} />
                  <EditCell scene={scene} field="note" showSources={showSources} cellRefs={cellRefs} onCommit={updateField} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 하단 바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", borderTop: "1px solid rgba(21,88,85,.1)", background: "#fff", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5A7470" }}>
          총 {orderedScenes.length}장면 · {formatMinutes(totalMinutes)}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={addScene} style={ghostButtonStyle}><Plus aria-hidden="true" size={13} /> 장면 추가</button>
          {shareStatus ? <span role="status" aria-live="polite" style={{ fontSize: 11.5, color: "#5A7470", fontWeight: 700 }}>{shareStatus}</span> : null}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              disabled={!canShare}
              title={canShare ? undefined : "장면을 먼저 추가하세요"}
              onClick={() => setShareMenuOpen((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 16px",
                borderRadius: 8, border: "1px solid #E85D2C", background: canShare ? "#E85D2C" : "#F2B79B",
                color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: canShare ? "pointer" : "not-allowed",
              }}
            >
              <Share2 aria-hidden="true" size={13} /> 공유하기
            </button>
            {shareMenuOpen ? (
              <div style={{ position: "absolute", bottom: "100%", right: 0, marginBottom: 6, background: "#fff", border: "1px solid rgba(21,88,85,.14)", borderRadius: 10, boxShadow: "0 12px 30px rgba(21,88,85,.14)", overflow: "hidden", minWidth: 160, zIndex: 20 }}>
                <button type="button" onClick={() => { setShareMenuOpen(false); createShareLink("customer"); }} style={shareMenuItemStyle}>
                  <Share2 size={13} /> 고객용 링크
                </button>
                <button type="button" onClick={() => { setShareMenuOpen(false); createShareLink("staff"); }} style={{ ...shareMenuItemStyle, borderTop: "1px solid rgba(21,88,85,.08)" }}>
                  <Users size={13} /> 현장팀용 링크
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function EditCell({
  scene, field, showSources, cellRefs, onCommit, numeric,
}: {
  scene: SceneRow;
  field: EditableKey;
  showSources: boolean;
  cellRefs: React.MutableRefObject<Map<string, HTMLInputElement | HTMLTextAreaElement>>;
  onCommit: (sceneId: string, field: EditableKey, value: string) => void;
  numeric?: boolean;
}) {
  const source = scene.field_sources?.[field] ?? "blank";
  const rawValue = scene[field];
  const value = rawValue == null ? "" : String(rawValue);
  return (
    <td style={tdCellBase(source, showSources)}>
      <input
        ref={(el) => { if (el) cellRefs.current.set(`${scene.id}:${field}`, el); }}
        type={numeric ? "number" : "text"}
        defaultValue={value}
        placeholder={PLACEHOLDERS[field]}
        onBlur={(e) => onCommit(scene.id, field, e.target.value)}
        style={inputStyle}
      />
    </td>
  );
}

function tdCellBase(source: string, showSources: boolean): React.CSSProperties {
  const isBlank = source === "blank";
  const base: React.CSSProperties = { ...tdStyle, position: "relative", padding: 0 };
  if (isBlank) {
    return {
      ...base,
      backgroundImage: "repeating-linear-gradient(135deg, rgba(232,93,44,.09) 0 6px, transparent 6px 12px)",
      boxShadow: "inset 0 0 0 1.5px rgba(232,93,44,.35)",
    };
  }
  if (showSources && SOURCE_COLORS[source]) {
    return { ...base, background: SOURCE_COLORS[source] };
  }
  return base;
}

const thStyle: React.CSSProperties = { padding: "9px 10px", fontSize: 11, fontWeight: 800, color: "#5A7470", borderBottom: "1px solid rgba(21,88,85,.1)" };
const tdStyle: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid rgba(21,88,85,.06)", verticalAlign: "top" };
const inputStyle: React.CSSProperties = { width: "100%", border: 0, background: "transparent", font: "inherit", fontSize: 12.5, color: "#2b3a37", outline: "none", padding: "8px 10px" };
const textareaStyle: React.CSSProperties = { width: "100%", border: 0, background: "transparent", font: "inherit", fontSize: 12.5, color: "#2b3a37", outline: "none", padding: "8px 10px", resize: "vertical" };
const tagStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#EFEBE3", color: "#6b6355" };
const ghostButtonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(21,88,85,.16)", background: "#fff", color: "#155855", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const shareMenuItemStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: 0, background: "#fff", color: "#155855", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left" };

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}
