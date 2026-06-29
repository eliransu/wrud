import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { App, Button, Input } from "antd";

const STORAGE_KEY = "wrud_key";

// `npx @wrud/cli` opens the dashboard at /?key=<token>. Adopt it, persist it, and strip it
// from the URL immediately so the token never lingers in the address bar, history, or a share.
(function adoptKeyFromUrl() {
  try {
    const u = new URL(window.location.href);
    const k = u.searchParams.get("key");
    if (!k) return;
    localStorage.setItem(STORAGE_KEY, k);
    u.searchParams.delete("key");
    window.history.replaceState({}, "", u.pathname + u.search + u.hash);
  } catch {
    /* non-browser or malformed URL - ignore */
  }
})();

interface AuthValue {
  apiKey: string;
  setApiKey: (k: string) => void;
  clear: () => void;
}
const Ctx = createContext<AuthValue | null>(null);
export const useAuth = (): AuthValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { message } = App.useApp();
  const [apiKey, setKey] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  );
  const setApiKey = (k: string) => {
    localStorage.setItem(STORAGE_KEY, k);
    setKey(k);
  };
  const clear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setKey("");
  };

  // A 401/403 from any API call means the stored key is missing, revoked, or wrong -
  // drop it and fall back to the Connect screen (api.ts dispatches this event).
  useEffect(() => {
    const onUnauthorized = () =>
      setKey((cur) => {
        if (cur) message.error("Your API key was rejected - please reconnect.");
        localStorage.removeItem(STORAGE_KEY);
        return "";
      });
    window.addEventListener("wrud:unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("wrud:unauthorized", onUnauthorized);
  }, [message]);

  return (
    <Ctx.Provider value={{ apiKey, setApiKey, clear }}>{children}</Ctx.Provider>
  );
}

/** Branded full-screen splash that gates the app until a key is provided. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { apiKey, setApiKey } = useAuth();
  const [draft, setDraft] = useState("");
  if (apiKey) return <>{children}</>;
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div className="wd-rise" style={{ width: 460, maxWidth: "100%" }}>
        <div className="wd-brand" style={{ fontSize: 40 }}>
          <img className="wd-mascot" src="/wrud-mascot.png" alt="" />
          wrud
        </div>
        <div className="wd-eyebrow" style={{ marginTop: 14 }}>
          What R U Doing - agent session telemetry
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "26px 0 6px" }}>
          Connect your instrument.
        </h1>
        <p
          style={{
            color: "var(--muted)",
            marginTop: 0,
            marginBottom: 22,
            lineHeight: 1.6,
          }}
        >
          Paste an API key (admin scope to manage keys and read every session).
          It stays in this browser and is sent only to your wrud server.
        </p>
        <Input.Password
          size="large"
          aria-label="api-key"
          placeholder="wrud_sk_local_..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={() => draft.trim() && setApiKey(draft.trim())}
          style={{ fontFamily: "var(--mono)" }}
        />
        <Button
          type="primary"
          size="large"
          block
          disabled={!draft.trim()}
          onClick={() => setApiKey(draft.trim())}
          style={{ marginTop: 14, height: 46, fontSize: 15 }}
        >
          Connect
        </Button>
      </div>
    </div>
  );
}
