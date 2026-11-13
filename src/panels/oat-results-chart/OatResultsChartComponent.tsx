import type { ReactElement } from 'react';

import type { OatResultsChartProps } from './oat-results-chart-types';

export function OatResultsChartComponent(props: OatResultsChartProps): ReactElement | null {
  const { queryResults, spec } = props;

  console.log('Panel data', queryResults);
  console.log('Panel spec', spec);

  // TODO: implement your awesome panel component here

  return <div>Panel goes here!</div>;
}
