import * as React from "react";

export interface CorrectionItem {
  /** ISO date for the `<time datetime>` attribute, e.g. "2026-09-06". */
  dateTime: string;
  /** The visible date label, e.g. "CORRECTION 2026-09-06 (engine README)". */
  dateLabel: React.ReactNode;
  /**
   * Everything rendered after the date label, verbatim. On the live site this is the rest of
   * the paper-state.json entry, separator and all: its own source data supplies the dash
   * between the date and the explanation, so this component does not insert one and never
   * has to invent punctuation the source text does not already carry.
   */
  text: React.ReactNode;
}

export interface CorrectionsListProps {
  items: CorrectionItem[];
  ariaLabel?: string;
}

/** css/progress.css `.corrections-list` / `.corrections-item`: the append-only corrections ledger. */
export function CorrectionsList({
  items,
  ariaLabel = "Corrections, newest first",
}: CorrectionsListProps): React.ReactElement {
  return (
    <ol className="corrections-list" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <li key={index} className="corrections-item">
          <p className="corrections-item__text body-l">
            <time className="corrections-item__date mono-label" dateTime={item.dateTime}>
              {item.dateLabel}
            </time>
            {item.text}
          </p>
        </li>
      ))}
    </ol>
  );
}
