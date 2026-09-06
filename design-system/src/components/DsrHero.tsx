import * as React from "react";

export interface DsrHeroProps {
  /** The three `.dsr-kicker` spans, e.g. ["Open research instrument", "ALPHAC", "Contract v1"]. */
  kicker: [React.ReactNode, React.ReactNode, React.ReactNode];
  heading: React.ReactNode;
  headingId: string;
  lead: React.ReactNode;
  /** Typically one or more DsrButton elements, matching `.dsr-hero__actions`'s real children. */
  actions?: React.ReactNode;
}

/** css/dsr-tool.css `.dsr-hero`: the shared hero layout at the top of every /tools calculator page. */
export function DsrHero({ kicker, heading, headingId, lead, actions }: DsrHeroProps): React.ReactElement {
  const [first, second, third] = kicker;
  return (
    <section className="dsr-hero" aria-labelledby={headingId}>
      <div className="dsr-hero__copy">
        <p className="dsr-kicker">
          <span>{first}</span>
          <span>{second}</span>
          <span>{third}</span>
        </p>
        <h1 id={headingId}>{heading}</h1>
        <p className="dsr-hero__lead">{lead}</p>
        {actions !== undefined ? <div className="dsr-hero__actions">{actions}</div> : null}
      </div>
    </section>
  );
}
