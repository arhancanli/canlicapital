import * as React from "react";
import { cx } from "../cx";

export type DisplayHeadingSize = "xl" | "l" | "m";
export type DisplayHeadingTag = "h1" | "h2" | "h3" | "p";

export interface DisplayHeadingProps {
  /** Maps to css/styles.css `.display-xl` / `.display-l` / `.display-m`. */
  size?: DisplayHeadingSize;
  as?: DisplayHeadingTag;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/** The site's display type scale: css/styles.css `.display-xl` / `.display-l` / `.display-m`. */
export function DisplayHeading({
  size = "l",
  as = "h2",
  id,
  className,
  children,
}: DisplayHeadingProps): React.ReactElement {
  const props: Record<string, unknown> = { className: cx(`display-${size}`, className) };
  if (id !== undefined) props.id = id;
  return React.createElement(as, props, children);
}
