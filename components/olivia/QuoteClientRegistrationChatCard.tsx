"use client";

import { useEffect, useState } from "react";
import { callOliviaTool } from "@/lib/olivia/inline-tools/callTool";

type MatchStatus = "loading" | "already_linked" | "no_match" | "match" | "ambiguous" | "error";
type Candidate = { id: string; hospital_name: string };

// 견적서 마법사 STEP 6-7(스펙 §23-29) — 최종 승인을 요청하기 직전에(발행이 자동으로 고객을
// 연결/생성해버리기 전에) 병원명으로 등록된 고객을 찾아 보여준다. flowId=quoteId. 독립
// Inline Tool로 등록하지 않고 QuoteWizardChatCard가 직접 이 컴포넌트를 렌더한다 — 별도
// 채팅 카드를 새로 띄우면 resolve_quote_client를 마법사가 직접 호출할 때도 리졸버가 중복
// 카드를 또 띄우게 되어(모든 도구 호출은 uiActionResolvers를 거친다), resolve_quote_client의
// 리졸버는 UI 액션을 만들지 않는다 — 이 컴포넌트가 유일한 진입점이다.
export default function QuoteClientRegistrationChatCard({ flowId, onDone }: { flowId: string; onDone?: () => void }) {
  const [status, setStatus] = useState<MatchStatus>("loading");
  const [hospitalName, setHospitalName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { result } = await callOliviaTool("resolve_quote_client", { quoteId: flowId });
        if (cancelled) return;
        setStatus((result?.status as MatchStatus) || "no_match");
        setHospitalName(String(result?.hospitalName || ""));
        setCandidates(Array.isArray(result?.candidates) ? (result?.candidates as Candidate[]) : []);
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "고객 정보를 확인하지 못했어요.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [flowId]);

  const finishWith = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const registerNew = () => finishWith(async () => {
    await callOliviaTool("link_new_client_to_quote", { resourceId: flowId, clientId: null, hospitalName });
  });

  const linkCandidate = (candidate: Candidate) => finishWith(async () => {
    await callOliviaTool("link_new_client_to_quote", { resourceId: flowId, clientId: candidate.id });
  });

  const later = () => {
    setDismissed(true);
    onDone?.();
  };

  if (dismissed || status === "already_linked" || status === "loading") return null;

  return (
    <div className="olivia-select-match-card">
      <div className="olivia-select-match-card__section">
        {status === "no_match" && <p>&ldquo;{hospitalName}&rdquo;을(를) 고객으로 등록할까요?</p>}
        {status === "match" && <p>&ldquo;{candidates[0]?.hospital_name}&rdquo;과(와) 같은 고객으로 보여요. 연결할까요?</p>}
        {status === "ambiguous" && <p>&ldquo;{hospitalName}&rdquo;와(과) 비슷한 고객이 여러 명이에요. 어떤 고객인가요?</p>}
        {status === "error" && <p>고객 정보를 확인하지 못했어요.</p>}
        {error && <div className="olivia-select-match-card__error">{error}</div>}
        <div className="olivia-select-match-card__actions">
          {status === "no_match" && <button type="button" disabled={busy} onClick={registerNew}>고객 등록</button>}
          {status === "match" && candidates[0] && <button type="button" disabled={busy} onClick={() => linkCandidate(candidates[0])}>연결</button>}
          {status === "ambiguous" && candidates.map((candidate) => (
            <button key={candidate.id} type="button" disabled={busy} onClick={() => linkCandidate(candidate)}>{candidate.hospital_name}</button>
          ))}
          {status === "ambiguous" && <button type="button" disabled={busy} onClick={registerNew}>새로 등록</button>}
          <button type="button" className="is-secondary" disabled={busy} onClick={later}>나중에</button>
        </div>
      </div>
    </div>
  );
}
