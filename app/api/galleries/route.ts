import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GalleryItemInput = {
  title?: string;
  thumbnailUrl?: string;
  nasFileUrl?: string;
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
    hospitalName,
    contactName,
    contactEmail,
    shootDate,
    nasLink,
    description,
    items = []
  } = body as {
    hospitalName?: string;
    contactName?: string;
    contactEmail?: string;
    shootDate?: string;
    nasLink?: string;
    description?: string;
    items?: GalleryItemInput[];
  };

  if (!hospitalName || !nasLink) {
    return NextResponse.json({ ok: false, error: "병원명과 NAS 링크는 필수입니다." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
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

    const cleanItems = items
      .filter((item) => item.thumbnailUrl || item.nasFileUrl || item.title)
      .map((item, index) => ({
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
