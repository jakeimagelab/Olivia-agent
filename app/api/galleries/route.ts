import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { advanceWorkflow } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";
import { linkUnassignedPhotoGalleries } from "@/lib/clientGalleryLinking";
import { logPortalEvent } from "@/lib/clientPortal";

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
    hospital_name: "포토클리닉",
    contact_name: "정연호",
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

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q") || "";
  const clientId = params.get("client_id") || "";
  const workflowRunId = params.get("workflow_run_id") || "";
  try {
    const supabase = getSupabaseAdmin();
    const fetchGalleries = async () => {
      let query = supabase
        .from("photo_galleries")
        .select("*, items:photo_gallery_items(*)")
        .order("created_at", { ascending: false });
      if (clientId) query = query.eq("client_id", clientId);
      else if (q) query = query.ilike("hospital_name", `%${q}%`);
      return query;
    };

    let { data, error } = await fetchGalleries();
    if (!error && clientId && q && (data || []).length === 0) {
      try {
        const linked = await linkUnassignedPhotoGalleries(supabase, {
          clientId,
          hospitalName: q,
          workflowRunId: workflowRunId || null,
        });
        if (linked.linkedIds.length > 0) ({ data, error } = await fetchGalleries());
      } catch (linkError) {
        console.error("[galleries-api] 기존 촬영 갤러리 고객 연결 실패", linkError);
      }
    }

    if (error) throw error;
    const galleries = data || [];

    // 공개 상태 — pcrm_publications에 related_type=gallery/final_delivery로 기록된 실제 공개 이력을 붙인다.
    const galleryIds = galleries.map((g: any) => g.id).filter(Boolean);
    let publicationByGalleryId = new Map<string, any>();
    if (galleryIds.length) {
      const { data: publications } = await supabase
        .from("pcrm_publications")
        .select("related_id, related_type, status, created_at")
        .in("related_type", ["gallery", "final_delivery"])
        .in("related_id", galleryIds)
        .order("created_at", { ascending: false });
      for (const pub of publications || []) {
        if (!publicationByGalleryId.has(pub.related_id)) publicationByGalleryId.set(pub.related_id, pub);
      }
    }
    const enriched = galleries.map((g: any) => ({ ...g, publication: publicationByGalleryId.get(g.id) || null }));

    return NextResponse.json({ ok: true, galleries: enriched });
  } catch (error) {
    const filtered = q
      ? mockGalleries.filter(g => g.hospital_name.includes(q))
      : mockGalleries;
    return NextResponse.json({
      ok: true,
      mock: true,
      galleries: filtered,
      note: getErrorMessage(error)
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
    items = [],
    client_id,
    workflow_run_id,
    galleryType,
    gallery_type,
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
    client_id?: string | null;
    workflow_run_id?: string | null;
    galleryType?: string;
    gallery_type?: string;
  };
  const galleryTypeValue = galleryType || gallery_type || "retouched";

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
          description: description || "",
          gallery_type: galleryTypeValue,
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
        description: description || "",
        client_id: client_id || null,
        workflow_run_id: workflow_run_id || null,
        gallery_type: galleryTypeValue,
      })
      .select()
      .single();

    if (galleryError) throw galleryError;

    // clients.original_photos_link / retouched_photos_link 반영은 DB 트리거(trg_sync_gallery_to_client)가 처리한다.

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

    // ── 자동 후처리 (client_id가 있을 때만) ───────────────────
    // 코드 요청서 2차(2026-08-16) 1·3번 항목 — 메일 초안 자동 생성은 워크플로우 진행 조건에서
    // 완전히 제외됐다(메일링은 앞으로 독립 기능으로만 존재). 대신 gallery_type에 맞춰 실제
    // 워크플로우 단계를 자동 완료·전진시킨다: 원본(원본사진/원본영상) 등록 → client_selection
    // 완료, 완료본(완료사진/완료영상) 등록 → 지금 단계가 retouching이면 final_delivery로,
    // final_delivery면 revision으로. 두 단계를 한 번에 건너뛰지 않도록 현재 단계를 먼저 확인한 뒤
    // 그 단계만 완료 처리한다(completeOpenStepTasksForManualSave/maybeAdvanceWorkflow는 현재
    // 단계와 다르면 안전하게 아무 것도 안 한다 — 중복/오전진 걱정 없음).
    if (gallery && client_id && workflow_run_id) {
      const isOriginalType = galleryTypeValue === "original" || galleryTypeValue === "original_photo" || galleryTypeValue === "original_video";
      const isFinalType = galleryTypeValue === "retouched" || galleryTypeValue === "final_photo" || galleryTypeValue === "final_video";
      if (isOriginalType || isFinalType) {
        try {
          const run = await getWorkflowRun(supabase, workflow_run_id);
          let targetStep: string | null = null;
          if (isOriginalType && run.current_step_key === "client_selection") targetStep = "client_selection";
          else if (isFinalType && (run.current_step_key === "retouching" || run.current_step_key === "final_delivery")) targetStep = run.current_step_key;
          if (targetStep) {
            await completeOpenStepTasksForManualSave(supabase, workflow_run_id, targetStep);
            await maybeAdvanceWorkflow(supabase, workflow_run_id, targetStep);
          }
        } catch (err) {
          console.error("[galleries-api] 워크플로우 자동 완료 실패", err);
        }
      }
    }

    // 고객 포털에 "새 소식" 기록 (실제 발송 채널은 아직 미확정 — 로그인 시 포털에서 확인 가능)
    if (gallery && client_id) {
      await logPortalEvent({ clientId: client_id, eventType: "gallery_ready", targetType: "photo_galleries", targetId: gallery.id, workflowRunId: workflow_run_id || null }).catch(() => {});
    }

    return NextResponse.json({ ok: true, gallery });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
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
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
