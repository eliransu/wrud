/**
 * `wrud doctor` - proves the whole capture path works with the CONFIGURED server + token, and
 * tells you exactly what's wrong if it doesn't. Replaces hand-tracing auth-middleware.ts /
 * routes-keys.ts to discover the scope model: it just exercises create->append->summarize->read
 * and prints PASS/FAIL + the HTTP status for each, plus the DB, base URL, and token in use.
 */
import { BASE, DB, http, resolveIngestToken } from "./env.js";

function line(ok: boolean, label: string, detail = ""): void {
  console.log(
    `  [${ok ? "PASS" : "FAIL"}]  ${label}${detail ? "  " + detail : ""}`,
  );
}

export async function runDoctor(): Promise<number> {
  console.log("wrud doctor");
  console.log(`  server : ${BASE}`);
  console.log(`  db     : ${DB}`);
  const token = resolveIngestToken();
  console.log(
    `  token  : ${token ? token.slice(0, 16) + "..." : "(none found)"}\n`,
  );

  let fail = 0;
  const bad = () => fail++;

  // 1) server reachable
  const health = await http("GET", "/health");
  line(
    health.ok,
    "server reachable",
    health.ok
      ? `HTTP ${health.status}`
      : health.error || `HTTP ${health.status}`,
  );
  if (!health.ok) {
    bad();
    console.log("\n  -> Start the server first:  npx @wrud/cli\n");
    return 1;
  }

  // 2) token present
  if (!token) {
    line(false, "ingest token present", "none - run `wrud install-hooks`");
    console.log(
      "\n  -> No token configured. Run `wrud install-hooks` (or set WRUD_API_KEY).\n",
    );
    return 1;
  }

  // 3) create session (ingest scope)
  const created = await http("POST", "/v1/sessions", token, {
    user: { id: "wrud-doctor" },
    agent: { name: "wrud-doctor" },
    metadata: { doctor: true },
  });
  line(created.ok, "create session (ingest scope)", `HTTP ${created.status}`);
  if (!created.ok) {
    bad();
    if (created.status === 401 || created.status === 403)
      console.log(
        "\n  -> The token works but lacks the `ingest` scope (this looks like a read/dashboard token).\n    Run `wrud install-hooks` to mint an ingest key, or check you're pointed at the right server/DB.\n",
      );
    return 1;
  }
  const id = created.json.sessionId as string;

  // 4) append an event
  const appended = await http("POST", `/v1/sessions/${id}/events`, token, {
    events: [
      {
        id: `${id}-0`,
        sessionId: id,
        seq: 0,
        timestamp: new Date().toISOString(),
        type: "tool_call",
        payload: { name: "wrud-doctor", ok: true },
      },
    ],
  });
  line(appended.ok, "append event", `HTTP ${appended.status}`);
  if (!appended.ok) bad();

  // 5) summarize
  const summarized = await http("POST", `/v1/sessions/${id}/summarize`, token, {
    mode: "server",
  });
  line(summarized.ok, "summarize", `HTTP ${summarized.status}`);
  if (!summarized.ok) bad();

  // 6) read back - read scope. A hooks token is intentionally ingest-ONLY, so a 401/403 here
  // is EXPECTED and fine (the dashboard uses a read/admin token); only a real error counts.
  const read = await http("GET", `/v1/sessions/${id}`, token);
  if (read.ok) {
    line(true, "read back (read scope)", `HTTP ${read.status}`);
  } else if (read.status === 401 || read.status === 403) {
    console.log(
      `  [INFO]  read back: token is ingest-only (HTTP ${read.status}); fine for hooks (dashboard uses a read/admin token)`,
    );
  } else {
    line(false, "read back (read scope)", `HTTP ${read.status}`);
    bad();
  }

  console.log(
    fail === 0
      ? "\n  All checks passed. Capture is working end-to-end.\n"
      : `\n  ${fail} check(s) failed.\n`,
  );
  return fail === 0 ? 0 : 1;
}
