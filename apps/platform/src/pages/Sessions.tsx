import { useEffect, useState, type CSSProperties } from "react";
import { Table, Button, message } from "antd";
import { useNavigate } from "react-router-dom";
import { formatApproxUsd } from "@wrud/shared/pricing";
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

/** Small model chip - theme-aware (rgb(var(--ov)) works on both light + dark). */
const chip: CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 6,
  background: "rgb(var(--ov) / 0.06)",
  border: "1px solid rgb(var(--ov) / 0.12)",
  color: "var(--cyan)",
  whiteSpace: "nowrap",
};

const PAGE = 25;

export default function Sessions() {
  const [filters, setFilters] = useState<FilterState>({});
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const nav = useNavigate();

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
        dims={["user", "agent", "project", "model", "status"]}
        showTokens={false}
        showError={false}
      />

      <Surface>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={false}
          // wider than the card? scroll inside it instead of bleeding past the border
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No sessions match" }}
          // whole row navigates to the session (not just the id cell)
          onRow={(r: any) => ({
            onClick: () => nav(`/sessions/${r.id}`),
            style: { cursor: "pointer" },
          })}
          columns={[
            {
              title: "Session",
              dataIndex: "id",
              render: (id: string) => (
                <span className="wd-mono" style={{ color: "var(--signal)" }}>
                  {id.slice(0, 8)}...
                </span>
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
              title: "Summary",
              key: "summary",
              render: (_: unknown, r: any) => {
                // Cell = topic label (or the recap itself); native-title popover = the
                // full summarized content (falls back to the first prompt pre-summary).
                const full = r.narrative ?? r.context;
                const label = r.topic ?? full;
                if (!label)
                  return <span style={{ color: "var(--muted)" }}>-</span>;
                return (
                  <span
                    className="wd-mono"
                    title={full ?? undefined}
                    style={{
                      fontSize: 12,
                      display: "inline-block",
                      maxWidth: 260,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      verticalAlign: "middle",
                    }}
                  >
                    {label}
                  </span>
                );
              },
            },
            {
              title: "Model(s)",
              key: "models",
              render: (_: unknown, r: any) => {
                const models: string[] = r.models ?? [];
                if (models.length === 0)
                  return <span style={{ color: "var(--muted)" }}>-</span>;
                const rest = models.length - 1;
                // one line, fixed height: first model + a "+N" popover for the rest
                return (
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      className="wd-mono"
                      title={models[0]}
                      style={{
                        ...chip,
                        maxWidth: 150,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {models[0]}
                    </span>
                    {rest > 0 && (
                      <span
                        className="wd-mono"
                        title={models.slice(1).join("\n")}
                        style={chip}
                      >
                        +{rest}
                      </span>
                    )}
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
              title: "~$",
              dataIndex: "estCostUsd",
              align: "right" as const,
              render: (v: number | null | undefined) => (
                <span
                  className="wd-mono"
                  style={{
                    fontSize: 12.5,
                    color: v == null ? "var(--muted)" : "var(--amber)",
                  }}
                >
                  {formatApproxUsd(v)}
                </span>
              ),
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
                <span
                  style={{
                    color: "var(--muted)",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
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
