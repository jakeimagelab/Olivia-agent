"use client";

function embeddedHref(href: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}oliviaEmbedded=1`;
}

export default function TabletRouteFrame({ href, title }: { href: string; title: string }) {
  return (
    <iframe
      src={embeddedHref(href)}
      title={title}
      style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#fff" }}
      allow="clipboard-read; clipboard-write"
    />
  );
}
