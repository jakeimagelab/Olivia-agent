import Link from "next/link";
import { ArrowLeft, ClipboardPenLine, Globe2 } from "lucide-react";

export default function WebsiteBuilderPage() {
  return (
    <main className="admin-shell">
      <section className="placeholder-page" aria-labelledby="website-builder-title">
        <div className="brand-lockup">
          <img
            src="https://photoclinic-diangnoisis.vercel.app/logo.svg"
            alt="포토클리닉"
          />
          <span>Website Builder</span>
        </div>

        <div className="placeholder-icon">
          <Globe2 size={34} />
        </div>

        <p className="admin-kicker">병원 • 메디컬 성장 플랫폼</p>
        <h1 id="website-builder-title">홈페이지 제작</h1>
        <p>
          병원 홈페이지 제작 요청, 페이지 구성, 촬영 이미지 활용 범위를 정리하는 기능을 연결할 준비 화면입니다.
        </p>

        <div className="placeholder-status">
          <ClipboardPenLine size={18} />
          <span>기획서 입력 및 제작 요청 기능 준비 중</span>
        </div>

        <Link className="admin-secondary-link" href="/">
          <ArrowLeft size={18} />
          관리자 홈으로
        </Link>
      </section>
    </main>
  );
}
