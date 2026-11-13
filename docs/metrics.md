# Metric contract

`OATResultsChart` reads Prometheus-style time series. A pipeline that tests rebuilt images reports
its results as the metrics below, usually through a [Pushgateway](https://github.com/prometheus/pushgateway)
that Prometheus scrapes. `dev/oat-push.sh` is a reference pusher that writes exactly this contract.

## Metrics

| Metric                       | Labels                                                        | Value                                         | Required |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------- | -------- |
| `oat_check_result`           | `image`, `tag`, `run_id`, `check`                             | 1 pass, 0.5 warn, 0 fail, -1 skipped          | yes      |
| `oat_image_info`             | `image`, `tag`, `run_id`, `base_image`, `base_tag`, `run_url` | always 1                                      | yes      |
| `oat_check_duration_seconds` | `image`, `tag`, `run_id`, `check`                             | seconds the check ran                         | no       |
| `oat_check_info`             | `image`, `tag`, `run_id`, `check`, `message`                  | always 1; `message` explains a warn or a fail | no       |
| `image_cve_total`            | `image`, `tag`, `severity`, `phase`                           | CVE count; `phase` is `before` or `after`     | no       |
| `oat_promotion_status`       | `image`, `tag`                                                | 1 promoted, 0.5 pending, 0 blocked            | no       |
| `oat_run_timestamp_seconds`  | `image`, `tag`, `run_id`                                      | Unix time the run started                     | no       |

- **`image`** is the repository without the tag (`python`, `library/nginx`, `team/api`), and
  **`tag`** the tag that was tested. **`run_id`** identifies one pipeline run; it ties the checks,
  the image info and the links together.
- **`check`** is a short, stable name: `start`, `health`, `ports`, `smoke`, `perf`, `sbom`,
  `signature`, `llm_eval` are ordered and labelled out of the box; any other name works and comes
  after them, alphabetically, unless the panel's `checks` option sets the order.
- **`base_image`** and **`base_tag`** name the image this one is built on. They are what makes the
  tree: a row sits under the row of its base image. Leave them empty for a base image. Chains of any
  depth work (`debian-slim` then `python` then `api`).
- **`run_url`** is a link to the run in your CI. The panel's `${run_url}` link variable inserts it
  as it is.
- **`severity`** is `critical`, `high`, `medium`, `low` or `unknown`. The panel sums the severities
  in its `severityFilter` (critical and high by default) into "before → after".
- **Skipped** (-1) means the check did not run: an earlier check in the same run failed, or the base
  image is blocked. The panel explains which, on the row and in the detail strip.
- **Pass, warn, fail**: values are read in bands (below 0.25 fail, below 0.75 warn, up to 1 pass), so
  a value averaged by a recording rule still lands on a status.
- `oat_run_timestamp_seconds` orders runs. Without it the panel uses the first sample it sees of
  each run, which is fine as long as the time range covers the runs.

`oat_check_info` and the message on it are optional. Keep messages short and free of secrets: they
are label values, stored by Prometheus and shown to everyone who can open the dashboard.

### Example series

```text
oat_image_info{image="python",tag="3.13.1-r42",run_id="8812",base_image="debian-slim",base_tag="12.8-r42",run_url="https://ci.example.com/runs/8812"} 1
oat_run_timestamp_seconds{image="python",tag="3.13.1-r42",run_id="8812"} 1763040000
oat_check_result{image="python",tag="3.13.1-r42",run_id="8812",check="start"} -1
oat_check_result{image="debian-slim",tag="12.8-r42",run_id="8811",check="health"} 0
oat_check_duration_seconds{image="debian-slim",tag="12.8-r42",run_id="8811",check="health"} 12.4
oat_check_info{image="debian-slim",tag="12.8-r42",run_id="8811",check="health",message="healthcheck exited 1 after 3 retries"} 1
image_cve_total{image="python",tag="3.13.1-r42",severity="critical",phase="before"} 2
image_cve_total{image="python",tag="3.13.1-r42",severity="critical",phase="after"} 0
oat_promotion_status{image="debian-slim",tag="12.8-r42"} 0
```

## Query

The panel tells the metrics apart by their `__name__` label, so the query must keep metric names. One
selector is enough for the whole panel:

```promql
{__name__=~"oat_.+|image_cve_total"}
```

Narrow it with labels as usual, for example `{__name__=~"oat_.+|image_cve_total", image=~"$image"}`.
Several queries on one panel work too; their series are merged. Avoid aggregations that drop
`__name__` (`sum`, `max by`, ...) unless you add it back with `label_replace`.

Each series counts with its last sample in the dashboard's time range. With `showOnlyLatestPerImage`
(default) a row is the newest run of each image; with it off, every run in the time range is a row.

**Time range and step.** Perses asks Prometheus for a range query whose step grows with the time
range. A run whose series exist for less than one step can fall between two steps and be missing
from history and from the "every run" view. A Pushgateway keeps each image's newest run until the
next run replaces it, so with real pipelines (a run every few hours) this is rare; if your runs
replace each other faster than the step, pick a shorter time range.

## Pushing from a pipeline

`dev/oat-push.sh` is POSIX sh plus `curl`, `base64`, `sed`, `tr` and `awk`, so it runs on any CI
runner and in `curlimages/curl`, alpine or busybox images. One call per pipeline step:

```bash
export PUSHGATEWAY_URL=https://pushgateway.example.com
oat-push.sh run   --image python --tag 3.13.1-r42 --run-id 8812 \
                  --base-image debian-slim --base-tag 12.8-r42 --run-url https://ci.example.com/runs/8812
oat-push.sh check --image python --tag 3.13.1-r42 --run-id 8812 --check health \
                  --result fail --duration 12.4 --message "healthcheck exited 1 after 3 retries"
oat-push.sh cve   --image python --tag 3.13.1-r42 --phase before --counts critical=2,high=5,medium=9
oat-push.sh cve   --image python --tag 3.13.1-r42 --phase after  --counts critical=0,high=1,medium=3
oat-push.sh gate  --image python --tag 3.13.1-r42 --status blocked
```

| Variable          | Default                 | Use                                                       |
| ----------------- | ----------------------- | --------------------------------------------------------- |
| `PUSHGATEWAY_URL` | `http://localhost:9091` | the Pushgateway                                           |
| `OAT_JOB`         | `oat`                   | the `job` of the pushed groups                            |
| `CURL_OPTS`       | empty                   | extra curl options: `--cacert ca.pem`, `-u user:password` |

Pass credentials through `CURL_OPTS` from your CI's secret store; never write them into the
pipeline definition.

### Grouping keys

A Pushgateway replaces a whole group on each `PUT`. The pusher puts each step in its own group, so
steps do not overwrite each other and a new run of an image replaces the previous run's values:

| Command | Group                                 | Metrics                                                            |
| ------- | ------------------------------------- | ------------------------------------------------------------------ |
| `run`   | `job=<OAT_JOB>`, `image`              | `oat_image_info`, `oat_run_timestamp_seconds`                      |
| `check` | `job=<OAT_JOB>`, `image`, `check`     | `oat_check_result`, `oat_check_duration_seconds`, `oat_check_info` |
| `cve`   | `job=<OAT_JOB>-cve`, `image`, `phase` | `image_cve_total`                                                  |
| `gate`  | `job=<OAT_JOB>-gate`, `image`         | `oat_promotion_status`                                             |

Group values are base64url-encoded in the URL, so image names with `/` are safe. The gateway holds
the newest run per image; Prometheus keeps the history. Scrape the gateway with
`honor_labels: true`, so the pushed `image`, `tag` and `job` labels are kept:

```yaml
scrape_configs:
  - job_name: pushgateway
    honor_labels: true
    static_configs:
      - targets: ["pushgateway:9091"]
```

A check that a run no longer performs stays in its group until it is deleted:
`oat-push.sh forget --image python --check perf` removes it, and `oat-push.sh forget --image python`
removes everything of an image that is no longer built.

## GitHub Actions

Vendor `oat-push.sh` into the repository (here as `ci/oat-push.sh`) and call it after each step.
`if: always()` reports a failed check before the job stops; later checks of a run that failed
report `skipped`.

```yaml
jobs:
  oat:
    runs-on: ubuntu-latest
    env:
      PUSHGATEWAY_URL: ${{ vars.PUSHGATEWAY_URL }}
      CURL_OPTS: -u oat:${{ secrets.PUSHGATEWAY_PASSWORD }}
      IMAGE: python
      TAG: ${{ needs.build.outputs.tag }}
      RUN_ID: ${{ github.run_id }}
    steps:
      - uses: actions/checkout@v4
      - name: Report the run
        run: |
          ci/oat-push.sh run --image "$IMAGE" --tag "$TAG" --run-id "$RUN_ID" \
            --base-image debian-slim --base-tag "${{ needs.build.outputs.base_tag }}" \
            --run-url "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"

      - name: Health check
        id: health
        run: |
          start=$(date +%s)
          set +e
          out=$(./ci/health-check.sh "$IMAGE:$TAG" 2>&1); rc=$?
          set -e
          result=pass; [ $rc -ne 0 ] && result=fail
          ci/oat-push.sh check --image "$IMAGE" --tag "$TAG" --run-id "$RUN_ID" --check health \
            --result "$result" --duration "$(( $(date +%s) - start ))" \
            --message "$(printf '%s' "$out" | tail -n 1 | cut -c1-200)"
          exit $rc

      - name: Smoke test
        if: always()
        run: |
          if [ "${{ steps.health.outcome }}" != success ]; then
            ci/oat-push.sh check --image "$IMAGE" --tag "$TAG" --run-id "$RUN_ID" --check smoke --result skipped
            exit 0
          fi
          start=$(date +%s)
          result=pass; ./ci/smoke-test.sh "$IMAGE:$TAG" || result=fail
          ci/oat-push.sh check --image "$IMAGE" --tag "$TAG" --run-id "$RUN_ID" --check smoke \
            --result "$result" --duration "$(( $(date +%s) - start ))"
          [ "$result" = pass ]

      - name: CVEs before and after
        if: always()
        run: |
          # counts from your scanner, e.g. trivy --format json | jq
          ci/oat-push.sh cve --image "$IMAGE" --tag "$TAG" --phase before --counts "$(./ci/cve-counts.sh "$IMAGE:${{ needs.build.outputs.previous_tag }}")"
          ci/oat-push.sh cve --image "$IMAGE" --tag "$TAG" --phase after --counts "$(./ci/cve-counts.sh "$IMAGE:$TAG")"

      - name: Promotion gate
        if: always()
        run: |
          status=promoted
          [ "${{ job.status }}" = success ] || status=blocked
          ci/oat-push.sh gate --image "$IMAGE" --tag "$TAG" --status "$status"
```

`ci/health-check.sh`, `ci/smoke-test.sh` and `ci/cve-counts.sh` stand for your own steps;
`cve-counts.sh` prints `critical=N,high=N,...`.

## Tekton

A Task that reports one check runs in the `curlimages/curl` image. Each test Task writes its outcome
to the results `result` (`pass`, `warn` or `fail`) and `duration`, and exits 0 even when the check
fails, so the results always exist; the next test Task runs only `when` the previous result is not
`fail`. Reporting Tasks in the Pipeline's `finally` (which runs even after a failure) push them, and
the gate decides on the results.

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: oat-report-check
spec:
  params:
    - name: image
    - name: tag
    - name: run-id
    - name: check
    - name: result # pass | warn | fail | skipped
    - name: duration
      default: ""
    - name: message
      default: ""
  workspaces:
    - name: scripts # holds oat-push.sh
  steps:
    - name: push
      image: curlimages/curl:8.11.1
      env:
        - name: PUSHGATEWAY_URL
          value: http://pushgateway:9091
        - name: CURL_OPTS
          valueFrom:
            secretKeyRef:
              name: oat-pushgateway
              key: curl-opts
              optional: true
      script: |
        #!/bin/sh
        set -eu
        set -- --image "$(params.image)" --tag "$(params.tag)" --run-id "$(params.run-id)" \
          --check "$(params.check)" --result "$(params.result)"
        [ -n "$(params.duration)" ] && set -- "$@" --duration "$(params.duration)"
        [ -n "$(params.message)" ] && set -- "$@" --message "$(params.message)"
        sh "$(workspaces.scripts.path)/oat-push.sh" check "$@"
```

In the Pipeline, a skipped test Task has no results, so map that to `skipped` with
`$(tasks.<name>.status)`:

```yaml
finally:
  - name: report-health
    taskRef:
      name: oat-report-check
    workspaces:
      - name: scripts
        workspace: source
    params:
      - name: image
        value: $(params.image)
      - name: tag
        value: $(params.tag)
      - name: run-id
        value: $(context.pipelineRun.name)
      - name: check
        value: health
      - name: result
        value: $(tasks.health.results.result)
      - name: duration
        value: $(tasks.health.results.duration)
    when:
      - input: $(tasks.health.status)
        operator: notin
        values: ["None"]
  - name: report-health-skipped
    taskRef:
      name: oat-report-check
    workspaces:
      - name: scripts
        workspace: source
    params:
      - { name: image, value: $(params.image) }
      - { name: tag, value: $(params.tag) }
      - { name: run-id, value: $(context.pipelineRun.name) }
      - { name: check, value: health }
      - { name: result, value: skipped }
    when:
      - input: $(tasks.health.status)
        operator: in
        values: ["None"]
```

The `run`, `cve` and `gate` reports follow the same shape: a Task with a step that calls
`oat-push.sh run`, `cve` or `gate`. Use `$(context.pipelineRun.name)` as the run id and your
dashboard URL for the run as `--run-url`.
