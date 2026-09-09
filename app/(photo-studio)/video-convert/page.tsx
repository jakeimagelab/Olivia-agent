import { redirect } from "next/navigation";

// 2026-09-10 수정 지시서 2번 — 파일 변환 탭/도구를 사진작업실에서 삭제했다. 옛 링크가
// 죽은 mode=conversion으로 떨어지지 않도록 기본 탭(사진 셀렉)으로 보낸다.
export default function VideoConvertPage() {
  redirect("/photo-sorting");
}
