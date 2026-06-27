import { useCallback, useEffect, useState } from "react";
import { message } from "antd";

/** Fetch-on-mount with a reload() and optional live polling. The initial fetch toggles `loading`;
 * background polls refetch SILENTLY (no spinner flash) and pause while the tab is hidden, so the
 * dashboard stays current without WebSockets - near-instant for a local single-user server. */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  opts: { pollMs?: number } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(
    () =>
      fn()
        .then(setData)
        .catch((e: unknown) =>
          message.error(e instanceof Error ? e.message : String(e)),
        ),
    deps,
  );

  // initial load (owns the loading flag)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && setData(d))
      .catch(
        (e: unknown) =>
          alive && message.error(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // live polling (silent; skips hidden tabs)
  useEffect(() => {
    if (!opts.pollMs) return;
    const id = setInterval(() => {
      if (!document.hidden) reload();
    }, opts.pollMs);
    const onVisible = () => {
      if (!document.hidden) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, opts.pollMs]);

  return { data, loading, reload };
}

/** Default live-refresh cadence for dashboard pages (ms). */
export const LIVE_POLL_MS = 4000;
