import * as React from "react";
import { cx } from "../cx";

export interface SectionProps {
  /** css/styles.css .section--ink: full-bleed dark band, children re-centered to --max. */
  ink?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  children?: React.ReactNode;
}

/** The site's chapter wrapper: css/styles.css `.section` (+ `.section--ink`). */
export function Section({ ink = false, className, children, ...rest }: SectionProps): React.ReactElement {
  return (
    <section className={cx("section", ink && "section--ink", className)} {...rest}>
      {children}
    </section>
  );
}
