import { mobileResourceStatusLabel } from "@/lib/olivia/mobile/resources";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

type Row = Record<string, unknown>;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function won(value: unknown) {
  return `${number(value).toLocaleString("ko-KR")}원`;
}

export function MobileQuoteDocument({ quote }: { quote: Row }) {
  const items = Array.isArray(quote.items) ? quote.items as Row[] : [];
  return (
    <article className={styles.previewPaper} data-mobile-resource-document="quote">
      <header className={styles.documentHero}>
        <span>견적서</span>
        <h2>{String(quote.title || `${quote.hospital_name || "고객"} 견적서`)}</h2>
        <p>{String(quote.hospital_name || "고객")} · {String(quote.quote_number || "")}</p>
      </header>
      <dl className={styles.documentMeta}>
        <div><dt>견적일</dt><dd>{String(quote.quote_date || "-")}</dd></div>
        <div><dt>촬영 예정일</dt><dd>{String(quote.shoot_date || "-")}</dd></div>
        <div><dt>유효기간</dt><dd>{String(quote.valid_until || "-")}</dd></div>
        <div><dt>담당자</dt><dd>{String(quote.contact_name || "-")}</dd></div>
      </dl>
      <section className={styles.documentSection}>
        <h3>견적 항목</h3>
        <div className={styles.documentItems}>{items.length ? items.map((item, index) => <div key={String(item.id || index)}>
          <span><strong>{String(item.name || "견적 항목")}</strong>{item.detail ? <small>{String(item.detail)}</small> : null}</span>
          <span><small>수량 {number(item.qty) || 1}</small><strong>{won(item.subtotal)}</strong></span>
        </div>) : <p>등록된 견적 항목이 없어요.</p>}</div>
      </section>
      <section className={styles.documentTotals}>
        <div><span>공급가액</span><strong>{won(quote.supply_amount)}</strong></div>
        {number(quote.discount_amount) ? <div className={styles.documentDiscount}><span>할인</span><strong>-{won(quote.discount_amount)}</strong></div> : null}
        <div><span>부가세</span><strong>{won(quote.vat)}</strong></div>
        <div className={styles.documentGrandTotal}><span>최종 금액</span><strong>{won(quote.total_amount)}</strong></div>
      </section>
      {quote.memos ? <section className={styles.documentMemo}><h3>안내</h3><p>{String(quote.memos)}</p></section> : null}
    </article>
  );
}

export function MobileContractDocument({ contract }: { contract: Row }) {
  const quote = contract.quote_data && typeof contract.quote_data === "object" ? contract.quote_data as Row : {};
  const items = Array.isArray(quote.items) ? quote.items as Row[] : [];
  const hospital = String(contract.hospital_name || quote.hospitalName || "고객");
  return (
    <article className={styles.previewPaper} data-mobile-resource-document="contract">
      <header className={styles.documentHero}>
        <span>계약서</span>
        <h2>{hospital} 촬영 계약서</h2>
        <p>{String(contract.quote_number || quote.quoteNumber || "")}</p>
      </header>
      <dl className={styles.documentMeta}>
        <div><dt>계약 고객</dt><dd>{hospital}</dd></div>
        <div><dt>담당자</dt><dd>{String(contract.contact_name || quote.contactName || "-")}</dd></div>
        <div><dt>이메일</dt><dd>{String(contract.email || quote.email || "-")}</dd></div>
        <div><dt>상태</dt><dd>{contract.signature_data_url ? "서명 완료" : mobileResourceStatusLabel(String(contract.status || "draft"))}</dd></div>
      </dl>
      <section className={styles.documentSection}>
        <h3>계약 항목</h3>
        <div className={styles.documentItems}>{items.length ? items.map((item, index) => <div key={String(item.id || index)}>
          <span><strong>{String(item.name || "계약 항목")}</strong>{item.detail ? <small>{String(item.detail)}</small> : null}</span>
          <span><strong>{won(item.subtotal)}</strong></span>
        </div>) : <p>등록된 계약 항목이 없어요.</p>}</div>
      </section>
      <section className={styles.documentTotals}>
        <div className={styles.documentGrandTotal}><span>총 계약금액</span><strong>{won(quote.totalAmount ?? quote.total_amount)}</strong></div>
      </section>
      {[contract.payment_terms, contract.delivery_terms, contract.special_terms].some(Boolean) ? <section className={styles.documentMemo}>
        {contract.payment_terms ? <><h3>결제 조건</h3><p>{String(contract.payment_terms)}</p></> : null}
        {contract.delivery_terms ? <><h3>납품 조건</h3><p>{String(contract.delivery_terms)}</p></> : null}
        {contract.special_terms ? <><h3>특약</h3><p>{String(contract.special_terms)}</p></> : null}
      </section> : null}
    </article>
  );
}

export function MobileGenericDocument({ document, resourceType }: { document: Row; resourceType: MobileResourceType }) {
  const isStoryboard = resourceType === "storyboard";
  const title = String(document.title || (isStoryboard ? `${document.hospital_name || "고객"} 촬영 콘티` : "문서 미리보기"));
  const groups = Array.isArray(document.groups) ? document.groups as Row[] : [];
  const scenes = Array.isArray(document.scenes) ? document.scenes as Row[] : [];
  const groupNames = new Map(groups.map((group) => [String(group.id), String(group.name || "미지정")]));
  const summary = document.summary || document.raw_memo || document.memo || document.description;
  return (
    <article className={styles.previewPaper} data-mobile-resource-document={resourceType}>
      <header className={styles.documentHero}>
        <span>{isStoryboard ? "촬영 콘티" : "문서"}</span>
        <h2>{title}</h2>
        <p>{String(document.hospital_name || document.clientName || document.sourceType || "Olivia")}</p>
      </header>
      <dl className={styles.documentMeta}>
        <div><dt>상태</dt><dd>{mobileResourceStatusLabel(String(document.status || "draft"))}</dd></div>
        <div><dt>최근 수정</dt><dd>{String(document.updated_at || document.saved_at || document.created_at || "-").slice(0, 10)}</dd></div>
      </dl>
      {scenes.length ? <section className={styles.documentSection}>
        <h3>촬영 장면</h3>
        <div className={styles.documentItems}>{scenes.map((scene, index) => <div key={String(scene.id || index)}>
          <span><strong>{index + 1}. {String(scene.name || scene.keyword || "장면")}</strong><small>{groupNames.get(String(scene.group_id)) || String(scene.space_text || "장소 미정")}</small></span>
          {scene.minutes ? <span><small>{String(scene.minutes)}분</small></span> : null}
        </div>)}</div>
      </section> : null}
      {summary ? <section className={styles.documentMemo}><h3>내용</h3><p>{String(summary)}</p></section> : null}
      {!scenes.length && !summary ? <section className={styles.documentMemo}><h3>문서 정보</h3><p>현재 원본 문서의 최신 상태를 표시하고 있어요.</p></section> : null}
    </article>
  );
}
