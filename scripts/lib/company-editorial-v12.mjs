import { EDITORIAL_EXCLUSIONS_V11, EDITORIAL_OBSERVATION_EXCLUSIONS_V11 } from './company-editorial-v11.mjs';
export const EDITORIAL_POLICY_V12 = 'extended-v12';
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V12 = EDITORIAL_OBSERVATION_EXCLUSIONS_V11;
export const EDITORIAL_EXCLUSIONS_V12 = Object.freeze([...EDITORIAL_EXCLUSIONS_V11, Object.freeze({
  cik: '0001342916',
  tag: 'OperatingIncomeLoss',
  source_sha256: '04f062ef5e20caad0e3d8bf8913f2790f3550faf496fbcc8e4266d8eb14abe28',
  reason: 'The selected operating income or loss history includes other income and expenses separately presented in the statements. This history is withheld because those amounts do not match the operating-result definition used here. Reported net loss and original source data remain available; no calculated replacement has been substituted.',
  filing_url: 'https://www.sec.gov/Archives/edgar/data/1342916/000134291626000008/hnoi10k.htm',
})]);
