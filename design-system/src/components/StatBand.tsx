import * as React from "react";
import { cx } from "../cx";

export interface StatItem {
  value: React.ReactNode;
  label: React.ReactNode;
  /** css/styles.css `.stat--zero`: wraps the value in `.stat__strike` (the drawn-through 0). */
  zero?: boolean;
}

export interface StatBandProps {
  items: StatItem[];
  ariaLabel: string;
  /** css/styles.css `.statband__list--secondary`: the smaller footnote row. */
  secondary?: boolean;
  className?: string;
}

/** css/styles.css `.statband` / `.statband__list` / `.stat`: the verified-facts strip. */
export function StatBand({ items, ariaLabel, secondary = false, className }: StatBandProps): React.ReactElement {
  return (
    <div className={cx("statband", className)} aria-label={ariaLabel} role="group">
      <ul className={cx("statband__list", secondary && "statband__list--secondary")}>
        {items.map((item, index) => (
          <li key={index} className={cx("stat", item.zero && "stat--zero")}>
            <span className="stat__val mono-data">
              {item.zero ? <span className="stat__strike">{item.value}</span> : item.value}
            </span>
            <span className="stat__label mono-label">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
