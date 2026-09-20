// Limited filing context, bound to the reviewed capture and selected observations.
export const FILING_NOTES = [
  {
    "cik": "0000066740",
    "source_sha256": "571391ded2a92e8cb1e7be5c22f3ac192f7fe9d4cada2dbdb985261297e6ecd4",
    "tags": [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax"
    ],
    "text": "In the 2025 annual report, consolidated net sales and the total-company and worldwide sales breakdowns report the same total. The two accounting tags identify those different presentations; adding them would count the same sales twice.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/66740/000006674026000014/mmm-20251231.htm",
    "observations": [
      {
        "tag": "Revenues",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 24948000000,
        "accn": "0000066740-26-000014"
      },
      {
        "tag": "RevenueFromContractWithCustomerExcludingAssessedTax",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 24948000000,
        "accn": "0000066740-26-000014"
      }
    ]
  },
  {
    "cik": "0000816956",
    "source_sha256": "361fc9bffac9e0f480696341efa84d520fc870dcf75b9c7eb7d649bfecb4b70b",
    "tags": [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax"
    ],
    "text": "In the 2025 annual report, consolidated net sales match total sales from contracts with customers in the revenue breakdowns. Those breakdowns distinguish surgical businesses, timing of recognition and geographic markets; their total is not additional revenue.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/816956/000081695626000009/cnmd-20251231.htm",
    "observations": [
      {
        "tag": "Revenues",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 1374724000,
        "accn": "0000816956-26-000009"
      },
      {
        "tag": "RevenueFromContractWithCustomerExcludingAssessedTax",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 1374724000,
        "accn": "0000816956-26-000009"
      }
    ]
  },
  {
    "cik": "0001127475",
    "source_sha256": "1d83049f899cbff9a062f8d19500599a1f079e18e925526b11f1306ca7a36021",
    "tags": [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax"
    ],
    "text": "In the annual report for the year ended August 31, 2025, the statement of operations and the United States/Great Britain revenue breakdown report the same total. The geographic breakdown is a presentation of that revenue, not another revenue stream.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1127475/000118518525001887/dbmm10k083125.htm",
    "observations": [
      {
        "tag": "Revenues",
        "start": "2024-09-01",
        "end": "2025-08-31",
        "unit": "USD",
        "val": 137998,
        "accn": "0001185185-25-001887"
      },
      {
        "tag": "RevenueFromContractWithCustomerExcludingAssessedTax",
        "start": "2024-09-01",
        "end": "2025-08-31",
        "unit": "USD",
        "val": 137998,
        "accn": "0001185185-25-001887"
      }
    ]
  },
  {
    "cik": "0001285785",
    "source_sha256": "81961120680bcecc68f72fdf37219002dfb1e69b1fab6f3063ef9ee375feee90",
    "tags": [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax"
    ],
    "text": "In the 2025 annual report, consolidated net sales match the total in the segment sales reconciliation. That reconciliation includes intersegment sales and eliminations; the individual segment amounts should not be added without those adjustments.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1285785/000128578526000017/mos-20251231.htm",
    "observations": [
      {
        "tag": "Revenues",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 12052400000,
        "accn": "0001285785-26-000017"
      },
      {
        "tag": "RevenueFromContractWithCustomerExcludingAssessedTax",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 12052400000,
        "accn": "0001285785-26-000017"
      }
    ]
  },
  {
    "cik": "0001551152",
    "source_sha256": "1fa00a2de3a0434fb2ebba8b1678cc379b16dc435a4f3e5c696efb7f9029698a",
    "tags": [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax"
    ],
    "text": "In the 2025 annual report, consolidated net revenues match the total in the geographic revenue breakdown. The geographic total describes the same reported revenue, not revenue to add to the consolidated amount.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1551152/000155115226000008/abbv-20251231.htm",
    "observations": [
      {
        "tag": "Revenues",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 61160000000,
        "accn": "0001551152-26-000008"
      },
      {
        "tag": "RevenueFromContractWithCustomerExcludingAssessedTax",
        "start": "2025-01-01",
        "end": "2025-12-31",
        "unit": "USD",
        "val": 61160000000,
        "accn": "0001551152-26-000008"
      }
    ]
  }
];

export function companyFilingNotes(company, tag) {
  return FILING_NOTES.filter(note => note.cik === company.cik && note.source_sha256 === company.source_sha256 && note.tags.includes(tag) &&
    note.observations.every(expected => company.concepts.some(concept => concept.tag === expected.tag && concept.observations.some(row =>
      ["start", "end", "unit", "val", "accn"].every(key => row[key] === expected[key])))));
}
