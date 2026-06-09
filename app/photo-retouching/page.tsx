import Link from "next/link";
import { ArrowLeft, ExternalLink, SearchCheck, Wand2 } from "lucide-react";

export default function PhotoRetouchingPage() {
  return (
    <main className="admin-shell">
      <section className="placeholder-page" aria-labelledby="photo-retouching-title">
        <div className="brand-lockup">
          <img
            src="https://photoclinic-diangnoisis.vercel.app/logo.svg"
            alt="포토클리닉"
          />
          <span>Photo Retouching</span>
        </div>

        <div className="placeholder-icon">
          <Wand2 size={34} />
        </div>

        <p className="admin-kicker">병원 • 메디컬 성장 플랫폼</p>
        <h1 id="photo-retouching-title">사진 보정</h1>
        <p>
          Evoto 기반 보정 자동화 가능성을 검토하는 준비 화면입니다. 현재 공개 개발자 API 문서는 확인되지 않아, 우선 Evoto 앱 또는 공식 문의를 통한 연동 가능성 확인이 필요합니다.
        </p>

        <div className="placeholder-status">
          <SearchCheck size={18} />
          <span>Evoto API 연동 가능 여부 확인 필요</span>
        </div>

        <div className="placeholder-actions">
          <a
            className="admin-secondary-link"
            href="https://www.evoto.ai/"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={18} />
            Evoto 공식 사이트
          </a>
          <Link className="admin-secondary-link" href="/">
            <ArrowLeft size={18} />
            관리자 홈으로
          </Link>
        </div>
      </section>
    </main>
  );
}
