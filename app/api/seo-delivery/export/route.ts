import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(cols: unknown[]): string {
  return cols.map(escCsv).join(",");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, hospitalName, department, region, generatedAt, results } = body as {
    type: "alt_caption_xlsx" | "metadata_csv" | "medical_ad_csv" | "upload_guide_txt" | "xmp_sidecar";
    hospitalName: string;
    department: string;
    region?: string;
    generatedAt?: string;
    results: any[];
  };

  if (!type || !results?.length) {
    return NextResponse.json({ ok: false, error: "type, results 필수" }, { status: 400 });
  }

  try {
    if (type === "alt_caption_xlsx") {
      const wb = XLSX.utils.book_new();

      // 메인 시트: ALT/캡션
      const rows = results.map((r) => ({
        original_file_name: r.originalFileName,
        seo_file_name: r.seoFileName,
        scene_type: r.sceneType || "",
        title: r.title,
        alt_text: r.altText,
        caption: r.caption,
        description: r.description,
        keywords: Array.isArray(r.keywords) ? r.keywords.join(", ") : r.keywords,
        recommended_page_section: r.recommendedPageSection,
        recommended_use: Array.isArray(r.recommendedUse) ? r.recommendedUse.join(", ") : "",
        medical_ad_risk_level: r.medicalAdRiskLevel,
        medical_ad_risk_reason: Array.isArray(r.medicalAdRiskReasons) ? r.medicalAdRiskReasons.join(" / ") : "",
        safe_text: r.riskyPhrases?.length ? "수정 필요" : "✓",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);

      // 컬럼 너비
      ws["!cols"] = [
        { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 28 },
        { wch: 60 }, { wch: 50 }, { wch: 40 }, { wch: 40 },
        { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 40 }, { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "ALT_캡션");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="03_ALT_캡션_복사용.xlsx"`,
        },
      });
    }

    if (type === "metadata_csv") {
      const header = toCsvRow([
        "original_file_name","seo_file_name","iptc_title","iptc_description",
        "iptc_keywords","creator","credit","copyright","source","metadata_written"
      ]);
      const rows = results.map((r) => toCsvRow([
        r.originalFileName,
        r.seoFileName,
        r.iptcMetadata?.title || r.title,
        r.iptcMetadata?.description || r.description,
        Array.isArray(r.iptcMetadata?.keywords) ? r.iptcMetadata.keywords.join("; ") : "",
        r.iptcMetadata?.creator || "포토클리닉",
        r.iptcMetadata?.credit || "포토클리닉 대표 정연호",
        r.iptcMetadata?.copyright || `© ${new Date().getFullYear()} PHOTOCLINIC`,
        r.iptcMetadata?.source || "photoclinic.kr",
        "sidecar_xmp",
      ]));
      const csv = "﻿" + [header, ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="05_이미지SEO_메타데이터_리포트.csv"',
        },
      });
    }

    if (type === "medical_ad_csv") {
      const header = toCsvRow([
        "file_name","field","original_text","risk_level","risky_phrases","risk_reason","revised_safe_text"
      ]);
      const rows: string[] = [];
      for (const r of results) {
        if (r.medicalAdRiskLevel !== "safe") {
          const fields = [
            { field: "seo_file_name",  text: r.seoFileName },
            { field: "alt_text",       text: r.altText },
            { field: "caption",        text: r.caption },
            { field: "description",    text: r.description },
          ];
          for (const f of fields) {
            if (r.riskyPhrases?.some((p: string) => f.text?.includes(p))) {
              rows.push(toCsvRow([
                r.originalFileName, f.field, f.text,
                r.medicalAdRiskLevel,
                (r.riskyPhrases || []).join("; "),
                (r.medicalAdRiskReasons || []).join("; "),
                "의료진 역할/진료 과정 중심으로 수정 필요",
              ]));
            }
          }
        }
      }
      const csv = "﻿" + [header, ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="06_의료광고_리스크체크.csv"',
        },
      });
    }

    if (type === "upload_guide_txt") {
      const date = generatedAt ? new Date(generatedAt).toLocaleDateString("ko-KR") : new Date().toLocaleDateString("ko-KR");
      const guide = `[포토클리닉 AI 검색 최적화 납품 가이드]
생성일: ${date}
병원명: ${hospitalName}
진료과: ${department}${region ? `\n지역: ${region}` : ""}
총 ${results.length}장

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 홈페이지 업로드 시
   - 파일명은 변경하지 말고 그대로 업로드해주세요.
   - ALT 입력란에는 엑셀(03_ALT_캡션_복사용.xlsx)의 alt_text 값을 붙여넣어주세요.
   - 이미지 설명 또는 캡션란이 있다면 caption 값을 사용해주세요.
   - 홈페이지 업체에 엑셀 파일을 전달하면 자동 적용이 가능합니다.

2. 블로그 업로드 시
   - 제목·본문에 진료과와 장면 설명이 자연스럽게 포함되도록 작성해주세요.
   - 사진 아래에는 caption 값을 활용해주세요.
   - 이미지 파일명 그대로 업로드하면 검색 인덱싱에 유리합니다.

3. SNS (인스타그램·페이스북) 업로드 시
   - SNS는 이미지 메타데이터가 제거될 수 있으므로 caption 값을 본문에 함께 사용해주세요.
   - keywords 값을 해시태그로 활용하세요.

4. 주의사항 (의료광고법 준수)
   - 치료 효과를 보장하는 문구는 사용하지 마세요.
   - 환자 후기처럼 보이는 표현은 사용하지 마세요.
   - 전후 비교나 효과 단정 표현은 삼가주세요.
   - "최고", "유일", "1위", "완치", "보장" 등의 표현은 사용 금지입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[첨부 파일 안내]
03_ALT_캡션_복사용.xlsx     ← 홈페이지 업체에 전달
05_이미지SEO_메타데이터_리포트.csv ← 사진 메타데이터 기록
06_의료광고_리스크체크.csv   ← 위험 표현 점검 결과

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[사진별 SEO 파일명 및 ALT 요약]
${results.map((r, i) =>
  `${String(i + 1).padStart(2, "0")}. ${r.originalFileName}
    → ${r.seoFileName}
    ALT: ${r.altText}`
).join("\n\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
포토클리닉 | photoclinic.kr | 대표 정연호
이 파일은 Olivia Agent가 자동 생성했습니다.
`;
      return new NextResponse(guide, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="04_홈페이지_업로드_가이드.txt"',
        },
      });
    }

    if (type === "xmp_sidecar") {
      // XMP sidecar 파일을 ZIP 없이 단일 텍스트로 반환 (여러 파일을 구분자로 묶어 한 번에 다운로드)
      const xmpFiles = results.map((r) => {
        const keywords = (r.iptcMetadata?.keywords || r.keywords || []).map((k: string) => `    <rdf:li>${k}</rdf:li>`).join("\n");
        return `=== ${r.seoFileName}.xmp ===
<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${r.iptcMetadata?.title || r.title}</rdf:li></rdf:Alt></dc:title>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${r.iptcMetadata?.description || r.description}</rdf:li></rdf:Alt></dc:description>
      <dc:subject>
        <rdf:Bag>
${keywords}
        </rdf:Bag>
      </dc:subject>
      <dc:creator><rdf:Seq><rdf:li>${r.iptcMetadata?.creator || "포토클리닉"}</rdf:li></rdf:Seq></dc:creator>
      <photoshop:Credit>${r.iptcMetadata?.credit || "포토클리닉 대표 정연호"}</photoshop:Credit>
      <photoshop:Source>${r.iptcMetadata?.source || "photoclinic.kr"}</photoshop:Source>
      <xmpRights:WebStatement>${r.iptcMetadata?.copyright || `© ${new Date().getFullYear()} PHOTOCLINIC`}</xmpRights:WebStatement>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
      }).join("\n\n");

      return new NextResponse(xmpFiles, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="07_XMP_메타데이터_사이드카.txt"',
        },
      });
    }

    return NextResponse.json({ ok: false, error: "지원하지 않는 export type" }, { status: 400 });
  } catch (e) {
    console.error("[seo-delivery/export]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "내보내기 실패" },
      { status: 500 }
    );
  }
}
