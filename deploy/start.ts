// Entry point of the Prisma Compute service.
//
// Wasp's generated server reads its configuration from environment variables.
// On Compute the values come from the service declaration instead, and
// DATABASE_URL is reserved by the platform. This file bridges the two: it
// copies the values Composer hands over into the variables Wasp expects,
// applies pending migrations, and then starts the unmodified Wasp server.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import service from "./service.ts";

// Must match the value build.sh passes to the client build.
const API_URL_PLACEHOLDER = "https://app-origin.placeholder.invalid";

const root = import.meta.dirname;
const { db } = service.load();
const { origin, jwtSecret } = service.input();

// Compute has no shell, so Prisma 5 cannot detect the OpenSSL version and
// would pick the wrong engine. Point it at the right files directly.
const target = "debian-openssl-3.0.x";

Object.assign(process.env, {
  NODE_ENV: "production",
  PORT: String(service.port()),
  DATABASE_URL: db.url,
  JWT_SECRET: jwtSecret.expose(),
  // The Wasp server serves the client too (src/serverSetup.ts), so the
  // server URL and the client URL are the same.
  WASP_SERVER_URL: origin,
  WASP_WEB_CLIENT_URL: origin,
  PRISMA_QUERY_ENGINE_LIBRARY: path.join(
    root,
    `node_modules/.prisma/client/libquery_engine-${target}.so.node`,
  ),
  PRISMA_SCHEMA_ENGINE_BINARY: path.join(
    root,
    `node_modules/@prisma/engines/schema-engine-${target}`,
  ),
});

// Wasp compiles the API URL into the client at build time, but the app's URL
// is only known once it runs, and differs per environment. build.sh compiles
// in a placeholder; this writes a copy of the client with the real origin.
// The copy goes to the temp directory because deployed files are read-only.
const clientDir = path.join(os.tmpdir(), "wasp-client");
fs.cpSync(path.join(root, "client"), clientDir, { recursive: true });
for (const entry of fs.readdirSync(clientDir, { recursive: true })) {
  const file = path.join(clientDir, String(entry));
  if (!/\.(js|html)$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(API_URL_PLACEHOLDER)) {
    fs.writeFileSync(file, source.replaceAll(API_URL_PLACEHOLDER, origin));
  }
}
process.env.CLIENT_BUILD_DIR = clientDir;

// Same step as "npm run db-migrate-prod" in Wasp's generated Dockerfile.
const started = Date.now();
const migrate = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/prisma/build/index.js"),
    "migrate",
    "deploy",
    `--schema=${path.join(root, "db/schema.prisma")}`,
  ],
  { stdio: "inherit" },
);
if (migrate.status !== 0) {
  console.error("prisma migrate deploy failed", migrate.error ?? "");
  process.exit(1);
}
console.log(`Migrations checked in ${Date.now() - started} ms`);

await import(path.join(root, "server/bundle/server.js"));
