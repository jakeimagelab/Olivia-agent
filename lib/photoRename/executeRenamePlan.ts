import {
  transferFilesSafely,
  type FileOperationProgress,
  type MetadataFileTransfer,
} from "@/lib/metadataSelect/fileOperations";
import type { RenamePlan, RenameTransferMode } from "./renamePlan";

export async function executeRenamePlan(
  plan: RenamePlan,
  transferMode: RenameTransferMode,
  onProgress?: FileOperationProgress,
): Promise<{ changedCount: number }> {
  if (plan.blocked) throw new Error("중복 또는 오류가 있는 미리보기는 실행할 수 없습니다.");
  const rows = plan.rows.filter((row) => row.status === "READY");
  if (rows.length === 0) return { changedCount: 0 };

  const transfers: MetadataFileTransfer[] = rows.map((row) => ({
    name: row.targetName,
    sourceName: row.name,
    destinationName: row.targetName,
    sourceDirectory: row.parent,
    sourceHandle: row.handle,
    destinationDirectory: row.targetDirectory,
  }));
  await transferFilesSafely({
    transfers,
    // destinationDirectory를 지정한 transfer가 실제 목적지를 가진다. 이 fallback은 기존
    // 공용 전송 API의 계약을 유지하기 위한 값일 뿐이다.
    destination: rows[0].targetDirectory,
    deleteSources: transferMode !== "copy",
    onProgress,
  });
  return { changedCount: transfers.length };
}
