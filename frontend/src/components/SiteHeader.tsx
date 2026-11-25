interface SiteHeaderProps {
  context?: string;
  detail?: string;
  onHome?: () => void;
}

export function SiteHeader({ context, detail, onHome }: SiteHeaderProps) {
  const brand = <span className="brand-label">Pareto Generator</span>;

  return (
    <header className="site-header">
      {onHome ? (
        <button type="button" className="brand brand--button" onClick={onHome} title="Back to home">
          {brand}
        </button>
      ) : (
        <div className="brand">{brand}</div>
      )}
      {(context || detail) && (
        <div className="header-formula">
          {context && <span>{context}</span>}
          {detail && <code>{detail}</code>}
        </div>
      )}
    </header>
  );
}
