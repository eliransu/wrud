import { Spin } from "antd";
import { BulbOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApi, LIVE_POLL_MS } from "../hooks";
import { PageHeader } from "../ui";

const SCOPE_TONE: Record<string, string> = {
  session: "#5be0d6",
  user: "#b6f24e",
  org: "#ffb454",
};

/** Educational empty state - explain what lessons are and how they appear, so the page teaches
 * instead of dead-ending. (Lessons are derived from insights, which need recurring patterns.) */
function NoLessons() {
  return (
    <div
      className="wd-card wd-rise"
      style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}
    >
      <div className="wd-eyebrow">Memory</div>
      <h2 style={{ fontSize: 24, margin: "8px 0 6px", fontWeight: 800 }}>
        No lessons yet - they appear as patterns emerge.
      </h2>
      <p style={{ color: "var(--muted)", marginTop: 0, lineHeight: 1.6 }}>
        Lessons turn your agent's recurring mistakes into short guidance you can
        feed back, so it stops repeating them. wrud writes one automatically
        when it spots a pattern across your summarized sessions - for example:
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {[
          [
            "Repeated errors",
            "The same command or migration fails across sessions - wrud captures the fix as a lesson.",
          ],
          [
            "Model right-sizing",
            "A frontier model keeps doing one-line work - wrud suggests dropping to a cheaper model.",
          ],
        ].map(([t, d]) => (
          <div
            key={t}
            style={{
              display: "flex",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid rgb(var(--ov) / 0.14)",
              background: "rgb(var(--ov) / 0.05)",
            }}
          >
            <BulbOutlined style={{ color: "var(--signal)", fontSize: 16 }} />
            <div>
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>{t}</div>
              <div
                style={{ color: "var(--muted)", marginTop: 4, lineHeight: 1.6 }}
              >
                {d}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        className="wd-mono"
        style={{ marginTop: 22, fontSize: 12, color: "var(--muted)" }}
      >
        keep working with your agent - this page is live and fills in on its
        own.
      </div>
    </div>
  );
}

export default function Lessons() {
  const { data, loading } = useApi(() => api.listLessons(), [], {
    pollMs: LIVE_POLL_MS,
  });
  if (loading) return <Spin style={{ display: "block", marginTop: 80 }} />;
  const items: any[] = data?.items ?? [];

  return (
    <>
      <PageHeader eyebrow="Memory" title="Lessons" />
      {items.length === 0 ? (
        <NoLessons />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((l, i) => {
            const tone = SCOPE_TONE[l.scope] ?? "#8fa298";
            return (
              <div
                key={l.id}
                className="wd-card wd-rise"
                style={{
                  animationDelay: `${i * 60}ms`,
                  borderLeft: `3px solid ${tone}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <BulbOutlined style={{ color: tone, fontSize: 16 }} />
                  <span
                    className="wd-mono"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: tone,
                    }}
                  >
                    {l.scope}
                  </span>
                  <span
                    className="wd-mono"
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginLeft: "auto",
                    }}
                  >
                    {l.source}
                  </span>
                </div>
                <div style={{ lineHeight: 1.6, color: "var(--ink)" }}>
                  {l.guidance}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
