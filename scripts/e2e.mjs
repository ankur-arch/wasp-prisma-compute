// End-to-end smoke test against a running Wasp server.
//
//   node scripts/e2e.mjs <api-url>
//
// Signs a user up, logs in, then creates, reads, updates and deletes tasks
// through the same HTTP operations the React client calls. It leaves one task
// behind. To check that data survives a redeploy or restart, run it again as
// the same user and expect that task to still be there:
//
//   E2E_USERNAME=<username> node scripts/e2e.mjs <api-url>
const api = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "");
const returning = Boolean(process.env.E2E_USERNAME);
const username = process.env.E2E_USERNAME ?? `e2e-${Date.now()}`;
const password = process.env.E2E_PASSWORD ?? "correct-horse-battery-1";

let sessionId;

async function call(path, body) {
  const res = await fetch(api + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sessionId ? { authorization: `Bearer ${sessionId}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const op = async (name, args) => {
  const r = await call(`/operations/${name}`, { json: args ?? null });
  if (r.status !== 200) {
    throw new Error(`${name} -> ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data?.json;
};

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
}

console.log(`API: ${api}\nUser: ${username}\n`);

const up = await fetch(api + "/up");
check("GET /up", up.status === 200, `status ${up.status}`);

if (!returning) {
  const signup = await call("/auth/username/signup", { username, password });
  check("signup", signup.status === 200, `status ${signup.status}`);
}

const login = await call("/auth/username/login", { username, password });
if (login.status !== 200) {
  throw new Error(`login -> ${login.status} ${JSON.stringify(login.data)}`);
}
sessionId = login.data.sessionId;
check("login", Boolean(sessionId));

if (returning) {
  const before = await op("get-tasks");
  check(
    "tasks from the earlier run are still there",
    before.some((t) => t.description.startsWith("kept ")),
    `${before.length} tasks`,
  );
}

const unique = `e2e task ${Date.now()}`;
const created = await op("create-task", { description: unique, tagIds: [] });
check("create task", created?.description === unique, created?.id);

let tasks = await op("get-tasks");
check("read tasks", tasks.some((t) => t.id === created.id), `${tasks.length} tasks`);

await op("update-task-status", { id: created.id, isDone: true });
tasks = await op("get-tasks");
check("update task", tasks.find((t) => t.id === created.id)?.isDone === true);

const deleted = await op("delete-completed-tasks");
tasks = await op("get-tasks");
check(
  "delete task",
  !tasks.some((t) => t.id === created.id),
  `${deleted?.count} deleted`,
);

const keep = await op("create-task", { description: `kept ${unique}`, tagIds: [] });
check("create task that stays", Boolean(keep?.id), keep?.id);

const anon = await fetch(api + "/operations/get-tasks", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
check("unauthenticated call rejected", anon.status === 401, `status ${anon.status}`);

console.log(`\nUser for a later persistence check: E2E_USERNAME=${username}`);
