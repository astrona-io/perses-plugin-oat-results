import { FormatOptions } from "@perses-dev/components";
import { OptionsEditorProps, PanelProps } from "@perses-dev/plugin-system";
import { TimeSeriesData } from "@perses-dev/spec";

export type QueryData = TimeSeriesData;

export type OATResultsChartProps = PanelProps<
  OATResultsChartOptions,
  QueryData
>;
export type OATResultsChartEditorProps =
  OptionsEditorProps<OATResultsChartOptions>;

export const SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "unknown",
] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * URL templates for the detail strip. Each takes `${image}`, `${tag}`, `${run_id}`, `${check}`,
 * `${base_image}`, `${base_tag}`, `${previous_tag}` and `${run_url}`.
 */
export interface LinkTemplates {
  /** Logs of the check, for example a Perses explore or Loki URL with `{job="oat"} |= "${run_id}"`. */
  logs?: string;
  /** The pipeline run. When unset, the `run_url` label of `oat_image_info` is used. */
  pipelineRun?: string;
  /** A diff against the previous tag of the image. */
  diff?: string;
}

export interface OATResultsChartOptions {
  /** Check names, in column order. Every check in the data, in pipeline order, when unset. */
  checks?: string[];
  /** Display names per check name: `{ llm_eval: "LLM eval" }`. */
  checkLabels?: Record<string, string>;
  /** Severities summed in the CVE column. Default critical and high. */
  severityFilter?: Severity[];
  linkTemplates?: LinkTemplates;
  /** One row per image, its newest run. Default true. When false, one row per run. */
  showOnlyLatestPerImage?: boolean;
  /** A sparkline per row: the pass rate of the image's last `historyRuns` runs. Default false. */
  showHistory?: boolean;
  /** Runs in the history sparkline. Default 10. */
  historyRuns?: number;
  /** How check durations are shown. Default seconds. */
  durationFormat?: FormatOptions;
}

export const DEFAULT_SEVERITY_FILTER: Severity[] = ["critical", "high"];
export const DEFAULT_HISTORY_RUNS = 10;
export const MIN_HISTORY_RUNS = 2;
export const MAX_HISTORY_RUNS = 50;
export const DEFAULT_DURATION_FORMAT: FormatOptions = {
  unit: "seconds",
  decimalPlaces: 1,
};

/**
 * Checks in the order a typical OAT pipeline runs them. Columns follow this order when `checks` is
 * unset; other names come after, alphabetically.
 */
export const KNOWN_CHECK_ORDER = [
  "start",
  "health",
  "ports",
  "smoke",
  "perf",
  "sbom",
  "signature",
  "llm_eval",
];

/** Display names for the known checks, used when `checkLabels` has no entry. */
export const DEFAULT_CHECK_LABELS: Record<string, string> = {
  start: "Start",
  health: "Health",
  ports: "Ports",
  smoke: "Smoke",
  perf: "Perf",
  sbom: "SBOM",
  signature: "Signature",
  llm_eval: "LLM eval",
};

export function createInitialOATResultsChartOptions(): OATResultsChartOptions {
  return {
    severityFilter: [...DEFAULT_SEVERITY_FILTER],
    showOnlyLatestPerImage: true,
    showHistory: false,
    historyRuns: DEFAULT_HISTORY_RUNS,
  };
}
