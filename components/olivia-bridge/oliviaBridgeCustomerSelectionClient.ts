import type { OliviaBridgeQualityResponse } from "@/components/olivia-bridge/useOliviaBridgeQualityAnalysis";
import type {
  GalleryCustomerSelectionResult,
  PersonSelectEventSummary,
  SelectGallerySummary,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import {
  matchCustomerSelectionToBridgeFiles,
  type CustomerSelectionMatchItem,
} from "@/lib/select-gallery/customerBridge";

export type OliviaBridgeSelectionFile = {
  id: string;
  name: string;
  relativeDirectory: string;
};

export async function loadOliviaBridgeSelectionSources() {
  const [galleryResponse, projectResponse] = await Promise.all([
    fetch("/api/select-galleries", { cache: "no-store" }),
    fetch("/api/person-select", { cache: "no-store" }),
  ]);
  const galleryBody = await galleryResponse.json().catch(() => ({})) as {
    ok?: boolean;
    galleries?: SelectGallerySummary[];
    error?: string;
  };
  const projectBody = await projectResponse.json().catch(() => ({})) as {
    ok?: boolean;
    events?: PersonSelectEventSummary[];
    error?: string;
  };
  if (!galleryResponse.ok || !galleryBody.ok) {
    throw new Error(galleryBody.error || "사진선택 갤러리를 불러오지 못했습니다.");
  }
  if (!projectResponse.ok || !projectBody.ok) {
    throw new Error(projectBody.error || "공유 프로젝트를 불러오지 못했습니다.");
  }
  return {
    galleries: Array.isArray(galleryBody.galleries) ? galleryBody.galleries : [],
    sharedProjects: (Array.isArray(projectBody.events) ? projectBody.events : [])
      .filter((event) => event.access_mode === "project_shared"),
  };
}

export async function loadOliviaBridgeGallerySelection({
  gallery,
  bridgeFiles,
  bridgeLink,
}: {
  gallery: SelectGallerySummary;
  bridgeFiles: OliviaBridgeSelectionFile[];
  bridgeLink: Record<string, unknown>;
}) {
  const detailResponse = await fetch(`/api/select-galleries/${gallery.id}`, {
    cache: "no-store",
  });
  const detail = await detailResponse.json().catch(() => ({})) as {
    ok?: boolean;
    gallery?: SelectGallerySummary;
    images?: Array<{
      id: string;
      original_file_name: string;
      relative_path?: string | null;
    }>;
    selection?: {
      items?: Array<{
        image_id: string;
        file_name: string;
        customer_rating?: number | null;
        memo?: string | null;
      }>;
    } | null;
    error?: string;
  };
  if (!detailResponse.ok || !detail.ok || !detail.gallery) {
    throw new Error(detail.error || "갤러리 제출 결과를 불러오지 못했습니다.");
  }
  const submittedItems = detail.selection?.items ?? [];
  if (!submittedItems.length) throw new Error("이 갤러리에 제출된 고객 셀렉이 없습니다.");

  const relativePathById = new Map(
    (detail.images ?? []).map((image) => [image.id, image.relative_path ?? null]),
  );
  const matchItems: CustomerSelectionMatchItem[] = submittedItems.map((item) => ({
    imageId: item.image_id,
    fileName: item.file_name,
    relativePath: relativePathById.get(item.image_id),
    rating: item.customer_rating,
    memo: item.memo,
  }));
  const match = matchCustomerSelectionToBridgeFiles(matchItems, bridgeFiles);
  const linkResponse = await fetch(`/api/select-galleries/${gallery.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bridgeLink),
  });
  const linked = await linkResponse.json().catch(() => ({})) as {
    ok?: boolean;
    error?: string;
  };
  if (!linkResponse.ok || !linked.ok) {
    throw new Error(linked.error || "갤러리와 현재 폴더를 연결하지 못했습니다.");
  }
  return {
    gallery: detail.gallery,
    submittedCount: submittedItems.length,
    match,
  };
}

export async function loadOliviaBridgeSharedProjectSelection({
  project,
  bridgeFiles,
}: {
  project: PersonSelectEventSummary;
  bridgeFiles: OliviaBridgeSelectionFile[];
}): Promise<{
  result: GalleryCustomerSelectionResult;
  quality: OliviaBridgeQualityResponse;
  qualityResponseOk: boolean;
}> {
  const response = await fetch(`/api/person-select/${project.id}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as {
    ok?: boolean;
    event?: { id: string; title: string; status: string };
    shared?: {
      images?: Array<{
        id: string;
        original_file_name: string;
        relative_path?: string | null;
      }>;
      selection?: {
        submitted_at?: string | null;
        items?: Array<{
          image_id: string;
          customer_rating?: number | null;
          memo?: string | null;
          image?: {
            original_file_name: string;
            source_rel_path?: string | null;
          } | null;
        }>;
      } | null;
    };
    error?: string;
  };
  if (!response.ok || !body.ok || !body.event) {
    throw new Error(body.error || "공유 프로젝트 셀렉을 불러오지 못했습니다.");
  }
  const selection = body.shared?.selection;
  const submittedItems = selection?.items ?? [];
  if (!selection?.submitted_at || !submittedItems.length) {
    throw new Error("이 공유 프로젝트에 제출된 고객 셀렉이 없습니다.");
  }

  const matchItems: CustomerSelectionMatchItem[] = submittedItems.flatMap((item) => (
    item.image ? [{
      imageId: item.image_id,
      fileName: item.image.original_file_name,
      relativePath: item.image.source_rel_path ?? null,
      rating: item.customer_rating,
      memo: item.memo,
    }] : []
  ));
  const match = matchCustomerSelectionToBridgeFiles(matchItems, bridgeFiles);
  const imageMatch = matchCustomerSelectionToBridgeFiles(
    (body.shared?.images ?? []).map((image) => ({
      imageId: image.id,
      fileName: image.original_file_name,
      relativePath: image.relative_path ?? null,
    })),
    bridgeFiles,
  );
  const qualityResponse = await fetch(`/api/person-select/${project.id}/quality`, {
    cache: "no-store",
  });
  const quality = await qualityResponse.json().catch(() => ({})) as OliviaBridgeQualityResponse;

  return {
    result: {
      gallery: {
        id: body.event.id,
        title: body.event.title,
        status: body.event.status,
        selected_count: submittedItems.length,
        submitted_at: selection.submitted_at,
      },
      total: submittedItems.length,
      match,
      imageMatch,
      personSelectEventId: project.id,
    },
    quality,
    qualityResponseOk: qualityResponse.ok,
  };
}
