# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-13

### Added

- `OATResultsChart` panel: images as a collapsible tree under their base images, a column per check
  (pass, warn, fail, skipped, each with its own icon), CVEs before and after the rebuild, the
  promotion gate and an optional history sparkline.
- Blocked images say why and how many dependents they hold back; skipped dependents name the
  blocked base.
- A detail strip per cell with the message, duration, run id, base image and links built from
  `linkTemplates`.
- Options `checks`, `checkLabels`, `severityFilter`, `linkTemplates`, `showOnlyLatestPerImage`,
  `showHistory`, `historyRuns` and `durationFormat`, each with a control in the panel editor, and
  their CUE schema with valid and invalid test cases.
- The metric contract (`docs/metrics.md`), a reference Pushgateway pusher (`dev/oat-push.sh`) and
  GitHub Actions and Tekton examples.
- A `dev/` stack (Perses, Prometheus, Pushgateway and a fake pipeline) and screenshots taken from it.
- Jest and React Testing Library tests, CI on pull requests, and a release workflow that publishes
  the archive and `ghcr.io/astrona-io/perses-plugin-oat-results` for linux/amd64 and linux/arm64.

[Unreleased]: https://github.com/astrona-io/perses-plugin-oat-results/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/astrona-io/perses-plugin-oat-results/releases/tag/v0.1.0
