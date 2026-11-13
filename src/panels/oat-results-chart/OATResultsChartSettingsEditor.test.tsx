import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  OATResultsChartSettingsEditor,
  formatLabels,
  parseLabels,
  parseList,
} from "./OATResultsChartSettingsEditor";
import {
  OATResultsChartOptions,
  createInitialOATResultsChartOptions,
} from "./oat-results-chart-types";

function renderEditor(value: OATResultsChartOptions): jest.Mock {
  const onChange = jest.fn();
  render(<OATResultsChartSettingsEditor value={value} onChange={onChange} />);
  return onChange;
}

describe("parsers", () => {
  it("parses a comma list, trimmed and without duplicates", () => {
    expect(parseList(" start, health,,start ")).toEqual(["start", "health"]);
    expect(parseList(" ")).toBeUndefined();
  });

  it("parses check labels one per line, with : or =", () => {
    expect(
      parseLabels("llm_eval: LLM eval\nperf=Performance\nbad\n:x"),
    ).toEqual({ llm_eval: "LLM eval", perf: "Performance" });
    expect(parseLabels("")).toBeUndefined();
    expect(formatLabels({ a: "A", b: "B" })).toBe("a: A\nb: B");
  });
});

describe("OATResultsChartSettingsEditor", () => {
  it("starts from the documented defaults", () => {
    expect(createInitialOATResultsChartOptions()).toEqual({
      severityFilter: ["critical", "high"],
      showOnlyLatestPerImage: true,
      showHistory: false,
      historyRuns: 10,
    });
  });

  it("sets the check columns on blur", () => {
    const onChange = renderEditor({});
    const input = screen.getByRole("textbox", { name: "Columns" });
    fireEvent.change(input, { target: { value: "smoke, start" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith({ checks: ["smoke", "start"] });
  });

  it("sets column names on blur", () => {
    const onChange = renderEditor({});
    const input = screen.getByRole("textbox", { name: "Column names" });
    fireEvent.change(input, { target: { value: "perf: Performance" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith({
      checkLabels: { perf: "Performance" },
    });
  });

  it("toggles a severity, keeping the canonical order", async () => {
    const onChange = renderEditor(createInitialOATResultsChartOptions());
    await userEvent.click(screen.getByRole("checkbox", { name: "medium" }));
    expect(onChange.mock.lastCall[0].severityFilter).toEqual([
      "critical",
      "high",
      "medium",
    ]);
  });

  it("sets and clears a link template", () => {
    const onChange = renderEditor({
      linkTemplates: { logs: "https://logs/${run_id}" },
    });
    const diff = screen.getByRole("textbox", { name: "Diff link" });
    fireEvent.change(diff, { target: { value: "https://git/${tag}" } });
    fireEvent.blur(diff);
    expect(onChange).toHaveBeenLastCalledWith({
      linkTemplates: {
        logs: "https://logs/${run_id}",
        diff: "https://git/${tag}",
      },
    });
    const logs = screen.getByRole("textbox", { name: "Logs link" });
    fireEvent.change(logs, { target: { value: " " } });
    fireEvent.blur(logs);
    expect(onChange).toHaveBeenLastCalledWith({ linkTemplates: undefined });
  });

  it("switches rows and history, and clamps history runs", async () => {
    const onChange = renderEditor({ showHistory: true });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Latest run per image" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      showHistory: true,
      showOnlyLatestPerImage: false,
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "History runs" }), {
      target: { value: "500" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      showHistory: true,
      historyRuns: 50,
    });
  });
});
