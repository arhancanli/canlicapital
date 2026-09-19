import { createConfiguredCompanyReference } from '../_lib/company-reference-runtime.js';

// Explicit staging endpoint. Canonical site paths are not rewritten here until
// release/storage activation is reviewed; every successful response is noindex.
export default createConfiguredCompanyReference();
