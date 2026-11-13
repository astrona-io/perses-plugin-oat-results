import { TimeSeries, TimeSeriesData } from "@perses-dev/spec";
import {
  DEFAULT_CHECK_LABELS,
  DEFAULT_HISTORY_RUNS,
  DEFAULT_SEVERITY_FILTER,
  KNOWN_CHECK_ORDER,
  SEVERITIES,
  Severity,
} from "./oat-results-chart-types";

/** Metric names of the contract in docs/metrics.md. */
export const METRICS = {
  checkResult: "oat_check_result",
  checkDuration: "oat_check_duration_seconds",
  checkInfo: "oat_check_info",
  imageInfo: "oat_image_info",
  runTimestamp: "oat_run_timestamp_seconds",
  cveTotal: "image_cve_total",
  promotion: "oat_promotion_status",
} as const;

const KNOWN_METRICS = new Set<string>(Object.values(METRICS));

export type CheckStatus = "pass" | "warn" | "fail" | "skipped" | "unknown";
export type PromotionStatus = "promoted" | "blocked" | "pending";

export interface CheckResult {
  check: string;
  status: CheckStatus;
  value: number;
  durationSeconds?: number;
  message?: string;
  /** Why a skipped check was skipped: an earlier check failed, or the base image is blocked. */
  skipReason?: string;
}

export interface CveSummary {
  before: number;
  after: number;
  /** The most severe severity (within the filter) with CVEs left after the rebuild. */
  worstAfter?: Severity;
}

export interface BlockedBy {
  rowId: string;
  image: string;
  tag: string;
  reason: string;
}

export interface OatRow {
  id: string;
  image: string;
  tag: string;
  runId: string;
  runUrl?: string;
  baseImage?: string;
  baseTag?: string;
  /** The tag of the image's run before this one, for a diff link. */
  previousTag?: string;
  depth: number;
  parentId?: string;
  childIds: string[];
  checks: Record<string, CheckResult>;
  promotion?: PromotionStatus;
  cve?: CveSummary;
  /** A check failed or the promotion gate is closed. */
  blocked: boolean;
  /** Why this row is blocked, for example "Health failed". */
  blockReason?: string;
  /** The nearest blocked ancestor. */
  blockedBy?: BlockedBy;
  /** Dependents (at any depth) under this blocked row that have skipped checks. */
  blockedDependents: number;
  hasSkipped: boolean;
  /** Pass rate per run of this image, oldest first; null for a run with no evaluated check. */
  history: Array<number | null>;
}

export type ModelStatus = "ok" | "no-data" | "no-oat-metrics";

export interface OatModel {
  status: ModelStatus;
  /** Check names, in column order. */
  checks: string[];
  /** Rows in depth-first order: every base is followed by its dependents. */
  rows: OatRow[];
  rowsById: Map<string, OatRow>;
  /** Series that carried none of the contract's metric names. */
  ignoredSeries: number;
}

export interface BuildModelOptions {
  checks?: string[];
  checkLabels?: Record<string, string>;
  severityFilter?: Severity[];
  showOnlyLatestPerImage?: boolean;
  historyRuns?: number;
}

interface Sample {
  value: number;
  /** Unix ms of the last non-null sample. */
  at: number;
  /** Unix ms of the first non-null sample. */
  firstAt: number;
}

interface Run {
  key: string;
  image: string;
  tag: string;
  runId: string;
  runUrl?: string;
  baseImage?: string;
  baseTag?: string;
  startedAt?: number;
  firstSeen: number;
  lastSeen: number;
  results: Map<string, Sample>;
  durations: Map<string, number>;
  messages: Map<string, Sample & { message: string }>;
}

/** The last non-null, finite sample of a series, or undefined when it has none. */
export function lastSample(series: TimeSeries): Sample | undefined {
  const values = series.values ?? [];
  let last: Sample | undefined;
  for (let i = values.length - 1; i >= 0; i--) {
    const tuple = values[i];
    if (!tuple) continue;
    const [at, v] = tuple;
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      last = { value: v, at, firstAt: at };
      break;
    }
  }
  if (!last) return undefined;
  for (const tuple of values) {
    if (tuple && tuple[1] !== null && Number.isFinite(tuple[1])) {
      last.firstAt = tuple[0];
      break;
    }
  }
  return last;
}

/** 1 pass, 0.5 warn, 0 fail, -1 skipped; tolerant of float noise. */
export function statusFromValue(value: number): CheckStatus {
  if (!Number.isFinite(value)) return "unknown";
  if (value < -0.5) return "skipped";
  if (value < -0.01) return "unknown";
  if (value < 0.25) return "fail";
  if (value < 0.75) return "warn";
  if (value <= 1.01) return "pass";
  return "unknown";
}

/** 1 promoted, 0.5 pending, 0 blocked. */
export function promotionFromValue(value: number): PromotionStatus | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (value < 0.25 && value > -0.5) return "blocked";
  if (value >= 0.25 && value < 0.75) return "pending";
  if (value >= 0.75 && value <= 1.01) return "promoted";
  return undefined;
}

/** The display name of a check: `checkLabels`, then the known defaults, then the name made readable. */
export function checkLabel(
  check: string,
  labels?: Record<string, string>,
): string {
  const custom = labels?.[check];
  if (custom) return custom;
  const known = DEFAULT_CHECK_LABELS[check];
  if (known) return known;
  const words = check.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : check;
}

/** `image:tag`, or just the image when there is no tag. */
export function imageRef(image: string, tag?: string): string {
  return tag ? `${image}:${tag}` : image;
}

const collator = new Intl.Collator("en", { numeric: true });

/** Every check in the data, known checks in pipeline order first, then the rest alphabetically. */
export function orderChecks(found: Iterable<string>): string[] {
  const known = new Map(KNOWN_CHECK_ORDER.map((c, i) => [c, i]));
  return [...new Set(found)].sort((a, b) => {
    const ia = known.get(a);
    const ib = known.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return collator.compare(a, b);
  });
}

function compareRuns(a: Run, b: Run): number {
  const ta = a.startedAt ?? a.firstSeen;
  const tb = b.startedAt ?? b.firstSeen;
  if (ta !== tb) return ta - tb;
  if (a.lastSeen !== b.lastSeen) return a.lastSeen - b.lastSeen;
  return collator.compare(a.runId, b.runId);
}

function passRate(run: Run): number | null {
  let pass = 0;
  let evaluated = 0;
  for (const sample of run.results.values()) {
    const status = statusFromValue(sample.value);
    if (status === "pass") pass++;
    if (status === "pass" || status === "warn" || status === "fail")
      evaluated++;
  }
  return evaluated === 0 ? null : pass / evaluated;
}

const runKey = (image: string, tag: string, runId: string): string =>
  `${image}\u0000${tag}\u0000${runId}`;
const imageTagKey = (image: string, tag: string): string =>
  `${image}\u0000${tag}`;

/**
 * Turns the query results into table rows: one per image (or per run), arranged as a base to
 * dependent tree, with check results, CVE counts, the promotion gate and history. Pure; call it in
 * a `useMemo`.
 */
export function buildModel(
  results: ReadonlyArray<{ data?: TimeSeriesData }>,
  options: BuildModelOptions = {},
): OatModel {
  const severityFilter = new Set(
    options.severityFilter?.length
      ? options.severityFilter
      : DEFAULT_SEVERITY_FILTER,
  );
  const latestOnly = options.showOnlyLatestPerImage ?? true;
  const historyRuns = Math.max(
    1,
    Math.floor(options.historyRuns ?? DEFAULT_HISTORY_RUNS),
  );

  const runs = new Map<string, Run>();
  const cves = new Map<
    string,
    { before: Map<string, number>; after: Map<string, number> }
  >();
  const promotions = new Map<string, Sample>();
  const foundChecks = new Set<string>();
  let seriesCount = 0;
  let ignoredSeries = 0;

  const getRun = (
    image: string,
    tag: string,
    runId: string,
    sample: Sample,
  ): Run => {
    const key = runKey(image, tag, runId);
    let run = runs.get(key);
    if (!run) {
      run = {
        key,
        image,
        tag,
        runId,
        firstSeen: sample.firstAt,
        lastSeen: sample.at,
        results: new Map(),
        durations: new Map(),
        messages: new Map(),
      };
      runs.set(key, run);
    } else {
      run.firstSeen = Math.min(run.firstSeen, sample.firstAt);
      run.lastSeen = Math.max(run.lastSeen, sample.at);
    }
    return run;
  };

  for (const result of results) {
    for (const series of result.data?.series ?? []) {
      seriesCount++;
      const labels = series.labels ?? {};
      const name = labels["__name__"];
      if (!name || !KNOWN_METRICS.has(name)) {
        ignoredSeries++;
        continue;
      }
      const image = labels["image"];
      if (!image) continue;
      const sample = lastSample(series);
      if (!sample) continue;
      const tag = labels["tag"] ?? "";
      const runId = labels["run_id"] ?? "";
      const check = labels["check"];

      switch (name) {
        case METRICS.checkResult: {
          if (!check) break;
          foundChecks.add(check);
          const run = getRun(image, tag, runId, sample);
          const prev = run.results.get(check);
          if (!prev || prev.at <= sample.at) run.results.set(check, sample);
          break;
        }
        case METRICS.checkDuration: {
          if (!check) break;
          getRun(image, tag, runId, sample).durations.set(check, sample.value);
          break;
        }
        case METRICS.checkInfo: {
          const message = labels["message"];
          if (!check || !message || sample.value === 0) break;
          const run = getRun(image, tag, runId, sample);
          const prev = run.messages.get(check);
          if (!prev || prev.at <= sample.at)
            run.messages.set(check, { ...sample, message });
          break;
        }
        case METRICS.imageInfo: {
          const run = getRun(image, tag, runId, sample);
          run.baseImage = labels["base_image"] || run.baseImage;
          run.baseTag = labels["base_tag"] || run.baseTag;
          run.runUrl = labels["run_url"] || run.runUrl;
          break;
        }
        case METRICS.runTimestamp: {
          getRun(image, tag, runId, sample).startedAt = sample.value * 1000;
          break;
        }
        case METRICS.cveTotal: {
          const phase = labels["phase"];
          if (phase !== "before" && phase !== "after") break;
          const severity = (labels["severity"] ?? "unknown").toLowerCase();
          const key = imageTagKey(image, tag);
          let entry = cves.get(key);
          if (!entry) {
            entry = { before: new Map(), after: new Map() };
            cves.set(key, entry);
          }
          const counts = entry[phase];
          counts.set(severity, (counts.get(severity) ?? 0) + sample.value);
          break;
        }
        case METRICS.promotion: {
          const key = imageTagKey(image, tag);
          const prev = promotions.get(key);
          if (!prev || prev.at <= sample.at) promotions.set(key, sample);
          break;
        }
      }
    }
  }

  const empty = (status: ModelStatus): OatModel => ({
    status,
    checks: options.checks?.length ? [...options.checks] : [],
    rows: [],
    rowsById: new Map(),
    ignoredSeries,
  });
  if (seriesCount === 0) return empty("no-data");
  if (runs.size === 0) return empty("no-oat-metrics");

  const checks = options.checks?.length
    ? [...options.checks]
    : orderChecks(foundChecks);

  // Runs of each image, oldest first.
  const runsByImage = new Map<string, Run[]>();
  for (const run of runs.values()) {
    const list = runsByImage.get(run.image);
    if (list) list.push(run);
    else runsByImage.set(run.image, [run]);
  }
  for (const list of runsByImage.values()) list.sort(compareRuns);

  // The rows: the newest run per image, or every run.
  const selected: Array<{ run: Run; index: number; list: Run[] }> = [];
  for (const list of runsByImage.values()) {
    if (latestOnly) {
      const last = list[list.length - 1];
      if (last) selected.push({ run: last, index: list.length - 1, list });
    } else {
      list.forEach((run, index) => selected.push({ run, index, list }));
    }
  }

  const rowsById = new Map<string, OatRow>();
  const rowsByImage = new Map<string, OatRow[]>();
  for (const { run, index, list } of selected) {
    const id = latestOnly ? run.image : run.key;
    let previousTag: string | undefined;
    for (let i = index - 1; i >= 0; i--) {
      const prev = list[i];
      if (prev && prev.tag !== run.tag) {
        previousTag = prev.tag;
        break;
      }
    }

    const results: Record<string, CheckResult> = {};
    for (const [check, sample] of run.results) {
      results[check] = {
        check,
        status: statusFromValue(sample.value),
        value: sample.value,
        durationSeconds: run.durations.get(check),
        message: run.messages.get(check)?.message,
      };
    }

    const promotionSample = promotions.get(imageTagKey(run.image, run.tag));
    const cveEntry = cves.get(imageTagKey(run.image, run.tag));
    let cve: CveSummary | undefined;
    if (cveEntry) {
      const sum = (counts: Map<string, number>): number => {
        let total = 0;
        for (const [severity, n] of counts) {
          if (severityFilter.has(severity as Severity)) total += n;
        }
        return total;
      };
      const worstAfter = SEVERITIES.find(
        (s) => severityFilter.has(s) && (cveEntry.after.get(s) ?? 0) > 0,
      );
      cve = {
        before: sum(cveEntry.before),
        after: sum(cveEntry.after),
        worstAfter,
      };
    }

    const history = list
      .slice(Math.max(0, index + 1 - historyRuns), index + 1)
      .map(passRate);

    const row: OatRow = {
      id,
      image: run.image,
      tag: run.tag,
      runId: run.runId,
      runUrl: run.runUrl,
      baseImage: run.baseImage,
      baseTag: run.baseTag,
      previousTag,
      depth: 0,
      childIds: [],
      checks: results,
      promotion: promotionSample
        ? promotionFromValue(promotionSample.value)
        : undefined,
      cve,
      blocked: false,
      blockedDependents: 0,
      hasSkipped: false,
      history,
    };
    rowsById.set(id, row);
    const list2 = rowsByImage.get(run.image);
    if (list2) list2.push(row);
    else rowsByImage.set(run.image, [row]);
  }

  // Parents: the row of the base image, the one with the base tag when it is shown, else its newest.
  for (const row of rowsById.values()) {
    if (!row.baseImage || row.baseImage === row.image) continue;
    const candidates = rowsByImage.get(row.baseImage);
    if (!candidates?.length) continue;
    const parent =
      candidates.find((c) => row.baseTag && c.tag === row.baseTag) ??
      candidates[candidates.length - 1];
    if (parent) row.parentId = parent.id;
  }

  // Break cycles: a row whose chain of parents leads back to itself becomes a root.
  for (const row of rowsById.values()) {
    const seen = new Set<string>([row.id]);
    let current = row.parentId ? rowsById.get(row.parentId) : undefined;
    while (current) {
      if (seen.has(current.id)) {
        row.parentId = undefined;
        break;
      }
      seen.add(current.id);
      current = current.parentId ? rowsById.get(current.parentId) : undefined;
    }
  }

  const byName = (a: OatRow, b: OatRow): number =>
    collator.compare(a.image, b.image) ||
    collator.compare(a.tag, b.tag) ||
    collator.compare(a.runId, b.runId);

  const roots: OatRow[] = [];
  for (const row of rowsById.values()) {
    const parent = row.parentId ? rowsById.get(row.parentId) : undefined;
    if (parent) parent.childIds.push(row.id);
    else roots.push(row);
  }
  for (const row of rowsById.values()) {
    row.childIds.sort((a, b) => byName(rowsById.get(a)!, rowsById.get(b)!));
  }
  roots.sort(byName);

  // Depth-first order, without recursion so deep chains cannot overflow the stack.
  const rows: OatRow[] = [];
  const stack: Array<{ row: OatRow; depth: number }> = roots
    .slice()
    .reverse()
    .map((row) => ({ row, depth: 0 }));
  while (stack.length) {
    const { row, depth } = stack.pop()!;
    row.depth = depth;
    rows.push(row);
    for (let i = row.childIds.length - 1; i >= 0; i--) {
      const child = rowsById.get(row.childIds[i]!);
      if (child) stack.push({ row: child, depth: depth + 1 });
    }
  }

  // Blocked rows and why skipped checks were skipped. Parents come before children in `rows`.
  for (const row of rows) {
    const failed = checks.find((c) => row.checks[c]?.status === "fail");
    const extraFailed = Object.values(row.checks).find(
      (r) => r.status === "fail" && !checks.includes(r.check),
    );
    const failedCheck = failed ?? extraFailed?.check;
    if (failedCheck) {
      row.blocked = true;
      row.blockReason = `${checkLabel(failedCheck, options.checkLabels)} failed`;
    } else if (row.promotion === "blocked") {
      row.blocked = true;
      row.blockReason = "promotion blocked";
    }

    const parent = row.parentId ? rowsById.get(row.parentId) : undefined;
    if (parent) {
      if (parent.blocked) {
        row.blockedBy = {
          rowId: parent.id,
          image: parent.image,
          tag: parent.tag,
          reason: parent.blockReason ?? "blocked",
        };
      } else if (parent.blockedBy) {
        row.blockedBy = parent.blockedBy;
      }
    }

    let firstFailed: string | undefined;
    for (const check of checks) {
      const result = row.checks[check];
      if (!result) continue;
      if (result.status === "fail" && !firstFailed) firstFailed = check;
      if (result.status !== "skipped") continue;
      row.hasSkipped = true;
      if (firstFailed) {
        result.skipReason = `${checkLabel(firstFailed, options.checkLabels)} failed earlier in this run`;
      } else if (row.blockedBy) {
        result.skipReason = `base ${imageRef(row.blockedBy.image, row.blockedBy.tag)} is blocked (${row.blockedBy.reason})`;
      }
    }
    if (!row.hasSkipped) {
      row.hasSkipped = Object.values(row.checks).some(
        (r) => r.status === "skipped",
      );
    }
  }

  // How many dependents each blocked row holds back.
  for (const row of rows) {
    if (!row.hasSkipped || !row.blockedBy) continue;
    const blocker = rowsById.get(row.blockedBy.rowId);
    if (blocker) blocker.blockedDependents++;
  }

  return { status: "ok", checks, rows, rowsById, ignoredSeries };
}

/** The rows to draw: every row whose ancestors are all expanded. */
export function visibleRows(
  rows: readonly OatRow[],
  collapsed: ReadonlySet<string>,
): OatRow[] {
  if (collapsed.size === 0) return rows.slice();
  const out: OatRow[] = [];
  let hideBelow: number | undefined;
  for (const row of rows) {
    if (hideBelow !== undefined) {
      if (row.depth > hideBelow) continue;
      hideBelow = undefined;
    }
    out.push(row);
    if (collapsed.has(row.id) && row.childIds.length) hideBelow = row.depth;
  }
  return out;
}
