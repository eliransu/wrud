import { useMemo } from "react";
import { Select, DatePicker, InputNumber, Checkbox } from "antd";
import { useApi } from "./hooks";
import { api } from "./api";

const { RangePicker } = DatePicker;

/** Facet dimensions shown as search-and-select multi-pickers, in display order. */
export const DIMS = [
  ["user", "Users"],
  ["agent", "Agents"],
  ["project", "Projects"],
  ["model", "Models"],
  ["topic", "Topics"],
  ["category", "Categories"],
  ["skill", "Skills"],
  ["command", "Commands"],
  ["tool", "Tools"],
  ["mcp", "MCPs"],
  ["file_ext", "Files (ext)"],
  ["error_kind", "Errors"],
  ["status", "Status"],
] as const;
export type Dim = (typeof DIMS)[number][0];

export type FilterState = Partial<Record<Dim, string[]>> & {
  from?: string;
  to?: string;
  minOutputTokens?: number;
  hasError?: boolean;
};

/** A FilterState -> query params the API understands (arrays become comma lists). */
export function filterToParams(f: FilterState): Record<string, string> {
  const p: Record<string, string> = {};
  for (const [dim] of DIMS) {
    const v = f[dim];
    if (v?.length) p[dim] = v.join(",");
  }
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.minOutputTokens) p.minOutputTokens = String(f.minOutputTokens);
  if (f.hasError) p.hasError = "true";
  return p;
}

/** Inverse of filterToParams - rebuilds a FilterState from URL query params (Reports). */
export function paramsToFilter(params: URLSearchParams): FilterState {
  const f: FilterState = {};
  for (const [dim] of DIMS) {
    const v = params.get(dim);
    if (v) f[dim] = v.split(",").filter(Boolean);
  }
  const from = params.get("from");
  const to = params.get("to");
  const minOut = params.get("minOutputTokens");
  if (from) f.from = from;
  if (to) f.to = to;
  if (minOut) f.minOutputTokens = Number(minOut) || undefined;
  if (params.get("hasError") === "true") f.hasError = true;
  return f;
}

type FacetMap = Partial<Record<string, { value: string; sessions: number }[]>>;

/**
 * Controlled filter bar. Options come from GET /v1/facets (top values per dim across the
 * whole dataset, not just a loaded page) so the user can search-and-select anyone who
 * communicated, any model, any skill, etc. AntD `showSearch` filters the option list.
 * ponytail: client-side search over the top ~500 values per dim; add ?dim&q server search
 * only if a dimension ever grows past that.
 */
export function FacetFilterBar({
  value,
  onChange,
  dims,
  showRange = true,
  showTokens = true,
  showError = true,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Restrict to these dimensions (default: all). Sessions shows a focused subset; Reports all. */
  dims?: Dim[];
  showRange?: boolean;
  showTokens?: boolean;
  showError?: boolean;
}) {
  const { data } = useApi<FacetMap>(() => api.facets({ limit: "500" }), []);
  const facets = data ?? {};
  const shown = DIMS.filter(([d]) => !dims || dims.includes(d));

  const optionsFor = useMemo(
    () => (dim: string) =>
      (facets[dim] ?? []).map((f) => ({
        value: f.value,
        label: `${f.value} (${f.sessions})`,
      })),
    [facets],
  );

  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 16,
        alignItems: "center",
      }}
    >
      {shown.map(([dim, label]) => (
        <Select
          key={dim}
          mode="multiple"
          allowClear
          showSearch
          // fixed count, NOT "responsive": responsive uses a ResizeObserver to measure how many
          // tags fit, which loops (flicker) inside a flex-wrap container whose width depends on
          // the tags shown. A fixed count + fixed width avoids the measure→render→measure loop.
          maxTagCount={1}
          placeholder={label}
          style={{ width: 168 }}
          value={value[dim] ?? []}
          onChange={(v: string[]) => set({ [dim]: v } as Partial<FilterState>)}
          options={optionsFor(dim)}
          filterOption={(input, opt) =>
            String(opt?.value ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
        />
      ))}
      {showRange && (
        <RangePicker
          onChange={(d) =>
            set({
              from: d?.[0]?.startOf("day").toISOString(),
              to: d?.[1]?.endOf("day").toISOString(),
            })
          }
        />
      )}
      {showTokens && (
        <InputNumber
          placeholder="min out tokens"
          min={0}
          style={{ width: 150 }}
          value={value.minOutputTokens}
          onChange={(v) => set({ minOutputTokens: v ?? undefined })}
        />
      )}
      {showError && (
        <Checkbox
          checked={!!value.hasError}
          onChange={(e) => set({ hasError: e.target.checked || undefined })}
        >
          Errored
        </Checkbox>
      )}
    </div>
  );
}
