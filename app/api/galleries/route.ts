import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GalleryItemInput = {
  title?: string;
  thumbnailUrl?: string;
  nasFileUrl?: string;
};

const imageUrlPattern = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
const skipUrlPattern = /\.(css|js|json|svg|ico|pdf|zip|mp4|mov|avi|heic|heif)(\?.*)?$/i;
const previewPriorityPattern = /(대표|프로필|profile|main|thumb|thumbnail|preview|원장|doctor|image|photo|jpg|jpeg|png|webp)/i;

const toAbsoluteUrl = (value: string, baseUrl: string) => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const isUsableUrl = (value: string) =>
  Boolean(value) &&
  !value.startsWith("data:") &&
  !value.startsWith("blob:") &&
  !value.startsWith("mailto:") &&
  !value.startsWith("tel:") &&
  !value.startsWith("javascript:");

const extractAttributeUrls = (html: string, baseUrl: string, attr: "href" | "src" | "content") => {
  const urls: string[] = [];
  const pattern = new RegExp(`${attr}=["']([^"']+)["']`, "gi");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    if (!isUsableUrl(match[1])) continue;
    const url = toAbsoluteUrl(match[1], baseUrl);
    if (url) urls.push(url);
  }

  return urls;
};

const sortPreviewUrls = (urls: string[]) =>
  unique(urls).sort((a, b) => Number(previewPriorityPattern.test(b)) - Number(previewPriorityPattern.test(a)));

const findImageUrls = (html: string, baseUrl: string) => {
  const metaImages = extractAttributeUrls(html, baseUrl, "content").filter((url) => imageUrlPattern.test(url));
  const visibleImages = extractAttributeUrls(html, baseUrl, "src").filter((url) => imageUrlPattern.test(url));
  const linkedImages = extractAttributeUrls(html, baseUrl, "href").filter((url) => imageUrlPattern.test(url));
  return sortPreviewUrls([...metaImages, ...visibleImages, ...linkedImages]);
};

const findFolderOrFileUrls = (html: string, baseUrl: string) => {
  const baseHost = new URL(baseUrl).host;
  const urls = extractAttributeUrls(html, baseUrl, "href")
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.host === baseHost && !imageUrlPattern.test(url) && !skipUrlPattern.test(url);
      } catch {
        return false;
      }
    });

  return sortPreviewUrls(urls).slice(0, 10);
};

const fetchPreviewPage = async (url: string) => {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 PhotoClinic Gallery Preview"
    }
  });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.startsWith("image/")) {
    return { imageUrl: res.url || url, html: "", finalUrl: res.url || url };
  }

  if (!contentType.includes("text/html")) {
    return { imageUrl: "", html: "", finalUrl: res.url || url };
  }

  return { imageUrl: "", html: await res.text(), finalUrl: res.url || url };
};

const extractThumbnailFromNasLink = async (nasLink: string) => {
  if (imageUrlPattern.test(nasLink)) return nasLink;

  try {
    const queue = [{ url: nasLink, depth: 0 }];
    const visited = new Set<string>();
    const maxDepth = 2;
    const maxPages = 14;

    while (queue.length && visited.size < maxPages) {
      const current = queue.shift();
      if (!current || visited.has(current.url)) continue;
      visited.add(current.url);

      const page = await fetchPreviewPage(current.url);
      if (page.imageUrl) return page.imageUrl;
      if (!page.html) continue;

      const images = findImageUrls(page.html, page.finalUrl);
      if (images[0]) return images[0];

      if (current.depth >= maxDepth) continue;
      const nextUrls = findFolderOrFileUrls(page.html, page.finalUrl);
      for (const url of nextUrls) {
        if (!visited.has(url)) queue.push({ url, depth: current.depth + 1 });
      }
    }
  } catch {
    // NAS 공유 페이지가 권한이나 차단 정책으로 막히면 대표 이미지는 비워둡니다.
  }

  return "";
};

const mockGalleries = [
  {
    id: "mock-gallery-1",
    hospital_name: "온유성형외과",
    contact_name: "김실장님",
    contact_email: "client@example.com",
    shoot_date: "2026-06-12",
    nas_link: "https://nas.photoclinic.kr/share/onyou-20260612",
    description: "대표원장 프로필, 상담실, 로비 공간 촬영",
    created_at: new Date().toISOString(),
    items: [
      {
        id: "mock-item-1",
        title: "대표원장 프로필",
        thumbnail_url: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=600&q=80&auto=format&fit=crop",
        nas_file_url: "https://nas.photoclinic.kr/share/onyou-20260612/profile-01"
      },
      {
        id: "mock-item-2",
        title: "상담실 공간",
        thumbnail_url: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=600&q=80&auto=format&fit=crop",
        nas_file_url: "https://nas.photoclinic.kr/share/onyou-20260612/space-01"
      }
    ]
  }
];

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("photo_galleries")
      .select("*, items:photo_gallery_items(*)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ ok: true, galleries: data || [] });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      mock: true,
      galleries: mockGalleries,
      note: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    id,
    hospitalName,
    contactName,
    contactEmail,
    shootDate,
    nasLink,
    description,
    thumbnailUrl,
    items = []
  } = body as {
    id?: string;
    hospitalName?: string;
    contactName?: string;
    contactEmail?: string;
    shootDate?: string;
    nasLink?: string;
    description?: string;
    thumbnailUrl?: string;
    items?: GalleryItemInput[];
  };

  if (!hospitalName || !nasLink) {
    return NextResponse.json({ ok: false, error: "병원명과 NAS 링크는 필수입니다." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (id) {
      const { data: gallery, error: galleryError } = await supabase
        .from("photo_galleries")
        .update({
          hospital_name: hospitalName,
          contact_name: contactName || "",
          contact_email: contactEmail || "",
          shoot_date: shootDate || null,
          nas_link: nasLink,
          description: description || ""
        })
        .eq("id", id)
        .select()
        .single();

      if (galleryError) throw galleryError;

      if (thumbnailUrl) {
        const { error: deleteError } = await supabase
          .from("photo_gallery_items")
          .delete()
          .eq("gallery_id", id);
        if (deleteError) throw deleteError;

        const { error: itemError } = await supabase.from("photo_gallery_items").insert({
          gallery_id: id,
          title: "대표 이미지",
          thumbnail_url: thumbnailUrl,
          nas_file_url: nasLink,
          sort_order: 0
        });
        if (itemError) throw itemError;
      }

      return NextResponse.json({ ok: true, gallery });
    }

    const { data: gallery, error: galleryError } = await supabase
      .from("photo_galleries")
      .insert({
        hospital_name: hospitalName,
        contact_name: contactName || "",
        contact_email: contactEmail || "",
        shoot_date: shootDate || null,
        nas_link: nasLink,
        description: description || ""
      })
      .select()
      .single();

    if (galleryError) throw galleryError;

    const autoThumbnailUrl = thumbnailUrl || await extractThumbnailFromNasLink(nasLink);

    const cleanItems = autoThumbnailUrl
      ? [
          {
            gallery_id: gallery.id,
            title: "대표 이미지",
            thumbnail_url: autoThumbnailUrl,
            nas_file_url: nasLink,
            sort_order: 0
          }
        ]
      : items.filter((item) => item.thumbnailUrl || item.nasFileUrl || item.title).map((item, index) => ({
        gallery_id: gallery.id,
        title: item.title || `썸네일 ${index + 1}`,
        thumbnail_url: item.thumbnailUrl || "",
        nas_file_url: item.nasFileUrl || nasLink,
        sort_order: index
      }));

    if (cleanItems.length) {
      const { error: itemsError } = await supabase.from("photo_gallery_items").insert(cleanItems);
      if (itemsError) throw itemsError;
    }

    return NextResponse.json({ ok: true, gallery });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const {
    id,
    hospitalName,
    contactName,
    contactEmail,
    shootDate,
    nasLink,
    description,
    thumbnailUrl
  } = body as {
    id?: string;
    hospitalName?: string;
    contactName?: string;
    contactEmail?: string;
    shootDate?: string;
    nasLink?: string;
    description?: string;
    thumbnailUrl?: string;
  };

  if (!id) {
    return NextResponse.json({ ok: false, error: "수정할 갤러리 ID가 없습니다." }, { status: 400 });
  }

  if (!hospitalName || !nasLink) {
    return NextResponse.json({ ok: false, error: "병원명과 NAS 링크는 필수입니다." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: gallery, error: galleryError } = await supabase
      .from("photo_galleries")
      .update({
        hospital_name: hospitalName,
        contact_name: contactName || "",
        contact_email: contactEmail || "",
        shoot_date: shootDate || null,
        nas_link: nasLink,
        description: description || ""
      })
      .eq("id", id)
      .select()
      .single();

    if (galleryError) throw galleryError;

    if (thumbnailUrl) {
      const { error: deleteError } = await supabase
        .from("photo_gallery_items")
        .delete()
        .eq("gallery_id", id);
      if (deleteError) throw deleteError;

      const { error: itemError } = await supabase.from("photo_gallery_items").insert({
        gallery_id: id,
        title: "대표 이미지",
        thumbnail_url: thumbnailUrl,
        nas_file_url: nasLink,
        sort_order: 0
      });
      if (itemError) throw itemError;
    }

    return NextResponse.json({ ok: true, gallery });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
