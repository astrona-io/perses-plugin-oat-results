import { ReactElement } from "react";
import {
  Checkbox,
  FormControlLabel,
  FormGroup,
  Switch,
  TextField,
} from "@mui/material";
import {
  FormatControls,
  OptionsEditorColumn,
  OptionsEditorControl,
  OptionsEditorGrid,
  OptionsEditorGroup,
} from "@perses-dev/components";
import {
  DEFAULT_DURATION_FORMAT,
  DEFAULT_HISTORY_RUNS,
  DEFAULT_SEVERITY_FILTER,
  LinkTemplates,
  MAX_HISTORY_RUNS,
  MIN_HISTORY_RUNS,
  OATResultsChartEditorProps,
  OATResultsChartOptions,
  SEVERITIES,
  Severity,
} from "./oat-results-chart-types";

/** `"start, health"` to `["start", "health"]`; undefined when empty. */
export function parseList(text: string): string[] | undefined {
  const items = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? [...new Set(items)] : undefined;
}

/** One `name: Label` per line to `{ name: "Label" }`; undefined when empty. */
export function parseLabels(text: string): Record<string, string> | undefined {
  const labels: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.search(/[:=]/);
    if (at < 1) continue;
    const name = line.slice(0, at).trim();
    const label = line.slice(at + 1).trim();
    if (name && label) labels[name] = label;
  }
  return Object.keys(labels).length ? labels : undefined;
}

export function formatLabels(labels?: Record<string, string>): string {
  return Object.entries(labels ?? {})
    .map(([name, label]) => `${name}: ${label}`)
    .join("\n");
}

const LINK_FIELDS: Array<{
  key: keyof LinkTemplates;
  label: string;
  placeholder: string;
}> = [
  {
    key: "logs",
    label: "Logs link",
    placeholder: "https://logs.example.com/?q=${run_id}",
  },
  {
    key: "pipelineRun",
    label: "Pipeline run link",
    placeholder: "https://ci.example.com/runs/${run_id}",
  },
  {
    key: "diff",
    label: "Diff link",
    placeholder:
      "https://git.example.com/${image}/compare/${previous_tag}...${tag}",
  },
];

export function OATResultsChartSettingsEditor(
  props: OATResultsChartEditorProps,
): ReactElement {
  const { onChange, value } = props;
  const set = (patch: Partial<OATResultsChartOptions>): void =>
    onChange({ ...value, ...patch });

  const severities = value.severityFilter ?? DEFAULT_SEVERITY_FILTER;
  const toggleSeverity = (severity: Severity, on: boolean): void => {
    const next = SEVERITIES.filter((s) =>
      s === severity ? on : severities.includes(s),
    );
    set({ severityFilter: next.length ? next : undefined });
  };

  const setLink = (key: keyof LinkTemplates, text: string): void => {
    const links: LinkTemplates = { ...value.linkTemplates };
    if (text.trim()) links[key] = text.trim();
    else delete links[key];
    set({ linkTemplates: Object.keys(links).length ? links : undefined });
  };

  return (
    <OptionsEditorGrid>
      <OptionsEditorColumn>
        <OptionsEditorGroup title="Checks">
          <OptionsEditorControl
            label="Columns"
            description="Comma-separated check names, in column order. Every check in the data, in pipeline order, when empty"
            control={
              <TextField
                key={(value.checks ?? []).join(",")}
                size="small"
                placeholder="start, health, ports, smoke"
                defaultValue={(value.checks ?? []).join(", ")}
                inputProps={{ "aria-label": "Columns" }}
                onBlur={(e) => set({ checks: parseList(e.target.value) })}
              />
            }
          />
          <OptionsEditorControl
            label="Column names"
            description="One per line: check: Display name"
            control={
              <TextField
                key={formatLabels(value.checkLabels)}
                size="small"
                multiline
                minRows={2}
                placeholder={"llm_eval: LLM eval\nperf: Performance"}
                defaultValue={formatLabels(value.checkLabels)}
                inputProps={{ "aria-label": "Column names" }}
                onBlur={(e) =>
                  set({ checkLabels: parseLabels(e.target.value) })
                }
              />
            }
          />
        </OptionsEditorGroup>
        <OptionsEditorGroup title="Rows">
          <OptionsEditorControl
            label="Latest run per image"
            description="One row per image, its newest run. Off: one row per run"
            control={
              <Switch
                checked={value.showOnlyLatestPerImage ?? true}
                onChange={(_, showOnlyLatestPerImage) =>
                  set({ showOnlyLatestPerImage })
                }
                inputProps={{ "aria-label": "Latest run per image" }}
              />
            }
          />
          <OptionsEditorControl
            label="History"
            description="A sparkline per row: pass rate over the last runs"
            control={
              <Switch
                checked={value.showHistory ?? false}
                onChange={(_, showHistory) => set({ showHistory })}
                inputProps={{ "aria-label": "History" }}
              />
            }
          />
          <OptionsEditorControl
            label="History runs"
            description={`Runs in the sparkline, ${MIN_HISTORY_RUNS} to ${MAX_HISTORY_RUNS}`}
            control={
              <TextField
                size="small"
                type="number"
                disabled={!(value.showHistory ?? false)}
                value={value.historyRuns ?? DEFAULT_HISTORY_RUNS}
                inputProps={{
                  min: MIN_HISTORY_RUNS,
                  max: MAX_HISTORY_RUNS,
                  "aria-label": "History runs",
                }}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (Number.isFinite(n)) {
                    set({
                      historyRuns: Math.min(
                        MAX_HISTORY_RUNS,
                        Math.max(MIN_HISTORY_RUNS, n),
                      ),
                    });
                  }
                }}
              />
            }
          />
        </OptionsEditorGroup>
        <OptionsEditorGroup title="CVEs">
          <OptionsEditorControl
            label="Severities"
            description="Summed in the CVE column"
            control={
              <FormGroup row>
                {SEVERITIES.map((severity) => (
                  <FormControlLabel
                    key={severity}
                    label={severity}
                    control={
                      <Checkbox
                        size="small"
                        checked={severities.includes(severity)}
                        onChange={(_, on) => toggleSeverity(severity, on)}
                      />
                    }
                  />
                ))}
              </FormGroup>
            }
          />
        </OptionsEditorGroup>
      </OptionsEditorColumn>
      <OptionsEditorColumn>
        <OptionsEditorGroup title="Links">
          {LINK_FIELDS.map(({ key, label, placeholder }) => (
            <OptionsEditorControl
              key={key}
              label={label}
              description="Variables: ${image} ${tag} ${run_id} ${check} ${base_image} ${base_tag} ${previous_tag} ${run_url}, and dashboard variables"
              control={
                <TextField
                  key={value.linkTemplates?.[key] ?? ""}
                  size="small"
                  placeholder={placeholder}
                  defaultValue={value.linkTemplates?.[key] ?? ""}
                  inputProps={{ "aria-label": label }}
                  onBlur={(e) => setLink(key, e.target.value)}
                />
              }
            />
          ))}
        </OptionsEditorGroup>
        <OptionsEditorGroup title="Duration">
          <FormatControls
            value={value.durationFormat ?? DEFAULT_DURATION_FORMAT}
            onChange={(durationFormat) => set({ durationFormat })}
          />
        </OptionsEditorGroup>
      </OptionsEditorColumn>
    </OptionsEditorGrid>
  );
}
