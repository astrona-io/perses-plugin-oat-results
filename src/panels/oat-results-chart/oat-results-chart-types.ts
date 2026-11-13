import type { ThresholdOptions } from '@perses-dev/components';
import type { PanelProps, LegendSpecOptions } from '@perses-dev/plugin-system';
import type { TimeSeriesData } from '@perses-dev/spec';

export type QueryData = TimeSeriesData; // Type of data returned by a query plugin and supported by this plugin

export type OatResultsChartProps = PanelProps<OatResultsChartOptions, QueryData>;

export interface QuerySettingsOptions {
  queryIndex: number;
  colorMode: 'fixed' | 'fixed-single';
  colorValue: string;
}

export interface OatResultsChartOptions {
  legend?: LegendSpecOptions;
  thresholds?: ThresholdOptions;
  querySettings?: QuerySettingsOptions;
}
