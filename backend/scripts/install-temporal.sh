#!/usr/bin/env bash
# Downloads the Temporal CLI (which bundles the dev server) into backend/.bin.
# Only needed if `temporal` is not already on your PATH.
set -euo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.bin"
mkdir -p "$BIN_DIR"

if [ -x "$BIN_DIR/temporal" ]; then
  echo "Temporal CLI already present: $("$BIN_DIR/temporal" --version)"
  exit 0
fi

case "$(uname -s)" in
  Darwin) PLATFORM=darwin ;;
  Linux)  PLATFORM=linux ;;
  *) echo "Unsupported platform. Install manually: https://docs.temporal.io/cli" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=amd64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

echo "Downloading Temporal CLI for ${PLATFORM}/${ARCH}..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -sSL -o "$TMP/temporal.tar.gz" \
  "https://temporal.download/cli/archive/latest?platform=${PLATFORM}&arch=${ARCH}"
tar -xzf "$TMP/temporal.tar.gz" -C "$TMP"
mv "$TMP/temporal" "$BIN_DIR/temporal"
chmod +x "$BIN_DIR/temporal"
echo "Installed: $("$BIN_DIR/temporal" --version)"
