import * as React from "react";
import { cx } from "../cx";

export interface MonoDataProps {
  as?: "span" | "dd";
  className?: string;
  children: React.ReactNode;
}

/** css/styles.css `.mono-data`: the large tabular-numeral figure tier. */
export function MonoData({ as = "span", className, children }: MonoDataProps): React.ReactElement {
  return React.createElement(as, { className: cx("mono-data", className) }, children);
}
