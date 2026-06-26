import { Spin, Empty } from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Cell as PieCell,
} from "recharts";
import { api } from "../api";
import { useApi } from "../hooks";
import { PageHeader, StatTile, Surface } from "../ui";

const STATUS_COLOR: Record<string, string> = {
  summarized: "#b6f24e",
  open: "#5be0d6",
  abandoned: "#ff6b6b",
};
const tick = {
  fill: "#8fa298",
  fontSize: 12,
  fontFamily: "JetBrains Mono, monospace",
};

export default function Overview() {
  const { data, loading } = useApi(() => api.overview(), []);
  if (loading || !data)
    return <Spin style={{ display: "block", marginTop: 80 }} />;

  const modelData = data.models.map((m: any) => ({
    name: m.model.replace("claude-", ""),
    tokens: m.outputTokens,
  }));
  const statusData = Object.entries(data.sessions.byStatus).map(
    ([name, value]) => ({ name, value: value as number }),
  );
  const insightEntries = Object.entries(data.insights.byType) as [
    string,
    number,
  ][];

  return (
    <>
      <PageHeader eyebrow="Mission control" title="Overview" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        <StatTile
          label="Sessions"
          value={data.sessions.total}
          accent
          delay={0}
        />
        <StatTile label="Signals" value={data.insights.total} delay={60} />
        <StatTile label="Lessons" value={data.lessons.total} delay={120} />
        <StatTile label="Models used" value={data.models.length} delay={180} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <Surface title="Model output tokens" delay={120}>
          {modelData.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No model usage yet"
            />
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(140, modelData.length * 56)}
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
                  width={140}
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: "rgba(182,242,78,0.06)" }} />
                <Bar dataKey="tokens" radius={[0, 8, 8, 0]} barSize={20}>
                  {modelData.map((_: unknown, i: number) => (
                    <Cell key={i} fill={i === 0 ? "#b6f24e" : "#5be0d6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    innerRadius={52}
                    outerRadius={78}
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

      <div style={{ marginTop: 16 }}>
        <Surface title="Signals - insights by type" delay={240}>
          {insightEntries.length === 0 ? (
            <span style={{ color: "var(--muted)" }}>
              No signals yet - summarize a session to surface insights.
            </span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {insightEntries.map(([type, count]) => (
                <div
                  key={type}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,180,84,0.25)",
                    background:
                      "linear-gradient(180deg, rgba(255,180,84,0.07), transparent)",
                  }}
                >
                  <span
                    className="wd-mono"
                    style={{
                      fontSize: 26,
                      fontWeight: 600,
                      color: "var(--amber)",
                    }}
                  >
                    {count}
                  </span>
                  <span
                    className="wd-mono"
                    style={{ fontSize: 12, color: "var(--ink)" }}
                  >
                    {type}
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
