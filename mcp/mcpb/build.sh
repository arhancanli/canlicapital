#!/usr/bin/env bash
# Build the Claude Desktop extension (canli-validation-mcp-<version>.mcpb) from the COMMITTED
# package, never the working tree, so the bundle holds exactly what the repository publishes.
# Usage: mcp/mcpb/build.sh [output-dir]   (run from anywhere inside the canlicapital repository)
set -euo pipefail
repo="$(git rev-parse --show-toplevel)"
out="${1:-$repo/mcp/mcpb/dist}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

git -C "$repo" archive HEAD mcp/src mcp/package.json mcp/package-lock.json mcp/LICENSE mcp/README.md \
  mcp/mcpb/manifest.json mcp/mcpb/icon.png | tar -x -C "$stage"
cd "$stage/mcp"
mv mcpb/manifest.json mcpb/icon.png . && rmdir mcpb

version="$(node -p "require('./package.json').version")"
manifest_version="$(node -p "require('./manifest.json').version")"
if [ "$version" != "$manifest_version" ]; then
  echo "manifest.json version $manifest_version != package.json $version" >&2
  exit 1
fi

npm ci --omit=dev --ignore-scripts --silent
npx --yes @anthropic-ai/mcpb@2 validate manifest.json
mkdir -p "$out"
npx --yes @anthropic-ai/mcpb@2 pack . "$out/canli-validation-mcp-$version.mcpb"
echo "built $out/canli-validation-mcp-$version.mcpb"
