import { ReactElement } from "react";

export interface SparklineProps {
  /** Values between 0 and 1, oldest first; null is a gap. */
  values: Array<number | null>;
  colour: string;
  emptyColour: string;
  width?: number;
  height?: number;
}

const PAD = 2;

function percent(value: number | null): string {
  return value === null ? "no result" : `${Math.round(value * 100)}%`;
}

/** Pass rate over the last runs as a small line; the last run is a dot. */
export function Sparkline(props: SparklineProps): ReactElement {
  const { values, colour, emptyColour, width = 64, height = 18 } = props;
  const label = values.length
    ? `Pass rate over the last ${values.length} runs, oldest first: ${values.map(percent).join(", ")}`
    : "No runs";
  const step = values.length > 1 ? (width - PAD * 2) / (values.length - 1) : 0;
  const x = (i: number): number =>
    values.length > 1 ? PAD + i * step : width / 2;
  const y = (v: number): number => PAD + (1 - v) * (height - PAD * 2);

  // Split at gaps so a run without a result does not draw a line through it.
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (current.length) segments.push(current.join(" "));

  const lastIndex = values.length - 1;
  const last = values[lastIndex];

  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      <title>{label}</title>
      <line
        x1={PAD}
        x2={width - PAD}
        y1={height - PAD}
        y2={height - PAD}
        stroke={emptyColour}
        strokeWidth={1}
      />
      {segments.map((points) => (
        <polyline
          key={points}
          points={points}
          fill="none"
          stroke={colour}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
      {last !== null && last !== undefined && (
        <circle cx={x(lastIndex)} cy={y(last)} r={2} fill={colour} />
      )}
    </svg>
  );
}
