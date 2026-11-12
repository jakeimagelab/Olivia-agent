import SharedProjectSelect from "@/components/person-select/SharedProjectSelect";
import { resolveSharedPersonSelectAccess, sharedPersonSelectEventResponse } from "@/lib/person-select/sharedPublic";
import { loadSharedProjectSelectBootstrap } from "@/lib/person-select/server/sharedProjectBootstrap";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken, { touch: true });
    const deliveryStage = event.customer_stage === "delivery";
    const bootstrap = deliveryStage ? null : await loadSharedProjectSelectBootstrap(db, event.id, reviewer);
    return <SharedProjectSelect
      shareToken={shareToken}
      event={sharedPersonSelectEventResponse(event)}
      reviewer={reviewer}
      images={bootstrap?.images ?? []}
      imageManifest={bootstrap?.manifest ?? null}
      initialImagePage={bootstrap?.page ?? null}
      draft={bootstrap?.draft ?? null}
      selection={bootstrap?.selection ?? null}
    />;
  } catch (error) {
    return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#E3EBE2", color: "#293E34" }}><section style={{ maxWidth: 440, padding: 24, border: "1px solid #C8D5C8", borderRadius: 12, background: "#F1F5EE", textAlign: "center" }}><h1 style={{ margin: "0 0 8px", fontSize: 21 }}>사진선택 링크를 열 수 없습니다.</h1><p style={{ margin: 0, color: "#617565" }}>{error instanceof Error ? error.message : "링크를 다시 확인해 주세요."}</p></section></main>;
  }
}
