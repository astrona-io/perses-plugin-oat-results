#!/bin/sh
# fake-pipeline.sh: plays a CVE patching pipeline against the dev Pushgateway, through oat-push.sh.
#
# Every cycle rebuilds each image with a new tag and runs its checks in order. A failed check
# skips the checks after it; a blocked base skips every check of its dependents, down the chain.
# The images form two-level chains (debian-slim -> python -> api, worker, ml-eval) so the panel's
# tree and its "skipped because the base is blocked" notes have something to show.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
PUSH="$HERE/oat-push.sh"
INTERVAL="${INTERVAL:-30}"
CYCLES="${CYCLES:-0}" # 0 runs forever

# image|version|base image|checks
IMAGES='debian-slim|12.8|-|start health ports smoke sbom signature
python|3.13.1|debian-slim|start health ports smoke perf sbom signature
api|2.4.0|python|start health ports smoke perf sbom signature
worker|2.4.0|python|start health smoke perf sbom signature
ml-eval|0.9.2|python|start health smoke perf sbom signature llm_eval
alpine|3.21|-|start health smoke sbom signature
nginx|1.27.3|alpine|start health ports smoke perf sbom signature
redis|7.4.2|alpine|start health ports smoke perf sbom signature
distroless-static|nonroot|-|start sbom signature
gateway|1.12.0|distroless-static|start health ports smoke perf sbom signature
node|22.12|-|start health smoke sbom signature
frontend|5.0.1|node|start health ports smoke perf sbom signature'

# Outcome of one check: pass, warn or fail. Deterministic per cycle, so a screenshot is repeatable.
outcome() {
  image="$1" check="$2" cycle="$3"
  case "$image:$check" in
    # The base fails its health check in most cycles: python and its dependents are skipped.
    debian-slim:health) [ $((cycle % 4)) -eq 1 ] && echo pass || echo fail ;;
    # Flaky latency on nginx.
    nginx:perf) [ $((cycle % 3)) -eq 0 ] && echo pass || echo warn ;;
    # The model evaluation drifts every few runs.
    ml-eval:llm_eval) [ $((cycle % 5)) -eq 2 ] && echo fail || echo warn ;;
    # A port that sometimes does not open in time.
    gateway:ports) [ $((cycle % 6)) -eq 3 ] && echo fail || echo pass ;;
    # An unsigned image once in a while.
    frontend:signature) [ $((cycle % 7)) -eq 4 ] && echo fail || echo pass ;;
    *) echo pass ;;
  esac
}

message() {
  case "$1:$2:$3" in
    debian-slim:health:fail) echo "healthcheck: /usr/bin/true exited 1 after 3 retries" ;;
    nginx:perf:warn) echo "p95 latency 212 ms, budget 200 ms" ;;
    ml-eval:llm_eval:warn) echo "eval score 0.81, target 0.85" ;;
    ml-eval:llm_eval:fail) echo "eval score 0.62, minimum 0.75" ;;
    gateway:ports:fail) echo "port 8443 not listening after 30 s" ;;
    frontend:signature:fail) echo "no cosign signature found for the digest" ;;
    *) echo "" ;;
  esac
}

# Checks take a plausible, slightly varying time.
duration() {
  case "$1" in
    start) base=3 ;;
    health) base=12 ;;
    ports) base=4 ;;
    smoke) base=25 ;;
    perf) base=95 ;;
    sbom) base=18 ;;
    signature) base=2 ;;
    llm_eval) base=240 ;;
    *) base=5 ;;
  esac
  echo "$base.$(($2 % 10))"
}

run_cycle() {
  cycle="$1"
  echo "$IMAGES" | while IFS='|' read -r image version base checks; do
    tag="$version-r$cycle"
    run_id="$cycle-$image"
    base_tag=""
    [ "$base" = "-" ] && base=""
    if [ -n "$base" ]; then
      base_version=$(echo "$IMAGES" | awk -F'|' -v b="$base" '$1 == b { print $2 }')
      base_tag="$base_version-r$cycle"
    fi
    "$PUSH" run --image "$image" --tag "$tag" --run-id "$run_id" \
      --base-image "$base" --base-tag "$base_tag" \
      --run-url "https://ci.example.com/runs/$run_id"

    failed=""
    warned=""
    base_blocked=""
    [ -n "$base" ] && grep -qx "$base" "$STATE" 2>/dev/null && base_blocked=1
    for check in $checks; do
      if [ -n "$base_blocked" ] || [ -n "$failed" ]; then
        "$PUSH" check --image "$image" --tag "$tag" --run-id "$run_id" --check "$check" \
          --result skipped
        continue
      fi
      result=$(outcome "$image" "$check" "$cycle")
      "$PUSH" check --image "$image" --tag "$tag" --run-id "$run_id" --check "$check" \
        --result "$result" --duration "$(duration "$check" "$cycle")" \
        --message "$(message "$image" "$check" "$result")"
      [ "$result" = fail ] && failed=1
      [ "$result" = warn ] && warned=1
    done

    if [ -n "$failed" ] || [ -n "$base_blocked" ]; then
      echo "$image" >>"$STATE"
      status=blocked
    elif [ -n "$warned" ]; then
      status=pending
    else
      status=promoted
    fi
    "$PUSH" gate --image "$image" --tag "$tag" --status "$status"

    # CVEs: the rebuild fixes most of them; a few have no fix yet.
    seed=$(printf '%s' "$image" | wc -c)
    "$PUSH" cve --image "$image" --tag "$tag" --phase before \
      --counts "critical=$(((seed + cycle) % 3)),high=$(((seed * 3) % 9 + 1)),medium=$((seed % 7 + 2)),low=$((seed % 5))"
    "$PUSH" cve --image "$image" --tag "$tag" --phase after \
      --counts "critical=$(((seed + cycle) % 5 == 0 ? 1 : 0)),high=$((seed % 3)),medium=$((seed % 4)),low=$((seed % 5))"
  done
}

STATE="$(mktemp)"
trap 'rm -f "$STATE"' EXIT
cycle=1
while :; do
  : >"$STATE"
  run_cycle "$cycle"
  echo "fake-pipeline: pushed cycle $cycle"
  [ "$CYCLES" -gt 0 ] && [ "$cycle" -ge "$CYCLES" ] && break
  cycle=$((cycle + 1))
  sleep "$INTERVAL"
done
