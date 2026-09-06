import * as React from "react";
import { cx } from "../cx";

export interface DsrButtonProps {
  href: string;
  primary?: boolean;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** css/dsr-tool.css `.dsr-button` / `.dsr-button--primary`: the DSR tool's own button style. */
export function DsrButton({ href, primary = false, external = false, className, children }: DsrButtonProps): React.ReactElement {
  return (
    <a
      className={cx("dsr-button", primary && "dsr-button--primary", className)}
      href={href}
      rel={external ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}
