import path from "node:path";
import express from "express";
import { prisma, type MiddlewareConfigFn, type ServerSetupFn } from "wasp/server";

// Wasp builds the React client into static files and expects you to host them
// somewhere. When CLIENT_BUILD_DIR points at that build, the Wasp server also
// serves it, so the whole app lives on one origin. The Prisma Compute launcher
// (deploy/start.ts) sets the variable; in development it is unset and Vite
// serves the client as usual.
export const serveClient: ServerSetupFn = async ({ app }) => {
  const clientDir = process.env.CLIENT_BUILD_DIR;
  if (!clientDir) return;

  app.use(express.static(clientDir));

  // Client-side routes such as /login have no file on disk, so every other
  // GET falls back to the single-page app's shell.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(clientDir, "200.html"));
  });
};

// Prisma Compute pauses an idle service. The database connections Prisma
// Client holds open do not survive a long pause, and the first query afterwards
// waits on them until it times out. When DB_RECONNECT_AFTER_IDLE_MS is set
// (deploy/start.ts sets it) and no request arrived for that long, this drops
// the old connections first, so the query opens a fresh one.
let lastRequestAt = Date.now();

export const reconnectAfterIdle: MiddlewareConfigFn = (middlewareConfig) => {
  const idleLimit = Number(process.env.DB_RECONNECT_AFTER_IDLE_MS);
  if (!idleLimit) return middlewareConfig;

  middlewareConfig.set("reconnectAfterIdle", async (_req, _res, next) => {
    const idleFor = Date.now() - lastRequestAt;
    lastRequestAt = Date.now();
    if (idleFor > idleLimit) {
      await prisma.$disconnect();
    }
    next();
  });
  return middlewareConfig;
};
