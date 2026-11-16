# Wasp on Prisma Postgres and Prisma Compute

A [Wasp](https://wasp.sh) 0.26 app that uses [Prisma Postgres](https://www.prisma.io/postgres) as its database and runs on [Prisma Compute](https://www.prisma.io/compute). Wasp itself is not modified, and the app stays on the Prisma ORM version Wasp ships with (5.19.1).

The app is Wasp's `basic` starter: a to-do list with sign-up, login, tasks and tags. One Compute service runs the Wasp server, and that server also serves the built React client, so the whole app lives on one URL.

Live example: https://oglc31iwk3zzkb44xjy29lsk.fra.prisma.build

## What you need

- Node.js 24.22.1 or newer (Wasp 0.26 refuses older versions)
- Wasp 0.26.1: `npm i -g @wasp.sh/wasp-cli@0.26.1`
- A [Prisma account](https://console.prisma.io), only for deploying

You do not need Docker.

## Run it locally

1. Install the dependencies.

   ```bash
   wasp install
   ```

2. Create a Prisma Postgres database for development and write its connection string to `.env.server`. The database is temporary: claim it with the `CLAIM_URL` in the same file to keep it longer than 24 hours.

   ```bash
   npx create-db@latest --env .env.server
   ```

   To use a database you already have, copy `.env.server.example` to `.env.server` and paste the direct connection string (host `db.prisma.io`, not `pooled.db.prisma.io`, because Prisma Migrate needs a direct connection).

3. Apply the migrations and start the app.

   ```bash
   wasp db migrate-dev
   wasp start
   ```

The client runs on http://localhost:3000 and the server on http://localhost:3001.

## Deploy to Prisma Compute

Everything Compute needs is in `deploy/`. It is a separate package because Compute is driven by the Prisma 8 CLI, and Wasp pins `prisma` to 5.19.1 in the app's own `package.json`.

1. Pick a name for your app. It becomes the name of the Prisma project, so it must be unique in your workspace. Change `APP_NAME` in `deploy/module.ts`, and the region in `deploy/prisma.config.ts` if you want something other than `eu-central-1`.

2. Install, sign in, build and deploy.

   ```bash
   cd deploy
   npm install
   npx prisma auth login
   npm run build
   npx prisma deploy
   ```

The first deploy creates the project, a Prisma Postgres database and the service, and prints the app's URL. There are no environment variables to set: the deploy creates the database and passes its connection string to the service, generates the JWT secret, and passes the service its own URL. Migrations in `migrations/` are applied each time the service starts, the same way Wasp's generated Dockerfile does it.

To ship a change, run `npm run build` and `npx prisma deploy` again. Requests can get a `404` for a few seconds while the new version takes over.

### Check that it works

`scripts/e2e.mjs` signs up a user, logs in, and creates, reads, updates and deletes tasks through the same HTTP calls the client makes.

```bash
node scripts/e2e.mjs https://<your-app>.prisma.build
```

It prints the username it created. Run it again as that user after a redeploy to confirm the data is still there:

```bash
E2E_USERNAME=<username> node scripts/e2e.mjs https://<your-app>.prisma.build
```

### Staging and preview environments

Any environment other than production is a full copy of the app with its own database and URL. The same build works for all of them.

```bash
npx prisma deploy --environment staging
```

Try a risky change on one of these first. A version that crashes on startup replaces the running one, so a broken production deploy means downtime until you deploy a fix.

### Deploy on every push

`.github/workflows/prisma-deploy.yml` builds and deploys on each push: the default branch to production, every other branch to its own preview. It only works after you connect the repository to the project:

```bash
cd deploy
npx prisma project link <your-app-name>
npx prisma git connect
```

The workflow installs Wasp, runs `deploy/build.sh` and deploys. In this repository a push to `main` deployed production and a push to another branch created a working preview with its own database.

## How it fits together

| File | What it does |
| --- | --- |
| `schema.prisma` | Uses the `postgresql` provider, and adds the `debian-openssl-3.0.x` engine so Prisma Client can run on Compute. |
| `src/serverSetup.ts` | A Wasp `setupFn` that serves the built client from the Wasp server, and a middleware that reconnects to the database after an idle pause. Both only act on Compute. |
| `deploy/build.sh` | Runs `wasp build`, bundles the server, builds the client, installs production dependencies for Linux, and assembles `.compute/`. |
| `deploy/start.ts` | The service's entry point. Sets the environment variables Wasp expects, applies migrations, and starts the Wasp server. |
| `deploy/service.ts`, `deploy/module.ts` | Declare the service, its database, its inputs and its public URL for [Prisma Composer](https://www.prisma.io/docs/composer). |
| `deploy/prisma.config.ts` | Deploy settings, including the region. |

## What was changed from the Wasp starter

1. `schema.prisma` uses `postgresql` instead of `sqlite`, and lists the `debian-openssl-3.0.x` binary target.
2. Auth uses username and password instead of email. The starter's `Dummy` email sender is refused by `wasp build`, and a real one needs an email provider account. To go back to email auth, set up [an email sender](https://wasp.sh/docs/advanced/email) and copy the email pages from a fresh `wasp new -t basic` project.
3. `src/serverSetup.ts` and the `server` entry in `main.wasp.ts` were added, so one service can serve both the API and the client and recover its database connections after an idle pause.
4. `deploy/`, `scripts/e2e.mjs` and the GitHub workflow were added.

## Known limitations and workarounds

- **`DATABASE_URL` is reserved on Compute.** The platform sets it to a placeholder, and Wasp reads the connection string only from that variable. `deploy/start.ts` overwrites it inside the process with the real connection string before the Wasp server loads.
- **The client's API URL is fixed at build time.** Wasp compiles `REACT_APP_API_URL` into the client and requires an absolute URL, but the app's URL is only known once it is deployed. The build uses a placeholder and `deploy/start.ts` replaces it with the real URL when the service starts.
- **Database connections do not survive an idle pause.** Compute pauses a service that gets no requests. Without help, the first database query afterwards stalled for 10 to 30 seconds or failed with a connection pool timeout. `reconnectAfterIdle` in `src/serverSetup.ts` drops Prisma Client's connections when a request arrives after more than a minute of silence, which brought that first query down to under a second.
- **Migrations are checked each time the service boots.** With nothing to apply this takes about a second.
- **The deployed folder is about 280 MB.** It contains all production dependencies of Wasp's SDK, including packages only the client or tests use. Uploading it is most of the deploy time (roughly 1.5 to 2 minutes from a laptop, under a minute from GitHub Actions).
- **No WebSockets and no always-on process.** Compute does not support WebSocket servers yet, so Wasp's [web sockets](https://wasp.sh/docs/advanced/web-sockets) will not work. Wasp [jobs](https://wasp.sh/docs/advanced/jobs) rely on a process that keeps polling the database, which a scale-to-zero service does not provide. Neither feature is used here, and neither was tested.
- **`prisma dev` is not set up.** Use `wasp start` for local development.
- **Deploys can fail transiently.** Two of fourteen deploys during testing failed with a state-store `409` or an auth refresh error, and worked when run again.

## Versions this was tested with

Wasp 0.26.1, Prisma ORM 5.19.1 (pinned by Wasp), Prisma CLI 8.0.0-rc.33, `@prisma/composer` 0.38.0, Node.js 26.13.0 on macOS (Apple silicon). Compute ran the app on Bun 1.4.4.
