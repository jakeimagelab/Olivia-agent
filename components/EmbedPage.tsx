"use client";

interface EmbedPageProps {
  title: string;
  badge: string;
  src: string;
}

export default function EmbedPage({ title, badge, src }: EmbedPageProps) {
  return (
    <div className="analyzer-page">
      <header className="analyzer-header">
        <div className="brand-lockup">
          <img
            src="https://photoclinic-diangnoisis.vercel.app/logo.svg"
            alt="포토클리닉"
          />
          <span>{badge}</span>
        </div>
      </header>
      <iframe
        className="analyzer-frame"
        src={src}
        title={title}
        allow="clipboard-write; clipboard-read"
      />
    </div>
  );
}
