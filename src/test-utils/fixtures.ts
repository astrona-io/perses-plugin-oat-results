import { TimeSeries, TimeSeriesData } from "@perses-dev/spec";

/** Builders for query results shaped like the metric contract in docs/metrics.md. */

const T0 = 1_760_000_000_000;

export function series(
  name: string,
  labels: Record<string, string>,
  value: number,
  at = T0,
): TimeSeries {
  return {
    name,
    labels: { __name__: name, ...labels },
    values: [[at, value]],
  };
}

export interface ImageSpec {
  image: string;
  tag: string;
  runId: string;
  base?: [string, string];
  checks: Record<string, number>;
  durations?: Record<string, number>;
  messages?: Record<string, string>;
  promotion?: number;
  cve?: { before: Record<string, number>; after: Record<string, number> };
  startedAt?: number;
  runUrl?: string;
}

export function imageSeries(spec: ImageSpec): TimeSeries[] {
  const id = { image: spec.image, tag: spec.tag, run_id: spec.runId };
  const at = spec.startedAt !== undefined ? spec.startedAt * 1000 : T0;
  const out: TimeSeries[] = [
    series(
      "oat_image_info",
      {
        ...id,
        base_image: spec.base?.[0] ?? "",
        base_tag: spec.base?.[1] ?? "",
        run_url: spec.runUrl ?? "",
      },
      1,
      at,
    ),
  ];
  if (spec.startedAt !== undefined) {
    out.push(series("oat_run_timestamp_seconds", id, spec.startedAt, at));
  }
  for (const [check, value] of Object.entries(spec.checks)) {
    out.push(series("oat_check_result", { ...id, check }, value, at));
  }
  for (const [check, value] of Object.entries(spec.durations ?? {})) {
    out.push(series("oat_check_duration_seconds", { ...id, check }, value, at));
  }
  for (const [check, message] of Object.entries(spec.messages ?? {})) {
    out.push(series("oat_check_info", { ...id, check, message }, 1, at));
  }
  if (spec.promotion !== undefined) {
    out.push(
      series(
        "oat_promotion_status",
        { image: spec.image, tag: spec.tag },
        spec.promotion,
        at,
      ),
    );
  }
  for (const phase of ["before", "after"] as const) {
    for (const [severity, n] of Object.entries(spec.cve?.[phase] ?? {})) {
      out.push(
        series(
          "image_cve_total",
          { image: spec.image, tag: spec.tag, severity, phase },
          n,
          at,
        ),
      );
    }
  }
  return out;
}

export function queryResults(
  seriesList: TimeSeries[],
): Array<{ data: TimeSeriesData }> {
  return [
    {
      data: {
        series: seriesList,
        timeRange: { start: new Date(T0 - 3_600_000), end: new Date(T0) },
        stepMs: 15_000,
      },
    },
  ];
}

const PASS = 1;
const WARN = 0.5;
const FAIL = 0;
const SKIP = -1;

/**
 * debian-slim (blocked: health failed) -> python (skipped) -> app (skipped), plus alpine (passes)
 * -> nginx (warn on perf, promotion pending).
 */
export function chainFixture(): TimeSeries[] {
  return [
    ...imageSeries({
      image: "debian-slim",
      tag: "12.7-r1",
      runId: "run-100",
      checks: { start: PASS, health: FAIL, ports: SKIP, smoke: SKIP },
      durations: { start: 2.4, health: 30 },
      messages: { health: "healthcheck timed out after 30s" },
      promotion: 0,
      cve: {
        before: { critical: 2, high: 5 },
        after: { critical: 1, high: 1 },
      },
      runUrl: "https://ci.example.com/runs/run-100",
    }),
    ...imageSeries({
      image: "python",
      tag: "3.13-r1",
      runId: "run-101",
      base: ["debian-slim", "12.7-r1"],
      checks: { start: PASS, health: PASS, ports: SKIP, smoke: SKIP },
      promotion: 0,
    }),
    ...imageSeries({
      image: "app",
      tag: "1.4.0-r1",
      runId: "run-102",
      base: ["python", "3.13-r1"],
      checks: { start: SKIP, health: SKIP, ports: SKIP, smoke: SKIP },
      promotion: 0,
    }),
    ...imageSeries({
      image: "alpine",
      tag: "3.20-r1",
      runId: "run-200",
      checks: { start: PASS, health: PASS, ports: PASS, smoke: PASS },
      promotion: 1,
      cve: { before: { high: 3 }, after: {} },
    }),
    ...imageSeries({
      image: "nginx",
      tag: "1.27-r1",
      runId: "run-201",
      base: ["alpine", "3.20-r1"],
      checks: { start: PASS, health: PASS, ports: PASS, smoke: WARN },
      promotion: 0.5,
      cve: { before: { critical: 1, high: 4 }, after: { high: 2, medium: 7 } },
    }),
  ];
}

/** `bases` base images, each with dependents, `checks` checks per image: `images` rows in all. */
export function largeFixture(images = 200, checks = 10): TimeSeries[] {
  const checkNames = Array.from({ length: checks }, (_, i) => `check_${i}`);
  const out: TimeSeries[] = [];
  const bases = Math.max(1, Math.floor(images / 10));
  for (let i = 0; i < images; i++) {
    const isBase = i < bases;
    const values: Record<string, number> = {};
    checkNames.forEach((c, j) => {
      values[c] =
        (i * 7 + j) % 23 === 0 ? FAIL : (i + j) % 11 === 0 ? WARN : PASS;
    });
    out.push(
      ...imageSeries({
        image: `image-${String(i).padStart(3, "0")}`,
        tag: "1.0.0",
        runId: `run-${i}`,
        base: isBase
          ? undefined
          : [`image-${String(i % bases).padStart(3, "0")}`, "1.0.0"],
        checks: values,
        promotion: i % 3 === 0 ? 1 : i % 3 === 1 ? 0.5 : 0,
        cve: { before: { high: i % 5 }, after: { high: i % 2 } },
      }),
    );
  }
  return out;
}
