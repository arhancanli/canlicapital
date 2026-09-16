import * as React from "react";
import { cx } from "../cx";

export type BodyTextSize = "body" | "body-l";

export interface BodyTextProps {
  /** css/styles.css `.body` (62ch long-prose measure) or `.body-l` (46ch lead/sub measure). */
  size?: BodyTextSize;
  as?: "p" | "span" | "div";
  className?: string;
  children: React.ReactNode;
}

/** The site's canonical prose measures: css/styles.css `.body` / `.body-l`. */
export function BodyText({ size = "body", as = "p", className, children }: BodyTextProps): React.ReactElement {
  return React.createElement(as, { className: cx(size, className) }, children);
}
