"use client";

import { forwardRef } from "react";
import type {
  PortraitConsentAppearanceRole,
  PortraitConsentField,
  PortraitConsentSignature,
} from "@/lib/portraitConsent";
import styles from "./PortraitConsentDocument.module.css";

export interface PortraitConsentDocumentSource {
  title: string;
  intro_text: string;
  detail_fields: PortraitConsentField[];
  usage_items: PortraitConsentField[];
}

export type PortraitConsentDocumentSignature = Partial<PortraitConsentSignature>;

interface PortraitConsentSignedDocumentProps {
  consent: PortraitConsentDocumentSource;
  signature?: PortraitConsentDocumentSignature | null;
  documentNumber?: string | null;
}

const ROLE_LABELS: Record<PortraitConsentAppearanceRole, string> = {
  patient_customer: "환자·고객",
  medical_staff: "의료진",
  staff: "직원",
  other: "기타",
};

function detailValue(fields: PortraitConsentField[], ...labels: string[]): string {
  return fields.find((field) => labels.includes(field.label.trim()))?.value?.trim() ?? "";
}

function displayRole(signature?: PortraitConsentDocumentSignature | null): string {
  if (!signature?.appearance_role) return "";
  if (signature.appearance_role === "other") return signature.appearance_role_other?.trim() || ROLE_LABELS.other;
  return ROLE_LABELS[signature.appearance_role];
}

function displayIdentity(value: boolean | null | undefined): string {
  if (value === true) return "실제 본인 신분";
  if (value === false) return "역할 출연(연기)";
  return "";
}

function SectionHeading({ number, children, aside }: { number: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={styles.sectionHeading}>
      <span>{number}</span>
      <strong>{children}</strong>
      {aside ? <small>{aside}</small> : null}
    </div>
  );
}

function ConsentChecks({
  value,
  includeNotApplicable = false,
}: {
  value: boolean | null | undefined;
  includeNotApplicable?: boolean;
}) {
  const notApplicable = includeNotApplicable && value === null;
  return (
    <div className={styles.checkGroup}>
      <span className={value === true ? styles.checkSelected : ""}><i>{value === true ? "✓" : ""}</i>동의</span>
      <span className={value === false ? styles.checkSelected : ""}><i>{value === false ? "✓" : ""}</i>미동의</span>
      {includeNotApplicable ? (
        <span className={notApplicable ? styles.checkSelected : ""}><i>{notApplicable ? "✓" : ""}</i>해당 없음</span>
      ) : null}
    </div>
  );
}

function PageHeader({ documentNumber, secondLine }: { documentNumber?: string | null; secondLine: string }) {
  return (
    <header className={styles.letterhead}>
      <img src="/assets/photoclinic-logo.png" alt="포토클리닉" />
      <div>
        <span>문서번호 {documentNumber?.trim() || "—"}</span>
        <span>{secondLine}</span>
      </div>
    </header>
  );
}

function PageFooter({ page }: { page: 1 | 2 }) {
  return (
    <footer className={styles.pageFooter}>
      <div>
        <span>포토클리닉 · 제이크이미지연구소</span>
        <span>서울 강남구 논현로150길 36-5</span>
      </div>
      <span>{page} / 2</span>
    </footer>
  );
}

function ProviderSignature({ signature }: { signature?: PortraitConsentDocumentSignature | null }) {
  return (
    <div className={styles.signatureLine}>
      <span>초상권 제공자</span>
      <strong>{signature?.provider_name ?? ""}</strong>
      <span>(인)</span>
      {signature?.signature_data_url ? (
        <img src={signature.signature_data_url} alt={`${signature.provider_name || "제공자"} 서명`} />
      ) : null}
    </div>
  );
}

function CompanySignature() {
  return (
    <div className={styles.signatureLine}>
      <span>포토클리닉 대표</span>
      <strong>정연호</strong>
      <span>(인)</span>
      <img src="/assets/ceo-signature.png" alt="포토클리닉 대표 서명" />
    </div>
  );
}

const PortraitConsentSignedDocument = forwardRef<HTMLDivElement, PortraitConsentSignedDocumentProps>(
  function PortraitConsentSignedDocument({ consent, signature, documentNumber }, ref) {
    const details = consent.detail_fields ?? [];
    const usage = consent.usage_items ?? [];
    const hospitalName = detailValue(details, "촬영 의뢰");
    const shootDate = detailValue(details, "촬영 일시", "촬영일");
    const shootPlace = detailValue(details, "촬영 장소", "장소");
    const dateAndPlace = [shootDate, shootPlace].filter(Boolean).join(" · ");
    const signedDate = signature?.signed_date ?? "";
    const sensitiveValue = signature?.is_real_identity === false ? null : signature?.consent_sensitive;

    return (
      <div className={styles.document} ref={ref}>
        <article className={styles.page} data-portrait-consent-page="1">
          <PageHeader documentNumber={documentNumber} secondLine={signedDate ? `발행일 ${signedDate}` : "발행일 —"} />

          <div className={styles.titleBlock}>
            <h1>초상권 사용 동의서</h1>
            <p>{hospitalName ? `${hospitalName} 모델 촬영` : ""}</p>
          </div>

          <div className={styles.noticeBox}>
            본 동의서는 포토클리닉이 홍보영상·사진 제작에 필요한 인물촬영(사진·영상)에 관하여 초상권 제공자의 동의를 받기 위한 문서입니다. 아래에 적힌 목적 외의 용도로는 사용하지 않습니다.
          </div>

          <section>
            <SectionHeading number={1}>촬영 정보</SectionHeading>
            <div className={styles.infoTable}>
              <div><strong>촬영 목적</strong><span>{detailValue(details, "촬영 목적")}</span></div>
              <div><strong>촬영 의뢰</strong><span>{hospitalName ? `${hospitalName} (의뢰) · 포토클리닉 (촬영·제작)` : ""}</span></div>
              <div><strong>촬영 일시 · 장소</strong><span>{dateAndPlace}</span></div>
              <div><strong>촬영 내용</strong><span>{detailValue(details, "촬영 내용")}</span></div>
              <div><strong>사용 기간</strong><span>{detailValue(details, "사용 기간")}</span></div>
              <div><strong>출연 역할</strong><span>{displayRole(signature)}</span></div>
              <div><strong>실제 신분 여부</strong><span>{displayIdentity(signature?.is_real_identity)}</span></div>
            </div>
          </section>

          <section>
            <SectionHeading number={2}>활용 범위</SectionHeading>
            <div className={styles.infoTable}>
              <div><strong>홈페이지</strong><span>{usage[0]?.value?.trim() ?? ""}</span></div>
              <div><strong>SNS 및 홍보매체</strong><span>{usage[1]?.value?.trim() ?? ""}</span></div>
              <div className={styles.tallRow}>
                <strong>편집·보정</strong>
                <span>
                  <b>합니다</b> — 밝기·색감 보정, 자르기, 크기 조정, 먼지·반사 제거<br />
                  <b>하지 않습니다</b> — 얼굴·체형 변형, 다른 사람·장소와의 합성, 받지 않은 시술을 받은 것처럼 보이게 하는 편집
                </span>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading number={3}>동의 확인</SectionHeading>
            <div className={styles.consentTable}>
              <div><span>사진·영상 촬영에 동의합니다</span><ConsentChecks value={signature?.consent_shoot} /></div>
              <div><span>위 활용 범위의 홍보 목적 사용에 동의합니다</span><ConsentChecks value={signature?.consent_usage} /></div>
            </div>
          </section>

          <ul className={styles.bulletNotice}>
            <li>본인은 위 내용을 충분히 안내받았으며, 자유로운 의사에 따라 동의합니다.</li>
            <li>동의는 언제든 철회할 수 있습니다. 철회 방법과 처리 절차는 2면에 있습니다.</li>
            <li>본 동의서는 2면으로 구성되며, 2면의 개인정보 동의까지 받아야 효력이 있습니다.</li>
          </ul>

          <div className={styles.providerPhone}>
            <span>제공자 연락처</span>
            <strong>{signature?.provider_phone ?? ""}</strong>
          </div>
          <p className={styles.signedDate}>{signedDate}</p>
          <div className={styles.signatureGrid}>
            <ProviderSignature signature={signature} />
            <CompanySignature />
          </div>

          <PageFooter page={1} />
        </article>

        <article className={styles.page} data-portrait-consent-page="2">
          <PageHeader documentNumber={documentNumber} secondLine="초상권 사용 동의서 2면" />

          <div className={styles.titleBlock}>
            <h1>개인정보 수집·이용 동의</h1>
            <p>개인정보 보호법에 따른 안내</p>
          </div>

          <section>
            <SectionHeading number={4}>수집·이용 안내</SectionHeading>
            <div className={styles.infoTable}>
              <div><strong>수집 항목</strong><span>성명, 연락처, 촬영된 사진·영상</span></div>
              <div><strong>이용 목적</strong><span>병원 홍보용 사진·영상 콘텐츠의 제작과 게재 (1면 활용 범위에 한함)</span></div>
              <div className={styles.tallRow}>
                <strong>보유·이용 기간</strong>
                <span>촬영물 — 최초 게재일부터 3년. 기간이 끝나면 게재를 중단하고 원본을 파기합니다.<br />동의서 — 분쟁 대비를 위해 3년 보관 후 파기합니다.</span>
              </div>
              <div className={styles.tallRow}>
                <strong>취급하는 자</strong>
                <span>포토클리닉 — 촬영·편집·원본 보관<br />{hospitalName ? `${hospitalName} — ` : ""}완성된 콘텐츠를 받아 게재</span>
              </div>
            </div>
          </section>

          <div className={styles.warningBox}>
            <strong>동의를 거부할 권리가 있습니다.</strong> 거부하셔도 됩니다. 다만 동의하지 않으시면 촬영과 게재가 이루어지지 않습니다. 그 밖의 불이익은 없습니다.
          </div>

          <section>
            <SectionHeading number={5} aside="— 1면에서 실제 본인 신분을 선택한 경우에만 작성합니다">민감정보</SectionHeading>
            <div className={styles.sensitiveBox}>
              <p>요양병원에서 촬영된 사진은 본인이 이 기관의 환자·이용자임을 드러낼 수 있어, 건강에 관한 정보로 다루어질 수 있습니다. 실제 신분으로 촬영하신 경우 이 항목에 따로 동의해 주셔야 합니다.</p>
              <div>
                <strong>건강 관련 정보가 드러날 수 있음을 알고 동의합니다</strong>
                <ConsentChecks value={sensitiveValue} includeNotApplicable={signature?.is_real_identity === false} />
              </div>
            </div>
          </section>

          <section>
            <SectionHeading number={6}>동의 확인</SectionHeading>
            <div className={styles.consentTable}>
              <div><span>위 개인정보 수집·이용에 동의합니다</span><ConsentChecks value={signature?.consent_usage} /></div>
            </div>
          </section>

          <section>
            <SectionHeading number={7}>철회와 문의</SectionHeading>
            <div className={styles.infoTable}>
              <div><strong>철회 창구</strong><span>포토클리닉 정연호 · 010-8556-2988 · jakeimagelab@gmail.com</span></div>
              <div className={styles.tallRow}>
                <strong>처리 방법</strong>
                <span>철회 요청을 받으면 새로운 게재를 즉시 중단하고, 이미 게재된 것은 7일 이내에 내립니다.<br />인쇄물처럼 회수가 어려운 것은 다시 만들 때 제외합니다.</span>
              </div>
            </div>
          </section>

          <div className={styles.bottomNotice}>성명과 연락처는 1면에 적은 내용을 그대로 사용합니다. 두 번 적지 않으셔도 됩니다.</div>
          <p className={styles.signedDate}>{signedDate}</p>
          <div className={styles.pageTwoSignature}>
            <ProviderSignature signature={signature} />
          </div>
          <p className={styles.copyNotice}>본 동의서 사본 1부를 제공자에게 드립니다.</p>

          <PageFooter page={2} />
        </article>
      </div>
    );
  },
);

export default PortraitConsentSignedDocument;
