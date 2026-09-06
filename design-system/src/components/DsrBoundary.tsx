import * as React from "react";

export interface DsrBoundaryProps {
  /** The small caption span, e.g. "Illustrative calculation". */
  label: React.ReactNode;
  ariaLabel?: string;
  children: React.ReactNode;
}

/** css/dsr-tool.css `.dsr-boundary`: the claim-boundary callout on every calculator page. */
export function DsrBoundary({ label, ariaLabel = "Calculator claim boundary", children }: DsrBoundaryProps): React.ReactElement {
  return (
    <section className="dsr-boundary" aria-label={ariaLabel}>
      <span>{label}</span>
      <p>{children}</p>
    </section>
  );
}
