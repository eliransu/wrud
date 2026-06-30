import { Spin, Empty } from "antd";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell as PieCell,
} from "recharts";
import { api } from "../api";
import { useApi, LIVE_POLL_MS } from "../hooks";
import { useThemeMode } from "../theme-mode";
import { chartPalette } from "../theme";
import { PageHeader, StatTile, Surface } from "../ui";

/** Compact large numbers so a growing token count never blows out the tile: 803, 12.3K, 1.1M. */
const compact = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
import { Onboarding } from "../Onboarding";

function ago(iso?: string): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Overview() {
  const nav = useNavigate();
  const { mode } = useThemeMode();
  const c = chartPalette(mode);
  const STATUS_COLOR = c.status;
  const tick = {
    fill: c.tick,
    fontSize: 12,
    fontFamily: "JetBrains Mono Variable, monospace",
  };
  const { data, loading } = useApi(() => api.overview(), [], {
    pollMs: LIVE_POLL_MS,
  });
  const { data: sessions } = useApi(() => api.listSessions(), [], {
    pollMs: LIVE_POLL_MS,
  });

  if (loading || !data)
    return <Spin style={{ display: "block", marginTop: 80 }} />;

  if (data.sessions.total === 0)
    return (
      <>
        <PageHeader eyebrow="Mission control" title="Overview" />
        <Onboarding />
      </>
    );

  const totalCalls = data.models.reduce(
    (a: number, m: any) => a + (m.calls || 0),
    0,
  );
  const outTokens = data.models.reduce(
    (a: number, m: any) => a + (m.outputTokens || 0),
    0,
  );
  const modelData = data.models
    .map((m: any) => ({ name: m.model, calls: m.calls || 0 }))
    .sort((a: any, b: any) => b.calls - a.calls);
  const statusData = Object.entries(data.sessions.byStatus).map(
    ([name, value]) => ({ name, value: value as number }),
  );

  const items: any[] = sessions?.items ?? [];
  const agents = Object.entries(
    items.reduce((acc: Record<string, number>, s: any) => {
      const n = s.agent?.name ?? "unknown";
      acc[n] = (acc[n] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => (b[1] as number) - (a[1] as number));
  const maxAgent = Math.max(1, ...agents.map((a) => a[1] as number));
  const recent = items.slice(0, 7);

  return (
    <>
      <PageHeader eyebrow="Mission control" title="Overview" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16,
        }}
      >
        <StatTile label="Sessions" value={data.sessions.total} accent />
        <StatTile
          label="Model calls"
          value={totalCalls}
          format={compact}
          delay={60}
        />
        <StatTile
          label="Output tokens"
          value={outTokens}
          format={compact}
          delay={120}
        />
        <StatTile label="Lessons" value={data.lessons.total} delay={180} />
        <StatTile label="Models" value={data.models.length} delay={240} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        {/* recent activity - the live feed */}
        <Surface title="Recent sessions" delay={120}>
          {recent.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No sessions yet"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recent.map((s) => (
                <button
                  key={s.id}
                  onClick={() => nav(`/sessions/${s.id}`)}
                  className="wd-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 8px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      flexShrink: 0,
                      background: STATUS_COLOR[s.status] ?? "#8fa298",
                    }}
                  />
                  <span
                    style={{
                      color: "var(--ink)",
                      fontWeight: 600,
                      minWidth: 0,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.agent?.name ?? "unknown"}
                  </span>
                  <span
                    className="wd-mono"
                    style={{ fontSize: 11, color: "var(--muted)" }}
                  >
                    {(s.models && s.models[0]) || "-"}
                  </span>
                  <span
                    className="wd-mono"
                    style={{
                      fontSize: 11,
                      color: STATUS_COLOR[s.status] ?? "#8fa298",
                      width: 86,
                      textAlign: "right",
                    }}
                  >
                    {s.status}
                  </span>
                  <span
                    className="wd-mono"
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      width: 64,
                      textAlign: "right",
                    }}
                  >
                    {ago(s.startedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface title="Sessions by status" delay={180}>
          {statusData.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No sessions yet"
            />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={74}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {statusData.map((s) => (
                      <PieCell
                        key={s.name}
                        fill={STATUS_COLOR[s.name] ?? "#8fa298"}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  justifyContent: "center",
                  marginTop: 8,
                }}
              >
                {statusData.map((s) => (
                  <span
                    key={s.name}
                    className="wd-mono"
                    style={{
                      fontSize: 12,
                      color: "#8fa298",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: STATUS_COLOR[s.name] ?? "#8fa298",
                      }}
                    />
                    {s.name} - {s.value}
                  </span>
                ))}
              </div>
            </>
          )}
        </Surface>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <Surface title="Model usage - calls per model" delay={220}>
          {modelData.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No model usage yet"
            />
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(120, modelData.length * 52)}
            >
              <BarChart
                data={modelData}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <XAxis
                  type="number"
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: "rgba(182,242,78,0.06)" }} />
                <Bar dataKey="calls" radius={[0, 8, 8, 0]} barSize={18}>
                  {modelData.map((_: unknown, i: number) => (
                    <PieCell key={i} fill={i === 0 ? c.accent : c.accent2} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Surface>

        <Surface title="By agent" delay={260}>
          {agents.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No agents yet"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {agents.map(([name, count]) => (
                <div key={name}>
                  <div
                    className="wd-mono"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "var(--ink)",
                      marginBottom: 6,
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ color: "var(--muted)" }}>
                      {count as number}
                    </span>
                  </div>
                  <span
                    style={{
                      display: "block",
                      height: 8,
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        borderRadius: 4,
                        width: `${((count as number) / maxAgent) * 100}%`,
                        background: `linear-gradient(90deg, ${c.accentDim}, ${c.accent})`,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </>
  );
}
