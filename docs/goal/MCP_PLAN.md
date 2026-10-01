# MCP plan: the most trusted validation server (2026-09-25)

Goal: the MCP server people reach for when they want to know whether a backtest is real, and
trust enough to recommend. Every claim about it is measured before it is published.

## 1. Reach, with no friction
- [x] npm 0.3.0 and the official MCP Registry
- [x] Hosted endpoint https://canlicapital.com/mcp (PR226+227; verified from production with the SDK client, real validation on the shared key)
- [x] Shared anonymous key, so the first call works with no signup
- [x] One-click installs on /developers: Add to Cursor, Add to Claude Desktop (.mcpb per release), VS Code command
- [ ] Directories: Glama (submitted), mcpservers.org (submitted), cursor.directory (LIVE 2026-09-25, via the standalone repo arhancanli/canli-validation-mcp),
      awesome-mcp-servers (PR, needs the Glama badge), Smithery (owner login), PulseMCP (paused),
      remote-server lists once hosted is verified
- [ ] Anthropic's connectors directory for remote servers (the most prestigious listing)

## 2. Trust
- [x] npm provenance via GitHub Actions trusted publishing (0.3.1, 0.4.0 fully from CI) (the verified-build badge on npm;
      also ends the 2FA prompt for each release; one-time owner setup on npmjs.com)
- [x] SECURITY.md, a privacy statement (what is stored: receipts; what is not: your data source),
      a no-logging promise for keys, pinned dependencies, SBOM per release
- [ ] Public uptime and latency page for the API and /mcp, measured, not claimed
- [x] Published golden vectors: DSR and MinTRL vs their papers' worked examples; CSCV vs CRAN pbo (all logits), in CI
- [ ] Changelog and semantic versioning; the npm README can never go stale again (done: #222)

## 3. Best for agents
- [ ] Private local mode: deflated Sharpe and CSCV computed on the user's machine, data never sent
- [ ] Ticker lookup (AAPL, not a CIK) for company history
- [~] Tool annotations done (0.3.1); structured outputs (outputSchema), prompts ("validate my backtest"), resources (methodology)
- [ ] Published agent benchmark: fixed tasks across models; right tool, right answer, tokens,
      latency. Builds on the measured -52% tokens of 0.3.0

- [x] New tool: validate_track_record (minimum track record length), 0.4.0

## 4. Recognition
- [ ] Write-ups: how the validators work and what they refuse to claim (notes on the site)
- [ ] Zenodo DOI for citations (owner login)
- [ ] Launch posts (owner), Product Hunt once there are early users

## Measure weekly
npm downloads, hosted /mcp calls, keys issued, unique clients, directory listings live,
p50/p95 latency. Nothing is announced before it is measured.
