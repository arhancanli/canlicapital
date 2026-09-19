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
upload verification, backup/retention and deployment packaging checks remain open.

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
