#!/usr/bin/env bash
# Builds the Wasp app and assembles everything Prisma Compute needs into
# .compute/. Run it with "npm run build" in deploy/.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$PWD
OUT=$ROOT/.compute
WASP=${WASP:-wasp}

echo "==> wasp install and build"
$WASP install
$WASP build

echo "==> Bundle the server"
(cd .wasp/out/server && npm run bundle)

# The client needs the API URL at build time, but the URL is only known once
# the app runs on Compute. deploy/start.ts replaces this placeholder at boot.
echo "==> Build the client"
REACT_APP_API_URL=https://app-origin.placeholder.invalid npx vite build

echo "==> Install production dependencies for linux-x64"
rm -rf "$OUT"
mkdir -p "$OUT/.wasp/out/server" "$OUT/.wasp/out/sdk/wasp"
cp package.json package-lock.json "$OUT/"
cp .wasp/out/server/package.json "$OUT/.wasp/out/server/"
cp .wasp/out/sdk/wasp/package.json "$OUT/.wasp/out/sdk/wasp/"
cp -R .wasp/out/libs "$OUT/.wasp/out/libs"
(cd "$OUT" && npm ci --omit=dev --ignore-scripts --os=linux --cpu=x64 --libc=glibc)

echo "==> Generate Prisma Client with the Compute engines"
mkdir -p "$OUT/db"
cp -R .wasp/out/db/schema.prisma .wasp/out/db/migrations "$OUT/db/"
(cd "$OUT" && PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x \
  node node_modules/prisma/build/index.js generate --schema=db/schema.prisma)

echo "==> Assemble .compute/"
cp -R .wasp/out/server/bundle "$OUT/server-bundle"
rm -rf "$OUT/.wasp" "$OUT/node_modules/wasp" "$OUT/node_modules/@wasp.sh/generated-server" \
  "$OUT/node_modules/@wasp.sh/spec" "$OUT/package.json" "$OUT/package-lock.json"
mkdir -p "$OUT/server" && mv "$OUT/server-bundle" "$OUT/server/bundle"
cp -R .wasp/out/web-app/build "$OUT/client"
# Engines for the machine that ran this script are not needed on Compute.
find "$OUT/node_modules/.prisma/client" "$OUT/node_modules/@prisma/engines" \
  \( -name '*darwin*' -o -name '*windows*' \) -delete

echo "==> Bundle the launcher"
(cd deploy && npx esbuild start.ts --bundle --platform=node --format=esm \
  --target=node22 --outfile="$OUT/start.mjs" --log-level=warning)

du -sh "$OUT"
