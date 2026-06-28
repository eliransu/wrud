import { useEffect, useMemo, useState } from "react";
import { Table, Input, Select, DatePicker, Button, message } from "antd";
import { Link } from "react-router-dom";
import { api } from "../api";
import { PageHeader, Pill, Surface } from "../ui";

const { RangePicker } = DatePicker;

const STATUS_TONE: Record<string, string> = {
  open: "cyan",
  summarizing: "amber",
  summarized: "green",
  abandoned: "red",
};

type Filters = {
  user?: string;
  agent?: string;
  model?: string;
  from?: string;
  to?: string;
};

const PAGE = 25;

export default function Sessions() {
  const [filters, setFilters] = useState<Filters>({});
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  const params = (extra: Record<string, string> = {}) => {
    const p: Record<string, string> = { limit: String(PAGE) };
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    return { ...p, ...extra };
  };

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

  // option lists derived from what's loaded (server still does the filtering)
  const agentOpts = useMemo(
    () => [...new Set(items.map((s) => s.agent?.name).filter(Boolean))],
    [items],
  );
  const modelOpts = useMemo(
    () => [...new Set(items.flatMap((s) => s.models ?? []).filter(Boolean))],
    [items],
  );
  const set = (patch: Filters) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <>
      <PageHeader eyebrow="Telemetry" title="Sessions" />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Input.Search
          placeholder="user"
          allowClear
          style={{ width: 160 }}
          defaultValue={filters.user}
          onSearch={(v) => set({ user: v || undefined })}
        />
        <Select
          placeholder="agent"
          allowClear
          style={{ width: 160 }}
          value={filters.agent}
          onChange={(v) => set({ agent: v || undefined })}
          options={[
            "claude-code",
            "cursor",
            ...agentOpts.filter((a) => a !== "claude-code" && a !== "cursor"),
          ].map((a) => ({ value: a, label: a }))}
        />
        <Select
          placeholder="model"
          allowClear
          showSearch
          style={{ width: 200 }}
          value={filters.model}
          onChange={(v) => set({ model: v || undefined })}
          options={modelOpts.map((m) => ({ value: m, label: m }))}
        />
        <RangePicker
          onChange={(d) =>
            set({
              from: d?.[0]?.startOf("day").toISOString(),
              to: d?.[1]?.endOf("day").toISOString(),
            })
          }
        />
      </div>

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
