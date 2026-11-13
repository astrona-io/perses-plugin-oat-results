# Plan: OATResultsChart

`OATResultsChart` is a Perses panel that shows the operational acceptance tests (OAT) of a CVE patching
pipeline in one place: which image is blocked, by which check, and how many CVEs the rebuild closed.

This page is the design written before the code. Where the code later differs, `docs/DECISIONS.md`
says why.

## Inputs

The panel reads `TimeSeriesQuery` results (Prometheus, or anything that returns time series with
labels). It classifies every series by its `__name__` label, so the queries must keep metric names: a
raw selector such as `{__name__=~"oat_.+|image_cve_total"}` is enough for the whole panel. The metric
contract is in [metrics.md](metrics.md).

| Metric                       | Labels used                                       | Meaning                              |
| ---------------------------- | ------------------------------------------------- | ------------------------------------ |
| `oat_check_result`           | image, tag, check, run_id                         | 1 pass, 0.5 warn, 0 fail, -1 skipped |
| `oat_check_duration_seconds` | image, tag, check, run_id                         | how long the check ran               |
| `oat_check_info`             | image, tag, check, run_id, message                | optional failure detail (value 1)    |
| `oat_image_info`             | image, tag, base_image, base_tag, run_id, run_url | the base to dependent tree (value 1) |
| `oat_run_timestamp_seconds`  | image, tag, run_id                                | when the run started; orders runs    |
| `image_cve_total`            | image, tag, severity, phase (before, after)       | CVE counts before and after          |
| `oat_promotion_status`       | image, tag                                        | 1 promoted, 0 blocked, 0.5 pending   |

Each series is reduced to its last non-null sample in the time range.

## Data model

```ts
type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped' | 'unknown';

interface CheckResult { check; status; value; durationSeconds?; message? }

interface Run {                       // one pipeline run of one image:tag
  key; image; tag; runId; runUrl?; baseImage?; baseTag?;
  startedAt?;                         // oat_run_timestamp_seconds, else the first sample seen
  checks: Record<string, CheckResult>;
}

interface ImageRow {                  // one row of the table
  id; run; depth; parentId?; childIds;
  promotion?: 'promoted' | 'blocked' | 'pending';
  cve?: { before; after; worstAfter? };   // summed over severityFilter
  blockedBy?: { rowId; image; tag; reason };  // nearest blocked ancestor
  history: number[];                  // pass rate per run, oldest first
}

interface OatModel { checks: string[]; rows: ImageRow[] /* depth-first */; rowsById; problems: string[] }
```

### Transform (pure, memoised on `queryResults` and the spec)

1. **Parse**: walk every series once, key by `image|tag|run_id`, fill runs, checks, CVE and promotion
   maps. O(series).
2. **Pick runs**: with `showOnlyLatestPerImage` (default) keep the newest run per image, by
   `startedAt`, then by the latest sample, then by `run_id`. Otherwise every run is a row.
3. **Tree**: a row's parent is the row whose image is its `base_image` (and whose tag is `base_tag`
   when such a row exists). Rows whose base is not shown are roots. Cycles are broken by treating the
   row that closes the loop as a root. Children are sorted by image name; the flattened list is a
   depth-first walk, so two-level chains (debian-slim, then python, then app) come out nested.
4. **Columns**: `spec.checks` when set, else every check in the data in the pipeline's natural order
   (start, health, ports, smoke, perf, sbom, signature, llm_eval), unknown names after, alphabetically.
5. **Blocked by**: a row is blocked when its promotion status is blocked, or any check failed. For a
   row with skipped checks, `blockedBy` is the nearest blocked ancestor, with the reason "start failed"
   or "blocked". A skipped cell after a failed check in the same row is explained by that check.
6. **History**: per image, the pass rate (pass / (pass + warn + fail)) of the last `historyRuns` runs.

## Component tree

```
OATResultsChartComponent           memo: model = buildModel(queryResults, spec)
├─ EmptyState                      no series, or none of the OAT metrics (says what it expected)
├─ ResultsTable  <table>           sticky header; one <th> per check, then CVE, Gate, (History)
│  └─ ImageRowView (React.memo)    one per visible row; props stay stable unless the row changes
│     ├─ name cell                 indent by depth, toggle button for rows with children, bold if base
│     │                            plus "skipped: base python:3.12 blocked (health failed)" line
│     ├─ StatusCell × checks       <button> with icon + label text (sr) + colour; aria-pressed
│     ├─ CveCell                   "before → after", after coloured by worst severity
│     ├─ GateChip                  promoted / blocked / pending with icon
│     └─ Sparkline                 inline SVG, aria-label lists the pass rates
└─ DetailStrip                     under the table for the selected cell: check, status, message,
                                   duration, run id, base image, and the configured links
```

State: `collapsed: Set<rowId>` and `selected: { rowId, check }`. No hover state, so moving the mouse
re-renders nothing. Selecting a cell re-renders only the old and the new row.

## CUE schema draft

```cue
kind: "OATResultsChart"
spec: close({
  checks?: [...string]                       // column order; auto from the data when unset
  checkLabels?: [string]: string             // llm_eval: "LLM eval"
  severityFilter?: [...("critical" | "high" | "medium" | "low" | "unknown")]  // default critical, high
  linkTemplates?: close({ logs?: string, pipelineRun?: string, diff?: string })
  showOnlyLatestPerImage?: bool              // default true
  showHistory?: bool                         // default false
  historyRuns?: int & >=2 & <=50             // default 10
  durationFormat?: common.#format            // default seconds
})
```

Link templates take `${image}`, `${tag}`, `${run_id}`, `${check}`, `${base_image}`, `${base_tag}`,
`${previous_tag}` and `${run_url}`; values are URL-encoded except `${run_url}`.

## dev/ environment

`podman compose` (or docker compose) with Perses (official image, the plugin archive mounted), Prometheus,
Pushgateway and a fake-data generator that pushes the contract through the reference pusher every
30 s: ~20 images in two- and three-level chains, a blocked base whose dependents are skipped, warns,
pending gates and a few runs of history. A provisioned demo dashboard lives in `dev/dashboards/`.

## Open questions

- The concept sketch (`docs/mockup.png`) was not available; the layout follows the written brief.
- Ordering runs needs a timestamp; the brief's contract has none. `oat_run_timestamp_seconds` is added
  (optional, with a fallback).
- With Pushgateway every pushed run stays until deleted; the reference pusher can delete older groups.
- Failure detail from Loki: a log query result is not a time series, so the panel cannot join it in a
  `TimeSeriesQuery` panel. Proposed: the message comes from `oat_check_info`; Loki is reached through the
  `logs` link template.
