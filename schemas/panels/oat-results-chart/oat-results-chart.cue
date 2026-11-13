package model

import (
	"github.com/perses/shared/cue/common"
)

#checkName: string & =~"^[a-zA-Z_][a-zA-Z0-9_.-]*$"

#severity: "critical" | "high" | "medium" | "low" | "unknown"

kind: "OATResultsChart"
spec: close({
	// Check columns, in order. Every check found in the data, in pipeline order, when unset.
	checks?: [...#checkName]
	// Column header per check name, e.g. {"llm_eval": "LLM eval"}.
	checkLabels?: [#checkName]: string & !=""
	// Severities summed in the CVE column. critical and high when unset.
	severityFilter?: [...#severity]
	// Link templates for the detail strip. Variables: ${image} ${tag} ${run_id} ${check}
	// ${base_image} ${base_tag} ${previous_tag} ${run_url}, plus dashboard variables.
	linkTemplates?: close({
		logs?:        string & !=""
		pipelineRun?: string & !=""
		diff?:        string & !=""
	})
	// One row per image (its newest run). false: one row per run. Default true.
	showOnlyLatestPerImage?: bool
	// A pass-rate sparkline per row. Default false.
	showHistory?: bool
	// Runs in the sparkline. Default 10.
	historyRuns?: int & >=2 & <=50
	// How check durations are shown in the detail strip.
	durationFormat?: common.#format
})
