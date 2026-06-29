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
      ? "http://localhost:11190"
      : "";

const apiKey = () => localStorage.getItem("wrud_key") ?? "";
const headers = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${apiKey()}`,
  ...extra,
});

async function req(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(BASE + path, init);
  if (!r.ok) {
    // Bad/expired/insufficient key -> drop it and bounce to the Connect screen.
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem("wrud_key");
      window.dispatchEvent(new Event("wrud:unauthorized"));
    }
    const body = await r.text().catch(() => "");
    throw new Error(`${path} -> ${r.status} ${body}`);
  }
  return r.status === 204 ? null : r.json();
}

export const api = {
  overview: () => req("/v1/stats/overview", { headers: headers() }),
  listSessions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== ""),
    ).toString();
    return req(`/v1/sessions${qs ? "?" + qs : ""}`, { headers: headers() });
  },
  facets: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== ""),
    ).toString();
    return req(`/v1/facets${qs ? "?" + qs : ""}`, { headers: headers() });
  },
  reportSummary: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== ""),
    ).toString();
    return req(`/v1/reports/summary${qs ? "?" + qs : ""}`, {
      headers: headers(),
    });
  },
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
