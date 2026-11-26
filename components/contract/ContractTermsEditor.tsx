"use client";

import { useId } from "react";
import {
  CONTRACT_CLAUSE_TEXT_LIMIT,
  CONTRACT_EDITABLE_CLAUSES,
  CONTRACT_TERM_TEXT_LIMIT,
  defaultContractClauses,
  type ContractBrand,
  type ContractQuoteData,
} from "@/lib/contract/contractDocument";
import styles from "./ContractBuilder.module.css";

type Terms = Pick<ContractQuoteData, "shootDate" | "depositRate" | "paymentTerms" | "deliveryTerms" | "specialTerms" | "clauses">;

export default function ContractTermsEditor({
  brand, quote, defaultDepositRate, editLock, onChange,
}: {
  brand: ContractBrand;
  quote: Terms;
  defaultDepositRate: number;
  editLock: string | null;
  onChange: (update: Partial<Terms>) => void;
}) {
  const headingId = useId();
  const defaults = defaultContractClauses(brand);

  return (
    <section className={`pc-card pc-card--padded ${styles.terms}`} aria-labelledby={headingId}>
      <h2 id={headingId}>계약 내용 수정</h2>
      {editLock ? <p className={styles.locked}>{editLock} 미리보기와 다운로드를 이용할 수 있습니다.</p> : (
        <fieldset className={styles.termsFieldset} aria-labelledby={headingId}>
          <label className={styles.field}>
            촬영 예정일
            <input value={quote.shootDate ?? ""} placeholder="상호 협의 후 확정" maxLength={CONTRACT_TERM_TEXT_LIMIT}
              onChange={(event) => onChange({ shootDate: event.currentTarget.value || null })} />
          </label>
          <label className={styles.field}>
            선금 비율 (%)
            <input type="number" min={0} max={100} step="any" value={quote.depositRate ?? ""} placeholder={String(defaultDepositRate)}
              onChange={(event) => {
                const input = event.currentTarget;
                if (input.validity.valid) onChange({ depositRate: input.value === "" ? undefined : input.valueAsNumber });
              }} />
          </label>
          <label className={styles.field}>
            잔금 납부 시점
            <input value={quote.paymentTerms ?? ""} placeholder="마지막 촬영 직후" maxLength={CONTRACT_TERM_TEXT_LIMIT}
              onChange={(event) => onChange({ paymentTerms: event.currentTarget.value || undefined })} />
          </label>
          <label className={styles.field}>
            사진 납품 기한
            <input value={quote.deliveryTerms ?? ""} placeholder="3주" maxLength={CONTRACT_TERM_TEXT_LIMIT}
              onChange={(event) => onChange({ deliveryTerms: event.currentTarget.value || undefined })} />
          </label>
          <label className={styles.field}>
            특약사항
            <textarea rows={4} value={quote.specialTerms ?? ""} placeholder="합의한 추가 조건을 입력하세요" maxLength={CONTRACT_CLAUSE_TEXT_LIMIT}
              onChange={(event) => onChange({ specialTerms: event.currentTarget.value || undefined })} />
          </label>
          <details className={styles.clauses}>
            <summary>계약 조항 편집</summary>
            {CONTRACT_EDITABLE_CLAUSES.map(({ key, number, title }) => (
              <div className={styles.clause} key={key}>
                <label className={styles.field}>
                  {number} {title}
                  <textarea rows={5} value={quote.clauses?.[key] ?? defaults[key]} maxLength={CONTRACT_CLAUSE_TEXT_LIMIT}
                    onChange={(event) => onChange({ clauses: { ...quote.clauses, [key]: event.currentTarget.value } })} />
                </label>
                {quote.clauses?.[key] !== undefined && (
                  <button type="button" className={styles.restore} aria-label={`${number} 기본 문구 복원`} onClick={() => {
                    const clauses = { ...quote.clauses };
                    delete clauses[key];
                    onChange({ clauses });
                  }}>기본 문구 복원</button>
                )}
              </div>
            ))}
          </details>
        </fieldset>
      )}
    </section>
  );
}
