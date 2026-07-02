import { useEffect, useState, type CSSProperties } from "react";
import { Table, Tooltip, message } from "antd";
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

export default function Sessions() {
  const [filters, setFilters] = useState<FilterState>({});
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  // server-side pages: (re)load whenever filters or the page window change
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .listSessions({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
        ...filterToParams(filters),
      })
      .then((d) => {
        if (!alive) return;
        setItems(d.items ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters, page, pageSize]);

  return (
    <>
      <PageHeader eyebrow="Telemetry" title="Sessions" />

      {/* Sessions = focused browse filters; the full dimension set lives on Reports. */}
      <FacetFilterBar
        value={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1); // new filter -> back to page 1
        }}
        dims={["user", "agent", "project", "model", "status"]}
        showTokens={false}
        showError={false}
      />

      <Surface>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 25, 50, 100],
            onChange: (p, ps) => {
              setPage(ps !== pageSize ? 1 : p); // new page size -> back to page 1
              setPageSize(ps);
            },
          }}
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
              title: "#",
              key: "n",
              width: 56,
              render: (_: unknown, __: unknown, i: number) => (
                <span className="wd-mono" style={{ color: "var(--signal)" }}>
                  {(page - 1) * pageSize + i + 1}
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
              title: "Cost",
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
              render: (s: string, r: any) =>
                // hovering a "summarized" pill shows the full recap. Real tooltip, not a
                // native title - the browser one has a ~1s delay and doesn't wrap.
                r.narrative ? (
                  <Tooltip title={r.narrative} placement="left">
                    <span style={{ cursor: "help" }}>
                      <Pill tone={STATUS_TONE[s] ?? "muted"}>{s}</Pill>
                    </span>
                  </Tooltip>
                ) : (
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
      </Surface>
    </>
  );
}
