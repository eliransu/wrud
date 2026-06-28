/**
 * `wrud stop` - stop a running wrud server. Finds the process listening on WRUD_PORT and sends
 * it SIGTERM. mac/linux via `lsof`; on Windows (or if lsof is absent) it's a graceful no-op.
 * cleanup uses stopServers() too: a live server recreates ~/.wrud the instant it's deleted, so it
 * MUST be stopped before the data is removed.
 */
import { execSync } from "node:child_process";
import { PORT } from "./env.js";

/** PIDs listening on a TCP port (best-effort; empty if none / tool unavailable). */
function listenerPids(port: number): number[] {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/** Is a server currently listening on `port`? */
export const serverRunning = (port: number = PORT): boolean =>
  listenerPids(port).length > 0;

/** Stop wrud server(s) on `port`. Returns how many processes were signalled. */
export function stopServers(port: number = PORT): number {
  const pids = listenerPids(port);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone / not permitted */
    }
  }
  return pids.length;
}

export async function runStop(): Promise<number> {
  const n = stopServers();
  console.log(
    n > 0
      ? `wrud stop: stopped ${n} server${n === 1 ? "" : "s"} on :${PORT}.`
      : `wrud stop: no wrud server listening on :${PORT}.`,
  );
  return 0;
}
