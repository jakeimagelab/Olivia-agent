import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel/Edge 환경에서는 EXIF 직접 쓰기가 불가능하므로
// XMP sidecar 파일 경로 목록과 메타데이터를 반환합니다.
// 실제 메타데이터 삽입은 exiftool CLI(로컬) 또는 별도 서버에서 처리해야 합니다.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { images } = body as {
    images: {
      originalFileName: string;
      seoFileName: string;
      iptcMetadata: {
        title: string;
        description: string;
        keywords: string[];
        creator: string;
        credit: string;
        copyright: string;
        source: string;
      };
    }[];
  };

  if (!images?.length) {
    return NextResponse.json({ ok: false, error: "images 배열 필수" }, { status: 400 });
  }

  // XMP sidecar 내용 생성 (각 파일별 .xmp 내용)
  const sidecarFiles = images.map((img) => {
    const kw = (img.iptcMetadata.keywords || [])
      .map((k) => `      <rdf:li>${k}</rdf:li>`)
      .join("\n");

    const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
      xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${img.iptcMetadata.title}</rdf:li></rdf:Alt></dc:title>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${img.iptcMetadata.description}</rdf:li></rdf:Alt></dc:description>
      <dc:subject>
        <rdf:Bag>
${kw}
        </rdf:Bag>
      </dc:subject>
      <dc:creator><rdf:Seq><rdf:li>${img.iptcMetadata.creator}</rdf:li></rdf:Seq></dc:creator>
      <photoshop:Credit>${img.iptcMetadata.credit}</photoshop:Credit>
      <photoshop:Source>${img.iptcMetadata.source}</photoshop:Source>
      <xmpRights:WebStatement>${img.iptcMetadata.copyright}</xmpRights:WebStatement>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

    return {
      originalFileName: img.originalFileName,
      seoFileName: img.seoFileName,
      xmpFileName: img.seoFileName.replace(/\.[^.]+$/, ".xmp"),
      xmpContent: xmp,
      exiftoolCommand: `exiftool -Title="${img.iptcMetadata.title}" -Description="${img.iptcMetadata.description}" -Keywords="${img.iptcMetadata.keywords.join(",")}" -Creator="${img.iptcMetadata.creator}" -Credit="${img.iptcMetadata.credit}" -Copyright="${img.iptcMetadata.copyright}" -Source="${img.iptcMetadata.source}" "${img.seoFileName}"`,
    };
  });

  return NextResponse.json({
    ok: true,
    method: "xmp_sidecar",
    note: "Vercel 환경에서는 JPG에 직접 메타데이터를 쓸 수 없습니다. XMP sidecar 파일을 사진 파일과 같은 폴더에 넣어두거나, exiftool 명령어로 로컬에서 삽입하세요.",
    sidecarFiles,
    exiftoolBatch: sidecarFiles.map((f) => f.exiftoolCommand).join("\n"),
  });
}
