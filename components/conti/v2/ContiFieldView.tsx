"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, GripVertical } from "lucide-react";
import styles from "@/components/conti/v2/ContiV2.module.css";

interface SceneRow {
  id: string;
  group_id: string | null;
  sort: number;
  name: string;
  space_text: string;
  minutes: number | null;
  keyword: string;
  description: string;
  procedures: string[];
  people_text: string;
  preparation_text: string;
  note: string;
  completed: boolean;
}

interface GroupRow {
  id: string;
  name: string;
  sort: number;
}

const GROUP_COLORS = ["#155855", "#E85D2C", "#3B6FB4", "#8A5EC2", "#B4823B", "#4C9E6E", "#B1477D", "#5C7CBE"];

export interface ContiFieldViewProps {
  runId: string;
  onBack: () => void;
}

export default function ContiFieldView({ runId, onBack }: ContiFieldViewProps) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cardCols, setCardCols] = useState(2);
  const draggedId = useRef<string | null>(null);

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

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const groupColorByName = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g, i) => map.set(g.name, GROUP_COLORS[i % GROUP_COLORS.length]));
    return map;
  }, [groups]);

  const ordered = useMemo(() => [...scenes].sort((a, b) => a.sort - b.sort), [scenes]);
  const currentIndex = ordered.findIndex((s) => !s.completed);
  const completedCount = ordered.filter((s) => s.completed).length;
  const remainingMinutes = ordered.filter((s) => !s.completed).reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const currentScene = currentIndex >= 0 ? ordered[currentIndex] : null;
  const nextScene = currentIndex >= 0 ? ordered[currentIndex + 1] : null;
  const progress = ordered.length ? completedCount / ordered.length : 0;

  async function patchScene(sceneId: string, body: Record<string, unknown>) {
    await fetch(`/api/conti/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  function markComplete(sceneId: string) {
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, completed: true } : s)));
    patchScene(sceneId, { completed: true });
  }

  function handleDrop(targetId: string) {
    const fromId = draggedId.current;
    draggedId.current = null;
    if (!fromId || fromId === targetId) return;
    setScenes((prev) => {
      const list = [...prev].sort((a, b) => a.sort - b.sort);
      const fromIdx = list.findIndex((s) => s.id === fromId);
      const toIdx = list.findIndex((s) => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      const reindexed = list.map((s, i) => ({ ...s, sort: i }));
      reindexed.forEach((s) => patchScene(s.id, { sort: s.sort }));
      return reindexed;
    });
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#7c9a95" }}>불러오는 중…</div>;
  if (error) return <div style={{ padding: 40, textAlign: "center", color: "#DC2626" }}>⚠ {error}</div>;

  const showDescription = cardCols <= 2;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={onBack} style={ghostButtonStyle}><ArrowLeft size={13} /> 뒤로</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#5A7470" }}>카드 크기</span>
            <input
              type="range" min={1} max={4} value={cardCols}
              onChange={(e) => setCardCols(Number(e.target.value))}
              style={{ width: 110 }}
            />
          </div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#155855" }}>
          {completedCount} / {ordered.length} 완료 · 남은 시간 약 {Math.floor(remainingMinutes / 60)}시간 {remainingMinutes % 60}분
        </span>
      </div>

      <div className={styles.fieldProgress} aria-label={`촬영 진행률 ${Math.round(progress * 100)}%`}><span style={{ transform: `scaleX(${progress})` }} /></div>

      {currentScene ? <div className={styles.fieldHeroGrid}>
        <div className={styles.fieldCurrentShell}><section className={styles.fieldCurrentPanel}>
          <span className={styles.fieldCurrentLabel}>Now Shooting · {currentIndex + 1}/{ordered.length}</span>
          <h2>{currentScene.name}</h2>
          <div className={styles.fieldMetaGrid}>
            <div><small>장소</small><strong>{currentScene.space_text || "장소 미정"}</strong></div>
            <div><small>예상 시간</small><strong>{currentScene.minutes != null ? `${currentScene.minutes}분` : "시간 미정"}</strong></div>
            <div><small>필요 인원</small><strong>{currentScene.people_text || "필요 인원 미정"}</strong></div>
          </div>
        </section></div>
        <div className={styles.fieldNextShell}><aside className={styles.fieldNextPanel}><span>UP NEXT</span><h3>{nextScene?.name ?? "마지막 장면입니다"}</h3>{nextScene ? <p>{nextScene.space_text || "장소 미정"} · {nextScene.minutes != null ? `${nextScene.minutes}분` : "시간 미정"}</p> : <p>모든 촬영을 마무리해 주세요.</p>}</aside></div>
      </div> : null}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cardCols}, minmax(0, 1fr))`, gap: 14 }}>
        {ordered.map((scene, i) => {
          const groupName = (scene.group_id && groupNameById.get(scene.group_id)) || "미지정";
          const accent = groupColorByName.get(groupName) ?? "#9aa8a4";
          const isCurrent = i === currentIndex;
          return (
            <div
              key={scene.id}
              draggable
              onDragStart={() => { draggedId.current = scene.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(scene.id)}
              style={{
                position: "relative",
                background: "#fff",
                borderRadius: 12,
                border: isCurrent ? "2px solid #E85D2C" : "1px solid rgba(21,88,85,.12)",
                borderLeft: `5px solid ${accent}`,
                padding: "14px 16px",
                opacity: scene.completed ? 0.45 : 1,
                boxShadow: isCurrent ? "0 8px 24px rgba(232,93,44,.14)" : "0 4px 14px rgba(21,58,52,.04)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "#1e3b38" }}>{scene.name || "(이름 없음)"}</span>
                <GripVertical size={13} color="#c3b8a8" style={{ cursor: "grab", flex: "0 0 auto" }} />
              </div>
              <div style={{ fontSize: 11.5, color: "#7c9a95", fontWeight: 700 }}>
                {scene.space_text || "장소 미정"} · {scene.minutes != null ? `${scene.minutes}분` : "시간 미정"}
              </div>
              {showDescription && scene.description ? (
                <p style={{ fontSize: 12, color: "#526d68", lineHeight: 1.5, margin: 0 }}>{scene.description}</p>
              ) : null}
              {scene.procedures.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {scene.procedures.map((p) => (
                    <span key={p} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#EFEBE3", color: "#6b6355" }}>{p}</span>
                  ))}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: "#8a9d99" }}>
                {[scene.keyword, scene.people_text].filter(Boolean).join(" · ") || "-"}
              </div>
              {showDescription && scene.preparation_text ? (
                <div style={{ padding: "7px 9px", borderRadius: 7, background: "#F4F1EB", color: "#6b6355", fontSize: 11.5, lineHeight: 1.45 }}>
                  <strong>준비</strong> · {scene.preparation_text}
                </div>
              ) : null}
              {scene.note ? <div style={{ fontSize: 11, color: "#8a9d99" }}>메모 · {scene.note}</div> : null}
              {isCurrent ? (
                <button
                  type="button"
                  onClick={() => markComplete(scene.id)}
                  style={{
                    marginTop: 4, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
                    height: 32, padding: "0 14px", borderRadius: 8, border: "1px solid #155855",
                    background: "#155855", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
                  }}
                >
                  <CheckCircle2 size={13} /> 촬영 완료 · 다음
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ghostButtonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(21,88,85,.16)", background: "#fff", color: "#155855", fontSize: 12, fontWeight: 700, cursor: "pointer" };
