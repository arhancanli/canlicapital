import * as React from "react";

export interface DsrSectionHeadProps {
  /** The small `.dsr-label` kicker above the heading, e.g. "Selection pressure chamber". */
  label: React.ReactNode;
  heading: React.ReactNode;
  headingId: string;
  /** Optional lead sentence, reusing `.dsr-hero__lead` as the real page does. */
  lead?: React.ReactNode;
}

/** css/dsr-tool.css `.dsr-section-head`: the label/heading/lead group opening each tool section. */
export function DsrSectionHead({ label, heading, headingId, lead }: DsrSectionHeadProps): React.ReactElement {
  return (
    <header className="dsr-section-head">
      <div>
        <p className="dsr-label">{label}</p>
        <h2 id={headingId}>{heading}</h2>
        {lead !== undefined ? <p className="dsr-hero__lead">{lead}</p> : null}
      </div>
    </header>
  );
}
