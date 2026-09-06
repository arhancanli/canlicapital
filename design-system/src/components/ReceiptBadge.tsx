import * as React from "react";

export interface ReceiptBadgeProps {
  /** The receipt id returned by a validation endpoint (see /developers). */
  receiptId: string;
  baseUrl?: string;
  alt?: string;
}

/**
 * The receipt badge embed documented on /developers: `[![Canli receipt](.../badge.svg)](...)`.
 * No class is attached, because the live markdown embed carries none either. The badge image
 * itself (an SVG served by GET /api/v1/receipts/{id}/badge.svg) is generated server-side and
 * is not re-implemented here.
 */
export function ReceiptBadge({
  receiptId,
  baseUrl = "https://canlicapital.com",
  alt = "Canli receipt",
}: ReceiptBadgeProps): React.ReactElement {
  const receiptUrl = `${baseUrl}/api/v1/receipts/${receiptId}`;
  return (
    <a href={receiptUrl}>
      <img src={`${receiptUrl}/badge.svg`} alt={alt} />
    </a>
  );
}
