import React from "react";

type AdminPageShellProps = {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
};

type AdminPageHeroProps = {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

type AdminPanelProps = {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
};

export function AdminPageShell({ children, className = "", wide = false }: AdminPageShellProps) {
  const widthClass = wide ? "pc-content pc-content--wide" : "pc-content";
  return (
    <main className={`pc-page ${className}`.trim()}>
      <div className={widthClass}>{children}</div>
    </main>
  );
}

export function AdminPageHero({ kicker, title, description, actions }: AdminPageHeroProps) {
  return (
    <section className="pc-hero pc-liquid-hero">
      <div>
        {kicker && <p className="pc-hero-kicker">{kicker}</p>}
        <h1 className="pc-hero-title">{title}</h1>
        {description && <p className="pc-hero-desc">{description}</p>}
      </div>
      {actions && <div className="pc-liquid-hero-actions">{actions}</div>}
    </section>
  );
}

export function AdminPanel({ children, className = "", padded = true }: AdminPanelProps) {
  const classes = ["pc-card", padded ? "pc-card--padded" : "", className].filter(Boolean).join(" ");
  return <section className={classes}>{children}</section>;
}
