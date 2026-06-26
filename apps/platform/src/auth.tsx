import { createContext, useContext, useState, type ReactNode } from "react";
import { Button, Input } from "antd";

const STORAGE_KEY = "wrud_key";

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
