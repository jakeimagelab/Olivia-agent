// Supabase Storage는 오브젝트 키에 비-ASCII 문자(한글 등)가 들어가면
// "Invalid key" 에러로 업로드 자체를 거부한다. 화면에 보여줄 원래 파일명은
// DB 컬럼(file_name 등)에 그대로 저장하고, 실제 스토리지 경로 세그먼트에는
// 이 함수로 만든 ASCII-safe 값만 사용한다.
export function toAsciiStorageSegment(value: string, fallback: string) {
  const ascii = value
    .normalize("NFC")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");
  return ascii || fallback;
}
