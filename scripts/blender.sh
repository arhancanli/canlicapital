#!/bin/bash
set -euo pipefail
blender_executable="${CANLI_BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
if [[ ! -x "$blender_executable" ]]; then
  echo "Blender not found. Install Blender or set CANLI_BLENDER_BIN to its executable." >&2
  exit 1
fi
exec "$blender_executable" "$@"
