import type { SupabaseClient } from "@supabase/supabase-js";

import {
  photoDepartmentEvidence,
  photoFolderClientName,
  resolvePhotoDepartmentEvidence,
  type PhotoDepartmentResolution,
} from "./departmentResolver";

type ClientDepartmentRow = {
  specialty?: string | null;
  department?: string | null;
};

/** NAS 폴더명과 정확히 일치하는 등록 고객만 사용해 분류 진료과를 판정한다. */
export async function resolveNasPhotoDepartment(
  db: SupabaseClient,
  folderName: string,
): Promise<PhotoDepartmentResolution> {
  const folderEvidence = photoDepartmentEvidence(folderName, "folder_name");
  const clientName = photoFolderClientName(folderName);
  if (!clientName) return resolvePhotoDepartmentEvidence([folderEvidence]);

  try {
    const { data, error } = await db
      .from("clients")
      .select("specialty,department")
      .eq("hospital_name", clientName)
      .limit(2);
    if (error) return resolvePhotoDepartmentEvidence([folderEvidence]);
    const rows = (data ?? []) as ClientDepartmentRow[];
    const clientEvidence = rows.length === 1
      ? photoDepartmentEvidence(rows[0].specialty || rows[0].department, "matched_client")
      : null;
    return resolvePhotoDepartmentEvidence([folderEvidence, clientEvidence]);
  } catch {
    return resolvePhotoDepartmentEvidence([folderEvidence]);
  }
}
