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
            src="/assets/photoclinic-logo.png"
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
