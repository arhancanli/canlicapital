import * as React from "react";

export interface DevBoundaryProps {
  /** The bold lead word, e.g. "Status.". */
  label: React.ReactNode;
  children: React.ReactNode;
}

/** css/developers.css `.dev-boundary`: the developers page's limits/status paragraph pattern. */
export function DevBoundary({ label, children }: DevBoundaryProps): React.ReactElement {
  return (
    <p className="dev-boundary">
      <strong>{label}</strong> {children}
    </p>
  );
}
