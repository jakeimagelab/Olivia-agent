"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

type Suggestion = { id: string; text: string; href: string };

// 홈 "스마트 제안" — 새 AI 추천 로직이 아니라, 기존 /api/dashboard가 이미 계산해두는
// 견적 후속/계약 대기/갤러리 준비/리뷰 대기/SNS 대기/메일 대기 건수를 그대로 문장으로 바꿔 보여준다.
function buildSuggestions(data: ReturnType<typeof useHomeDashboardData>["data"]): Suggestion[] {
  if (!data) return [];
  const clients = data.clients ?? {};
  const mailingPending = data.mailing?.pending?.length ?? 0;
  const list: Suggestion[] = [];

  const quoteCount = clients.quoteFollowUp?.length ?? 0;
  if (quoteCount > 0) list.push({ id: "quote", text: `견적 후속이 필요한 프로젝트가 ${quoteCount}건 있어요.`, href: "/clients" });

  const contractCount = clients.contractPending?.length ?? 0;
  if (contractCount > 0) list.push({ id: "contract", text: `계약서 확인이 대기 중인 프로젝트가 ${contractCount}건 있어요.`, href: "/clients" });

  const galleryCount = clients.galleryPending?.length ?? 0;
  if (galleryCount > 0) list.push({ id: "gallery", text: `갤러리 납품 준비가 필요한 프로젝트가 ${galleryCount}건 있어요.`, href: "/clients" });

  const reviewCount = clients.reviewPending?.length ?? 0;
  if (reviewCount > 0) list.push({ id: "review", text: `리뷰 콘텐츠 작업이 대기 중인 프로젝트가 ${reviewCount}건 있어요.`, href: "/clients" });

  if (mailingPending > 0) list.push({ id: "mailing", text: `발송 대기 중인 메일이 ${mailingPending}건 있어요.`, href: "/mailing" });

  return list;
}

export default function SmartSuggestions() {
  const { data, state } = useHomeDashboardData();
  const suggestions = buildSuggestions(data);

  return (
    <section className="pc-panel">
      <div className="pc-panel__header">
        <h3>스마트 제안</h3>
      </div>
      <div className="pc-smart-suggestions__list">
        {state === "loading" ? (
          <div className="pc-panel__empty">불러오는 중...</div>
        ) : suggestions.length === 0 ? (
          <div className="pc-panel__empty">지금은 특별히 챙길 항목이 없어요.</div>
        ) : (
          suggestions.map((suggestion) => (
            <Link key={suggestion.id} href={suggestion.href} className="pc-smart-suggestions__row">
              <span>{suggestion.text}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
