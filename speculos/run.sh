#!/bin/bash
set -e

ELF=apps/ethereum.elf
VERSION=1.22.1

# Download ELF if not present
if [ ! -f "$ELF" ]; then
  echo "Downloading Ethereum app v${VERSION} for Nano S Plus..."
  curl -L "https://github.com/LedgerHQ/app-ethereum/releases/download/${VERSION}/app-${VERSION}-nanos2.elf" \
    -o "$ELF"
  echo "Downloaded."
fi

echo ""
echo "Starting Speculos (Nano S Plus emulator)..."
echo "Device screen → http://localhost:5100"
echo ""

docker run --rm -it \
  --platform linux/amd64 \
  -v "$(pwd)/apps:/speculos/apps" \
  -p 5100:5100 \
  -p 41000:41000 \
  ghcr.io/ledgerhq/speculos \
  --model nanosp \
  --display headless \
  --api-port 5100 \
  --vnc-port 41000 \
  /speculos/apps/ethereum.elf
