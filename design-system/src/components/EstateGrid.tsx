import * as React from "react";

export interface EstateCellItem {
  /** e.g. "Daily bars, equity lake". */
  label: React.ReactNode;
  /** e.g. "24.7M+". */
  value: React.ReactNode;
  /** e.g. "1997 to 2026", rendered in `.estate__v-since` beside the value. */
  since?: React.ReactNode;
}

export interface EstateGridProps {
  cells: EstateCellItem[];
  ariaLabel?: string;
  /** The closing note under the grid, rendered after a `.comment` "//" marker. */
  line?: React.ReactNode;
}

/** css/progress.css `.estate` / `.estate__grid`: the data-lake fact grid, a `<dl>` of key figures. */
export function EstateGrid({
  cells,
  ariaLabel = "The data lake and live paper status",
  line,
}: EstateGridProps): React.ReactElement {
  return (
    <div className="estate" aria-label={ariaLabel}>
      <dl className="estate__grid">
        {cells.map((cell, index) => (
          <div key={index} className="estate__cell">
            <dt className="estate__k mono-label">{cell.label}</dt>
            <dd className="estate__v mono-data">
              {cell.since !== undefined ? (
                <>
                  <span>{cell.value}</span>
                  <span className="estate__v-since mono-label">{cell.since}</span>
                </>
              ) : (
                cell.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {line !== undefined ? (
        <p className="estate__line mono-label">
          <span className="comment">//</span> {line}
        </p>
      ) : null}
    </div>
  );
}
