"use client";

import { useState } from "react";
import { useQuoteWizardChatStore } from "@/lib/store/useQuoteWizardChatStore";
import { packages } from "@/lib/quote/quoteCatalog";
import { BRAND_CONFIG } from "@/lib/quote/quoteCatalog";
import { callOliviaTool } from "@/lib/olivia/inline-tools/callTool";

function formatWon(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

// 견적서 마법사 STEP 2 — 스펙 §5-9: 고객정보/패키지를 한 번에 입력한다. create_quote와
// 정확히 같은 필드만 받는다(같은 도구를 자연어 입력과 이 폼이 그대로 공유 — 스펙 §7).
// 고객명 + 패키지만 있으면 생성 가능하고(스펙 §6, 담당자/연락처/이메일 필수화 금지),
// 제출은 GPT를 거치지 않고 callOliviaTool로 create_quote를 직접 실행한다.
export default function QuoteSetupForm({ flowId }: { flowId: string }) {
  const flow = useQuoteWizardChatStore((state) => state.flows[flowId]);
  const [hospitalName, setHospitalName] = useState("");
  const [packageId, setPackageId] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [profileCount, setProfileCount] = useState("");
  const [stagedCount, setStagedCount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!flow || !flow.brand) return null;
  const cfg = BRAND_CONFIG[flow.brand];

  const canSubmit = hospitalName.trim().length > 0 && Boolean(packageId) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { result } = await callOliviaTool("create_quote", {
        brand: flow.brand,
        hospitalName: hospitalName.trim(),
        packageId,
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        shootDate: shootDate || null,
        profileCount: profileCount ? Number(profileCount) : null,
        stagedCount: stagedCount ? Number(stagedCount) : null,
        memo: memo.trim() || null,
      });
      const quoteId = result?.quoteId ? String(result.quoteId) : null;
      if (!quoteId) throw new Error("견적 생성 결과를 확인하지 못했어요.");
      useQuoteWizardChatStore.getState().setQuoteId(flowId, quoteId);
      useQuoteWizardChatStore.getState().setStep(flowId, "discount");
    } catch (e) {
      setError(e instanceof Error ? e.message : "견적 생성에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="olivia-select-match-card">
      <div className="olivia-select-match-card__section">
        <p>고객정보와 패키지 형태, 추가 옵션에 대해서 알려주시면 바로 반영할게요.</p>
        <textarea
          value={hospitalName}
          onChange={(event) => setHospitalName(event.target.value)}
          placeholder={cfg.entityPlaceholder}
          rows={1}
        />
      </div>
      <div className="olivia-select-match-card__section">
        <strong>패키지</strong>
        <div className="olivia-select-match-card__tabs" style={{ flexWrap: "wrap" }}>
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              className={packageId === pkg.id ? "is-active" : ""}
              onClick={() => setPackageId(pkg.id)}
            >
              {pkg.name} · {formatWon(pkg.price)}
            </button>
          ))}
        </div>
      </div>
      <div className="olivia-select-match-card__section">
        <strong>담당자 정보(선택)</strong>
        <textarea value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="담당자명" rows={1} />
        <textarea value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="연락처" rows={1} />
        <textarea value={email} onChange={(event) => setEmail(event.target.value)} placeholder="이메일" rows={1} />
        <input type="date" value={shootDate} onChange={(event) => setShootDate(event.target.value)} />
      </div>
      <div className="olivia-select-match-card__section">
        <strong>추가 인원(선택)</strong>
        <div className="olivia-select-match-card__actions">
          <input type="number" min={0} value={profileCount} onChange={(event) => setProfileCount(event.target.value)} placeholder="프로필 추가 인원" />
          <input type="number" min={0} value={stagedCount} onChange={(event) => setStagedCount(event.target.value)} placeholder="연출 추가 인원" />
        </div>
      </div>
      <div className="olivia-select-match-card__section">
        {error && <div className="olivia-select-match-card__error">{error}</div>}
        <div className="olivia-select-match-card__actions">
          <button type="button" onClick={submit} disabled={!canSubmit}>
            {submitting ? "생성 중…" : "견적서 만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
