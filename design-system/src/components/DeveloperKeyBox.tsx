import * as React from "react";

export interface DeveloperKeyBoxProps {
  apiKey: string;
  note?: React.ReactNode;
  /** e.g. 4, rendered as "Keys remaining today: 4". */
  remaining: number;
  copyLabel?: string;
  onCopy?: (key: string) => void;
}

/**
 * css/developers.css `.dev-key-result`: the box the developers page fills in after
 * `POST /api/v1/keys` succeeds (see developers.html's own `showKeyResult`). This component
 * renders that same result state directly, for a caller who already has a key to show.
 */
export function DeveloperKeyBox({
  apiKey,
  note = "Store this key now. It cannot be shown again.",
  remaining,
  copyLabel = "Copy",
  onCopy,
}: DeveloperKeyBoxProps): React.ReactElement {
  return (
    <div className="dev-key-result" role="status" aria-live="polite">
      <p className="dev-key-value">
        <code>{apiKey}</code>
      </p>
      <button type="button" className="dev-button" onClick={() => onCopy?.(apiKey)}>
        {copyLabel}
      </button>
      <p className="dev-key-note">{note}</p>
      <p className="dev-key-remaining">Keys remaining today: {remaining}</p>
    </div>
  );
}
