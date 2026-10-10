// Form 4 (insider transactions) and 13F-HR information tables, read into rows.
import { all, child, children, num, parseXml, textAt } from "./xml.mjs";

// Form 4 transaction codes (SEC Form 4 General Instructions 8).
export const TRANSACTION_CODES = Object.freeze({
  P: "open-market or private purchase", S: "open-market or private sale", A: "grant or award", D: "disposition to the issuer",
  F: "tax withholding on vesting or exercise", I: "discretionary transaction", M: "option exercise or conversion (exempt)",
  C: "conversion of a derivative", E: "expiration of a short derivative", H: "expiration of a long derivative", O: "exercise of an out-of-the-money derivative",
  X: "exercise of an in- or at-the-money derivative", G: "gift", L: "small acquisition", W: "will or laws of descent", Z: "voting trust",
  J: "other (see footnotes)", K: "equity swap", U: "tender of shares in a change of control", V: "voluntarily reported early",
});

export function parseForm4(xml) {
  const doc = child(parseXml(xml), "ownershipDocument");
  if (!doc) throw new Error("not a Form 4 ownership document");
  const owners = children(doc, "reportingOwner").map((o) => {
    const rel = child(o, "reportingOwnerRelationship");
    const roles = [];
    if (/^(1|true)$/i.test(textAt(rel, "isDirector") ?? "")) roles.push("director");
    if (/^(1|true)$/i.test(textAt(rel, "isOfficer") ?? "")) roles.push(textAt(rel, "officerTitle") ?? "officer");
    if (/^(1|true)$/i.test(textAt(rel, "isTenPercentOwner") ?? "")) roles.push("10% owner");
    if (/^(1|true)$/i.test(textAt(rel, "isOther") ?? "")) roles.push(textAt(rel, "otherText") ?? "other");
    return { name: textAt(o, "reportingOwnerId", "rptOwnerName"), cik: textAt(o, "reportingOwnerId", "rptOwnerCik"), roles };
  });
  const footnotes = Object.fromEntries(all(doc, "footnote").map((f) => [f.attrs.id, f.text.replace(/\s+/g, " ").trim()]));
  const plan10b5 = /^(1|true)$/i.test(textAt(doc, "aff10b5One") ?? "") || Object.values(footnotes).some((t) => /10b5-1/i.test(t));
  const rows = [];
  const transactions = [
    ...children(child(doc, "nonDerivativeTable"), "nonDerivativeTransaction").map((t) => [t, "stock"]),
    ...children(child(doc, "derivativeTable"), "derivativeTransaction").map((t) => [t, "derivative"]),
  ];
  for (const [t, kind] of transactions) {
      const code = textAt(t, "transactionCoding", "transactionCode");
      const shares = num(textAt(t, "transactionAmounts", "transactionShares"));
      const price = num(textAt(t, "transactionAmounts", "transactionPricePerShare"));
      const ad = textAt(t, "transactionAmounts", "transactionAcquiredDisposedCode");
      const notes = all(t, "footnoteId").map((f) => footnotes[f.attrs.id]).filter(Boolean);
      rows.push({
        date: textAt(t, "transactionDate"), kind, security: textAt(t, "securityTitle"), code, meaning: TRANSACTION_CODES[code] ?? null,
        acquired_or_disposed: ad, shares, price, value: shares != null && price != null ? Math.round(shares * price * 100) / 100 : null,
        owned_after: num(textAt(t, "postTransactionAmounts", "sharesOwnedFollowingTransaction")),
        direct: textAt(t, "ownershipNature", "directOrIndirectOwnership") === "D",
        ...(kind === "derivative" ? { exercise_price: num(textAt(t, "conversionOrExercisePrice")), underlying_shares: num(textAt(t, "underlyingSecurity", "underlyingSecurityShares")) } : {}),
        ...(plan10b5 || notes.some((n) => /10b5-1/i.test(n)) ? { plan_10b5_1: true } : {}),
      });
  }
  return {
    issuer: { cik: textAt(doc, "issuer", "issuerCik"), name: textAt(doc, "issuer", "issuerName"), ticker: textAt(doc, "issuer", "issuerTradingSymbol") },
    period: textAt(doc, "periodOfReport"), form: textAt(doc, "documentType"), owners, rows, footnotes,
  };
}

// A 13F information table: one row per (issuer, class, CUSIP, put/call). Values are in dollars for
// filings from 2023 on (SEC changed the unit from thousands on 3 January 2023).
export function parse13F(xml) {
  const root = parseXml(xml);
  return all(root, "infoTable").map((r) => ({
    issuer: textAt(r, "nameOfIssuer"), class: textAt(r, "titleOfClass"), cusip: textAt(r, "cusip"), figi: textAt(r, "figi"),
    value: num(textAt(r, "value")), shares: num(textAt(r, "shrsOrPrnAmt", "sshPrnamt")), share_type: textAt(r, "shrsOrPrnAmt", "sshPrnamtType"),
    put_call: textAt(r, "putCall"), discretion: textAt(r, "investmentDiscretion"),
    voting: { sole: num(textAt(r, "votingAuthority", "Sole")), shared: num(textAt(r, "votingAuthority", "Shared")), none: num(textAt(r, "votingAuthority", "None")) },
  }));
}
