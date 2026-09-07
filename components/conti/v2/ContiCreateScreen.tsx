"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Sparkles, Users } from "lucide-react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import { SPECIALTY_LIST } from "@/lib/conti/specDefaults";
import {
  generateContiDraft,
  type GenerateContiInput,
  type HospitalSpaceRow,
  type HospitalStaffRow,
  type SceneTemplateRow,
} from "@/lib/conti/generate";

interface ClientOption {
  id: string;
  name: string;
}

type StaffFlags = { siljang: boolean; jikwon: boolean };
type CreateTab = "new" | "from-previous" | "library";

export interface ContiCreateScreenProps {
  onGenerated: (runId: string) => void;
}

function formatMinutes(total: number): string {
  if (total <= 0) return "0분";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

export default function ContiCreateScreen({ onGenerated }: ContiCreateScreenProps) {
  const [tab, setTab] = useState<CreateTab>("new");

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [hospitalId, setHospitalId] = useState<string>("");

  const [specialties, setSpecialties] = useState<string[]>([]);
  const [doctorCount, setDoctorCount] = useState(1);
  const [staffFlags, setStaffFlags] = useState<StaffFlags>({ siljang: false, jikwon: false });
  const [harmony, setHarmony] = useState(false);
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<SceneTemplateRow[]>([]);
  const [hospitalSpaces, setHospitalSpaces] = useState<HospitalSpaceRow[]>([]);
  const [hospitalStaff, setHospitalStaff] = useState<HospitalStaffRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setClients((data.clients ?? []).map((c: { id: string; hospital_name?: string }) => ({
            id: c.id,
            name: c.hospital_name || "(이름 없음)",
          })));
        }
      })
      .catch(() => {});
  }, []);

  const specialtyKey = specialties.join(",");
  useEffect(() => {
    if (specialties.length === 0) {
      setTemplates([]);
      return;
    }
    fetch(`/api/conti/scene-templates?specialties=${encodeURIComponent(specialtyKey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setTemplates(data.templates ?? []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialtyKey]);

  useEffect(() => {
    if (!hospitalId) {
      setHospitalSpaces([]);
      setHospitalStaff([]);
      return;
    }
    fetch(`/api/conti/hospital-profile?hospitalId=${hospitalId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setHospitalSpaces(data.spaces ?? []);
          setHospitalStaff(data.staff ?? []);
        }
      })
      .catch(() => {});
  }, [hospitalId]);

  const input: GenerateContiInput = useMemo(
    () => ({ specialties, doctorCount, staffFlags, harmony, checked }),
    [specialties, doctorCount, staffFlags, harmony, checked]
  );

  const draft = useMemo(() => {
    if (specialties.length === 0 || templates.length === 0) return null;
    return generateContiDraft(input, { templates, hospitalSpaces, hospitalStaff });
  }, [input, templates, hospitalSpaces, hospitalStaff]);

  const totalMinutes = draft ? draft.scenes.reduce((sum, s) => sum + (s.minutes ?? 0), 0) : 0;
  const sceneCount = draft?.scenes.length ?? 0;
  const overThreeHours = totalMinutes > 180;

  const checklistGroups = useMemo(() => {
    const map = new Map<string, { specialty: string; category: string; items: SceneTemplateRow[] }>();
    for (const t of templates) {
      if (t.specialty === "공통") continue;
      const key = `${t.specialty}::${t.category}`;
      const existing = map.get(key);
      if (existing) existing.items.push(t);
      else map.set(key, { specialty: t.specialty, category: t.category, items: [t] });
    }
    return Array.from(map.entries());
  }, [templates]);

  const totalCheckedItems = Object.values(checked).reduce((sum, arr) => sum + arr.length, 0);
  const checkedCategoryCount = Object.values(checked).filter((arr) => arr.length > 0).length;

  function toggleSpecialty(name: string) {
    setSpecialties((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  }

  function toggleGroupOpen(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleItem(key: string, itemLabel: string) {
    setChecked((prev) => {
      const current = prev[key] ?? [];
      const nextList = current.includes(itemLabel) ? current.filter((i) => i !== itemLabel) : [...current, itemLabel];
      return { ...prev, [key]: nextList };
    });
  }

  function resetAll() {
    setSpecialties([]);
    setDoctorCount(1);
    setStaffFlags({ siljang: false, jikwon: false });
    setHarmony(false);
    setChecked({});
    setOpenGroups(new Set());
  }

  async function handleGenerate() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/conti/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalId: hospitalId || null, specialties, doctorCount, staffFlags, harmony, checked }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "생성 실패");
      onGenerated(data.run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setSubmitting(false);
    }
  }

  const canGenerate = specialties.length > 0 && !submitting;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.25fr) minmax(280px, .88fr)", gap: 18, alignItems: "start" }}>
      {/* 좌측 다크 카드 */}
      <div style={{ background: "#2a2a2a", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, boxShadow: "0 16px 42px rgba(0,0,0,.18)", padding: "22px 24px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
        <SegmentedTabs
          ariaLabel="콘티 만들기 모드"
          value={tab}
          onChange={setTab}
          items={[
            { value: "new", label: "새로 만들기" },
            { value: "from-previous", label: "이전 콘티에서 시작" },
            { value: "library", label: "사례 라이브러리" },
          ]}
          style={{ background: "rgba(255,255,255,.08)" }}
        />

        {tab !== "new" ? (
          <div style={{ padding: "40px 12px", textAlign: "center", color: "rgba(255,255,255,.5)", fontSize: 13 }}>
            준비 중입니다 — 우선 &ldquo;새로 만들기&rdquo;로 진행해주세요.
          </div>
        ) : (
          <>
            {/* 1. 병원 선택 */}
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <StepLabel index={1} title="병원 선택" hint="공간·의료진 정보가 자동으로 따라옵니다" />
              <select
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                style={selectStyle}
              >
                <option value="">병원 선택 안 함</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </section>

            {/* 2. 진료과 */}
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <StepLabel index={2} title="진료과" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {SPECIALTY_LIST.map((name) => (
                  <Chip key={name} active={specialties.includes(name)} onClick={() => toggleSpecialty(name)}>
                    {name}
                  </Chip>
                ))}
              </div>
            </section>

            {/* 3. 구성 */}
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <StepLabel index={3} title="구성" />
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Users size={14} color="rgba(255,255,255,.6)" />
                  <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.75)", fontWeight: 700 }}>의료진 수</span>
                  <Stepper value={doctorCount} onChange={setDoctorCount} min={1} max={10} />
                </div>
                <Chip active={staffFlags.jikwon} onClick={() => setStaffFlags((f) => ({ ...f, jikwon: !f.jikwon }))}>
                  직원 촬영
                </Chip>
                <Chip active={staffFlags.siljang} onClick={() => setStaffFlags((f) => ({ ...f, siljang: !f.siljang }))}>
                  실장 촬영
                </Chip>
                <Chip active={harmony} onClick={() => setHarmony((v) => !v)}>
                  하모니컷
                </Chip>
              </div>
            </section>

            {/* 4. 촬영 항목 */}
            <section style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              <StepLabel index={4} title="촬영 항목" hint={specialties.length === 0 ? "진료과를 먼저 선택하세요" : undefined} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                {checklistGroups.map(([key, group]) => {
                  const isOpen = openGroups.has(key);
                  const count = (checked[key] ?? []).length;
                  return (
                    <div key={key} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, overflow: "hidden" }}>
                      <button
                        type="button"
                        onClick={() => toggleGroupOpen(key)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "9px 12px", background: "rgba(255,255,255,.04)", border: 0, cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#fff" }}>
                          <ChevronDown size={13} style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 150ms", color: "rgba(255,255,255,.5)" }} />
                          {group.specialty} · {group.category}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: count > 0 ? "var(--orange, #E85D2C)" : "rgba(255,255,255,.4)" }}>
                          {count}/{group.items.length}
                        </span>
                      </button>
                      {isOpen ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 12px 12px" }}>
                          {group.items.map((item) => {
                            const isChecked = (checked[key] ?? []).includes(item.default_name);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleItem(key, item.default_name)}
                                style={{
                                  fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 99,
                                  border: `1px solid ${isChecked ? "#155855" : "rgba(255,255,255,.14)"}`,
                                  background: isChecked ? "#155855" : "rgba(255,255,255,.05)",
                                  color: isChecked ? "#fff" : "rgba(255,255,255,.72)",
                                  cursor: "pointer",
                                }}
                              >
                                {item.default_name}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {specialties.length > 0 && checklistGroups.length === 0 ? (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", padding: "10px 4px" }}>
                    선택한 진료과에 등록된 장면 템플릿이 없습니다.
                  </div>
                ) : null}
              </div>
            </section>
          </>
        )}

        {error ? <p style={{ color: "#ff8a65", fontSize: 12, fontWeight: 700, margin: 0 }}>⚠ {error}</p> : null}

        {/* 하단 바 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 16, marginTop: "auto" }}>
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", fontWeight: 700 }}>
            대분류 {checkedCategoryCount}개 · 세부 {totalCheckedItems}개 선택됨
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={resetAll} style={secondaryDarkButtonStyle}>초기화</button>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 18px",
                borderRadius: 9, border: "1px solid #E85D2C", background: canGenerate ? "#E85D2C" : "#8a4a35",
                color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: canGenerate ? "pointer" : "not-allowed",
                opacity: canGenerate ? 1 : 0.6,
              }}
            >
              <Sparkles size={14} />
              {submitting ? "생성 중…" : "AI 콘티 생성"}
            </button>
          </div>
        </div>
      </div>

      {/* 우측 흰 패널 — 실시간 예상 결과 */}
      <div style={{ position: "sticky", top: 18, background: "rgba(255,255,255,.96)", border: "1px solid rgba(21,88,85,.12)", borderRadius: 16, padding: "24px 22px", boxShadow: "0 16px 42px rgba(21,58,52,.05)", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted, #5A7470)", letterSpacing: ".02em" }}>예상 결과</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#155855", lineHeight: 1 }}>{sceneCount}</div>
              <div style={{ fontSize: 11, color: "#7c9a95", fontWeight: 700 }}>장면</div>
            </div>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#155855", lineHeight: 1 }}>{formatMinutes(totalMinutes)}</div>
              <div style={{ fontSize: 11, color: "#7c9a95", fontWeight: 700 }}>예상 촬영시간</div>
            </div>
          </div>
        </div>

        {overThreeHours ? (
          <div style={{ background: "rgba(232,93,44,.08)", border: "1px solid rgba(232,93,44,.25)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#B64B2A", fontWeight: 700 }}>
            ⚠ 3시간을 초과할 것으로 예상됩니다. 항목을 줄이거나 일정을 나눠보세요.
          </div>
        ) : null}

        {hospitalId ? (
          <div style={{ fontSize: 11.5, color: "#7c9a95", fontWeight: 700 }}>
            공간 정보 {draft?.spaceMatchStats.matched ?? 0} / {draft?.spaceMatchStats.total ?? 0} 매칭됨
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
          {(draft?.scenes ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: "#a9bdb9", padding: "8px 0" }}>진료과와 촬영 항목을 선택하면 여기에 미리보기가 나타납니다.</div>
          ) : (
            draft!.scenes.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "6px 8px", borderRadius: 7, background: "#f4faf8" }}>
                <span style={{ color: "#1e3b38", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ color: "#7c9a95", flex: "0 0 auto" }}>{s.minutes != null ? `${s.minutes}분` : "-"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StepLabel({ index, title, hint }: { index: number; title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,.35)" }}>{index}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{title}</span>
      {hint ? <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>{hint}</span> : null}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 99,
        border: `1px solid ${active ? "#155855" : "rgba(255,255,255,.14)"}`,
        background: active ? "#155855" : "rgba(255,255,255,.05)",
        color: active ? "#fff" : "rgba(255,255,255,.75)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 0, border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, overflow: "hidden" }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} style={stepperButtonStyle}>−</button>
      <span style={{ width: 30, textAlign: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} style={stepperButtonStyle}>+</button>
    </div>
  );
}

const stepperButtonStyle: React.CSSProperties = {
  width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
  border: 0, background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  height: 38, borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)",
  color: "#fff", fontSize: 13, padding: "0 10px", outline: "none",
};

const secondaryDarkButtonStyle: React.CSSProperties = {
  height: 36, padding: "0 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,.14)",
  background: "transparent", color: "rgba(255,255,255,.75)", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
};
