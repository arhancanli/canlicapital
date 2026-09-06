// canli-design-system: thin React wrappers around canlicapital.com's real markup and
// stylesheets. Every export below emits the site's exact existing classes; the visual system
// is design-system/dist/styles.css (which imports the site's own CSS by relative path), not a
// reimplementation of it. See design-system/README.md and .design-sync/NOTES.md.

export { ShellHeader, ShellFooter } from "./shell/ProductShell";
export type { ShellHeaderProps, ShellFooterProps } from "./shell/ProductShell";

export { Section } from "./components/Section";
export type { SectionProps } from "./components/Section";

export { Eyebrow } from "./components/Eyebrow";
export type { EyebrowProps } from "./components/Eyebrow";

export { DisplayHeading } from "./components/DisplayHeading";
export type { DisplayHeadingProps, DisplayHeadingSize, DisplayHeadingTag } from "./components/DisplayHeading";

export { BodyText } from "./components/BodyText";
export type { BodyTextProps, BodyTextSize } from "./components/BodyText";

export { MonoLabel } from "./components/MonoLabel";
export type { MonoLabelProps } from "./components/MonoLabel";

export { MonoData } from "./components/MonoData";
export type { MonoDataProps } from "./components/MonoData";

export { Hero } from "./components/Hero";
export type { HeroProps } from "./components/Hero";

export { StatBand } from "./components/StatBand";
export type { StatBandProps, StatItem } from "./components/StatBand";

export { CorrectionsList } from "./components/CorrectionsList";
export type { CorrectionsListProps, CorrectionItem } from "./components/CorrectionsList";

export { Ledger } from "./components/Ledger";
export type { LedgerProps, LedgerRowItem, LedgerRowState } from "./components/Ledger";

export { EstateGrid } from "./components/EstateGrid";
export type { EstateGridProps, EstateCellItem } from "./components/EstateGrid";

export { ToolsCard } from "./components/ToolsCard";
export type { ToolsCardProps } from "./components/ToolsCard";

export { DsrHero } from "./components/DsrHero";
export type { DsrHeroProps } from "./components/DsrHero";

export { DsrButton } from "./components/DsrButton";
export type { DsrButtonProps } from "./components/DsrButton";

export { DsrSectionHead } from "./components/DsrSectionHead";
export type { DsrSectionHeadProps } from "./components/DsrSectionHead";

export { DsrBoundary } from "./components/DsrBoundary";
export type { DsrBoundaryProps } from "./components/DsrBoundary";

export { DevButton } from "./components/DevButton";
export type { DevButtonProps } from "./components/DevButton";

export { DevBoundary } from "./components/DevBoundary";
export type { DevBoundaryProps } from "./components/DevBoundary";

export { DeveloperKeyBox } from "./components/DeveloperKeyBox";
export type { DeveloperKeyBoxProps } from "./components/DeveloperKeyBox";

export { ReceiptBadge } from "./components/ReceiptBadge";
export type { ReceiptBadgeProps } from "./components/ReceiptBadge";
