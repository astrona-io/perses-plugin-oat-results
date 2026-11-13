# Decisions

Choices made while building `OATResultsChart` 0.1.0, with the reason for each. `PLAN.md` is the design
written before the code; this page records where the code follows it, where it differs, and what is
left open.

## Scope and inputs

- **No mockup.** The brief referred to a concept sketch (`docs/mockup.png`). It was not available, so
  the layout follows the written brief only: rows are images in a tree, columns are checks, then
  CVEs, the promotion gate and an optional history sparkline, with a detail strip under the table.
- **Perses v0.55.1.** The plugin targets the latest stable Perses at the time of writing:
  `@perses-dev/*` 0.55.1, `@perses-dev/spec` 0.3.0, `percli` v0.55.1 and
  `github.com/perses/shared/cue` v0.55.1. Older 0.54 Perses is not tested. The rsbuild
  module-federation config is the one `percli` 0.55.1 generates (versioned public path
  `/plugins/OATResults~<version>/`), kept as generated so a later `percli` upgrade diffs cleanly.
- **No Grafana migration.** There is no Grafana panel this one replaces, so the plugin ships no
  `migrate` CUE file.
- **Series are told apart by `__name__`.** One raw selector (`{__name__=~"oat_.+|image_cve_total"}`)
  feeds the whole panel, and the user does not have to keep queries in a fixed order or name them.
  The cost: aggregations that drop the metric name break it. The empty state says so and shows the
  selector.
- **A run timestamp metric.** The brief's contract has nothing that orders runs. The plugin adds the
  optional `oat_run_timestamp_seconds`; without it the panel falls back to the first sample it saw of
  each run, then to `run_id`.
- **Failure detail comes from `oat_check_info`, not Loki.** A log query does not return time series,
  so a `TimeSeriesQuery` panel cannot join it. The message is the optional `oat_check_info` label;
  logs are one click away through the `logs` link template, which can point at any log UI.
- **Status bands, not exact values.** 1 / 0.5 / 0 / -1 are read in bands (below 0.25 fail, below
  0.75 warn, up to 1 pass; below -0.5 skipped), so a value from a recording rule or float noise still
  maps to a status. Anything else is "no result".

## Tree and blocking

- **Parent by `base_image`, then `base_tag`.** A row's parent is the shown row of its base image,
  preferring the one whose tag is `base_tag`. Rows whose base is not shown are roots. A cycle is
  broken by making the row that closes it a root. Children are sorted by image name.
- **Bold means "has dependents".** A row is shown as a base (bold) when it has children in the
  panel, which also covers a middle link of a chain (`python` between `debian-slim` and `api`).
- **Blocked and the notes.** A row is blocked when its gate is `blocked` or a check failed. A
  blocked row with skipped dependents says so on its row ("Blocked (Health failed): holds back 4
  dependents"), counting dependents at any depth. A dependent with skipped checks names its nearest
  blocked ancestor ("Skipped: base debian-slim:12.8-r2 is blocked (Health failed)"). A skipped cell
  after a failed check in the same run is explained by that check instead.

## Display and accessibility

- **Never colour alone.** Each cell is a distinct icon (mdi `CheckCircle`, `AlertCircle`,
  `CloseCircle`, `MinusCircleOutline`) with an accessible name and a tooltip; a legend explains the icons. The CVE "after" count is coloured
  by its worst severity and followed by that severity's initial (C, H, M, L). Gate chips carry an
  icon and a word.
- **Theme colours only.** Pass, warn, fail use the theme's success, warning and error palette;
  skipped and an unknown value use text colours; CVE severities use error, warning, info
  and text colours. Nothing is hard-coded, so light and dark follow Perses.
- **Keyboard.** Toggles and cells are buttons in the natural tab order; Enter or Space opens the
  detail strip, which has a close button. The table uses `<th scope>` headers.
- **Icon-only cells.** With 10 checks a word per cell does not fit; the icons, the legend and the
  accessible names carry the meaning instead.

## Links

- **Link variables are URL-encoded**, except `${run_url}`, which is a whole URL and inserted as it
  is. Unknown `${name}` placeholders are left for Perses, so dashboard variables work in templates.
- **Only `http(s)` and relative links are rendered.** A template that resolves to `javascript:`,
  `data:` or another scheme is dropped, because templates and label values are not trusted.

## Performance

- **Pure, memoised transform.** `buildModel` runs once per change of the query results or the
  options that affect it; collapsing a group or selecting a cell does not rebuild it. Rows are
  `React.memo` components whose props stay stable, so a selection re-renders two rows.
- **Measured.** 200 images by 10 checks: `buildModel` about 4 ms and a full render about 0.5 s in
  jsdom (Jest, see `OATResultsChartComponent.test.tsx`). No virtualisation is needed at that size.

## Pusher and data

- **One Pushgateway group per step.** `PUT` replaces a whole group, and a `POST` replaces metrics of
  the same name in it, so a group per command (`run`; `check` per check; `cve` per phase; `gate`)
  keeps steps from overwriting each other. Group values are base64url so image names with `/` work.
- **Stale groups need `forget`.** A check that is no longer run keeps its last value in the gateway.
  `oat-push.sh forget` deletes it; documented in `metrics.md`.
- **Query step vs short runs.** Perses' range-query step grows with the time range. In `dev/`, where
  the fake pipeline replaces a run every 30 s, a 30-minute range (60 s step) missed runs in history
  and in "every run" mode; the demo dashboard uses 10 minutes. Real pipelines run far less often than
  the step, so this is documented as a caveat rather than worked around.

## Tooling

- **Jest, ESLint 8 and Prettier, not Vitest and oxlint.** `percli` 0.55 scaffolds Vitest; the
  sibling plugins (honeycomb, geomap) use Jest with `@swc/jest`, ESLint 8 and Prettier, and this repo
  follows them. `@perses-dev/*` 0.55 is ESM only, so `jest.config.cjs` transforms those packages and
  stubs their font CSS. The package is `"type": "module"`, hence `.eslintrc.cjs`.

## Open

- **Mockup.** Compare with `docs/mockup.png` once it exists and adjust the layout.
- **Run order without a timestamp** falls back to the first sample seen, which depends on the time
  range. Pipelines should push `oat_run_timestamp_seconds`.
- **Upstreaming.** The plugin is generic (no names, hosts or registries of any one setup) and
  Apache-2.0; whether to offer it to `perses/plugins` is not decided.
