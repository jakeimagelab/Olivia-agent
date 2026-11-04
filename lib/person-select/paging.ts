export const PERSON_SELECT_DB_PAGE_SIZE = 1_000;

type PageError = { message?: string } | null;
type PageResult<T> = { data: T[] | null; error: PageError };

/** Supabase의 응답 행 제한을 넘어도 모든 페이지를 끝까지 읽는다. */
export async function readAllPersonSelectRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PERSON_SELECT_DB_PAGE_SIZE,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("페이지 크기가 올바르지 않습니다.");
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message || "사진 목록을 불러오지 못했습니다.");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
