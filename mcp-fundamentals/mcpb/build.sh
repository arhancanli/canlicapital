#!/usr/bin/env bash
# Build the Claude Desktop extension (canli-fundamentals-mcp-<version>.mcpb) from the COMMITTED package, never the
# working tree, so the bundle holds exactly what the repository publishes.
# Usage: mcp-fundamentals/mcpb/build.sh [output-dir]   (run from anywhere inside the canlicapital repository)
set -euo pipefail
repo="$(git rev-parse --show-toplevel)"
out="${1:-$repo/mcp-fundamentals/mcpb/dist}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

git -C "$repo" archive HEAD mcp-fundamentals/src mcp-fundamentals/package.json mcp-fundamentals/package-lock.json mcp-fundamentals/LICENSE \
  mcp-fundamentals/README.md mcp-fundamentals/mcpb/manifest.json mcp-fundamentals/mcpb/icon.png | tar -x -C "$stage"
cd "$stage/mcp-fundamentals"
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
npx --yes @anthropic-ai/mcpb@2.1.2 pack . "$out/canli-fundamentals-mcp-$version.mcpb"
echo "built $out/canli-fundamentals-mcp-$version.mcpb"
