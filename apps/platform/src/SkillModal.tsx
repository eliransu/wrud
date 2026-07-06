/**
 * SkillModal - click a skill/command chip to see its local source (markdown-rendered)
 * and re-run it on this machine via `claude -p "/<name> <args>"`.
 * Skill files can come from third-party plugins, so rendered HTML is DOMPurify-sanitized.
 */
import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Spin, Tag } from "antd";
import { CaretRightOutlined } from "@ant-design/icons";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { api } from "./api";

const render = (md: string) => ({
  __html: DOMPurify.sanitize(marked.parse(md, { async: false }) as string),
});

/** SKILL.md files open with YAML frontmatter - show it as metadata, not as markdown. */
function splitFrontmatter(md: string): { meta: string | null; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  return m
    ? { meta: m[1], body: md.slice(m[0].length) }
    : { meta: null, body: md };
}

interface RunResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
}

export default function SkillModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<{
    kind: string;
    path: string;
    content: string;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [args, setArgs] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    setDetail(null);
    setNotFound(false);
    setResult(null);
    setArgs("");
    api
      .getSkill(name)
      .then(setDetail)
      .catch(() => setNotFound(true));
  }, [name]);

  const run = () => {
    setRunning(true);
    setResult(null);
    api
      .runSkill(name, args)
      .then(setResult)
      .catch((e) => setResult({ ok: false, exitCode: null, output: String(e) }))
      .finally(() => setRunning(false));
  };

  const { meta, body } = splitFrontmatter(detail?.content ?? "");
  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      width={760}
      title={
        <span className="wd-mono" style={{ fontSize: 14 }}>
          {name} {detail && <Tag style={{ marginLeft: 8 }}>{detail.kind}</Tag>}
        </span>
      }
    >
      {!detail && !notFound && (
        <Spin style={{ display: "block", margin: "32px auto" }} />
      )}
      {notFound && (
        <Alert
          type="info"
          showIcon
          message="No local source found"
          description="This skill/command isn't in ~/.claude (skills, commands, or plugin cache) on the machine running the wrud server. You can still try running it below."
        />
      )}
      {detail && (
        <>
          <div
            className="wd-mono"
            style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12 }}
          >
            {detail.path}
          </div>
          {meta && <pre className="wd-skill-meta">{meta}</pre>}
          <div className="wd-md" dangerouslySetInnerHTML={render(body)} />
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Input
          className="wd-mono"
          placeholder="optional arguments"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          onPressEnter={run}
          disabled={running}
        />
        <Button
          type="primary"
          icon={<CaretRightOutlined />}
          loading={running}
          onClick={run}
        >
          Run
        </Button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
        Runs{" "}
        <span className="wd-mono">
          claude -p "/{name.replace(/^\//, "")}
          {args ? ` ${args}` : ""}"
        </span>{" "}
        on the machine hosting the wrud server (needs an admin-scope key).
      </div>
      {running && (
        <div style={{ marginTop: 12, color: "var(--muted)" }}>
          <Spin size="small" /> running - this can take a while...
        </div>
      )}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="wd-eyebrow" style={{ marginBottom: 8 }}>
            Output{" "}
            {result.ok ? (
              <Tag color="green">ok</Tag>
            ) : (
              <Tag color="red">
                failed
                {result.exitCode != null ? ` (exit ${result.exitCode})` : ""}
              </Tag>
            )}
          </div>
          <div
            className="wd-md wd-skill-output"
            dangerouslySetInnerHTML={render(result.output || "(no output)")}
          />
        </div>
      )}
    </Modal>
  );
}
