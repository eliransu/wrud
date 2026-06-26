import { useCallback, useEffect, useState } from "react";
import { message } from "antd";

/** Tiny fetch-on-mount hook with a reload(). Surfaces errors via antd message. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    setLoading(true);
    fn()
      .then(setData)
      .catch((e: unknown) =>
        message.error(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, reload };
}
