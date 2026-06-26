import { Table } from "antd";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApi } from "../hooks";
import { PageHeader, Pill, Surface } from "../ui";

const STATUS_TONE: Record<string, string> = {
  open: "cyan",
  summarizing: "amber",
  summarized: "green",
  abandoned: "red",
};

export default function Sessions() {
  const { data, loading } = useApi(() => api.listSessions(), []);
  return (
    <>
      <PageHeader eyebrow="Telemetry" title="Sessions" />
      <Surface>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 12, hideOnSinglePage: true }}
          locale={{ emptyText: "No sessions yet" }}
          columns={[
            {
              title: "Session",
              dataIndex: "id",
              render: (id: string) => (
                <Link
                  to={`/sessions/${id}`}
                  className="wd-mono"
                  style={{ color: "var(--signal)" }}
                >
                  {id.slice(0, 8)}...
                </Link>
              ),
            },
            {
              title: "User",
              dataIndex: ["user", "id"],
              render: (u: string) => (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(182,242,78,0.14)",
                      color: "var(--signal)",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {(u ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  {u}
                </span>
              ),
            },
            {
              title: "Agent",
              dataIndex: ["agent", "name"],
              render: (a: string) => (
                <span className="wd-mono" style={{ fontSize: 13 }}>
                  {a}
                </span>
              ),
            },
            {
              title: "Model(s)",
              key: "models",
              render: (_: unknown, r: any) => {
                const models: string[] = r.models ?? [];
                if (models.length === 0)
                  return <span style={{ color: "var(--muted)" }}>-</span>;
                return (
                  <span
                    style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}
                  >
                    {models.map((m) => (
                      <span
                        key={m}
                        className="wd-mono"
                        title={m}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "var(--cyan)",
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </span>
                );
              },
            },
            {
              title: "Tokens (in / out)",
              key: "tokens",
              render: (_: unknown, r: any) => {
                const t = r.tokens ?? { input: 0, output: 0 };
                return (
                  <span className="wd-mono" style={{ fontSize: 12.5 }}>
                    <span style={{ color: "var(--muted)" }}>
                      {(t.input ?? 0).toLocaleString()}
                    </span>
                    <span style={{ color: "var(--muted)", margin: "0 6px" }}>
                      /
                    </span>
                    <span style={{ color: "var(--signal)" }}>
                      {(t.output ?? 0).toLocaleString()}
                    </span>
                  </span>
                );
              },
            },
            {
              title: "Status",
              dataIndex: "status",
              render: (s: string) => (
                <Pill tone={STATUS_TONE[s] ?? "muted"}>{s}</Pill>
              ),
            },
            {
              title: "Started",
              dataIndex: "startedAt",
              render: (t: string) => (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {new Date(t).toLocaleString()}
                </span>
              ),
            },
          ]}
        />
      </Surface>
    </>
  );
}
