import { ReactElement, useCallback, useMemo, useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { buildModel, checkLabel, METRICS, visibleRows } from "./data";
import { DetailStrip } from "./DetailStrip";
import { ImageRow } from "./ImageRow";
import {
  DEFAULT_DURATION_FORMAT,
  DEFAULT_HISTORY_RUNS,
  DEFAULT_SEVERITY_FILTER,
  OATResultsChartProps,
} from "./oat-results-chart-types";
import { CHECK_STATUS_META, CHECK_STATUS_ORDER } from "./status";
import { resolveColours } from "./colours";

interface Selection {
  rowId: string;
  check: string;
}

const EXPECTED_METRICS = [
  METRICS.checkResult,
  METRICS.imageInfo,
  METRICS.cveTotal,
  METRICS.promotion,
];

export function OATResultsChartComponent(
  props: OATResultsChartProps,
): ReactElement {
  const { queryResults, spec, contentDimensions } = props;
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selection, setSelection] = useState<Selection | undefined>();

  const showHistory = spec.showHistory ?? false;
  const severityFilter = spec.severityFilter?.length
    ? spec.severityFilter
    : DEFAULT_SEVERITY_FILTER;

  const model = useMemo(
    () =>
      buildModel(queryResults, {
        checks: spec.checks,
        checkLabels: spec.checkLabels,
        severityFilter: spec.severityFilter,
        showOnlyLatestPerImage: spec.showOnlyLatestPerImage,
        historyRuns: spec.historyRuns,
      }),
    [
      queryResults,
      spec.checks,
      spec.checkLabels,
      spec.severityFilter,
      spec.showOnlyLatestPerImage,
      spec.historyRuns,
    ],
  );
  const rows = useMemo(
    () => visibleRows(model.rows, collapsed),
    [model.rows, collapsed],
  );
  const colours = useMemo(() => resolveColours(theme), [theme]);

  const summary = useMemo(() => {
    let blocked = 0;
    let pending = 0;
    for (const row of model.rows) {
      if (row.promotion === "blocked" || (!row.promotion && row.blocked))
        blocked++;
      if (row.promotion === "pending") pending++;
    }
    return { total: model.rows.length, blocked, pending };
  }, [model.rows]);

  const onToggle = useCallback((rowId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);
  const onSelect = useCallback((rowId: string, check: string) => {
    setSelection((prev) =>
      prev && prev.rowId === rowId && prev.check === check
        ? undefined
        : { rowId, check },
    );
  }, []);
  const onClose = useCallback(() => setSelection(undefined), []);

  const height = contentDimensions?.height;
  const width = contentDimensions?.width;

  if (model.status !== "ok") {
    return (
      <Box
        sx={{
          height,
          width,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          p: 2,
          gap: 0.5,
        }}
      >
        <Typography variant="body2">
          {model.status === "no-data"
            ? "No data"
            : "No OAT metrics in the query results"}
        </Typography>
        {model.status === "no-oat-metrics" && (
          <Typography variant="caption" color="text.secondary">
            Expected series named {EXPECTED_METRICS.join(", ")} with an image
            label. Keep the metric name in the query, for example{" "}
            <code>{'{__name__=~"oat_.+|image_cve_total"}'}</code>.
          </Typography>
        )}
      </Box>
    );
  }

  const selectedRow = selection
    ? model.rowsById.get(selection.rowId)
    : undefined;

  return (
    <Box
      sx={{
        height,
        width,
        display: "flex",
        flexDirection: "column",
        fontSize: "0.8125rem",
        color: "text.primary",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 1.5,
          rowGap: 0.25,
          px: 0.5,
          pb: 0.5,
          color: "text.secondary",
          fontSize: "0.75rem",
        }}
      >
        <span>
          {summary.total} image{summary.total === 1 ? "" : "s"} ·{" "}
          {summary.blocked} blocked · {summary.pending} pending
        </span>
        <Box
          component="ul"
          aria-label="Legend"
          sx={{
            display: "flex",
            gap: 1.25,
            m: 0,
            p: 0,
            listStyle: "none",
            ml: "auto",
          }}
        >
          {CHECK_STATUS_ORDER.map((status) => {
            const meta = CHECK_STATUS_META[status];
            return (
              <Box
                component="li"
                key={status}
                sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
              >
                <meta.Icon
                  fontSize="inherit"
                  style={{ color: colours[status] }}
                  aria-hidden="true"
                />
                {meta.label}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          "& table": {
            borderCollapse: "separate",
            borderSpacing: 0,
            width: "100%",
          },
          "& th, & td": {
            borderBottom: 1,
            borderColor: "divider",
            px: 0.5,
            py: 0.25,
            whiteSpace: "nowrap",
            textAlign: "center",
            fontWeight: "normal",
          },
          "& thead th": {
            position: "sticky",
            top: 0,
            zIndex: 2,
            backgroundColor: "background.paper",
            color: "text.secondary",
            fontWeight: 600,
            fontSize: "0.75rem",
          },
          "& thead th:first-of-type": { left: 0, zIndex: 3, textAlign: "left" },
          "& .oat-name": {
            position: "sticky",
            left: 0,
            zIndex: 1,
            backgroundColor: "background.paper",
            textAlign: "left",
          },
          "& .oat-name-line": { display: "flex", alignItems: "center" },
          "& .oat-image": { fontWeight: 400 },
          "& .oat-base": { fontWeight: 700 },
          "& .oat-tag, & .oat-muted": { color: "text.secondary" },
          "& .oat-note": {
            fontSize: "0.7rem",
            pl: 2.5,
            whiteSpace: "normal",
            maxWidth: 360,
          },
          "& .oat-toggle, & .oat-status": {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: 0,
            borderRadius: 1,
            p: 0.25,
            cursor: "pointer",
            color: "inherit",
            fontSize: "1.1rem",
          },
          "& .oat-toggle-spacer": {
            display: "inline-flex",
            width: "1.6rem",
            justifyContent: "center",
            color: "text.disabled",
          },
          "& .oat-status:hover": { backgroundColor: "action.hover" },
          "& .oat-toggle:focus-visible, & .oat-status:focus-visible": {
            outline: 2,
            outlineColor: "primary.main",
            outlineStyle: "solid",
          },
          "& .oat-selected": {
            backgroundColor: "action.selected",
            boxShadow: `inset 0 0 0 1px ${theme.palette.text.primary}`,
          },
          "& .oat-none": { color: "text.disabled" },
          "& .oat-sev": { fontSize: "0.7rem", color: "text.secondary" },
          "& .oat-chip": {
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            border: 1,
            borderRadius: 4,
            px: 0.75,
            fontSize: "0.75rem",
            lineHeight: 1.6,
          },
        }}
      >
        <table aria-label="OAT results">
          <thead>
            <tr>
              <th scope="col">Image</th>
              {model.checks.map((check) => (
                <th scope="col" key={check} title={check}>
                  {checkLabel(check, spec.checkLabels)}
                </th>
              ))}
              <th
                scope="col"
                title={`CVEs (${severityFilter.join(" + ")}) before → after the rebuild`}
              >
                CVEs
              </th>
              <th scope="col">Gate</th>
              {showHistory && (
                <th
                  scope="col"
                  title={`Pass rate over the last ${spec.historyRuns ?? DEFAULT_HISTORY_RUNS} runs`}
                >
                  History
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ImageRow
                key={row.id}
                row={row}
                checks={model.checks}
                checkLabels={spec.checkLabels}
                colours={colours}
                selectedCheck={
                  selection?.rowId === row.id ? selection.check : undefined
                }
                collapsed={collapsed.has(row.id)}
                showHistory={showHistory}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </Box>
      {selection && selectedRow && (
        <DetailStrip
          row={selectedRow}
          check={selection.check}
          checkLabels={spec.checkLabels}
          linkTemplates={spec.linkTemplates}
          durationFormat={spec.durationFormat ?? DEFAULT_DURATION_FORMAT}
          colours={colours}
          onClose={onClose}
        />
      )}
    </Box>
  );
}
