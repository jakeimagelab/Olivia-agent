import { readAllPersonSelectRows } from "@/lib/person-select/paging";

export const PERSON_SELECT_ID_QUERY_CHUNK = 200;

/** PostgREST URL과 1,000행 응답 제한을 동시에 넘지 않도록 ID와 페이지를 나눠 읽는다. */
export async function fetchAllRowsByIdChunks<T>(
  ids: readonly string[],
  fetchPage: (ids: readonly string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  chunkSize = PERSON_SELECT_ID_QUERY_CHUNK,
): Promise<T[]> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("ID 조회 묶음 크기가 올바르지 않습니다.");
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    rows.push(...await readAllPersonSelectRows((from, to) => fetchPage(chunk, from, to)));
  }
  return rows;
}
