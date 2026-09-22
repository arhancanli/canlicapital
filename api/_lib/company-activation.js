import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Production activation of the company reference is a reviewed file shipped with the
// deployment (config/company-production-activation.json), never a remote object. It pins
// one release, its public storage bases and one admission file by SHA-256. Indexable
// responses additionally require Vercel's production environment, so preview and local
// builds of the same commit stay noindex.
export const ACTIVATION_PATH = 'config/company-production-activation.json';
const hashPattern = /^[a-f0-9]{64}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function httpsBase(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error(`Activation ${label} must be a fixed HTTPS base ending in /`);
  return url.href;
}

export function parseCompanyAdmission(bytes, { releaseHash, sha256: expected }) {
  if (sha256(bytes) !== expected) throw new Error('Company admission hash does not match activation');
  const admission = JSON.parse(bytes);
  if (admission?.schema !== 'canli.company-admission.v1' || admission.release_hash !== releaseHash) throw new Error('Company admission does not bind the activated release');
  const concepts = admission.concepts;
  if (!Array.isArray(concepts) || !concepts.length || concepts.length > 128 || new Set(concepts).size !== concepts.length || concepts.some(tag => !/^[A-Za-z][A-Za-z0-9]{0,99}$/.test(tag))) throw new Error('Invalid admission concepts');
  const position = new Map(concepts.map((tag, index) => [tag, BigInt(index)]));
  const companies = new Map();
  for (const [cik, entry] of Object.entries(admission.companies ?? {})) {
    if (!/^\d{10}$/.test(cik) || typeof entry?.overview !== 'boolean' || !/^[0-9a-f]+$/.test(entry.available) || !/^[0-9a-f]+$/.test(entry.admitted)) throw new Error(`Invalid admission entry ${cik}`);
    const available = BigInt(`0x${entry.available}`), admitted = BigInt(`0x${entry.admitted}`);
    if ((admitted & ~available) !== 0n || available >> BigInt(concepts.length) !== 0n) throw new Error(`Admission for ${cik} exceeds its available histories`);
    if (!entry.overview && admitted !== 0n) throw new Error(`Withheld company ${cik} has admitted histories`);
    companies.set(cik, { overview: entry.overview, admitted, lastmod: entry.lastmod });
  }
  if (companies.size !== admission.companies_in_release) throw new Error('Admission company count does not match its release');
  return {
    admission,
    isAdmitted(cik, concept) {
      const entry = companies.get(cik);
      if (!entry) return false;
      if (concept === undefined) return entry.overview;
      const bit = position.get(concept);
      return bit !== undefined && (entry.admitted & (1n << bit)) !== 0n;
    },
    *admittedPaths() {
      for (const [cik, entry] of companies) {
        if (!entry.overview) continue;
        yield { path: `/companies/${cik}`, lastmod: entry.lastmod };
        for (const [tag, bit] of position) if (entry.admitted & (1n << bit)) yield { path: `/companies/${cik}/${tag}`, lastmod: entry.lastmod };
      }
    },
  };
}

export function loadCompanyActivation({ root = process.cwd(), readFile = path => readFileSync(resolve(root, path)) } = {}) {
  let bytes;
  try { bytes = readFile(ACTIVATION_PATH); } catch { return { enabled: false }; }
  const activation = JSON.parse(bytes);
  if (activation?.schema !== 'canli.company-production-activation.v1' || typeof activation.enabled !== 'boolean') throw new Error('Invalid company activation');
  if (!activation.enabled) return { enabled: false };
  if (!hashPattern.test(activation.release_hash) || !hashPattern.test(activation.admission?.sha256) || typeof activation.admission?.path !== 'string' || !/^config\/[a-z0-9-]+\.json$/.test(activation.admission.path)) throw new Error('Invalid company activation pins');
  const admission = parseCompanyAdmission(readFile(activation.admission.path), { releaseHash: activation.release_hash, sha256: activation.admission.sha256 });
  return {
    enabled: true,
    releaseHash: activation.release_hash,
    catalogBase: httpsBase(activation.catalog_base_url, 'catalog_base_url'),
    deliveryBase: httpsBase(activation.delivery_base_url, 'delivery_base_url'),
    ...admission,
  };
}

// Decide the runtime release configuration. Explicit environment pins (used by the
// isolated noindex previews) take precedence and never enable indexing. Otherwise an
// enabled activation supplies the release; pages become indexable only on Vercel
// production, only for the activated release and only where admission allows.
export function resolveCompanyRuntime(env, activation) {
  if (env.COMPANY_RELEASE_HASH || env.COMPANY_CATALOG_BASE_URL || env.COMPANY_DELIVERY_BASE_URL) {
    return { releaseHash: env.COMPANY_RELEASE_HASH, catalogBase: env.COMPANY_CATALOG_BASE_URL, deliveryBase: env.COMPANY_DELIVERY_BASE_URL, indexable: false, directoryIndexable: false };
  }
  if (!activation?.enabled) return { indexable: false, directoryIndexable: false };
  const production = env.VERCEL_ENV === 'production';
  return {
    releaseHash: activation.releaseHash,
    catalogBase: activation.catalogBase,
    deliveryBase: activation.deliveryBase,
    indexable: production ? (cik, concept) => activation.isAdmitted(cik, concept) : false,
    directoryIndexable: production,
  };
}
