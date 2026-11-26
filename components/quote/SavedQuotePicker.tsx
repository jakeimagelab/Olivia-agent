"use client";

import { useEffect, useState } from "react";
import { FileText, Search } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { fuzzyIncludes } from "@/lib/olivia/nameSearch";
import { isPcrmUuid } from "@/lib/pcrm/validation";

type SavedQuote = {
  id: string;
  title?: string | null;
  hospital_name?: string | null;
  quote_number?: string | null;
  total_amount?: number | null;
};

const amountFormatter = new Intl.NumberFormat("ko-KR");

export default function SavedQuotePicker({ purpose, onChoose, onClose }: {
  purpose: "edit" | "portal";
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [quotes, setQuotes] = useState<SavedQuote[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    const loadQuotes = async () => {
      try {
        const response = await fetch("/api/quotes?limit=50", { cache: "no-store", signal: request.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !Array.isArray(data.quotes)) {
          throw new Error(response.status === 401 ? "관리자 로그인 후 견적서를 불러올 수 있습니다." : "저장된 견적서를 불러오지 못했습니다.");
        }
        if (!request.signal.aborted) setQuotes(data.quotes.filter((quote: SavedQuote) => isPcrmUuid(quote?.id)));
      } catch (cause) {
        if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "견적서를 불러오지 못했습니다.");
      }
    };
    void loadQuotes();
    return () => request.abort();
  }, [attempt]);

  const keyword = query.trim();
  const matches = quotes?.filter((quote) => !keyword || fuzzyIncludes(`${quote.hospital_name ?? ""} ${quote.title ?? ""} ${quote.quote_number ?? ""}`, keyword));

  return (
    <Modal open onClose={onClose} title={purpose === "portal" ? "문서 포털에서 열 견적 선택" : "저장된 견적서 불러오기"} width={574}>
      <label className="quote-picker-search">
        <Search size={16} aria-hidden />
        <input autoFocus aria-label="최근 견적서 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="고객명, 제목 또는 견적번호" />
      </label>
      {error ? <div className="quote-picker-message" role="alert">
        <span>{error}</span>
        <Button onClick={() => { setError(""); setAttempt((value) => value + 1); }}>다시 불러오기</Button>
      </div> : !matches ? <p className="quote-picker-message" role="status">견적서를 불러오는 중…</p>
        : matches.length ? <ul className="quote-picker-list" aria-label="최근 저장된 견적서">
          {matches.map((quote) => (
            <li key={quote.id}>
              <button type="button" onClick={() => onChoose(quote.id)}>
                <FileText size={17} aria-hidden />
                <span className="quote-picker-document">
                  <strong>{quote.title?.trim() || quote.hospital_name || "견적서"}</strong>
                  <small>{[quote.hospital_name, quote.quote_number].filter(Boolean).join(" · ")}</small>
                </span>
                {quote.total_amount != null && <span className="quote-picker-amount">{amountFormatter.format(quote.total_amount)}원</span>}
              </button>
            </li>
          ))}
        </ul> : <p className="quote-picker-message" role="status">
          {keyword ? "최근 견적서에서 검색 결과를 찾지 못했습니다." : "견적서를 작성해 임시저장하면 이곳에서 열 수 있습니다."}
        </p>}
    </Modal>
  );
}
