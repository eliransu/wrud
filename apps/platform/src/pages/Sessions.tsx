import { useEffect, useState } from "react";
import { Table, Button, message } from "antd";
import { Link } from "react-router-dom";
import { api } from "../api";
import { PageHeader, Pill, Surface } from "../ui";
import {
  FacetFilterBar,
  filterToParams,
  type FilterState,
} from "../FacetFilterBar";

const STATUS_TONE: Record<string, string> = {
  open: "cyan",
  summarizing: "amber",
  summarized: "green",
  abandoned: "red",
};

const PAGE = 25;

export default function Sessions() {
  const [filters, setFilters] = useState<FilterState>({});
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  const params = (extra: Record<string, string> = {}) => ({
    limit: String(PAGE),
    ...filterToParams(filters),
    ...extra,
  });

  // (re)load page 1 whenever filters change
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .listSessions(params())
      .then((d) => {
        if (!alive) return;
        setItems(d.items ?? []);
        setCursor(d.nextCursor ?? null);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadMore = () => {
    if (!cursor) return;
    setMore(true);
    api
      .listSessions(params({ cursor }))
      .then((d) => {
        setItems((prev) => [...prev, ...(d.items ?? [])]);
        setCursor(d.nextCursor ?? null);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setMore(false));
  };

  return (
    <>
      <PageHeader eyebrow="Telemetry" title="Sessions" />

      {/* Sessions = focused browse filters; the full dimension set lives on Reports. */}
      <FacetFilterBar
        value={filters}
        onChange={setFilters}
        dims={["user", "agent", "model", "status"]}
        showTokens={false}
        showError={false}
      />

      <Surface>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: "No sessions match" }}
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
                <span className="wd-mono" style={{ fontSize: 13 }}>
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
              title: "Events",
              dataIndex: "events",
              align: "right" as const,
              render: (n: number) => (
                <span className="wd-mono" style={{ fontSize: 13 }}>
                  {(n ?? 0).toLocaleString()}
                </span>
              ),
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
        {cursor && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Button onClick={loadMore} loading={more}>
              Load more
            </Button>
          </div>
        )}
      </Surface>
    </>
  );
}
