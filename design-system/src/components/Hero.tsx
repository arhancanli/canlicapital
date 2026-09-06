import * as React from "react";

export interface HeroProps {
  /** The chapter index shown in the eyebrow, e.g. "00 /". */
  eyebrowIndex: string;
  eyebrowLabel: React.ReactNode;
  /** Left side of the status row, e.g. "The research". */
  statusLabel: React.ReactNode;
  /** Right side of the status row, e.g. "Every test, including the kills". */
  statusValue: React.ReactNode;
  statusAriaLabel: string;
  /** The wordmark heading. Rendered as the section's h1. */
  heading: React.ReactNode;
  headingId: string;
  sub: React.ReactNode;
  scrollHref: string;
  scrollLabel?: React.ReactNode;
  scrollAriaLabel: string;
}

/**
 * css/styles.css's own hero family (`.hero`, `.hero__status`, `.hero__body`, `.hero__word`,
 * `.hero__sub`, `.hero__scroll`), the pattern shared by the /research, /systems, /progress,
 * /performance and /open hero sections. Page-specific decoration each page layers on top
 * (its own ghost word, proof line, parallax data attributes) is left out: those classes live
 * in that page's own stylesheet, which this package does not import.
 */
export function Hero({
  eyebrowIndex,
  eyebrowLabel,
  statusLabel,
  statusValue,
  statusAriaLabel,
  heading,
  headingId,
  sub,
  scrollHref,
  scrollLabel = "Scroll",
  scrollAriaLabel,
}: HeroProps): React.ReactElement {
  return (
    <section className="hero section" aria-labelledby={headingId}>
      <div className="hero__status mono-label" aria-label={statusAriaLabel} role="status">
        <span className="dot dot--pulse" aria-hidden="true"></span>
        <span>{statusLabel}</span>
        <span className="hero__status-sep" aria-hidden="true">
          &middot;
        </span>
        <span className="hero__status-val">{statusValue}</span>
      </div>
      <div className="hero__body">
        <p className="eyebrow label">
          <span className="idx mono-label">{eyebrowIndex}</span> {eyebrowLabel}
        </p>
        <h1 className="hero__word display-xl" id={headingId}>
          {heading}
        </h1>
        <p className="hero__sub body-l">{sub}</p>
      </div>
      <a href={scrollHref} className="hero__scroll mono-label" aria-label={scrollAriaLabel}>
        <span>{scrollLabel}</span>
        <span className="hero__scroll-line" aria-hidden="true"></span>
      </a>
    </section>
  );
}
