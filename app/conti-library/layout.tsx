import { C } from "@/lib/theme";

export default function ContiLibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      {children}
    </main>
  );
}
