import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyMobileResourceShareToken } from "@/lib/olivia/mobile/resourceShares";
import { MobileContractDocument, MobileQuoteDocument } from "@/components/olivia-mobile/MobileResourceDocument";
import styles from "@/components/olivia-mobile/OliviaMobileShell.module.css";

export const dynamic = "force-dynamic";

export default async function MobileSharedResourcePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = verifyMobileResourceShareToken(token);
  if (!share) notFound();
  const table = share.resourceType === "quote" ? "quotes" : "contracts";
  const { data } = await getSupabaseAdmin().from(table).select("*").eq("id", share.resourceId).maybeSingle();
  if (!data) notFound();
  return (
    <main className={styles.publicPreview}>
      <header><span>OLIVIA</span><strong>7일 문서 미리보기</strong></header>
      <div className={styles.publicPreviewBody}>
        {share.resourceType === "quote" ? <MobileQuoteDocument quote={data} /> : <MobileContractDocument contract={data} />}
      </div>
    </main>
  );
}

