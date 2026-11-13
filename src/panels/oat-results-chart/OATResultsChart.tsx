import { PanelPlugin } from "@perses-dev/plugin-system";
import { OATResultsChartComponent } from "./OATResultsChartComponent";
import {
  OATResultsChartOptions,
  OATResultsChartProps,
  createInitialOATResultsChartOptions,
} from "./oat-results-chart-types";
import { OATResultsChartSettingsEditor } from "./OATResultsChartSettingsEditor";

/**
 * Operational acceptance test results per image: a base to dependent tree, one column per check,
 * CVEs before and after the rebuild, and the promotion gate.
 */
export const OATResultsChart: PanelPlugin<
  OATResultsChartOptions,
  OATResultsChartProps
> = {
  PanelComponent: OATResultsChartComponent,
  panelOptionsEditorComponents: [
    { label: "Settings", content: OATResultsChartSettingsEditor },
  ],
  supportedQueryTypes: ["TimeSeriesQuery"],
  createInitialOptions: createInitialOATResultsChartOptions,
};
