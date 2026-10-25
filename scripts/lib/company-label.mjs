import { PRIMARY_TICKERS } from './company-primary-tickers.mjs';

// The short company name used in titles and link text: the SEC entity name without a trailing
// legal suffix and the comma before it. "LAKELAND INDUSTRIES, INC." -> "LAKELAND INDUSTRIES",
// "CRANE NXT, CO." -> "CRANE NXT", "Apple Inc." -> "Apple". The previous rule removed only
// CORPORATION, CORP and "Inc." and left a stray comma ("WEYCO GROUP,:") on about 38% of titles.
// A suffix right after "&" is part of the name ("JPMORGAN CHASE & CO"), so it stays.
const SUFFIX = /(?<!&[\s, ]*)[\s, ]+(?:INCORPORATED|INC\.?|CORPORATION|CORP\.?|CO\.?|LTD\.?|LIMITED|L\.?L\.?C\.?|L\.?P\.?|PLC\.?)\s*$/i;

// SEC entity names are often all capitals ("FINCH THERAPEUTICS GROUP, INC."), which reads as
// shouting in a search result. A name with no lower-case letter is set in ordinary case; a name
// the company already cases ("TherapeuticsMD", "Apple Inc.") is left exactly as filed. Acronyms
// stay as they are: words of up to three letters (IBM, AES, NV) unless they are ordinary words,
// words without a vowel (NXT, BNY), words with a digit (3M) and the company's own ticker.
const LOWER = new Set(['OF', 'AND', 'THE', 'FOR', 'IN', 'ON', 'AT', 'TO', 'DE', 'DU', 'DES', 'LA', 'LE', 'ET']);
const WORDS = new Set(['OIL', 'GAS', 'ONE', 'NEW', 'AIR', 'SUN', 'BIO', 'CAR', 'BAY', 'BIG', 'TOP', 'RED', 'LAB', 'ART', 'SEA', 'SKY', 'ICE', 'TEA', 'WAY', 'INC', 'CO', 'CORP', 'LTD']);
const KEEP = new Set(['LLC', 'LP', 'PLC', 'REIT', 'ETF', 'USA', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'ADR', 'NV', 'SA', 'AG', 'SE', 'AB', 'BV', 'SPA', 'ASA']);
// Brands whose own casing no rule can recover from capitals.
const BRANDS = new Map(Object.entries({ JPMORGAN: 'JPMorgan', TECHTARGET: 'TechTarget', PAYPAL: 'PayPal', EBAY: 'eBay', FEDEX: 'FedEx', BLACKROCK: 'BlackRock', ABBVIE: 'AbbVie', CONOCOPHILLIPS: 'ConocoPhillips', PEPSICO: 'PepsiCo', CARMAX: 'CarMax', AUTOZONE: 'AutoZone', NEXTERA: 'NextEra', CENTERPOINT: 'CenterPoint', BLACKBERRY: 'BlackBerry', GODADDY: 'GoDaddy', HUBSPOT: 'HubSpot', DOORDASH: 'DoorDash', CROWDSTRIKE: 'CrowdStrike', MONGODB: 'MongoDB', SERVICENOW: 'ServiceNow', NVIDIA: 'NVIDIA', IROBOT: 'iRobot', GITLAB: 'GitLab', DOCUSIGN: 'DocuSign', SUNPOWER: 'SunPower', SOLAREDGE: 'SolarEdge', FIRSTENERGY: 'FirstEnergy', DUPONT: 'DuPont', WESTROCK: 'WestRock', BORGWARNER: 'BorgWarner', HEALTHEQUITY: 'HealthEquity', LENDINGCLUB: 'LendingClub', NETAPP: 'NetApp', OPENTEXT: 'OpenText', MARKETAXESS: 'MarketAxess', JETBLUE: 'JetBlue', GLOBALFOUNDRIES: 'GlobalFoundries', VERISIGN: 'VeriSign', CHARGEPOINT: 'ChargePoint', QUANTUMSCAPE: 'QuantumScape', DIGITALOCEAN: 'DigitalOcean', RINGCENTRAL: 'RingCentral', BIOMARIN: 'BioMarin', BANKUNITED: 'BankUnited', FACTSET: 'FactSet', ZOOMINFO: 'ZoomInfo', CARGURUS: 'CarGurus', EXXONMOBIL: 'ExxonMobil', MCKESSON: 'McKesson', MCDONALDS: "McDonald's", AECOM: 'AECOM', IDEXX: 'IDEXX', MSCI: 'MSCI', CBRE: 'CBRE', IDEX: 'IDEX', NASDAQ: 'Nasdaq', AMETEK: 'AMETEK', ONEOK: 'ONEOK', ANSYS: 'Ansys' }));
const word = (w) => w.charAt(0) + w.slice(1).toLowerCase();
function caseWord(token, first, ticker) {
  return token.replace(/[A-Z][A-Z']*/g, (w) => {
    const bare = w.replace(/'/g, '');
    if (BRANDS.has(bare)) return BRANDS.get(bare);
    if (KEEP.has(bare) || bare === ticker) return w;
    if (!first && LOWER.has(bare)) return w.toLowerCase();
    if (WORDS.has(bare)) return word(w);
    if (bare.length <= 3 || !/[AEIOUY]/.test(bare)) return w;
    if (/^MC[A-Z]{2,}/.test(w)) return `Mc${word(w.slice(2))}`;
    return word(w);
  });
}
export function displayCase(name, ticker = null) {
  const text = String(name);
  if (/[a-z]/.test(text) || !/[A-Z]{2}/.test(text)) return text;
  // "/DE/", "/NEW": the filer's state or a re-registration, kept as filed.
  return text.split(/(\s+)/).map((token, i) => (/^\s+$/.test(token) || /\d/.test(token) || token.startsWith('/') ? token : caseWord(token, i === 0, ticker))).join('');
}

// ticker: the company's own, kept in capitals where it is also a word of the name (MSCI, FTAI).
export function companyLabel(name, ticker = null) {
  const original = displayCase(String(name), ticker).replace(/[\s ]+$/, '');
  const short = original.replace(SUFFIX, '').replace(/[\s, ]+$/, '');
  return short.length >= 2 ? short : original.replace(/[\s, ]+$/, '');
}

// The company's main exchange ticker in the active release, or null. A ticker is the current SEC
// assignment, so an old filing shows the company's ticker today; the CIK remains the identity.
export function primaryTicker(cik) {
  return PRIMARY_TICKERS[String(cik).padStart(10, '0')] ?? null;
}

// The title form of a company: "Lockheed Martin (LMT)", or the short name alone without a ticker.
export function titleLabel(company) {
  const ticker = primaryTicker(company.cik);
  return ticker ? `${companyLabel(company.name, ticker)} (${ticker})` : companyLabel(company.name);
}
