import { Spin, Empty } from "antd";
import { BulbOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApi } from "../hooks";
import { PageHeader } from "../ui";

const SCOPE_TONE: Record<string, string> = {
  session: "#5be0d6",
  user: "#b6f24e",
  org: "#ffb454",
};

export default function Lessons() {
  const { data, loading } = useApi(() => api.listLessons(), []);
  if (loading) return <Spin style={{ display: "block", marginTop: 80 }} />;
  const items: any[] = data?.items ?? [];

  return (
    <>
      <PageHeader eyebrow="Memory" title="Lessons" />
      {items.length === 0 ? (
        <div className="wd-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No lessons yet — summarize a session to generate guidance."
          />
        </div>
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
                  borderColor: "rgba(255,255,255,0.08)",
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
