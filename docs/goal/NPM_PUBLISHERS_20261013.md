# npm publisher configuration and verified releases

Completed 2026-10-13: the owner configured both publishers. Quant0.1.2 run38411507515
and backtest0.1.2 run38296417389 attempt2 succeeded on npm and the official Registry.
The account instructions below are retained for reproduction; no further npm setting
is requested. Combined0.4 is proceeding with these exact published dependencies.

The owner has already authorized publication. This is an account authentication requirement,
not a request to approve code. Both release candidates are tested, merged and signed/tagged.
GitHub publishing received npm E404; local npm sessions received E401. No working token
or completed npm publication is inferred from GitHub access.

In npm, open each package's Settings/Access page and configure its GitHub Actions Trusted Publisher:

| Package | npm settings | GitHub owner | Repository | Workflow filename | Environment |
| --- | --- | --- | --- | --- | --- |
| canli-quant-mcp | https://www.npmjs.com/package/canli-quant-mcp/access | arhancanli | canlicapital | mcp-quant-publish.yml | mcp-quant-release |
| canli-backtest-mcp | https://www.npmjs.com/package/canli-backtest-mcp/access | arhancanli | canlicapital | mcp-backtest-publish.yml | mcp-backtest-release |

No npm token needs to be pasted into chat. After configuration is confirmed, resume these
current candidate jobs once after authorization changes, inspect the result, and capture npm integrity/provenance and Registry parity:

- Quant: do not rerun the obsolete0.1.1 job38294072717. Publish the reviewed cumulative0.1.2 candidate from its new signed tag after this configuration is verified.0.1.1 remains a source-only archive.
- Backtest: run38296417389; tag backtest-mcp-v0.1.2 at4f517160563fa54482a49263344d3989004d4305.

Source tarballs are already available in the matching GitHub releases. They have tag-byte
verification and checksums; no npm provenance is claimed for those local source assets.
The combined0.4.0 candidate uses exact quant0.1.2/backtest0.1.2 versions once available on npm. Its temporary
private file dependencies are only a validation fixture and must never be published.

If a retry still fails, inspect the new stated error and actual settings rather than repeating it.
