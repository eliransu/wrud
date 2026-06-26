/** Thin browser client for the wrud API. Reads the API key from localStorage. */
// API origin resolution:
//  - explicit VITE_WRUD_API wins (Vite dev launcher, e2e harness)
//  - else in `vite dev` -> the conventional local API port
//  - else (a production `vite build`, e.g. the dashboard bundled into the CLI) -> same origin
//    as the server that served this page (empty base -> relative `/v1/...` URLs, no CORS)
const RAW = (import.meta as any).env?.VITE_WRUD_API as string | undefined;
const BASE: string =
  RAW != null
    ? RAW
    : (import.meta as any).env?.DEV
      ? "http://localhost:8787"
      : "";

const apiKey = () => localStorage.getItem("wrud_key") ?? "";
const headers = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${apiKey()}`,
  ...extra,
});

async function req(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(BASE + path, init);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${path} -> ${r.status} ${body}`);
  }
  return r.status === 204 ? null : r.json();
}

export const api = {
  overview: () => req("/v1/stats/overview", { headers: headers() }),
  listSessions: () => req("/v1/sessions", { headers: headers() }),
  getSession: (id: string) => req(`/v1/sessions/${id}`, { headers: headers() }),
  listEvents: (id: string) =>
    req(`/v1/sessions/${id}/events`, { headers: headers() }),
  listKeys: () => req("/v1/keys", { headers: headers() }),
  createKey: (name: string, scopes: string[]) =>
    req("/v1/keys", {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name, scopes }),
    }),
  revokeKey: (id: string) =>
    req(`/v1/keys/${id}`, { method: "DELETE", headers: headers() }),
  listLessons: () => req("/v1/lessons", { headers: headers() }),
};
