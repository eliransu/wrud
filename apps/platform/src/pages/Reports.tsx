import { useMemo } from "react";
import { Table, Empty, Spin } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { api } from "../api";
import { useApi } from "../hooks";
import { useThemeMode } from "../theme-mode";
import { chartPalette } from "../theme";
import { PageHeader, StatTile, Surface, Pill } from "../ui";
import {
  FacetFilterBar,
  filterToParams,
  paramsToFilter,
  type FilterState,
} from "../FacetFilterBar";

const STATUS_TONE: Record<string, string> = {
  open: "cyan",
  summarizing: "amber",
  summarized: "green",
  abandoned: "red",
};

type Palette = ReturnType<typeof chartPalette>;
type FacetCount = { value: string; sessions: number };
const axisTick = (c: Palette) => ({
  fill: c.tick,
  fontSize: 12,
  fontFamily: "JetBrains Mono Variable, monospace",
});

/** Horizontal top-N bars for one dimension's aggregate. */
function TopBars({
  title,
  rows,
  delay,
  c,
}: {
  title: string;
  rows?: FacetCount[];
  delay?: number;
  c: Palette;
}) {
  const data = (rows ?? []).map((r) => ({
    name: r.value,
    sessions: r.sessions,
  }));
  return (
    <Surface title={title} delay={delay}>
      {data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(120, data.length * 40)}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 16 }}
          >
            <XAxis
              type="number"
              tick={axisTick(c)}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={axisTick(c)}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: "rgba(127,127,127,0.08)" }} />
            <Bar dataKey="sessions" radius={[0, 8, 8, 0]} barSize={16}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === 0 ? c.accent : c.accent2} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Surface>
  );
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode } = useThemeMode();
  const c = chartPalette(mode);
  // Filter state lives in the URL (shareable/bookmarkable; nothing persisted server-side).
  const filters = useMemo(() => paramsToFilter(searchParams), [searchParams]);
  const query = filterToParams(filters);
  const queryKey = JSON.stringify(query);

  const onChange = (next: FilterState) =>
    setSearchParams(filterToParams(next), { replace: true });

  const { data: agg, loading } = useApi<any>(
    () => api.reportSummary(query),
    [queryKey],
  );
  const { data: list } = useApi<any>(
    () => api.listSessions({ ...query, limit: "50" }),
    [queryKey],
  );

  const byDim = agg?.byDim ?? {};
  const trend = (agg?.trend ?? []).map((t: any) => ({
    date: t.date.slice(5),
    sessions: t.sessions,
  }));

  return (
    <>
      <PageHeader eyebrow="Insights" title="Reports" />

      <FacetFilterBar value={filters} onChange={onChange} />

      {loading && !agg ? (
        <Spin style={{ display: "block", marginTop: 40 }} />
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 16,
            }}
          >
            <StatTile label="Sessions" value={agg?.total ?? 0} accent />
            <StatTile
              label="Users"
              value={byDim.user?.length ?? 0}
              delay={60}
            />
            <StatTile
              label="Models"
              value={byDim.model?.length ?? 0}
              delay={120}
            />
            <StatTile
              label="Skills"
              value={byDim.skill?.length ?? 0}
              delay={180}
            />
            <StatTile
              label="Tools"
              value={byDim.tool?.length ?? 0}
              delay={240}
            />
          </div>

          <Surface
            title="Sessions over time"
            style={{ marginTop: 16 }}
            delay={80}
          >
            {trend.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No sessions match"
              />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trend} margin={{ left: 8, right: 16, top: 8 }}>
                  <XAxis
                    dataKey="date"
                    tick={axisTick(c)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={axisTick(c)}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="sessions"
                    stroke={c.accent}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Surface>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginTop: 16,
            }}
          >
            <TopBars title="Top models" rows={byDim.model} delay={120} c={c} />
            <TopBars
              title="Top projects"
              rows={byDim.project}
              delay={140}
              c={c}
            />
            <TopBars title="Top topics" rows={byDim.topic} delay={150} c={c} />
            <TopBars
              title="Categories"
              rows={byDim.category}
              delay={160}
              c={c}
            />
            <TopBars title="Top skills" rows={byDim.skill} delay={160} c={c} />
            <TopBars title="Top tools" rows={byDim.tool} delay={200} c={c} />
            <TopBars title="Top users" rows={byDim.user} delay={240} c={c} />
            <TopBars
              title="MCP extensions"
              rows={byDim.mcp}
              delay={280}
              c={c}
            />
            <TopBars title="Commands" rows={byDim.command} delay={320} c={c} />
          </div>

          <Surface
            title="Matching sessions"
            style={{ marginTop: 16 }}
            delay={200}
          >
            <Table
              rowKey="id"
              size="small"
              dataSource={list?.items ?? []}
              pagination={{ defaultPageSize: 10, hideOnSinglePage: true }}
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
                  title: "Models",
                  key: "models",
                  render: (_: unknown, r: any) => (
                    <span
                      className="wd-mono"
                      style={{ fontSize: 12, color: "var(--cyan)" }}
                    >
                      {(r.models ?? []).join(", ") || "-"}
                    </span>
                  ),
                },
                {
                  title: "Out tokens",
                  key: "tokens",
                  align: "right" as const,
                  render: (_: unknown, r: any) => (
                    <span
                      className="wd-mono"
                      style={{ fontSize: 12.5, color: "var(--signal)" }}
                    >
                      {(r.tokens?.output ?? 0).toLocaleString()}
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
              ]}
            />
          </Surface>
        </>
      )}
    </>
  );
}
