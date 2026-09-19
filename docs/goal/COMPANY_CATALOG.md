# Company catalog storage and serving checkpoint

This is a staged read model, not an activated production catalog. The 327-page
website remains separate; the 2,987 fresh candidate pages are not published.

## Objects and activation

`build-staged-company-catalog.mjs` first replays the complete captured cohort through
`reviewCandidates`. Incomplete, excluded or unreproducible cohorts fail staging.
Each selected company becomes an immutable SHA-256-addressed JSON object. Range-index
nodes contain either record references and issuer names, or child-node references.
Each reference binds a byte count, range and record count. Nodes are capped at 128
entries and 64 KiB; record objects at 1 MiB. Long issuer names split nodes by byte
size without truncating their identity. Names over the explicit 4 KiB directory-label
limit fail the build rather than being silently shortened.

A single-writer lock protects builds in one output directory. A failed build leaves
the prior catalog.json activation pointer intact. Immutable prior objects remain
available for previous revisions. The pointer is only local staging metadata and
has publication_approved=false. It is never automatically copied to environment
configuration. No object garbage collection runs in this task.

Builder memory retains compact sorted references to every company, rather than
all financial records. That reference list still grows with corpus size; no
million-company build-memory claim is made. The runtime reader bounds each object
read and its byte cache independently of the total catalog size.

## Lookup and directory behavior

The reader loads and verifies only the nodes on a CIK lookup path and one company
object. It validates hashes, byte counts, child levels/ranges, leaf identities,
and index ordering. Depth is capped at eight index levels; cache payloads at 4 MiB
per catalog instance. Cache size is not total process memory. The HTTP storage
adapter uses a fixed HTTPS base, rejects redirects, times out after ten seconds,
and enforces byte limits while streaming the response.

Directory listing reads names directly from the leaf index, with at most 50 companies
per page and an exclusive CIK cursor. It does not read financial objects. A revision
is returned on every directory page. Clients should send that revision on later
pages; a changed active revision returns 409, so a client can restart instead of
silently combining different catalog versions.

Staged routes:

- GET/HEAD `/api/v1/companies/{ten-digit-CIK}`: record, ETag/304, genuine missing-CIK
  404. Missing storage objects, corruption and configuration failures are 503/no-store,
  never cached as missing companies.
- GET/HEAD `/api/v1/companies?limit=50&after={CIK}&revision={root-hash}`: directory page.
  Invalid limits/cursors are 400. Read-only CORS and OPTIONS are supported.

All API responses use X-Robots-Tag: noindex. They are developer data interfaces,
not additional indexable HTML pages. Routes are not advertised in live documentation
until a reviewed catalog and backend are activated and verified.

## Configuration and release still required

`COMPANY_CATALOG_BASE_URL` identifies an HTTPS object-store prefix. Objects must
exist at `objects/{hash}.json`. `COMPANY_CATALOG_ROOT_HASH` pins the reviewed root.
Neither is configured by this work. Without them the new endpoints return 503.
Do not upload the corpus as a million-file Vercel source bundle. Backend selection,
upload verification, backup/retention and production activation remain open. Updated preview packaging passes; the catalog is inactive.

The captured source gzip files remain separate immutable provenance inputs. Before
HTML expansion, implement their download route/storage mapping and reuse the
existing coverage/unit warnings in a renderer fed by this catalog. Add bounded,
server-rendered company discovery and sitemap generation from the same approved
revision. These are required next steps, not completed by a JSON API.

## Reproduction and measured limits

Commands (from the website repository):

```sh
node --test scripts/company-catalog.test.mjs
node scripts/build-staged-company-catalog.mjs artifacts/seo/corpus-local/fresh-review artifacts/seo/corpus-local/company-catalog
node scripts/measure-company-catalog.mjs artifacts/seo/corpus-local/company-catalog artifacts/seo/corpus-local/fresh-review artifacts/seo/company-catalog-measurement.json
```

The measurement starts a local Node HTTP server, requests and compares every real
record with its staged source, traverses all directory pages, and checks HEAD,
conditional requests and a genuine missing company. It does not measure cloud
latency, concurrent production load, rankings, actual indexing or a million pages.
See `artifacts/seo/company-catalog-measurement.json` for exact current results and
code hashes. The first real catalog has 342 companies, four index nodes over two
levels, and about 6.6 MB of selected records/indexes. Original captures are additional
storage (57.5 MB compressed); they are not included in the 6.6 MB figure.

## Validate upload inputs without mutating them

Prebuild rewrites generated sections inside homepage HTML. Validating in the upload
source and then deploying those changed bytes invalidates the saved source-date
binding. The guard correctly rejected preview dpl_D7J9MKioPjize4MsUN82r6R2peSM.
Restoring the original bound homepage input allowed dpl_3xmLsji65LwWt1BmnxhSoBv4bytE
to build. Source-date rejection remains enabled.

Use `node scripts/validate-deploy-snapshot.mjs UPLOAD_SOURCE` for subsequent checks.
It builds in a separate temporary clone and prints that clone's location. Deploy
UPLOAD_SOURCE, not the generated clone. A regression fixture deliberately rewrites
index.html and verifies the upload input remains byte-identical. The real snapshot
also passes this isolated build. This command performs no deployment.

## Staged HTML and source-delivery proof

`company-page-renderer.mjs` is shared by the existing static generator and the
injected HTML handler. All pilot company/history output remains byte-identical.
`build-company-assets.mjs` runs after Vite and emits a resource manifest; dynamic
HTML replaces the matching source imports with these compiled assets. A mismatched
renderer/bundle fails closed. Runtime HTML is capped at 256 KiB and defaults to
noindex/no-store until explicit activation. It only accepts actual concept tags.

Optional PILOT_DIRECTORY merges the seven already-reviewed companies into the
fresh cohort. Every pilot source is independently replayed as well. Source delivery
stores the original compressed bytes and selected JSON as content-addressed objects;
logical download paths retain the raw SEC-response hash. A corrupted existing object
aborts staging without replacing delivery.json. No backend upload occurs.

```sh
node scripts/build-staged-company-catalog.mjs artifacts/seo/corpus-local/fresh-review artifacts/seo/corpus-local/company-catalog-combined public/company-data
node scripts/stage-company-delivery.mjs artifacts/seo/corpus-local/fresh-review artifacts/seo/corpus-local/company-delivery public/company-data
npm run build
node scripts/measure-company-delivery.mjs artifacts/seo/corpus-local/company-catalog-combined artifacts/seo/corpus-local/company-delivery dist artifacts/seo/company-delivery-measurement.json
node scripts/preview-company-delivery.mjs artifacts/seo/corpus-local/company-catalog-combined artifacts/seo/corpus-local/company-delivery dist
```

The preview binds localhost only. It serves 50 companies per directory page and
seven linked pages for the measured 349-company corpus. Download requests now use a bounded immutable index. The directory boundary
list remains a local QA fixture; production still requires bounded discovery
pinned to the same reviewed release. Shared non-company destinations are
not mounted by this narrow QA server; browser checks verify their hrefs, not those
flows. Existing developer flow checks remain separate.

Measurement verifies all 3,057 reference pages, 698 original/selected downloads,
source reproduction, canonical/structured-data identities, developer entry points,
compiled assets, directory completeness, real misses, HEAD and conditional requests.
The largest HTML is 28,902 bytes. Sequential local timings are not cloud load tests.
The 28 browser checks exercise Chromium/WebKit at mobile/desktop widths. No content
was activated, submitted or claimed indexed by these measurements.

## Bounded download index and release binding

`company-download-index.js` looks up a logical download path through an immutable
SHA-256-keyed radix tree. Leaves hold at most128 descriptors and64KiB; branches
have at most16 children. Prefix/ordering, descriptor paths, child sizes and object
hashes are validated. Lookup depth is bounded by the64-character hash (at most65
nodes); the actual698-download tree has17 nodes over two levels. Its largest read
is13,676 bytes, total index184,535 bytes. Payload cache is capped at256KiB, which
is not a bound on whole-process or concurrent request memory.

The download handler returns verified original gzip or selected JSON bytes with
noindex, attachment metadata and nosniff. Missing paths return404; storage/hash
failures return503/no-store. The HTTP storage adapter accepts only a fixed HTTPS
base, rejects redirects, applies a10-second timeout, caps objects at16MiB and
checks byte counts and hashes before returning bytes. No public wrapper or storage
configuration is activated yet. Local preview download traffic uses this same handler.

`stage-company-delivery.mjs` now builds the immutable download index before updating
its local manifest. `build-company-release.mjs CATALOG DELIVERY` traverses all
catalog records, compares selected downloads, replays originals, and writes a
small content-addressed release binding the two roots. Corruption leaves the prior
release pointer untouched. `artifacts/seo/company-release-staged.json` records the
349-company/2,701-history revision; publication_approved remainsfalse.

The builders retain compact descriptor arrays; million-record build memory and
cloud concurrency are not measured. Next: bounded directory and sitemap discovery
from the bound release, production wrappers/storage, and deployment verification.

## Ranked discovery checkpoint

`catalog.directoryPage(page)` uses subtree counts to seek directly to the requested
50-company window. Its late-page regression proves only the index path is read;
company objects and preceding pages are not loaded. Range navigation uses at most
20 links per level on actual directory pages, rather than generating empty hubs.
The 20,000-page synthetic graph is fully connected within four links. The actual
3,057-page reference graph has maximum depth three from /companies.

`build-company-discovery.mjs CATALOG DELIVERY OUTPUT` loads the immutable verified
release and asynchronously enumerates its companies/histories into sitemap shards.
It verifies counts before switching discovery.json and takes a single-writer lock.
Directory lastmod is omitted because source capture dates do not establish changes
to directory membership/templates. Data page lastmod comes from the captured record.
The writer still retains its URL uniqueness set, so build memory grows with count;
no million-page build-memory measurement is claimed.

```sh
node scripts/build-company-discovery.mjs artifacts/seo/corpus-local/company-catalog-combined artifacts/seo/corpus-local/company-delivery artifacts/seo/corpus-local/company-discovery
node scripts/measure-company-delivery.mjs artifacts/seo/corpus-local/company-catalog-combined artifacts/seo/corpus-local/company-delivery dist artifacts/seo/company-delivery-measurement.json artifacts/seo/corpus-local/company-discovery
```

The narrow local QA host can expose the staged XML at /company-sitemap.xml when a
discovery directory is provided. All HTTP URLs are compared to rendered pages.
This is not a live sitemap submission. Public wrappers/storage configuration,
production sitemap aggregation and deployment packaging still require integration.

## Verified request assembly

`company-release.js` loads one <=4KiB SHA-bound release object, validates its schema
and catalog company count, then assembles the company/directory/download handlers.
The load can be shared across concurrent requests and retries after initial failure.
The local preview uses this shared router and rejects mixed catalog/download/discovery
inputs. Release approval metadata cannot enable indexing: these handlers stay noindex
until a separate reviewed production activation path is implemented.

The full staged HTTP replay passes through this assembly, including ETag/HEAD,
source bytes, canonical pages and sitemap equality. Public Vercel wrappers, storage
configuration and deployment bundling remain open; this module is not activation.

## Public staging wrapper configuration

`api/v1/company-reference.js` accepts a canonical logical `path` query and delegates
to the shared release handler. It requires COMPANY_RELEASE_HASH, COMPANY_CATALOG_BASE_URL
and COMPANY_DELIVERY_BASE_URL. Catalog objects are read under the catalog prefix;
release/download-index/original/selected objects under the delivery prefix. These
bases must be fixed HTTPS URLs. The deployment carries only the compiled asset
manifest via functions.includeFiles, as documented by Vercel:
https://vercel.com/docs/project-configuration/vercel-json#functions.

The handler caches initialization per configured release/base tuple, retries failed
release reads, and returns503 without configuration. Successful staging HTML remains
noindex. No clean-url rewrite is activated; existing pilot routes are unaffected.
Actual deployment packaging, hosted storage, sitemap aggregation and production
indexability still need verification. The staging API is not advertised as live.


Wrapper packaging now passes Vercel preview build: see wrapper-preview.json and
https://meridian-atulevugw-arhans-projects-ac470eaa.vercel.app. CLI inspect lists the
company-reference function; hosted-data runtime remains unverified because storage
is not configured. The deploy used reviewed task inputs, not refreshed engine exports.

Source breadth can be reviewed without publishing additional concepts:

```sh
node scripts/audit-company-concept-breadth.mjs artifacts/seo/corpus-local/company-delivery artifacts/seo/company-concept-breadth.json
```

The inventory verifies bytes and reuses annual observation selection. It flags exact
observation-vector duplicates and zero/constant histories. It infers potential kind
from rows, which is not authoritative taxonomy periodType. Labels alone do not prove
meaning, usefulness, distinct intent or comparability. No new tag enters the public
selector through this audit; opportunity counts are not publishable page counts.

### Capture batches with reproduced exclusions

After a capture finishes, review the entire original queue. A source rejection
now reproduces from the stored receipt and original bytes; its reason must match
the selector. Network failures and corrupt captures do not become valid exclusions.
For a completed batch with documented source exclusions, pass the explicit final
`reviewed-exclusions` argument to stage-company-delivery.mjs after SELECTION_POLICY
(or set allowReviewedExclusions:true through its module API). The delivery manifest
retains all exclusions plus original queue/refresh/selector hashes. A batch with
no eligible companies, incomplete capture, HTTP errors or replay errors still fails.
Do not modify a queue to hide rejected or failed captures.
