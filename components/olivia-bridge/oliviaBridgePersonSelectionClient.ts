import type {
  PersonSelectEventSummary,
  PersonSelectImportResult,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import { matchPersonSelectFileNames } from "@/lib/photo-bridge/personSelectImport";

export async function loadOliviaBridgePersonSelectionEvents() {
  const response = await fetch("/api/person-select", { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as {
    ok?: boolean;
    events?: PersonSelectEventSummary[];
    error?: string;
  };
  if (!response.ok || !body.ok) {
    throw new Error(body.error || "개인별 사진 셀렉 행사를 불러오지 못했습니다.");
  }
  return Array.isArray(body.events) ? body.events : [];
}

export async function loadOliviaBridgePersonSelection({
  event,
  bridgeFileNames,
}: {
  event: PersonSelectEventSummary;
  bridgeFileNames: readonly string[];
}): Promise<PersonSelectImportResult> {
  const response = await fetch(`/api/person-select/${event.id}/exports/selected`, {
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as {
    ok?: boolean;
    eventTitle?: string;
    fileNames?: unknown;
    error?: string;
  };
  if (!response.ok || !body.ok) {
    throw new Error(body.error || "고객 선택을 불러오지 못했습니다.");
  }
  const fileNames = Array.isArray(body.fileNames)
    ? body.fileNames.filter((name): name is string => typeof name === "string")
    : [];
  const match = matchPersonSelectFileNames(fileNames, bridgeFileNames);
  return { ...match, eventTitle: body.eventTitle || event.title };
}
