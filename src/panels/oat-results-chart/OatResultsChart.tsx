import type { PanelPlugin } from '@perses-dev/plugin-system';

import type { OatResultsChartOptions, OatResultsChartProps } from './oat-results-chart-types';
import { OatResultsChartComponent } from './OatResultsChartComponent';
import { OatResultsChartSettingsEditor } from './OatResultsChartSettingsEditor';

export const OatResultsChart: PanelPlugin<OatResultsChartOptions, OatResultsChartProps> = {
  PanelComponent: OatResultsChartComponent,
  panelOptionsEditorComponents: [{ label: 'Settings', content: OatResultsChartSettingsEditor }],
  supportedQueryTypes: ['TimeSeriesQuery'],
  createInitialOptions: () => ({}),
};
