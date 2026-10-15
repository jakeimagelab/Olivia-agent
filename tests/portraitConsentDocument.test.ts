import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PortraitConsentSignedDocument from "@/components/portrait-consent/PortraitConsentSignedDocument";

const consent = {
  title: "페이버요양병원 초상권 동의서",
  intro_text: "기존 안내 문구",
  detail_fields: [
    { label: "촬영 목적", value: "병원 홍보에 필요한 사진촬영" },
    { label: "촬영 의뢰", value: "페이버요양병원" },
    { label: "촬영 일시", value: "2026. 7. 2." },
    { label: "촬영 장소", value: "페이버요양병원" },
    { label: "촬영 내용", value: "사진" },
    { label: "사용 기간", value: "최초 게재일부터 3년" },
  ],
  usage_items: [
    { label: "홈페이지", value: "홈페이지 사진 콘텐츠로 사용" },
    { label: "SNS 및 홍보매체", value: "홍보매체(SNS 포함)에 콘텐츠로 사용" },
  ],
};

describe("PortraitConsentSignedDocument", () => {
  it("renders the fixed two-page legal document without inventing a document number", () => {
    const markup = renderToStaticMarkup(createElement(PortraitConsentSignedDocument, {
      consent,
      signature: {
        consent_shoot: true,
        consent_usage: true,
        provider_name: "정민홍",
        provider_phone: "010-1234-5678",
        appearance_role: "patient_customer",
        appearance_role_other: null,
        is_real_identity: false,
        consent_sensitive: null,
        signature_data_url: "data:image/png;base64,signature",
        signed_date: "2026년 10월 15일",
      },
    }));

    expect(markup.match(/data-portrait-consent-page=/g)).toHaveLength(2);
    expect(markup).toContain("문서번호 —");
    expect(markup).toContain("초상권 사용 동의서");
    expect(markup).toContain("개인정보 수집·이용 동의");
    expect(markup).toContain("본 동의서는 2면으로 구성되며, 2면의 개인정보 동의까지 받아야 효력이 있습니다.");
    expect(markup).toContain("해당 없음");
    expect(markup).toContain("포토클리닉 정연호 · 010-8556-2988 · jakeimagelab@gmail.com");
    expect(markup).not.toContain("계좌");
  });

  it("renders legacy signatures with the new fields left blank", () => {
    expect(() => renderToStaticMarkup(createElement(PortraitConsentSignedDocument, {
      consent,
      signature: {
        consent_shoot: true,
        consent_usage: true,
        provider_name: "기존 서명자",
        signature_data_url: "data:image/png;base64,signature",
        signed_date: "2026년 10월 14일",
      },
    }))).not.toThrow();
  });
});
