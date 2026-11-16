import { app, page, route } from "@wasp.sh/spec";
import { App } from "./src/App" with { type: "ref" };
import { LoginPage } from "./src/auth/LoginPage" with { type: "ref" };
import { SignupPage } from "./src/auth/SignupPage" with { type: "ref" };
import { reconnectAfterIdle, serveClient } from "./src/serverSetup" with { type: "ref" };
import { userSignupFields } from "./src/auth/userSignupFields" with { type: "ref" };
import { tagsSpec } from "./src/tags/tags.wasp";
import { tasksSpec } from "./src/tasks/task.wasp";

export default app({
  name: "waspPrismaCompute",
  wasp: { version: "^0.26.1" },
  title: "wasp-prisma-compute",
  head: ["<link rel='icon' href='/favicon.ico' />"],
  auth: {
    userEntity: "User",
    methods: {
      usernameAndPassword: {
        userSignupFields,
      },
    },
    onAuthSucceededRedirectTo: "/",
    onAuthFailedRedirectTo: "/login",
  },
  client: {
    rootComponent: App,
  },
  server: {
    setupFn: serveClient,
    middlewareConfigFn: reconnectAfterIdle,
  },
  spec: [
    tasksSpec,
    tagsSpec,
    route("LoginRoute", "/login", page(LoginPage)),
    route("SignupRoute", "/signup", page(SignupPage)),
  ],
});
