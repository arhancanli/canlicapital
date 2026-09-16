import * as React from "react";
import { cx } from "../cx";

export interface MonoLabelProps {
  as?: "span" | "p" | "time";
  /** Only meaningful when `as="time"`, matching corrections-item__date's `datetime` attribute. */
  dateTime?: string;
  className?: string;
  children: React.ReactNode;
}

/** css/styles.css `.mono-label`: the small mono caveat/caption tier. */
export function MonoLabel({ as = "span", dateTime, className, children }: MonoLabelProps): React.ReactElement {
  const props: Record<string, unknown> = { className: cx("mono-label", className) };
  if (dateTime !== undefined) props.dateTime = dateTime;
  return React.createElement(as, props, children);
}
