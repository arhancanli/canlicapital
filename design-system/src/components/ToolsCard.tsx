import * as React from "react";

export interface ToolsCardProps {
  /** e.g. "deflated-sharpe" for the /tools/deflated-sharpe route. */
  slug: string;
  title: React.ReactNode;
  /** The publishing house tag, e.g. "ALPHAC". Omitted when the tool has none. */
  house?: React.ReactNode;
  sentence: React.ReactNode;
}

/** css/tools-hub.css `.tools-card`: one entry in the /tools calculator grid. */
export function ToolsCard({ slug, title, house, sentence }: ToolsCardProps): React.ReactElement {
  return (
    <article className="tools-card">
      <h2>
        <a href={`/tools/${slug}`}>{title}</a>
      </h2>
      {house !== undefined ? <p className="tools-card__house">{house}</p> : null}
      <p>{sentence}</p>
    </article>
  );
}
