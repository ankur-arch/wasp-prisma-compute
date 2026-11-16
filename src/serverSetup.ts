import path from "node:path";
import express from "express";
import { type ServerSetupFn } from "wasp/server";

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
