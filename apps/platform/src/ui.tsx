import { useEffect, useRef, useState, type ReactNode } from "react";

/** Eased count-up for telemetry numbers. */
export function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function StatTile({
  label,
  value,
  accent,
  delay = 0,
}: {
  label: string;
  value: number;
  accent?: boolean;
  delay?: number;
}) {
  const v = useCountUp(value);
  return (
    <div className="wd-tile wd-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className={"v" + (accent ? " accent" : "")}>
        {v.toLocaleString()}
      </div>
      <div className="k wd-eyebrow">{label}</div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  extra,
}: {
  eyebrow: string;
  title: string;
  extra?: ReactNode;
}) {
  return (
    <div className="wd-rise" style={{ marginBottom: 26 }}>
      <div className="wd-eyebrow">{eyebrow}</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          marginTop: 8,
        }}
      >
        <h1
          style={{ fontSize: 36, margin: 0, fontWeight: 800, lineHeight: 1.05 }}
        >
          {title}
        </h1>
        {extra}
      </div>
    </div>
  );
}

export function Surface({
  title,
  extra,
  children,
  style,
  delay = 0,
}: {
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  delay?: number;
}) {
  return (
    <div
      className="wd-card wd-rise"
      style={{ animationDelay: `${delay}ms`, ...style }}
    >
      {(title || extra) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {title && (
            <div className="wd-card-title" style={{ marginBottom: 0 }}>
              {title}
            </div>
          )}
          {extra}
        </div>
      )}
      <div style={{ marginTop: title || extra ? 18 : 0 }}>{children}</div>
    </div>
  );
}

const SIGNALS: Record<string, string> = {
  green: "var(--signal)",
  cyan: "var(--cyan)",
  amber: "var(--amber)",
  red: "var(--red)",
  muted: "var(--muted)",
};

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: keyof typeof SIGNALS | string;
  children: ReactNode;
}) {
  const color = SIGNALS[tone] ?? "var(--muted)";
  return (
    <span className="wd-pill" style={{ color }}>
      <span className="led" />
      <span style={{ color: "var(--ink)" }}>{children}</span>
    </span>
  );
}
