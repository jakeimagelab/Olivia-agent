"use client";

import { useEffect, useState } from "react";
import StaffGuide, { type StaffGuideEquipment } from "@/components/staff-guide/StaffGuide";

type EquipmentResponse = {
  ok?: boolean;
  equipment?: Array<{
    name?: string;
    category?: string;
    quantity?: number;
    usage?: string | null;
    note?: string | null;
  }>;
  error?: string;
};

const stateStyle = { padding: 24, color: "var(--muted)", fontSize: 12 } as const;

export function StaffGuideWindowContent() {
  const [equipment, setEquipment] = useState<StaffGuideEquipment[]>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/work-journal/equipment", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as EquipmentResponse;
        if (!response.ok || !body.ok) throw new Error(body.error || "장비 목록을 불러오지 못했습니다.");
        setEquipment((body.equipment ?? []).map((item) => ({
          name: item.name ?? "",
          category: item.category ?? "ETC",
          quantity: Math.max(1, Number(item.quantity) || 1),
          usage: item.usage ?? null,
          note: item.note ?? null,
        })));
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "장비 목록을 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, []);

  if (error) return <div style={stateStyle} role="alert">{error}</div>;
  if (!equipment) return <div style={stateStyle}>가이드를 준비하는 중...</div>;
  return <StaffGuide equipment={equipment} />;
}
