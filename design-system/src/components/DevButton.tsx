import * as React from "react";
import { cx } from "../cx";

export interface DevButtonProps {
  /** Renders an `<a>` when set, a `<button type="button">` otherwise (e.g. "Get a free key"). */
  href?: string;
  primary?: boolean;
  external?: boolean;
  id?: string;
  onClick?: React.MouseEventHandler;
  className?: string;
  children: React.ReactNode;
}

/** css/developers.css `.dev-button` / `.dev-button--primary`: the developers page's button style. */
export function DevButton({ href, primary = false, external = false, id, onClick, className, children }: DevButtonProps): React.ReactElement {
  const classes = cx("dev-button", primary && "dev-button--primary", className);
  if (href !== undefined) {
    return (
      <a className={classes} href={href} id={id} rel={external ? "noreferrer" : undefined} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={classes} id={id} onClick={onClick}>
      {children}
    </button>
  );
}
