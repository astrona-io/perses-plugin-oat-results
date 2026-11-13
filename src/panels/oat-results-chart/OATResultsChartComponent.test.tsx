import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariableStateMap } from "@perses-dev/plugin-system";
import {
  chainFixture,
  largeFixture,
  queryResults,
  series,
} from "../../test-utils/fixtures";
import { OATResultsChartComponent } from "./OATResultsChartComponent";
import {
  OATResultsChartOptions,
  OATResultsChartProps,
} from "./oat-results-chart-types";

const MOCK_VARIABLES: VariableStateMap = {
  env: { value: "prod", loading: false },
};

jest.mock("@perses-dev/plugin-system", () => ({
  ...jest.requireActual("@perses-dev/plugin-system"),
  useAllVariableValues: (): VariableStateMap => MOCK_VARIABLES,
}));

function renderPanel(
  results: OATResultsChartProps["queryResults"],
  spec: OATResultsChartOptions = {},
): ReturnType<typeof render> {
  return render(
    <OATResultsChartComponent
      spec={spec}
      queryResults={results}
      contentDimensions={{ width: 900, height: 500 }}
    />,
  );
}

function asQueryResults(
  results: ReturnType<typeof queryResults>,
): OATResultsChartProps["queryResults"] {
  return results.map((r) => ({
    definition: {
      kind: "TimeSeriesQuery",
      spec: { plugin: { kind: "PrometheusTimeSeriesQuery", spec: {} } },
    },
    data: r.data,
  })) as unknown as OATResultsChartProps["queryResults"];
}

describe("OATResultsChartComponent", () => {
  it("says there is no data for empty results", () => {
    renderPanel([]);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("explains the contract when the series are not OAT metrics", () => {
    renderPanel(asQueryResults(queryResults([series("up", { job: "x" }, 1)])));
    expect(
      screen.getByText("No OAT metrics in the query results"),
    ).toBeInTheDocument();
    expect(screen.getByText(/oat_check_result/)).toBeInTheDocument();
  });

  it("does not throw on malformed series", () => {
    const bad = asQueryResults(
      queryResults([
        { name: "x", values: [] },
        {
          name: "y",
          labels: { __name__: "oat_check_result", image: "a" },
          values: [[1, Number.NaN]],
        },
        {
          name: "z",
          labels: { __name__: "image_cve_total", image: "a", phase: "x" },
          values: [[1, 3]],
        },
      ]),
    );
    expect(() => renderPanel(bad)).not.toThrow();
  });

  it("renders the tree with bold bases, indented dependents and a note on skipped rows", () => {
    renderPanel(asQueryResults(queryResults(chainFixture())));
    const table = screen.getByRole("table", { name: "OAT results" });
    const rowHeaders = within(table)
      .getAllByRole("rowheader")
      .map((th) => th.querySelector(".oat-image")!.textContent);
    expect(rowHeaders).toEqual([
      "alpine",
      "nginx",
      "debian-slim",
      "python",
      "app",
    ]);
    expect(screen.getByText("debian-slim")).toHaveClass("oat-base");
    expect(screen.getByText("app")).not.toHaveClass("oat-base");

    const appRow = screen.getByText("app").closest("tr")!;
    expect(appRow).toHaveTextContent(
      "Skipped: base python:3.13-r1 is blocked (promotion blocked)",
    );
    const baseRow = screen.getByText("debian-slim").closest("tr")!;
    expect(baseRow).toHaveTextContent(
      "Blocked (Health failed): holds back 2 dependents",
    );
    expect(
      within(baseRow).getByRole("button", {
        name: "debian-slim:12.7-r1 Health: Fail",
      }),
    ).toBeInTheDocument();
    expect(baseRow).toHaveTextContent("7 → 2");
    expect(within(baseRow).getByText("Blocked")).toBeInTheDocument();
  });

  it("opens the detail strip on click and closes it again", async () => {
    const user = userEvent.setup();
    renderPanel(asQueryResults(queryResults(chainFixture())), {
      linkTemplates: {
        logs: "https://logs.example.com/?q=${run_id}&env=${env}",
      },
    });
    await user.click(
      screen.getByRole("button", { name: "debian-slim:12.7-r1 Health: Fail" }),
    );
    const strip = screen.getByRole("region", {
      name: "Details: debian-slim:12.7-r1 Health",
    });
    expect(strip).toHaveTextContent("healthcheck timed out after 30s");
    expect(strip).toHaveTextContent("Duration30.0s");
    expect(strip).toHaveTextContent("run-100");
    expect(within(strip).getByRole("link", { name: /Logs/ })).toHaveAttribute(
      "href",
      "https://logs.example.com/?q=run-100&env=prod",
    );
    expect(
      within(strip).getByRole("link", { name: /Pipeline run/ }),
    ).toHaveAttribute("href", "https://ci.example.com/runs/run-100");

    await user.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows why a dependent's check was skipped and its base image", async () => {
    const user = userEvent.setup();
    renderPanel(asQueryResults(queryResults(chainFixture())));
    await user.click(
      screen.getByRole("button", { name: /^app:1\.4\.0-r1 Start: Skipped/ }),
    );
    const strip = screen.getByRole("region");
    expect(strip).toHaveTextContent(
      "Why skippedbase python:3.13-r1 is blocked (promotion blocked)",
    );
    expect(strip).toHaveTextContent("Base imagepython:3.13-r1");
  });

  it("is keyboard reachable: tab to a cell, Enter opens it, toggles collapse", async () => {
    const user = userEvent.setup();
    renderPanel(asQueryResults(queryResults(chainFixture())));
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName(
      "Collapse dependents of alpine:3.20-r1",
    );
    await user.keyboard("{Enter}");
    expect(screen.queryByText("nginx")).not.toBeInTheDocument();
    expect(screen.getByText("(+1 hidden)")).toBeInTheDocument();

    await user.tab();
    expect(document.activeElement).toHaveAccessibleName(
      "alpine:3.20-r1 Start: Pass",
    );
    await user.keyboard("{Enter}");
    expect(document.activeElement).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("collapses a two-level chain from its root", async () => {
    const user = userEvent.setup();
    renderPanel(asQueryResults(queryResults(chainFixture())));
    await user.click(
      screen.getByRole("button", {
        name: "Collapse dependents of debian-slim:12.7-r1",
      }),
    );
    expect(screen.queryByText("python")).not.toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("shows check labels and a history column when enabled", () => {
    renderPanel(asQueryResults(queryResults(chainFixture())), {
      checkLabels: { smoke: "Smoke test" },
      showHistory: true,
    });
    expect(
      screen.getByRole("columnheader", { name: "Smoke test" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "History" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: /^Pass rate over the last 1 runs/ }),
    ).toHaveLength(5);
  });

  it("renders 200 images x 10 checks", () => {
    const started = performance.now();
    renderPanel(asQueryResults(queryResults(largeFixture(200, 10))));
    const elapsed = performance.now() - started;
    expect(screen.getAllByRole("rowheader")).toHaveLength(200);
    expect(screen.getAllByRole("columnheader")).toHaveLength(13);
    // Generous bound for slow CI runners; locally this is well under a second.
    expect(elapsed).toBeLessThan(5000);
  });
});
