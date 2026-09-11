import type { SupabaseClient } from "@supabase/supabase-js";
import { fuzzyNameSearch } from "@/lib/olivia/nameSearch";
import { createVerification } from "@/lib/olivia/v2/toolExecutors/verification";
import type { OliviaToolVerification } from "@/lib/olivia/v2/types";
import { getSupabaseAdmin } from "@/lib/supabase";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

export type OliviaClientSearchItem = {
  id: string;
  name: string;
  specialty?: string;
};

export type OliviaClientSearchResult = {
  success: true;
  status: "FOUND" | "NOT_FOUND" | "AMBIGUOUS";
  clients: OliviaClientSearchItem[];
  verification: OliviaToolVerification;
};

type ClientRow = {
  id: string;
  hospital_name: string;
  specialty: string | null;
};

export async function searchOliviaClients(
  query: string,
  options: { db?: SupabaseClient; limit?: number } = {},
): Promise<OliviaClientSearchResult> {
  const keyword = String(query ?? "").trim();
  if (!keyword) throw new Error("검색할 고객명을 입력해주세요.");
  if (keyword.length > 120) throw new Error("검색어가 너무 깁니다.");

  let rows: ClientRow[];
  try {
    rows = await fuzzyNameSearch<ClientRow>({
      db: options.db ?? getSupabaseAdmin(),
      table: "clients",
      nameColumn: "hospital_name",
      select: "id,hospital_name,specialty",
      query: keyword,
      limit: Math.min(Math.max(options.limit ?? 10, 1), 20),
      throwOnError: true,
    });
  } catch {
    throw new OliviaToolError("고객 정보를 조회하지 못했습니다.", "DB_ERROR");
  }

  const clients = rows.map((row) => ({
    id: row.id,
    name: row.hospital_name,
    ...(row.specialty ? { specialty: row.specialty } : {}),
  }));

  return {
    success: true,
    status: clients.length === 0 ? "NOT_FOUND" : clients.length === 1 ? "FOUND" : "AMBIGUOUS",
    clients,
    verification: createVerification({
      executed: true,
      resourceExists: clients.length > 0,
      details: { query: keyword, matchCount: clients.length },
    }),
  };
}
