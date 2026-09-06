import * as React from "react";
import { cx } from "../cx";

export type LedgerRowState = "proven" | "pending";

export interface LedgerRowItem {
  state: LedgerRowState;
  /** e.g. "Proven", "Proven, modest", "Not yet". */
  mark: React.ReactNode;
  /** The row's headline sentence. */
  what: React.ReactNode;
  /** The smaller supporting sentence rendered inside `.small.body`, if any. */
  detail?: React.ReactNode;
}

export interface LedgerProps {
  rows: LedgerRowItem[];
  ariaLabel?: string;
}

/** css/progress.css `.ledger` / `.ledger__row`: the edge-status ledger (proven, pending). */
export function Ledger({ rows, ariaLabel = "Edge status ledger" }: LedgerProps): React.ReactElement {
  return (
    <div className="ledger" aria-label={ariaLabel}>
      {rows.map((row, index) => (
        <div key={index} className={cx("ledger__row", `ledger__row--${row.state}`)}>
          <span className="ledger__state">
            <span className="dot" aria-hidden="true"></span>
            <span className="ledger__mark">{row.mark}</span>
          </span>
          <span className="ledger__what body-l">
            {row.what}
            {row.detail !== undefined ? <span className="small body">{row.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
