"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { EquipmentCategory, PrepEquipmentItem, ScheduleRental } from "@/lib/work-journal/scheduleTypes";

const TAB_LABEL: Record<EquipmentCategory, string> = {
  LIGHT: "조명",
  CAMERA: "카메라·렌즈",
  COMPUTER: "노트북·저장장치",
  ETC: "기타",
};
const TAB_ORDER: EquipmentCategory[] = ["LIGHT", "CAMERA", "COMPUTER", "ETC"];

export default function PreparationColumn({
  prepItems,
  prepLoading,
  rentals,
  onToggleSelected,
  onAddRental,
  onToggleRental,
  onDeleteRental,
}: {
  prepItems: PrepEquipmentItem[];
  prepLoading: boolean;
  rentals: ScheduleRental[];
  onToggleSelected: (equipmentId: string, selected: boolean) => Promise<void> | void;
  onAddRental: (name: string) => Promise<void>;
  onToggleRental: (id: string, checked: boolean) => void;
  onDeleteRental: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<EquipmentCategory>("LIGHT");
  const [savingLabel, setSavingLabel] = useState<"idle" | "saving" | "saved">("idle");
  const [rentalName, setRentalName] = useState("");
  const [addingRental, setAddingRental] = useState(false);

  const flashSaving = async (action: () => Promise<void> | void) => {
    setSavingLabel("saving");
    await action();
    setSavingLabel("saved");
    setTimeout(() => setSavingLabel("idle"), 1500);
  };

  const itemsForTab = prepItems.filter((item) => item.category === activeTab);

  const submitRental = async () => {
    if (!rentalName.trim()) return;
    await onAddRental(rentalName.trim());
    setRentalName("");
    setAddingRental(false);
  };

  return (
    <div className="pc-card pc-card--padded" style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.ink }}>준비사항</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: savingLabel === "idle" ? "transparent" : C.muted }}>
          {savingLabel === "saving" ? "저장 중..." : savingLabel === "saved" ? "저장 완료" : "-"}
        </span>
      </div>

      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
        {TAB_ORDER.map((cat) => {
          const items = prepItems.filter((i) => i.category === cat);
          const selectedCount = items.filter((i) => i.selected).length;
          const active = cat === activeTab;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveTab(cat)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                border: "none", borderRadius: R.sm, padding: "8px 10px", cursor: "pointer", textAlign: "left",
                background: active ? C.mint : "transparent", color: active ? C.teal : C.muted,
                fontWeight: active ? 800 : 600, fontSize: 12.5,
              }}
            >
              <span>{TAB_LABEL[cat]}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{selectedCount} / {items.length}</span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
        {prepLoading ? (
          <p style={{ fontSize: 12, color: C.hint }}>불러오는 중...</p>
        ) : itemsForTab.length === 0 ? (
          <p style={{ fontSize: 12, color: C.hint }}>이 카테고리에 장비가 없습니다.</p>
        ) : (
          itemsForTab.map((item) => (
            <label
              key={item.equipmentId}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={item.selected}
                onChange={(e) => void flashSaving(() => onToggleSelected(item.equipmentId, e.target.checked))}
                style={{ width: 15, height: 15, accentColor: C.teal, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12.5, color: item.selected ? C.ink : C.muted, fontWeight: item.selected ? 700 : 500 }}>
                {item.name}
              </span>
            </label>
          ))
        )}
      </div>

      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>렌탈 장비</span>
          <button
            type="button"
            onClick={() => setAddingRental((v) => !v)}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: "0 10px", borderRadius: R.sm, border: "none", background: C.orange, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
          >
            <Plus size={12} />추가
          </button>
        </div>

        {addingRental ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              autoFocus
              value={rentalName}
              onChange={(e) => setRentalName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitRental(); }}
              placeholder="렌탈 장비명 입력"
              style={{ flex: 1, height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12 }}
            />
            <button type="button" onClick={submitRental} disabled={!rentalName.trim()}
              style={{ height: 30, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 800, cursor: !rentalName.trim() ? "not-allowed" : "pointer", opacity: !rentalName.trim() ? 0.6 : 1 }}>
              추가
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rentals.length === 0 ? (
            <p style={{ fontSize: 11.5, color: C.hint }}>등록된 렌탈 장비가 없습니다.</p>
          ) : (
            rentals.map((rental) => (
              <div key={rental.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px" }}>
                <input
                  type="checkbox"
                  checked={rental.checked}
                  onChange={(e) => onToggleRental(rental.id, e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: C.teal, cursor: "pointer" }}
                />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: rental.checked ? C.ink : C.muted, fontWeight: rental.checked ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rental.name}
                </span>
                <button type="button" onClick={() => onDeleteRental(rental.id)} aria-label="삭제" title="삭제"
                  style={{ border: "none", background: "transparent", color: C.hint, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
