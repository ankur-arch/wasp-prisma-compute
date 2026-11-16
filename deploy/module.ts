import { appRoot } from "@prisma/composer";
import {
  generatedParam,
  publicUrl,
  rawPostgres,
  serviceOrigin,
} from "@prisma/composer-prisma-cloud";
import appService from "./service.ts";

// The app's name, and the name of the Prisma project the first deploy creates.
// It must be unique in your workspace.
const APP_NAME = "wasp-prisma-compute";

export default appRoot(APP_NAME, ({ provision }) => {
  // A Prisma Postgres database, created by the first deploy. Every environment
  // (production, staging, a preview per branch) gets its own.
  const db = provision(rawPostgres({ name: "database" }));
  const app = provision(appService, {
    deps: { db },
    input: {
      // The public URL of this service, filled in by the platform.
      origin: serviceOrigin(`${APP_NAME}.app`),
      // Generated on the first deploy and kept for later ones.
      jwtSecret: generatedParam(),
    },
  });
  provision(publicUrl({ id: "web", url: publicUrl.prismaBuild(), target: app.http }));
});
