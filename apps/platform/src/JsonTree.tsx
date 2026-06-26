/**
 * JsonTree - a tiny, dependency-free collapsible JSON viewer that matches the wrud theme.
 * Uses native <details> for collapse (no JS state). Strings that are themselves JSON (common
 * for captured tool input/output) are parsed so they render as a tree, not an escaped blob.
 */
import { useState } from "react";

export function parseMaybe(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

function Node({
  data,
  depth,
  k,
}: {
  data: unknown;
  depth: number;
  k?: string;
}) {
  const keyEl = k != null ? <span className="jt-key">{k}</span> : null;

  if (data === null || data === undefined) {
    return (
      <div className="jt-row">
        {keyEl}
        <span className="jt-null">
          {data === undefined ? "undefined" : "null"}
        </span>
      </div>
    );
  }
  const t = typeof data;
  if (t === "string" || t === "number" || t === "boolean") {
    const cls =
      t === "string" ? "jt-str" : t === "number" ? "jt-num" : "jt-bool";
    return (
      <div className="jt-row">
        {keyEl}
        <span className={cls}>
          {t === "string" ? `"${data as string}"` : String(data)}
        </span>
      </div>
    );
  }

  const entries: [string, unknown][] = Array.isArray(data)
    ? (data as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(data as Record<string, unknown>);
  const label = Array.isArray(data)
    ? `Array(${entries.length})`
    : `{${entries.length}}`;

  return (
    <details className="jt-node" open={depth < 1}>
      <summary className="jt-summary">
        {keyEl}
        <span className="jt-meta">{label}</span>
      </summary>
      <div className="jt-children">
        {entries.map(([ek, ev]) => (
          <Node key={ek} k={ek} data={ev} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

export function JsonTree({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const parsed = parseMaybe(data);
  const pretty =
    typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
  return (
    <div className="jt">
      <button
        className="jt-copy"
        onClick={() => {
          navigator.clipboard?.writeText(pretty);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
      <Node data={parsed} depth={0} />
    </div>
  );
}
