export const EDITORIAL_POLICY = "extended-v2";
// Source-bound decisions from company-constant-filing-evidence.json.
// Never transfer a disposition to changed source bytes without another review.
export const EDITORIAL_EXCLUSIONS = Object.freeze([
  {
    "cik": "0000030625",
    "tag": "Revenues",
    "source_sha256": "f84434cf6b3e61f1ce7199d02e6afccc92527e1628553fd9f596c156ed118646",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/30625/000003062526000003/fls-20251231.htm",
    "reason": "The inspected filing uses the selected values under this tag for intersegment sales or revenue after eliminations, not company-wide revenue. The generic revenue history is omitted; original source data remain available."
  },
  {
    "cik": "0000811830",
    "tag": "Revenues",
    "source_sha256": "caa0cbe7722633cc01df7c48f42fc68280f53888bb41d6e29b2dadd318dd47c8",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/811830/000081183022000016/sov-20211231.htm",
    "reason": "The inspected filing uses the selected values under this tag for intersegment sales or revenue after eliminations, not company-wide revenue. The generic revenue history is omitted; original source data remain available."
  },
  {
    "cik": "0001030469",
    "tag": "Revenues",
    "source_sha256": "a673952e213f640801c3d042d5d05e7c11a74bade78ac157fec9be9ee69c7700",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1030469/000103046924000007/ofg-20231231.htm",
    "reason": "The inspected filing uses the selected values under this tag for intersegment sales or revenue after eliminations, not company-wide revenue. The generic revenue history is omitted; original source data remain available."
  }
].map(Object.freeze));
