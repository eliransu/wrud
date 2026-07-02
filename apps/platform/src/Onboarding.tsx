import { useState } from "react";
import { message } from "antd";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";

/** A copyable shell command, styled like the marketing terminal. */
export function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      message.error("Copy failed - select and copy manually.");
    }
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(10,14,13,0.6)",
        fontFamily: "JetBrains Mono Variable, monospace",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--signal)" }}>$</span>
      <span style={{ color: "var(--ink)", flex: 1, overflowX: "auto" }}>
        {cmd}
      </span>
      <button
        onClick={copy}
        className="wd-mono"
        style={{
          cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "transparent",
          color: copied ? "var(--signal)" : "var(--muted)",
          borderRadius: 7,
          padding: "4px 10px",
          fontSize: 11,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {copied ? <CheckOutlined /> : <CopyOutlined />}
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

const Step = ({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) => (
  <div style={{ display: "flex", gap: 14 }}>
    <span
      className="wd-mono"
      style={{
        flexShrink: 0,
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: "1px solid rgba(182,242,78,0.4)",
        color: "var(--signal)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
      }}
    >
      {n}
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{title}</div>
      <div style={{ marginTop: 6, color: "var(--muted)", lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  </div>
);

/** Shown when there are no sessions yet - guide the user to wire their agent's hooks. */
export function Onboarding() {
  return (
    <div
      className="wd-card wd-rise"
      style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}
    >
      <div className="wd-eyebrow">Get started</div>
      <h2 style={{ fontSize: 26, margin: "8px 0 6px", fontWeight: 800 }}>
        No sessions yet - let's wire up your agent.
      </h2>
      <p style={{ color: "var(--muted)", marginTop: 0, lineHeight: 1.6 }}>
        The dashboard fills up as your agents work. wrud rides your agent's own
        hooks - nothing to instrument by hand.
      </p>

      <div style={{ display: "grid", gap: 22, marginTop: 26 }}>
        <Step n={1} title="Install the hooks">
          Wires every agent you have (Claude Code, Cursor, ...) in one go:
          <div style={{ marginTop: 10 }}>
            <CopyCmd cmd="npx @wrud/cli install-hooks" />
          </div>
        </Step>
        <Step n={2} title="Restart your agent">
          Agents load hooks at launch - fully quit and reopen Claude Code /
          Cursor so the new hooks take effect.
        </Step>
        <Step n={3} title="Work as usual">
          Send a prompt. Sessions stream in here automatically - this page is
          live and updates on its own.
        </Step>
      </div>

      <div
        className="wd-mono"
        style={{ marginTop: 26, fontSize: 12, color: "var(--muted)" }}
      >
        verify anytime with{" "}
        <span style={{ color: "var(--ink)" }}>npx @wrud/cli doctor</span>
      </div>
    </div>
  );
}
