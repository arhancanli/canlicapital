#!/usr/bin/env bash
# Build the Claude Desktop extension (canli-research-mcp-<version>.mcpb) from the COMMITTED package, never the
# working tree, so the bundle holds exactly what the repository publishes.
# Usage: mcp-research/mcpb/build.sh [output-dir]   (run from anywhere inside the canlicapital repository)
set -euo pipefail
repo="$(git rev-parse --show-toplevel)"
out="${1:-$repo/mcp-research/mcpb/dist}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

git -C "$repo" archive HEAD mcp-research/src mcp-research/package.json mcp-research/package-lock.json mcp-research/LICENSE \
  mcp-research/README.md mcp-research/mcpb/manifest.json mcp-research/mcpb/icon.png | tar -x -C "$stage"
cd "$stage/mcp-research"
mv mcpb/manifest.json mcpb/icon.png . && rmdir mcpb

version="$(node -p "require('./package.json').version")"
manifest_version="$(node -p "require('./manifest.json').version")"
if [ "$version" != "$manifest_version" ]; then
  echo "manifest.json version $manifest_version != package.json $version" >&2
  exit 1
fi

npm ci --omit=dev --ignore-scripts --silent
npx --yes @anthropic-ai/mcpb@2.1.2 validate manifest.json
mkdir -p "$out"
npx --yes @anthropic-ai/mcpb@2.1.2 pack . "$out/canli-research-mcp-$version.mcpb"
echo "built $out/canli-research-mcp-$version.mcpb"
