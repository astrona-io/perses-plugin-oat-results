import {
  chainFixture,
  imageSeries,
  largeFixture,
  queryResults,
  series,
} from "../../test-utils/fixtures";
import {
  buildModel,
  lastSample,
  orderChecks,
  statusFromValue,
  visibleRows,
} from "./data";

describe("statusFromValue", () => {
  it.each([
    [1, "pass"],
    [0.9999999, "pass"],
    [0.5, "warn"],
    [0, "fail"],
    [0.0000001, "fail"],
    [-1, "skipped"],
    [7, "unknown"],
  ])("maps %p to %p", (value, status) => {
    expect(statusFromValue(value)).toBe(status);
  });
});

describe("lastSample", () => {
  it("skips trailing nulls and non-finite values", () => {
    const sample = lastSample({
      name: "x",
      values: [
        [1000, 1],
        [2000, 0.5],
        [3000, null],
        [4000, Number.NaN],
      ],
    });
    expect(sample).toEqual({ value: 0.5, at: 2000, firstAt: 1000 });
  });

  it("is undefined for an all-null series", () => {
    expect(lastSample({ name: "x", values: [[1, null]] })).toBeUndefined();
  });
});

describe("orderChecks", () => {
  it("puts known pipeline checks first, then the rest by name", () => {
    expect(orderChecks(["zeta", "smoke", "start", "alpha", "health"])).toEqual([
      "start",
      "health",
      "smoke",
      "alpha",
      "zeta",
    ]);
  });
});

describe("buildModel", () => {
  it("reports no data for empty results", () => {
    expect(buildModel([]).status).toBe("no-data");
    expect(buildModel([{ data: undefined }]).status).toBe("no-data");
    expect(buildModel(queryResults([])).status).toBe("no-data");
  });

  it("reports missing OAT metrics when series carry other names", () => {
    const model = buildModel(
      queryResults([
        series("up", { job: "x" }, 1),
        { name: "no labels", values: [[1, 1]] },
      ]),
    );
    expect(model.status).toBe("no-oat-metrics");
    expect(model.ignoredSeries).toBe(2);
  });

  it("builds a two-level chain under its base, depth first", () => {
    const model = buildModel(queryResults(chainFixture()));
    expect(model.status).toBe("ok");
    expect(model.rows.map((r) => [r.image, r.depth])).toEqual([
      ["alpine", 0],
      ["nginx", 1],
      ["debian-slim", 0],
      ["python", 1],
      ["app", 2],
    ]);
    const python = model.rowsById.get("python")!;
    expect(python.parentId).toBe("debian-slim");
    expect(python.childIds).toEqual(["app"]);
    expect(model.rowsById.get("app")!.parentId).toBe("python");
  });

  it("orders check columns in pipeline order when no checks are configured", () => {
    const model = buildModel(queryResults(chainFixture()));
    expect(model.checks).toEqual(["start", "health", "ports", "smoke"]);
  });

  it("uses the configured checks as columns, in their order", () => {
    const model = buildModel(queryResults(chainFixture()), {
      checks: ["smoke", "start"],
    });
    expect(model.checks).toEqual(["smoke", "start"]);
  });

  it("explains why a blocked base's dependents are skipped, through the whole chain", () => {
    const model = buildModel(queryResults(chainFixture()));
    const base = model.rowsById.get("debian-slim")!;
    expect(base.blocked).toBe(true);
    expect(base.blockReason).toBe("Health failed");
    expect(base.blockedDependents).toBe(2);
    // Skipped after an earlier failure in the same run.
    expect(base.checks.ports!.skipReason).toBe(
      "Health failed earlier in this run",
    );

    const python = model.rowsById.get("python")!;
    expect(python.blocked).toBe(true); // promotion blocked
    expect(python.blockedDependents).toBe(1);
    expect(python.blockedBy).toMatchObject({
      image: "debian-slim",
      tag: "12.7-r1",
      reason: "Health failed",
    });
    expect(python.checks.ports!.skipReason).toBe(
      "base debian-slim:12.7-r1 is blocked (Health failed)",
    );

    const app = model.rowsById.get("app")!;
    expect(app.hasSkipped).toBe(true);
    expect(app.blockedBy?.image).toBe("python");
    expect(app.checks.start!.skipReason).toBe(
      "base python:3.13-r1 is blocked (promotion blocked)",
    );
  });

  it("carries message, duration, run URL and promotion", () => {
    const model = buildModel(queryResults(chainFixture()));
    const base = model.rowsById.get("debian-slim")!;
    expect(base.checks.health).toMatchObject({
      status: "fail",
      message: "healthcheck timed out after 30s",
      durationSeconds: 30,
    });
    expect(base.runUrl).toBe("https://ci.example.com/runs/run-100");
    expect(base.promotion).toBe("blocked");
    expect(model.rowsById.get("nginx")!.promotion).toBe("pending");
    expect(model.rowsById.get("alpine")!.promotion).toBe("promoted");
  });

  it("sums CVEs for the severity filter and reports the worst left", () => {
    const results = queryResults(chainFixture());
    const nginx = buildModel(results).rowsById.get("nginx")!;
    expect(nginx.cve).toEqual({ before: 5, after: 2, worstAfter: "high" });

    const withMedium = buildModel(results, {
      severityFilter: ["critical", "high", "medium"],
    }).rowsById.get("nginx")!;
    expect(withMedium.cve).toEqual({ before: 5, after: 9, worstAfter: "high" });

    const alpine = buildModel(results).rowsById.get("alpine")!;
    expect(alpine.cve).toEqual({ before: 3, after: 0, worstAfter: undefined });
  });

  it("keeps only the newest run per image, by run timestamp", () => {
    const results = queryResults([
      ...imageSeries({
        image: "redis",
        tag: "7.4-r2",
        runId: "b",
        startedAt: 2000,
        checks: { start: 1 },
      }),
      ...imageSeries({
        image: "redis",
        tag: "7.4-r1",
        runId: "a",
        startedAt: 1000,
        checks: { start: 0 },
      }),
    ]);
    const latest = buildModel(results);
    expect(latest.rows).toHaveLength(1);
    expect(latest.rows[0]).toMatchObject({
      tag: "7.4-r2",
      runId: "b",
      previousTag: "7.4-r1",
    });
    expect(latest.rows[0]!.history).toEqual([0, 1]);

    const all = buildModel(results, { showOnlyLatestPerImage: false });
    expect(all.rows.map((r) => r.runId)).toEqual(["a", "b"]);
  });

  it("limits history to the configured number of runs and skips runs with no evaluated check", () => {
    const runs = [0, 1, 2, 3, 4].flatMap((i) =>
      imageSeries({
        image: "redis",
        tag: `r${i}`,
        runId: `run-${i}`,
        startedAt: 1000 + i,
        checks: i === 2 ? { start: -1 } : { start: 1, health: i % 2 },
      }),
    );
    const row = buildModel(queryResults(runs), { historyRuns: 3 }).rows[0]!;
    expect(row.history).toEqual([null, 1, 0.5]);
  });

  it("makes a row a root when its base is not in the data", () => {
    const model = buildModel(
      queryResults(
        imageSeries({
          image: "app",
          tag: "1",
          runId: "r",
          base: ["missing", "1"],
          checks: { start: 1 },
        }),
      ),
    );
    expect(model.rows[0]!.depth).toBe(0);
    expect(model.rows[0]!.parentId).toBeUndefined();
  });

  it("breaks cycles between base images", () => {
    const model = buildModel(
      queryResults([
        ...imageSeries({
          image: "a",
          tag: "1",
          runId: "r1",
          base: ["b", "1"],
          checks: { start: 1 },
        }),
        ...imageSeries({
          image: "b",
          tag: "1",
          runId: "r2",
          base: ["a", "1"],
          checks: { start: 1 },
        }),
      ]),
    );
    expect(model.rows).toHaveLength(2);
    expect(model.rows.filter((r) => r.depth === 0)).toHaveLength(1);
  });

  it("ignores series without an image label or with only null samples", () => {
    const model = buildModel(
      queryResults([
        series("oat_check_result", { check: "start" }, 1),
        {
          name: "x",
          labels: {
            __name__: "oat_check_result",
            image: "a",
            check: "start",
          },
          values: [[1, null]],
        },
        ...imageSeries({
          image: "b",
          tag: "1",
          runId: "r",
          checks: { start: 1 },
        }),
      ]),
    );
    expect(model.rows.map((r) => r.image)).toEqual(["b"]);
  });

  it("builds 200 images x 10 checks quickly", () => {
    const results = queryResults(largeFixture(200, 10));
    const started = performance.now();
    const model = buildModel(results);
    const elapsed = performance.now() - started;
    expect(model.rows).toHaveLength(200);
    expect(model.checks).toHaveLength(10);
    expect(model.rows.filter((r) => r.depth === 1)).toHaveLength(180);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("visibleRows", () => {
  it("hides every descendant of a collapsed row", () => {
    const { rows } = buildModel(queryResults(chainFixture()));
    expect(
      visibleRows(rows, new Set(["debian-slim"])).map((r) => r.image),
    ).toEqual(["alpine", "nginx", "debian-slim"]);
    expect(visibleRows(rows, new Set(["python"])).map((r) => r.image)).toEqual([
      "alpine",
      "nginx",
      "debian-slim",
      "python",
    ]);
  });
});
