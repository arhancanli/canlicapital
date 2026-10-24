#!/usr/bin/env bash
# One-time setup: lets each Canli package publish from GitHub Actions (npm trusted publishing), so a
# release is a pushed tag (for example markets-mcp-v0.7.1) and npm shows provenance for it. Run it
# in your own Terminal while signed in to npm (npm login); each change asks for your security key.
# It only adds what is missing and never removes anything.
set -u
REPO="arhancanli/canlicapital"
while read -r pkg file env; do
  echo "== $pkg"
  current="$(npm trust list "$pkg" 2>&1)"
  if grep -q "$file" <<<"$current"; then
    echo "already trusts $file"
  else
    npm trust github "$pkg" --file "$file" --repo "$REPO" --env "$env" --allow-publish -y
  fi
done <<'EOF'
canli-validation-mcp mcp-publish.yml mcp-release
canli-quant-mcp mcp-quant-publish.yml mcp-quant-release
canli-fundamentals-mcp mcp-fundamentals-publish.yml mcp-fundamentals-release
canli-research-mcp mcp-research-publish.yml mcp-research-release
canli-backtest-mcp mcp-backtest-publish.yml mcp-backtest-release
canli-markets-mcp mcp-markets-publish.yml mcp-markets-release
canli-paper-trading-mcp mcp-paper-publish.yml mcp-paper-release
canli-mcp mcp-canli-publish.yml mcp-canli-release
EOF
