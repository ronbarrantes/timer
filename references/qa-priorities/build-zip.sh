#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$ROOT_DIR/qa-priorities-ext"
OUTPUT_DIR="$ROOT_DIR/dist"
OUTPUT_FILE="$OUTPUT_DIR/qa-priorities-mvp.zip"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_FILE"

cd "$EXT_DIR"
zip -r "$OUTPUT_FILE" . -x "*.git*" >/dev/null

echo "Created $OUTPUT_FILE"
