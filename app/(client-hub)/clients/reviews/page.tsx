"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePcrmHeaderTitle } from "@/components/pcrm/PcrmHeaderActionsSlot";
import PcrmReviewTable, { type ReviewRow } from "../_components/PcrmReviewTable";

export default function ClientReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  usePcrmHeaderTitle("리뷰 관리", "받은 리뷰를 관리하고, 콘텐츠 제작으로 연결합니다.", []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews", { cache: "no-store" });
      const d = await res.json();
      if (d.ok) setReviews(d.reviews || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRegister = useMemo(() => async (input: { hospitalName: string; reviewText: string; reviewerName: string; rating: number }) => {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hospitalName: input.hospitalName,
        reviewText: input.reviewText,
        reviewerName: input.reviewerName,
        rating: input.rating,
        source: "manual",
      }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || "등록하지 못했습니다.");
    await load();
  }, [load]);

  const onEdit = useMemo(() => async (id: string, patch: { reviewText?: string; reviewerName?: string }) => {
    const res = await fetch(`/api/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || "수정하지 못했습니다.");
    await load();
  }, [load]);

  const onDelete = useMemo(() => async (id: string) => {
    const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { alert(d.error || "삭제하지 못했습니다."); return; }
    await load();
  }, [load]);

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 80px" }}>
      <PcrmReviewTable reviews={reviews} loading={loading} onRegister={onRegister} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}
