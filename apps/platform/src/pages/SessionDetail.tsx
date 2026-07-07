import { useState } from "react";
import { useParams } from "react-router-dom";
import { Spin, Table, Empty, Tag } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { estimateCostUsd, formatApproxUsd } from "@wrud/shared/pricing";
import { api } from "../api";
import { useApi, LIVE_POLL_MS } from "../hooks";
import { PageHeader, StatTile, StatusTag, Surface } from "../ui";
import { JsonTree, parseMaybe } from "../JsonTree";
import { extractSkills } from "../skills";
import SkillModal from "../SkillModal";

// Per-event-type presentation for the event log.
const TYPE_META: Record<string, { label: string; color: string }> = {
  tool_call: { label: "tool", color: "#5be0d6" },
  model_use: { label: "model", color: "#ffb454" },
  message: { label: "message", color: "#b6f24e" },
  file_change: { label: "file", color: "#7aa2ff" },
  error: { label: "error", color: "#ff6b6b" },
  custom: { label: "custom", color: "#9fb0a6" },
};

/** The "what" - the salient target/name for each event type. */
function eventName(e: any): string {
  const p = e.payload ?? {};
  switch (e.type) {
    case "tool_call":
      return p.name ?? "";
    case "model_use":
      return p.model ?? "";
    case "file_change":
      return `${p.op ?? ""} ${p.path ?? ""}`.trim();
    case "message":
      return p.role ?? "";
    case "error":
      return p.kind ?? "error";
    case "custom":
      return p.name ?? "";
    default:
      return "";
  }
}

/** A short one-line preview (never the full JSON). */
function eventPreview(e: any): string {
  const p = e.payload ?? {};
  const clip = (s: string, n = 90) =>
    s.length > n ? s.slice(0, n) + "..." : s;
  switch (e.type) {
    case "tool_call":
      return clip(
        typeof p.input === "string" ? p.input : JSON.stringify(p.input ?? {}),
      );
    case "message":
      return clip(p.text ?? `${p.chars ?? 0} chars`);
    case "model_use":
      return `${(p.inputTokens ?? 0).toLocaleString()} in / ${(p.outputTokens ?? 0).toLocaleString()} out tokens${p.calls && p.calls > 1 ? ` (${p.calls.toLocaleString()} calls)` : ""}${p.task ? ` - ${clip(p.task, 50)}` : ""}`;
    case "error":
      return clip(p.message ?? "");
    case "custom":
      return clip(JSON.stringify(p.data ?? {}));
    default:
      return "";
  }
}

/** Expanded-row detail - tool calls show Call (input) vs Response (output) side by side. */
function EventDetail({ event }: { event: any }) {
  const p = event.payload ?? {};
  if (event.type === "tool_call") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="wd-io call">
          <div className="h">Call - input</div>
          {p.input == null ? (
            <span style={{ color: "var(--muted)" }}>-</span>
          ) : (
            <JsonTree data={parseMaybe(p.input)} />
          )}
        </div>
        <div className="wd-io resp">
          <div className="h">
            Response - output{" "}
            {p.ok === false ? <Tag color="red">failed</Tag> : null}
          </div>
          {p.output == null ? (
            <span style={{ color: "var(--muted)" }}>-</span>
          ) : (
            <JsonTree data={parseMaybe(p.output)} />
          )}
        </div>
      </div>
    );
  }
  if (event.type === "message") {
    return (
      <div className="wd-io">
        <div className="h">
          {p.role} message - {p.chars ?? 0} chars
        </div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {p.text ?? (
            <span style={{ color: "var(--muted)" }}>(text not captured)</span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="wd-io">
      <div className="h">{event.type} payload</div>
      <JsonTree data={p} />
    </div>
  );
}

export default function SessionDetail() {
  const { id = "" } = useParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const { data, loading } = useApi(() => api.getSession(id), [id], {
    pollMs: LIVE_POLL_MS,
  });
  // Event log pages server-side, newest first.
  const { data: events } = useApi(
    () =>
      api.listEvents(id, {
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
        order: "desc",
      }),
    [id, page, pageSize],
    { pollMs: LIVE_POLL_MS },
  );
  // Skills scan needs the whole stream, not the visible page.
  // ponytail: caps at the route max (1000 events); move extraction server-side if sessions outgrow it.
  const { data: skillEvents } = useApi(
    () => api.listEvents(id, { limit: "1000" }),
    [id],
    { pollMs: LIVE_POLL_MS },
  );
  if (loading || !data)
    return <Spin style={{ display: "block", marginTop: 80 }} />;

  const { session, summary } = data;
  const cost = summary ? estimateCostUsd(summary.stats.models) : null;
  const tokens = (summary?.stats.models ?? []).reduce(
    (acc: { in: number; out: number }, m: any) => ({
      in: acc.in + (m.inputTokens ?? 0),
      out: acc.out + (m.outputTokens ?? 0),
    }),
    { in: 0, out: 0 },
  );
  return (
    <>
      <PageHeader
        eyebrow="Session"
        title={`${id.slice(0, 8)}...`}
        extra={<StatusTag status={session.status} />}
      />

      <Surface title="Context">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
          }}
        >
          {[
            ["User", session.user.id],
            ["Agent", session.agent.name],
            ["Started", new Date(session.startedAt).toLocaleString()],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="wd-eyebrow">{k}</div>
              <div className="wd-mono" style={{ marginTop: 6, fontSize: 14 }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </Surface>

      {(() => {
        const { skills, extensions } = extractSkills(skillEvents?.items);
        if (skills.length === 0 && extensions.length === 0) return null;
        // skills are clickable (detail modal); MCP extensions have no local source file
        const chip = (label: string, color: string, onClick?: () => void) => (
          <button
            key={label}
            className="wd-mono"
            onClick={onClick}
            disabled={!onClick}
            style={{
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 8,
              border: `1px solid ${color}55`,
              background: `${color}14`,
              color,
              cursor: onClick ? "pointer" : "default",
              font: "inherit",
            }}
            title={onClick ? "View source & run" : undefined}
          >
            {label}
          </button>
        );
        return (
          <Surface
            title="Skills & commands used"
            style={{ marginTop: 16 }}
            delay={40}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {skills.map((s) => chip(s, "#b6f24e", () => setOpenSkill(s)))}
              {extensions.map((e) => chip(e, "#9b8cff"))}
            </div>
          </Surface>
        );
      })()}

      {openSkill && (
        <SkillModal name={openSkill} onClose={() => setOpenSkill(null)} />
      )}

      {summary ? (
        <>
          {summary.narrative && (
            <Surface
              title="Narrative"
              style={{ marginTop: 16, borderColor: "rgba(91,224,214,0.25)" }}
              delay={60}
            >
              <p style={{ margin: 0, lineHeight: 1.7, color: "var(--ink)" }}>
                {summary.narrative}
              </p>
            </Surface>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cost != null ? 4 : 3}, 1fr)`,
              gap: 16,
              marginTop: 16,
            }}
          >
            <StatTile label="Events" value={summary.stats.eventCount} accent />
            <StatTile
              label="Duration (s)"
              value={Math.round(summary.stats.durationMs / 1000)}
              delay={60}
            />
            <StatTile
              label="Tools"
              value={Object.keys(summary.stats.toolCalls).length}
              delay={120}
            />
            {cost != null && (
              // useCountUp animates integers - feed cents, format back to ~$.
              <StatTile
                label="~$ cost"
                value={Math.round(cost * 100)}
                format={(n) => formatApproxUsd(n / 100)}
                delay={180}
              />
            )}
          </div>

          <Surface title="Models" style={{ marginTop: 16 }} delay={120}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {summary.stats.models.length === 0 ? (
                <span style={{ color: "var(--muted)" }}>
                  No model usage recorded.
                </span>
              ) : (
                summary.stats.models.map((m: any) => {
                  const mCost = estimateCostUsd([m]);
                  return (
                    <span
                      key={m.model}
                      className="wd-mono"
                      style={{
                        fontSize: 12.5,
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {m.model} -{" "}
                      <span style={{ color: "var(--signal)" }}>
                        {m.outputTokens}
                      </span>{" "}
                      out tok
                      {mCost != null && (
                        <>
                          {" "}
                          -{" "}
                          <span style={{ color: "var(--amber)" }}>
                            {formatApproxUsd(mCost)}
                          </span>
                        </>
                      )}
                    </span>
                  );
                })
              )}
            </div>
            {summary.stats.models.length > 0 && (
              <div
                className="wd-mono"
                style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)" }}
              >
                {tokens.in.toLocaleString()} tokens in -{" "}
                {tokens.out.toLocaleString()} tokens out
              </div>
            )}
          </Surface>

          <Surface title="Signals" style={{ marginTop: 16 }} delay={180}>
            {summary.insights.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No insights for this session"
              />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {summary.insights.map((i: any, idx: number) => (
                  <div key={idx} className="wd-insight">
                    <WarningOutlined className="icon" />
                    <div>
                      <div className="t">{i.title}</div>
                      <div className="d">{i.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </>
      ) : (
        <Surface style={{ marginTop: 16 }}>
          <span style={{ color: "var(--amber)" }}>Not summarized yet.</span>
        </Surface>
      )}

      <Surface title="Event log" style={{ marginTop: 16 }} delay={240}>
        <Table
          rowKey="id"
          size="small"
          // newest events first (LIFO) - the server pages & sorts (order=desc)
          dataSource={events?.items ?? []}
          // wider than the card? scroll inside it instead of bleeding past the border
          scroll={{ x: "max-content" }}
          pagination={{
            current: page,
            pageSize,
            total: events?.total ?? 0,
            hideOnSinglePage: true,
            showSizeChanger: true,
            pageSizeOptions: [10, 15, 25, 50, 100],
            onChange: (p, ps) => {
              setPage(ps !== pageSize ? 1 : p); // new page size -> back to page 1
              setPageSize(ps);
            },
          }}
          locale={{ emptyText: "No events" }}
          expandable={{
            expandedRowRender: (e: any) => <EventDetail event={e} />,
            rowExpandable: () => true,
          }}
          columns={[
            {
              title: "#",
              dataIndex: "seq",
              width: 56,
              render: (s: number) => (
                <span className="wd-mono" style={{ color: "var(--muted)" }}>
                  {s}
                </span>
              ),
            },
            {
              title: "Type",
              dataIndex: "type",
              width: 130,
              render: (t: string) => {
                const m = TYPE_META[t] ?? { label: t, color: "#9fb0a6" };
                return (
                  <span
                    className="wd-mono"
                    style={{
                      color: m.color,
                      fontSize: 12.5,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 2,
                        background: m.color,
                      }}
                    />
                    {m.label}
                  </span>
                );
              },
            },
            {
              title: "Name / target",
              key: "name",
              width: 200,
              render: (_: unknown, e: any) => (
                <span className="wd-mono" style={{ fontSize: 12.5 }}>
                  {eventName(e) || (
                    <span style={{ color: "var(--muted)" }}>-</span>
                  )}
                </span>
              ),
            },
            {
              title: "Preview",
              key: "preview",
              render: (_: unknown, e: any) => (
                <span
                  className="wd-mono"
                  style={{ fontSize: 12, color: "var(--muted)" }}
                >
                  {eventPreview(e)}
                </span>
              ),
            },
          ]}
        />
      </Surface>
    </>
  );
}
