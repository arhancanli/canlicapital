# FilingFacts v1 errata

## 2026-10-23: restatement items built on a quarter

15 of the 361 restatement items ask for a figure "for the fiscal year ended" a date, but the
fact they cite covers a shorter period: an annual filing also tags its fourth quarter (and
sometimes other quarters) with the fiscal-period code "FY", and the generator did not check the
length of the period. The answer key is the first-reported value of that shorter period, so a
model that gives the fiscal year's figure is marked wrong. Found when a tool-using model answered
three of them with the year's figure and explained the difference.

The released files are unchanged, so the hashes recorded by earlier runs still hold. Score these
items out, or report results with and without them. The generator and checker now require a
period of 350 to 380 days (`restatements.mjs`, `isYear`), so a regenerated set would not contain
them.

| id | company | concept | period cited |
| --- | --- | --- | --- |
| `34188b5f1052a485` | ADAMS RESOURCES & ENERGY, INC. | Revenues | 2012-07-01 to 2012-09-30 (91 days) |
| `0a9dfb4bf9483f4f` | CONSTELLATION BRANDS, INC. | NetIncomeLoss | 2017-09-01 to 2017-11-30 (90 days) |
| `481747ccdd9ad6ab` | PARK AEROSPACE CORP. | Revenues | 2017-08-28 to 2017-11-26 (90 days) |
| `6fd5abc06d4d3b27` | NATURE’S SUNSHINE PRODUCTS, INC. | IncomeTaxExpenseBenefit | 2013-04-01 to 2013-06-30 (90 days) |
| `ba8c39477015e2c8` | STANDEX INTERNATIONAL CORPORATION | Revenues | 2019-01-01 to 2019-03-31 (89 days) |
| `328820094c0e11c8` | TELOS CORPORATION | NetIncomeLoss | 2011-07-01 to 2011-09-30 (91 days) |
| `1c208fb773987e6f` | VISTA GOLD CORP. | ShareBasedCompensation | 2002-01-01 to 2012-12-31 (4017 days) |
| `5e0aaa6dc22c5f8f` | ALLIANCEBERNSTEIN HOLDING L.P. | NetIncomeLoss | 2015-10-01 to 2015-12-31 (91 days) |
| `03472a07dff58c2a` | Surmodics, Inc. | NetIncomeLoss | 2013-01-01 to 2013-03-31 (89 days) |
| `d63566e6fc9e32e5` | THE CHILDREN’S PLACE, INC. | IncomeTaxExpenseBenefit | 2012-10-29 to 2013-02-02 (96 days) |
| `9fe21d109366b5ff` | AUDACY, INC. | NetIncomeLoss | 2016-07-01 to 2016-09-30 (91 days) |
| `2952dd55bcee0253` | Crexendo, Inc. | IncomeTaxExpenseBenefit | 2022-01-01 to 2022-03-31 (89 days) |
| `24398cf27b0c8ece` | FIRST ADVANTAGE CORP | IncomeTaxExpenseBenefit | 2020-01-01 to 2020-01-31 (30 days) |
| `852ece4f5db586d8` | MEDICINOVA, INC. | NetIncomeLoss | 2014-07-01 to 2014-09-30 (91 days) |
| `ba16b6d0935251ca` | DESIGNER BRANDS INC. | Revenues | 2018-08-05 to 2018-11-03 (90 days) |
