import * as React from "react";
import { cx } from "../cx";

export interface EyebrowProps {
  /** The chapter index, e.g. "01 /", rendered in css/styles.css's `.idx` accent. */
  index: string;
  className?: string;
  children: React.ReactNode;
}

/** css/styles.css's section eyebrow: `<p class="eyebrow label"><span class="idx mono-label">01 /</span> Name</p>`. */
export function Eyebrow({ index, className, children }: EyebrowProps): React.ReactElement {
  return (
    <p className={cx("eyebrow label", className)}>
      <span className="idx mono-label">{index}</span> {children}
    </p>
  );
}
