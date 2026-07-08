import { useState, type CSSProperties } from "react";
import { Checkbox, Popover, Table, Tooltip } from "antd";
import { ControlOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { formatApproxUsd } from "@wrud/shared/pricing";
import { api } from "../api";
import { useApi, LIVE_POLL_MS } from "../hooks";
import { PageHeader, StatusTag, Surface } from "../ui";
import {
  FacetFilterBar,
  filterToParams,
  type FilterState,
} from "../FacetFilterBar";

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

/** One line, fixed height: first value + a "+N" popover for the rest (the models pattern). */
function ChipList({ values, color }: { values?: string[]; color?: string }) {
  if (!values?.length) return <span style={{ color: "var(--muted)" }}>-</span>;
  const style = color ? { ...chip, color } : chip;
  const rest = values.length - 1;
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
        title={values[0]}
        style={{
          ...style,
          maxWidth: 150,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {values[0]}
      </span>
      {rest > 0 && (
        <span
          className="wd-mono"
          title={values.slice(1).join("\n")}
          style={style}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

// Column visibility: the base set matches the classic table; extras are hidden until
// picked. The chosen set persists per browser in localStorage.
const COLS_STORE = "wrud_sessions_cols";
const DEFAULT_COLS = [
  "user",
  "agent",
  "models",
  "events",
  "tokens",
  "cost",
  "status",
  "started",
];

function loadCols(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_STORE) || "");
    if (Array.isArray(v) && v.length) return v;
  } catch {
    /* no stored choice */
  }
  return DEFAULT_COLS;
}

export default function Sessions() {
  const [filters, setFilters] = useState<FilterState>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [cols, setCols] = useState<string[]>(loadCols);
  const nav = useNavigate();

  const pickCols = (next: string[]) => {
    setCols(next);
    localStorage.setItem(COLS_STORE, JSON.stringify(next));
  };

  // server-side pages: (re)load whenever filters or the page window change,
  // plus silent live polling so open sessions tick (tokens/cost/events).
  const { data, loading } = useApi(
    () =>
      api.listSessions({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
        ...filterToParams(filters),
      }),
    [filters, page, pageSize],
    { pollMs: LIVE_POLL_MS },
  );
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  // Every column carries a key; visibility filters on it ("#" is always shown).
  const allColumns = [
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
      key: "user",
      dataIndex: ["user", "id"],
      render: (u: string) => (
        <span className="wd-mono" style={{ fontSize: 13 }}>
          {u}
        </span>
      ),
    },
    {
      title: "Agent",
      key: "agent",
      dataIndex: ["agent", "name"],
      render: (a: string) => (
        <span className="wd-mono" style={{ fontSize: 13 }}>
          {a}
        </span>
      ),
    },
    {
      title: "Project",
      key: "project",
      render: (_: unknown, r: any) => {
        const p = String(r.runtime?.cwd ?? "")
          .split(/[\\/]/)
          .filter(Boolean)
          .pop();
        return p ? (
          <span
            className="wd-mono"
            title={r.runtime?.cwd}
            style={{ fontSize: 13 }}
          >
            {p}
          </span>
        ) : (
          <span style={{ color: "var(--muted)" }}>-</span>
        );
      },
    },
    {
      title: "Model(s)",
      key: "models",
      render: (_: unknown, r: any) => <ChipList values={r.models} />,
    },
    {
      title: "Skills",
      key: "skills",
      render: (_: unknown, r: any) => (
        <ChipList values={r.skills} color="#b6f24e" />
      ),
    },
    {
      title: "Sub-agents",
      key: "subagents",
      render: (_: unknown, r: any) => (
        <ChipList values={r.subagents} color="#7aa2ff" />
      ),
    },
    {
      title: "Events",
      key: "events",
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
            <span style={{ color: "var(--muted)", margin: "0 6px" }}>/</span>
            <span style={{ color: "var(--signal)" }}>
              {(t.output ?? 0).toLocaleString()}
            </span>
          </span>
        );
      },
    },
    {
      title: "Cost",
      key: "cost",
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
      title: "Topic",
      key: "topic",
      dataIndex: "topic",
      render: (t: string | null) =>
        t ? (
          <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>{t}</span>
        ) : (
          <span style={{ color: "var(--muted)" }}>-</span>
        ),
    },
    {
      title: "Category",
      key: "category",
      dataIndex: "category",
      render: (c: string | null) =>
        c ? (
          <span className="wd-mono" style={chip}>
            {c}
          </span>
        ) : (
          <span style={{ color: "var(--muted)" }}>-</span>
        ),
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      render: (s: string, r: any) =>
        // hovering a "summarized" pill shows the full recap. Real tooltip, not a
        // native title - the browser one has a ~1s delay and doesn't wrap.
        r.narrative ? (
          <Tooltip title={r.narrative} placement="left">
            <span style={{ cursor: "help" }}>
              <StatusTag status={s} />
            </span>
          </Tooltip>
        ) : (
          <StatusTag status={s} />
        ),
    },
    {
      title: "Started",
      key: "started",
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
  ];

  const picker = (
    <div style={{ display: "grid", gap: 6 }}>
      {allColumns
        .filter((c) => c.key !== "n")
        .map((c) => (
          <Checkbox
            key={c.key}
            checked={cols.includes(c.key)}
            onChange={(e) =>
              pickCols(
                e.target.checked
                  ? [...cols, c.key]
                  : cols.filter((k) => k !== c.key),
              )
            }
          >
            {String(c.title)}
          </Checkbox>
        ))}
    </div>
  );

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
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 8,
          }}
        >
          <Popover content={picker} trigger="click" placement="bottomRight">
            <button
              className="wd-mono"
              style={{
                ...chip,
                cursor: "pointer",
                font: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              title="Choose columns"
            >
              <ControlOutlined /> Columns
            </button>
          </Popover>
        </div>
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
          columns={allColumns.filter(
            (c) => c.key === "n" || cols.includes(c.key),
          )}
        />
      </Surface>
    </>
  );
}
