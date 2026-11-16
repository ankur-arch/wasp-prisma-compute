import { field, secretString } from "@prisma/composer/arktype";
import { rawHttpContract } from "@prisma/composer/http";
import node from "@prisma/composer/node";
import { compute, rawPostgres } from "@prisma/composer-prisma-cloud";
import { type } from "arktype";

// One Compute service runs the whole Wasp app: the Node.js server, which also
// serves the built React client. Its database is a Prisma Postgres database
// that the deploy creates (see module.ts).
export default compute({
  name: "app",
  deps: { db: rawPostgres() },
  input: type({
    origin: field(type("string")),
    jwtSecret: secretString(),
  }),
  // "dir" is the folder build.sh assembles; "entry" is start.ts, bundled.
  build: node({ module: import.meta.url, dir: "../.compute", entry: "start.mjs" }),
  expose: { http: rawHttpContract },
});
